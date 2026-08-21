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
  buildRollCall,
  summarizeRollCall,
  normalizePresent,
  generateDeviceApiKey,
  QR_TOKEN_TTL_MINUTES,
} from '../lib/attendance';
import {
  PERMISSION_CODES,
  PLATFORM_ONLY_PERMISSIONS,
  isChurchEditableRole,
  sanitizePermissions,
  serializePermissions,
  resolveRolePermissions,
} from '../lib/permissions';

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
    res.json({
      data,
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
    res.json(member);
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

    // Optional profile picture supplied at creation time, so an admin can add
    // a member and their photo in one step.
    if (photo) {
      const img = decodeImageDataUrl(photo);
      member.photo = img.buffer;
      member.photoMimeType = img.mimeType;
      member.photoUpdatedAt = new Date();
    }

    await db('members').insert(member);

    // Never echo the raw image bytes back in the JSON response.
    const { photo: _omitPhoto, ...safeMember } = member;
    res.status(201).json({ ...safeMember, hasPhoto: Boolean(member.photo) });
  } catch (error) {
    handleImageError(error, res, 'Failed to create member');
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

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No updatable fields were supplied' });
    }

    await db('members').where({ id: req.params.id, tenantId: tid(req) }).update(updates);
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
    const { amount, currency, donorName, paymentMethod, purpose, memberId } = req.body;
    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({ error: 'A positive amount is required' });
    }
    const record = {
      tenantId: tid(req),
      amount: Number(amount),
      currency: currency || 'GHS',
      donorName: donorName || 'Anonymous',
      paymentMethod: paymentMethod || 'cash',
      purpose: purpose || 'General',
      memberId: memberId || null,
      status: 'completed',
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
    const paystackSettings = await getTenantSettings(tid(req), 'paystack');
    const secretKey = paystackSettings.secretKey;
    if (!isPaystackConfigured(secretKey)) {
      return res.status(503).json({ error: 'Online giving is not configured. Add your Paystack secret key in church settings.' });
    }
    const { amount, email, donorName, purpose, memberId, callbackUrl } = req.body;
    if (!amount || Number(amount) <= 0) return res.status(400).json({ error: 'A positive amount is required' });
    if (!email) return res.status(400).json({ error: 'A payer email is required by Paystack' });

    const reference = genId('gift');
    await db('donations').insert({
      tenantId: tid(req),
      amount: Number(amount),
      currency: 'GHS',
      donorName: donorName || 'Anonymous',
      paymentMethod: 'paystack',
      purpose: purpose || 'General',
      memberId: memberId || null,
      email,
      reference,
      status: 'pending',
      createdAt: new Date(),
    });

    const data = await initializeTransaction({
      secretKey,
      email,
      amount: Number(amount),
      reference,
      currency: 'GHS',
      callback_url: callbackUrl,
      metadata: { tenantId: tid(req), purpose: purpose || 'General', donorName },
    });
    res.json({ authorizationUrl: data?.authorization_url, reference, accessCode: data?.access_code });
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

    const paystackSettings = await getTenantSettings(tid(req), 'paystack');
    const data = await verifyTransaction(reference, paystackSettings.secretKey);
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

const SETTINGS_KEYS = ['general', 'paystack', 'sms', 'email', 'payment', 'integration', 'financial', 'profile', 'backup'];

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
    // Never expose full secrets to the browser.
    if (out.paystack?.secretKey) out.paystack.secretKey = maskSecret(out.paystack.secretKey);
    if (out.sms?.apiKey) out.sms.apiKey = maskSecret(out.sms.apiKey);
    res.json(out);
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
    for (const f of opts.fields) {
      if (!(f in body)) continue;
      let v = body[f];
      if (opts.dateFields?.includes(f)) v = v ? new Date(v) : null;
      else if (opts.numberFields?.includes(f)) v = v === '' || v == null ? null : Number(v);
      row[f] = v;
    }
    return row;
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
      const row = { id: genId(opts.idPrefix), tenantId: tid(req), ...coerce(req.body), createdAt: new Date() };
      await db(table).insert(row);
      await logActivity(req, 'create', table, row.id);
      res.status(201).json(row);
    } catch (e) {
      console.error(`POST ${basePath} error:`, e);
      res.status(500).json({ error: `Failed to create ${table} record` });
    }
  });

  router.put(`${basePath}/:id`, requireRole(...writeRoles), async (req: AuthRequest, res) => {
    try {
      const existing = await db(table).where({ id: (req as any).params.id, tenantId: tid(req) }).first();
      if (!existing) return res.status(404).json({ error: 'Not found' });
      await db(table).where({ id: (req as any).params.id, tenantId: tid(req) }).update(coerce(req.body));
      await logActivity(req, 'update', table, (req as any).params.id);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: `Failed to update ${table} record` });
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
  fields: ['category', 'description', 'amount', 'currency', 'paymentMethod', 'vendor', 'status', 'recordedBy', 'date'],
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
  fields: ['memberId', 'memberName', 'purpose', 'amountPledged', 'amountPaid', 'currency', 'status', 'dueDate'],
  numberFields: ['amountPledged', 'amountPaid'],
  dateFields: ['dueDate'],
  filterFields: ['status'],
});
registerCrud('/inventory', 'inventory', {
  idPrefix: 'inv',
  fields: ['name', 'category', 'quantity', 'unitValue', 'condition', 'location', 'notes'],
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
  fields: ['name', 'dayOfWeek', 'startTime', 'endTime', 'location', 'branchId'],
  orderBy: 'name',
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
    .select('id', 'firstName', 'lastName', 'membershipId')
    .orderBy(['firstName', 'lastName']);
}

/**
 * Issue or rotate an event's QR token.
 *
 * Rotation is the point: the displayed code changes every few minutes so a
 * screenshot forwarded to someone sitting at home stops working.
 */
router.post('/events/:id/qr', requireRole(...ATTENDANCE_ROLES), async (req: AuthRequest, res) => {
  try {
    const tenantId = tid(req);
    const event = await db('events').where({ id: req.params.id, tenantId }).first();
    if (!event) return res.status(404).json({ error: 'Event not found' });

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

    const entries = buildRollCall(members as any[], rows as any[]);
    res.json({
      event: { id: event.id, title: event.title, startTime: event.startTime },
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

export default router;
