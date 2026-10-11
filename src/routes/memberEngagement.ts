import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import db from '../lib/db';
import { ministryCounts } from '../lib/ministryRoster';
import { groupWithMeetingDays } from '../lib/groupMeetingDays';
import { toDataUrl } from '../lib/images';
const router = Router();
const handle = (work: any) => async (req: any, res: any) => { try { await work(req, res); } catch (e) { console.error('Member engagement request failed:', e); res.status(500).json({ error: 'Could not load this church feature. Please retry.' }); } };
const context = (req: any) => ({ tenantId: req.tenantId, member: req.memberRecord, user: req.dbUser });
router.get('/branding', handle(async (req: any, res: any) => {
  const church = await db('tenants').where({ id: context(req).tenantId }).first();
  res.json({ name: church?.name || 'Your church', logo: toDataUrl(church?.logoImage, church?.logoMimeType) || church?.logo || null });
}));
router.get('/groups', handle(async (req: any, res: any) => {
  const { tenantId, member } = context(req);
  const [groups, ministries, counts, links] = await Promise.all([
    db('church_groups').where({ tenantId, active: true }).orderBy('name'),
    db('ministries').where({ tenantId, status: 'active' }).orderBy('name'), ministryCounts(db, tenantId),
    member ? db('ministry_members').where({ tenantId, memberId: member.id }).select('ministryId') : Promise.resolve([]),
  ]);
  const joined = new Set(links.map((x: any) => x.ministryId));
  const groupCounts = await db('members').where({ tenantId }).whereNotNull('groupId').groupBy('groupId').select('groupId').count('id as count');
  const gc = Object.fromEntries(groupCounts.map(x => [x.groupId, Number(x.count)]));
  res.json([...groups.map(g => ({ ...groupWithMeetingDays(g), kind: 'group', type: 'Group', memberCount: gc[g.id] || 0, joined: member?.groupId === g.id, canJoin: false })),
    ...ministries.map(m => ({ ...m, kind: 'ministry', memberCount: counts[m.id] || 0, joined: joined.has(m.id) || member?.ministryId === m.id, canJoin: Boolean(member) }))]);
}));
for (const action of ['join', 'leave']) router.post('/groups/:id/'+action, handle(async (req: any, res: any) => {
  const { tenantId, member } = context(req); if (!member) return res.status(409).json({ error: 'Ask your administrator to link your member profile first.' });
  const ministry = await db('ministries').where({ id: req.params.id, tenantId, status: 'active' }).first();
  if (!ministry) return res.status(404).json({ error: 'Active ministry not found. Group assignments are managed by your administrator.' });
  await db.transaction(async trx => {
    await trx('members').where({ id: member.id, tenantId }).forUpdate().first();
    const match = { tenantId, memberId: member.id, ministryId: ministry.id };
    if (action === 'leave') { await trx('ministry_members').where(match).delete(); if (member.ministryId === ministry.id) await trx('members').where({ id: member.id, tenantId }).update({ ministryId: null }); }
    else if (!await trx('ministry_members').where(match).first()) await trx('ministry_members').insert({ id: randomUUID(), ...match, name: [member.firstName, member.lastName].join(' '), role: 'member', status: 'active', joinedAt: new Date(), createdAt: new Date() });
  }); res.json({ success: true });
}));
router.get('/sermons', handle(async (req: any, res: any) => res.json({ data: await db('sermons').where({ tenantId: context(req).tenantId, published: true }).orderBy('date', 'desc').orderBy('createdAt', 'desc').limit(200) })));
const publicPrayer = (p: any) => ({ id: p.id, requesterName: p.requesterName, request: p.request, category: p.category, status: p.status, isPrivate: p.isPrivate, createdAt: p.createdAt });
router.get('/prayers', handle(async (req: any, res: any) => {
  const { tenantId, user } = context(req);
  const [mine, wall] = await Promise.all([db('prayer_requests').where({ tenantId, createdBy: user.uid }).orderBy('createdAt', 'desc').limit(200), db('prayer_requests').where({ tenantId, isPrivate: false }).whereNot('status', 'closed').orderBy('createdAt', 'desc').limit(200)]);
  res.json({ mine: mine.map(publicPrayer), wall: wall.map(publicPrayer) });
}));
router.post('/prayers', handle(async (req: any, res: any) => {
  const { tenantId, member, user } = context(req); const b = req.body || {};
  if (typeof b.request !== 'string' || !b.request.trim() || b.request.length > 4000) return res.status(400).json({ error: 'Enter a prayer request of at most 4,000 characters.' });
  if (b.isPrivate !== undefined && typeof b.isPrivate !== 'boolean' || b.anonymous !== undefined && typeof b.anonymous !== 'boolean') return res.status(400).json({ error: 'Choose valid privacy options.' });
  const category = ['general','healing','family','financial','thanksgiving','guidance'].includes(b.category) ? b.category : 'general';
  const row = { id: randomUUID(), tenantId, requesterName: b.anonymous ? 'Anonymous' : user.name, requesterMemberId: member?.id || null, request: b.request.trim(), category, isPrivate: Boolean(b.isPrivate), status: 'open', createdBy: user.uid, createdAt: new Date(), updatedAt: new Date() };
  await db('prayer_requests').insert(row); res.status(201).json(publicPrayer(row));
}));
const preferences = (m: any) => ({ hasProfile: Boolean(m), directoryOptIn: Boolean(m?.directoryOptIn), directoryShowPhone: Boolean(m?.directoryShowPhone), directoryShowEmail: Boolean(m?.directoryShowEmail) });
router.get('/directory/preferences', handle(async (req: any, res: any) => res.json(preferences(context(req).member))));
router.put('/directory/preferences', handle(async (req: any, res: any) => {
  const { tenantId, member } = context(req); if (!member) return res.status(409).json({ error: 'A linked member profile is required.' });
  const body = req.body || {}; const updates: any = {}; for (const key of ['directoryOptIn','directoryShowPhone','directoryShowEmail']) if (key in body) { if (typeof body[key] !== 'boolean') return res.status(400).json({ error: 'Privacy preferences must be true or false.' }); updates[key] = body[key]; }
  if (Object.keys(updates).length) await db('members').where({ id: member.id, tenantId }).update(updates);
  res.json(preferences({ ...member, ...updates }));
}));
router.get('/directory', handle(async (req: any, res: any) => {
  const rows = await db('members').where({ tenantId: context(req).tenantId, directoryOptIn: true, membershipStatus: 'active' }).select('id','firstName','lastName','photoUrl','occupation','phone','email','directoryShowPhone','directoryShowEmail').orderBy('lastName').limit(1000);
  res.json({ data: rows.map(m => ({ id: m.id, name: [m.firstName,m.lastName].join(' '), photoUrl: m.photoUrl, occupation: m.occupation, phone: m.directoryShowPhone ? m.phone : null, email: m.directoryShowEmail ? m.email : null })) });
}));
export default router;
