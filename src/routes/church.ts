import { Router, Response, NextFunction } from 'express';
import db from '../lib/db';
import { AuthRequest } from '../middleware/auth';
import { sendSMS } from '../services/mnotify';
import {
  initializeTransaction,
  verifyTransaction,
  isPaystackConfigured,
} from '../services/paystack';

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
    const total = await query.clone().count('id as count').first();
    const data = await query
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
      .first();
    if (!member) return res.status(404).json({ error: 'Member not found' });
    res.json(member);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch member' });
  }
});

router.post('/members', requireRole('CHURCH_ADMIN', 'PASTOR', 'MINISTRY_LEADER'), async (req: AuthRequest, res) => {
  try {
    const { firstName, lastName, email, phone, gender, dateOfBirth, familyId, membershipStatus, notes,
      membershipId, anniversaryDate, maritalStatus, occupation, address, branchId, ministryId, photoUrl } = req.body;
    if (!firstName || !lastName) {
      return res.status(400).json({ error: 'firstName and lastName are required' });
    }
    const member = {
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
    await db('members').insert(member);
    res.status(201).json(member);
  } catch (error) {
    console.error('Create member error:', error);
    res.status(500).json({ error: 'Failed to create member' });
  }
});

router.put('/members/:id', requireRole('CHURCH_ADMIN', 'PASTOR', 'MINISTRY_LEADER'), async (req: AuthRequest, res) => {
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
    await db('members').where({ id: req.params.id, tenantId: tid(req) }).update(updates);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update member' });
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

router.post('/events', requireRole('CHURCH_ADMIN', 'PASTOR', 'MINISTRY_LEADER'), async (req: AuthRequest, res) => {
  try {
    const { title, description, location, startTime, endTime, category } = req.body;
    if (!title || !startTime) {
      return res.status(400).json({ error: 'title and startTime are required' });
    }
    const event = {
      id: genId('event'),
      tenantId: tid(req),
      title,
      description: description || null,
      location: location || null,
      startTime: new Date(startTime),
      endTime: endTime ? new Date(endTime) : null,
      category: category || 'service',
      createdBy: req.user?.uid || null,
      createdAt: new Date(),
    };
    await db('events').insert(event);
    res.status(201).json(event);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create event' });
  }
});

router.put('/events/:id', requireRole('CHURCH_ADMIN', 'PASTOR', 'MINISTRY_LEADER'), async (req: AuthRequest, res) => {
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
router.post('/giving', requireRole('CHURCH_ADMIN', 'PASTOR', 'MINISTRY_LEADER'), async (req: AuthRequest, res) => {
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
  const writeRoles = opts.writeRoles || ['CHURCH_ADMIN', 'PASTOR', 'MINISTRY_LEADER'];
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
router.post('/visitors', requireRole('CHURCH_ADMIN', 'PASTOR', 'MINISTRY_LEADER'), async (req: AuthRequest, res) => {
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
router.put('/visitors/:id', requireRole('CHURCH_ADMIN', 'PASTOR', 'MINISTRY_LEADER'), async (req: AuthRequest, res) => {
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
  { role: 'MEMBER', label: 'Member', permissions: ['View own profile', 'Give online', 'View events'] },
];
router.get('/roles', async (_req: AuthRequest, res) => {
  res.json({ data: CHURCH_ROLES });
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
    const allowedRoles = ['CHURCH_ADMIN', 'PASTOR', 'MINISTRY_LEADER', 'MEMBER'];
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
router.post('/sms/purchase', requireRole('CHURCH_ADMIN', 'PASTOR'), async (req: AuthRequest, res) => {
  try {
    const tenantId = tid(req);
    const { packageId, reference } = req.body || {};
    if (!packageId) return res.status(400).json({ error: 'packageId is required' });

    const pkg = await db('sms_packages').where({ id: packageId, active: true }).first();
    if (!pkg) return res.status(404).json({ error: 'SMS package not found' });

    const tenant = await db('tenants').where({ id: tenantId }).first();

    // If a payment reference is provided, verify it with Paystack before
    // granting any credits. A failed or mismatched verification is rejected.
    let status = 'completed';
    if (reference) {
      try {
        const paystackSettings = await getTenantSettings(tenantId, 'paystack');
        const verification: any = await verifyTransaction(reference, paystackSettings.secretKey);
        const ok = verification?.status === true || verification?.data?.status === 'success';
        if (!ok) {
          return res.status(402).json({ error: 'Payment could not be verified' });
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

export default router;
