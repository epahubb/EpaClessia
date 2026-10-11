import { Router } from 'express';
import db from '../lib/db';
import { toDataUrl } from '../lib/images';
import type { AuthRequest } from '../middleware/auth';
const router = Router();
const roles = ['CHURCH_ADMIN', 'PASTOR', 'MINISTRY_LEADER', 'GROUP_LEADER', 'FINANCE', 'SECRETARY', 'MEMBER'];
router.use(async (req: AuthRequest, res, next) => { try {
    const account = await db('users').where({ uid: req.user?.uid }).select('uid', 'tenantId', 'role', 'name').first();
    if (!account?.tenantId || !roles.includes(account.role))
        return res.status(403).json({ error: 'Church workspace access required.' });
    (req as any).workspaceAccount = account;
    next();
}
catch {
    res.status(500).json({ error: 'Could not resolve your workspace.' });
} });
router.get('/identity', async (req: AuthRequest, res) => { try {
    const account = (req as any).workspaceAccount;
    const church = await db('tenants').where({ id: account.tenantId }).first();
    if (!church)
        return res.status(404).json({ error: 'Church not found.' });
    res.json({ name: church.name || 'Your church', logo: toDataUrl(church.logoImage, church.logoMimeType) || church.logo || null, role: account.role });
}
catch {
    res.status(500).json({ error: 'Could not load church identity.' });
} });
router.get('/secretary-summary', async (req: AuthRequest, res) => { const account = (req as any).workspaceAccount; if (!['SECRETARY', 'CHURCH_ADMIN', 'PASTOR'].includes(account.role))
    return res.status(403).json({ error: 'Secretary workspace access required.' }); try {
    const tenantId = account.tenantId, now = new Date();
    const [members, visitors, events, approvals, upcoming] = await Promise.all([db('members').where({ tenantId }).count('id as count').first(), db('visitors').where({ tenantId }).count('id as count').first(), db('events').where({ tenantId }).where('startTime', '>=', now).count('id as count').first(), db('members').where({ tenantId, approvalStatus: 'pending' }).count('id as count').first(), db('events').where({ tenantId }).where('startTime', '>=', now).select('id', 'title', 'startTime', 'location').orderBy('startTime').limit(6)]);
    res.json({ members: Number(members?.count || 0), visitors: Number(visitors?.count || 0), upcomingEvents: Number(events?.count || 0), pendingApprovals: Number(approvals?.count || 0), events: upcoming, generatedAt: new Date() });
}
catch {
    res.status(500).json({ error: 'Could not load secretary overview. Please retry.' });
} });
export default router;
