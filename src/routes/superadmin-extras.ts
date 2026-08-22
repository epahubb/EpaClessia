import { Router } from 'express';
import db from '../lib/db';
import {
  encryptSensitiveFields,
  decryptSensitiveFields,
  SENSITIVE_SETTING_KEYS,
} from '../lib/crypto';
import {
  getTransactionCharge,
  applyTransactionCharge,
} from '../lib/platformSettings';

/**
 * Additional platform (super-admin) endpoints that the frontend expects but
 * were not implemented on the Node backend: subscription plans, church
 * subscriptions, transactions, monthly revenue, login logs, and the
 * role/permission matrix. Mounted under /api/v1/superadmin (already protected
 * by authenticate + authorizeSuperAdmin in server.ts).
 */
const router = Router();

const PLAN_PRICES: Record<string, number> = {
  free_trial: 0,
  basic: 490,
  pro: 990,
  enterprise: 2490,
};

const PLANS = [
  { id: 'free_trial', name: 'Free Trial', price: 0, billingCycle: 'monthly', maxMembers: 100, features: { giving: true, sms: false, api: false, support: 'Community' } },
  { id: 'basic', name: 'Basic', price: 490, billingCycle: 'monthly', maxMembers: 500, features: { giving: true, sms: true, api: false, support: 'Email' } },
  { id: 'pro', name: 'Pro', price: 990, billingCycle: 'monthly', maxMembers: 2000, features: { giving: true, sms: true, api: true, support: 'Priority' } },
  { id: 'enterprise', name: 'Enterprise', price: 2490, billingCycle: 'monthly', maxMembers: 100000, features: { giving: true, sms: true, api: true, support: 'Dedicated' } },
];

// ---- Subscription plans (DB-backed, superadmin can create + assign features) ----
async function getPlans() {
  const rows = await db('subscription_plans').where({ active: true }).catch(() => [] as any[]);
  if (!rows || rows.length === 0) return PLANS;
  return rows.map((r: any) => ({
    id: r.id,
    name: r.name,
    price: Number(r.price || 0),
    billingCycle: r.billingCycle || 'monthly',
    maxMembers: Number(r.maxMembers || 0),
    features: r.features ? (typeof r.features === 'string' ? JSON.parse(r.features) : r.features) : {},
  }));
}

async function planPriceMap() {
  const plans = await getPlans();
  const map: Record<string, number> = {};
  plans.forEach((p: any) => { map[p.id] = Number(p.price || 0); });
  return { ...PLAN_PRICES, ...map };
}

router.get('/subscription-plans', async (_req, res) => { try { res.json(await getPlans()); } catch { res.json(PLANS); } });
router.get('/subscription-plans/', async (_req, res) => { try { res.json(await getPlans()); } catch { res.json(PLANS); } });

