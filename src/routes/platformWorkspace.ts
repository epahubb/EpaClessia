import { Router } from 'express';
import db from '../lib/db';
import { authorizeSuperAdmin } from '../middleware/auth';
import { invoiceStatusQuery, monthKeys, summarizePlatformBilling, ticketStatusQuery } from '../lib/platformWorkspace';
const router = Router();
router.use(authorizeSuperAdmin);
router.get('/workspace-overview', async (_req, res) => {
    try {
        const now = new Date(), start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1)), in30 = new Date(now.getTime() + 30 * 86400000);
        const churches = () => db('tenants').whereNot('status', 'deleted');
        const expiries = () => churches().whereIn('status', ['active', 'pending', 'trial']).where(function () { this.where(function () { this.whereNotNull('subscriptionEndDate').whereBetween('subscriptionEndDate', [now, in30]); }).orWhere(function () { this.whereNull('subscriptionEndDate').whereBetween('trialEndDate', [now, in30]); }); });
        const unresolved = () => ticketStatusQuery(db('support_tickets'), 'unresolved');
        const overdue = () => invoiceStatusQuery(db('invoices'), 'overdue', now);
        const [churchCount, active, pending, suspended, members, users, openTickets, urgent, late, expiring, renewals, recent, support, invoices, paid, registrations, activity, plans] = await Promise.all([
            churches().count('id as n').first(), churches().where({ status: 'active' }).count('id as n').first(), churches().where({ status: 'pending' }).count('id as n').first(), churches().where({ status: 'suspended' }).count('id as n').first(), db('members').join('tenants', 'members.tenantId', 'tenants.id').whereNot('tenants.status', 'deleted').count('members.id as n').first(), db('users').count('uid as n').first(), unresolved().count('id as n').first(), unresolved().where({ priority: 'urgent' }).count('id as n').first(), overdue().count('id as n').first(), expiries().count('id as n').first(), expiries().select('id', 'name', 'planId', 'subscriptionEndDate', 'trialEndDate').orderBy(db.raw('COALESCE(??, ??)', ['subscriptionEndDate', 'trialEndDate'])).limit(8), churches().select('id', 'name', 'status', 'planId', 'city', 'country', 'createdAt').orderBy('createdAt', 'desc', 'last').limit(6), unresolved().select('id', 'ticketNumber', 'subject', 'priority', 'status', 'tenantName', 'createdAt').orderBy('createdAt', 'asc').limit(6), overdue().select('id', 'tenantName', 'amount', 'currency', 'status', 'dueDate').orderBy('dueDate').limit(6), db('invoices').where({ status: 'paid' }).where(function () { this.where('paidAt', '>=', start).orWhere(function () { this.whereNull('paidAt').where('issueDate', '>=', start); }).orWhere(function () { this.whereNull('paidAt').whereNull('issueDate').where('createdAt', '>=', start); }); }).select('amount', 'currency', 'status', 'paidAt', 'issueDate', 'createdAt'), churches().where('createdAt', '>=', start).where('createdAt', '<=', now).select('createdAt'), db('audit_logs').leftJoin('users', 'audit_logs.adminUid', 'users.uid').select('audit_logs.id', 'audit_logs.action', 'audit_logs.resource', 'audit_logs.resourceId', 'audit_logs.createdAt', 'users.name as userName').orderBy('audit_logs.createdAt', 'desc').limit(6), churches().select('planId').count('id as count').groupBy('planId')
        ]);
        const keys = monthKeys(now), growth = keys.map(month => ({ month, value: registrations.filter((r: any) => r.createdAt && new Date(r.createdAt).toISOString().slice(0, 7) === month).length }));
        await db.raw('select 1');
        res.json({ generatedAt: now.toISOString(), counts: { churches: Number(churchCount?.n || 0), activeChurches: Number(active?.n || 0), pendingChurches: Number(pending?.n || 0), suspendedChurches: Number(suspended?.n || 0), memberRecords: Number(members?.n || 0), userAccounts: Number(users?.n || 0), openTickets: Number(openTickets?.n || 0), urgentTickets: Number(urgent?.n || 0), overdueInvoices: Number(late?.n || 0), expiringChurches: Number(expiring?.n || 0) }, billing: summarizePlatformBilling(paid, now), growth, renewals: renewals.map((r: any) => ({ ...r, expiryDate: r.subscriptionEndDate || r.trialEndDate })).sort((a: any, b: any) => +new Date(a.expiryDate) - +new Date(b.expiryDate)), recentChurches: recent, support, invoices, activity, plans: plans.map((p: any) => ({ planId: p.planId || 'Unassigned', count: Number(p.count) })), health: { database: 'responding', engine: db.client.config.client, uptimeSeconds: Math.floor(process.uptime()), measuredAt: now.toISOString() } });
    }
    catch (error) {
        console.error('[platform-workspace] Overview query failed.');
        res.status(500).json({ error: 'Platform overview is temporarily unavailable. Please retry.' });
    }
});
export default router;
