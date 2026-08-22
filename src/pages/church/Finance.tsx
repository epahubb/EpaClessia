import React, { useEffect, useState } from 'react';
import { Box, Typography, Tabs, Tab, Grid, Card, CardContent, Chip } from '@mui/material';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip as RTooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import CrudTable from '../../components/church/CrudTable';
import churchApi from '../../services/churchApi';

const GHS = (n: number) => new Intl.NumberFormat('en-GH', { style: 'currency', currency: 'GHS', maximumFractionDigits: 0 }).format(Number(n) || 0);
const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4', '#a855f7', '#ec4899'];

const DEFAULT_PURPOSES = ['Tithe', 'Offering', 'Welfare', 'Donation', 'Building Fund', 'Missions'];
const methodOpts = [{ value: 'cash', label: 'Cash' }, { value: 'card', label: 'Card' }, { value: 'mobile_money', label: 'Mobile Money' }, { value: 'bank', label: 'Bank Transfer' }, { value: 'cheque', label: 'Cheque' }];
const asOptions = (values: string[]) => values.map(v => ({ value: v, label: v }));
const momoNetworks = asOptions(['MTN MoMo', 'Telecel Cash', 'AirtelTigo Money', 'Other']);

/**
 * The extra boxes a user fills once they pick a payment method other than
 * cash. Money that arrives through mobile money or a bank must carry enough
 * information (transaction ID, sender, bank reference) to be matched against
 * the wallet statement later; cash entries stay short and simple.
 *
 * `field` is the name of the payment-method field on the form, because giving
 * and expenses store it under the same name but pledges are recorded
 * separately.
 */
const paymentDetailFields = (field = 'paymentMethod'): any[] => {
  const is = (...methods: string[]) => (form: any) => methods.includes(form?.[field]);
  return [
    { name: '__momoSection', label: 'Mobile money details', type: 'section', helperText: 'Recorded so this gift can be traced in the mobile money statement.', showIf: is('mobile_money') },
    { name: 'transactionId', label: 'Transaction ID', required: true, showIf: is('mobile_money'), helperText: 'The reference from the mobile money confirmation message.' },
    { name: 'senderName', label: "Sender's name", required: true, showIf: is('mobile_money') },
    { name: 'senderNumber', label: "Sender's number", required: true, showIf: is('mobile_money'), helperText: 'For example 0244123456.' },
    { name: 'mobileMoneyNetwork', label: 'Network', type: 'select', options: momoNetworks, showIf: is('mobile_money') },

    { name: '__bankSection', label: 'Bank transfer details', type: 'section', helperText: 'Recorded so this transfer can be matched to the bank statement.', showIf: is('bank') },
    { name: 'bankName', label: 'Bank name', required: true, showIf: is('bank') },
    { name: 'transferReference', label: 'Transfer reference', required: true, showIf: is('bank') },
    { name: 'bankAccountName', label: 'Account name', showIf: is('bank') },
    { name: 'bankAccountNumber', label: 'Account number', showIf: is('bank') },
    { name: 'bankBranch', label: 'Branch', showIf: is('bank') },

    { name: '__cardSection', label: 'Card details', type: 'section', helperText: 'Never enter a full card number - only the last four digits.', showIf: is('card') },
    { name: 'transactionId', label: 'Transaction ID', required: true, showIf: is('card') },
    { name: 'cardHolderName', label: 'Card holder name', showIf: is('card') },
    { name: 'cardLastFour', label: 'Last 4 digits', showIf: is('card') },
    { name: 'authorizationCode', label: 'Authorisation code', showIf: is('card') },

    { name: '__chequeSection', label: 'Cheque details', type: 'section', showIf: is('cheque') },
    { name: 'transactionId', label: 'Cheque number', required: true, showIf: is('cheque') },
    { name: 'bankName', label: 'Bank name', showIf: is('cheque') },

    { name: 'paymentDate', label: 'Date received', type: 'date', showIf: is('mobile_money', 'bank', 'card', 'cheque') },
    { name: 'paymentNotes', label: 'Notes', type: 'textarea', showIf: is('mobile_money', 'bank', 'card', 'cheque') },
  ];
};

