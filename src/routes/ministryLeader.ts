import { Router, Response, NextFunction } from 'express';
import db from '../lib/db';
import { AuthRequest } from '../middleware/auth';

/**
 * Ministry Leader portal API: managed ministries, team roster, tasks,
 * ministry-scoped events, and attendance tracking. Mounted behind
 * `authenticate`. Every request is locked to the caller's own tenant, and
 * ministry leaders can only act on ministries they lead (church admins and
 * pastors may act on any ministry within their tenant).
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
    console.error('ministryLeader resolveTenant error:', error);
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
const role = (req: AuthRequest): string => (req as any).dbUser?.role || req.user?.role || '';
const isPrivileged = (req: AuthRequest): boolean =>
  ['SUPER_ADMIN', 'CHURCH_ADMIN', 'PASTOR'].includes(role(req));

router.use(resolveTenant);
// The whole ministry portal is limited to ministry leadership roles.
router.use(requireRole('MINISTRY_LEADER', 'CHURCH_ADMIN', 'PASTOR'));

/**
 * Load a ministry, enforce tenant isolation, and confirm the caller may manage
 * it. Ministry leaders may only touch ministries they lead; admins/pastors may
 * touch any ministry in the tenant. Returns the ministry row or sends an error
 * response (returns null in that case).
 */
async function requireMinistry(
  req: AuthRequest,
  res: Response,
  ministryId: string,
): Promise<any | null> {
  const ministry = await db('ministries')
    .where({ id: ministryId, tenantId: tid(req) })
    .first();
  if (!ministry) {
    res.status(404).json({ error: 'Ministry not found' });
    return null;
  }
  if (!isPrivileged(req) && ministry.leaderId && ministry.leaderId !== uid(req)) {
    res.status(403).json({ error: 'You do not lead this ministry' });
    return null;
  }
  return ministry;
}

/* ------------------------------------------------------------------ */
/* Managed ministries                                                 */
/* ------------------------------------------------------------------ */
router.get('/ministries', async (req: AuthRequest, res) => {
  try {
    const tenantId = tid(req);
    let q = db('ministries').where({ tenantId });
    // Ministry leaders only see ministries they lead; admins/pastors see all.
    if (!isPrivileged(req)) {
      q = q.where({ leaderId: uid(req) });
    }
    const ministries = await q.orderBy('name', 'asc').catch(() => []);
    res.json(ministries);
  } catch (error) {
    console.error('getManagedMinistries error:', error);
    res.status(500).json({ error: 'Failed to load ministries' });
  }
});

