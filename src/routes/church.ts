import { Router, Response, NextFunction } from 'express';
import db from '../lib/db';
import { AuthRequest } from '../middleware/auth';
import { sendSMS } from '../services/mnotify';
import {
  initializeTransaction,
  verifyTransaction,
  isPaystackConfigured,
} from '../services/paystack';
import {
  decodeImageDataUrl,
  sniffMimeType,
  ImageValidationError,
} from '../lib/images';
import {
  validateImportRows,
  MAX_IMPORT_ROWS,
  type NormalizedMember,
} from '../lib/memberImport';
import {
  generateQrToken,
  buildQrPayload,
  checkQrToken,
  checkEventQrWindow,
  eventAttendanceWindow,
  buildRollCall,
  summarizeRollCall,
  normalizePresent,
  generateDeviceApiKey,
  QR_TOKEN_TTL_MINUTES,
} from '../lib/attendance';
import {
  REGISTER_DEFINITIONS,
  isRegisterKey,
  registerDefinition,
  validateRegisterEntry,
  filterRegisterEntries,
  type RegisterEntry,
  type RegisterKey,
} from '../lib/registers';
import {
  PERMISSION_CODES,
  PLATFORM_ONLY_PERMISSIONS,
  isChurchEditableRole,
  sanitizePermissions,
  serializePermissions,
  resolveRolePermissions,
} from '../lib/permissions';
import {
  getPlatformGateway,
  getTransactionCharge,
  applyTransactionCharge,
  isSuperadminManagedSetting,
  SUPERADMIN_MANAGED_CHURCH_SETTINGS,
  getPlatformSettings,
} from '../lib/platformSettings';
import {
  normalizePaymentDetails,
  validatePaymentDetails,
  paymentDetailSchema,
  PAYMENT_DETAIL_FIELDS,
} from '../lib/paymentDetails';
import { getPortalProfile } from '../lib/denominations';
import {
  isPartnered,
  normalizeEducation,
  normalizeChildren,
  normalizeMedical,
  normalizeMinistryIds,
  parseJsonColumn,
  toJsonColumn,
  SPOUSE_COLUMNS,
} from '../lib/memberProfile';
import {
  classifyMember,
  resolveThresholds,
  shouldFollowUp,
} from '../lib/engagement';
import { sendEmail, emailTemplate, getEmailConfig } from '../services/email';
import {
  STAT_METRICS,
  UNIT_TYPES,
  buildStatisticsTable,
  filterStatisticRows,
  summarizeStatistics,
  coverage,
  resolvePeriod,
  previousPeriod,
  periodDays,
  metricDefinition,
  isPeriodMetric,
  totalRecords,
  type StatisticRecord,
  type UnitType,
} from '../lib/unitStatistics';
import {
  MEMBER_PORTAL_ROLE,
  generateTempPassword,
  generatePortalUid,
  isUsableLoginEmail,
  normalizeLoginEmail,
  portalInviteSubject,
  portalInviteBody,
  portalInviteSms,
  portalSkipMessage,
  normalizeUsername,
  isUsableUsername,
  suggestUsername,
  validatePortalPassword,
  generateVerificationToken,
  activationUrl,
  activationExpiry,
  checkActivationToken,
  USERNAME_RULES,
  type PortalSkipReason,
} from '../lib/memberPortal';

/**
 * Tenant-scoped church application API.
 *
 * Mounted behind `authenticate`. Every request is locked to the caller's own
 * tenant. SUPER_ADMIN callers may target a specific tenant with `?tenantId=`.
 * This is the core multi-tenant isolation boundary for the church-facing app.
 */
const router = Router();

