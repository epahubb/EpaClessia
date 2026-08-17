import { Router, Response, NextFunction } from 'express';
import db from '../lib/db';
import { AuthRequest } from '../middleware/auth';

/**
 * Pastor portal API: pastoral care, prayer requests, visitation, and
 * counseling. Mounted behind `authenticate`. Every request is locked to the
 * caller's own tenant, and confidential care data never crosses tenants.
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
      return res.status(400).json({ error: 'No church is associated with this account.' });
    }
    (req as any).tenantId = tenantId;
    next();
  } catch (error) {
    console.error('pastor resolveTenant error:', error);
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
const uid = (req: AuthRequest): string | null => (req as any).dbUser?.uid || req.user?.uid || null;
const uname = (req: AuthRequest): string | null => (req as any).dbUser?.name || null;

router.use(resolveTenant);
// The whole pastor portal is limited to pastoral roles.
router.use(requireRole('PASTOR', 'CHURCH_ADMIN', 'MINISTRY_LEADER'));

/* ------------------------------------------------------------------ */
/* Dashboard stats                                                    */
/* ------------------------------------------------------------------ */
router.get('/dashboard/stats', async (req: AuthRequest, res) => {
  try {
    const tenantId = tid(req);
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [newMembers, pendingPrayers, upcomingVisits] = await Promise.all([
      db('members').where({ tenantId }).where('createdAt', '>=', weekAgo).count('id as count').first().catch(() => ({ count: 0 })),
      db('prayer_requests').where({ tenantId }).whereIn('status', ['open', 'praying']).count('id as count').first().catch(() => ({ count: 0 })),
      db('visitations').where({ tenantId, status: 'scheduled' }).where('scheduledDate', '>=', now).count('id as count').first().catch(() => ({ count: 0 })),
    ]);

    const recentPrayers = await db('prayer_requests')
      .where({ tenantId })
      .orderBy('createdAt', 'desc')
      .limit(5)
      .catch(() => []);

    const upcomingVisitsList = await db('visitations')
      .where({ tenantId, status: 'scheduled' })
      .where('scheduledDate', '>=', now)
      .orderBy('scheduledDate', 'asc')
      .limit(5)
      .catch(() => []);

    // Follow-ups due: prayers with a followUpDate on or before tomorrow.
    const soon = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const followUps = await db('prayer_requests')
      .where({ tenantId })
      .whereNotNull('followUpDate')
      .where('followUpDate', '<=', soon)
      .whereIn('status', ['open', 'praying'])
      .orderBy('followUpDate', 'asc')
      .limit(5)
      .catch(() => []);

    // Birthdays today (compute in JS to stay DB-agnostic).
    const withDob = await db('members')
      .where({ tenantId })
      .whereNotNull('dateOfBirth')
      .select('id', 'firstName', 'lastName', 'dateOfBirth')
      .catch(() => []);
    const birthdaysToday = (withDob as any[]).filter((m) => {
      const d = new Date(m.dateOfBirth);
      return d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
    });

    res.json({
      newMembersCount: Number((newMembers as any)?.count || 0),
      pendingPrayersCount: Number((pendingPrayers as any)?.count || 0),
      upcomingVisitsCount: Number((upcomingVisits as any)?.count || 0),
      birthdaysTodayCount: birthdaysToday.length,
      recentPrayers,
      upcomingVisits: upcomingVisitsList,
      followUps,
      birthdaysToday,
    });
  } catch (error) {
    console.error('pastor dashboard stats error:', error);
    res.status(500).json({ error: 'Failed to load dashboard stats' });
  }
});

/* ------------------------------------------------------------------ */
/* Member care (search, profile summary, pastoral notes)              */
/* ------------------------------------------------------------------ */
router.get('/members/search', async (req: AuthRequest, res) => {
  try {
    const tenantId = tid(req);
    const q = String(req.query.q || '').trim();
    let query = db('members').where({ tenantId });
    if (q) {
      query = query.andWhere((b) => {
        b.whereRaw('lower(firstName) like ?', [`%${q.toLowerCase()}%`])
          .orWhereRaw('lower(lastName) like ?', [`%${q.toLowerCase()}%`])
          .orWhereRaw('lower(email) like ?', [`%${q.toLowerCase()}%`])
          .orWhere('phone', 'like', `%${q}%`);
      });
    }
    const rows = await query.orderBy('firstName', 'asc').limit(50);
    res.json({ data: rows });
  } catch (error) {
    console.error('pastor member search error:', error);
    res.status(500).json({ error: 'Failed to search members' });
  }
});