/* ------------------------------------------------------------------ */
/* Dashboard stats                                                    */
/* ------------------------------------------------------------------ */
router.get('/ministries/:id/stats', async (req: AuthRequest, res) => {
  try {
    const ministry = await requireMinistry(req, res, req.params.id);
    if (!ministry) return;
    const tenantId = tid(req);
    const ministryId = req.params.id;
    const now = new Date();

    const [memberRow, pendingRow, doneRow, totalTaskRow, activeRow] = await Promise.all([
      db('ministry_members').where({ tenantId, ministryId, status: 'active' }).count('id as count').first().catch(() => ({ count: 0 })),
      db('ministry_tasks').where({ tenantId, ministryId }).whereNot('status', 'done').count('id as count').first().catch(() => ({ count: 0 })),
      db('ministry_tasks').where({ tenantId, ministryId, status: 'done' }).count('id as count').first().catch(() => ({ count: 0 })),
      db('ministry_tasks').where({ tenantId, ministryId }).count('id as count').first().catch(() => ({ count: 0 })),
      db('ministry_members').where({ tenantId, ministryId }).count('id as count').first().catch(() => ({ count: 0 })),
    ]);

    const upcomingEventsRows = await db('events')
      .where({ tenantId, ministryId })
      .where('startTime', '>=', now)
      .orderBy('startTime', 'asc')
      .limit(5)
      .catch(() => []);

    const pendingTasks = await db('ministry_tasks')
      .where({ tenantId, ministryId })
      .whereNot('status', 'done')
      .orderBy('dueDate', 'asc')
      .limit(5)
      .catch(() => []);

    const recentMembers = await db('ministry_members')
      .where({ tenantId, ministryId })
      .orderBy('joinedAt', 'desc')
      .limit(5)
      .catch(() => []);

    const attendanceRows = await db('ministry_attendance')
      .where({ tenantId, ministryId })
      .orderBy('sessionDate', 'desc')
      .limit(6)
      .catch(() => []);

    const memberCount = Number((memberRow as any)?.count || 0);
    const pendingTasksCount = Number((pendingRow as any)?.count || 0);
    const doneTasksCount = Number((doneRow as any)?.count || 0);
    const totalTasksCount = Number((totalTaskRow as any)?.count || 0);
    const totalRosterCount = Number((activeRow as any)?.count || 0);

    const avgAttendance = attendanceRows.length
      ? Math.round(
          attendanceRows.reduce((acc: number, a: any) => {
            const total = Number(a.totalCount || 0);
            const present = Number(a.presentCount || 0);
            return acc + (total > 0 ? (present / total) * 100 : 0);
          }, 0) / attendanceRows.length,
        )
      : 0;

    const taskCompletionRate = totalTasksCount > 0 ? Math.round((doneTasksCount / totalTasksCount) * 100) : 0;
    const activeVolunteersRate = totalRosterCount > 0 ? Math.round((memberCount / totalRosterCount) * 100) : 0;

    res.json({
      ministryId,
      ministryName: ministry.name,
      memberCount,
      pendingTasksCount,
      upcomingEventsCount: upcomingEventsRows.length,
      avgAttendance,
      taskCompletionRate,
      activeVolunteersRate,
      pendingTasks: pendingTasks.map((t: any) => ({
        id: t.id,
        title: t.title,
        assigneeName: t.assigneeName || 'Unassigned',
        dueDate: t.dueDate ? new Date(t.dueDate).toLocaleDateString() : 'No due date',
        status: t.status,
        priority: t.priority,
      })),
      upcomingEvents: upcomingEventsRows.map((e: any) => ({
        id: e.id,
        title: e.title,
        date: e.startTime ? new Date(e.startTime).toLocaleDateString() : '',
        location: e.location || '',
      })),
      recentMembers: recentMembers.map((m: any) => ({
        id: m.id,
        name: m.name,
        role: m.role || 'member',
      })),
    });
  } catch (error) {
    console.error('ministry stats error:', error);
    res.status(500).json({ error: 'Failed to load ministry stats' });
  }
});

/* ------------------------------------------------------------------ */
/* Roster / members                                                   */
/* ------------------------------------------------------------------ */
router.get('/ministries/:id/members', async (req: AuthRequest, res) => {
  try {
    const ministry = await requireMinistry(req, res, req.params.id);
    if (!ministry) return;
    const members = await db('ministry_members')
      .where({ tenantId: tid(req), ministryId: req.params.id })
      .orderBy('name', 'asc')
      .catch(() => []);
    res.json(members);
  } catch (error) {
    console.error('getMinistryMembers error:', error);
    res.status(500).json({ error: 'Failed to load ministry members' });
  }
});

router.post('/ministries/:id/members', async (req: AuthRequest, res) => {
  try {
    const ministry = await requireMinistry(req, res, req.params.id);
    if (!ministry) return;
    const { name, memberId, role: memberRole, phone, email, status } = req.body || {};
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'Member name is required' });
    }
    const now = new Date();
    const record = {
      id: genId('mmem'),
      tenantId: tid(req),
      ministryId: req.params.id,
      memberId: memberId || null,
      name: String(name).trim(),
      role: memberRole || 'member',
      status: status || 'active',
      phone: phone || null,
      email: email || null,
      joinedAt: now,
      createdBy: uid(req),
      createdAt: now,
    };
    await db('ministry_members').insert(record);
    // Keep the denormalized memberCount on the ministry roughly in sync.
    await db('ministries')
      .where({ id: req.params.id, tenantId: tid(req) })
      .update({ memberCount: (Number(ministry.memberCount || 0) + 1) })
      .catch(() => {});
    res.status(201).json(record);
  } catch (error) {
    console.error('addMinistryMember error:', error);
    res.status(500).json({ error: 'Failed to add ministry member' });
  }
});