const genId = (prefix: string) =>
  `${prefix}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;

async function resolveTenant(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const dbUser = await db('users').where({ uid: req.user?.uid }).first();
    if (!dbUser) return res.status(401).json({ error: 'User not found' });
    (req as any).dbUser = dbUser;

    let tenantId = dbUser.tenantId;
    if (dbUser.role === 'SUPER_ADMIN' && req.query.tenantId) {
      tenantId = String(req.query.tenantId);
    }
    if (!tenantId) {
      return res
        .status(400)
        .json({ error: 'No tenant is associated with this account.' });
    }
    (req as any).tenantId = tenantId;
    next();
  } catch (error) {
    console.error('resolveTenant error:', error);
    res.status(500).json({ error: 'Failed to resolve tenant context' });
  }
}

function requireRole(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    const role = (req as any).dbUser?.role || req.user?.role;
    if (role === 'SUPER_ADMIN' || roles.includes(role)) return next();
    return res.status(403).json({ error: 'Insufficient permissions' });
  };
}

const tid = (req: AuthRequest): string => (req as any).tenantId;

/**
 * Column list for member queries, with the `photo` bytea column removed.
 *
 * Profile pictures are stored in Postgres (up to 1MB each). A list of 50
 * members selecting `*` would therefore transfer up to 50MB per request, so
 * list and detail reads must never include the binary column -- images are
 * fetched separately from GET /members/:id/photo. The column list is read from
 * the database once and cached, so this stays correct if the schema changes.
 */
let memberColumnsCache: string[] | null = null;
async function memberColumns(): Promise<string[]> {
  if (!memberColumnsCache) {
    const info = await db('members').columnInfo();
    memberColumnsCache = Object.keys(info).filter((c) => c !== 'photo');
  }
  return memberColumnsCache;
}

/** Reports whether a photo exists without transferring its bytes. */
const hasPhotoColumn = () => db.raw('(photo IS NOT NULL) as "hasPhoto"');

/** Maps image validation failures onto their intended HTTP status. */
function handleImageError(error: unknown, res: Response, fallback: string): void {
  if (error instanceof ImageValidationError) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  console.error(`${fallback}:`, error);
  res.status(500).json({ error: fallback });
}

/** Sends a stored image blob with correct type and caching headers. */
function sendImage(
  res: Response,
  raw: Buffer | Uint8Array,
  mimeType?: string | null,
  updatedAt?: Date | string | null,
): void {
  const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
  res.setHeader('Content-Type', mimeType || sniffMimeType(buf) || 'image/jpeg');
  res.setHeader('Content-Length', String(buf.length));
  // "private": these images sit behind authentication and can be personal
  // data, so shared proxies must not cache them. The ETag lets a browser skip
  // re-downloading an unchanged image.
  res.setHeader('Cache-Control', 'private, max-age=300');
  if (updatedAt) {
    res.setHeader('ETag', `W/"${new Date(updatedAt).getTime()}"`);
  }
  res.end(buf);
}

router.use(resolveTenant);

/* ------------------------------------------------------------------ */
/* Members                                                            */
/* ------------------------------------------------------------------ */
/* --- Groups (cells, zones, house fellowships) ------------------------ */

/**
 * The groups a church divides its congregation into.
 *
 * A member belongs to exactly ONE group, which is what separates this from
 * ministries: a member may serve in the choir and the ushers, but lives in one
 * cell. That rule is enforced by storing the group on the member record rather
 * than in a join table, so the database cannot hold a state the church says is
 * impossible.
 */
router.get('/groups', async (req: AuthRequest, res) => {
  try {
    const tenantId = tid(req);
    const data = await db('church_groups')
      .where({ tenantId })
      .orderBy('sortOrder', 'asc')
      .orderBy('name', 'asc');

    // Membership counts, so an admin can see an empty group or an overloaded
    // one without opening each in turn.
    const counts = await db('members')
      .where({ tenantId })
      .whereNotNull('groupId')
      .groupBy('groupId')
      .select('groupId')
      .count({ total: '*' });
    const byGroup = new Map<string, number>(
      (counts as any[]).map((r) => [String(r.groupId), Number(r.total) || 0]),
    );

    res.json({ data: (data as any[]).map((g) => ({ ...g, memberCount: byGroup.get(g.id) || 0 })) });
  } catch (error) {
    console.error('List groups error:', error);
    res.status(500).json({ error: 'Failed to fetch groups' });
  }
});

/** Just id and name, for the single-select on the member form. */
router.get('/groups/options', async (req: AuthRequest, res) => {
  try {
    const rows = await db('church_groups')
      .where({ tenantId: tid(req) })
      .orderBy('sortOrder', 'asc')
      .orderBy('name', 'asc')
      .select('id', 'name', 'active');
    // Retired groups stay on the members already in them, but are not offered
    // for new members.
    res.json({
      data: (rows as any[])
        .filter((r) => r.active !== false)
        .map((r) => ({ value: r.id, label: r.name })),
    });
  } catch (error) {
    console.error('Group options error:', error);
    res.status(500).json({ error: 'Failed to fetch groups' });
  }
});

router.post('/groups', requireRole('CHURCH_ADMIN', 'PASTOR'), async (req: AuthRequest, res) => {
  try {
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Please enter a name for the group.' });

    const duplicate = await db('church_groups')
      .where({ tenantId: tid(req) })
      .whereRaw('LOWER(name) = ?', [name.toLowerCase()])
      .first();
    if (duplicate) {
      return res.status(409).json({ error: `"${name}" is already one of your groups.` });
    }

    const group = {
      id: genId('group'),
      tenantId: tid(req),
      name,
      description: req.body?.description || null,
      leaderId: req.body?.leaderId || null,
      leaderName: req.body?.leaderName || null,
      meetingDay: req.body?.meetingDay || null,
      meetingTime: req.body?.meetingTime || null,
      location: req.body?.location || null,
      sortOrder: Number(req.body?.sortOrder) || 0,
      active: req.body?.active === undefined ? true : Boolean(req.body.active),
      createdAt: new Date(),
    };
    await db('church_groups').insert(group);
    res.status(201).json(group);
  } catch (error) {
    console.error('Create group error:', error);
    res.status(500).json({ error: 'Failed to create group' });
  }
});

router.put('/groups/:id', requireRole('CHURCH_ADMIN', 'PASTOR'), async (req: AuthRequest, res) => {
  try {
    const tenantId = tid(req);
    const existing = await db('church_groups').where({ id: req.params.id, tenantId }).first();
    if (!existing) return res.status(404).json({ error: 'Group not found' });

    const updates: any = {};
    if ('name' in req.body) {
      const name = String(req.body.name || '').trim();
      if (!name) return res.status(400).json({ error: 'Please enter a name for the group.' });
      updates.name = name;
    }
    for (const key of ['description', 'leaderId', 'leaderName', 'meetingDay', 'meetingTime', 'location']) {
      if (key in req.body) updates[key] = req.body[key] || null;
    }
    if ('sortOrder' in req.body) updates.sortOrder = Number(req.body.sortOrder) || 0;
    if ('active' in req.body) updates.active = Boolean(req.body.active);

    if (Object.keys(updates).length) {
      await db('church_groups').where({ id: req.params.id, tenantId }).update(updates);
    }

    // Members carry the group name for display, so a rename has to reach them
    // or the register will keep showing a name that no longer exists.
    if (updates.name && updates.name !== existing.name) {
      await db('members').where({ tenantId, groupId: existing.id }).update({ groupName: updates.name });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Update group error:', error);
    res.status(500).json({ error: 'Failed to update group' });
  }
});

router.delete('/groups/:id', requireRole('CHURCH_ADMIN', 'PASTOR'), async (req: AuthRequest, res) => {
  try {
    const tenantId = tid(req);
    const group = await db('church_groups').where({ id: req.params.id, tenantId }).first();
    if (!group) return res.status(404).json({ error: 'Group not found' });

    const [{ total } = { total: 0 }] = (await db('members')
      .where({ tenantId, groupId: group.id })
      .count({ total: '*' })) as any[];
    const held = Number(total) || 0;
    if (held > 0) {
      // Deleting would quietly empty the group column for real people. Say so
      // instead, and offer the reversible alternative.
      return res.status(409).json({
        error: `${held} member${held === 1 ? '' : 's'} still belong to this group. Move them first, or mark the group inactive instead of deleting it.`,
      });
    }

    await db('church_groups').where({ id: group.id, tenantId }).del();
    res.json({ success: true });
  } catch (error) {
    console.error('Delete group error:', error);
    res.status(500).json({ error: 'Failed to delete group' });
  }
});

/* --- Statistical returns for ministries, groups and departments ----- */

/**
 * Every figure on a return is counted from records the church already keeps.
 * Nothing here reads a number that somebody typed onto a statistics sheet.
 *
 * The queries below are the other half of `lib/unitStatistics.ts`: that module
 * says what each figure means and where its underlying fact is recorded, and
 * this one does the counting. Each figure also has a matching drill-down that
 * returns the very rows it counted, so a leader who doubts a number can see the
 * names behind it and go and correct the record itself.
 */

/**
 * Resolve a unit and confirm it belongs to this church.
 *
 * Ministries and departments share the `ministries` table, separated by its
 * `type` column; groups are their own table. Everything below goes through here
 * so no endpoint can be talked into reading another church's figures by passing
 * an id from elsewhere.
 */
async function loadUnit(tenantId: string, unitType: string, unitId: string): Promise<any | null> {
  if (!UNIT_TYPES.includes(unitType as UnitType)) return null;

  if (unitType === 'group') {
    const row = await db('church_groups').where({ id: unitId, tenantId }).first();
    return row ? { ...row, unitType: 'group' } : null;
  }

  const row = await db('ministries').where({ id: unitId, tenantId }).first();
  if (!row) return null;
  // A ministry row's own `type` decides which of the two it is, so a department
  // cannot be addressed as a ministry or the other way round.
  const actual = (row.type || 'ministry') === 'department' ? 'department' : 'ministry';
  if (actual !== unitType) return null;
  return { ...row, unitType: actual };
}

/**
 * The members whose records feed this unit's return.
 *
 * For a group that is everyone whose member record names it; for a ministry or
 * department it is the roster. Members whose standing has ended are kept in the
 * list deliberately: a member who died or transferred out during the period
 * must still be counted in that period's figures.
 */
async function unitMemberIds(tenantId: string, unit: any): Promise<string[]> {
  if (unit.unitType === 'group') {
    const rows = await db('members').where({ tenantId, groupId: unit.id }).select('id');
    return rows.map((r: any) => r.id);
  }
  const rows = await db('ministry_members')
    .where({ tenantId, ministryId: unit.id })
    .select('memberId');
  return rows.map((r: any) => r.memberId).filter(Boolean);
}

/** Display name for a member row. */
const memberLabel = (m: any): string =>
  `${m?.firstName || ''} ${m?.lastName || ''}`.trim() || m?.membershipId || 'Unnamed member';

/**
 * Members of this unit carrying a dated milestone inside the period.
 *
 * One query shape serves conversion, both baptisms and transfers in, since each
 * is simply a date on the member record.
 */
async function membersWithMilestone(
  tenantId: string,
  memberIds: string[],
  column: string,
  from: Date,
  to: Date,
  extraColumns: string[] = [],
): Promise<any[]> {
  if (!memberIds.length) return [];
  return db('members')
    .where({ tenantId })
    .whereIn('id', memberIds)
    .whereNotNull(column)
    .whereBetween(column, [from, to])
    .select('id', 'firstName', 'lastName', 'membershipId', column, ...extraColumns)
    .orderBy(column, 'desc');
}

/**
 * Changes of standing recorded inside the period.
 *
 * Read from the history rather than from the member record, because the record
 * only holds how things stand now. Without the history, a member who died in
 * March would go on being counted as a death in every later period.
 */
async function statusChanges(
  tenantId: string,
  memberIds: string[],
  kind: string,
  toStatus: string,
  from: Date,
  to: Date,
  fromStatus?: string,
): Promise<any[]> {
  if (!memberIds.length) return [];
  let q = db('member_status_history')
    .where({ tenantId, kind, toStatus })
    .whereIn('memberId', memberIds)
    .whereBetween('changedAt', [from, to]);
  if (fromStatus) q = q.where({ fromStatus });
  return q.orderBy('changedAt', 'desc');
}

/**
 * Communion attendance by members of this unit.
 *
 * Counted from attendance at services marked as communion, which is the only
 * honest way to get this figure: the church already takes attendance at those
 * services, and asking anyone to also type a total would invite the two to
 * disagree.
 */
async function communionAttendance(
  tenantId: string,
  memberIds: string[],
  from: Date,
  to: Date,
): Promise<any[]> {
  if (!memberIds.length) return [];
  return db('event_attendance as a')
    .join('events as e', 'e.id', 'a.eventId')
    .where('a.tenantId', tenantId)
    .whereIn('a.memberId', memberIds)
    .whereBetween('e.startTime', [from, to])
    // Either flag identifies a communion service: the explicit checkbox on the
    // event, or the category, so churches that already categorise their
    // services get the figure without re-tagging anything.
    .where((b: any) => b.where('e.isCommunion', true).orWhere('e.category', 'communion'))
    .select(
      'a.id as attendanceId',
      'a.memberId',
      'a.checkInAt',
      'e.id as eventId',
      'e.title as eventTitle',
      'e.startTime',
    )
    .orderBy('e.startTime', 'desc');
}

/** Visits logged against this unit or its members. */
async function unitVisits(
  tenantId: string,
  unit: any,
  memberIds: string[],
  role: string,
  from: Date,
  to: Date,
): Promise<any[]> {
  return db('pastoral_visits')
    .where({ tenantId, visitorRole: role })
    .whereBetween('visitDate', [from, to])
    // A visit counts for the unit if it was logged against the unit itself, or
    // against one of its members.
    .where((b: any) => {
      b.where((inner: any) => inner.where({ unitType: unit.unitType, unitId: unit.id }));
      if (memberIds.length) b.orWhereIn('memberId', memberIds);
    })
    .orderBy('visitDate', 'desc');
}

/** Interventional support paid to members of this unit. */
async function supportPayments(
  tenantId: string,
  memberIds: string[],
  from: Date,
  to: Date,
): Promise<any[]> {
  if (!memberIds.length) return [];
  return db('expenses')
    .where({ tenantId, supportType: 'interventional' })
    .whereIn('beneficiaryMemberId', memberIds)
    .whereBetween('date', [from, to])
    .orderBy('date', 'desc');
}

/** Meetings of this unit with attendance logged in the period. */
async function unitMeetings(tenantId: string, unit: any, from: Date, to: Date): Promise<any[]> {
  return db('ministry_attendance')
    .where({ tenantId, ministryId: unit.id })
    .whereBetween('sessionDate', [from, to])
    .orderBy('sessionDate', 'desc');
}

/** Converts credited to members of this unit. */
async function soulsWonBy(
  tenantId: string,
  memberIds: string[],
  from: Date,
  to: Date,
): Promise<any[]> {
  if (!memberIds.length) return [];
  return db('members')
    .where({ tenantId })
    // The figure follows the member who did the winning, not the unit the
    // convert happened to join -- which is what makes it different from "new
    // converts" and worth reporting separately.
    .whereIn('wonByMemberId', memberIds)
    .whereNotNull('convertDate')
    .whereBetween('convertDate', [from, to])
    .select('id', 'firstName', 'lastName', 'membershipId', 'convertDate', 'wonByName')
    .orderBy('convertDate', 'desc');
}

/**
 * The standing figures: how the unit is, as at the end of the period.
 */
async function standingFigures(tenantId: string, unit: any): Promise<Record<string, number>> {
  const figures: Record<string, number> = {};

  if (unit.unitType === 'group') {
    const [{ count: total } = { count: 0 }] = await db('members')
      .where({ tenantId, groupId: unit.id })
      .whereNotIn('membershipStatus', ['deceased', 'transferred'])
      .count({ count: '*' });
    figures.totalMembership = Number(total) || 0;

    // A group's officer is its leader, where one is named.
    figures.officers = unit.leaderId || unit.leaderName ? 1 : 0;

    const [{ count: holders } = { count: 0 }] = await db('members')
      .where({ tenantId, groupId: unit.id })
      .whereNotIn('membershipStatus', ['deceased', 'transferred'])
      .whereNotNull('office')
      .whereNot({ office: '' })
      .count({ count: '*' });
    figures.otherOfficeHolders = Math.max(0, (Number(holders) || 0) - figures.officers);
    return figures;
  }

  const roster = await db('ministry_members')
    .where({ tenantId, ministryId: unit.id })
    .whereNot({ status: 'inactive' })
    .select('memberId', 'role');

  figures.totalMembership = roster.length;
  // Anyone on the roster whose role is something other than plain member is an
  // officer of the unit.
  figures.officers = roster.filter(
    (r: any) => r.role && String(r.role).toLowerCase() !== 'member',
  ).length;

  const ids = roster.map((r: any) => r.memberId).filter(Boolean);
  if (ids.length) {
    const [{ count: holders } = { count: 0 }] = await db('members')
      .where({ tenantId })
      .whereIn('id', ids)
      .whereNotNull('office')
      .whereNot({ office: '' })
      .count({ count: '*' });
    // Church offices held by members of the unit, over and above the unit's own
    // officers.
    figures.otherOfficeHolders = Math.max(0, (Number(holders) || 0) - figures.officers);
  } else {
    figures.otherOfficeHolders = 0;
  }
  return figures;
}

/**
 * All seventeen figures for one unit over one period, counted from the records.
 */
async function unitFigures(
  tenantId: string,
  unit: any,
  memberIds: string[],
  from: Date,
  to: Date,
): Promise<Record<string, number>> {
  const [
    standing,
    converts,
    water,
    spirit,
    transfersIn,
    transfersOut,
    backsliders,
    deaths,
    rehabilitated,
    meetings,
    souls,
    communion,
    elderVisits,
    ministerVisits,
    support,
  ] = await Promise.all([
    standingFigures(tenantId, unit),
    membersWithMilestone(tenantId, memberIds, 'convertDate', from, to),
    membersWithMilestone(tenantId, memberIds, 'waterBaptismDate', from, to),
    membersWithMilestone(tenantId, memberIds, 'holySpiritBaptismDate', from, to),
    membersWithMilestone(tenantId, memberIds, 'transferInDate', from, to),
    statusChanges(tenantId, memberIds, 'membership', 'transferred', from, to),
    statusChanges(tenantId, memberIds, 'engagement', 'backslider', from, to),
    statusChanges(tenantId, memberIds, 'membership', 'deceased', from, to),
    // Restoration is a specific transition, not a state: from backslider back
    // to active. Counting members who are merely active now would count most of
    // the church every period.
    statusChanges(tenantId, memberIds, 'engagement', 'active', from, to, 'backslider'),
    unitMeetings(tenantId, unit, from, to),
    soulsWonBy(tenantId, memberIds, from, to),
    communionAttendance(tenantId, memberIds, from, to),
    unitVisits(tenantId, unit, memberIds, 'presiding_elder', from, to),
    unitVisits(tenantId, unit, memberIds, 'minister', from, to),
    supportPayments(tenantId, memberIds, from, to),
  ]);

  return {
    ...standing,
    newConverts: converts.length,
    waterBaptism: water.length,
    holySpiritBaptism: spirit.length,
    transfersIn: transfersIn.length,
    transfersOut: transfersOut.length,
    backsliders: backsliders.length,
    deaths: deaths.length,
    convertsRehabilitated: rehabilitated.length,
    meetingsHeld: meetings.length,
    soulsWon: souls.length,
    lordsSupperAttendance: communion.length,
    presidingElderVisits: elderVisits.length,
    ministerVisitations: ministerVisits.length,
    interventionalSupport:
      Math.round(support.reduce((sum: number, e: any) => sum + (Number(e.amount) || 0), 0) * 100) / 100,
  };
}

/**
 * The individual records behind one figure.
 *
 * This is what makes a counted return trustworthy: every number can be opened,
 * and what comes back is the actual people, services, visits or payments that
 * produced it -- each with a link back to the record itself.
 */
async function unitRecords(
  tenantId: string,
  unit: any,
  memberIds: string[],
  metric: string,
  from: Date,
  to: Date,
): Promise<StatisticRecord[]> {
  const people = (rows: any[], column: string, origin: string, detail?: (r: any) => string | null) =>
    rows.map((r) => ({
      title: memberLabel(r),
      date: r[column] ? new Date(r[column]).toISOString() : null,
      value: 1,
      origin,
      detail: detail ? detail(r) : null,
      memberId: r.id,
      sourceId: r.id,
    }));

  const fromHistory = (rows: any[], origin: string) =>
    rows.map((r) => ({
      title: r.memberName || 'Member',
      date: r.changedAt ? new Date(r.changedAt).toISOString() : null,
      value: 1,
      origin,
      detail: r.fromStatus ? `Changed from ${r.fromStatus}` : r.notes || null,
      memberId: r.memberId,
      sourceId: r.id,
    }));

  switch (metric) {
    case 'newConverts':
      return people(
        await membersWithMilestone(tenantId, memberIds, 'convertDate', from, to, ['wonByName']),
        'convertDate',
        'Member record',
        (r) => (r.wonByName ? `Won by ${r.wonByName}` : null),
      );

    case 'waterBaptism':
      return people(
        await membersWithMilestone(tenantId, memberIds, 'waterBaptismDate', from, to),
        'waterBaptismDate',
        'Member record',
      );

    case 'holySpiritBaptism':
      return people(
        await membersWithMilestone(tenantId, memberIds, 'holySpiritBaptismDate', from, to),
        'holySpiritBaptismDate',
        'Member record',
      );

    case 'transfersIn':
      return people(
        await membersWithMilestone(tenantId, memberIds, 'transferInDate', from, to, ['transferredFrom']),
        'transferInDate',
        'Member record',
        (r) => (r.transferredFrom ? `From ${r.transferredFrom}` : null),
      );

    case 'transfersOut':
      return fromHistory(
        await statusChanges(tenantId, memberIds, 'membership', 'transferred', from, to),
        'Status history',
      );

    case 'backsliders':
      return fromHistory(
        await statusChanges(tenantId, memberIds, 'engagement', 'backslider', from, to),
        'Engagement tracking',
      );

    case 'deaths':
      return fromHistory(
        await statusChanges(tenantId, memberIds, 'membership', 'deceased', from, to),
        'Status history',
      );

    case 'convertsRehabilitated':
      return fromHistory(
        await statusChanges(tenantId, memberIds, 'engagement', 'active', from, to, 'backslider'),
        'Engagement tracking',
      );

    case 'soulsWon':
      return (await soulsWonBy(tenantId, memberIds, from, to)).map((r: any) => ({
        title: memberLabel(r),
        date: r.convertDate ? new Date(r.convertDate).toISOString() : null,
        value: 1,
        origin: 'Member record',
        detail: r.wonByName ? `Won by ${r.wonByName}` : null,
        memberId: r.id,
        sourceId: r.id,
      }));

    case 'meetingsHeld':
      return (await unitMeetings(tenantId, unit, from, to)).map((r: any) => ({
        title: r.title || 'Meeting',
        date: r.sessionDate ? new Date(r.sessionDate).toISOString() : null,
        value: 1,
        origin: 'Attendance session',
        detail: `${r.presentCount ?? 0} present of ${r.totalCount ?? 0}`,
        memberId: null,
        sourceId: r.id,
      }));

    case 'lordsSupperAttendance':
      return (await communionAttendance(tenantId, memberIds, from, to)).map((r: any) => ({
        title: r.eventTitle || 'Communion service',
        date: r.startTime ? new Date(r.startTime).toISOString() : null,
        value: 1,
        origin: 'Communion attendance',
        detail: 'One member partook',
        memberId: r.memberId,
        sourceId: r.eventId,
      }));

    case 'presidingElderVisits':
    case 'ministerVisitations': {
      const role = metric === 'presidingElderVisits' ? 'presiding_elder' : 'minister';
      return (await unitVisits(tenantId, unit, memberIds, role, from, to)).map((r: any) => ({
        title: r.visitorName || (role === 'minister' ? 'Minister' : 'Presiding elder'),
        date: r.visitDate ? new Date(r.visitDate).toISOString() : null,
        value: 1,
        origin: 'Visitation log',
        detail: [r.purpose, r.memberName ? `Visited ${r.memberName}` : null]
          .filter(Boolean)
          .join(' \u2014 ') || null,
        memberId: r.memberId || null,
        sourceId: r.id,
      }));
    }

    case 'interventionalSupport':
      return (await supportPayments(tenantId, memberIds, from, to)).map((r: any) => ({
        title: r.beneficiaryName || 'Member',
        date: r.date ? new Date(r.date).toISOString() : null,
        value: Number(r.amount) || 0,
        origin: 'Expense record',
        detail: r.description || r.category || null,
        memberId: r.beneficiaryMemberId || null,
        sourceId: r.id,
      }));

    default:
      // Standing figures have no list behind them: "which total membership?" has
      // no answer in the way "which baptisms?" does.
      return [];
  }
}

/**
 * Record a change in a member's standing.
 *
 * Called wherever a status actually changes, so the return is complete without
 * anyone filing the same fact twice. Never throws: failing to write a history
 * row must not fail the member edit that caused it.
 */
async function recordStatusChange(
  tenantId: string,
  member: any,
  kind: 'membership' | 'engagement',
  fromStatus: string | null,
  toStatus: string,
  changedBy?: string | null,
  when: Date = new Date(),
): Promise<void> {
  try {
    if (!member?.id || !toStatus || fromStatus === toStatus) return;

    const ministries = await db('ministry_members')
      .where({ tenantId, memberId: member.id })
      .select('ministryId');

    await db('member_status_history').insert({
      id: genId('hist'),
      tenantId,
      memberId: member.id,
      memberName: memberLabel(member),
      kind,
      fromStatus: fromStatus || null,
      toStatus,
      changedAt: when,
      changedBy: changedBy || null,
      notes: null,
      // The unit membership as it was at the time, so a past return is not
      // rewritten by a later change of group.
      groupId: member.groupId || null,
      ministryIds: JSON.stringify(ministries.map((m: any) => m.ministryId)),
      createdAt: new Date(),
    });
  } catch (error) {
    console.error('recordStatusChange error:', error);
  }
}

/**
 * GET /units  -- every ministry, department and group, for the unit picker.
 */
router.get('/units', async (req: AuthRequest, res) => {
  try {
    const tenantId = tid(req);
    const [ministries, groups] = await Promise.all([
      db('ministries').where({ tenantId }).select('id', 'name', 'type', 'leaderName', 'status'),
      db('church_groups').where({ tenantId }).select('id', 'name', 'leaderName', 'active'),
    ]);

    const units = [
      ...(ministries as any[]).map((m) => ({
        id: m.id,
        name: m.name,
        unitType: (m.type || 'ministry') === 'department' ? 'department' : 'ministry',
        leaderName: m.leaderName || null,
        active: m.status !== 'inactive',
      })),
      ...(groups as any[]).map((g) => ({
        id: g.id,
        name: g.name,
        unitType: 'group',
        leaderName: g.leaderName || null,
        active: g.active !== false,
      })),
    ].sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    res.json({ data: units });
  } catch (error) {
    console.error('GET /units error:', error);
    res.status(500).json({ error: 'Failed to load ministries, departments and groups' });
  }
});

/**
 * GET /units/:unitType/:unitId/statistics  -- the statistical return.
 *
 * Accepts `from`, `to` and `q`. The comparison period is always the span of
 * equal length immediately preceding the one asked for, so a custom range is
 * compared against something meaningful rather than a calendar month.
 */
router.get('/units/:unitType/:unitId/statistics', async (req: AuthRequest, res) => {
  try {
    const tenantId = tid(req);
    const unit = await loadUnit(tenantId!, req.params.unitType, req.params.unitId);
    if (!unit) {
      return res.status(404).json({ error: 'That ministry, department or group could not be found.' });
    }

    const period = resolvePeriod(req.query.from as string, req.query.to as string);
    const prior = previousPeriod(period);
    const memberIds = await unitMemberIds(tenantId!, unit);

    const [current, previous] = await Promise.all([
      unitFigures(tenantId!, unit, memberIds, period.from, period.to),
      unitFigures(tenantId!, unit, memberIds, prior.from, prior.to),
    ]);

    const full = buildStatisticsTable(current, previous);

    res.json({
      unit: {
        id: unit.id,
        name: unit.name,
        unitType: unit.unitType,
        leaderName: unit.leaderName || null,
        memberCount: memberIds.length,
      },
      period: { from: period.from, to: period.to, days: periodDays(period) },
      previousPeriod: { from: prior.from, to: prior.to },
      // The summary and the coverage note are built from the unfiltered table:
      // narrowing the rows with the search box must not change the headline.
      summary: summarizeStatistics(full),
      coverage: coverage(full),
      data: filterStatisticRows(full, req.query.q as string),
    });
  } catch (error) {
    console.error('GET unit statistics error:', error);
    res.status(500).json({ error: 'Failed to build the statistics for this unit' });
  }
});

/**
 * GET /units/:unitType/:unitId/statistics/records/:metric
 *
 * The records behind one figure, so any number on the sheet can be traced to
 * the people and documents that produced it.
 */
router.get('/units/:unitType/:unitId/statistics/records/:metric', async (req: AuthRequest, res) => {
  try {
    const tenantId = tid(req);
    const unit = await loadUnit(tenantId!, req.params.unitType, req.params.unitId);
    if (!unit) {
      return res.status(404).json({ error: 'That ministry, department or group could not be found.' });
    }

    const metric = req.params.metric;
    const def = metricDefinition(metric);
    if (!def) return res.status(404).json({ error: 'Unknown figure.' });
    if (!isPeriodMetric(metric)) {
      return res.status(400).json({
        error: `\u201c${def.label}\u201d is a standing figure counted from the roster, so it has no list of events behind it.`,
      });
    }

    const period = resolvePeriod(req.query.from as string, req.query.to as string);
    const memberIds = await unitMemberIds(tenantId!, unit);
    let records = await unitRecords(tenantId!, unit, memberIds, metric, period.from, period.to);

    const search = String(req.query.q || '').trim().toLowerCase();
    if (search) {
      records = records.filter((r) =>
        `${r.title} ${r.detail || ''} ${r.origin}`.toLowerCase().includes(search));
    }

    res.json({
      metric: def,
      period: { from: period.from, to: period.to },
      total: totalRecords(records),
      data: records,
    });
  } catch (error) {
    console.error('GET statistics records error:', error);
    res.status(500).json({ error: 'Failed to load the records behind this figure' });
  }
});

/**
 * GET /statistics/metrics  -- the catalogue, so the page describes each figure
 * exactly as the server counts it.
 */
router.get('/statistics/metrics', async (_req: AuthRequest, res) => {
  res.json({ data: STAT_METRICS });
});

/* --- Visitation log ------------------------------------------------- */

/**
 * Visits by the presiding elder and by ministers.
 *
 * A pastoral record in its own right, which the return then counts. Recorded
 * here rather than as a statistic so that the church keeps the useful part --
 * who was visited, when, and why -- instead of only a tally.
 */
router.get('/visits', async (req: AuthRequest, res) => {
  try {
    const tenantId = tid(req);
    const period = resolvePeriod(req.query.from as string, req.query.to as string);

    let q = db('pastoral_visits')
      .where({ tenantId })
      .whereBetween('visitDate', [period.from, period.to]);

    if (req.query.visitorRole) q = q.where({ visitorRole: String(req.query.visitorRole) });
    if (req.query.unitId) q = q.where({ unitId: String(req.query.unitId) });

    const search = String(req.query.q || '').trim();
    if (search) {
      q = q.where((b: any) =>
        b.whereILike('visitorName', `%${search}%`)
          .orWhereILike('memberName', `%${search}%`)
          .orWhereILike('unitName', `%${search}%`)
          .orWhereILike('purpose', `%${search}%`));
    }

    const rows = await q.orderBy('visitDate', 'desc').limit(500);
    res.json({ data: rows });
  } catch (error) {
    console.error('GET /visits error:', error);
    res.status(500).json({ error: 'Failed to load the visitation log' });
  }
});

const VISITOR_ROLES = ['presiding_elder', 'minister', 'pastor', 'elder', 'other'];

router.post('/visits', requireRole('CHURCH_ADMIN', 'PASTOR', 'SECRETARY', 'MINISTRY_LEADER'), async (req: AuthRequest, res) => {
  try {
    const tenantId = tid(req);
    const role = String(req.body?.visitorRole || '');
    if (!VISITOR_ROLES.includes(role)) {
      return res.status(400).json({ error: 'Choose who paid the visit.' });
    }

    const visitDate = req.body?.visitDate ? new Date(req.body.visitDate) : new Date();
    if (Number.isNaN(visitDate.getTime())) {
      return res.status(400).json({ error: 'Enter a valid date for the visit.' });
    }
    // A visit is a record of something that happened; dating one ahead would put
    // it into a return before it took place.
    if (visitDate.getTime() > Date.now() + 60 * 1000) {
      return res.status(400).json({ error: 'That date is in the future. Log the visit once it has happened.' });
    }

    // A visit has to be attached to something, or it can never appear on a
    // return.
    let unit: any = null;
    if (req.body?.unitType && req.body?.unitId) {
      unit = await loadUnit(tenantId!, String(req.body.unitType), String(req.body.unitId));
      if (!unit) return res.status(400).json({ error: 'That ministry, department or group could not be found.' });
    }

    let member: any = null;
    if (req.body?.memberId) {
      member = await db('members').where({ id: req.body.memberId, tenantId }).first();
      if (!member) return res.status(400).json({ error: 'That member is not in this church.' });
    }

    if (!unit && !member) {
      return res.status(400).json({
        error: 'Say who or what was visited \u2014 a ministry, department or group, or a member.',
      });
    }

    const row = {
      id: genId('visit'),
      tenantId,
      visitDate,
      visitorRole: role,
      visitorName: req.body?.visitorName || null,
      purpose: req.body?.purpose || null,
      notes: req.body?.notes || null,
      unitType: unit?.unitType || null,
      unitId: unit?.id || null,
      unitName: unit?.name || null,
      memberId: member?.id || null,
      memberName: member ? memberLabel(member) : null,
      recordedBy: req.user?.uid || null,
      createdAt: new Date(),
    };

    await db('pastoral_visits').insert(row);
    await logActivity(req, 'VISIT_LOGGED', 'pastoral_visits', row.id);
    res.status(201).json({ ...row, success: true });
  } catch (error) {
    console.error('POST /visits error:', error);
    res.status(500).json({ error: 'Failed to log this visit' });
  }
});

router.put('/visits/:id', requireRole('CHURCH_ADMIN', 'PASTOR', 'SECRETARY', 'MINISTRY_LEADER'), async (req: AuthRequest, res) => {
  try {
    const tenantId = tid(req);
    const existing = await db('pastoral_visits').where({ id: req.params.id, tenantId }).first();
    if (!existing) return res.status(404).json({ error: 'That visit could not be found.' });

    const updates: any = {};
    if ('visitorName' in req.body) updates.visitorName = req.body.visitorName || null;
    if ('purpose' in req.body) updates.purpose = req.body.purpose || null;
    if ('notes' in req.body) updates.notes = req.body.notes || null;
    if ('visitorRole' in req.body) {
      if (!VISITOR_ROLES.includes(String(req.body.visitorRole))) {
        return res.status(400).json({ error: 'Choose who paid the visit.' });
      }
      updates.visitorRole = req.body.visitorRole;
    }
    if ('visitDate' in req.body) {
      const when = new Date(req.body.visitDate);
      if (Number.isNaN(when.getTime())) return res.status(400).json({ error: 'Enter a valid date for the visit.' });
      updates.visitDate = when;
    }

    if (!Object.keys(updates).length) {
      return res.status(400).json({ error: 'Nothing was supplied to change.' });
    }

    await db('pastoral_visits').where({ id: req.params.id, tenantId }).update(updates);
    await logActivity(req, 'VISIT_UPDATED', 'pastoral_visits', req.params.id);
    res.json({ ...existing, ...updates, success: true });
  } catch (error) {
    console.error('PUT /visits/:id error:', error);
    res.status(500).json({ error: 'Failed to update this visit' });
  }
});

router.delete('/visits/:id', requireRole('CHURCH_ADMIN', 'PASTOR', 'SECRETARY'), async (req: AuthRequest, res) => {
  try {
    const tenantId = tid(req);
    const existing = await db('pastoral_visits').where({ id: req.params.id, tenantId }).first();
    if (!existing) return res.status(404).json({ error: 'That visit could not be found.' });

    await db('pastoral_visits').where({ id: req.params.id, tenantId }).del();
    await logActivity(req, 'VISIT_DELETED', 'pastoral_visits', req.params.id);
    res.json({ success: true, message: 'The visit was removed from the log.' });
  } catch (error) {
    console.error('DELETE /visits/:id error:', error);
    res.status(500).json({ error: 'Failed to remove this visit' });
  }
});

/* --- Church registers ------------------------------------------------ */

/**
 * The registers: new converts class, water baptism, Holy Spirit baptism,
 * transfers in and out, marriages and deaths.
 *
 * Each register is a door onto facts that already have a home. A baptism
 * entered here sets `waterBaptismDate` on the member, which is the same column
 * the statistical return counts, so the register and the return can never
 * disagree. Nothing here keeps its own tally.
 *
 * Only two registers need storage of their own: the new converts class (a class
 * is not a fact about a single date) and marriages (a marriage belongs to two
 * people, not one).
 */

const REGISTER_WRITE_ROLES = ['CHURCH_ADMIN', 'PASTOR', 'SECRETARY'];

/** Reads a request date bound, returning undefined when absent or unreadable. */
function dateBound(raw: any, endOfDay = false): Date | undefined {
  if (!raw) return undefined;
  const when = new Date(String(raw));
  if (Number.isNaN(when.getTime())) return undefined;
  if (endOfDay) when.setHours(23, 59, 59, 999);
  else when.setHours(0, 0, 0, 0);
  return when;
}

function isoOf(value: any): string | null {
  if (!value) return null;
  const when = new Date(value);
  return Number.isNaN(when.getTime()) ? null : when.toISOString();
}

/** Drops the empty particulars so a row never shows a labelled blank. */
function particulars(pairs: Array<[string, any]>): Array<{ label: string; value: string }> {
  return pairs
    .filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== '')
    .map(([label, value]) => ({
      label,
      value: value instanceof Date ? value.toISOString() : String(value),
    }));
}

/** Members carrying a date in the given milestone column, newest first. */
async function milestoneRows(
  tenantId: string,
  dateField: string,
  from?: Date,
  to?: Date,
): Promise<any[]> {
  const q = db('members').where({ tenantId }).whereNotNull(dateField);
  if (from) q.where(dateField, '>=', from);
  if (to) q.where(dateField, '<=', to);
  return q.orderBy(dateField, 'desc').limit(1000);
}

/**
 * Reads one register out of the tables that own its facts.
 *
 * The `origin` on every entry names the place the row was read from, so a
 * leader querying a figure can see it was not typed into a register of its own.
 */
async function readRegister(
  tenantId: string,
  key: RegisterKey,
  from?: Date,
  to?: Date,
): Promise<RegisterEntry[]> {
  if (key === 'converts') {
    const rows = await milestoneRows(tenantId, 'convertDate', from, to);
    const ids = rows.map((r) => r.id);
    const classes = ids.length
      ? await db('convert_classes').where({ tenantId }).whereIn('memberId', ids)
      : [];
    const byMember = new Map<string, any>(classes.map((c: any) => [c.memberId, c]));
    return rows.map((r) => {
      const cls = byMember.get(r.id);
      const finished = cls?.completedDate;
      return {
        id: r.id,
        memberId: r.id,
        memberName: memberLabel(r),
        date: isoOf(r.convertDate),
        detail: cls?.className
          ? `${cls.className}${finished ? ' \u2014 completed' : ' \u2014 in class'}`
          : 'Not yet enrolled in a class',
        particulars: particulars([
          ['Won by', r.wonByName || r.wonByMemberId],
          ['Class', cls?.className],
          ['Class started', isoOf(cls?.startDate)],
          ['Class completed', isoOf(finished)],
          ['Counsellor', cls?.counsellorName],
          ['Standing', r.membershipStatus],
        ]),
        origin: cls ? 'Member record and new converts class' : 'Member record',
        notes: cls?.notes || null,
      };
    });
  }

  if (key === 'water_baptism') {
    const rows = await milestoneRows(tenantId, 'waterBaptismDate', from, to);
    return rows.map((r) => ({
      id: r.id,
      memberId: r.id,
      memberName: memberLabel(r),
      date: isoOf(r.waterBaptismDate),
      detail: r.baptismVenue || 'Water baptism',
      particulars: particulars([
        ['Officiating minister', r.baptismOfficiant],
        ['Place', r.baptismVenue],
        ['Group', r.groupName],
      ]),
      origin: 'Member record',
      notes: null,
    }));
  }

  if (key === 'holy_spirit_baptism') {
    const rows = await milestoneRows(tenantId, 'holySpiritBaptismDate', from, to);
    return rows.map((r) => ({
      id: r.id,
      memberId: r.id,
      memberName: memberLabel(r),
      date: isoOf(r.holySpiritBaptismDate),
      detail: r.holySpiritOccasion || 'Holy Spirit baptism',
      particulars: particulars([
        ['Occasion', r.holySpiritOccasion],
        ['Minister present', r.baptismOfficiant],
        ['Group', r.groupName],
      ]),
      origin: 'Member record',
      notes: null,
    }));
  }

  if (key === 'transfer_in') {
    const rows = await milestoneRows(tenantId, 'transferInDate', from, to);
    return rows.map((r) => ({
      id: r.id,
      memberId: r.id,
      memberName: memberLabel(r),
      date: isoOf(r.transferInDate),
      detail: r.transferredFrom ? `From ${r.transferredFrom}` : 'Transferred in',
      particulars: particulars([
        ['Transferred from', r.transferredFrom],
        ['Standing', r.membershipStatus],
        ['Group', r.groupName],
      ]),
      origin: 'Member record',
      notes: null,
    }));
  }

  if (key === 'transfer_out') {
    const rows = await milestoneRows(tenantId, 'transferOutDate', from, to);
    return rows.map((r) => ({
      id: r.id,
      memberId: r.id,
      memberName: memberLabel(r),
      date: isoOf(r.transferOutDate),
      detail: r.transferredTo ? `To ${r.transferredTo}` : 'Transferred out',
      particulars: particulars([
        ['Transferred to', r.transferredTo],
        ['Standing', r.membershipStatus],
        ['Group at the time', r.groupName],
      ]),
      origin: 'Member record and status history',
      notes: null,
    }));
  }

  if (key === 'death') {
    const rows = await milestoneRows(tenantId, 'dateOfDeath', from, to);
    return rows.map((r) => ({
      id: r.id,
      memberId: r.id,
      memberName: memberLabel(r),
      date: isoOf(r.dateOfDeath),
      detail: r.causeOfDeath || 'Passed on',
      particulars: particulars([
        ['Cause', r.causeOfDeath],
        ['Funeral', isoOf(r.funeralDate)],
        ['Standing', r.membershipStatus],
        ['Group at the time', r.groupName],
      ]),
      origin: 'Member record and status history',
      notes: null,
    }));
  }

  // Marriages.
  const q = db('marriages').where({ tenantId }).whereNotNull('weddingDate');
  if (from) q.where('weddingDate', '>=', from);
  if (to) q.where('weddingDate', '<=', to);
  const rows = await q.orderBy('weddingDate', 'desc').limit(1000);
  return rows.map((r: any) => ({
    id: r.id,
    memberId: r.memberId || null,
    memberName: r.memberName || 'Unnamed',
    date: isoOf(r.weddingDate),
    detail: r.spouseName ? `Married ${r.spouseName}` : 'Marriage',
    particulars: particulars([
      ['Spouse', r.spouseName],
      ['Spouse is a member here', r.spouseMemberId ? 'Yes' : ''],
      ['Type', r.marriageType],
      ['Officiating minister', r.officiantName],
      ['Place', r.venue],
    ]),
    origin: 'Marriage register',
    notes: r.notes || null,
  }));
}

/**
 * GET /registers -- the catalogue, so the page builds its own tabs and boxes
 * from the definitions rather than repeating them in the client.
 */
router.get('/registers', async (_req: AuthRequest, res) => {
  res.json({ data: REGISTER_DEFINITIONS });
});

/**
 * GET /registers/summary -- how many entries each register holds in a period,
 * for the strip above the tabs.
 */
router.get('/registers/summary', async (req: AuthRequest, res) => {
  try {
    const tenantId = tid(req);
    const from = dateBound(req.query.from);
    const to = dateBound(req.query.to, true);
    const counts: Record<string, number> = {};
    await Promise.all(
      REGISTER_DEFINITIONS.map(async (def) => {
        const entries = await readRegister(tenantId!, def.key, from, to);
        counts[def.key] = entries.length;
      }),
    );
    res.json({ data: counts });
  } catch (error) {
    console.error('GET /registers/summary error:', error);
    res.status(500).json({ error: 'Failed to load the registers' });
  }
});

/**
 * GET /registers/:key/entries -- one register, filtered by period and search.
 */
router.get('/registers/:key/entries', async (req: AuthRequest, res) => {
  try {
    const tenantId = tid(req);
    const key = String(req.params.key);
    if (!isRegisterKey(key)) {
      return res.status(404).json({ error: 'There is no register by that name.' });
    }

    const from = dateBound(req.query.from);
    const to = dateBound(req.query.to, true);
    const entries = await readRegister(tenantId!, key, from, to);
    const filtered = filterRegisterEntries(entries, String(req.query.q || ''));

    res.json({
      register: registerDefinition(key),
      period: { from: from ? from.toISOString() : null, to: to ? to.toISOString() : null },
      total: filtered.length,
      data: filtered,
    });
  } catch (error) {
    console.error('GET /registers/:key/entries error:', error);
    res.status(500).json({ error: 'Failed to load this register' });
  }
});

/**
 * POST /registers/:key/entries -- file an entry.
 *
 * Every branch writes to the member's own record, and the two branches that
 * change a member's standing also write a status-history row dated to the event
 * so that a return for a past period keeps the membership it had at the time.
 */
router.post('/registers/:key/entries', requireRole(...REGISTER_WRITE_ROLES), async (req: AuthRequest, res) => {
  try {
    const tenantId = tid(req);
    const key = String(req.params.key);
    if (!isRegisterKey(key)) {
      return res.status(404).json({ error: 'There is no register by that name.' });
    }

    const body = req.body || {};
    const check = validateRegisterEntry(key, body);
    if (!check.ok) {
      return res.status(400).json({ error: check.errors[0], errors: check.errors });
    }

    const member = await db('members').where({ id: body.memberId, tenantId }).first();
    if (!member) {
      return res.status(400).json({ error: 'That member is not in this church.' });
    }

    const actor = req.user?.uid || null;
    const text = (value: any) => (value === undefined || value === null || String(value).trim() === '' ? null : String(value).trim());

    if (key === 'converts') {
      const updates: any = { convertDate: new Date(body.convertDate) };
      if (body.wonByMemberId) {
        const winner = await db('members').where({ id: body.wonByMemberId, tenantId }).first();
        if (!winner) return res.status(400).json({ error: 'The member credited with winning this soul is not in this church.' });
        updates.wonByMemberId = winner.id;
        // Kept alongside the id so a drill-down reads as a name, not an id.
        updates.wonByName = memberLabel(winner);
      }
      await db('members').where({ id: member.id, tenantId }).update(updates);

      const completed = body.classCompletedDate ? new Date(body.classCompletedDate) : null;
      const classRow: any = {
        tenantId,
        memberId: member.id,
        memberName: memberLabel(member),
        className: text(body.className),
        startDate: body.classStartDate ? new Date(body.classStartDate) : null,
        completedDate: completed,
        status: completed ? 'completed' : 'enrolled',
        counsellorName: text(body.counsellorName),
        notes: text(body.notes),
      };
      // One class record per convert: filing twice corrects the first entry
      // rather than enrolling the same person twice.
      const existing = await db('convert_classes').where({ tenantId, memberId: member.id }).first();
      if (existing) {
        await db('convert_classes').where({ id: existing.id }).update(classRow);
      } else {
        await db('convert_classes').insert({ ...classRow, id: genId('cclass'), recordedBy: actor, createdAt: new Date() });
      }
    }

    if (key === 'water_baptism') {
      await db('members').where({ id: member.id, tenantId }).update({
        waterBaptismDate: new Date(body.waterBaptismDate),
        baptismOfficiant: text(body.officiantName),
        baptismVenue: text(body.venue),
      });
    }

    if (key === 'holy_spirit_baptism') {
      await db('members').where({ id: member.id, tenantId }).update({
        holySpiritBaptismDate: new Date(body.holySpiritBaptismDate),
        holySpiritOccasion: text(body.occasion),
        baptismOfficiant: text(body.officiantName) || member.baptismOfficiant || null,
      });
    }

    if (key === 'transfer_in') {
      const when = new Date(body.transferInDate);
      await db('members').where({ id: member.id, tenantId }).update({
        transferInDate: when,
        transferredFrom: text(body.transferredFrom),
        membershipStatus: 'active',
      });
      // A member received from elsewhere is on the roll from the date they were
      // received, so the change of standing is dated to that day.
      if (member.membershipStatus !== 'active') {
        await recordStatusChange(tenantId!, member, 'membership', member.membershipStatus || null, 'active', actor, when);
      }
    }

    if (key === 'transfer_out') {
      const when = new Date(body.transferOutDate);
      await db('members').where({ id: member.id, tenantId }).update({
        transferOutDate: when,
        transferredTo: text(body.transferredTo),
        membershipStatus: 'transferred',
      });
      await recordStatusChange(tenantId!, member, 'membership', member.membershipStatus || null, 'transferred', actor, when);
    }

    if (key === 'death') {
      const when = new Date(body.dateOfDeath);
      await db('members').where({ id: member.id, tenantId }).update({
        dateOfDeath: when,
        causeOfDeath: text(body.causeOfDeath),
        funeralDate: body.funeralDate ? new Date(body.funeralDate) : null,
        membershipStatus: 'deceased',
      });
      await recordStatusChange(tenantId!, member, 'membership', member.membershipStatus || null, 'deceased', actor, when);
    }

    if (key === 'marriage') {
      const when = new Date(body.weddingDate);
      let spouse: any = null;
      if (body.spouseMemberId) {
        spouse = await db('members').where({ id: body.spouseMemberId, tenantId }).first();
        if (!spouse) return res.status(400).json({ error: 'That spouse is not a member of this church.' });
      }
      const spouseName = spouse ? memberLabel(spouse) : text(body.spouseName);

      await db('marriages').insert({
        id: genId('marriage'),
        tenantId,
        weddingDate: when,
        memberId: member.id,
        memberName: memberLabel(member),
        spouseMemberId: spouse?.id || null,
        spouseName,
        marriageType: text(body.marriageType),
        officiantName: text(body.officiantName),
        venue: text(body.venue),
        notes: text(body.notes),
        recordedBy: actor,
        createdAt: new Date(),
      });

      await db('members').where({ id: member.id, tenantId }).update({
        weddingDate: when,
        maritalStatus: 'married',
        spouseName,
        spouseMemberId: spouse?.id || null,
      });
      // Both records are updated, so the marriage is visible from either side
      // rather than only from the record it happened to be filed against.
      if (spouse) {
        await db('members').where({ id: spouse.id, tenantId }).update({
          weddingDate: when,
          maritalStatus: 'married',
          spouseName: memberLabel(member),
          spouseMemberId: member.id,
        });
      }
    }

    await logActivity(req, 'REGISTER_ENTRY', 'members', member.id, `${key} recorded`);
    const entries = await readRegister(tenantId!, key);
    res.status(201).json({
      success: true,
      message: 'The entry was filed, and the figures it feeds have moved with it.',
      data: entries.find((e) => e.memberId === member.id) || null,
    });
  } catch (error) {
    console.error('POST /registers/:key/entries error:', error);
    res.status(500).json({ error: 'Failed to file this entry' });
  }
});

/**
 * DELETE /registers/:key/entries/:id -- withdraw an entry filed in error.
 *
 * This clears the fact from the member's record rather than hiding a register
 * row, because the record is where the fact lives. Where the entry had taken
 * the member off the roll, their standing is returned to active and the dated
 * history row is removed, so a past return is not left with a phantom loss.
 */
router.delete('/registers/:key/entries/:id', requireRole('CHURCH_ADMIN', 'PASTOR'), async (req: AuthRequest, res) => {
  try {
    const tenantId = tid(req);
    const key = String(req.params.key);
    if (!isRegisterKey(key)) {
      return res.status(404).json({ error: 'There is no register by that name.' });
    }
    const id = String(req.params.id);

    if (key === 'marriage') {
      const row = await db('marriages').where({ id, tenantId }).first();
      if (!row) return res.status(404).json({ error: 'That entry is no longer in the register.' });
      await db('marriages').where({ id, tenantId }).del();
      const ids = [row.memberId, row.spouseMemberId].filter(Boolean);
      if (ids.length) {
        await db('members').where({ tenantId }).whereIn('id', ids).update({
          weddingDate: null,
          maritalStatus: null,
          spouseMemberId: null,
        });
      }
      await logActivity(req, 'REGISTER_ENTRY_WITHDRAWN', 'marriages', id, 'marriage withdrawn');
      return res.json({ success: true, message: 'The marriage entry was withdrawn.' });
    }

    const member = await db('members').where({ id, tenantId }).first();
    if (!member) return res.status(404).json({ error: 'That member is not in this church.' });

    const updates: any = {};
    if (key === 'converts') {
      updates.convertDate = null;
      updates.wonByMemberId = null;
      updates.wonByName = null;
      await db('convert_classes').where({ tenantId, memberId: member.id }).del();
    }
    if (key === 'water_baptism') {
      updates.waterBaptismDate = null;
      updates.baptismVenue = null;
    }
    if (key === 'holy_spirit_baptism') {
      updates.holySpiritBaptismDate = null;
      updates.holySpiritOccasion = null;
    }
    if (key === 'transfer_in') {
      updates.transferInDate = null;
      updates.transferredFrom = null;
    }
    if (key === 'transfer_out') {
      updates.transferOutDate = null;
      updates.transferredTo = null;
      updates.membershipStatus = 'active';
      await db('member_status_history')
        .where({ tenantId, memberId: member.id, kind: 'membership', toStatus: 'transferred' })
        .del();
    }
    if (key === 'death') {
      updates.dateOfDeath = null;
      updates.causeOfDeath = null;
      updates.funeralDate = null;
      updates.membershipStatus = 'active';
      await db('member_status_history')
        .where({ tenantId, memberId: member.id, kind: 'membership', toStatus: 'deceased' })
        .del();
    }

    await db('members').where({ id: member.id, tenantId }).update(updates);
    await logActivity(req, 'REGISTER_ENTRY_WITHDRAWN', 'members', member.id, `${key} withdrawn`);
    res.json({ success: true, message: 'The entry was withdrawn from the register.' });
  } catch (error) {
    console.error('DELETE /registers/:key/entries/:id error:', error);
    res.status(500).json({ error: 'Failed to withdraw this entry' });
  }
});

/* --- Church offices ------------------------------------------------- */

/**
 * The offices a church recognises (Elder, Deacon, Usher, Choir Master...).
 * Spelt out by the church admin in Settings and offered as a combobox when
 * registering a member, so every church uses its own vocabulary rather than a
 * list we guessed at.
 */
router.get('/offices', async (req: AuthRequest, res) => {
  try {
    const data = await db('church_offices')
      .where({ tenantId: tid(req) })
      .orderBy('sortOrder', 'asc')
      .orderBy('name', 'asc');
    res.json({ data });
  } catch (error) {
    console.error('List offices error:', error);
    res.status(500).json({ error: 'Failed to fetch offices' });
  }
});

/** Just the names, for the combobox on the member form. */
router.get('/offices/options', async (req: AuthRequest, res) => {
  try {
    const rows = await db('church_offices')
      .where({ tenantId: tid(req) })
      .orderBy('sortOrder', 'asc')
      .orderBy('name', 'asc')
      .select('name', 'active');
    // Retired offices stay on the members who already hold them, but are not
    // offered for new members.
    res.json({ data: (rows as any[]).filter((r) => r.active !== false).map((r) => r.name) });
  } catch (error) {
    console.error('Office options error:', error);
    res.status(500).json({ error: 'Failed to fetch offices' });
  }
});

router.post('/offices', requireRole('CHURCH_ADMIN', 'PASTOR'), async (req: AuthRequest, res) => {
  try {
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Please enter a name for the office.' });

    const duplicate = await db('church_offices')
      .where({ tenantId: tid(req) })
      .whereRaw('LOWER(name) = ?', [name.toLowerCase()])
      .first();
    if (duplicate) {
      return res.status(409).json({ error: `"${name}" is already one of your offices.` });
    }

    const office = {
      id: genId('office'),
      tenantId: tid(req),
      name,
      description: req.body?.description || null,
      sortOrder: Number(req.body?.sortOrder) || 0,
      active: req.body?.active === undefined ? true : Boolean(req.body.active),
      createdAt: new Date(),
    };
    await db('church_offices').insert(office);
    res.status(201).json(office);
  } catch (error) {
    console.error('Create office error:', error);
    res.status(500).json({ error: 'Failed to create office' });
  }
});

router.put('/offices/:id', requireRole('CHURCH_ADMIN', 'PASTOR'), async (req: AuthRequest, res) => {
  try {
    const existing = await db('church_offices')
      .where({ id: req.params.id, tenantId: tid(req) })
      .first();
    if (!existing) return res.status(404).json({ error: 'Office not found' });

    const updates: any = {};
    if ('name' in req.body) {
      const name = String(req.body.name || '').trim();
      if (!name) return res.status(400).json({ error: 'Please enter a name for the office.' });
      updates.name = name;
    }
    if ('description' in req.body) updates.description = req.body.description || null;
    if ('sortOrder' in req.body) updates.sortOrder = Number(req.body.sortOrder) || 0;
    if ('active' in req.body) updates.active = Boolean(req.body.active);

    if (Object.keys(updates).length) {
      await db('church_offices').where({ id: req.params.id, tenantId: tid(req) }).update(updates);
    }

    // Members hold the office by name, so renaming an office keeps them in step
    // instead of leaving them pointing at a name that no longer exists.
    if (updates.name && updates.name !== existing.name) {
      await db('members')
        .where({ tenantId: tid(req), office: existing.name })
        .update({ office: updates.name });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Update office error:', error);
    res.status(500).json({ error: 'Failed to update office' });
  }
});

router.delete('/offices/:id', requireRole('CHURCH_ADMIN', 'PASTOR'), async (req: AuthRequest, res) => {
  try {
    const office = await db('church_offices')
      .where({ id: req.params.id, tenantId: tid(req) })
      .first();
    if (!office) return res.status(404).json({ error: 'Office not found' });

    const holders = await db('members')
      .where({ tenantId: tid(req), office: office.name })
      .count('id as count')
      .first();
    const count = Number((holders as any)?.count || 0);
    if (count > 0) {
      // Deleting would quietly blank the office on real member records, so the
      // admin is told to deactivate it instead.
      return res.status(409).json({
        error: `${count} member${count === 1 ? '' : 's'} still hold this office. Mark it inactive instead of deleting it.`,
      });
    }

    await db('church_offices').where({ id: req.params.id, tenantId: tid(req) }).delete();
    res.json({ success: true });
  } catch (error) {
    console.error('Delete office error:', error);
    res.status(500).json({ error: 'Failed to delete office' });
  }
});

/**
 * Resolve the one group a member belongs to.
 *
 * The name is stored alongside the id so lists and exports read correctly
 * without a join. Only groups belonging to this church are accepted, so a
 * crafted request cannot attach a member to another tenant's group.
 */
async function applyMemberGroup(tenantId: string, body: any, target: any): Promise<string | null> {
  if (!('groupId' in (body || {}))) return null;

  const groupId = body.groupId ? String(body.groupId) : '';
  if (!groupId) {
    // Explicitly clearing the group is allowed: a member can be between cells.
    target.groupId = null;
    target.groupName = null;
    return null;
  }

  const group = await db('church_groups').where({ id: groupId, tenantId }).first();
  if (!group) return 'That group does not exist in this church.';

  target.groupId = group.id;
  target.groupName = group.name;
  return null;
}

/* --- Member portal access ----------------------------------------------- */

/** Why a portal login could not be created, beyond the two generic cases. */
export type PortalFailureReason = PortalSkipReason | 'username_taken' | 'invalid_username' | 'weak_password';

export type PortalAccessResult =
  | {
      created: true;
      email: string;
      username: string | null;
      /** 'pending' until the member (or the church) activates the account. */
      status: 'pending' | 'active';
      emailSent: boolean;
      smsSent: boolean;
      reset: boolean;
    }
  | { created: false; reason: PortalFailureReason; message: string };

/**
 * Give a member a way into the member portal.
 *
 * Called when a member is registered, and again if the admin re-sends the
 * invitation. The temporary password is generated here, hashed before it is
 * stored, and sent to the member by email (and by SMS when we have a number).
 * It is never stored in plain text and never returned in the API response:
 * an admin who wants to help a member in gets them a fresh invite rather than
 * reading the old password back out.
 *
 * Delivery failure does not fail provisioning. The account still exists and the
 * admin is told the message did not go out, which is more useful than rolling
 * back an account the member could otherwise have used.
 */
async function provisionPortalAccess(
  tenantId: string,
  member: any,
  opts: {
    baseUrl: string;
    reset?: boolean;
    /** Username the church admin typed. Falls back to one derived from the name. */
    username?: string;
    /** Password the church admin typed. Falls back to a generated one. */
    password?: string;
    /**
     * Skip email verification and open the account immediately. Used when the
     * church activates a member itself, e.g. for someone standing at the desk
     * without access to their inbox.
     */
    activate?: boolean;
  } = { baseUrl: '' },
): Promise<PortalAccessResult> {
  const email = normalizeLoginEmail(member?.email);
  if (!isUsableLoginEmail(email)) {
    return { created: false, reason: 'no_email', message: portalSkipMessage('no_email') };
  }

  // A username chosen by the admin is validated and checked for collisions
  // before anything is written, so a clash is reported rather than half-applied.
  let username: string | null = null;
  if (opts.username !== undefined && String(opts.username).trim() !== '') {
    if (!isUsableUsername(opts.username)) {
      return { created: false, reason: 'invalid_username', message: USERNAME_RULES };
    }
    username = normalizeUsername(opts.username);
  } else if (!opts.reset) {
    // Give every new account a username so members have a short thing to type,
    // and make it unique by suffixing rather than failing the registration.
    const base = suggestUsername(member?.firstName, member?.lastName);
    let candidate = base;
    for (let attempt = 1; attempt <= 50; attempt += 1) {
      const clash = await db('users')
        .whereRaw('lower(username) = ?', [candidate])
        .whereNot({ memberId: member.id })
        .first();
      if (!clash) break;
      candidate = `${base}${attempt}`.slice(0, 32);
    }
    username = candidate;
  }

  if (username) {
    const taken = await db('users')
      .whereRaw('lower(username) = ?', [username])
      .whereNot({ memberId: member.id })
      .first();
    if (taken) {
      return {
        created: false,
        reason: 'username_taken',
        message: `The username "${username}" is already in use. Please choose another.`,
      };
    }
  }

  // A password typed by the admin is checked against a floor that a member can
  // actually be told over the phone; see validatePortalPassword for why the
  // stricter staff policy is not applied to a first-time member credential.
  if (opts.password !== undefined && String(opts.password) !== '') {
    const verdict = validatePortalPassword(opts.password);
    if (!verdict.ok) {
      return { created: false, reason: 'weak_password', message: verdict.error };
    }
  }

  const existing = await db('users').whereRaw('lower(email) = ?', [email]).first();

  // An address already used by a different person's account must not be taken
  // over: that would hand this member someone else's sign-in.
  if (existing && existing.memberId && existing.memberId !== member.id) {
    return { created: false, reason: 'email_taken', message: portalSkipMessage('email_taken') };
  }
  if (existing && !existing.memberId && existing.role && existing.role !== MEMBER_PORTAL_ROLE) {
    // A staff account (pastor, secretary) already owns this address. Link the
    // member record to it rather than creating a second login for one person,
    // and leave their existing password alone.
    await db('users').where({ uid: existing.uid }).update({ memberId: member.id });
    await db('members')
      .where({ id: member.id, tenantId })
      .update({
        portalUserUid: existing.uid,
        portalInvitedAt: new Date(),
        portalUsername: existing.username || null,
        portalStatus: existing.status || 'active',
      });
    return {
      created: true,
      email,
      username: existing.username || null,
      status: 'active',
      emailSent: false,
      smsSent: false,
      reset: false,
    };
  }

  // The admin's password is used as typed; otherwise one is generated. Either
  // way only the hash is stored, so nobody -- including the church -- can read
  // it back afterwards.
  const password =
    opts.password !== undefined && String(opts.password) !== ''
      ? String(opts.password)
      : generateTempPassword();
  const bcrypt = (await import('bcryptjs')).default;
  const hash = await bcrypt.hash(password, 12);
  const name = [member.firstName, member.lastName].filter(Boolean).join(' ') || 'Member';
  const now = new Date();

  // A new account starts pending: it exists, but cannot sign in until the email
  // address is confirmed, or until the church vouches for the member directly.
  const activateNow = Boolean(opts.activate);
  const status = activateNow ? 'active' : 'pending';
  const token = activateNow ? null : generateVerificationToken();

  let uid: string;
  if (existing) {
    uid = existing.uid;
    await db('users').where({ uid }).update({
      password: hash,
      // An admin-chosen password is the credential the member was given, so we
      // do not nag them to change it. A generated one is a stopgap.
      mustChangePassword: !opts.password,
      memberId: member.id,
      tenantId,
      status,
      username: username || existing.username || null,
      verificationToken: token,
      verificationExpiresAt: token ? activationExpiry(now) : null,
      verifiedAt: activateNow ? now : null,
      verifiedBy: activateNow ? 'church' : null,
      name: existing.name || name,
      phone: existing.phone || member.phone || null,
    });
  } else {
    uid = generatePortalUid();
    await db('users').insert({
      uid,
      email,
      username,
      name,
      phone: member.phone || null,
      role: MEMBER_PORTAL_ROLE,
      status,
      tenantId,
      password: hash,
      mustChangePassword: !opts.password,
      memberId: member.id,
      verificationToken: token,
      verificationExpiresAt: token ? activationExpiry(now) : null,
      verifiedAt: activateNow ? now : null,
      verifiedBy: activateNow ? 'church' : null,
      createdAt: now,
    });
  }

  await db('members')
    .where({ id: member.id, tenantId })
    .update({
      portalUserUid: uid,
      portalInvitedAt: now,
      portalPasswordSetAt: null,
      portalUsername: username,
      portalStatus: status,
    });

  const tenant = await db('tenants').where({ id: tenantId }).first();
  const churchName = tenant?.name || 'Your church';
  const loginUrl = `${opts.baseUrl || ''}/login`;
  const invite = {
    memberName: name,
    churchName,
    email,
    password,
    loginUrl,
    username: username || undefined,
    activationUrl: token ? activationUrl(opts.baseUrl || '', token) : undefined,
  };

  // Email first: it carries the full explanation.
  let emailSent = false;
  try {
    const result = await sendEmail({
      to: email,
      subject: portalInviteSubject(churchName),
      html: emailTemplate({
        title: token ? 'Activate your member portal' : 'Your member portal is ready',
        body: portalInviteBody(invite),
        // The button is the action that is actually needed next: activating,
        // while that is outstanding, and signing in once it is not.
        ctaLabel: token ? 'Activate my account' : 'Sign in',
        ctaUrl: invite.activationUrl || loginUrl,
        footer: `Sent by ${churchName} via Ecclesia.`,
      }),
    });
    emailSent = Boolean(result?.success);
  } catch (error) {
    console.error('Portal invite email failed:', error);
  }

  // SMS as well when we have a number: many members read a text sooner than an
  // email, and it is the same credentials either way.
  let smsSent = false;
  if (member.phone) {
    try {
      const settings = await getTenantSettings(tenantId, 'sms');
      const result: any = await sendSMS(String(member.phone), portalInviteSms(invite), {
        apiKey: settings?.apiKey,
        senderId: settings?.senderId,
      });
      smsSent = Boolean(result?.success);
    } catch (error) {
      console.error('Portal invite SMS failed:', error);
    }
  }

  await db('communications_log')
    .insert({
      tenantId,
      type: emailSent ? 'email' : 'sms',
      recipient: email,
      subject: portalInviteSubject(churchName),
      message: 'Member portal invitation',
      status: emailSent || smsSent ? 'sent' : 'failed',
      createdAt: now,
    })
    .catch(() => {});

  return {
    created: true,
    email,
    username,
    status,
    emailSent,
    smsSent,
    reset: Boolean(opts.reset),
  };
}

/* --- Extended member record (ministries, education, family, medical) --- */

/**
 * Translates the extended sections of the member form into member columns.
 *
 * Only keys the request actually sent are touched, so this is safe for both
 * creating a member and editing one field of an existing member.
 *
 * Two rules are enforced here rather than in the browser, because the browser
 * is a convenience and not a trust boundary:
 *  - Spouse details are cleared when the member is not married or engaged. A
 *    widowed member's record should not silently retain a spouse's phone number.
 *  - Children are cleared when "has children" is unticked, for the same reason.
 */
/**
 * The spiritual milestones the statistical return counts.
 *
 * Dates rather than checkboxes, because a return has to know which period each
 * milestone fell into. This is the only place these facts are entered: the
 * return counts them, so nobody types a baptism total anywhere.
 */
const MILESTONE_DATE_FIELDS = [
  'convertDate',
  'waterBaptismDate',
  'holySpiritBaptismDate',
  'transferInDate',
  'transferOutDate',
  'dateOfDeath',
];

function applyMilestoneFields(body: any, target: any): void {
  for (const field of MILESTONE_DATE_FIELDS) {
    if (field in body) {
      const raw = body[field];
      if (!raw) {
        target[field] = null;
        continue;
      }
      const when = new Date(raw);
      // An unparseable date is left alone rather than written as null: silently
      // erasing a recorded baptism would quietly change a past return.
      if (!Number.isNaN(when.getTime())) target[field] = when;
    }
  }
  if ('transferredFrom' in body) target.transferredFrom = body.transferredFrom || null;
  if ('transferredTo' in body) target.transferredTo = body.transferredTo || null;
  // Who is credited with winning this convert -- the fact that makes "souls won"
  // countable for the unit the winner belongs to.
  if ('wonByMemberId' in body) target.wonByMemberId = body.wonByMemberId || null;
  if ('wonByName' in body) target.wonByName = body.wonByName || null;
}

function applyExtendedMemberFields(body: any, target: any): void {
  if ('office' in body) target.office = body.office || null;
  applyMilestoneFields(body, target);

  // Education
  if ('isEducated' in body) target.isEducated = Boolean(body.isEducated);
  if ('education' in body || 'isEducated' in body) {
    const educated = 'isEducated' in body ? Boolean(body.isEducated) : true;
    target.education = educated ? toJsonColumn(normalizeEducation(body.education)) : null;
  }

  // Family - spouse
  if ('maritalStatus' in body && !isPartnered(body.maritalStatus)) {
    for (const column of SPOUSE_COLUMNS) target[column] = null;
  } else {
    if ('spouseName' in body) target.spouseName = body.spouseName || null;
    if ('spouseMemberId' in body) target.spouseMemberId = body.spouseMemberId || null;
    if ('spousePhone' in body) target.spousePhone = body.spousePhone || null;
    if ('spouseEmail' in body) target.spouseEmail = body.spouseEmail || null;
    if ('spouseAddress' in body) target.spouseAddress = body.spouseAddress || null;
    if ('spouseOccupation' in body) target.spouseOccupation = body.spouseOccupation || null;
    if ('spouseDetails' in body) target.spouseDetails = body.spouseDetails || null;
    if ('spouseDateOfBirth' in body) {
      target.spouseDateOfBirth = body.spouseDateOfBirth ? new Date(body.spouseDateOfBirth) : null;
    }
    if ('weddingDate' in body) {
      target.weddingDate = body.weddingDate ? new Date(body.weddingDate) : null;
    }
  }

  // Family - children
  if ('hasChildren' in body) target.hasChildren = Boolean(body.hasChildren);
  if ('children' in body || 'hasChildren' in body) {
    const has = 'hasChildren' in body ? Boolean(body.hasChildren) : true;
    target.children = has ? toJsonColumn(normalizeChildren(body.children)) : null;
  }

  // Medical
  if ('medical' in body) target.medical = toJsonColumn(normalizeMedical(body.medical));
}

/**
 * Records a member's ministry assignments in `ministry_members`, the table
 * ministry leaders already read from - so a member assigned here immediately
 * appears on their ministry's roster.
 *
 * A member can serve in several ministries, so this replaces the whole set:
 * rows for ministries no longer selected are removed, and existing rows are
 * kept (preserving their role and joined date) rather than deleted and
 * recreated, which would reset a coordinator back to plain member.
 */
async function syncMemberMinistries(
  tenantId: string,
  member: { id: string; firstName?: string; lastName?: string; phone?: string | null; email?: string | null },
  ministryIds: string[],
  createdBy?: string,
): Promise<void> {
  // Only ministries belonging to this church, so a crafted request cannot
  // attach a member to another church's ministry.
  const valid = ministryIds.length
    ? (await db('ministries').where({ tenantId }).whereIn('id', ministryIds).select('id')).map(
        (m: any) => m.id,
      )
    : [];

  const existing = await db('ministry_members')
    .where({ tenantId, memberId: member.id })
    .select('id', 'ministryId');
  const existingIds = existing.map((r: any) => r.ministryId);

  const toRemove = existing.filter((r: any) => !valid.includes(r.ministryId));
  if (toRemove.length) {
    await db('ministry_members')
      .whereIn('id', toRemove.map((r: any) => r.id))
      .delete();
  }

  const toAdd = valid.filter((id: string) => !existingIds.includes(id));
  if (toAdd.length) {
    const name = `${member.firstName || ''} ${member.lastName || ''}`.trim() || 'Member';
    await db('ministry_members').insert(
      toAdd.map((ministryId: string) => ({
        id: genId('minmem'),
        tenantId,
        ministryId,
        memberId: member.id,
        name,
        role: 'member',
        status: 'active',
        phone: member.phone || null,
        email: member.email || null,
        joinedAt: new Date(),
        createdBy: createdBy || null,
        createdAt: new Date(),
      })),
    );
  }
}

/** The ministries a member is assigned to. */
async function ministryIdsFor(tenantId: string, memberIds: string[]): Promise<Record<string, string[]>> {
  if (!memberIds.length) return {};
  const rows = await db('ministry_members')
    .where({ tenantId })
    .whereIn('memberId', memberIds)
    .select('memberId', 'ministryId');
  const map: Record<string, string[]> = {};
  for (const row of rows as any[]) {
    if (!row.memberId) continue;
    (map[row.memberId] ||= []).push(row.ministryId);
  }
  return map;
}

/** Expands the JSON-stored sections so the browser gets real arrays/objects. */
function expandMemberProfile(member: any, ministryIds: string[] = []): any {
  if (!member) return member;
  return {
    ...member,
    ministryIds,
    education: parseJsonColumn(member.education, [] as any[]),
    children: parseJsonColumn(member.children, [] as any[]),
    medical: parseJsonColumn(member.medical, null as any),
  };
}

/**
 * Marriage is mutual, so linking a spouse writes both records. Without this the
 * link would only exist on whichever profile happened to be edited, and the
 * spouse's own page would show nothing.
 */
async function linkSpouse(tenantId: string, member: any): Promise<void> {
  const spouseId = member.spouseMemberId;
  if (!spouseId || spouseId === member.id) return;
  const spouse = await db('members').where({ id: spouseId, tenantId }).first();
  if (!spouse) return;
  const memberName = `${member.firstName || ''} ${member.lastName || ''}`.trim();
  await db('members').where({ id: spouseId, tenantId }).update({
    spouseMemberId: member.id,
    spouseName: spouse.spouseName || memberName || null,
    maritalStatus: spouse.maritalStatus || member.maritalStatus || 'married',
  });
}

/**
 * Children who are members of the church are connected back to their parent,
 * so the child's own record shows who they belong to.
 */
async function linkChildren(tenantId: string, parentId: string, children: any[]): Promise<void> {
  const childIds = (children || []).map((c: any) => c?.memberId).filter(Boolean);

  // Drop links to children removed from the list, so a correction does not
  // leave a stale parent on someone else's record.
  const stale = db('members').where({ tenantId, parentMemberId: parentId });
  if (childIds.length) stale.whereNotIn('id', childIds);
  await stale.update({ parentMemberId: null });

  if (childIds.length) {
    await db('members')
      .where({ tenantId })
      .whereIn('id', childIds)
      .whereNot({ id: parentId })
      .update({ parentMemberId: parentId });
  }
}

router.get('/members', async (req: AuthRequest, res) => {
  try {
    const { search = '', status = 'all', familyId, page = 1, limit = 50 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    let query = db('members').where({ tenantId: tid(req) });
    if (search) {
      query = query.where(function () {
        this.where('firstName', 'like', `%${search}%`)
          .orWhere('lastName', 'like', `%${search}%`)
          .orWhere('email', 'like', `%${search}%`)
          .orWhere('phone', 'like', `%${search}%`);
      });
    }
    if (status !== 'all') query = query.where('membershipStatus', String(status));
    if (familyId) query = query.where('familyId', String(familyId));
    // The count is cloned BEFORE any .select() is added below. If `query`
    // already carried a select list, knex would emit `select *, count("id")`,
    // which Postgres rejects with error 42803. Order matters here.
    const total = await query.clone().count('id as count').first();
    const data = await query
      .select(await memberColumns())
      .select(hasPhotoColumn())
      .orderBy('lastName', 'asc')
      .limit(Number(limit))
      .offset(offset);
    // Ministry assignments are fetched in one query for the whole page rather
    // than per member, so a 50-member page stays a single extra round trip.
    const ministries = await ministryIdsFor(
      tid(req)!,
      (data as any[]).map((m) => m.id),
    );
    res.json({
      data: (data as any[]).map((m) => expandMemberProfile(m, ministries[m.id] || [])),
      pagination: { total: total?.count || 0, page: Number(page), limit: Number(limit) },
    });
  } catch (error) {
    console.error('List members error:', error);
    res.status(500).json({ error: 'Failed to fetch members' });
  }
});

router.get('/members/:id', async (req: AuthRequest, res) => {
  try {
    const member = await db('members')
      .where({ id: req.params.id, tenantId: tid(req) })
      .select(await memberColumns())
      .select(hasPhotoColumn())
      .first();
    if (!member) return res.status(404).json({ error: 'Member not found' });
    const ministries = await ministryIdsFor(tid(req)!, [member.id]);
    res.json(expandMemberProfile(member, ministries[member.id] || []));
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch member' });
  }
});

/* --- Member profile pictures --------------------------------------- */

/**
 * Serve a member's profile picture as an image response.
 *
 * Returned as raw bytes rather than base64 JSON so the browser can cache it
 * and use it directly in an <img src>. Tenant-scoped: a caller can never read
 * a photo belonging to another church.
 */
router.get('/members/:id/photo', async (req: AuthRequest, res) => {
  try {
    const row = await db('members')
      .where({ id: req.params.id, tenantId: tid(req) })
      .select('photo', 'photoMimeType', 'photoUpdatedAt')
      .first();
    if (!row || !row.photo) {
      return res.status(404).json({ error: 'This member has no photo' });
    }
    sendImage(res, row.photo, row.photoMimeType, row.photoUpdatedAt);
  } catch (error) {
    console.error('Get member photo error:', error);
    res.status(500).json({ error: 'Failed to fetch member photo' });
  }
});

/**
 * Upload or replace a member's profile picture.
 *
 * Expects { photo: "data:image/jpeg;base64,..." }, already resized and
 * compressed in the browser by src/lib/imageCompress.ts. Everything is
 * re-validated here -- the client is never trusted.
 */
router.post(
  '/members/:id/photo',
  requireRole('CHURCH_ADMIN', 'PASTOR', 'MINISTRY_LEADER', 'SECRETARY'),
  async (req: AuthRequest, res) => {
    try {
      const exists = await db('members')
        .where({ id: req.params.id, tenantId: tid(req) })
        .select('id')
        .first();
      if (!exists) return res.status(404).json({ error: 'Member not found' });

      const img = decodeImageDataUrl(req.body?.photo);
      await db('members')
        .where({ id: req.params.id, tenantId: tid(req) })
        .update({
          photo: img.buffer,
          photoMimeType: img.mimeType,
          photoUpdatedAt: new Date(),
        });

      await logActivity(req, 'update', 'members', req.params.id, 'photo uploaded');
      res.json({ success: true, bytes: img.bytes, mimeType: img.mimeType });
    } catch (error) {
      handleImageError(error, res, 'Failed to upload member photo');
    }
  },
);

/** Remove a member's profile picture. */
router.delete(
  '/members/:id/photo',
  requireRole('CHURCH_ADMIN', 'PASTOR', 'MINISTRY_LEADER', 'SECRETARY'),
  async (req: AuthRequest, res) => {
    try {
      const updated = await db('members')
        .where({ id: req.params.id, tenantId: tid(req) })
        .update({ photo: null, photoMimeType: null, photoUpdatedAt: null });
      if (!updated) return res.status(404).json({ error: 'Member not found' });
      res.json({ success: true });
    } catch (error) {
      console.error('Delete member photo error:', error);
      res.status(500).json({ error: 'Failed to remove member photo' });
    }
  },
);

router.post('/members', requireRole('CHURCH_ADMIN', 'PASTOR', 'MINISTRY_LEADER', 'SECRETARY'), async (req: AuthRequest, res) => {
  try {
    const { firstName, lastName, email, phone, gender, dateOfBirth, familyId, membershipStatus, notes,
      membershipId, anniversaryDate, maritalStatus, occupation, address, branchId, ministryId, photoUrl,
      photo } = req.body;
    if (!firstName || !lastName) {
      return res.status(400).json({ error: 'firstName and lastName are required' });
    }
    const member: any = {
      id: genId('member'),
      tenantId: tid(req),
      familyId: familyId || null,
      firstName,
      lastName,
      email: email || null,
      phone: phone || null,
      gender: gender || null,
      dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
      membershipStatus: membershipStatus || 'active',
      membershipId: membershipId || `MEM-${String(Date.now()).slice(-6)}`,
      anniversaryDate: anniversaryDate ? new Date(anniversaryDate) : null,
      maritalStatus: maritalStatus || null,
      occupation: occupation || null,
      address: address || null,
      branchId: branchId || null,
      ministryId: ministryId || null,
      photoUrl: photoUrl || null,
      approvalStatus: 'approved',
      joinDate: new Date(),
      notes: notes || null,
      createdAt: new Date(),
    };

    // Ministries, office, education, family and medical details - shown only
    // for denominations whose portal asks for them, but accepted whenever they
    // are sent so an import or API client is never blocked.
    applyExtendedMemberFields(req.body, member);

    // The one group this member belongs to (a cell, zone or house fellowship).
    const groupError = await applyMemberGroup(tid(req)!, req.body, member);
    if (groupError) return res.status(400).json({ error: groupError });

    // Optional profile picture supplied at creation time, so an admin can add
    // a member and their photo in one step.
    if (photo) {
      const img = decodeImageDataUrl(photo);
      member.photo = img.buffer;
      member.photoMimeType = img.mimeType;
      member.photoUpdatedAt = new Date();
    }

    await db('members').insert(member);

    const ministryIds = normalizeMinistryIds(req.body.ministryIds ?? req.body.ministries);
    await syncMemberMinistries(tid(req)!, member, ministryIds, req.user?.uid);
    await linkSpouse(tid(req)!, member);
    await linkChildren(tid(req)!, member.id, normalizeChildren(req.body.children));

    // The moment a member is registered they get portal access. This runs
    // after the member row exists so the two records can point at each other.
    // A failure here must not fail the registration: the member is saved, and
    // the admin can re-send the invite from the member list.
    let portalAccess: PortalAccessResult;
    try {
      portalAccess = await provisionPortalAccess(tid(req)!, member, {
        baseUrl: publicBaseUrl(req),
        // Credentials the church admin typed on the registration form. Left
        // blank, a username is derived from the name and a password generated.
        username: req.body?.username,
        password: req.body?.password,
        // An admin registering someone in person can vouch for them straight
        // away instead of waiting on an email round-trip.
        activate: req.body?.activateNow === true || req.body?.activateNow === 'true',
      });
    } catch (error) {
      console.error('Portal provisioning failed:', error);
      portalAccess = {
        created: false,
        reason: 'no_email',
        message: 'The member was saved, but their portal login could not be created. Use “Send portal invite” to try again.',
      };
    }

    // A credential the admin typed but which could not be used is an error
    // worth surfacing: silently substituting a generated password would leave
    // them handing out one that does not work.
    if (
      !portalAccess.created &&
      (req.body?.username || req.body?.password) &&
      portalAccess.reason !== 'no_email'
    ) {
      const { photo: _p, ...saved } = member;
      return res.status(201).json({
        ...expandMemberProfile(saved, ministryIds),
        hasPhoto: Boolean(member.photo),
        portalAccess,
        warning: `${portalAccess.message} The member was still registered — use “Send portal invite” to set up their login.`,
      });
    }

    // Never echo the raw image bytes back in the JSON response.
    const { photo: _omitPhoto, ...safeMember } = member;
    res.status(201).json({
      ...expandMemberProfile(safeMember, ministryIds),
      hasPhoto: Boolean(member.photo),
      portalAccess,
    });
  } catch (error) {
    handleImageError(error, res, 'Failed to create member');
  }
});

/**
 * Send (or re-send) a member's portal invitation.
 *
 * Used when a member was registered without an email address, never received
 * the first invitation, or has forgotten the temporary password. Each call
 * issues a NEW password: the old one is a hash we cannot read back, and a fresh
 * credential is safer than any mechanism for recovering the previous one.
 */
router.post('/members/:id/portal-access', requireRole('CHURCH_ADMIN', 'PASTOR', 'SECRETARY'), async (req: AuthRequest, res) => {
  try {
    const tenantId = tid(req);
    const member = await db('members').where({ id: req.params.id, tenantId }).first();
    if (!member) return res.status(404).json({ error: 'Member not found' });

    // An address can be supplied here, which is how an admin gives portal
    // access to a member registered without one.
    const email = req.body?.email ? String(req.body.email).trim() : '';
    if (email && email.toLowerCase() !== String(member.email || '').toLowerCase()) {
      await db('members').where({ id: member.id, tenantId }).update({ email });
      member.email = email;
    }

    const result = await provisionPortalAccess(tenantId!, member, {
      baseUrl: publicBaseUrl(req),
      reset: true,
      username: req.body?.username,
      password: req.body?.password,
      activate: req.body?.activateNow === true,
    });

    if (!result.created) {
      return res.status(400).json({ error: result.message, reason: result.reason });
    }

    await logActivity(req, 'MEMBER_PORTAL_INVITE', 'members', member.id);

    const pending = result.status === 'pending';
    res.json({
      success: true,
      email: result.email,
      username: result.username,
      status: result.status,
      emailSent: result.emailSent,
      smsSent: result.smsSent,
      message:
        result.emailSent || result.smsSent
          ? pending
            ? `Sent to ${result.email}. The member must click the activation link before signing in — or you can activate the account here.`
            : `A new portal login was sent to ${result.email}.`
          : `The portal login was created for ${result.email}, but the invitation could not be delivered. Check the email and SMS settings.`,
    });
  } catch (error) {
    console.error('POST /members/:id/portal-access error:', error);
    res.status(500).json({ error: 'Failed to send the portal invitation' });
  }
});

/**
 * Activate a member's portal account on the church's behalf.
 *
 * The member normally activates themselves from the link in their invitation.
 * This is the other half of that: a member with no working email address, or
 * one standing at the church office, can be vouched for by an admin. The
 * account is marked as activated BY the church rather than by the member, so
 * the distinction survives in the record.
 */
router.post('/members/:id/portal-activate', requireRole('CHURCH_ADMIN', 'PASTOR', 'SECRETARY'), async (req: AuthRequest, res) => {
  try {
    const tenantId = tid(req);
    const member = await db('members').where({ id: req.params.id, tenantId }).first();
    if (!member) return res.status(404).json({ error: 'Member not found' });

    const account = member.portalUserUid
      ? await db('users').where({ uid: member.portalUserUid }).first()
      : await db('users').where({ memberId: member.id, tenantId }).first();

    if (!account) {
      return res.status(400).json({
        error: 'This member has no portal login yet. Use “Send portal invite” first.',
      });
    }

    // Deactivating is the same switch in reverse, so both live here rather than
    // in two endpoints that could drift apart.
    const activate = req.body?.active !== false;
    const now = new Date();

    if (activate) {
      await db('users').where({ uid: account.uid }).update({
        status: 'active',
        // The token is spent: leaving it live would keep a second way in that
        // nobody is tracking.
        verificationToken: null,
        verificationExpiresAt: null,
        verifiedAt: account.verifiedAt || now,
        verifiedBy: account.verifiedBy || 'church',
      });
    } else {
      await db('users').where({ uid: account.uid }).update({ status: 'suspended' });
    }

    await db('members')
      .where({ id: member.id, tenantId })
      .update({ portalStatus: activate ? 'active' : 'suspended' });

    await logActivity(req, activate ? 'MEMBER_PORTAL_ACTIVATED' : 'MEMBER_PORTAL_SUSPENDED', 'members', member.id);

    res.json({
      success: true,
      status: activate ? 'active' : 'suspended',
      message: activate
        ? `${member.firstName || 'This member'} can now sign in to the member portal.`
        : `${member.firstName || 'This member'} can no longer sign in to the member portal.`,
    });
  } catch (error) {
    console.error('POST /members/:id/portal-activate error:', error);
    res.status(500).json({ error: 'Failed to change the portal account' });
  }
});

/**
 * POST /members/import  -- bulk member import from a spreadsheet.
 *
 * The browser parses the .xlsx/.csv file (SheetJS) and posts plain JSON rows
 * plus the column mapping the user confirmed. The server then re-runs the SAME
 * validation used for the preview (src/lib/memberImport.ts): a client-side
 * check is a convenience, never a trust boundary.
 *
 * Behaviour that matters to a church secretary uploading a real register:
 *  - The whole import is one transaction. A failure at row 900 rolls back the
 *    earlier 899 rather than leaving a half-imported register that is painful
 *    to reconcile by hand.
 *  - Rows that fail validation are REPORTED, not silently dropped, and are
 *    identified by their spreadsheet row number.
 *  - Members whose email already exists in this church are skipped by default,
 *    so re-uploading a corrected file does not create duplicates.
 */
router.post('/members/import', requireRole('CHURCH_ADMIN', 'PASTOR', 'SECRETARY'), async (req: AuthRequest, res) => {
  try {
    const { rows, mapping, skipExistingEmails = true, dryRun = false } = req.body || {};

    if (!Array.isArray(rows)) {
      return res.status(400).json({ error: 'rows must be an array of spreadsheet rows' });
    }
    if (!mapping || typeof mapping !== 'object') {
      return res.status(400).json({ error: 'mapping must be an object of field -> column name' });
    }
    if (rows.length > MAX_IMPORT_ROWS) {
      return res.status(413).json({
        error: `This import has ${rows.length} rows, which exceeds the limit of ${MAX_IMPORT_ROWS}. Please split the file.`,
      });
    }

    const tenantId = tid(req);
    const validation = validateImportRows(rows, mapping);

    if (validation.fatalErrors.length > 0) {
      return res.status(400).json({
        error: validation.fatalErrors[0],
        fatalErrors: validation.fatalErrors,
      });
    }

    // Which of these emails does this church already have? Chunked because
    // SQLite caps bound parameters near 999, and a 2000-row file would blow
    // straight past that limit in a single whereIn.
    const candidateEmails = Array.from(
      new Set(
        validation.validRows
          .map((r) => r.member!.email?.toLowerCase())
          .filter((e): e is string => Boolean(e)),
      ),
    );
    const existingEmails = new Set<string>();
    for (let i = 0; i < candidateEmails.length; i += 500) {
      const chunk = candidateEmails.slice(i, i + 500);
      const found = await db('members')
        .where({ tenantId })
        .whereIn(db.raw('lower(??)', ['email']) as any, chunk)
        .select('email');
      for (const row of found) {
        if (row.email) existingEmails.add(String(row.email).toLowerCase());
      }
    }

    const skipped: Array<{ rowNumber: number; reason: string }> = [];
    const toInsert: any[] = [];

    // One timestamp base for the whole batch. The single-member route derives
    // membershipId from Date.now(), which would hand every row in a bulk insert
    // the SAME id, so the batch index is appended to keep them distinct.
    const stamp = String(Date.now()).slice(-6);

    validation.validRows.forEach((result, index) => {
      const member = result.member as NormalizedMember;
      const email = member.email?.toLowerCase();

      if (email && existingEmails.has(email) && skipExistingEmails) {
        skipped.push({ rowNumber: result.rowNumber, reason: `A member with email ${email} already exists` });
        return;
      }

      toInsert.push({
        id: genId('member'),
        tenantId,
        familyId: null,
        firstName: member.firstName,
        lastName: member.lastName,
        email: member.email,
        phone: member.phone,
        gender: member.gender,
        dateOfBirth: member.dateOfBirth ? new Date(member.dateOfBirth) : null,
        membershipStatus: member.membershipStatus,
        membershipId: member.membershipId || `MEM-${stamp}-${index + 1}`,
        anniversaryDate: member.anniversaryDate ? new Date(member.anniversaryDate) : null,
        maritalStatus: member.maritalStatus,
        occupation: member.occupation,
        address: member.address,
        branchId: null,
        ministryId: null,
        photoUrl: null,
        approvalStatus: 'approved',
        joinDate: new Date(),
        notes: member.notes,
        createdAt: new Date(),
      });

      // Guards against the same email appearing twice inside one upload.
      if (email) existingEmails.add(email);
    });

    const summary = {
      totalRows: rows.length,
      imported: dryRun ? 0 : toInsert.length,
      importable: toInsert.length,
      skipped: skipped.length,
      failed: validation.invalidRows.length,
      duplicateEmailsInFile: validation.duplicateEmails,
      skippedRows: skipped,
      failedRows: validation.invalidRows.map((r) => ({ rowNumber: r.rowNumber, errors: r.errors })),
      warnings: validation.rows
        .filter((r) => r.warnings.length > 0)
        .map((r) => ({ rowNumber: r.rowNumber, warnings: r.warnings })),
    };

    // dryRun gives the UI an authoritative server-side preview, including
    // duplicate detection against the live register, before anything is written.
    if (dryRun) {
      return res.json({ success: true, dryRun: true, ...summary });
    }

    if (toInsert.length > 0) {
      await db.transaction(async (trx) => {
        // Chunked so a large register does not build one enormous statement.
        for (let i = 0; i < toInsert.length; i += 200) {
          await trx('members').insert(toInsert.slice(i, i + 200));
        }
      });
    }

    await logActivity(
      req,
      'create',
      'members',
      undefined,
      `imported ${toInsert.length} members from spreadsheet (${skipped.length} skipped, ${validation.invalidRows.length} failed)`,
    );

    res.status(201).json({ success: true, ...summary });
  } catch (error) {
    console.error('POST /members/import error:', error);
    res.status(500).json({ error: 'Failed to import members' });
  }
});

router.put('/members/:id', requireRole('CHURCH_ADMIN', 'PASTOR', 'MINISTRY_LEADER', 'SECRETARY'), async (req: AuthRequest, res) => {
  try {
    const existing = await db('members')
      .where({ id: req.params.id, tenantId: tid(req) })
      .first();
    if (!existing) return res.status(404).json({ error: 'Member not found' });
    const allowed = ['firstName', 'lastName', 'email', 'phone', 'gender', 'dateOfBirth', 'familyId', 'membershipStatus', 'notes',
      'membershipId', 'anniversaryDate', 'maritalStatus', 'occupation', 'address', 'branchId', 'ministryId', 'photoUrl', 'approvalStatus'];
    const updates: any = {};
    for (const key of allowed) {
      if (key in req.body) updates[key] = req.body[key];
    }
    if (updates.dateOfBirth) updates.dateOfBirth = new Date(updates.dateOfBirth);
    if (updates.anniversaryDate) updates.anniversaryDate = new Date(updates.anniversaryDate);

    applyExtendedMemberFields(req.body, updates);

    // `photo` is handled separately from the `allowed` list because it needs
    // validation and decoding. Passing photo: null clears the picture.
    if ('photo' in req.body) {
      if (req.body.photo === null || req.body.photo === '') {
        updates.photo = null;
        updates.photoMimeType = null;
        updates.photoUpdatedAt = null;
      } else {
        const img = decodeImageDataUrl(req.body.photo);
        updates.photo = img.buffer;
        updates.photoMimeType = img.mimeType;
        updates.photoUpdatedAt = new Date();
      }
    }

    // Ministry assignments live in their own table, so a request that changes
    // only ministries has no member columns to update - and must not be
    // rejected as an empty edit.
    const groupError = await applyMemberGroup(tid(req)!, req.body, updates);
    if (groupError) return res.status(400).json({ error: groupError });

    const ministriesSupplied = 'ministryIds' in req.body || 'ministries' in req.body;
    if (Object.keys(updates).length === 0 && !ministriesSupplied) {
      return res.status(400).json({ error: 'No updatable fields were supplied' });
    }

    if (Object.keys(updates).length > 0) {
      await db('members').where({ id: req.params.id, tenantId: tid(req) }).update(updates);
    }

    const changedAt = new Date();

    // A change of standing is recorded as it happens. Deaths and transfers out
    // are counted from this history rather than from the member record, because
    // the record only says how things stand now: without the moment of change,
    // a member who died in March would go on being counted as a death in every
    // later period.
    if (updates.membershipStatus && updates.membershipStatus !== existing.membershipStatus) {
      const member = { ...existing, ...updates, id: existing.id };
      await recordStatusChange(
        tid(req)!,
        member,
        'membership',
        existing.membershipStatus || null,
        updates.membershipStatus,
        req.user?.uid,
        changedAt,
      );

      // The matching date is stamped on the member record too, so the register
      // itself reads correctly -- but only when the church has not supplied a
      // more accurate date, which it often will: a death is usually entered days
      // after it happened.
      const stamp: any = {};
      if (updates.membershipStatus === 'deceased' && !existing.dateOfDeath && !('dateOfDeath' in updates)) {
        stamp.dateOfDeath = changedAt;
      }
      if (updates.membershipStatus === 'transferred' && !existing.transferOutDate && !('transferOutDate' in updates)) {
        stamp.transferOutDate = changedAt;
      }
      if (Object.keys(stamp).length) {
        await db('members').where({ id: req.params.id, tenantId: tid(req) }).update(stamp);
      }
    }

    if (ministriesSupplied) {
      await syncMemberMinistries(
        tid(req)!,
        { ...existing, ...updates, id: req.params.id },
        normalizeMinistryIds(req.body.ministryIds ?? req.body.ministries),
        req.user?.uid,
      );
    }
    if ('spouseMemberId' in updates && updates.spouseMemberId) {
      await linkSpouse(tid(req)!, { ...existing, ...updates, id: req.params.id });
    }
    if ('children' in req.body || 'hasChildren' in req.body) {
      await linkChildren(tid(req)!, req.params.id, normalizeChildren(req.body.children));
    }
    res.json({ success: true });
  } catch (error) {
    handleImageError(error, res, 'Failed to update member');
  }
});

router.delete('/members/:id', requireRole('CHURCH_ADMIN', 'PASTOR'), async (req: AuthRequest, res) => {
  try {
    const deleted = await db('members')
      .where({ id: req.params.id, tenantId: tid(req) })
      .delete();
    if (!deleted) return res.status(404).json({ error: 'Member not found' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete member' });
  }
});

/* ------------------------------------------------------------------ */
/* Families                                                           */
/* ------------------------------------------------------------------ */
router.get('/families', async (req: AuthRequest, res) => {
  try {
    const families = await db('families')
      .where({ tenantId: tid(req) })
      .orderBy('name', 'asc');
    res.json({ data: families });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch families' });
  }
});

router.post('/families', requireRole('CHURCH_ADMIN', 'PASTOR', 'MINISTRY_LEADER'), async (req: AuthRequest, res) => {
  try {
    const { name, primaryContactId, address, phone } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const family = {
      id: genId('family'),
      tenantId: tid(req),
      name,
      primaryContactId: primaryContactId || null,
      address: address || null,
      phone: phone || null,
      createdAt: new Date(),
    };
    await db('families').insert(family);
    res.status(201).json(family);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create family' });
  }
});

/* ------------------------------------------------------------------ */
/* Events + attendance / check-in                                     */
/* ------------------------------------------------------------------ */
router.get('/events', async (req: AuthRequest, res) => {
  try {
    const { upcoming } = req.query;
    let query = db('events').where({ tenantId: tid(req) });
    if (upcoming === 'true') query = query.where('startTime', '>=', new Date());
    const events = await query.orderBy('startTime', 'asc');
    res.json({ data: events });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

router.post('/events', requireRole('CHURCH_ADMIN', 'PASTOR', 'MINISTRY_LEADER', 'SECRETARY'), async (req: AuthRequest, res) => {
  try {
    const { description, location, startTime, endTime, category } = req.body;
    // Accept `name` as an alias for `title`. The church Events form posted `name`
    // for a long time and every create was rejected here with a 400 that the UI
    // reported as a generic "Failed to create event." The UI now sends `title`,
    // but accepting both means no other caller can fall into the same trap.
    const title = req.body?.title || req.body?.name;
    if (!title || !startTime) {
      return res.status(400).json({
        error: 'An event name and a start time are both required.',
      });
    }
    const start = new Date(startTime);
    if (Number.isNaN(start.getTime())) {
      return res.status(400).json({ error: 'That start time is not a valid date and time.' });
    }
    const end = endTime ? new Date(endTime) : null;
    if (end && Number.isNaN(end.getTime())) {
      return res.status(400).json({ error: 'That end time is not a valid date and time.' });
    }
    if (end && end.getTime() < start.getTime()) {
      return res.status(400).json({ error: 'The end time cannot be before the start time.' });
    }
    const event = {
      id: genId('event'),
      tenantId: tid(req),
      title,
      description: description || null,
      location: location || null,
      startTime: start,
      endTime: end,
      category: category || 'service',
      createdBy: req.user?.uid || null,
      createdAt: new Date(),
    };
    await db('events').insert(event);
    await logActivity(req, 'create', 'events', event.id);
    res.status(201).json(event);
  } catch (error) {
    // This catch was silent, which is why the failure never appeared in the
    // deploy logs and had to be diagnosed by reading both sides of the call.
    console.error('POST /events error:', error);
    res.status(500).json({ error: 'Failed to create event' });
  }
});

router.put('/events/:id', requireRole('CHURCH_ADMIN', 'PASTOR', 'MINISTRY_LEADER', 'SECRETARY'), async (req: AuthRequest, res) => {
  try {
    const existing = await db('events')
      .where({ id: req.params.id, tenantId: tid(req) })
      .first();
    if (!existing) return res.status(404).json({ error: 'Event not found' });
    const allowed = ['title', 'description', 'location', 'startTime', 'endTime', 'category'];
    const updates: any = {};
    for (const key of allowed) if (key in req.body) updates[key] = req.body[key];
    if (updates.startTime) updates.startTime = new Date(updates.startTime);
    if (updates.endTime) updates.endTime = new Date(updates.endTime);
    await db('events').where({ id: req.params.id, tenantId: tid(req) }).update(updates);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update event' });
  }
});

router.delete('/events/:id', requireRole('CHURCH_ADMIN', 'PASTOR'), async (req: AuthRequest, res) => {
  try {
    const deleted = await db('events')
      .where({ id: req.params.id, tenantId: tid(req) })
      .delete();
    if (!deleted) return res.status(404).json({ error: 'Event not found' });
    await db('event_attendance').where({ eventId: req.params.id, tenantId: tid(req) }).delete();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete event' });
  }
});

// Child / member check-in. Returns a short pickup code for child check-in.
router.post('/events/:id/checkin', async (req: AuthRequest, res) => {
  try {
    const event = await db('events')
      .where({ id: req.params.id, tenantId: tid(req) })
      .first();
    if (!event) return res.status(404).json({ error: 'Event not found' });
    const { memberId, childName, guardianName } = req.body;
    if (!memberId && !childName) {
      return res.status(400).json({ error: 'Provide either memberId or childName' });
    }
    const checkInCode = String(Math.floor(1000 + Math.random() * 9000));
    const record = {
      tenantId: tid(req),
      eventId: req.params.id,
      memberId: memberId || null,
      childName: childName || null,
      guardianName: guardianName || null,
      checkInCode,
      status: 'checked_in',
      checkedInBy: req.user?.uid || null,
      checkInAt: new Date(),
      createdAt: new Date(),
    };
    const [insertedId] = await db('event_attendance').insert(record).returning('id');
    const id = typeof insertedId === 'object' ? insertedId.id : insertedId;
    res.status(201).json({ ...record, id, checkInCode });
  } catch (error) {
    console.error('Check-in error:', error);
    res.status(500).json({ error: 'Failed to check in' });
  }
});

router.post('/events/:id/checkout', async (req: AuthRequest, res) => {
  try {
    const { attendanceId, checkInCode } = req.body;
    const match: any = { tenantId: tid(req), eventId: req.params.id, status: 'checked_in' };
    if (attendanceId) match.id = attendanceId;
    if (checkInCode) match.checkInCode = String(checkInCode);
    const updated = await db('event_attendance')
      .where(match)
      .update({ status: 'checked_out', checkOutAt: new Date() });
    if (!updated) return res.status(404).json({ error: 'No matching check-in found' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to check out' });
  }
});

router.get('/events/:id/attendance', async (req: AuthRequest, res) => {
  try {
    const rows = await db('event_attendance')
      .where({ eventId: req.params.id, tenantId: tid(req) })
      .orderBy('checkInAt', 'desc');
    res.json({ data: rows, total: rows.length });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch attendance' });
  }
});

/* ------------------------------------------------------------------ */
/* Payment gateway resolution                                         */
/* ------------------------------------------------------------------ */

/**
 * The gateway credentials to use for a church's own collections (member
 * giving). The payment gateway is provisioned by the super admin, either
 * per-church (written into church_settings by the platform admin) or once for
 * the whole platform, so a church never has to hold API keys itself.
 */
async function resolveGateway(tenantId: string): Promise<{ secretKey: string; currency: string; provider: string }> {
  const perChurch = await getTenantSettings(tenantId, 'paystack');
  const platform = await getPlatformGateway();
  return {
    secretKey: perChurch?.secretKey || platform.secretKey,
    currency: perChurch?.currency || platform.currency || 'GHS',
    provider: perChurch?.provider || platform.provider || 'Paystack',
  };
}

/* ------------------------------------------------------------------ */
/* Giving (donations + Paystack)                                      */
/* ------------------------------------------------------------------ */
router.get('/giving', async (req: AuthRequest, res) => {
  try {
    const { status = 'all', page = 1, limit = 50 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    let query = db('donations').where({ tenantId: tid(req) });
    if (status !== 'all') query = query.where('status', String(status));
    const total = await query.clone().count('id as count').first();
    const totalAmount = await db('donations')
      .where({ tenantId: tid(req), status: 'completed' })
      .sum('amount as total')
      .first();
    const data = await query
      .orderBy('createdAt', 'desc')
      .limit(Number(limit))
      .offset(offset);
    res.json({
      data,
      summary: { totalCompleted: Number(totalAmount?.total || 0) },
      pagination: { total: total?.count || 0, page: Number(page), limit: Number(limit) },
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch giving records' });
  }
});

// Manually record an offline gift (cash / cheque / bank).
router.post('/giving', requireRole('CHURCH_ADMIN', 'PASTOR', 'MINISTRY_LEADER', 'FINANCE'), async (req: AuthRequest, res) => {
  try {
    const { amount, currency, donorName, paymentMethod, purpose, memberId, email } = req.body;
    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({ error: 'A positive amount is required' });
    }
    const method = paymentMethod || 'cash';
    // Mobile money, bank transfer, card and cheque gifts must carry enough
    // detail to be reconciled against the wallet or statement later.
    const detailError = validatePaymentDetails(method, req.body);
    if (detailError) return res.status(400).json({ error: detailError });

    const record = {
      tenantId: tid(req),
      amount: Number(amount),
      currency: currency || 'GHS',
      donorName: donorName || 'Anonymous',
      paymentMethod: method,
      purpose: purpose || 'General',
      memberId: memberId || null,
      email: email || null,
      status: 'completed',
      ...normalizePaymentDetails(method, req.body),
      createdAt: new Date(),
    };
    const [insertedId] = await db('donations').insert(record).returning('id');
    const id = typeof insertedId === 'object' ? insertedId.id : insertedId;
    res.status(201).json({ ...record, id });
  } catch (error) {
    console.error('Record giving error:', error);
    res.status(500).json({ error: 'Failed to record gift' });
  }
});

// Start an online (Paystack) gift. Returns the authorization URL to redirect to.
router.post('/giving/initialize', async (req: AuthRequest, res) => {
  try {
    const gateway = await resolveGateway(tid(req));
    const secretKey = gateway.secretKey;
    if (!isPaystackConfigured(secretKey)) {
      return res.status(503).json({ error: 'Online giving is not configured yet. Your platform administrator sets up the payment gateway.' });
    }
    const { amount, email, donorName, purpose, memberId, callbackUrl } = req.body;
    if (!amount || Number(amount) <= 0) return res.status(400).json({ error: 'A positive amount is required' });
    if (!email) return res.status(400).json({ error: 'A payer email is required by Paystack' });

    // The platform transaction charge configured by the super admin applies to
    // every transaction: added on top when the payer bears it, deducted from
    // the church's settlement when the recipient does.
    const charge = applyTransactionCharge(Number(amount), await getTransactionCharge());

    const reference = genId('gift');
    await db('donations').insert({
      tenantId: tid(req),
      amount: charge.baseAmount,
      currency: gateway.currency,
      donorName: donorName || 'Anonymous',
      paymentMethod: 'paystack',
      purpose: purpose || 'General',
      memberId: memberId || null,
      email,
      reference,
      status: 'pending',
      chargeAmount: charge.chargeAmount,
      netAmount: charge.netAmount,
      chargeBearer: charge.chargeBearer,
      createdAt: new Date(),
    });

    const data = await initializeTransaction({
      secretKey,
      email,
      // What the payer is actually billed.
      amount: charge.totalAmount,
      reference,
      currency: gateway.currency,
      callback_url: callbackUrl,
      metadata: {
        tenantId: tid(req),
        purpose: purpose || 'General',
        donorName,
        baseAmount: charge.baseAmount,
        transactionCharge: charge.chargeAmount,
      },
    });
    res.json({
      authorizationUrl: data?.authorization_url,
      reference,
      accessCode: data?.access_code,
      amount: charge.baseAmount,
      transactionCharge: charge.chargeAmount,
      totalPayable: charge.totalAmount,
      chargeBearer: charge.chargeBearer,
    });
  } catch (error) {
    console.error('Giving initialize error:', error);
    res.status(502).json({ error: 'Failed to initialize payment with Paystack' });
  }
});

// Confirm a gift after redirect (server-side verification).
router.get('/giving/verify/:reference', async (req: AuthRequest, res) => {
  try {
    const reference = req.params.reference;
    const donation = await db('donations')
      .where({ reference, tenantId: tid(req) })
      .first();
    if (!donation) return res.status(404).json({ error: 'Gift not found' });

    const gateway = await resolveGateway(tid(req));
    const data = await verifyTransaction(reference, gateway.secretKey);
    const newStatus = data?.status === 'success' ? 'completed' : 'failed';
    await db('donations').where({ reference, tenantId: tid(req) }).update({ status: newStatus });
    res.json({ status: newStatus, reference });
  } catch (error) {
    console.error('Giving verify error:', error);
    res.status(502).json({ error: 'Failed to verify payment' });
  }
});

/* ------------------------------------------------------------------ */
/* Communications (SMS / announcements)                               */
/* ------------------------------------------------------------------ */
router.get('/communications', async (req: AuthRequest, res) => {
  try {
    const rows = await db('communications_log')
      .where({ tenantId: tid(req) })
      .orderBy('createdAt', 'desc')
      .limit(200);
    res.json({ data: rows });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch communications' });
  }
});

// Broadcast an SMS to selected members (or explicit recipients).
router.post('/communications/sms', requireRole('CHURCH_ADMIN', 'PASTOR', 'MINISTRY_LEADER'), async (req: AuthRequest, res) => {
  try {
    const { message, memberIds, recipients } = req.body;
    if (!message) return res.status(400).json({ error: 'message is required' });

    let numbers: string[] = Array.isArray(recipients) ? recipients.filter(Boolean) : [];
    if (Array.isArray(memberIds) && memberIds.length) {
      const members = await db('members')
        .where({ tenantId: tid(req) })
        .whereIn('id', memberIds)
        .whereNotNull('phone');
      numbers = numbers.concat(members.map((m: any) => m.phone));
    }
    numbers = Array.from(new Set(numbers.filter(Boolean)));
    if (!numbers.length) return res.status(400).json({ error: 'No valid recipients' });

    // Enforce the SMS credit balance: one credit per recipient. Block the send
    // up front if the church does not have enough credits, and point them to
    // the SMS Bundles page to top up.
    const tenant = await db('tenants').where({ id: tid(req) }).first();
    const balance = Number(tenant?.smsCredits || 0);
    if (balance < numbers.length) {
      return res.status(402).json({
        error: 'Insufficient SMS credits',
        message: `This send needs ${numbers.length} credits but only ${balance} are available. Purchase an SMS bundle to continue.`,
        required: numbers.length,
        balance,
      });
    }

    const smsSettings = await getTenantSettings(tid(req), 'sms');
    const results = [];
    for (const number of numbers) {
      const result = await sendSMS(number, message, { apiKey: smsSettings.apiKey, senderId: smsSettings.senderId });
      await db('communications_log').insert({
        tenantId: tid(req),
        channel: 'sms',
        recipient: number,
        subject: null,
        message,
        status: result?.success ? 'sent' : 'failed',
        sentBy: req.user?.uid || null,
        createdAt: new Date(),
      });
      results.push({ number, success: Boolean(result?.success) });
    }
    // Deduct one credit per successfully sent message only.
    const sentCount = results.filter((r) => r.success).length;
    let remainingCredits = balance;
    if (sentCount > 0) {
      remainingCredits = Math.max(0, balance - sentCount);
      await db('tenants').where({ id: tid(req) }).update({ smsCredits: remainingCredits }).catch(() => {});
    }
    res.json({ sent: sentCount, total: results.length, creditsRemaining: remainingCredits, results });
  } catch (error) {
    console.error('Send SMS error:', error);
    res.status(500).json({ error: 'Failed to send SMS' });
  }
});

// Post an announcement to the tenant.
router.post('/communications/announcements', requireRole('CHURCH_ADMIN', 'PASTOR', 'MINISTRY_LEADER'), async (req: AuthRequest, res) => {
  try {
    const { subject, message } = req.body;
    if (!subject) return res.status(400).json({ error: 'subject is required' });
    await db('communications_log').insert({
      tenantId: tid(req),
      channel: 'announcement',
      recipient: 'all',
      subject,
      message: message || null,
      status: 'sent',
      sentBy: req.user?.uid || null,
      createdAt: new Date(),
    });
    res.status(201).json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to post announcement' });
  }
});

/* ------------------------------------------------------------------ */
/* Dashboard summary                                                  */
/* ------------------------------------------------------------------ */
router.get('/dashboard/stats', async (req: AuthRequest, res) => {
  try {
    const tenantId = tid(req);
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfWeek = new Date(startOfToday);
    startOfWeek.setDate(startOfToday.getDate() - startOfToday.getDay());
    const currentMonth = now.getMonth() + 1;

    const [memberCount, visitorCount, familyCount, upcomingCount, givingTotal, monthGiving, weekGiving, attendanceToday, pendingApprovals] =
      await Promise.all([
        db('members').where({ tenantId }).count('id as count').first(),
        db('visitors').where({ tenantId }).count('id as count').first().catch(() => ({ count: 0 })),
        db('families').where({ tenantId }).count('id as count').first(),
        db('events').where({ tenantId }).where('startTime', '>=', now).count('id as count').first(),
        db('donations').where({ tenantId, status: 'completed' }).sum('amount as total').first(),
        db('donations').where({ tenantId, status: 'completed' }).where('createdAt', '>=', startOfMonth).sum('amount as total').first(),
        db('donations').where({ tenantId, status: 'completed' }).where('createdAt', '>=', startOfWeek).sum('amount as total').first(),
        db('event_attendance').where({ tenantId }).where('checkInAt', '>=', startOfToday).count('id as count').first().catch(() => ({ count: 0 })),
        db('members').where({ tenantId, approvalStatus: 'pending' }).count('id as count').first().catch(() => ({ count: 0 })),
      ]);

    const upcomingEventsList = await db('events').where({ tenantId }).where('startTime', '>=', now).orderBy('startTime', 'asc').limit(5).catch(() => []);
    const recentActivities = await db('church_activity_log').where({ tenantId }).orderBy('createdAt', 'desc').limit(8).catch(() => []);
    const givingByPurposeRows = await db('donations').where({ tenantId, status: 'completed' }).select('purpose').sum('amount as total').groupBy('purpose').catch(() => []);

    // Birthdays & anniversaries this month (filtered in JS for cross-DB safety)
    const dobMembers = await db('members').where({ tenantId }).whereNotNull('dateOfBirth').catch(() => []);
    const birthdays = dobMembers
      .filter((m: any) => m.dateOfBirth && new Date(m.dateOfBirth).getMonth() + 1 === currentMonth)
      .map((m: any) => ({ id: m.id, name: `${m.firstName} ${m.lastName || ''}`.trim(), date: m.dateOfBirth }))
      .sort((a: any, b: any) => new Date(a.date).getDate() - new Date(b.date).getDate());
    let anniversaries: any[] = [];
    try {
      const annMembers = await db('members').where({ tenantId }).whereNotNull('anniversaryDate');
      anniversaries = annMembers
        .filter((m: any) => m.anniversaryDate && new Date(m.anniversaryDate).getMonth() + 1 === currentMonth)
        .map((m: any) => ({ id: m.id, name: `${m.firstName} ${m.lastName || ''}`.trim(), date: m.anniversaryDate }));
    } catch { anniversaries = []; }

    // Charts: giving last 6 months
    const givingRecords = await db('donations').where({ tenantId, status: 'completed' }).where('createdAt', '>=', new Date(now.getFullYear(), now.getMonth() - 5, 1)).catch(() => []);
    const givingByMonth: Record<string, number> = {};
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      givingByMonth[`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`] = 0;
    }
    for (const g of givingRecords) {
      const d = new Date(g.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (key in givingByMonth) givingByMonth[key] += Number(g.amount || 0);
    }
    const givingChart = Object.entries(givingByMonth).map(([month, total]) => ({ month, total }));

    // Charts: attendance last 6 weeks
    const attRecords = await db('event_attendance').where({ tenantId }).where('checkInAt', '>=', new Date(now.getTime() - 42 * 24 * 3600 * 1000)).catch(() => []);
    const attendanceChart: any[] = [];
    for (let i = 5; i >= 0; i--) {
      const weekStart = new Date(startOfToday.getTime() - (i * 7 + startOfToday.getDay()) * 24 * 3600 * 1000);
      const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 3600 * 1000);
      const count = attRecords.filter((a: any) => { const t = new Date(a.checkInAt); return t >= weekStart && t < weekEnd; }).length;
      attendanceChart.push({ week: weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), attendance: count });
    }

    res.json({
      members: Number(memberCount?.count || 0),
      visitors: Number((visitorCount as any)?.count || 0),
      families: Number(familyCount?.count || 0),
      attendanceToday: Number((attendanceToday as any)?.count || 0),
      pendingApprovals: Number((pendingApprovals as any)?.count || 0),
      upcomingEvents: Number(upcomingCount?.count || 0),
      giving: {
        total: Number(givingTotal?.total || 0),
        thisMonth: Number(monthGiving?.total || 0),
        thisWeek: Number(weekGiving?.total || 0),
        byPurpose: (givingByPurposeRows as any[]).map((r: any) => ({ purpose: r.purpose || 'General', total: Number(r.total || 0) })),
      },
      upcomingEventsList,
      birthdays,
      anniversaries,
      recentActivities,
      charts: { giving: givingChart, attendance: attendanceChart },
      totalGiving: Number(givingTotal?.total || 0),
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch dashboard stats' });
  }
});

/* ------------------------------------------------------------------ */
/* Church-level settings (Paystack, SMS, general)                     */
/* ------------------------------------------------------------------ */
/* ------------------------------------------------------------------ */
/* Church logo                                                        */
/* ------------------------------------------------------------------ */

/**
 * Serve this church's uploaded logo.
 *
 * NOTE: `tenants.logo` already existed as a plain URL string. The uploaded
 * binary lives in separate columns (`logoImage`/`logoMimeType`), so churches
 * that already point at an external URL keep working unchanged; an upload
 * simply takes precedence in the UI.
 */
router.get('/branding/logo', async (req: AuthRequest, res) => {
  try {
    const row = await db('tenants')
      .where({ id: tid(req) })
      .select('logoImage', 'logoMimeType', 'logoUpdatedAt')
      .first();
    if (!row || !row.logoImage) {
      return res.status(404).json({ error: 'No logo has been uploaded' });
    }
    sendImage(res, row.logoImage, row.logoMimeType, row.logoUpdatedAt);
  } catch (error) {
    console.error('Get church logo error:', error);
    res.status(500).json({ error: 'Failed to fetch church logo' });
  }
});

/** Upload or replace this church's logo (settings screen). */
router.post('/branding/logo', requireRole('CHURCH_ADMIN', 'PASTOR'), async (req: AuthRequest, res) => {
  try {
    const img = decodeImageDataUrl(req.body?.logo ?? req.body?.image ?? req.body?.photo);
    await db('tenants').where({ id: tid(req) }).update({
      logoImage: img.buffer,
      logoMimeType: img.mimeType,
      logoUpdatedAt: new Date(),
    });
    await logActivity(req, 'update', 'tenants', tid(req), 'church logo uploaded');
    res.json({ success: true, bytes: img.bytes, mimeType: img.mimeType });
  } catch (error) {
    handleImageError(error, res, 'Failed to upload church logo');
  }
});

/** Remove this church's uploaded logo. */
router.delete('/branding/logo', requireRole('CHURCH_ADMIN', 'PASTOR'), async (req: AuthRequest, res) => {
  try {
    await db('tenants').where({ id: tid(req) }).update({
      logoImage: null,
      logoMimeType: null,
      logoUpdatedAt: null,
    });
    res.json({ success: true });
  } catch (error) {
    console.error('Delete church logo error:', error);
    res.status(500).json({ error: 'Failed to remove church logo' });
  }
});

const SETTINGS_KEYS = ['general', 'paystack', 'sms', 'email', 'payment', 'integration', 'financial', 'profile', 'backup', 'engagement'];

/**
 * Sections a church may still edit for itself. Everything else in
 * SETTINGS_KEYS -- SMS, email, the payment gateway, integrations and the
 * backup policy -- is provisioned by the super admin on the church's behalf,
 * so those sections are readable here but not writable.
 */
const CHURCH_WRITABLE_SETTINGS = ['general', 'financial', 'profile', 'engagement'];

async function getTenantSettings(tenantId: string, key: string): Promise<any> {
  const row = await db('church_settings').where({ tenantId, key }).first();
  if (!row) return {};
  try {
    return JSON.parse(row.value);
  } catch {
    return {};
  }
}

function maskSecret(value?: string): string | undefined {
  if (!value) return value;
  if (value.length <= 4) return '\u2022\u2022\u2022\u2022';
  return `${'\u2022'.repeat(Math.max(4, value.length - 4))}${value.slice(-4)}`;
}

router.get('/settings', requireRole('CHURCH_ADMIN', 'PASTOR'), async (req: AuthRequest, res) => {
  try {
    const rows = await db('church_settings').where({ tenantId: tid(req) });
    const out: any = { general: {}, paystack: {}, sms: {} };
    for (const r of rows) {
      try {
        out[r.key] = JSON.parse(r.value);
      } catch {
        /* ignore malformed rows */
      }
    }

    /*
     * Centrally-managed sections: when the super admin has not set anything
     * specific for this church, fall back to the platform-wide configuration
     * so the church can still see what is in force for them. Values are shown
     * read-only; `managedSections` tells the UI which tabs to lock.
     */
    for (const key of SUPERADMIN_MANAGED_CHURCH_SETTINGS) {
      const platform = await getPlatformSettings(key === 'paystack' ? 'payment' : key);
      out[key] = { ...platform, ...(out[key] || {}) };
    }

    // Never expose full secrets to the browser.
    for (const section of Object.keys(out)) {
      for (const field of ['secretKey', 'apiKey', 'password', 'privateKey', 'token']) {
        if (out[section] && typeof out[section][field] === 'string' && out[section][field]) {
          out[section][field] = maskSecret(out[section][field]);
        }
      }
    }

    res.json({
      ...out,
      managedSections: SUPERADMIN_MANAGED_CHURCH_SETTINGS,
      editableSections: CHURCH_WRITABLE_SETTINGS,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load church settings' });
  }
});

router.put('/settings/:key', requireRole('CHURCH_ADMIN', 'PASTOR'), async (req: AuthRequest, res) => {
  try {
    const key = req.params.key;
    if (!SETTINGS_KEYS.includes(key)) {
      return res.status(400).json({ error: 'Unknown settings section' });
    }
    /*
     * SMS, email, payment gateway, integrations and backup are configured by
     * the platform administrator for every church, so a church admin cannot
     * overwrite them here. A super admin acting on a church (resolveTenant
     * lets them pass ?tenantId=) is still allowed through.
     */
    if (isSuperadminManagedSetting(key) && req.user?.role !== 'SUPER_ADMIN') {
      return res.status(403).json({
        error: `The ${key} settings are managed by your platform administrator. Please contact support to change them.`,
      });
    }
    const existing = await getTenantSettings(tid(req), key);
    const incoming = { ...(req.body || {}) };
    // Do not overwrite a stored secret with a masked placeholder from the UI.
    for (const secretField of ['secretKey', 'apiKey']) {
      if (typeof incoming[secretField] === 'string' && incoming[secretField].includes('\u2022')) {
        delete incoming[secretField];
      }
    }
    const merged = { ...existing, ...incoming };
    const value = JSON.stringify(merged);
    const row = await db('church_settings').where({ tenantId: tid(req), key }).first();
    if (row) {
      await db('church_settings').where({ tenantId: tid(req), key }).update({ value, updatedAt: new Date() });
    } else {
      await db('church_settings').insert({ tenantId: tid(req), key, value, updatedAt: new Date() });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Update church settings error:', error);
    res.status(500).json({ error: 'Failed to save church settings' });
  }
});

/* ================================================================== */
/* Additional church modules                                          */
/* ================================================================== */

async function logActivity(req: AuthRequest, action: string, entity: string, entityId?: string, details?: string) {
  try {
    await db('church_activity_log').insert({
      tenantId: tid(req),
      userId: req.user?.uid || null,
      userName: (req as any).dbUser?.name || req.user?.email || 'system',
      action,
      entity,
      entityId: entityId || null,
      details: details || null,
      ipAddress: (req as any).ip || null,
      createdAt: new Date(),
    });
  } catch { /* non-fatal */ }
}

type CrudOpts = {
  idPrefix: string;
  fields: string[];
  dateFields?: string[];
  numberFields?: string[];
  filterFields?: string[];
  orderBy?: string;
  writeRoles?: string[];
  /**
   * Name of the field holding the payment method (usually 'paymentMethod').
   * When set, the matching transaction details (mobile money sender, bank
   * account, card holder...) are validated and kept with the record.
   */
  paymentDetails?: string;
  /**
   * Returns a message to show the user when the submitted record is not
   * acceptable, or null when it is fine. Runs before anything touches the
   * database, so the user gets a real explanation instead of "Failed to save".
   */
  validate?: (body: any) => string | null | undefined;
};

function registerCrud(basePath: string, table: string, opts: CrudOpts) {
  // Tables a finance officer owns. FINANCE is *appended* rather than swapped in
  // so no role that could already write here loses access.
  const FINANCE_TABLES = ['expenses', 'budgets', 'pledges'];
  const baseWriteRoles = opts.writeRoles || ['CHURCH_ADMIN', 'PASTOR', 'MINISTRY_LEADER'];
  const writeRoles = FINANCE_TABLES.includes(table)
    ? [...baseWriteRoles, 'FINANCE']
    : baseWriteRoles;
  const coerce = (body: any) => {
    const row: any = {};
    // Mobile money / bank / card details arrive as their own fields; normalising
    // first means only the ones that belong to the chosen method are stored.
    const source = opts.paymentDetails
      ? { ...body, ...normalizePaymentDetails(body[opts.paymentDetails], body) }
      : body;
    for (const f of opts.fields) {
      if (!(f in source)) continue;
      let v = source[f];
      if (opts.dateFields?.includes(f)) v = v ? new Date(v) : null;
      else if (opts.numberFields?.includes(f)) v = v === '' || v == null ? null : Number(v);
      row[f] = v;
    }
    return row;
  };

  /**
   * Returns an error message for a bad submission, or null when it can be
   * saved. Payment details are checked here too, so a mobile money entry
   * without a transaction ID is refused with a clear reason.
   */
  const checkBody = (body: any): string | null => {
    const custom = opts.validate?.(body);
    if (custom) return custom;
    if (opts.paymentDetails) {
      const problem = validatePaymentDetails(body[opts.paymentDetails], body);
      if (problem) return problem;
    }
    return null;
  };

  router.get(basePath, async (req: AuthRequest, res) => {
    try {
      let q = db(table).where({ tenantId: tid(req) });
      for (const f of opts.filterFields || []) {
        const val = (req as any).query[f];
        if (val !== undefined && val !== '' && val !== 'all') q = q.where(f, String(val));
      }
      const rows = await q.orderBy(opts.orderBy || 'createdAt', 'desc');
      res.json({ data: rows });
    } catch (e) {
      console.error(`GET ${basePath} error:`, e);
      res.status(500).json({ error: `Failed to load ${table}` });
    }
  });

  router.post(basePath, requireRole(...writeRoles), async (req: AuthRequest, res) => {
    try {
      const problem = checkBody(req.body);
      if (problem) return res.status(400).json({ error: problem });
      const row = { id: genId(opts.idPrefix), tenantId: tid(req), ...coerce(req.body), createdAt: new Date() };
      await db(table).insert(row);
      await logActivity(req, 'create', table, row.id);
      res.status(201).json(row);
    } catch (e: any) {
      console.error(`POST ${basePath} error:`, e);
      // A generic message here is what made "Failed to create..." impossible to
      // act on. The database's own complaint (a missing column, a bad date) is
      // far more useful to whoever has to fix it.
      res.status(500).json({
        error: `Failed to save this record${e?.message ? `: ${e.message}` : '.'}`,
      });
    }
  });

  router.put(`${basePath}/:id`, requireRole(...writeRoles), async (req: AuthRequest, res) => {
    try {
      const existing = await db(table).where({ id: (req as any).params.id, tenantId: tid(req) }).first();
      if (!existing) return res.status(404).json({ error: 'Not found' });
      const problem = checkBody({ ...existing, ...req.body });
      if (problem) return res.status(400).json({ error: problem });
      await db(table).where({ id: (req as any).params.id, tenantId: tid(req) }).update(coerce(req.body));
      await logActivity(req, 'update', table, (req as any).params.id);
      res.json({ success: true });
    } catch (e: any) {
      console.error(`PUT ${basePath} error:`, e);
      res.status(500).json({
        error: `Failed to update this record${e?.message ? `: ${e.message}` : '.'}`,
      });
    }
  });

  router.delete(`${basePath}/:id`, requireRole('CHURCH_ADMIN', 'PASTOR'), async (req: AuthRequest, res) => {
    try {
      const deleted = await db(table).where({ id: (req as any).params.id, tenantId: tid(req) }).delete();
      if (!deleted) return res.status(404).json({ error: 'Not found' });
      await logActivity(req, 'delete', table, (req as any).params.id);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: `Failed to delete ${table} record` });
    }
  });
}

registerCrud('/ministries', 'ministries', {
  idPrefix: 'min',
  fields: ['type', 'name', 'description', 'leaderId', 'leaderName', 'meetingDay', 'meetingTime', 'location', 'memberCount', 'status'],
  numberFields: ['memberCount'],
  filterFields: ['type', 'status'],
  orderBy: 'name',
});
registerCrud('/expenses', 'expenses', {
  idPrefix: 'exp',
  fields: [
    'category', 'description', 'amount', 'currency', 'paymentMethod', 'vendor',
    'status', 'recordedBy', 'date',
    ...PAYMENT_DETAIL_FIELDS,
  ],
  paymentDetails: 'paymentMethod',
  numberFields: ['amount'],
  dateFields: ['date'],
  filterFields: ['category', 'status'],
});
registerCrud('/budgets', 'budgets', {
  idPrefix: 'bud',
  fields: ['category', 'fiscalYear', 'allocated', 'spent', 'notes'],
  numberFields: ['allocated', 'spent'],
  filterFields: ['fiscalYear'],
});
registerCrud('/pledges', 'pledges', {
  idPrefix: 'pld',
  fields: [
    'memberId', 'memberName', 'purpose', 'amountPledged', 'amountPaid',
    'currency', 'status', 'dueDate', 'paymentMethod',
    ...PAYMENT_DETAIL_FIELDS,
  ],
  paymentDetails: 'paymentMethod',
  numberFields: ['amountPledged', 'amountPaid'],
  dateFields: ['dueDate'],
  filterFields: ['status'],
});
registerCrud('/inventory', 'inventory', {
  idPrefix: 'inv',
  fields: ['name', 'category', 'quantity', 'unitValue', 'condition', 'location', 'notes'],
  // The category is whatever the church types, so the only rules are that it
  // is present and short enough to display in a table.
  validate: (body: any) => {
    const category = String(body?.category ?? '').trim();
    if (!category) return 'Please give this item a category, for example Instruments or Chairs.';
    if (category.length > 60) return 'Please use a shorter category name (60 characters or fewer).';
    return null;
  },
  numberFields: ['quantity', 'unitValue'],
  filterFields: ['category', 'condition'],
  orderBy: 'name',
});
registerCrud('/branches', 'branches', {
  idPrefix: 'brc',
  fields: ['name', 'location', 'pastorName', 'phone', 'email', 'memberCount', 'isMain'],
  numberFields: ['memberCount'],
  orderBy: 'name',
});
registerCrud('/sermons', 'sermons', {
  idPrefix: 'ser',
  fields: ['title', 'speaker', 'seriesName', 'description', 'scripture', 'videoUrl', 'audioUrl', 'notesUrl', 'thumbnailUrl', 'date', 'durationMinutes', 'tags', 'published'],
  numberFields: ['durationMinutes'],
  dateFields: ['date'],
  filterFields: ['seriesName', 'speaker'],
  orderBy: 'date',
});
registerCrud('/service-schedules', 'service_schedules', {
  idPrefix: 'svc',
  // `description` and `active` were missing here, so a form that posted them
  // had those values silently dropped.
  fields: ['name', 'dayOfWeek', 'startTime', 'endTime', 'location', 'branchId', 'description', 'active'],
  orderBy: 'name',
  validate: (body) => {
    if (!String(body?.name || '').trim()) return 'Give the service a name, for example "Sunday First Service".';
    if (!String(body?.dayOfWeek || '').trim()) return 'Choose the day of the week this service runs.';
    if (body?.startTime && body?.endTime && String(body.endTime) < String(body.startTime)) {
      return 'The end time cannot be before the start time.';
    }
    return null;
  },
});

/* ---- Church positions (Usher, Treasurer, Choir Lead, ...) ----
 *
 * ROLE decides what the portal permits. POSITION describes a person's place in
 * the church. A member can hold several positions at once, which is why the
 * assignments live in their own table rather than a column on `members`.
 *
 * The position catalogue uses the standard tenant-scoped CRUD helper. The
 * member <-> position assignments need their own endpoints because they join
 * two tables and must validate that both sides belong to the calling church.
 *
 * NOTE: `linkedRole` is descriptive only. Assigning a position does NOT change
 * a member's portal role; that is done from Users & Permissions. Making
 * linkedRole actually grant a role would let anyone who can assign positions
 * escalate privileges, so it stays a label until it is guarded properly.
 */
registerCrud('/positions', 'church_positions', {
  idPrefix: 'pos',
  fields: ['name', 'category', 'description', 'linkedRole', 'active'],
  filterFields: ['category'],
  orderBy: 'name',
  writeRoles: ['CHURCH_ADMIN', 'PASTOR'],
});

/** Every position assignment in this church, with member and position names. */
router.get('/position-assignments', async (req: AuthRequest, res) => {
  try {
    const rows = await db('member_positions as mp')
      .where({ 'mp.tenantId': tid(req) })
      .leftJoin('members as m', 'm.id', 'mp.memberId')
      .leftJoin('church_positions as p', 'p.id', 'mp.positionId')
      .select(
        'mp.id as id',
        'mp.memberId',
        'mp.positionId',
        'mp.ministryId',
        'mp.startDate',
        'mp.endDate',
        'mp.active',
        'm.firstName as memberFirstName',
        'm.lastName as memberLastName',
        'p.name as positionName',
        'p.category as positionCategory',
        'p.linkedRole as positionLinkedRole',
      )
      .orderBy('mp.createdAt', 'desc');
    res.json({ data: rows });
  } catch {
    res.status(500).json({ error: 'Failed to load position assignments' });
  }
});

/** Positions held by one member. */
router.get('/members/:id/positions', async (req: AuthRequest, res) => {
  try {
    const rows = await db('member_positions as mp')
      .where({ 'mp.tenantId': tid(req), 'mp.memberId': String(req.params.id) })
      .leftJoin('church_positions as p', 'p.id', 'mp.positionId')
      .select(
        'mp.id as id',
        'mp.positionId',
        'mp.ministryId',
        'mp.startDate',
        'mp.active',
        'p.name as positionName',
        'p.category as positionCategory',
      )
      .orderBy('mp.createdAt', 'desc');
    res.json({ data: rows });
  } catch {
    res.status(500).json({ error: 'Failed to load member positions' });
  }
});

/** Assign a position to a member. */
router.post('/position-assignments', requireRole('CHURCH_ADMIN', 'PASTOR'), async (req: AuthRequest, res) => {
  try {
    const { memberId, positionId, ministryId, startDate } = req.body || {};
    if (!memberId || !positionId) {
      return res.status(400).json({ error: 'A member and a position are both required.' });
    }
    const tenantId = tid(req);

    // Both sides must belong to the calling church. Without these two checks a
    // church admin could attach their own position to another church's member,
    // or assign a position belonging to a different tenant.
    const member = await db('members').where({ id: String(memberId), tenantId }).first();
    if (!member) return res.status(404).json({ error: 'Member not found in this church.' });
    const position = await db('church_positions').where({ id: String(positionId), tenantId }).first();
    if (!position) return res.status(404).json({ error: 'Position not found in this church.' });

    const duplicate = await db('member_positions')
      .where({ tenantId, memberId: String(memberId), positionId: String(positionId), active: true })
      .first();
    if (duplicate) return res.status(409).json({ error: 'That member already holds this position.' });

    await db('member_positions').insert({
      tenantId,
      memberId: String(memberId),
      positionId: String(positionId),
      ministryId: ministryId ? String(ministryId) : null,
      startDate: startDate ? new Date(startDate) : new Date(),
      active: true,
      assignedBy: (req as any).user?.uid || null,
      createdAt: new Date(),
    });
    return res.json({ success: true });
  } catch {
    return res.status(500).json({ error: 'Failed to assign position' });
  }
});

/** Remove a position assignment. */
router.delete('/position-assignments/:id', requireRole('CHURCH_ADMIN', 'PASTOR'), async (req: AuthRequest, res) => {
  try {
    // member_positions uses an auto-incrementing integer id, not a prefixed string.
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid assignment id.' });
    const removed = await db('member_positions').where({ id, tenantId: tid(req) }).del();
    if (!removed) return res.status(404).json({ error: 'Assignment not found.' });
    return res.json({ success: true });
  } catch {
    return res.status(500).json({ error: 'Failed to remove position assignment' });
  }
});

/* ---- Visitors (first-time / returning + convert to member) ---- */
router.get('/visitors', async (req: AuthRequest, res) => {
  try {
    const { type = 'all', status } = req.query as any;
    let q = db('visitors').where({ tenantId: tid(req) });
    if (type === 'first_time') q = q.where('isFirstTime', true);
    else if (type === 'returning') q = q.where('isFirstTime', false);
    if (status && status !== 'all') q = q.where('followUpStatus', String(status));
    const rows = await q.orderBy('visitDate', 'desc');
    res.json({ data: rows });
  } catch (e) {
    res.status(500).json({ error: 'Failed to load visitors' });
  }
});
router.post('/visitors', requireRole('CHURCH_ADMIN', 'PASTOR', 'MINISTRY_LEADER', 'SECRETARY'), async (req: AuthRequest, res) => {
  try {
    const b = req.body || {};
    if (!b.firstName) return res.status(400).json({ error: 'firstName is required' });
    const row = {
      id: genId('vis'),
      tenantId: tid(req),
      firstName: b.firstName,
      lastName: b.lastName || null,
      phone: b.phone || null,
      email: b.email || null,
      gender: b.gender || null,
      invitedBy: b.invitedBy || null,
      serviceAttended: b.serviceAttended || null,
      howHeard: b.howHeard || null,
      isFirstTime: b.isFirstTime === false ? false : true,
      visitCount: Number(b.visitCount || 1),
      followUpStatus: b.followUpStatus || 'pending',
      notes: b.notes || null,
      visitDate: b.visitDate ? new Date(b.visitDate) : new Date(),
      createdAt: new Date(),
    };
    await db('visitors').insert(row);
    await logActivity(req, 'create', 'visitors', row.id);
    res.status(201).json(row);
  } catch (e) {
    res.status(500).json({ error: 'Failed to create visitor' });
  }
});
router.put('/visitors/:id', requireRole('CHURCH_ADMIN', 'PASTOR', 'MINISTRY_LEADER', 'SECRETARY'), async (req: AuthRequest, res) => {
  try {
    const existing = await db('visitors').where({ id: req.params.id, tenantId: tid(req) }).first();
    if (!existing) return res.status(404).json({ error: 'Visitor not found' });
    const allowed = ['firstName', 'lastName', 'phone', 'email', 'gender', 'invitedBy', 'serviceAttended', 'howHeard', 'isFirstTime', 'visitCount', 'followUpStatus', 'notes'];
    const updates: any = {};
    for (const k of allowed) if (k in req.body) updates[k] = req.body[k];
    await db('visitors').where({ id: req.params.id, tenantId: tid(req) }).update(updates);
    await logActivity(req, 'update', 'visitors', req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to update visitor' });
  }
});
router.delete('/visitors/:id', requireRole('CHURCH_ADMIN', 'PASTOR'), async (req: AuthRequest, res) => {
  try {
    const deleted = await db('visitors').where({ id: req.params.id, tenantId: tid(req) }).delete();
    if (!deleted) return res.status(404).json({ error: 'Visitor not found' });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to delete visitor' });
  }
});
router.post('/visitors/:id/convert', requireRole('CHURCH_ADMIN', 'PASTOR'), async (req: AuthRequest, res) => {
  try {
    const v = await db('visitors').where({ id: req.params.id, tenantId: tid(req) }).first();
    if (!v) return res.status(404).json({ error: 'Visitor not found' });
    if (v.convertedMemberId) return res.status(400).json({ error: 'Visitor already converted' });
    const memberId = genId('member');
    const membershipId = `MEM-${Date.now().toString().slice(-6)}`;
    await db('members').insert({
      id: memberId,
      tenantId: tid(req),
      membershipId,
      firstName: v.firstName,
      lastName: v.lastName || '',
      email: v.email || null,
      phone: v.phone || null,
      gender: v.gender || null,
      membershipStatus: 'active',
      approvalStatus: 'approved',
      joinDate: new Date(),
      createdAt: new Date(),
    });
    await db('visitors').where({ id: v.id, tenantId: tid(req) }).update({ followUpStatus: 'converted', convertedMemberId: memberId });
    await logActivity(req, 'convert', 'visitors', v.id, `Converted to member ${membershipId}`);
    res.json({ success: true, memberId, membershipId });
  } catch (e) {
    res.status(500).json({ error: 'Failed to convert visitor' });
  }
});

/* ---- Finance summary ---- */
router.get('/finance/summary', async (req: AuthRequest, res) => {
  try {
    const tenantId = tid(req);
    const donations = await db('donations').where({ tenantId, status: 'completed' });
    const expensesRows = await db('expenses').where({ tenantId });
    const incomeByPurpose: Record<string, number> = {};
    let totalIncome = 0;
    for (const d of donations) {
      totalIncome += Number(d.amount || 0);
      const p = d.purpose || 'General';
      incomeByPurpose[p] = (incomeByPurpose[p] || 0) + Number(d.amount || 0);
    }
    const expensesByCategory: Record<string, number> = {};
    let totalExpenses = 0;
    for (const e of expensesRows) {
      totalExpenses += Number(e.amount || 0);
      const c = e.category || 'General';
      expensesByCategory[c] = (expensesByCategory[c] || 0) + Number(e.amount || 0);
    }
    const pledges = await db('pledges').where({ tenantId });
    const pledgedTotal = pledges.reduce((s: number, p: any) => s + Number(p.amountPledged || 0), 0);
    const pledgePaid = pledges.reduce((s: number, p: any) => s + Number(p.amountPaid || 0), 0);
    res.json({
      totalIncome,
      totalExpenses,
      net: totalIncome - totalExpenses,
      incomeByPurpose: Object.entries(incomeByPurpose).map(([purpose, total]) => ({ purpose, total })),
      expensesByCategory: Object.entries(expensesByCategory).map(([category, total]) => ({ category, total })),
      pledges: { pledgedTotal, pledgePaid, outstanding: pledgedTotal - pledgePaid },
    });
  } catch (e) {
    res.status(500).json({ error: 'Failed to compute finance summary' });
  }
});

/* ---- Users & permissions (church-scoped) ---- */
const CHURCH_ROLES = [
  { role: 'CHURCH_ADMIN', label: 'Church Admin', permissions: ['Full access to all church modules', 'Manage users & roles', 'Manage settings & billing'] },
  { role: 'PASTOR', label: 'Pastor', permissions: ['Members & visitors', 'Finance & giving', 'Events & communication', 'Reports'] },
  { role: 'MINISTRY_LEADER', label: 'Ministry Leader', permissions: ['Assigned ministry members', 'Attendance & events', 'Send communication'] },
  { role: 'FINANCE', label: 'Finance Officer', permissions: ['Record giving', 'Expenses, budgets & pledges', 'Finance reports'] },
  { role: 'SECRETARY', label: 'Secretary', permissions: ['Members & visitors', 'Mark attendance (QR, roll call, biometric)', 'Events & service calendar'] },
  { role: 'MEMBER', label: 'Member', permissions: ['View own profile', 'Give online', 'View events'] },
];
router.get('/roles', async (_req: AuthRequest, res) => {
  res.json({ data: CHURCH_ROLES });
});

/* ---- Role permission matrix, customisable per church ----
 *
 * Two layers are combined on read:
 *   `role_permissions`        platform-wide defaults, set by the super admin
 *   `church_role_permissions` this church's overrides, keyed (tenantId, role)
 *
 * Because the override table is keyed on the tenant, one church editing
 * "Secretary" is invisible to every other church. A role with no override row
 * reports the platform default and `customised: false`.
 *
 * Platform-level permissions (churches.manage, billing.manage) are stripped on
 * both read and write, so a church admin cannot award their own church control
 * of other tenants or of platform billing.
 *
 * IMPORTANT: these codes currently drive what the UI offers. Route access in
 * this file is still enforced by role name via requireRole(...), so unticking a
 * box here does not by itself revoke an endpoint. Enforcement needs to be moved
 * onto this matrix before it is described to anyone as a security boundary.
 */
router.get('/roles-permissions', requireRole('CHURCH_ADMIN', 'PASTOR'), async (req: AuthRequest, res) => {
  try {
    const defaults = await db('role_permissions').catch(() => [] as any[]);
    const overrides = await db('church_role_permissions')
      .where({ tenantId: tid(req) })
      .catch(() => [] as any[]);
    res.json({
      data: resolveRolePermissions(defaults as any[], overrides as any[]),
      catalog: (PERMISSION_CODES as readonly string[]).filter(
        (c) => !PLATFORM_ONLY_PERMISSIONS.includes(c),
      ),
    });
  } catch {
    res.status(500).json({ error: 'Failed to load role permissions' });
  }
});

/** Save an override for one role, scoped to the calling church. */
router.put('/roles-permissions/:role', requireRole('CHURCH_ADMIN'), async (req: AuthRequest, res) => {
  try {
    const role = String(req.params.role || '').toUpperCase();
    if (!isChurchEditableRole(role)) {
      return res.status(400).json({ error: 'That role cannot be customised by a church.' });
    }
    const codes = sanitizePermissions(req.body?.permissions);
    const tenantId = tid(req);
    const existing = await db('church_role_permissions').where({ tenantId, role }).first();
    if (existing) {
      await db('church_role_permissions')
        .where({ tenantId, role })
        .update({ permissions: serializePermissions(codes), updatedAt: new Date() });
    } else {
      await db('church_role_permissions').insert({
        tenantId,
        role,
        permissions: serializePermissions(codes),
        updatedAt: new Date(),
      });
    }
    return res.json({ success: true, role, permissions: codes });
  } catch {
    return res.status(500).json({ error: 'Failed to save role permissions' });
  }
});

/** Remove this church's override so the role falls back to the platform default. */
router.delete('/roles-permissions/:role', requireRole('CHURCH_ADMIN'), async (req: AuthRequest, res) => {
  try {
    const role = String(req.params.role || '').toUpperCase();
    await db('church_role_permissions').where({ tenantId: tid(req), role }).del();
    return res.json({ success: true, role });
  } catch {
    return res.status(500).json({ error: 'Failed to reset role permissions' });
  }
});
router.get('/users', requireRole('CHURCH_ADMIN', 'PASTOR'), async (req: AuthRequest, res) => {
  try {
    const users = await db('users')
      .where({ tenantId: tid(req) })
      .select('uid', 'email', 'name', 'role', 'status', 'phone', 'lastLogin', 'createdAt')
      .orderBy('createdAt', 'desc');
    res.json({ data: users });
  } catch (e) {
    res.status(500).json({ error: 'Failed to load users' });
  }
});
router.post('/users', requireRole('CHURCH_ADMIN'), async (req: AuthRequest, res) => {
  try {
    const { email, name, role, phone, password } = req.body || {};
    if (!email || !name) return res.status(400).json({ error: 'email and name are required' });
    const exists = await db('users').where({ email }).first();
    if (exists) return res.status(409).json({ error: 'A user with this email already exists' });
    const bcrypt = (await import('bcryptjs')).default;
    const hash = await bcrypt.hash(password || 'ChangeMe123!', 12);
    const allowedRoles = ['CHURCH_ADMIN', 'PASTOR', 'MINISTRY_LEADER', 'FINANCE', 'SECRETARY', 'MEMBER'];
    const finalRole = allowedRoles.includes(role) ? role : 'MEMBER';
    const uid = genId('user');
    await db('users').insert({
      uid,
      email,
      name,
      phone: phone || null,
      role: finalRole,
      status: 'active',
      tenantId: tid(req),
      password: hash,
      createdAt: new Date(),
    });
    await logActivity(req, 'create', 'users', uid, `Created ${finalRole} ${email}`);
    res.status(201).json({ uid, email, name, role: finalRole, status: 'active' });
  } catch (e) {
    console.error('Create church user error:', e);
    res.status(500).json({ error: 'Failed to create user' });
  }
});
router.put('/users/:uid', requireRole('CHURCH_ADMIN'), async (req: AuthRequest, res) => {
  try {
    const existing = await db('users').where({ uid: req.params.uid, tenantId: tid(req) }).first();
    if (!existing) return res.status(404).json({ error: 'User not found' });
    const allowed = ['name', 'phone', 'role', 'status'];
    const updates: any = {};
    for (const k of allowed) if (k in req.body) updates[k] = req.body[k];
    await db('users').where({ uid: req.params.uid, tenantId: tid(req) }).update(updates);
    await logActivity(req, 'update', 'users', req.params.uid);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to update user' });
  }
});
router.delete('/users/:uid', requireRole('CHURCH_ADMIN'), async (req: AuthRequest, res) => {
  try {
    if (req.params.uid === req.user?.uid) return res.status(400).json({ error: 'You cannot delete your own account' });
    const deleted = await db('users').where({ uid: req.params.uid, tenantId: tid(req) }).delete();
    if (!deleted) return res.status(404).json({ error: 'User not found' });
    await logActivity(req, 'delete', 'users', req.params.uid);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

/* ---- Activity / audit log ---- */
router.get('/activity-log', requireRole('CHURCH_ADMIN', 'PASTOR'), async (req: AuthRequest, res) => {
  try {
    const rows = await db('church_activity_log').where({ tenantId: tid(req) }).orderBy('createdAt', 'desc').limit(300);
    res.json({ data: rows });
  } catch (e) {
    res.status(500).json({ error: 'Failed to load activity log' });
  }
});

/* ------------------------------------------------------------------ */
/* SMS bundles: browse platform packages, check balance, purchase, and */
/* review purchase history. Credits are stored on the tenant record.   */
/* ------------------------------------------------------------------ */

// Active SMS packages offered by the platform (readable by any church user).
router.get('/sms/packages', async (_req: AuthRequest, res) => {
  try {
    const rows = await db('sms_packages')
      .where({ active: true })
      .orderBy('price', 'asc')
      .catch(() => []);
    res.json({ data: rows });
  } catch (e) {
    console.error('GET /sms/packages error:', e);
    res.status(500).json({ error: 'Failed to load SMS packages' });
  }
});

// Current SMS credit balance for the church.
router.get('/sms/balance', async (req: AuthRequest, res) => {
  try {
    const tenant = await db('tenants').where({ id: tid(req) }).first();
    res.json({ credits: Number(tenant?.smsCredits || 0) });
  } catch (e) {
    console.error('GET /sms/balance error:', e);
    res.status(500).json({ error: 'Failed to load SMS balance' });
  }
});

// Purchase history for the church.
router.get('/sms/purchases', async (req: AuthRequest, res) => {
  try {
    const rows = await db('sms_purchases')
      .where({ tenantId: tid(req) })
      .orderBy('createdAt', 'desc')
      .catch(() => []);
    res.json({ data: rows });
  } catch (e) {
    console.error('GET /sms/purchases error:', e);
    res.status(500).json({ error: 'Failed to load SMS purchases' });
  }
});

// Purchase an SMS bundle. If a Paystack `reference` is supplied it is verified
// server-side before credits are granted; otherwise the purchase is recorded
// directly (e.g. manual/offline settlement by an admin). Credits are added to
// the tenant balance atomically and the purchase is logged.
/**
 * Start a Paystack payment for an SMS bundle.
 *
 * This is the missing first half of the SMS purchase flow: it creates the
 * Paystack transaction and returns the authorization URL. The browser sends
 * the user there, and on return the resulting `reference` is submitted to
 * POST /sms/purchase, which verifies it before granting credits.
 */
router.post('/sms/purchase/initialize', requireRole('CHURCH_ADMIN', 'PASTOR'), async (req: AuthRequest, res) => {
  try {
    const tenantId = tid(req);
    const { packageId, email, callbackUrl } = req.body || {};
    if (!packageId) return res.status(400).json({ error: 'packageId is required' });

    const pkg = await db('sms_packages').where({ id: packageId, active: true }).first();
    if (!pkg) return res.status(404).json({ error: 'SMS package not found' });

    const paystackSettings = await getTenantSettings(tenantId, 'paystack');
    const secretKey = paystackSettings.secretKey;
    if (!isPaystackConfigured(secretKey)) {
      return res.status(503).json({
        error: 'Paystack is not configured. Add your Paystack secret key in church settings.',
      });
    }

    const payerEmail = email || (req as any).dbUser?.email;
    if (!payerEmail) return res.status(400).json({ error: 'A payer email is required by Paystack' });

    const reference = genId('sms');
    const data = await initializeTransaction({
      secretKey,
      email: payerEmail,
      amount: Number(pkg.price || 0),
      reference,
      currency: pkg.currency || 'GHS',
      callback_url: callbackUrl,
      metadata: { tenantId, packageId: pkg.id, credits: Number(pkg.credits || 0), purpose: 'sms_bundle' },
    });

    res.json({
      authorizationUrl: data?.authorization_url,
      reference,
      accessCode: data?.access_code,
      amount: Number(pkg.price || 0),
      credits: Number(pkg.credits || 0),
    });
  } catch (error) {
    console.error('SMS purchase initialize error:', error);
    res.status(502).json({ error: 'Failed to initialize payment with Paystack' });
  }
});

router.post('/sms/purchase', requireRole('CHURCH_ADMIN', 'PASTOR'), async (req: AuthRequest, res) => {
  try {
    const tenantId = tid(req);
    const { packageId, reference } = req.body || {};
    if (!packageId) return res.status(400).json({ error: 'packageId is required' });

    const pkg = await db('sms_packages').where({ id: packageId, active: true }).first();
    if (!pkg) return res.status(404).json({ error: 'SMS package not found' });

    const tenant = await db('tenants').where({ id: tenantId }).first();

    const paystackSettings = await getTenantSettings(tenantId, 'paystack');
    const paystackReady = isPaystackConfigured(paystackSettings.secretKey);
    const price = Number(pkg.price || 0);

    /*
     * SECURITY: `reference` used to be optional. A POST carrying only a
     * packageId therefore recorded the purchase as 'completed' and credited
     * the church WITHOUT any payment at all -- any church admin or pastor
     * could mint unlimited SMS credits. Payment is now mandatory for any
     * priced package whenever Paystack is configured.
     */
    if (price > 0 && !reference) {
      if (!paystackReady) {
        return res.status(503).json({
          error: 'Paystack is not configured, so paid SMS bundles cannot be purchased. Add your Paystack secret key in church settings.',
        });
      }
      return res.status(402).json({
        error: 'Payment is required. Start the purchase at /sms/purchase/initialize and submit the returned reference.',
      });
    }

    const status = 'completed';
    if (reference) {
      // Replay guard: a reference may only be redeemed once. Without this, a
      // single real payment could be submitted repeatedly for more credits.
      const alreadyRedeemed = await db('sms_purchases').where({ reference }).first();
      if (alreadyRedeemed) {
        return res.status(409).json({ error: 'This payment reference has already been redeemed.' });
      }

      try {
        const verification: any = await verifyTransaction(reference, paystackSettings.secretKey);
        const ok = verification?.status === true || verification?.data?.status === 'success';
        if (!ok) {
          return res.status(402).json({ error: 'Payment could not be verified' });
        }

        // Confirm the amount actually paid covers the package price. Paystack
        // reports amounts in the minor unit (pesewas), hence the x100.
        const paidMinor = Number(verification?.data?.amount ?? 0);
        if (paidMinor > 0 && paidMinor < Math.round(price * 100)) {
          return res.status(402).json({ error: 'The amount paid does not cover the price of this SMS bundle.' });
        }
      } catch (verr) {
        console.error('SMS purchase verification error:', verr);
        return res.status(402).json({ error: 'Payment verification failed' });
      }
    }

    const credits = Number(pkg.credits || 0);
    const newBalance = Number(tenant?.smsCredits || 0) + credits;

    // Persist the purchase and update the balance in a single transaction so a
    // failure never leaves credits granted without a purchase record (or vice
    // versa).
    await db.transaction(async (trx) => {
      await trx('sms_purchases').insert({
        packageId: pkg.id,
        packageName: pkg.name,
        credits,
        tenantId,
        tenantName: tenant?.name || null,
        amount: Number(pkg.price || 0),
        currency: pkg.currency || 'GHS',
        status,
        reference: reference || null,
        createdAt: new Date(),
      });
      await trx('tenants').where({ id: tenantId }).update({ smsCredits: newBalance });
    });

    await logActivity(req, 'purchase', 'sms_purchases', pkg.id, `${credits} credits`);

    res.status(201).json({ success: true, credits: newBalance, creditsAdded: credits, status });
  } catch (e) {
    console.error('POST /sms/purchase error:', e);
    res.status(500).json({ error: 'Failed to complete SMS purchase' });
  }
});

/* ------------------------------------------------------------------ */
/* Attendance: QR, manual roll call, biometric devices                */
/* ------------------------------------------------------------------ */

/**
 * Taking attendance is not an admin-only job: the secretary, the pastor on
 * duty and a ministry leader running a group meeting all need it.
 */
const ATTENDANCE_ROLES = ['CHURCH_ADMIN', 'PASTOR', 'SECRETARY', 'MINISTRY_LEADER'];

/** Members who should appear on a roll call. */
function rollCallMembersQuery(tenantId: string) {
  return db('members')
    .where({ tenantId })
    // People who died or transferred out should not be listed week after week.
    .where((qb: any) =>
      qb.whereNull('membershipStatus').orWhereNotIn('membershipStatus', ['deceased', 'transferred']),
    )
    .select('id', 'firstName', 'lastName', 'membershipId', 'groupName')
    .orderBy(['firstName', 'lastName']);
}

/**
 * Why a code cannot be shown yet, in words a steward can act on.
 */
function qrWindowMessage(
  reason: 'not_started' | 'ended' | 'no_schedule',
  startsAt?: Date,
  endsAt?: Date,
): string {
  if (reason === 'no_schedule') {
    return 'This event has no start time, so attendance cannot be opened. Set its date and time first.';
  }
  if (reason === 'not_started') {
    return `This event has not started yet. The code becomes active at ${startsAt ? startsAt.toLocaleString() : 'the start time'}.`;
  }
  return `This event ended at ${endsAt ? endsAt.toLocaleString() : 'its end time'}, so its code no longer works.`;
}

/** The window, shaped for the display screen. */
function qrWindowPayload(event: any) {
  const window = eventAttendanceWindow(event);
  return {
    startsAt: window ? window.startsAt.toISOString() : null,
    endsAt: window ? window.endsAt.toISOString() : null,
  };
}

/**
 * Issue or rotate an event's QR token.
 *
 * Rotation is the point: the displayed code changes every few minutes so a
 * screenshot forwarded to someone sitting at home stops working. On top of
 * that, a code only exists while the event is actually running.
 */
router.post('/events/:id/qr', requireRole(...ATTENDANCE_ROLES), async (req: AuthRequest, res) => {
  try {
    const tenantId = tid(req);
    const event = await db('events').where({ id: req.params.id, tenantId }).first();
    if (!event) return res.status(404).json({ error: 'Event not found' });

    // Outside the service window there is nothing to issue. Refusing here,
    // rather than only at scan time, keeps a code that cannot work from being
    // printed and handed to a steward.
    const window = checkEventQrWindow(event);
    if (!window.ok) {
      return res.status(409).json({
        error: qrWindowMessage(window.reason, window.startsAt, window.endsAt),
        reason: window.reason,
        active: false,
        ...qrWindowPayload(event),
      });
    }

    const { token, expiresAt } = generateQrToken();
    await db('events')
      .where({ id: event.id, tenantId })
      .update({ qrToken: token, qrTokenExpiresAt: expiresAt });

    res.json({
      eventId: event.id,
      eventTitle: event.title,
      payload: buildQrPayload(event.id, token),
      expiresAt,
      ttlMinutes: QR_TOKEN_TTL_MINUTES,
      active: true,
      ...qrWindowPayload(event),
    });
  } catch (error) {
    console.error('POST /events/:id/qr error:', error);
    res.status(500).json({ error: 'Failed to issue an attendance QR code' });
  }
});

/**
 * Fetch the current QR token, issuing a fresh one when it is missing or has
 * expired, so the display screen can simply poll this endpoint.
 */
router.get('/events/:id/qr', requireRole(...ATTENDANCE_ROLES), async (req: AuthRequest, res) => {
  try {
    const tenantId = tid(req);
    const event = await db('events').where({ id: req.params.id, tenantId }).first();
    if (!event) return res.status(404).json({ error: 'Event not found' });

    // The display screen polls this endpoint, so it is told plainly whether
    // the window is open instead of being handed a code that cannot be used.
    const window = checkEventQrWindow(event);
    if (!window.ok) {
      return res.json({
        eventId: event.id,
        eventTitle: event.title,
        active: false,
        reason: window.reason,
        message: qrWindowMessage(window.reason, window.startsAt, window.endsAt),
        ttlMinutes: QR_TOKEN_TTL_MINUTES,
        ...qrWindowPayload(event),
      });
    }

    let token = event.qrToken;
    let expiresAt = event.qrTokenExpiresAt;

    if (!checkQrToken(event, token || '').ok) {
      const issued = generateQrToken();
      token = issued.token;
      expiresAt = issued.expiresAt;
      await db('events')
        .where({ id: event.id, tenantId })
        .update({ qrToken: token, qrTokenExpiresAt: expiresAt });
    }

    res.json({
      eventId: event.id,
      eventTitle: event.title,
      payload: buildQrPayload(event.id, token),
      expiresAt,
      ttlMinutes: QR_TOKEN_TTL_MINUTES,
      active: true,
      ...qrWindowPayload(event),
    });
  } catch (error) {
    console.error('GET /events/:id/qr error:', error);
    res.status(500).json({ error: 'Failed to load the attendance QR code' });
  }
});

/**
 * Roll call for an event: every member, with whoever has already been marked.
 */
router.get('/events/:id/rollcall', requireRole(...ATTENDANCE_ROLES), async (req: AuthRequest, res) => {
  try {
    const tenantId = tid(req);
    const event = await db('events').where({ id: req.params.id, tenantId }).first();
    if (!event) return res.status(404).json({ error: 'Event not found' });

    const [members, rows] = await Promise.all([
      rollCallMembersQuery(tenantId),
      db('event_attendance').where({ tenantId, eventId: event.id }),
    ]);

    const membersById = new Map<string, any>((members as any[]).map((m) => [m.id, m]));

    // The panel shows one name per row, so the register is joined up here
    // rather than leaving the client to guess at first/last name ordering.
    // Without this the sheet rendered a column of blank names.
    const entries = buildRollCall(members as any[], rows as any[]).map((e) => ({
      ...e,
      name:
        [e.firstName, e.lastName].filter(Boolean).join(' ').trim()
        || e.membershipId
        || 'Unnamed member',
      // Roll call is usually taken group by group, so the group travels with
      // the row and can be used to filter the sheet.
      groupName: (membersById.get(e.memberId) || {}).groupName || null,
    }));
    res.json({
      event: { id: event.id, title: event.title, startTime: event.startTime },
      // `entries` is what the roll call panel reads. `data` is kept for the
      // generic unwrap helper used elsewhere in the client.
      entries,
      data: entries,
      summary: summarizeRollCall(entries),
    });
  } catch (error) {
    console.error('GET /events/:id/rollcall error:', error);
    res.status(500).json({ error: 'Failed to load the roll call' });
  }
});

/**
 * Record a manual roll call.
 *
 * Accepts a batch so the secretary can tick a whole list and save once. Marks
 * are upserted, meaning a correction overwrites the earlier mark instead of
 * adding a second conflicting row.
 */
router.post('/events/:id/rollcall', requireRole(...ATTENDANCE_ROLES), async (req: AuthRequest, res) => {
  try {
    const tenantId = tid(req);
    const event = await db('events').where({ id: req.params.id, tenantId }).first();
    if (!event) return res.status(404).json({ error: 'Event not found' });

    const entries = Array.isArray(req.body?.entries) ? req.body.entries : null;
    if (!entries || entries.length === 0) {
      return res.status(400).json({ error: 'entries must be a non-empty array' });
    }
    if (entries.length > 5000) {
      return res.status(413).json({ error: 'Too many entries in one request' });
    }

    // Only accept ids that belong to this church, so a crafted request cannot
    // write attendance rows against another tenant's members.
    const validIds = new Set(
      (await db('members').where({ tenantId }).select('id')).map((m: any) => String(m.id)),
    );

    const markedBy = req.user?.uid || null;
    const now = new Date();
    let updated = 0;
    let inserted = 0;
    const skipped: string[] = [];

    await db.transaction(async (trx) => {
      for (const entry of entries) {
        const memberId = String(entry?.memberId || '');
        if (!memberId || !validIds.has(memberId)) {
          if (memberId) skipped.push(memberId);
          continue;
        }

        const present = normalizePresent(entry?.present);
        const existing = await trx('event_attendance')
          .where({ tenantId, eventId: event.id, memberId })
          .first();

        const values = {
          present,
          method: 'manual',
          status: present ? 'checked_in' : 'absent',
          checkedInBy: markedBy,
          checkInAt: present ? now : null,
        };

        if (existing) {
          await trx('event_attendance').where({ id: existing.id }).update(values);
          updated += 1;
        } else {
          await trx('event_attendance').insert({
            tenantId,
            eventId: event.id,
            memberId,
            createdAt: now,
            ...values,
          });
          inserted += 1;
        }
      }
    });

    const [members, rows] = await Promise.all([
      rollCallMembersQuery(tenantId),
      db('event_attendance').where({ tenantId, eventId: event.id }),
    ]);
    const merged = buildRollCall(members as any[], rows as any[]);

    res.json({
      success: true,
      inserted,
      updated,
      skipped,
      summary: summarizeRollCall(merged),
    });
  } catch (error) {
    console.error('POST /events/:id/rollcall error:', error);
    res.status(500).json({ error: 'Failed to save the roll call' });
  }
});

/* ---- Biometric devices (ZKTeco) ---- */

/** Registered devices. The stored key hash is never returned. */
router.get('/biometric/devices', requireRole('CHURCH_ADMIN', 'PASTOR'), async (req: AuthRequest, res) => {
  try {
    const devices = await db('biometric_devices')
      .where({ tenantId: tid(req) })
      .select('id', 'name', 'serialNumber', 'location', 'active', 'lastSeenAt', 'createdAt')
      .orderBy('createdAt', 'desc');
    res.json({ data: devices });
  } catch (error) {
    console.error('GET /biometric/devices error:', error);
    res.status(500).json({ error: 'Failed to load biometric devices' });
  }
});

/**
 * Register a device and return its API key.
 *
 * The key is shown exactly once and only its hash is stored, so a leaked
 * database does not hand over the ability to post fake attendance.
 */
router.post('/biometric/devices', requireRole('CHURCH_ADMIN'), async (req: AuthRequest, res) => {
  try {
    const tenantId = tid(req);
    const { name, serialNumber, location } = req.body || {};
    if (!name) return res.status(400).json({ error: 'name is required' });

    const { apiKey, apiKeyHash } = generateDeviceApiKey();
    const id = genId('dev');
    await db('biometric_devices').insert({
      id,
      tenantId,
      name: String(name).trim(),
      serialNumber: serialNumber ? String(serialNumber).trim() : null,
      location: location ? String(location).trim() : null,
      apiKeyHash,
      active: true,
      createdAt: new Date(),
    });

    res.status(201).json({
      id,
      name,
      serialNumber: serialNumber || null,
      location: location || null,
      apiKey,
      notice: 'Copy this key into the device now. It cannot be shown again.',
    });
  } catch (error) {
    console.error('POST /biometric/devices error:', error);
    res.status(500).json({ error: 'Failed to register the device' });
  }
});

/** Rotate a device key, for when a device is lost or replaced. */
router.post('/biometric/devices/:id/rotate-key', requireRole('CHURCH_ADMIN'), async (req: AuthRequest, res) => {
  try {
    const tenantId = tid(req);
    const device = await db('biometric_devices').where({ id: req.params.id, tenantId }).first();
    if (!device) return res.status(404).json({ error: 'Device not found' });

    const { apiKey, apiKeyHash } = generateDeviceApiKey();
    await db('biometric_devices').where({ id: device.id, tenantId }).update({ apiKeyHash });
    res.json({
      id: device.id,
      apiKey,
      notice: 'The previous key stopped working immediately.',
    });
  } catch (error) {
    console.error('POST /biometric/devices/:id/rotate-key error:', error);
    res.status(500).json({ error: 'Failed to rotate the device key' });
  }
});

router.put('/biometric/devices/:id', requireRole('CHURCH_ADMIN'), async (req: AuthRequest, res) => {
  try {
    const tenantId = tid(req);
    const { name, serialNumber, location, active } = req.body || {};
    const patch: any = {};
    if (name !== undefined) patch.name = String(name).trim();
    if (serialNumber !== undefined) patch.serialNumber = serialNumber ? String(serialNumber).trim() : null;
    if (location !== undefined) patch.location = location ? String(location).trim() : null;
    if (active !== undefined) patch.active = normalizePresent(active);

    const updated = await db('biometric_devices').where({ id: req.params.id, tenantId }).update(patch);
    if (!updated) return res.status(404).json({ error: 'Device not found' });
    res.json({ success: true });
  } catch (error) {
    console.error('PUT /biometric/devices/:id error:', error);
    res.status(500).json({ error: 'Failed to update the device' });
  }
});

router.delete('/biometric/devices/:id', requireRole('CHURCH_ADMIN'), async (req: AuthRequest, res) => {
  try {
    const deleted = await db('biometric_devices')
      .where({ id: req.params.id, tenantId: tid(req) })
      .delete();
    if (!deleted) return res.status(404).json({ error: 'Device not found' });
    res.json({ success: true });
  } catch (error) {
    console.error('DELETE /biometric/devices/:id error:', error);
    res.status(500).json({ error: 'Failed to remove the device' });
  }
});

/**
 * Recent device punches, newest first.
 *
 * `?status=unmatched` lists fingerprints the system could not tie to a member,
 * which is how an operator finds enrolments that were never linked.
 */
router.get('/biometric/punches', requireRole('CHURCH_ADMIN', 'PASTOR', 'SECRETARY'), async (req: AuthRequest, res) => {
  try {
    const tenantId = tid(req);
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    let q = db('biometric_punches').where({ tenantId });
    if (req.query.status) q = q.where({ status: String(req.query.status) });
    const rows = await q.orderBy('punchedAt', 'desc').limit(limit);
    res.json({ data: rows, total: rows.length });
  } catch (error) {
    console.error('GET /biometric/punches error:', error);
    res.status(500).json({ error: 'Failed to load device punches' });
  }
});

/** Link a member to a fingerprint id enrolled on the device. */
router.post('/members/:id/biometric', requireRole('CHURCH_ADMIN', 'PASTOR', 'SECRETARY'), async (req: AuthRequest, res) => {
  try {
    const tenantId = tid(req);
    const { biometricId } = req.body || {};
    const value = biometricId === null || biometricId === '' ? null : String(biometricId).trim();

    // The same finger cannot belong to two members, or attendance would be
    // credited to whichever row happened to be found first.
    if (value) {
      const clash = await db('members')
        .where({ tenantId, biometricId: value })
        .whereNot({ id: req.params.id })
        .first();
      if (clash) {
        return res.status(409).json({
          error: `That biometric id is already assigned to ${clash.firstName || ''} ${clash.lastName || ''}`.trim(),
        });
      }
    }

    const updated = await db('members')
      .where({ id: req.params.id, tenantId })
      .update({ biometricId: value });
    if (!updated) return res.status(404).json({ error: 'Member not found' });
    res.json({ success: true, biometricId: value });
  } catch (error) {
    console.error('POST /members/:id/biometric error:', error);
    res.status(500).json({ error: 'Failed to link the biometric id' });
  }
});


/* ================================================================== */
/* Church-defined finance purposes (feature: user-added purposes)      */
/* ================================================================== */

/**
 * Purposes used to be a hard-coded list in the finance screen, so a church
 * could not record a gift for anything the developers had not thought of.
 * They are now rows a church owns, and the finance form lets a user type a new
 * one while recording money.
 */
const DEFAULT_FINANCE_PURPOSES = [
  'Tithe',
  'Offering',
  'Welfare',
  'Donation',
  'Building Fund',
  'Missions',
];

registerCrud('/finance-purposes', 'finance_purposes', {
  idPrefix: 'fpp',
  fields: ['name', 'category', 'description', 'active'],
  filterFields: ['category', 'active'],
  orderBy: 'name',
  writeRoles: ['CHURCH_ADMIN', 'PASTOR', 'FINANCE'],
  validate: (body) => {
    const name = String(body?.name || '').trim();
    if (!name) return 'A purpose name is required.';
    if (name.length > 60) return 'A purpose name cannot be longer than 60 characters.';
    return null;
  },
});

/**
 * The list the finance form shows: the church's own purposes, plus the common
 * defaults for a church that has not defined any yet. Duplicates are removed
 * case-insensitively so "Tithe" and "tithe" never appear twice.
 */
router.get('/finance-purposes/options', async (req: AuthRequest, res) => {
  try {
    const category = req.query.category ? String(req.query.category) : null;
    let q = db('finance_purposes').where({ tenantId: tid(req) });
    if (category) q = q.where((b) => b.where('category', category).orWhereNull('category'));
    const rows = await q.orderBy('name', 'asc').catch(() => [] as any[]);
    const custom = rows.filter((r: any) => r.active !== false).map((r: any) => String(r.name));
    const seen = new Set<string>();
    const options: string[] = [];
    for (const name of [...custom, ...DEFAULT_FINANCE_PURPOSES]) {
      const key = name.trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      options.push(name.trim());
    }
    res.json({ data: options, custom });
  } catch (e) {
    console.error('GET /finance-purposes/options error:', e);
    res.json({ data: DEFAULT_FINANCE_PURPOSES, custom: [] });
  }
});

/**
 * Records a purpose typed straight into the giving/pledge form so it is
 * offered next time. Idempotent: re-saving an existing name is a no-op.
 */
router.post('/finance-purposes/remember', requireRole('CHURCH_ADMIN', 'PASTOR', 'MINISTRY_LEADER', 'FINANCE'), async (req: AuthRequest, res) => {
  try {
    const name = String(req.body?.name || '').trim();
    const category = String(req.body?.category || 'giving');
    if (!name) return res.status(400).json({ error: 'A purpose name is required.' });
    if (name.length > 60) return res.status(400).json({ error: 'A purpose name cannot be longer than 60 characters.' });
    if (DEFAULT_FINANCE_PURPOSES.some((p) => p.toLowerCase() === name.toLowerCase())) {
      return res.json({ success: true, existing: true });
    }
    const existing = await db('finance_purposes')
      .where({ tenantId: tid(req) })
      .whereRaw('LOWER(name) = ?', [name.toLowerCase()])
      .first();
    if (existing) return res.json({ success: true, existing: true });
    const row = {
      id: genId('fpp'),
      tenantId: tid(req),
      name,
      category,
      active: true,
      createdBy: req.user?.uid || null,
      createdAt: new Date(),
    };
    await db('finance_purposes').insert(row);
    res.status(201).json({ success: true, data: row });
  } catch (e) {
    console.error('POST /finance-purposes/remember error:', e);
    res.status(500).json({ error: 'Failed to save that purpose' });
  }
});

/* ================================================================== */
/* Inventory categories typed by the church                            */
/* ================================================================== */

const DEFAULT_INVENTORY_CATEGORIES = [
  'Equipment',
  'Instruments',
  'Furniture',
  'Electronics',
  'Vehicles',
];

router.get('/inventory-categories', async (req: AuthRequest, res) => {
  try {
    // Categories come from two places: ones deliberately saved, and ones
    // already in use on existing items, so nothing a church typed is lost.
    const [saved, used] = await Promise.all([
      db('inventory_categories').where({ tenantId: tid(req) }).orderBy('name').catch(() => [] as any[]),
      db('inventory').where({ tenantId: tid(req) }).distinct('category').catch(() => [] as any[]),
    ]);
    const seen = new Set<string>();
    const options: string[] = [];
    const push = (value: unknown) => {
      const name = String(value || '').trim();
      const key = name.toLowerCase();
      if (!name || seen.has(key)) return;
      seen.add(key);
      options.push(name);
    };
    saved.forEach((r: any) => push(r.name));
    used.forEach((r: any) => push(r.category));
    DEFAULT_INVENTORY_CATEGORIES.forEach(push);
    res.json({ data: options });
  } catch (e) {
    console.error('GET /inventory-categories error:', e);
    res.json({ data: DEFAULT_INVENTORY_CATEGORIES });
  }
});

router.post('/inventory-categories', requireRole('CHURCH_ADMIN', 'PASTOR', 'MINISTRY_LEADER'), async (req: AuthRequest, res) => {
  try {
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'A category name is required.' });
    if (name.length > 60) return res.status(400).json({ error: 'A category name cannot be longer than 60 characters.' });
    const existing = await db('inventory_categories')
      .where({ tenantId: tid(req) })
      .whereRaw('LOWER(name) = ?', [name.toLowerCase()])
      .first();
    if (existing) return res.json({ success: true, existing: true });
    await db('inventory_categories').insert({
      id: genId('invcat'),
      tenantId: tid(req),
      name,
      createdAt: new Date(),
    });
    res.status(201).json({ success: true, name });
  } catch (e) {
    console.error('POST /inventory-categories error:', e);
    res.status(500).json({ error: 'Failed to save that category' });
  }
});

/* ================================================================== */
/* Member engagement: active / inactive / backslider                   */
/* ================================================================== */

/** Church-tunable thresholds, stored in the church's 'engagement' settings. */
async function engagementThresholds(tenantId: string) {
  const saved = await getTenantSettings(tenantId, 'engagement');
  return resolveThresholds(saved);
}

/**
 * Loads every member with their attendance facts and classifies them.
 *
 * Attendance is aggregated in SQL (two grouped queries, not one per member) so
 * this stays a couple of queries regardless of church size.
 */
async function computeEngagement(tenantId: string) {
  const thresholds = await engagementThresholds(tenantId);
  const now = new Date();
  const windowStart = new Date(now.getTime() - thresholds.windowDays * 86400000);

  const cols = await memberColumns();
  const members = await db('members').where({ tenantId }).select(cols);

  const [totals, windowed] = await Promise.all([
    db('event_attendance')
      .where({ tenantId })
      .whereNotNull('memberId')
      .select('memberId')
      .max('checkInAt as lastAt')
      .count('id as total')
      .groupBy('memberId'),
    db('event_attendance')
      .where({ tenantId })
      .whereNotNull('memberId')
      .where('checkInAt', '>=', windowStart)
      .select('memberId')
      .count('id as recent')
      .groupBy('memberId'),
  ]);

  const lastByMember = new Map<string, { lastAt: any; total: number }>();
  totals.forEach((r: any) => lastByMember.set(String(r.memberId), { lastAt: r.lastAt, total: Number(r.total || 0) }));
  const recentByMember = new Map<string, number>();
  windowed.forEach((r: any) => recentByMember.set(String(r.memberId), Number(r.recent || 0)));

  const results = members.map((m: any) => {
    const agg = lastByMember.get(String(m.id));
    const classified = classifyMember(
      {
        lastAttendedAt: agg?.lastAt || null,
        attendancesInWindow: recentByMember.get(String(m.id)) || 0,
        joinDate: m.joinDate || m.createdAt || null,
      },
      thresholds,
      now,
    );
    // An admin can pin a label (e.g. a member away on a long trip), and the
    // automatic result must not silently override that decision.
    const locked = Boolean(m.engagementLocked);
    return {
      id: m.id,
      firstName: m.firstName,
      lastName: m.lastName,
      name: `${m.firstName || ''} ${m.lastName || ''}`.trim(),
      email: m.email,
      phone: m.phone,
      membershipStatus: m.membershipStatus,
      engagementStatus: locked ? m.engagementStatus || classified.status : classified.status,
      engagementLocked: locked,
      computedStatus: classified.status,
      reason: locked ? m.engagementReason || classified.reason : classified.reason,
      lastAttendanceAt: agg?.lastAt || null,
      daysSinceLastAttendance: classified.daysSinceLastAttendance,
      attendancesInWindow: classified.attendancesInWindow,
      totalAttendances: agg?.total || 0,
    };
  });

  return { thresholds, results };
}

/** Engagement breakdown for the whole church. */
router.get('/members/engagement', requireRole('CHURCH_ADMIN', 'PASTOR', 'MINISTRY_LEADER', 'SECRETARY'), async (req: AuthRequest, res) => {
  try {
    const { thresholds, results } = await computeEngagement(tid(req));
    const status = req.query.status ? String(req.query.status) : 'all';
    const filtered = status === 'all' ? results : results.filter((r) => r.engagementStatus === status);
    const summary = results.reduce(
      (acc: Record<string, number>, r) => {
        acc[r.engagementStatus] = (acc[r.engagementStatus] || 0) + 1;
        return acc;
      },
      { active: 0, inactive: 0, backslider: 0, new: 0 },
    );
    res.json({ data: filtered, summary, thresholds, total: results.length });
  } catch (e) {
    console.error('GET /members/engagement error:', e);
    res.status(500).json({ error: 'Failed to work out member engagement' });
  }
});

/** Writes the computed labels onto the member records. */
router.post('/members/engagement/recalculate', requireRole('CHURCH_ADMIN', 'PASTOR'), async (req: AuthRequest, res) => {
  try {
    const tenantId = tid(req);
    const { results } = await computeEngagement(tenantId);
    const now = new Date();
    let updated = 0;
    // Chunked so a large church does not build one enormous transaction.
    for (const r of results) {
      if (r.engagementLocked) continue;
      await db('members').where({ id: r.id, tenantId }).update({
        engagementStatus: r.computedStatus,
        engagementReason: r.reason,
        engagementUpdatedAt: now,
        lastAttendanceAt: r.lastAttendanceAt || null,
        attendanceCount: r.totalAttendances,
      });
      updated += 1;

      // Backsliding and restoration are both changes of standing, and both are
      // recorded here as they are noticed. Only the crossing is recorded, never
      // the fact of still being in a state, so running the recalculation twice
      // cannot count anyone twice.
      //
      // Restoration is deliberately the transition backslider -> active, not the
      // state of being active: counting everyone who is active now would report
      // most of the church as rehabilitated every period.
      if (r.computedStatus !== r.engagementStatus
        && (r.computedStatus === 'backslider'
          || (r.computedStatus === 'active' && r.engagementStatus === 'backslider'))) {
        const member = await db('members').where({ id: r.id, tenantId }).first();
        await recordStatusChange(
          tenantId!,
          member,
          'engagement',
          r.engagementStatus || null,
          r.computedStatus,
          req.user?.uid,
          now,
        );
      }
    }
    await logActivity(req, 'recalculate', 'member_engagement', undefined, `${updated} member(s)`);
    res.json({ success: true, updated });
  } catch (e) {
    console.error('POST /members/engagement/recalculate error:', e);
    res.status(500).json({ error: 'Failed to update member engagement' });
  }
});

/** Manual override: an admin describes a member directly. */
router.put('/members/:id/engagement', requireRole('CHURCH_ADMIN', 'PASTOR'), async (req: AuthRequest, res) => {
  try {
    const allowed = ['active', 'inactive', 'backslider', 'new'];
    const status = String(req.body?.engagementStatus || '').toLowerCase();
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: `Status must be one of: ${allowed.join(', ')}.` });
    }
    const updated = await db('members')
      .where({ id: req.params.id, tenantId: tid(req) })
      .update({
        engagementStatus: status,
        engagementReason: req.body?.reason ? String(req.body.reason).slice(0, 250) : 'Set manually by a church administrator.',
        // Locking by default is the point of a manual override: the next
        // recalculation must not undo the admin's decision.
        engagementLocked: req.body?.lock === false ? false : true,
        engagementUpdatedAt: new Date(),
      });
    if (!updated) return res.status(404).json({ error: 'Member not found' });
    await logActivity(req, 'update', 'member_engagement', req.params.id, status);
    res.json({ success: true, engagementStatus: status });
  } catch (e) {
    console.error('PUT /members/:id/engagement error:', e);
    res.status(500).json({ error: 'Failed to update that member' });
  }
});

/* ================================================================== */
/* Absence follow-up questionnaires                                    */
/* ================================================================== */

/** Public base URL used to build the questionnaire link. */
function publicBaseUrl(req: AuthRequest): string {
  const configured = process.env.APP_URL || process.env.PUBLIC_URL;
  if (configured) return String(configured).replace(/\/+$/, '');
  const proto = (req.headers['x-forwarded-proto'] as string) || (req as any).protocol || 'https';
  return `${proto}://${req.headers.host}`;
}