router.get('/members/:id/profile', async (req: AuthRequest, res) => {
  try {
    const tenantId = tid(req);
    const member = await db('members').where({ id: req.params.id, tenantId }).first();
    if (!member) return res.status(404).json({ error: 'Member not found' });
    const notes = await db('pastoral_notes')
      .where({ tenantId, memberId: member.id })
      .orderBy('createdAt', 'desc')
      .catch(() => []);
    const prayers = await db('prayer_requests')
      .where({ tenantId, requesterMemberId: member.id })
      .orderBy('createdAt', 'desc')
      .catch(() => []);
    const visits = await db('visitations')
      .where({ tenantId, memberId: member.id })
      .orderBy('createdAt', 'desc')
      .catch(() => []);
    res.json({ member, notes, prayers, visits });
  } catch (error) {
    console.error('pastor member profile error:', error);
    res.status(500).json({ error: 'Failed to load member profile' });
  }
});

router.post('/members/:id/notes', async (req: AuthRequest, res) => {
  try {
    const tenantId = tid(req);
    const { note } = req.body;
    if (!note || !String(note).trim()) return res.status(400).json({ error: 'A note is required' });
    const member = await db('members').where({ id: req.params.id, tenantId }).first();
    if (!member) return res.status(404).json({ error: 'Member not found' });
    const record = {
      id: genId('pnote'),
      tenantId,
      memberId: member.id,
      note: String(note).trim(),
      createdBy: uid(req),
      createdByName: uname(req),
      createdAt: new Date(),
    };
    await db('pastoral_notes').insert(record);
    res.status(201).json(record);
  } catch (error) {
    console.error('pastor add note error:', error);
    res.status(500).json({ error: 'Failed to add note' });
  }
});

/* ------------------------------------------------------------------ */
/* Prayer requests                                                    */
/* ------------------------------------------------------------------ */
router.get('/prayers', async (req: AuthRequest, res) => {
  try {
    const tenantId = tid(req);
    const { status, category } = req.query;
    let q = db('prayer_requests').where({ tenantId });
    if (status) q = q.andWhere({ status: String(status) });
    if (category) q = q.andWhere({ category: String(category) });
    const rows = await q.orderBy('createdAt', 'desc').limit(200);
    res.json({ data: rows });
  } catch (error) {
    console.error('pastor prayers list error:', error);
    res.status(500).json({ error: 'Failed to load prayer requests' });
  }
});