router.put('/members/:memberId', async (req: AuthRequest, res) => {
  try {
    const existing = await db('ministry_members')
      .where({ id: req.params.memberId, tenantId: tid(req) })
      .first();
    if (!existing) return res.status(404).json({ error: 'Member not found' });
    const ministry = await requireMinistry(req, res, existing.ministryId);
    if (!ministry) return;
    const patch: any = {};
    for (const f of ['name', 'role', 'status', 'phone', 'email']) {
      if (req.body[f] !== undefined) patch[f] = req.body[f];
    }
    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }
    await db('ministry_members').where({ id: req.params.memberId }).update(patch);
    const updated = await db('ministry_members').where({ id: req.params.memberId }).first();
    res.json(updated);
  } catch (error) {
    console.error('updateMinistryMember error:', error);
    res.status(500).json({ error: 'Failed to update ministry member' });
  }
});

/* ------------------------------------------------------------------ */
/* Tasks                                                              */
/* ------------------------------------------------------------------ */
router.get('/ministries/:id/tasks', async (req: AuthRequest, res) => {
  try {
    const ministry = await requireMinistry(req, res, req.params.id);
    if (!ministry) return;
    const tasks = await db('ministry_tasks')
      .where({ tenantId: tid(req), ministryId: req.params.id })
      .orderBy('createdAt', 'desc')
      .catch(() => []);
    res.json(tasks);
  } catch (error) {
    console.error('getMinistryTasks error:', error);
    res.status(500).json({ error: 'Failed to load tasks' });
  }
});