const Overview: React.FC = () => {
  const [s, setS] = useState<any>(null);
  useEffect(() => { churchApi.getFinanceSummary().then(setS).catch(() => setS(null)); }, []);
  const kpi = (t: string, v: string, c: string) => (<Card variant="outlined"><CardContent><Typography variant="body2" color="text.secondary">{t}</Typography><Typography variant="h5" fontWeight={800} color={c}>{v}</Typography></CardContent></Card>);
  return (
    <Box>
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, md: 3 }}>{kpi('Total Income', GHS(s?.totalIncome || 0), 'success.main')}</Grid>
        <Grid size={{ xs: 12, md: 3 }}>{kpi('Total Expenses', GHS(s?.totalExpenses || 0), 'error.main')}</Grid>
        <Grid size={{ xs: 12, md: 3 }}>{kpi('Net Balance', GHS(s?.net || 0), (s?.net || 0) >= 0 ? 'success.main' : 'error.main')}</Grid>
        <Grid size={{ xs: 12, md: 3 }}>{kpi('Outstanding Pledges', GHS(s?.pledges?.outstanding || 0), 'warning.main')}</Grid>
      </Grid>
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6 }}><Card variant="outlined"><CardContent>
          <Typography fontWeight={700} gutterBottom>Income by Purpose</Typography>
          <ResponsiveContainer width="100%" height={280}><PieChart>
            <Pie data={s?.incomeByPurpose || []} dataKey="total" nameKey="purpose" cx="50%" cy="50%" outerRadius={90} label>
              {(s?.incomeByPurpose || []).map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
            <RTooltip formatter={(v: any) => GHS(v)} /><Legend />
          </PieChart></ResponsiveContainer>
        </CardContent></Card></Grid>
        <Grid size={{ xs: 12, md: 6 }}><Card variant="outlined"><CardContent>
          <Typography fontWeight={700} gutterBottom>Expenses by Category</Typography>
          <ResponsiveContainer width="100%" height={280}><BarChart data={s?.expensesByCategory || []}>
            <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="category" /><YAxis /><RTooltip formatter={(v: any) => GHS(v)} />
            <Bar dataKey="total" fill="#ef4444" radius={[4, 4, 0, 0]} />
          </BarChart></ResponsiveContainer>
        </CardContent></Card></Grid>
      </Grid>
    </Box>
  );
};

