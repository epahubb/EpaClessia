import { Router, Response, NextFunction } from 'express';
import db from '../lib/db';
import { AuthRequest } from '../middleware/auth';
import {
  initializeTransaction,
  verifyTransaction,
  isPaystackConfigured,
} from '../services/paystack';

/**
 * Member self-service API.
 *
 * Mounted behind `authenticate`. Every route is strictly scoped to the
 * authenticated member's own identity and their church (tenant). A member can
 * only ever see and act on their own records.
 */
const router = Router();

const genId = (prefix: string) =>
  `${prefix}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;

async function getTenantSettings(tenantId: string, key: string): Promise<any> {
  const row = await db('church_settings').where({ tenantId, key }).first();
  if (!row) return {};
  try {
    return JSON.parse(row.value);
  } catch {
    return {};
  }
}

/**
 * Resolve the authenticated member: their user row, tenant, and the matching
 * member record (by email within the tenant, when one exists).
 */
async function resolveMember(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const dbUser = await db('users').where({ uid: req.user?.uid }).first();
    if (!dbUser) return res.status(401).json({ error: 'User not found' });
    if (!dbUser.tenantId) {
      return res
        .status(400)
        .json({ error: 'No church is associated with this account.' });
    }
    (req as any).dbUser = dbUser;
    (req as any).tenantId = dbUser.tenantId;

    let memberRecord: any = null;
    if (dbUser.email) {
      memberRecord = await db('members')
        .where({ tenantId: dbUser.tenantId })
        .whereRaw('lower(email) = ?', [String(dbUser.email).toLowerCase()])
        .first();
    }
    (req as any).memberRecord = memberRecord;
    next();
  } catch (error) {
    console.error('resolveMember error:', error);
    res.status(500).json({ error: 'Failed to resolve member context' });
  }
}

router.use(resolveMember);

function ctx(req: AuthRequest) {
  return {
    tenantId: (req as any).tenantId as string,
    user: (req as any).dbUser,
    member: (req as any).memberRecord,
  };
}

function donorName(user: any, member: any): string {
  return (
    user?.name ||
    [member?.firstName, member?.lastName].filter(Boolean).join(' ') ||
    'Member'
  );
}

/**
 * A knex builder matching only the authenticated member's own donations,
 * whether they were linked by memberId or recorded against their email.
 * Returns a fresh builder on every call.
 */
function ownGiftsQuery(req: AuthRequest) {
  const { tenantId, user, member } = ctx(req);
  const email = user?.email ? String(user.email).toLowerCase() : null;
  return db('donations')
    .where({ tenantId })
    .where(function () {
      if (member?.id) this.orWhere('memberId', member.id);
      if (email) this.orWhereRaw('lower(email) = ?', [email]);
      // A brand-new member with no linkage sees an empty set, never the whole
      // church's giving.
      if (!member?.id && !email) this.whereRaw('1 = 0');
    });
}

/* ------------------------------------------------------------------ */
/* Giving history + summary                                            */
/* ------------------------------------------------------------------ */
router.get('/giving', async (req: AuthRequest, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const recent = await ownGiftsQuery(req)
      .orderBy('createdAt', 'desc')
      .limit(limit);

    const completed = await ownGiftsQuery(req).where('status', 'completed');
    const currentYear = new Date().getFullYear();
    let thisYear = 0;
    let allTime = 0;
    const byPurpose: Record<string, number> = {};
    for (const g of completed) {
      const amt = Number(g.amount || 0);
      allTime += amt;
      if (new Date(g.createdAt).getFullYear() === currentYear) thisYear += amt;
      const p = g.purpose || 'General';
      byPurpose[p] = (byPurpose[p] || 0) + amt;
    }
    const lastGift = completed
      .slice()
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )[0];

    res.json({
      data: recent,
      summary: {
        thisYear,
        allTime,
        count: completed.length,
        lastGiftAmount: lastGift ? Number(lastGift.amount || 0) : null,
        lastGiftDate: lastGift ? lastGift.createdAt : null,
        currency: 'GHS',
      },
      byPurpose,
    });
  } catch (error) {
    console.error('Member giving fetch error:', error);
    res.status(500).json({ error: 'Failed to load your giving history' });
  }
});

/* ------------------------------------------------------------------ */
/* Annual contribution statement                                      */
/* ------------------------------------------------------------------ */
router.get('/giving/statement', async (req: AuthRequest, res) => {
  try {
    const { tenantId, user, member } = ctx(req);
    const year = Number(req.query.year) || new Date().getFullYear();
    const gifts = await ownGiftsQuery(req)
      .where('status', 'completed')
      .orderBy('createdAt', 'asc');
    const inYear = gifts.filter(
      (g: any) => new Date(g.createdAt).getFullYear() === year,
    );
    const total = inYear.reduce(
      (sum: number, g: any) => sum + Number(g.amount || 0),
      0,
    );
    const tenant = await db('tenants').where({ id: tenantId }).first();

    res.json({
      year,
      currency: 'GHS',
      total,
      count: inYear.length,
      generatedAt: new Date(),
      donor: { name: donorName(user, member), email: user?.email || null },
      church: { name: tenant?.name || 'Your Church' },
      gifts: inYear.map((g: any) => ({
        date: g.createdAt,
        amount: Number(g.amount || 0),
        purpose: g.purpose || 'General',
        method: g.paymentMethod || '—',
        reference: g.reference || null,
      })),
    });
  } catch (error) {
    console.error('Member statement error:', error);
    res.status(500).json({ error: 'Failed to generate your statement' });
  }
});

/* ------------------------------------------------------------------ */
/* Online giving (Paystack) for the logged-in member                  */
/* ------------------------------------------------------------------ */
router.post('/giving/initialize', async (req: AuthRequest, res) => {
  try {
    const { tenantId, user, member } = ctx(req);
    const paystack = await getTenantSettings(tenantId, 'paystack');
    const secretKey = paystack.secretKey;
    if (!isPaystackConfigured(secretKey)) {
      return res.status(503).json({
        error:
          'Online giving is not configured for your church yet. Please contact your church administrator.',
      });
    }

    const { amount, purpose, callbackUrl } = req.body;
    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({ error: 'Please enter a valid amount.' });
    }
    const email = user?.email;
    if (!email) {
      return res.status(400).json({
        error: 'Your account has no email on file, which is required for online giving.',
      });
    }

    const reference = genId('gift');
    await db('donations').insert({
      tenantId,
      amount: Number(amount),
      currency: 'GHS',
      donorName: donorName(user, member),
      paymentMethod: 'paystack',
      purpose: purpose || 'General',
      memberId: member?.id || null,
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
      metadata: {
        tenantId,
        purpose: purpose || 'General',
        donorName: donorName(user, member),
        memberId: member?.id || null,
      },
    });

    res.json({
      authorizationUrl: data?.authorization_url,
      reference,
      accessCode: data?.access_code,
    });
  } catch (error) {
    console.error('Member giving initialize error:', error);
    res.status(502).json({ error: 'Failed to start your payment. Please try again.' });
  }
});

// Confirm a gift after redirect (server-side verification), scoped to the member.
router.get('/giving/verify/:reference', async (req: AuthRequest, res) => {
  try {
    const { tenantId, user, member } = ctx(req);
    const reference = req.params.reference;
    const donation = await db('donations')
      .where({ reference, tenantId })
      .first();
    if (!donation) return res.status(404).json({ error: 'Gift not found' });

    // Ensure this gift belongs to the caller before revealing/updating it.
    const email = user?.email ? String(user.email).toLowerCase() : null;
    const isOwn =
      (member?.id && donation.memberId === member.id) ||
      (email && String(donation.email || '').toLowerCase() === email);
    if (!isOwn) {
      return res.status(403).json({ error: 'This gift is not associated with your account.' });
    }

    const paystack = await getTenantSettings(tenantId, 'paystack');
    const data = await verifyTransaction(reference, paystack.secretKey);
    const newStatus = data?.status === 'success' ? 'completed' : 'failed';
    await db('donations').where({ reference, tenantId }).update({ status: newStatus });

    res.json({
      status: newStatus,
      reference,
      amount: Number(donation.amount || 0),
      purpose: donation.purpose || 'General',
    });
  } catch (error) {
    console.error('Member giving verify error:', error);
    res.status(502).json({ error: 'Failed to verify your payment.' });
  }
});

/* ------------------------------------------------------------------ */
/* Events (browse, register/RSVP, cancel, self check-in)              */
/* ------------------------------------------------------------------ */

// A stable identity for this member's attendance rows: their member record id
// when one exists, otherwise a user-derived id so registrations still work.
function memberIdentity(req: AuthRequest): string {
  const { user, member } = ctx(req);
  return member?.id || `u_${user?.uid}`;
}

const ACTIVE_ATT = ['registered', 'checked_in', 'checked_out'];

router.get('/events', async (req: AuthRequest, res) => {
  try {
    const { tenantId } = ctx(req);
    const identity = memberIdentity(req);
    // Include events that started within the last 6 hours so members can still
    // self check-in to a service that is currently underway.
    const since = new Date(Date.now() - 6 * 60 * 60 * 1000);
    const events = await db('events')
      .where({ tenantId })
      .andWhere('startTime', '>=', since)
      .orderBy('startTime', 'asc')
      .limit(100);

    const eventIds = events.map((e: any) => e.id);
    const countsByEvent: Record<string, number> = {};
    const mineByEvent: Record<string, any> = {};

    if (eventIds.length) {
      const countRows = await db('event_attendance')
        .where({ tenantId })
        .whereIn('eventId', eventIds)
        .whereIn('status', ACTIVE_ATT)
        .groupBy('eventId')
        .select('eventId')
        .count('id as count');
      for (const r of countRows as any[]) countsByEvent[r.eventId] = Number(r.count);

      const mine = await db('event_attendance')
        .where({ tenantId, memberId: identity })
        .whereIn('eventId', eventIds)
        .whereIn('status', ACTIVE_ATT);
      for (const a of mine as any[]) mineByEvent[a.eventId] = a;
    }

    const data = events.map((e: any) => ({
      ...e,
      registeredCount: countsByEvent[e.id] || 0,
      spotsLeft: e.capacity ? Math.max(0, Number(e.capacity) - (countsByEvent[e.id] || 0)) : null,
      myStatus: mineByEvent[e.id]?.status || null,
      myAttendanceId: mineByEvent[e.id]?.id || null,
      myCheckInCode: mineByEvent[e.id]?.checkInCode || null,
    }));
    res.json({ data });
  } catch (error) {
    console.error('Member events fetch error:', error);
    res.status(500).json({ error: 'Failed to load events' });
  }
});

// Register / RSVP for an event.
router.post('/events/:id/register', async (req: AuthRequest, res) => {
  try {
    const { tenantId } = ctx(req);
    const identity = memberIdentity(req);
    const event = await db('events').where({ id: req.params.id, tenantId }).first();
    if (!event) return res.status(404).json({ error: 'Event not found' });

    const existing = await db('event_attendance')
      .where({ tenantId, eventId: event.id, memberId: identity })
      .whereIn('status', ACTIVE_ATT)
      .first();
    if (existing) {
      return res.json({ success: true, alreadyRegistered: true, attendanceId: existing.id });
    }

    if (event.capacity) {
      const cnt = await db('event_attendance')
        .where({ tenantId, eventId: event.id })
        .whereIn('status', ACTIVE_ATT)
        .count('id as count')
        .first();
      if (Number(cnt?.count || 0) >= Number(event.capacity)) {
        return res.status(409).json({ error: 'This event is fully booked.' });
      }
    }

    const record = {
      tenantId,
      eventId: event.id,
      memberId: identity,
      status: 'registered',
      createdAt: new Date(),
    };
    const [insertedId] = await db('event_attendance').insert(record).returning('id');
    const id = typeof insertedId === 'object' ? insertedId.id : insertedId;
    res.status(201).json({ success: true, attendanceId: id });
  } catch (error) {
    console.error('Member event register error:', error);
    res.status(500).json({ error: 'Failed to register for this event' });
  }
});

// Cancel a registration (only while still 'registered').
router.post('/events/:id/cancel', async (req: AuthRequest, res) => {
  try {
    const { tenantId } = ctx(req);
    const identity = memberIdentity(req);
    const updated = await db('event_attendance')
      .where({ tenantId, eventId: req.params.id, memberId: identity, status: 'registered' })
      .update({ status: 'cancelled' });
    if (!updated) {
      return res.status(404).json({ error: 'No active registration found to cancel.' });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Member event cancel error:', error);
    res.status(500).json({ error: 'Failed to cancel your registration' });
  }
});

// Self check-in. Returns a short code the member can show to an usher.
router.post('/events/:id/checkin', async (req: AuthRequest, res) => {
  try {
    const { tenantId, user } = ctx(req);
    const identity = memberIdentity(req);
    const event = await db('events').where({ id: req.params.id, tenantId }).first();
    if (!event) return res.status(404).json({ error: 'Event not found' });

    const att = await db('event_attendance')
      .where({ tenantId, eventId: event.id, memberId: identity })
      .whereIn('status', ['registered', 'checked_in'])
      .first();
    const checkInCode = String(Math.floor(1000 + Math.random() * 9000));

    if (att) {
      if (att.status === 'checked_in') {
        return res.json({ success: true, checkInCode: att.checkInCode, alreadyCheckedIn: true });
      }
      await db('event_attendance').where({ id: att.id }).update({
        status: 'checked_in',
        checkInCode,
        checkInAt: new Date(),
        checkedInBy: user?.uid || null,
      });
      return res.json({ success: true, checkInCode });
    }

    const record = {
      tenantId,
      eventId: event.id,
      memberId: identity,
      status: 'checked_in',
      checkInCode,
      checkInAt: new Date(),
      checkedInBy: user?.uid || null,
      createdAt: new Date(),
    };
    const [insertedId] = await db('event_attendance').insert(record).returning('id');
    const id = typeof insertedId === 'object' ? insertedId.id : insertedId;
    res.status(201).json({ success: true, checkInCode, attendanceId: id });
  } catch (error) {
    console.error('Member self check-in error:', error);
    res.status(500).json({ error: 'Failed to check in' });
  }
});

/* ------------------------------------------------------------------ */
/* Profile (view + self-service edit, family links, member card)      */
/* ------------------------------------------------------------------ */

// Fields a member is allowed to edit about themselves. Admin-controlled fields
// (membershipStatus, approvalStatus, branchId, ministryId, familyId,
// membershipId, joinDate, notes, email) are intentionally excluded.
const SELF_EDITABLE = [
  'firstName',
  'lastName',
  'phone',
  'gender',
  'dateOfBirth',
  'maritalStatus',
  'anniversaryDate',
  'address',
  'occupation',
  'photoUrl',
];

router.get('/profile', async (req: AuthRequest, res) => {
  try {
    const { tenantId, user, member } = ctx(req);

    let family: any = null;
    let familyMembers: any[] = [];
    if (member?.familyId) {
      family = await db('families').where({ id: member.familyId, tenantId }).first();
      familyMembers = await db('members')
        .where({ tenantId, familyId: member.familyId })
        .whereNot({ id: member.id })
        .select('id', 'firstName', 'lastName', 'phone', 'email', 'gender', 'dateOfBirth');
    }

    let commPreferences: any = {};
    if (member?.commPreferences) {
      try {
        commPreferences = JSON.parse(member.commPreferences);
      } catch {
        commPreferences = {};
      }
    }

    const tenant = await db('tenants').where({ id: tenantId }).first();

    res.json({
      profile: member ? { ...member, commPreferences } : null,
      account: { uid: user?.uid, name: user?.name, email: user?.email, role: user?.role },
      church: tenant ? { id: tenant.id, name: tenant.name, logo: tenant.logo || null } : null,
      family,
      familyMembers,
      hasMemberRecord: !!member,
    });
  } catch (error) {
    console.error('Member profile fetch error:', error);
    res.status(500).json({ error: 'Failed to load your profile' });
  }
});

router.put('/profile', async (req: AuthRequest, res) => {
  try {
    const { tenantId, user, member } = ctx(req);

    const updates: any = {};
    for (const k of SELF_EDITABLE) if (k in req.body) updates[k] = req.body[k];
    if (updates.dateOfBirth) updates.dateOfBirth = new Date(updates.dateOfBirth);
    if (updates.anniversaryDate) updates.anniversaryDate = new Date(updates.anniversaryDate);
    if ('commPreferences' in req.body) {
      updates.commPreferences = JSON.stringify(req.body.commPreferences || {});
    }

    if (member) {
      await db('members').where({ id: member.id, tenantId }).update(updates);
      const fresh = await db('members').where({ id: member.id, tenantId }).first();
      let commPreferences: any = {};
      if (fresh?.commPreferences) {
        try {
          commPreferences = JSON.parse(fresh.commPreferences);
        } catch {
          commPreferences = {};
        }
      }
      return res.json({ success: true, profile: { ...fresh, commPreferences } });
    }

    // No member record yet: create one for this user (pending admin approval).
    const record: any = {
      id: genId('member'),
      tenantId,
      email: user?.email || null,
      membershipStatus: 'active',
      approvalStatus: 'pending',
      joinDate: new Date(),
      createdAt: new Date(),
      ...updates,
    };
    if (!record.firstName) record.firstName = (user?.name || '').split(' ')[0] || 'Member';
    if (!record.lastName) record.lastName = (user?.name || '').split(' ').slice(1).join(' ') || '';
    await db('members').insert(record);
    let commPreferences: any = {};
    if (record.commPreferences) {
      try {
        commPreferences = JSON.parse(record.commPreferences);
      } catch {
        commPreferences = {};
      }
    }
    res.status(201).json({ success: true, created: true, profile: { ...record, commPreferences } });
  } catch (error) {
    console.error('Member profile update error:', error);
    res.status(500).json({ error: 'Failed to update your profile' });
  }
});

export default router;