router.post('/subscription-plans', async (req, res) => {
  try {
    const { id, name, price = 0, billingCycle = 'monthly', maxMembers = 0, features = {} } = req.body || {};
    if (!name) return res.status(400).json({ error: 'Plan name is required' });
    const planId = id || `plan_${name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_${Date.now().toString().slice(-4)}`;
    await db('subscription_plans').insert({
      id: planId, name, price: Number(price), billingCycle, maxMembers: Number(maxMembers),
      features: JSON.stringify(features), active: true, createdAt: new Date(),
    });
    res.status(201).json({ id: planId });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to create plan' }); }
});

router.put('/subscription-plans/:id', async (req, res) => {
  try {
    const { name, price, billingCycle, maxMembers, features, active } = req.body || {};
    const update: any = {};
    if (name !== undefined) update.name = name;
    if (price !== undefined) update.price = Number(price);
    if (billingCycle !== undefined) update.billingCycle = billingCycle;
    if (maxMembers !== undefined) update.maxMembers = Number(maxMembers);
    if (features !== undefined) update.features = JSON.stringify(features);
    if (active !== undefined) update.active = Boolean(active);
    await db('subscription_plans').where({ id: req.params.id }).update(update);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Failed to update plan' }); }
});

router.delete('/subscription-plans/:id', async (req, res) => {
  try {
    await db('subscription_plans').where({ id: req.params.id }).update({ active: false });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Failed to delete plan' }); }
});

// ---- SMS packages (superadmin sets up bundles churches can buy) ----
router.get('/sms-packages', async (_req, res) => {
  try {
    const rows = await db('sms_packages').orderBy('price', 'asc');
    res.json(rows.map((r: any) => ({ ...r, active: Boolean(r.active) })));
  } catch (e) { res.status(500).json({ error: 'Failed to fetch SMS packages' }); }
});

router.post('/sms-packages', async (req, res) => {
  try {
    const { name, credits = 0, price = 0, currency = 'GHS', description = '' } = req.body || {};
    if (!name) return res.status(400).json({ error: 'Package name is required' });
    const id = `sms_${name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_${Date.now().toString().slice(-4)}`;
    await db('sms_packages').insert({ id, name, credits: Number(credits), price: Number(price), currency, description, active: true, createdAt: new Date() });
    res.status(201).json({ id });
  } catch (e) { res.status(500).json({ error: 'Failed to create SMS package' }); }
});

router.put('/sms-packages/:id', async (req, res) => {
  try {
    const { name, credits, price, currency, description, active } = req.body || {};
    const update: any = {};
    if (name !== undefined) update.name = name;
    if (credits !== undefined) update.credits = Number(credits);
    if (price !== undefined) update.price = Number(price);
    if (currency !== undefined) update.currency = currency;
    if (description !== undefined) update.description = description;
    if (active !== undefined) update.active = Boolean(active);
    await db('sms_packages').where({ id: req.params.id }).update(update);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Failed to update SMS package' }); }
});

router.delete('/sms-packages/:id', async (req, res) => {
  try { await db('sms_packages').where({ id: req.params.id }).delete(); res.json({ success: true }); }
  catch (e) { res.status(500).json({ error: 'Failed to delete SMS package' }); }
});

// ---- SMS purchases (records of church SMS bundle purchases) ----
router.get('/sms-purchases', async (_req, res) => {
  try {
    const rows = await db('sms_purchases').orderBy('createdAt', 'desc').limit(500);
    res.json(rows.map((r: any) => ({ ...r, amount: Number(r.amount || 0) })));
  } catch (e) { res.status(500).json({ error: 'Failed to fetch SMS purchases' }); }
});

router.post('/sms-purchases', async (req, res) => {
  try {
    const { packageId, tenantId, reference = '', status = 'completed' } = req.body || {};
    const pkg = await db('sms_packages').where({ id: packageId }).first();
    if (!pkg) return res.status(404).json({ error: 'SMS package not found' });
    const tenant = await db('tenants').where({ id: tenantId }).first();
    if (!tenant) return res.status(404).json({ error: 'Church not found' });
    await db('sms_purchases').insert({
      packageId: pkg.id, packageName: pkg.name, credits: pkg.credits,
      tenantId: tenant.id, tenantName: tenant.name, amount: pkg.price, currency: pkg.currency || 'GHS',
      status, reference, createdAt: new Date(),
    });
    if (status === 'completed') {
      await db('tenants').where({ id: tenant.id }).update({ smsCredits: Number(tenant.smsCredits || 0) + Number(pkg.credits || 0) });
    }
    res.status(201).json({ success: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to record SMS purchase' }); }
});

router.get('/sms-stats', async (_req, res) => {
  try {
    const purchases = await db('sms_purchases').where({ status: 'completed' });
    const totalRevenue = purchases.reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
    const totalCredits = purchases.reduce((s: number, p: any) => s + Number(p.credits || 0), 0);
    res.json({ totalRevenue, totalCredits, totalPurchases: purchases.length });
  } catch (e) { res.status(500).json({ error: 'Failed to compute SMS stats' }); }
});

async function churchSubscriptions() {
  const tenants = await db('tenants').whereNot('status', 'deleted');
  const prices = await planPriceMap();
  const planNames: Record<string, string> = {};
  (await getPlans()).forEach((p: any) => { planNames[p.id] = p.name; });
  return tenants.map((t: any) => ({
    id: `sub_${t.id}`,
    tenantId: t.id,
    tenantName: t.name,
    planId: t.planId,
    planName: planNames[t.planId] || (PLANS.find((p) => p.id === t.planId)?.name) || t.planId,
    startDate: t.createdAt,
    endDate: t.subscriptionEndDate || t.trialEndDate || null,
    status: t.status === 'active' ? 'active' : t.status === 'trial' ? 'active' : 'expired',
    autoRenew: t.status === 'active',
    amount: prices[t.planId] || 0,
    expiryDate: t.subscriptionEndDate || t.trialEndDate || null,
  }));
}

router.get('/church-subscriptions', async (_req, res) => {
  try {
    res.json(await churchSubscriptions());
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to fetch subscriptions' });
  }
});
router.get('/church-subscriptions/', async (_req, res) => {
  try {
    res.json(await churchSubscriptions());
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch subscriptions' });
  }
});

async function transactions() {
  const invoices = await db('invoices').orderBy('issueDate', 'desc').limit(200);
  return invoices.map((i: any) => ({
    id: i.id,
    tenantId: i.tenantId,
    tenantName: i.tenantName,
    amount: Number(i.amount || 0),
    date: i.paidAt || i.issueDate,
    planName: (PLANS.find((p) => p.id === i.planId)?.name) || i.planId,
    status: i.status === 'paid' ? 'success' : i.status === 'failed' ? 'refunded' : 'failed',
    invoiceUrl: '',
  }));
}

router.get('/transactions', async (_req, res) => {
  try {
    res.json(await transactions());
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});
router.get('/transactions/', async (_req, res) => {
  try {
    res.json(await transactions());
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

async function revenueMonthly() {
  const invoices = await db('invoices').where({ status: 'paid' });
  const buckets: Record<string, number> = {};
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    buckets[key] = 0;
  }
  for (const inv of invoices) {
    const when = new Date(inv.paidAt || inv.issueDate || inv.createdAt);
    if (isNaN(when.getTime())) continue;
    const key = `${when.getFullYear()}-${String(when.getMonth() + 1).padStart(2, '0')}`;
    if (key in buckets) buckets[key] += Number(inv.amount || 0);
  }
  return Object.entries(buckets).map(([month, revenue]) => ({ month, revenue }));
}

router.get('/revenue/monthly', async (_req, res) => {
  try {
    res.json(await revenueMonthly());
  } catch (e) {
    res.status(500).json({ error: 'Failed to compute revenue' });
  }
});
router.get('/revenue/monthly/', async (_req, res) => {
  try {
    res.json(await revenueMonthly());
  } catch (e) {
    res.status(500).json({ error: 'Failed to compute revenue' });
  }
});

async function loginLogs(limit: number) {
  const rows = await db('login_logs').orderBy('createdAt', 'desc').limit(limit);
  return rows.map((r: any) => ({
    id: String(r.id),
    userId: r.userId,
    userName: r.userName,
    email: r.email,
    timestamp: r.createdAt,
    ipAddress: r.ipAddress,
    success: Boolean(r.success),
  }));
}

router.get('/login-logs', async (req, res) => {
  try {
    res.json(await loginLogs(Number(req.query.limit) || 200));
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch login logs' });
  }
});
router.get('/login-logs/', async (req, res) => {
  try {
    res.json(await loginLogs(Number(req.query.limit) || 200));
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch login logs' });
  }
});

async function growthMonthly() {
  const tenants = await db('tenants').whereNot('status', 'deleted').select('createdAt').catch(() => [] as any[]);
  const members = await db('members').select('createdAt').catch(() => [] as any[]);
  const now = new Date();
  const keys: string[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  const cumulativeByMonth = (rows: any[], field: string) =>
    keys.map((key) => {
      const [y, m] = key.split('-').map(Number);
      const endOfMonth = new Date(y, m, 1).getTime(); // first instant of next month
      return rows.filter((r) => {
        const t = new Date(r[field]).getTime();
        return !isNaN(t) && t < endOfMonth;
      }).length;
    });
  const churchCum = cumulativeByMonth(tenants, 'createdAt');
  const memberCum = cumulativeByMonth(members, 'createdAt');
  return keys.map((month, idx) => ({ month, churches: churchCum[idx], members: memberCum[idx] }));
}

router.get('/growth/monthly', async (_req, res) => {
  try { res.json(await growthMonthly()); }
  catch (e) { res.status(500).json({ error: 'Failed to compute growth' }); }
});
router.get('/growth/monthly/', async (_req, res) => {
  try { res.json(await growthMonthly()); }
  catch (e) { res.status(500).json({ error: 'Failed to compute growth' }); }
});

const PERM = (id: string, name: string, code: string, description: string) => ({ id, name, code, description });
const ALL_PERMS = [
  PERM('p1', 'Manage Churches', 'churches.manage', 'Create, edit, suspend, and delete church tenants'),
  PERM('p2', 'Manage Billing', 'billing.manage', 'Issue invoices and record payments'),
  PERM('p3', 'Manage Users', 'users.manage', 'Create and manage platform users'),
  PERM('p4', 'Manage Members', 'members.manage', 'Create and manage church members'),
  PERM('p5', 'Manage Events', 'events.manage', 'Create events and run check-in'),
  PERM('p6', 'Manage Giving', 'giving.manage', 'Record and reconcile giving'),
  PERM('p7', 'Send Communications', 'comms.send', 'Send SMS and announcements'),
  PERM('p8', 'View Reports', 'reports.view', 'View analytics and reports'),
  PERM('p9', 'Manage Settings', 'settings.manage', 'Configure platform and church settings'),
];

const ROLE_PERMISSIONS = [
  { role: 'SUPER_ADMIN', permissions: ALL_PERMS },
  { role: 'CHURCH_ADMIN', permissions: ALL_PERMS.filter((p) => !['churches.manage', 'billing.manage', 'users.manage'].includes(p.code)) },
  { role: 'PASTOR', permissions: ALL_PERMS.filter((p) => ['members.manage', 'events.manage', 'giving.manage', 'comms.send', 'reports.view'].includes(p.code)) },
  { role: 'MINISTRY_LEADER', permissions: ALL_PERMS.filter((p) => ['members.manage', 'events.manage', 'comms.send'].includes(p.code)) },
  { role: 'MEMBER', permissions: [] },
];

async function getRolesPermissions() {
  const rows = await db('role_permissions').catch(() => [] as any[]);
  if (!rows || rows.length === 0) return ROLE_PERMISSIONS;
  return rows.map((r: any) => {
    const codes: string[] = r.permissions ? (typeof r.permissions === 'string' ? JSON.parse(r.permissions) : r.permissions) : [];
    return { role: r.role, permissions: ALL_PERMS.filter((p) => codes.includes(p.code)) };
  });
}

router.get('/roles-permissions', async (_req, res) => { try { res.json(await getRolesPermissions()); } catch { res.json(ROLE_PERMISSIONS); } });
router.get('/roles-permissions/', async (_req, res) => { try { res.json(await getRolesPermissions()); } catch { res.json(ROLE_PERMISSIONS); } });

// Expose full catalogue of available permissions for the RBAC editor.
router.get('/permissions-catalog', (_req, res) => res.json(ALL_PERMS));

// Persist a role's permission set (array of permission codes).
router.put('/roles-permissions/:role', async (req, res) => {
  try {
    const role = req.params.role;
    const codes: string[] = Array.isArray(req.body?.permissions) ? req.body.permissions : [];
    const exists = await db('role_permissions').where({ role }).first();
    if (exists) {
      await db('role_permissions').where({ role }).update({ permissions: JSON.stringify(codes), updatedAt: new Date() });
    } else {
      await db('role_permissions').insert({ role, permissions: JSON.stringify(codes), updatedAt: new Date() });
    }
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Failed to update role permissions' }); }
});

// Update a specific user's role + custom permission overrides within a church.
router.put('/user-tenant-roles/:id/permissions', async (req, res) => {
  try {
    const { role, permissions } = req.body || {};
    const update: any = {};
    if (role !== undefined) update.role = role;
    if (permissions !== undefined) update.permissions = JSON.stringify(permissions);
    await db('user_tenant_roles').where({ id: req.params.id }).update(update);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Failed to update user permissions' }); }
});


/* ================================================================== */
/* Church configuration owned by the platform administrator            */
/* ================================================================== */

/**
 * SMS, email, payment gateway, integrations and backup are configured by the
 * super admin on behalf of each church, so these endpoints read and write a
 * specific tenant's `church_settings` rows. The church-facing API refuses
 * writes to the same sections.
 */
const MANAGED_SECTIONS = ['sms', 'email', 'payment', 'paystack', 'integration', 'backup'];

router.get('/churches/:tenantId/settings', async (req, res) => {
  try {
    const { tenantId } = req.params;
    const tenant = await db('tenants').where({ id: tenantId }).first();
    if (!tenant) return res.status(404).json({ error: 'Church not found' });

    const rows = await db('church_settings').where({ tenantId });
    const out: Record<string, any> = {};
    for (const r of rows) {
      try {
        out[r.key] = JSON.parse(r.value);
      } catch { /* ignore malformed rows */ }
    }
    // Secrets are masked on the way out; a re-save that leaves the mask in
    // place keeps the stored value (see the PUT below).
    const masked = decryptSensitiveFields(out, true);
    res.json({
      churchName: tenant.name,
      tenantId,
      managedSections: MANAGED_SECTIONS,
      settings: masked,
    });
  } catch (e) {
    console.error('GET /churches/:tenantId/settings error:', e);
    res.status(500).json({ error: 'Failed to load church settings' });
  }
});

router.put('/churches/:tenantId/settings/:key', async (req, res) => {
  try {
    const { tenantId, key } = req.params;
    if (!MANAGED_SECTIONS.includes(key)) {
      return res.status(400).json({
        error: `'${key}' is not a platform-managed section. Managed sections are: ${MANAGED_SECTIONS.join(', ')}.`,
      });
    }
    const tenant = await db('tenants').where({ id: tenantId }).first();
    if (!tenant) return res.status(404).json({ error: 'Church not found' });

    const row = await db('church_settings').where({ tenantId, key }).first();
    let previous: Record<string, any> = {};
    if (row?.value) {
      try { previous = JSON.parse(row.value); } catch { previous = {}; }
    }

    // Preserve a stored secret when the form posts back the mask rather than a
    // new value, so an unrelated edit cannot wipe live credentials.
    const incoming: Record<string, any> = { ...(req.body || {}) };
    for (const field of SENSITIVE_SETTING_KEYS) {
      if (field in incoming) {
        const v = incoming[field];
        if (v === '' || v === null || v === undefined || (typeof v === 'string' && v.includes('\u2022'))) {
          if (field in previous) incoming[field] = previous[field];
          else delete incoming[field];
        }
      }
    }

    const merged = encryptSensitiveFields({ ...previous, ...incoming });
    const value = JSON.stringify(merged);
    const stamp = { value, updatedAt: new Date(), managedBy: 'superadmin', updatedBy: (req as any).user?.uid || null };

    if (row) {
      await db('church_settings').where({ tenantId, key }).update(stamp);
    } else {
      await db('church_settings').insert({ tenantId, key, ...stamp });
    }
    res.json({ success: true, message: `${key} settings saved for ${tenant.name}.` });
  } catch (e) {
    console.error('PUT /churches/:tenantId/settings/:key error:', e);
    res.status(500).json({ error: 'Failed to save church settings' });
  }
});

/**
 * Pushes the platform defaults for one section to every church at once, which
 * is how a new gateway or SMS account gets rolled out without visiting each
 * church individually.
 */
router.post('/churches/settings/apply-to-all/:key', async (req, res) => {
  try {
    const { key } = req.params;
    if (!MANAGED_SECTIONS.includes(key)) {
      return res.status(400).json({ error: `'${key}' is not a platform-managed section.` });
    }
    const platformKey = key === 'paystack' ? 'payment' : key;
    const platformRow = await db('system_settings').where({ key: platformKey }).first();
    if (!platformRow?.value) {
      return res.status(400).json({ error: `Configure the platform ${platformKey} settings first.` });
    }

    const overwrite = req.body?.overwrite !== false;
    const tenants = await db('tenants').select('id');
    let applied = 0;
    for (const t of tenants) {
      const existing = await db('church_settings').where({ tenantId: t.id, key }).first();
      if (existing && !overwrite) continue;
      const stamp = {
        value: platformRow.value,
        updatedAt: new Date(),
        managedBy: 'superadmin',
        updatedBy: (req as any).user?.uid || null,
      };
      if (existing) await db('church_settings').where({ tenantId: t.id, key }).update(stamp);
      else await db('church_settings').insert({ tenantId: t.id, key, ...stamp });
      applied += 1;
    }
    res.json({ success: true, applied, churches: tenants.length });
  } catch (e) {
    console.error('POST /churches/settings/apply-to-all error:', e);
    res.status(500).json({ error: 'Failed to apply settings to all churches' });
  }
});

/* ================================================================== */
/* Platform transaction charge                                         */
/* ================================================================== */

/**
 * The charge applied to every transaction that flows through the platform
 * (member giving, SMS bundle purchases, invoices). Stored with the payment
 * gateway configuration so there is one place where charging lives.
 */
router.get('/transaction-charge', async (_req, res) => {
  try {
    const charge = await getTransactionCharge();
    // Show a worked example so the effect of the numbers is obvious.
    const example = applyTransactionCharge(100, charge);
    res.json({ ...charge, example });
  } catch (e) {
    res.status(500).json({ error: 'Failed to load the transaction charge' });
  }
});

router.put('/transaction-charge', async (req, res) => {
  try {
    const num = (v: unknown) => {
      const n = Number(v);
      return Number.isFinite(n) && n >= 0 ? n : 0;
    };
    const percent = num(req.body?.percent);
    const flat = num(req.body?.flat);
    const cap = num(req.body?.cap);
    if (percent > 100) {
      return res.status(400).json({ error: 'A percentage charge cannot exceed 100%.' });
    }

    const row = await db('system_settings').where({ key: 'payment' }).first();
    let payment: Record<string, any> = {};
    if (row?.value) {
      try { payment = JSON.parse(row.value); } catch { payment = {}; }
    }
    // Only the charge fields are touched: the gateway credentials in this same
    // blob are already encrypted and must be written back untouched.
    payment.transactionChargePercent = percent;
    payment.transactionChargeFlat = flat;
    payment.transactionChargeCap = cap;
    payment.transactionChargeBearer = req.body?.bearer === 'recipient' ? 'recipient' : 'payer';
    payment.transactionChargeEnabled = req.body?.enabled === false ? false : true;

    const value = JSON.stringify(payment);
    if (row) await db('system_settings').where({ key: 'payment' }).update({ value, updatedAt: new Date() });
    else await db('system_settings').insert({ key: 'payment', value, updatedAt: new Date() });

    const charge = await getTransactionCharge();
    res.json({ success: true, ...charge, example: applyTransactionCharge(100, charge) });
  } catch (e) {
    console.error('PUT /transaction-charge error:', e);
    res.status(500).json({ error: 'Failed to save the transaction charge' });
  }
});

export default router;