router.post('/prayers', async (req: AuthRequest, res) => {
  try {
    const tenantId = tid(req);
    const { requesterName, requesterMemberId, request, category, isPrivate, assignedTo, followUpDate } = req.body;
    if (!request || !String(request).trim()) return res.status(400).json({ error: 'A prayer request is required' });
    const record = {
      id: genId('prayer'),
      tenantId,
      requesterName: requesterName || null,
      requesterMemberId: requesterMemberId || null,
      request: String(request).trim(),
      category: category || 'general',
      status: 'open',
      isPrivate: !!isPrivate,
      assignedTo: assignedTo || null,
      followUpDate: followUpDate ? new Date(followUpDate) : null,
      createdBy: uid(req),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await db('prayer_requests').insert(record);
    res.status(201).json(record);
  } catch (error) {
    console.error('pastor create prayer error:', error);
    res.status(500).json({ error: 'Failed to create prayer request' });
  }
});

router.put('/prayers/:id', async (req: AuthRequest, res) => {
  try {
    const tenantId = tid(req);
    const existing = await db('prayer_requests').where({ id: req.params.id, tenantId }).first();
    if (!existing) return res.status(404).json({ error: 'Prayer request not found' });
    const allowed = ['status', 'category', 'assignedTo', 'followUpDate', 'notes', 'isPrivate', 'request', 'requesterName'];
    const updates: any = { updatedAt: new Date() };
    for (const k of allowed) if (k in req.body) updates[k] = req.body[k];
    if (updates.followUpDate) updates.followUpDate = new Date(updates.followUpDate);
    await db('prayer_requests').where({ id: req.params.id, tenantId }).update(updates);
    const fresh = await db('prayer_requests').where({ id: req.params.id, tenantId }).first();
    res.json(fresh);
  } catch (error) {
    console.error('pastor update prayer error:', error);
    res.status(500).json({ error: 'Failed to update prayer request' });
  }
});

/* ------------------------------------------------------------------ */
/* Visitations                                                        */
/* ------------------------------------------------------------------ */
router.get('/visitations', async (req: AuthRequest, res) => {
  try {
    const tenantId = tid(req);
    const { status } = req.query;
    let q = db('visitations').where({ tenantId });
    if (status) q = q.andWhere({ status: String(status) });
    const rows = await q.orderBy('scheduledDate', 'desc').limit(200);
    res.json({ data: rows });
  } catch (error) {
    console.error('pastor visitations list error:', error);
    res.status(500).json({ error: 'Failed to load visitations' });
  }
});

router.post('/visitations', async (req: AuthRequest, res) => {
  try {
    const tenantId = tid(req);
    const { memberId, memberName, visitType, location, scheduledDate, assignedTo, notes, status } = req.body;
    if (!memberName && !memberId) return res.status(400).json({ error: 'A member or name is required' });
    const record = {
      id: genId('visit'),
      tenantId,
      memberId: memberId || null,
      memberName: memberName || null,
      visitType: visitType || 'home',
      location: location || null,
      scheduledDate: scheduledDate ? new Date(scheduledDate) : null,
      completedDate: null as Date | null,
      status: status || 'scheduled',
      assignedTo: assignedTo || null,
      notes: notes || null,
      createdBy: uid(req),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await db('visitations').insert(record);
    res.status(201).json(record);
  } catch (error) {
    console.error('pastor create visitation error:', error);
    res.status(500).json({ error: 'Failed to schedule visitation' });
  }
});

router.put('/visitations/:id', async (req: AuthRequest, res) => {
  try {
    const tenantId = tid(req);
    const existing = await db('visitations').where({ id: req.params.id, tenantId }).first();
    if (!existing) return res.status(404).json({ error: 'Visitation not found' });
    const allowed = ['memberName', 'visitType', 'location', 'scheduledDate', 'completedDate', 'status', 'assignedTo', 'notes'];
    const updates: any = { updatedAt: new Date() };
    for (const k of allowed) if (k in req.body) updates[k] = req.body[k];
    if (updates.scheduledDate) updates.scheduledDate = new Date(updates.scheduledDate);
    // Auto-stamp completion time when marked completed.
    if (updates.status === 'completed' && !existing.completedDate && !updates.completedDate) {
      updates.completedDate = new Date();
    }
    if (updates.completedDate) updates.completedDate = new Date(updates.completedDate);
    await db('visitations').where({ id: req.params.id, tenantId }).update(updates);
    const fresh = await db('visitations').where({ id: req.params.id, tenantId }).first();
    res.json(fresh);
  } catch (error) {
    console.error('pastor update visitation error:', error);
    res.status(500).json({ error: 'Failed to update visitation' });
  }
});

/* ------------------------------------------------------------------ */
/* Counseling (confidential)                                          */
/* ------------------------------------------------------------------ */
router.get('/counseling', async (req: AuthRequest, res) => {
  try {
    const tenantId = tid(req);
    const { status } = req.query;
    let q = db('counseling_sessions').where({ tenantId });
    if (status) q = q.andWhere({ status: String(status) });
    const rows = await q.orderBy('sessionDate', 'desc').limit(200);
    res.json({ data: rows });
  } catch (error) {
    console.error('pastor counseling list error:', error);
    res.status(500).json({ error: 'Failed to load counseling sessions' });
  }
});

router.post('/counseling', async (req: AuthRequest, res) => {
  try {
    const tenantId = tid(req);
    const { memberId, memberName, category, sessionDate, status, followUpDate, notes } = req.body;
    if (!memberName && !memberId) return res.status(400).json({ error: 'A member or name is required' });
    const record = {
      id: genId('counsel'),
      tenantId,
      memberId: memberId || null,
      memberName: memberName || null,
      category: category || 'general',
      sessionDate: sessionDate ? new Date(sessionDate) : null,
      status: status || 'scheduled',
      followUpDate: followUpDate ? new Date(followUpDate) : null,
      notes: notes || null,
      counselorId: uid(req),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await db('counseling_sessions').insert(record);
    res.status(201).json(record);
  } catch (error) {
    console.error('pastor create counseling error:', error);
    res.status(500).json({ error: 'Failed to record counseling session' });
  }
});

router.put('/counseling/:id', async (req: AuthRequest, res) => {
  try {
    const tenantId = tid(req);
    const existing = await db('counseling_sessions').where({ id: req.params.id, tenantId }).first();
    if (!existing) return res.status(404).json({ error: 'Counseling session not found' });
    const allowed = ['memberName', 'category', 'sessionDate', 'status', 'followUpDate', 'notes'];
    const updates: any = { updatedAt: new Date() };
    for (const k of allowed) if (k in req.body) updates[k] = req.body[k];
    if (updates.sessionDate) updates.sessionDate = new Date(updates.sessionDate);
    if (updates.followUpDate) updates.followUpDate = new Date(updates.followUpDate);
    await db('counseling_sessions').where({ id: req.params.id, tenantId }).update(updates);
    const fresh = await db('counseling_sessions').where({ id: req.params.id, tenantId }).first();
    res.json(fresh);
  } catch (error) {
    console.error('pastor update counseling error:', error);
    res.status(500).json({ error: 'Failed to update counseling session' });
  }
});

/* ------------------------------------------------------------------ */
/* Reports: congregational health overview (attendance, giving, care)  */
/* ------------------------------------------------------------------ */
router.get('/reports/overview', async (req: AuthRequest, res) => {
  try {
    const tenantId = tid(req);
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const thirtyAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

    const [memberRow, newMemberRow, prayerOpenRow, prayerAnsweredRow, visitScheduledRow, visitCompletedRow, counselActiveRow, givingMonthRow] =
      await Promise.all([
        db('members').where({ tenantId }).count('id as count').first().catch(() => ({ count: 0 })),
        db('members').where({ tenantId }).where('createdAt', '>=', thirtyAgo).count('id as count').first().catch(() => ({ count: 0 })),
        db('prayer_requests').where({ tenantId }).whereIn('status', ['open', 'praying']).count('id as count').first().catch(() => ({ count: 0 })),
        db('prayer_requests').where({ tenantId, status: 'answered' }).count('id as count').first().catch(() => ({ count: 0 })),
        db('visitations').where({ tenantId, status: 'scheduled' }).count('id as count').first().catch(() => ({ count: 0 })),
        db('visitations').where({ tenantId, status: 'completed' }).count('id as count').first().catch(() => ({ count: 0 })),
        db('counseling_sessions').where({ tenantId }).whereIn('status', ['scheduled']).count('id as count').first().catch(() => ({ count: 0 })),
        db('donations').where({ tenantId, status: 'completed' }).where('createdAt', '>=', startOfMonth).sum('amount as total').first().catch(() => ({ total: 0 })),
      ]);

    // Pull raw rows for the last 6 months and bucket by calendar month in JS so
    // the query is portable across PostgreSQL and MySQL.
    const [givingRows, attendanceRows, memberRows] = await Promise.all([
      db('donations').where({ tenantId, status: 'completed' }).where('createdAt', '>=', sixMonthsAgo).select('amount', 'createdAt').catch(() => []),
      db('event_attendance').where({ tenantId }).where('checkInAt', '>=', sixMonthsAgo).select('checkInAt').catch(() => []),
      db('members').where({ tenantId }).where('createdAt', '>=', sixMonthsAgo).select('createdAt').catch(() => []),
    ]);

    const monthKeys: { key: string; label: string }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      monthKeys.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleString('default', { month: 'short' }) });
    }
    const bucket = (rows: any[], field: string, reducer: (acc: number, r: any) => number) => {
      const map: Record<string, number> = {};
      for (const r of rows) {
        const d = new Date(r[field]);
        const k = `${d.getFullYear()}-${d.getMonth()}`;
        map[k] = reducer(map[k] || 0, r);
      }
      return monthKeys.map((m) => ({ month: m.label, value: Math.round((map[m.key] || 0) * 100) / 100 }));
    };

    const givingTrend = bucket(givingRows, 'createdAt', (acc, r) => acc + Number(r.amount || 0));
    const attendanceTrend = bucket(attendanceRows, 'checkInAt', (acc) => acc + 1);
    const newMembersTrend = bucket(memberRows, 'createdAt', (acc) => acc + 1);

    res.json({
      generatedAt: now.toISOString(),
      summary: {
        totalMembers: Number((memberRow as any)?.count || 0),
        newMembers30d: Number((newMemberRow as any)?.count || 0),
        givingThisMonth: Number((givingMonthRow as any)?.total || 0),
        openPrayerRequests: Number((prayerOpenRow as any)?.count || 0),
        answeredPrayers: Number((prayerAnsweredRow as any)?.count || 0),
        scheduledVisits: Number((visitScheduledRow as any)?.count || 0),
        completedVisits: Number((visitCompletedRow as any)?.count || 0),
        activeCounseling: Number((counselActiveRow as any)?.count || 0),
      },
      givingTrend,
      attendanceTrend,
      newMembersTrend,
    });
  } catch (error) {
    console.error('pastor reports error:', error);
    res.status(500).json({ error: 'Failed to load reports' });
  }
});

export default router;
