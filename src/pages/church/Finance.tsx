import React, { useEffect, useState } from 'react';
import { Box, Typography, Tabs, Tab, Grid, Card, CardContent, Chip } from '@mui/material';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip as RTooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import CrudTable from '../../components/church/CrudTable';
import churchApi from '../../services/churchApi';

const GHS = (n: number) => new Intl.NumberFormat('en-GH', { style: 'currency', currency: 'GHS', maximumFractionDigits: 0 }).format(Number(n) || 0);
const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4', '#a855f7', '#ec4899'];

const givingPurposes = [{ value: 'Tithe', label: 'Tithe' }, { value: 'Offering', label: 'Offering' }, { value: 'Welfare', label: 'Welfare' }, { value: 'Donation', label: 'Donation' }, { value: 'Building Fund', label: 'Building Fund' }, { value: 'Missions', label: 'Missions' }];
const methodOpts = [{ value: 'cash', label: 'Cash' }, { value: 'card', label: 'Card' }, { value: 'mobile_money', label: 'Mobile Money' }, { value: 'bank', label: 'Bank Transfer' }];

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
  const givingCols: any[] = [
    { key: 'createdAt', label: 'Date', render: (r: any) => r.createdAt ? new Date(r.createdAt).toLocaleDateString() : '\u2014' },
    { key: 'memberName', label: 'Giver', render: (r: any) => r.memberName || r.donorName || r.name || 'Anonymous' },
    { key: 'purpose', label: 'Purpose' },
    { key: 'amount', label: 'Amount', render: (r: any) => GHS(r.amount) },
    { key: 'method', label: 'Method', render: (r: any) => r.method || r.channel || '\u2014' },
    { key: 'status', label: 'Status', render: (r: any) => <Chip size="small" label={r.status || 'completed'} color={r.status === 'pending' ? 'warning' : 'success'} /> },
  ];
  const givingFields: any[] = [
    { name: 'amount', label: 'Amount (GHS)', type: 'number', required: true },
    { name: 'purpose', label: 'Purpose', type: 'select', options: givingPurposes, required: true, defaultValue: 'Tithe' },
    { name: 'memberName', label: 'Giver name' },
    { name: 'email', label: 'Email (for receipt)' },
    { name: 'method', label: 'Method', type: 'select', options: methodOpts, defaultValue: 'cash' },
  ];
  const expenseFields: any[] = [
    { name: 'category', label: 'Category', type: 'select', options: ['Utilities', 'Salaries', 'Welfare', 'Maintenance', 'Events', 'Missions', 'Supplies', 'Other'].map(c => ({ value: c, label: c })), required: true },
    { name: 'description', label: 'Description' },
    { name: 'amount', label: 'Amount (GHS)', type: 'number', required: true },
    { name: 'vendor', label: 'Vendor / Payee' },
    { name: 'paymentMethod', label: 'Payment method', type: 'select', options: methodOpts },
    { name: 'status', label: 'Status', type: 'select', options: [{ value: 'pending', label: 'Pending' }, { value: 'approved', label: 'Approved' }, { value: 'paid', label: 'Paid' }], defaultValue: 'paid' },
    { name: 'date', label: 'Date', type: 'date' },
  ];
  const expenseCols: any[] = [
    { key: 'date', label: 'Date', render: (r: any) => r.date ? new Date(r.date).toLocaleDateString() : '\u2014' },
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
    { name: 'purpose', label: 'Purpose', type: 'select', options: givingPurposes, defaultValue: 'Building Fund' },
    { name: 'amountPledged', label: 'Amount pledged (GHS)', type: 'number', required: true },
    { name: 'amountPaid', label: 'Amount paid (GHS)', type: 'number' },
    { name: 'status', label: 'Status', type: 'select', options: [{ value: 'active', label: 'Active' }, { value: 'fulfilled', label: 'Fulfilled' }, { value: 'cancelled', label: 'Cancelled' }], defaultValue: 'active' },
    { name: 'dueDate', label: 'Due date', type: 'date' },
  ];
  const pledgeCols: any[] = [
    { key: 'memberName', label: 'Member' }, { key: 'purpose', label: 'Purpose' },
    { key: 'amountPledged', label: 'Pledged', render: (r: any) => GHS(r.amountPledged) },
    { key: 'amountPaid', label: 'Paid', render: (r: any) => GHS(r.amountPaid) },
    { key: 'status', label: 'Status', render: (r: any) => <Chip size="small" label={r.status || 'active'} color={r.status === 'fulfilled' ? 'success' : r.status === 'cancelled' ? 'default' : 'warning'} /> },
  ];
  const invFields: any[] = [
    { name: 'name', label: 'Item name', required: true },
    { name: 'category', label: 'Category', type: 'select', options: ['Equipment', 'Instruments', 'Furniture', 'Electronics', 'Vehicles', 'Other'].map(c => ({ value: c, label: c })) },
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
  const tabDefs = ['Overview', 'Tithes & Offerings', 'Donations & Pledges', 'Expenses', 'Budget', 'Inventory', 'Payment History'];
  return (
    <Box>
      <Typography variant="h4" fontWeight={800} gutterBottom>Finance</Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>Tithes, offerings, donations, pledges, welfare, expenses, budgets, inventory and reports.</Typography>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto" sx={{ mb: 2 }}>
        {tabDefs.map(t => <Tab key={t} label={t} />)}
      </Tabs>
      {tab === 0 && <Overview />}
      {tab === 1 && <CrudTable columns={givingCols} fields={givingFields} fetchRows={() => churchApi.getGiving()} createRow={churchApi.addGiving} addLabel="Record Giving" emptyText="No giving records yet." />}
      {tab === 2 && <CrudTable columns={pledgeCols} fields={pledgeFields} fetchRows={() => churchApi.getPledges()} createRow={churchApi.createPledge} updateRow={churchApi.updatePledge} deleteRow={churchApi.deletePledge} addLabel="Add Pledge" />}
      {tab === 3 && <CrudTable columns={expenseCols} fields={expenseFields} fetchRows={() => churchApi.getExpenses()} createRow={churchApi.createExpense} updateRow={churchApi.updateExpense} deleteRow={churchApi.deleteExpense} addLabel="Record Expense" />}
      {tab === 4 && <CrudTable columns={budgetCols} fields={budgetFields} fetchRows={() => churchApi.getBudgets()} createRow={churchApi.createBudget} updateRow={churchApi.updateBudget} deleteRow={churchApi.deleteBudget} addLabel="Add Budget Line" />}
      {tab === 5 && <CrudTable columns={invCols} fields={invFields} fetchRows={() => churchApi.getInventory()} createRow={churchApi.createInventory} updateRow={churchApi.updateInventory} deleteRow={churchApi.deleteInventory} addLabel="Add Inventory Item" />}
      {tab === 6 && <CrudTable columns={givingCols} fields={givingFields} fetchRows={() => churchApi.getGiving()} emptyText="No payment history yet." />}
    </Box>
  );
};

export default Finance;