export const Finance: React.FC = () => {
  const [tab, setTab] = useState(0);
  // Purposes and inventory categories are church-defined, so the forms load
  // them instead of relying on a fixed list baked into this page.
  const [purposes, setPurposes] = useState<string[]>(DEFAULT_PURPOSES);
  const [categories, setCategories] = useState<string[]>([]);

  const loadLists = () => {
    churchApi.getPurposeOptions().then(p => { if (p.length) setPurposes(p); }).catch(() => {});
    churchApi.getInventoryCategories().then(c => { if (c.length) setCategories(c); }).catch(() => {});
  };
  useEffect(() => { loadLists(); }, []);

  /**
   * Saves the record, and if the user typed a purpose that does not exist yet
   * it is remembered for next time. Remembering must never block the record
   * itself, so a failure there is swallowed.
   */
  const withRememberedPurpose = (save: (data: any) => Promise<any>, category = 'giving') =>
    async (data: any) => {
      const result = await save(data);
      const typed = String(data?.purpose || '').trim();
      if (typed && !purposes.some(p => p.toLowerCase() === typed.toLowerCase())) {
        try { await churchApi.rememberPurpose(typed, category); setPurposes(prev => [typed, ...prev]); } catch { /* non-blocking */ }
      }
      return result;
    };

  /** Same idea for a typed inventory category. */
  const withRememberedCategory = (save: (data: any) => Promise<any>) =>
    async (data: any) => {
      const result = await save(data);
      const typed = String(data?.category || '').trim();
      if (typed && !categories.some(c => c.toLowerCase() === typed.toLowerCase())) {
        try { await churchApi.rememberInventoryCategory(typed); setCategories(prev => [typed, ...prev]); } catch { /* non-blocking */ }
      }
      return result;
    };
  const givingCols: any[] = [
    { key: 'createdAt', label: 'Date', render: (r: any) => r.createdAt ? new Date(r.createdAt).toLocaleDateString() : '—' },
    { key: 'donorName', label: 'Giver', render: (r: any) => r.memberName || r.donorName || r.name || 'Anonymous' },
    { key: 'purpose', label: 'Purpose' },
    { key: 'amount', label: 'Amount', render: (r: any) => GHS(r.amount) },
    { key: 'paymentMethod', label: 'Method', render: (r: any) => methodOpts.find(m => m.value === (r.paymentMethod || r.method))?.label || r.paymentMethod || r.method || r.channel || '—' },
    {
      key: 'reference', label: 'Reference',
      render: (r: any) => r.transactionId || r.transferReference || r.reference || '—',
    },
    { key: 'status', label: 'Status', render: (r: any) => <Chip size="small" label={r.status || 'completed'} color={r.status === 'pending' ? 'warning' : 'success'} /> },
  ];
  const givingFields: any[] = [
    { name: 'amount', label: 'Amount (GHS)', type: 'number', required: true },
    {
      name: 'purpose', label: 'Purpose', type: 'autocomplete', options: asOptions(purposes),
      required: true, defaultValue: 'Tithe', freeSolo: true,
      helperText: 'Pick a purpose or type a new one - it will be saved for next time.',
    },
    { name: 'donorName', label: 'Giver name' },
    { name: 'email', label: 'Email (for receipt)' },
    // Named `paymentMethod` to match what the server stores; the old `method`
    // name was being dropped silently.
    { name: 'paymentMethod', label: 'Payment method', type: 'select', options: methodOpts, defaultValue: 'cash', required: true },
    ...paymentDetailFields('paymentMethod'),
  ];
  const expenseFields: any[] = [
    { name: 'category', label: 'Category', type: 'select', options: ['Utilities', 'Salaries', 'Welfare', 'Maintenance', 'Events', 'Missions', 'Supplies', 'Other'].map(c => ({ value: c, label: c })), required: true },
    { name: 'description', label: 'Description' },
    { name: 'amount', label: 'Amount (GHS)', type: 'number', required: true },
    { name: 'vendor', label: 'Vendor / Payee' },
    { name: 'paymentMethod', label: 'Payment method', type: 'select', options: methodOpts, defaultValue: 'cash', required: true },
    { name: 'status', label: 'Status', type: 'select', options: [{ value: 'pending', label: 'Pending' }, { value: 'approved', label: 'Approved' }, { value: 'paid', label: 'Paid' }], defaultValue: 'paid' },
    { name: 'date', label: 'Date', type: 'date' },
    ...paymentDetailFields('paymentMethod'),
  ];
  const expenseCols: any[] = [
    { key: 'date', label: 'Date', render: (r: any) => r.date ? new Date(r.date).toLocaleDateString() : '—' },
    { key: 'category', label: 'Category' },
    { key: 'description', label: 'Description' },
    { key: 'vendor', label: 'Vendor' },
    { key: 'amount', label: 'Amount', render: (r: any) => GHS(r.amount) },
    { key: 'status', label: 'Status', render: (r: any) => <Chip size="small" label={r.status || 'paid'} /> },
  ];
  const budgetFields: any[] = [
    { name: 'category', label: 'Category', required: true },
    { name: 'fiscalYear', label: 'Fiscal year', defaultValue: String(new Date().getFullYear()) },
    { name: 'allocated', label: 'Allocated (GHS)', type: 'number', required: true },
    { name: 'spent', label: 'Spent (GHS)', type: 'number' },
    { name: 'notes', label: 'Notes', type: 'textarea' },
  ];
  const budgetCols: any[] = [
    { key: 'category', label: 'Category' }, { key: 'fiscalYear', label: 'Year' },
    { key: 'allocated', label: 'Allocated', render: (r: any) => GHS(r.allocated) },
    { key: 'spent', label: 'Spent', render: (r: any) => GHS(r.spent) },
    { key: 'remaining', label: 'Remaining', render: (r: any) => GHS((Number(r.allocated) || 0) - (Number(r.spent) || 0)) },
  ];
  const pledgeFields: any[] = [
    { name: 'memberName', label: 'Member', required: true },
    {
      name: 'purpose', label: 'Purpose', type: 'autocomplete', options: asOptions(purposes),
      defaultValue: 'Building Fund', freeSolo: true,
      helperText: 'Pick a purpose or type a new one.',
    },
    { name: 'amountPledged', label: 'Amount pledged (GHS)', type: 'number', required: true },
    { name: 'amountPaid', label: 'Amount paid (GHS)', type: 'number' },
    { name: 'status', label: 'Status', type: 'select', options: [{ value: 'active', label: 'Active' }, { value: 'fulfilled', label: 'Fulfilled' }, { value: 'cancelled', label: 'Cancelled' }], defaultValue: 'active' },
    { name: 'dueDate', label: 'Due date', type: 'date' },
    { name: 'paymentMethod', label: 'How the pledge is being paid', type: 'select', options: methodOpts, defaultValue: 'cash' },
    ...paymentDetailFields('paymentMethod'),
  ];
  const pledgeCols: any[] = [
    { key: 'memberName', label: 'Member' }, { key: 'purpose', label: 'Purpose' },
    { key: 'amountPledged', label: 'Pledged', render: (r: any) => GHS(r.amountPledged) },
    { key: 'amountPaid', label: 'Paid', render: (r: any) => GHS(r.amountPaid) },
    { key: 'status', label: 'Status', render: (r: any) => <Chip size="small" label={r.status || 'active'} color={r.status === 'fulfilled' ? 'success' : r.status === 'cancelled' ? 'default' : 'warning'} /> },
  ];
  const invFields: any[] = [
    { name: 'name', label: 'Item name', required: true },
    {
      name: 'category', label: 'Category', type: 'autocomplete', freeSolo: true,
      options: asOptions(categories.length ? categories : ['Equipment', 'Instruments', 'Furniture', 'Electronics', 'Vehicles']),
      helperText: 'Choose a category or type your own, such as "Sound system" or "Kitchen".',
    },
    { name: 'quantity', label: 'Quantity', type: 'number' },
    { name: 'unitValue', label: 'Unit value (GHS)', type: 'number' },
    { name: 'condition', label: 'Condition', type: 'select', options: ['New', 'Good', 'Fair', 'Needs repair'].map(c => ({ value: c, label: c })) },
    { name: 'location', label: 'Location' },
    { name: 'notes', label: 'Notes', type: 'textarea' },
  ];
  const invCols: any[] = [
    { key: 'name', label: 'Item' }, { key: 'category', label: 'Category' }, { key: 'quantity', label: 'Qty' },
    { key: 'unitValue', label: 'Unit value', render: (r: any) => GHS(r.unitValue) },
    { key: 'condition', label: 'Condition' }, { key: 'location', label: 'Location' },
  ];
  const purposeFields: any[] = [
    { name: 'name', label: 'Purpose name', required: true },
    { name: 'category', label: 'Used for', type: 'select', options: asOptions(['giving', 'pledge', 'expense']), defaultValue: 'giving' },
    { name: 'description', label: 'Description', type: 'textarea' },
    { name: 'active', label: 'Offer this purpose in forms', type: 'checkbox', defaultValue: true },
  ];
  const purposeCols: any[] = [
    { key: 'name', label: 'Purpose' },
    { key: 'category', label: 'Used for' },
    { key: 'description', label: 'Description' },
    { key: 'active', label: 'Active', render: (r: any) => <Chip size="small" label={r.active === false ? 'Hidden' : 'Active'} color={r.active === false ? 'default' : 'success'} /> },
  ];

  const tabDefs = ['Overview', 'Tithes & Offerings', 'Donations & Pledges', 'Expenses', 'Budget', 'Inventory', 'Purposes', 'Payment History'];
  return (
    <Box>
      <Typography variant="h4" fontWeight={800} gutterBottom>Finance</Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>Tithes, offerings, donations, pledges, welfare, expenses, budgets, inventory and reports.</Typography>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto" sx={{ mb: 2 }}>
        {tabDefs.map(t => <Tab key={t} label={t} />)}
      </Tabs>
      {tab === 0 && <Overview />}
      {tab === 1 && <CrudTable columns={givingCols} fields={givingFields} fetchRows={() => churchApi.getGiving()} createRow={withRememberedPurpose(churchApi.addGiving, 'giving')} addLabel="Record Giving" emptyText="No giving records yet." />}
      {tab === 2 && <CrudTable columns={pledgeCols} fields={pledgeFields} fetchRows={() => churchApi.getPledges()} createRow={withRememberedPurpose(churchApi.createPledge, 'pledge')} updateRow={churchApi.updatePledge} deleteRow={churchApi.deletePledge} addLabel="Add Pledge" />}
      {tab === 3 && <CrudTable columns={expenseCols} fields={expenseFields} fetchRows={() => churchApi.getExpenses()} createRow={churchApi.createExpense} updateRow={churchApi.updateExpense} deleteRow={churchApi.deleteExpense} addLabel="Record Expense" />}
      {tab === 4 && <CrudTable columns={budgetCols} fields={budgetFields} fetchRows={() => churchApi.getBudgets()} createRow={churchApi.createBudget} updateRow={churchApi.updateBudget} deleteRow={churchApi.deleteBudget} addLabel="Add Budget Line" />}
      {tab === 5 && <CrudTable columns={invCols} fields={invFields} fetchRows={() => churchApi.getInventory()} createRow={withRememberedCategory(churchApi.createInventory)} updateRow={churchApi.updateInventory} deleteRow={churchApi.deleteInventory} addLabel="Add Inventory Item" />}
      {tab === 6 && (
        <Box>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            Purposes appear in the giving and pledge forms. You can also simply type a new purpose while recording money and it will be saved here automatically.
          </Typography>
          <CrudTable
            columns={purposeCols} fields={purposeFields}
            fetchRows={() => churchApi.getPurposes()}
            createRow={async (d: any) => { const r = await churchApi.createPurpose(d); loadLists(); return r; }}
            updateRow={async (id: string, d: any) => { const r = await churchApi.updatePurpose(id, d); loadLists(); return r; }}
            deleteRow={async (id: string) => { const r = await churchApi.deletePurpose(id); loadLists(); return r; }}
            addLabel="Add Purpose" emptyText="No custom purposes yet - the standard ones are already available in the forms."
          />
        </Box>
      )}
      {tab === 7 && <CrudTable columns={givingCols} fields={givingFields} fetchRows={() => churchApi.getGiving()} emptyText="No payment history yet." />}
    </Box>
  );
};

export default Finance;