router.post('/ministries/:id/tasks', async (req: AuthRequest, res) => {
  try {
    const ministry = await requireMinistry(req, res, req.params.id);
    if (!ministry) return;
    const { title, description, assigneeId, assigneeName, priority, dueDate, status } = req.body || {};
    if (!title || !String(title).trim()) {
      return res.status(400).json({ error: 'Task title is required' });
    }
    const now = new Date();
    const record = {
      id: genId('mtask'),
      tenantId: tid(req),
      ministryId: req.params.id,
      title: String(title).trim(),
      description: description || null,
      assigneeId: assigneeId || null,
      assigneeName: assigneeName || null,
      status: status || 'todo',
      priority: priority || 'medium',
      dueDate: dueDate ? new Date(dueDate) : null,
      completedAt: null,
      createdBy: uid(req),
      createdAt: now,
      updatedAt: now,
    };
    await db('ministry_tasks').insert(record);
    res.status(201).json(record);
  } catch (error) {
    console.error('createMinistryTask error:', error);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

router.put('/tasks/:taskId', async (req: AuthRequest, res) => {
  try {
    const existing = await db('ministry_tasks')
      .where({ id: req.params.taskId, tenantId: tid(req) })
      .first();
    if (!existing) return res.status(404).json({ error: 'Task not found' });
    const ministry = await requireMinistry(req, res, existing.ministryId);
    if (!ministry) return;
    const patch: any = { updatedAt: new Date() };
    for (const f of ['title', 'description', 'assigneeId', 'assigneeName', 'status', 'priority']) {
      if (req.body[f] !== undefined) patch[f] = req.body[f];
    }
    if (req.body.dueDate !== undefined) {
      patch.dueDate = req.body.dueDate ? new Date(req.body.dueDate) : null;
    }
    // Auto-stamp completion time when a task is marked done.
    if (req.body.status === 'done' && existing.status !== 'done') {
      patch.completedAt = new Date();
    }
    if (req.body.status && req.body.status !== 'done') {
      patch.completedAt = null;
    }
    await db('ministry_tasks').where({ id: req.params.taskId }).update(patch);
    const updated = await db('ministry_tasks').where({ id: req.params.taskId }).first();
    res.json(updated);
  } catch (error) {
    console.error('updateMinistryTask error:', error);
    res.status(500).json({ error: 'Failed to update task' });
  }
});

/* ------------------------------------------------------------------ */
/* Ministry-scoped events                                             */
/* ------------------------------------------------------------------ */
router.get('/ministries/:id/events', async (req: AuthRequest, res) => {
  try {
    const ministry = await requireMinistry(req, res, req.params.id);
    if (!ministry) return;
    const events = await db('events')
      .where({ tenantId: tid(req), ministryId: req.params.id })
      .orderBy('startTime', 'desc')
      .catch(() => []);
    res.json(events);
  } catch (error) {
    console.error('getMinistryEvents error:', error);
    res.status(500).json({ error: 'Failed to load events' });
  }
});

router.post('/ministries/:id/events', async (req: AuthRequest, res) => {
  try {
    const ministry = await requireMinistry(req, res, req.params.id);
    if (!ministry) return;
    const { title, description, location, startTime, endTime, category } = req.body || {};
    if (!title || !String(title).trim()) {
      return res.status(400).json({ error: 'Event title is required' });
    }
    const now = new Date();
    const record: any = {
      id: genId('evt'),
      tenantId: tid(req),
      ministryId: req.params.id,
      title: String(title).trim(),
      description: description || null,
      location: location || null,
      startTime: startTime ? new Date(startTime) : null,
      endTime: endTime ? new Date(endTime) : null,
      category: category || 'ministry',
      createdBy: uid(req),
      createdAt: now,
    };
    await db('events').insert(record);
    res.status(201).json(record);
  } catch (error) {
    console.error('createMinistryEvent error:', error);
    res.status(500).json({ error: 'Failed to create event' });
  }
});

/* ------------------------------------------------------------------ */
/* Attendance                                                         */
/* ------------------------------------------------------------------ */
router.get('/ministries/:id/attendance', async (req: AuthRequest, res) => {
  try {
    const ministry = await requireMinistry(req, res, req.params.id);
    if (!ministry) return;
    const records = await db('ministry_attendance')
      .where({ tenantId: tid(req), ministryId: req.params.id })
      .orderBy('sessionDate', 'desc')
      .catch(() => []);
    res.json(records);
  } catch (error) {
    console.error('getMinistryAttendance error:', error);
    res.status(500).json({ error: 'Failed to load attendance' });
  }
});

router.post('/ministries/:id/attendance', async (req: AuthRequest, res) => {
  try {
    const ministry = await requireMinistry(req, res, req.params.id);
    if (!ministry) return;
    const { title, sessionDate, presentCount, totalCount, notes } = req.body || {};
    // Default totalCount to the active roster size when not supplied.
    let total = Number(totalCount || 0);
    if (!total) {
      const rosterRow = await db('ministry_members')
        .where({ tenantId: tid(req), ministryId: req.params.id, status: 'active' })
        .count('id as count')
        .first()
        .catch(() => ({ count: 0 }));
      total = Number((rosterRow as any)?.count || 0);
    }
    const record = {
      id: genId('matt'),
      tenantId: tid(req),
      ministryId: req.params.id,
      title: title || 'Attendance',
      sessionDate: sessionDate ? new Date(sessionDate) : new Date(),
      presentCount: Number(presentCount || 0),
      totalCount: total,
      notes: notes || null,
      recordedBy: uid(req),
      createdAt: new Date(),
    };
    await db('ministry_attendance').insert(record);
    res.status(201).json(record);
  } catch (error) {
    console.error('recordMinistryAttendance error:', error);
    res.status(500).json({ error: 'Failed to record attendance' });
  }
});

/* ------------------------------------------------------------------ */
/* Reports: ministry growth, engagement, and task analytics            */
/* ------------------------------------------------------------------ */
router.get('/reports/overview', async (req: AuthRequest, res) => {
  try {
    const tenantId = tid(req);
    const now = new Date();
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

    // Resolve which ministries this report covers: a specific one (validated)
    // or every ministry the caller manages.
    let ministryIds: string[] = [];
    const requested = (req.query.ministryId as string) || '';
    if (requested) {
      const ministry = await requireMinistry(req, res, requested);
      if (!ministry) return;
      ministryIds = [requested];
    } else {
      let q = db('ministries').where({ tenantId });
      if (!isPrivileged(req)) q = q.where({ leaderId: uid(req) });
      const rows = await q.select('id').catch(() => []);
      ministryIds = rows.map((r: any) => r.id);
    }

    if (!ministryIds.length) {
      return res.json({
        generatedAt: now.toISOString(),
        summary: { totalMembers: 0, activeMembers: 0, totalTasks: 0, completedTasks: 0, taskCompletionRate: 0, upcomingEvents: 0, avgAttendance: 0 },
        attendanceTrend: [],
        taskTrend: [],
        rosterTrend: [],
      });
    }

    const inScope = (table: string) => db(table).where({ tenantId }).whereIn('ministryId', ministryIds);

    const [memberRow, activeRow, totalTaskRow, doneTaskRow, upcomingRow] = await Promise.all([
      inScope('ministry_members').count('id as count').first().catch(() => ({ count: 0 })),
      inScope('ministry_members').where({ status: 'active' }).count('id as count').first().catch(() => ({ count: 0 })),
      inScope('ministry_tasks').count('id as count').first().catch(() => ({ count: 0 })),
      inScope('ministry_tasks').where({ status: 'done' }).count('id as count').first().catch(() => ({ count: 0 })),
      inScope('events').where('startTime', '>=', now).count('id as count').first().catch(() => ({ count: 0 })),
    ]);

    const [attendanceRows, taskRows, memberRows] = await Promise.all([
      inScope('ministry_attendance').where('sessionDate', '>=', sixMonthsAgo).select('sessionDate', 'presentCount', 'totalCount').catch(() => []),
      inScope('ministry_tasks').where('completedAt', '>=', sixMonthsAgo).whereNotNull('completedAt').select('completedAt').catch(() => []),
      inScope('ministry_members').where('joinedAt', '>=', sixMonthsAgo).select('joinedAt').catch(() => []),
    ]);

    const monthKeys: { key: string; label: string }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      monthKeys.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleString('default', { month: 'short' }) });
    }
    const bucketCount = (rows: any[], field: string) => {
      const map: Record<string, number> = {};
      for (const r of rows) {
        if (!r[field]) continue;
        const d = new Date(r[field]);
        const k = `${d.getFullYear()}-${d.getMonth()}`;
        map[k] = (map[k] || 0) + 1;
      }
      return monthKeys.map((m) => ({ month: m.label, value: map[m.key] || 0 }));
    };
    const bucketAttendance = (rows: any[]) => {
      const sum: Record<string, { present: number; total: number }> = {};
      for (const r of rows) {
        if (!r.sessionDate) continue;
        const d = new Date(r.sessionDate);
        const k = `${d.getFullYear()}-${d.getMonth()}`;
        if (!sum[k]) sum[k] = { present: 0, total: 0 };
        sum[k].present += Number(r.presentCount || 0);
        sum[k].total += Number(r.totalCount || 0);
      }
      return monthKeys.map((m) => {
        const s = sum[m.key];
        return { month: m.label, value: s && s.total > 0 ? Math.round((s.present / s.total) * 100) : 0 };
      });
    };

    const totalTasks = Number((totalTaskRow as any)?.count || 0);
    const completedTasks = Number((doneTaskRow as any)?.count || 0);
    const avgAttendance = attendanceRows.length
      ? Math.round(
          attendanceRows.reduce((acc: number, a: any) => {
            const total = Number(a.totalCount || 0);
            return acc + (total > 0 ? (Number(a.presentCount || 0) / total) * 100 : 0);
          }, 0) / attendanceRows.length,
        )
      : 0;

    res.json({
      generatedAt: now.toISOString(),
      ministryCount: ministryIds.length,
      summary: {
        totalMembers: Number((memberRow as any)?.count || 0),
        activeMembers: Number((activeRow as any)?.count || 0),
        totalTasks,
        completedTasks,
        taskCompletionRate: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
        upcomingEvents: Number((upcomingRow as any)?.count || 0),
        avgAttendance,
      },
      attendanceTrend: bucketAttendance(attendanceRows),
      taskTrend: bucketCount(taskRows, 'completedAt'),
      rosterTrend: bucketCount(memberRows, 'joinedAt'),
    });
  } catch (error) {
    console.error('ministry reports error:', error);
    res.status(500).json({ error: 'Failed to load ministry reports' });
  }
});

export default router;
