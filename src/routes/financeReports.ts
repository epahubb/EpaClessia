import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import db from '../lib/db';
import { auditLog } from '../middleware/audit';
import type { AuthRequest } from '../middleware/auth';
import { financeRange, financeTotals, moneyCents } from '../lib/financeReports';
const router = Router();
router.use((req: AuthRequest, res, next) => {
  if (!req.user?.tenantId || !['CHURCH_ADMIN', 'PASTOR', 'FINANCE'].includes(req.user.role)) return res.status(403).json({ error: 'Finance access required.' });
  next();
});
router.use(auditLog('ACCESS_FINANCIAL_DOCUMENTS', 'financial_documents'));
const handle = (work: any) => async (req: AuthRequest, res: any) => { try { await work(req, res); } catch (e: any) { console.error('Finance document request failed:', e); res.status(e.status || 500).json({ error: e.status ? e.message : 'Could not load financial documents. Please retry.' }); } };
router.get('/member-options', handle(async (req: AuthRequest, res: any) => { const data = await db('members').where({ tenantId: req.user!.tenantId }).select('id', 'firstName', 'lastName', 'membershipId', 'membershipStatus').orderBy('lastName'); res.json({ data }); }));
router.get('/report', handle(async (req: AuthRequest, res: any) => {
  let range; try { range = financeRange(req.query.from, req.query.to); } catch (e: any) { return res.status(400).json({ error: e.message }); }
  const horizon = Number(req.query.horizon || 3); if (![1, 3, 6, 12].includes(horizon)) return res.status(400).json({ error: 'Choose a forecast of 1, 3, 6 or 12 months.' });
  const tenantId = req.user!.tenantId;
  const [giving, expenses, invoices, budgets, pledges, church] = await Promise.all([
    db('donations').where({ tenantId }).whereRaw('COALESCE(??, ??) >= ?', ['receivedAt', 'createdAt', range.start]).whereRaw('COALESCE(??, ??) < ?', ['receivedAt', 'createdAt', range.endExclusive]).orderBy('createdAt', 'desc').limit(10001),
    db('expenses').where({ tenantId }).whereRaw('COALESCE(??, ??) >= ?', ['date', 'createdAt', range.start]).whereRaw('COALESCE(??, ??) < ?', ['date', 'createdAt', range.endExclusive]).orderBy('createdAt', 'desc').limit(10001),
    db('church_finance_invoices').where({ tenantId }).where('issueAt', '>=', range.start).where('issueAt', '<', range.endExclusive).orderBy('issueAt', 'desc').limit(10001),
    db('budgets').where({ tenantId }).orderBy('fiscalYear', 'desc').limit(10001), db('pledges').where({ tenantId }).orderBy('createdAt', 'desc').limit(10001),
    db('tenants').where({ id: tenantId }).select('name').first(),
  ]);
  if ([giving, expenses, invoices, budgets, pledges].some(rows => rows.length > 10000)) return res.status(422).json({ error: 'This report exceeds 10,000 rows. Narrow the period or request an administrator-assisted export.' });
  // No bank, card or wallet account details are emitted in printable documents.
  const safeGiving = giving.map(g => ({ id: g.id, donorName: g.donorName, purpose: g.purpose, amount: g.amount, currency: g.currency, status: g.status, paymentMethod: g.paymentMethod, receivedAt: g.receivedAt || g.createdAt, createdAt: g.createdAt, reference: g.reference || g.transactionId || g.transferReference || String(g.id) }));
  const safeExpenses = expenses.map(e => ({ id: e.id, category: e.category, description: e.description, vendor: e.vendor, amount: e.amount, currency: e.currency, status: e.status, paymentMethod: e.paymentMethod, date: e.date || e.createdAt, createdAt: e.createdAt }));
  res.json({ churchName: church?.name || 'Church', from: range.from, to: range.to, horizon, generatedAt: new Date(), totals: financeTotals(giving, expenses, range.from, range.to, horizon), giving: safeGiving, expenses: safeExpenses, invoices, budgets, pledges,
    forecastMethod: 'Daily average of completed income and paid expenses in the selected UTC period × 30.4375 days × forecast months. An estimate, not guaranteed income. Invoice payments are not included in giving totals.' });
}));
router.get('/invoices', handle(async (req: AuthRequest, res: any) => { res.json({ data: await db('church_finance_invoices').where({ tenantId: req.user!.tenantId }).orderBy('issueAt', 'desc').limit(1000) }); }));
router.post('/invoices', handle(async (req: AuthRequest, res: any) => {
  const b = req.body || {}; let amount;
  try { amount = moneyCents(b.amount) / 100; } catch { return res.status(400).json({ error: 'Enter a valid invoice amount.' }); }
  if (!(amount > 0) || typeof b.recipient !== 'string' || !b.recipient.trim() || b.recipient.length > 200 || typeof b.description !== 'string' || !b.description.trim() || b.description.length > 2000) return res.status(400).json({ error: 'Enter a recipient, description and positive amount.' });
  if (!/^[A-Z]{3}$/.test(b.currency || 'GHS')) return res.status(400).json({ error: 'Use a three-letter currency code, such as GHS.' });
  const issueAt = b.issueAt ? new Date(b.issueAt) : new Date(), dueAt = b.dueAt ? new Date(b.dueAt) : null;
  if (!Number.isFinite(issueAt.getTime()) || (dueAt && (!Number.isFinite(dueAt.getTime()) || dueAt < issueAt))) return res.status(400).json({ error: 'Choose valid dates; the due date cannot precede the issue date.' });
  const row = { id: `INV-${randomUUID()}`, tenantId: req.user!.tenantId, recipient: b.recipient.trim(), description: b.description.trim(), amount, currency: b.currency || 'GHS', status: 'issued', issueAt, dueAt, createdAt: new Date(), recordedBy: req.user!.uid };
  await db('church_finance_invoices').insert(row); res.status(201).json(row);
}));
router.patch('/invoices/:id', handle(async (req: AuthRequest, res: any) => {
  if (!['issued', 'paid', 'void'].includes(req.body?.status)) return res.status(400).json({ error: 'Choose issued, paid or void.' });
  const updated = await db('church_finance_invoices').where({ id: req.params.id, tenantId: req.user!.tenantId }).update({ status: req.body.status });
  if (!updated) return res.status(404).json({ error: 'Invoice not found.' }); res.json({ success: true });
}));
export default router;
