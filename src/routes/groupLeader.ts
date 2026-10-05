import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import db from '../lib/db';
import { auditLog } from '../middleware/audit';
import type { AuthRequest } from '../middleware/auth';
import { groupWithMeetingDays } from '../lib/groupMeetingDays';
import { attendanceDateRange, defaultAttendanceRange, summarizeMemberAttendance } from '../lib/memberAttendance';
const router = Router();
router.use((req: AuthRequest, res, next) => {
  if (!req.user?.tenantId || !['GROUP_LEADER', 'CHURCH_ADMIN', 'PASTOR'].includes(req.user.role)) return res.status(403).json({ error: 'Group leader access required.' });
  next();
});
async function assignedGroup(req: AuthRequest, id: string) {
  let query = db('church_groups').where({ id, tenantId: req.user!.tenantId, active: true });
  if (req.user!.role === 'GROUP_LEADER') query = query.where({ leaderId: req.user!.uid });
  return query.first();
}
function dateRange(req: AuthRequest) { const d = defaultAttendanceRange(); return attendanceDateRange(req.query.from ?? d.from, req.query.to ?? d.to); }
async function attendance(tenantId: string, groupId: string, range: ReturnType<typeof attendanceDateRange>, memberId?: string) {
  let q = db('event_attendance as a')
    .join('events as e', function () { this.on('e.id', '=', 'a.eventId').andOn('e.tenantId', '=', 'a.tenantId'); })
    .join('members as m', function () { this.on('m.id', '=', 'a.memberId').andOn('m.tenantId', '=', 'a.tenantId'); })
    .where({ 'a.tenantId': tenantId, 'm.groupId': groupId })
    .where('e.startTime', '>=', range.start).where('e.startTime', '<', range.endExclusive);
  if (memberId) q = q.where('m.id', memberId);
  const rows = await q.select('a.id', 'a.memberId', 'a.eventId', 'a.present', 'a.status', 'a.method', 'a.checkInAt', 'e.title as eventTitle', 'e.startTime as eventStartTime').orderBy('e.startTime', 'desc').limit(10001);
  if (rows.length > 10000) throw Object.assign(new Error('Too many attendance records. Choose a shorter date range.'), { status: 422 });
  return rows;
}
router.use(auditLog('ACCESS_GROUP_CARE', 'group_care'));
const handle = (work: any) => async (req: AuthRequest, res: any) => {
  try { await work(req, res); } catch (e: any) { console.error('Group leader request failed:', e); res.status(e.status || 500).json({ error: e.status ? e.message : 'Could not load group information. Please retry.' }); }
};
router.get('/groups', handle(async (req: AuthRequest, res: any) => {
  let q = db('church_groups').where({ tenantId: req.user!.tenantId, active: true });
  if (req.user!.role === 'GROUP_LEADER') q = q.where({ leaderId: req.user!.uid });
  res.json({ data: (await q.orderBy('name')).map(groupWithMeetingDays) });
}));
router.get('/groups/:id/overview', handle(async (req: AuthRequest, res: any) => {
  const group = await assignedGroup(req, req.params.id); if (!group) return res.status(404).json({ error: 'Assigned group not found.' });
  let range; try { range = dateRange(req); } catch (e: any) { return res.status(400).json({ error: e.message }); }
  const tenantId = req.user!.tenantId;
  const members = await db('members').where({ tenantId, groupId: group.id }).select('id', 'firstName', 'lastName', 'membershipId', 'phone', 'email', 'membershipStatus').orderBy('lastName').limit(2001);
  if (members.length > 2000) return res.status(422).json({ error: 'This group exceeds 2,000 members. Split the group before loading its care dashboard.' });
  const marks = await attendance(tenantId, group.id, range);
  const ids = members.map(m => m.id);
  const followups = ids.length ? await db('group_followups').where({ tenantId, groupId: group.id }).whereIn('memberId', ids).orderBy('createdAt', 'desc').limit(1000) : [];
  res.json({ group: groupWithMeetingDays(group), from: range.from, to: range.to,
    members: members.map(m => { const s = summarizeMemberAttendance(marks.filter(a => a.memberId === m.id)); return { ...m, attendance: { present: s.present, absent: s.absent, unmarked: s.unmarked, rate: s.rate, marked: s.marked } }; }), followups });
}));
router.get('/groups/:id/members/:memberId/attendance', handle(async (req: AuthRequest, res: any) => {
  const group = await assignedGroup(req, req.params.id); if (!group) return res.status(404).json({ error: 'Assigned group not found.' });
  const member = await db('members').where({ id: req.params.memberId, tenantId: req.user!.tenantId, groupId: group.id }).select('id').first();
  if (!member) return res.status(404).json({ error: 'Group member not found.' });
  let range; try { range = dateRange(req); } catch (e: any) { return res.status(400).json({ error: e.message }); }
  res.json({ records: await attendance(req.user!.tenantId, group.id, range, member.id), from: range.from, to: range.to });
}));
router.post('/groups/:id/followups', handle(async (req: AuthRequest, res: any) => {
  const group = await assignedGroup(req, req.params.id); if (!group) return res.status(404).json({ error: 'Assigned group not found.' });
  const b = req.body || {};
  const member = await db('members').where({ id: String(b.memberId || ''), tenantId: req.user!.tenantId, groupId: group.id }).select('id').first();
  if (!member) return res.status(404).json({ error: 'Group member not found.' });
  if (!['call', 'visit', 'check-in', 'prayer', 'other'].includes(b.type) || typeof b.note !== 'string' || !b.note.trim() || b.note.length > 2000) return res.status(400).json({ error: 'Choose a care type and enter a note of at most 2,000 characters.' });
  if (b.dueAt && !Number.isFinite(new Date(b.dueAt).getTime())) return res.status(400).json({ error: 'Choose a valid follow-up date and time.' });
  const row = { id: randomUUID(), tenantId: req.user!.tenantId, groupId: group.id, memberId: member.id, createdBy: req.user!.uid, type: b.type, note: b.note.trim(), dueAt: b.dueAt ? new Date(b.dueAt) : null, status: 'open', createdAt: new Date(), updatedAt: new Date() };
  await db('group_followups').insert(row); res.status(201).json(row);
}));
router.patch('/groups/:id/followups/:followupId', handle(async (req: AuthRequest, res: any) => {
  const group = await assignedGroup(req, req.params.id); if (!group) return res.status(404).json({ error: 'Assigned group not found.' });
  const followup = await db('group_followups').where({ id: req.params.followupId, tenantId: req.user!.tenantId, groupId: group.id }).first();
  if (!followup || !await db('members').where({ id: followup.memberId, tenantId: req.user!.tenantId, groupId: group.id }).first()) return res.status(404).json({ error: 'Follow-up not found.' });
  if (!['open', 'completed'].includes(req.body?.status)) return res.status(400).json({ error: 'Choose open or completed.' });
  await db('group_followups').where({ id: followup.id, tenantId: req.user!.tenantId, groupId: group.id }).update({ status: req.body.status, updatedAt: new Date() }); res.json({ success: true });
}));
export default router;