/** Long random token: this link is the only credential the member needs. */
const surveyToken = () =>
  `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;

/** Follow-ups already sent, newest first. */
router.get('/absence/surveys', requireRole('CHURCH_ADMIN', 'PASTOR', 'MINISTRY_LEADER', 'SECRETARY'), async (req: AuthRequest, res) => {
  try {
    const status = req.query.status ? String(req.query.status) : 'all';
    let q = db('absence_surveys').where({ tenantId: tid(req) });
    if (status !== 'all') q = q.where('status', status);
    const rows = await q.orderBy('createdAt', 'desc').limit(500);
    const summary = {
      sent: rows.length,
      responded: rows.filter((r: any) => r.status === 'responded').length,
      awaiting: rows.filter((r: any) => r.status !== 'responded').length,
    };
    res.json({ data: rows, summary });
  } catch (e) {
    console.error('GET /absence/surveys error:', e);
    res.status(500).json({ error: 'Failed to load absence follow-ups' });
  }
});

/**
 * Sends the absence questionnaire.
 *
 * Two ways to choose who gets it:
 *  - `eventId`   : everyone who was not checked in at that service
 *  - otherwise   : members classified inactive or backslider by attendance
 *
 * Each recipient gets an SMS and an email carrying a unique link. Send
 * failures are recorded per-recipient rather than aborting the whole batch, so
 * one bad phone number cannot stop the rest.
 */
router.post('/absence/surveys/send', requireRole('CHURCH_ADMIN', 'PASTOR', 'SECRETARY'), async (req: AuthRequest, res) => {
  try {
    const tenantId = tid(req);
    const { eventId, memberIds } = req.body || {};

    const cols = await memberColumns();
    let targets: any[] = [];
    let event: any = null;

    if (Array.isArray(memberIds) && memberIds.length > 0) {
      targets = await db('members').where({ tenantId }).whereIn('id', memberIds.map(String)).select(cols);
    } else if (eventId) {
      event = await db('events').where({ id: String(eventId), tenantId }).first();
      if (!event) return res.status(404).json({ error: 'Event not found' });
      const present = await db('event_attendance')
        .where({ tenantId, eventId: event.id })
        .whereNotNull('memberId')
        .pluck('memberId');
      const q = db('members').where({ tenantId }).select(cols);
      if (present.length > 0) q.whereNotIn('id', present.map(String));
      targets = await q;
    } else {
      const { results } = await computeEngagement(tenantId);
      const absentees = results.filter((r) => shouldFollowUp({
        status: r.engagementStatus as any,
        daysSinceLastAttendance: r.daysSinceLastAttendance,
        attendancesInWindow: r.attendancesInWindow,
        reason: r.reason,
      }));
      if (absentees.length === 0) {
        return res.json({ success: true, sent: 0, skipped: 0, message: 'No members are currently absent enough to follow up.' });
      }
      targets = await db('members').where({ tenantId }).whereIn('id', absentees.map((a) => a.id)).select(cols);
    }

    if (targets.length === 0) {
      return res.json({ success: true, sent: 0, skipped: 0, message: 'Nobody matched, so no messages were sent.' });
    }
    if (targets.length > 1000) {
      return res.status(413).json({ error: 'Too many recipients for one batch. Narrow the selection and try again.' });
    }

    const tenant = await db('tenants').where({ id: tenantId }).first();
    const churchName = tenant?.name || 'your church';
    const smsConfig = await getPlatformSettings('sms');
    const emailConfig = await getEmailConfig();
    const base = publicBaseUrl(req);
    const expiresAt = new Date(Date.now() + 30 * 86400000);

    let sent = 0;
    let skipped = 0;
    const details: any[] = [];

    for (const m of targets) {
      const phone = m.phone ? String(m.phone).trim() : '';
      const email = m.email ? String(m.email).trim() : '';
      if (!phone && !email) {
        skipped += 1;
        details.push({ memberId: m.id, skipped: 'No phone number or email address on file.' });
        continue;
      }

      const token = surveyToken();
      const link = `${base}/absence-survey/${token}`;
      const name = `${m.firstName || ''} ${m.lastName || ''}`.trim() || 'Beloved';
      const message =
        `Hello ${m.firstName || name}, we missed you at ${churchName}` +
        `${event?.title ? ` (${event.title})` : ''}. Please tell us why in one minute: ${link}`;

      let smsStatus = 'not_sent';
      if (phone) {
        const smsResult = await sendSMS(phone, message, {
          apiKey: smsConfig.apiKey,
          senderId: smsConfig.senderId,
        });
        smsStatus = smsResult?.success ? 'sent' : 'failed';
      }

      let emailStatus = 'not_sent';
      if (email) {
        const emailResult = await sendEmail({
          to: email,
          subject: `We missed you at ${churchName}`,
          html: emailTemplate({
            title: `We missed you, ${m.firstName || name}`,
            body:
              `<p>We noticed you were not with us${event?.title ? ` at <b>${event.title}</b>` : ' recently'} and we want to check in on you.</p>` +
              '<p>Would you take a moment to tell us the reason? It goes straight to the pastoral team, and it helps us know how to support you.</p>',
            ctaLabel: 'Tell us why',
            ctaUrl: link,
            footer: `Sent by ${churchName}.`,
          }),
          config: emailConfig,
        });
        emailStatus = emailResult.success ? 'sent' : 'failed';
      }

      await db('absence_surveys').insert({
        id: genId('abs'),
        tenantId,
        memberId: m.id,
        memberName: name,
        eventId: event?.id || null,
        eventName: event?.title || null,
        token,
        status: 'sent',
        smsStatus,
        emailStatus,
        phone: phone || null,
        email: email || null,
        sentAt: new Date(),
        expiresAt,
        createdBy: req.user?.uid || null,
        createdAt: new Date(),
      });

      // Log to the communications trail the church already reviews.
      try {
        await db('communications_log').insert({
          tenantId,
          channel: phone ? 'sms' : 'email',
          recipient: phone || email,
          subject: 'Absence follow-up',
          message,
          status: smsStatus === 'sent' || emailStatus === 'sent' ? 'sent' : 'failed',
          sentBy: req.user?.uid || null,
          createdAt: new Date(),
        });
      } catch { /* non-fatal */ }

      if (smsStatus === 'sent' || emailStatus === 'sent') sent += 1;
      else skipped += 1;
      details.push({ memberId: m.id, name, smsStatus, emailStatus });
    }

    await logActivity(req, 'send', 'absence_surveys', event?.id, `${sent} follow-up(s)`);
    res.status(201).json({ success: true, sent, skipped, total: targets.length, details });
  } catch (e) {
    console.error('POST /absence/surveys/send error:', e);
    res.status(500).json({ error: 'Failed to send the absence follow-up' });
  }
});


/* ------------------------------------------------------------------ */
/* Portal shape for this church's denomination                        */
/* ------------------------------------------------------------------ */

/**
 * Tells the church admin portal which areas to show and what to call them,
 * based on the denomination the superadmin chose at registration.
 *
 * Also reports which optional sections the member registration form should
 * include, which is how Pentecostal & Charismatic churches get ministries,
 * education, family and medical details on their member form.
 *
 * Every denomination still reaches every area of the portal. When a tradition's
 * layout is described, only src/lib/denominations.ts changes and this endpoint
 * starts reporting the narrower list automatically.
 */
router.get('/portal-profile', async (req: AuthRequest, res) => {
  try {
    const tenant = await db('tenants').where({ id: tid(req) }).first();
    const profile = getPortalProfile(tenant?.denomination);
    res.json({
      denomination: profile.denomination,
      denominationLabel: profile.label,
      features: profile.features,
      terminology: profile.terminology,
      // Extra sections the member registration form should include for this
      // tradition, e.g. ministries, education, family and medical details.
      memberSections: profile.memberSections,
    });
  } catch (e) {
    console.error('GET /portal-profile error:', e);
    // A failure here must not blank the sidebar, so fall back to the full
    // portal rather than returning an error the layout would have to handle.
    const profile = getPortalProfile(undefined);
    res.json({
      denomination: profile.denomination,
      denominationLabel: profile.label,
      features: profile.features,
      terminology: profile.terminology,
      // Extra sections the member registration form should include for this
      // tradition, e.g. ministries, education, family and medical details.
      memberSections: profile.memberSections,
    });
  }
});

export default router;
