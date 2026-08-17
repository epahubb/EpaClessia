import React, { useState, useEffect, useMemo } from 'react';
import {
  Box, Typography, Paper, Grid, Button, TextField, Select, MenuItem, FormControl,
  InputLabel, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Chip, IconButton, Menu, Dialog, DialogTitle, DialogContent, DialogActions,
  Alert, CircularProgress, Divider, InputAdornment, Skeleton, Tabs, Tab,
} from '@mui/material';
import {
  DollarSign, Clock, AlertTriangle, Search, Download, Plus, MoreVertical,
  CheckCircle, RefreshCw, Send, FileText, TrendingUp, Receipt,
} from 'lucide-react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip as RTooltip,
} from 'recharts';
import { billingService, Invoice } from '../services/billingService';
import { subscriptionService } from '../services/subscriptionService';
import PlansManager from '../components/superadmin/PlansManager';
import SmsManager from '../components/superadmin/SmsManager';

const GHS = (n: number) => `GHS ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const StatCard: React.FC<{ icon: React.ReactNode; label: string; value: string; sub?: string; color: string }> = ({ icon, label, value, sub, color }) => (
  <Paper sx={{ p: 2.5, borderRadius: 3, border: '1px solid', borderColor: 'divider' }}>
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
      <Box>
        <Typography variant="caption" color="text.secondary" fontWeight={600}>{label}</Typography>
        <Typography variant="h5" fontWeight={800} sx={{ mt: 0.5 }}>{value}</Typography>
        {sub && <Typography variant="caption" color="text.secondary">{sub}</Typography>}
      </Box>
      <Box sx={{ width: 44, height: 44, borderRadius: 2.5, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: `${color}18`, color }}>{icon}</Box>
    </Box>
  </Paper>
);

const Billing: React.FC = () => {
  const [tab, setTab] = useState(0);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [revenue, setRevenue] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [planFilter, setPlanFilter] = useState('all');

  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [exportAnchorEl, setExportAnchorEl] = useState<null | HTMLElement>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [viewModalOpen, setViewModalOpen] = useState(false);

  const [newInvoiceData, setNewInvoiceData] = useState({ tenantId: '', amount: 490, planId: 'basic', billingCycle: 'monthly', description: 'Platform subscription', dueDate: '' });
  const [paymentData, setPaymentData] = useState({ paymentMethod: 'Bank Wire / Cheque', reference: '' });

  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [invoicesRes, revenueRes] = await Promise.all([
        billingService.getInvoices({ search, status: statusFilter, plan: planFilter }),
        subscriptionService.getRevenueMonthly().catch(() => []),
      ]);
      setInvoices(invoicesRes?.data || invoicesRes || []);
      const rev = Array.isArray(revenueRes) ? revenueRes : (revenueRes as any)?.data || [];
      setRevenue(rev.map((r: any) => ({ month: (r.month || '').slice(2), revenue: Number(r.revenue || 0) })));
    } catch (err) {
      console.error('Failed to load billing data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); /* eslint-disable-next-line */ }, [search, statusFilter, planFilter]);

  const stats = useMemo(() => {
    const collected = invoices.filter((i) => i.status === 'paid').reduce((s, i) => s + Number(i.amount || 0), 0);
    const outstanding = invoices.filter((i) => i.status === 'pending' || i.status === 'overdue').reduce((s, i) => s + Number(i.amount || 0), 0);
    const overdue = invoices.filter((i) => i.status === 'overdue').length;
    return { collected, outstanding, overdue, count: invoices.length };
  }, [invoices]);

  const handleActionMenuOpen = (e: React.MouseEvent<HTMLElement>, invoice: Invoice) => { setAnchorEl(e.currentTarget); setSelectedInvoice(invoice); };
  const handleActionMenuClose = () => setAnchorEl(null);

  const handleRecordPayment = async () => {
    if (!selectedInvoice) return;
    setSubmitting(true); setActionError(null);
    try {
      await billingService.payInvoice(selectedInvoice.id, paymentData);
      setActionSuccess(`Payment recorded for ${selectedInvoice.id}.`);
      setPayModalOpen(false); handleActionMenuClose(); fetchData();
    } catch { setActionError('Failed to record payment'); } finally { setSubmitting(false); }
  };

  const handleCreateInvoice = async () => {
    setSubmitting(true); setActionError(null);
    try {
      await billingService.createInvoice(newInvoiceData);
      setActionSuccess('New invoice issued successfully.');
      setCreateModalOpen(false); fetchData();
    } catch { setActionError('Failed to issue invoice'); } finally { setSubmitting(false); }
  };

  const handleRefund = async () => {
    if (!selectedInvoice) return;
    handleActionMenuClose();
    try { await billingService.refundInvoice(selectedInvoice.id); setActionSuccess('Invoice refunded.'); fetchData(); }
    catch { setActionError('Failed to refund'); }
  };

  const handleSendReminder = async () => {
    if (!selectedInvoice) return;
    handleActionMenuClose();
    try { await billingService.sendReminder(selectedInvoice.id); setActionSuccess(`Reminder sent for ${selectedInvoice.id}`); }
    catch { setActionError('Failed to send reminder'); }
  };

  const handleExport = () => {
    setExportAnchorEl(null);
    const headers = ['Invoice ID', 'Church', 'Plan', 'Cycle', 'Amount (GHS)', 'Status', 'Issue Date', 'Due Date'];
    const rows = invoices.map((i) => [i.id, i.tenantName, (i.planId || '').toUpperCase(), i.billingCycle, i.amount, (i.status || '').toUpperCase(), new Date(i.issueDate).toLocaleDateString(), new Date(i.dueDate).toLocaleDateString()]);
    const csv = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const link = document.createElement('a');
    link.setAttribute('href', encodeURI(csv));
    link.setAttribute('download', `Billing_Report_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
  };

  const statusChip = (status: string) => {
    const map: Record<string, any> = {
      paid: { label: 'PAID', color: 'success' },
      pending: { label: 'PENDING', color: 'warning' },
      overdue: { label: 'OVERDUE', color: 'error' },
      failed: { label: 'FAILED', color: 'default' },
    };
    const c = map[status] || { label: (status || '').toUpperCase(), color: 'default' };
    return <Chip label={c.label} color={c.color} size="small" sx={{ fontWeight: 700, fontSize: '0.6rem' }} />;
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', mb: 3, gap: 2 }}>
        <Box>
          <Typography variant="h4" fontWeight={800} sx={{ letterSpacing: '-0.5px' }}>Billing & Revenue</Typography>
          <Typography variant="body2" color="text.secondary">Track platform revenue, issue invoices, and reconcile church subscription payments.</Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1.5 }}>
          <Button variant="outlined" startIcon={<Download size={18} />} onClick={(e) => setExportAnchorEl(e.currentTarget)} sx={{ borderRadius: 2 }}>Export</Button>
          <Menu anchorEl={exportAnchorEl} open={Boolean(exportAnchorEl)} onClose={() => setExportAnchorEl(null)}>
            <MenuItem onClick={handleExport}>Export as CSV</MenuItem>
            <MenuItem onClick={() => { setExportAnchorEl(null); window.print(); }}>Print / PDF</MenuItem>
          </Menu>
          <Button variant="contained" startIcon={<Plus size={18} />} onClick={() => setCreateModalOpen(true)} sx={{ borderRadius: 2, fontWeight: 700 }}>Create Invoice</Button>
        </Box>
      </Box>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Tab label="Invoices & Revenue" sx={{ fontWeight: 700 }} />
        <Tab label="Subscription Plans" sx={{ fontWeight: 700 }} />
        <Tab label="SMS Packages" sx={{ fontWeight: 700 }} />
      </Tabs>

      {actionSuccess && <Alert severity="success" onClose={() => setActionSuccess(null)} sx={{ mb: 3, borderRadius: 2 }}>{actionSuccess}</Alert>}
      {actionError && <Alert severity="error" onClose={() => setActionError(null)} sx={{ mb: 3, borderRadius: 2 }}>{actionError}</Alert>}

      {tab === 1 && <PlansManager />}
      {tab === 2 && <SmsManager />}

      {tab === 0 && (<>
      <Grid container spacing={2.5} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}><StatCard icon={<DollarSign size={22} />} label="Total collected" value={GHS(stats.collected)} sub="Paid invoices" color="#16a34a" /></Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}><StatCard icon={<Clock size={22} />} label="Outstanding" value={GHS(stats.outstanding)} sub="Pending + overdue" color="#d97706" /></Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}><StatCard icon={<AlertTriangle size={22} />} label="Overdue invoices" value={String(stats.overdue)} sub="Need follow-up" color="#dc2626" /></Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}><StatCard icon={<Receipt size={22} />} label="Total invoices" value={String(stats.count)} sub="All time" color="#2563eb" /></Grid>
      </Grid>

      <Paper sx={{ p: 2.5, borderRadius: 3, border: '1px solid', borderColor: 'divider', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <TrendingUp size={18} color="#2563eb" />
          <Typography fontWeight={800}>Revenue (last 12 months)</Typography>
        </Box>
        {loading ? <Skeleton variant="rounded" height={240} /> : (
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={revenue} margin={{ left: -10, right: 10, top: 10 }}>
              <defs>
                <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#2563eb" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
              <XAxis dataKey="month" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis fontSize={12} tickLine={false} axisLine={false} />
              <RTooltip formatter={(v: any) => GHS(Number(v))} />
              <Area type="monotone" dataKey="revenue" stroke="#2563eb" strokeWidth={2.5} fill="url(#rev)" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </Paper>

      <Paper sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
        <Box sx={{ p: 2, display: 'flex', flexWrap: 'wrap', gap: 1.5, alignItems: 'center', borderBottom: '1px solid', borderColor: 'divider' }}>
          <TextField size="small" placeholder="Search invoices or churches" value={search} onChange={(e) => setSearch(e.target.value)}
            sx={{ flex: 1, minWidth: 220 }} InputProps={{ startAdornment: <InputAdornment position="start"><Search size={16} /></InputAdornment> }} />
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel>Status</InputLabel>
            <Select label="Status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <MenuItem value="all">All statuses</MenuItem>
              <MenuItem value="paid">Paid</MenuItem>
              <MenuItem value="pending">Pending</MenuItem>
              <MenuItem value="overdue">Overdue</MenuItem>
              <MenuItem value="failed">Failed</MenuItem>
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel>Plan</InputLabel>
            <Select label="Plan" value={planFilter} onChange={(e) => setPlanFilter(e.target.value)}>
              <MenuItem value="all">All plans</MenuItem>
              <MenuItem value="basic">Basic</MenuItem>
              <MenuItem value="pro">Pro</MenuItem>
              <MenuItem value="enterprise">Enterprise</MenuItem>
            </Select>
          </FormControl>
          <IconButton onClick={fetchData}><RefreshCw size={18} /></IconButton>
        </Box>

        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>Invoice</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Church</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Plan</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Amount</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Due</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                [...Array(5)].map((_, i) => <TableRow key={i}><TableCell colSpan={7}><Skeleton height={36} /></TableCell></TableRow>)
              ) : invoices.length === 0 ? (
                <TableRow><TableCell colSpan={7} align="center" sx={{ py: 6 }}><Typography color="text.secondary">No invoices found.</Typography></TableCell></TableRow>
              ) : invoices.map((inv) => (
                <TableRow key={inv.id} hover>
                  <TableCell><Typography variant="body2" fontWeight={700}>{inv.id}</Typography><Typography variant="caption" color="text.secondary">{inv.description}</Typography></TableCell>
                  <TableCell>{inv.tenantName}</TableCell>
                  <TableCell><Chip label={(inv.planId || '').toUpperCase()} size="small" variant="outlined" /></TableCell>
                  <TableCell><Typography variant="body2" fontWeight={700}>{GHS(inv.amount)}</Typography><Typography variant="caption" color="text.secondary">{inv.billingCycle}</Typography></TableCell>
                  <TableCell>{statusChip(inv.status)}</TableCell>
                  <TableCell><Typography variant="caption">{inv.dueDate ? new Date(inv.dueDate).toLocaleDateString() : '—'}</Typography></TableCell>
                  <TableCell align="right"><IconButton size="small" onClick={(e) => handleActionMenuOpen(e, inv)}><MoreVertical size={18} /></IconButton></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
      </>)}

      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={handleActionMenuClose} PaperProps={{ sx: { width: 220, borderRadius: 2 } }}>
        <MenuItem onClick={() => { setViewModalOpen(true); handleActionMenuClose(); }}><Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}><FileText size={16} /> View Invoice</Box></MenuItem>
        <MenuItem onClick={() => { setPayModalOpen(true); handleActionMenuClose(); }} disabled={selectedInvoice?.status === 'paid'}><Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}><CheckCircle size={16} /> Record Payment</Box></MenuItem>
        <MenuItem onClick={handleSendReminder}><Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}><Send size={16} /> Send Reminder</Box></MenuItem>
        <Divider />
        <MenuItem onClick={handleRefund} sx={{ color: 'error.main' }} disabled={selectedInvoice?.status !== 'paid'}><Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}><RefreshCw size={16} /> Refund</Box></MenuItem>
      </Menu>

      {/* Create Invoice */}
      <Dialog open={createModalOpen} onClose={() => setCreateModalOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>Create invoice</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid size={{ xs: 12, sm: 6 }}><TextField fullWidth label="Tenant ID" value={newInvoiceData.tenantId} onChange={(e) => setNewInvoiceData({ ...newInvoiceData, tenantId: e.target.value })} /></Grid>
            <Grid size={{ xs: 12, sm: 6 }}><TextField fullWidth type="number" label="Amount (GHS)" value={newInvoiceData.amount} onChange={(e) => setNewInvoiceData({ ...newInvoiceData, amount: Number(e.target.value) })} /></Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <FormControl fullWidth><InputLabel>Plan</InputLabel>
                <Select label="Plan" value={newInvoiceData.planId} onChange={(e) => setNewInvoiceData({ ...newInvoiceData, planId: e.target.value })}>
                  <MenuItem value="basic">Basic</MenuItem><MenuItem value="pro">Pro</MenuItem><MenuItem value="enterprise">Enterprise</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <FormControl fullWidth><InputLabel>Cycle</InputLabel>
                <Select label="Cycle" value={newInvoiceData.billingCycle} onChange={(e) => setNewInvoiceData({ ...newInvoiceData, billingCycle: e.target.value })}>
                  <MenuItem value="monthly">Monthly</MenuItem><MenuItem value="annually">Annually</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}><TextField fullWidth type="date" label="Due date" InputLabelProps={{ shrink: true }} value={newInvoiceData.dueDate} onChange={(e) => setNewInvoiceData({ ...newInvoiceData, dueDate: e.target.value })} /></Grid>
            <Grid size={{ xs: 12 }}><TextField fullWidth label="Description" value={newInvoiceData.description} onChange={(e) => setNewInvoiceData({ ...newInvoiceData, description: e.target.value })} /></Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ p: 2.5 }}>
          <Button onClick={() => setCreateModalOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleCreateInvoice} disabled={submitting} sx={{ fontWeight: 700 }}>{submitting ? <CircularProgress size={20} /> : 'Issue invoice'}</Button>
        </DialogActions>
      </Dialog>

      {/* Record Payment */}
      <Dialog open={payModalOpen} onClose={() => setPayModalOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>Record payment</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Invoice <strong>{selectedInvoice?.id}</strong> — {GHS(selectedInvoice?.amount || 0)}</Typography>
          <FormControl fullWidth sx={{ mb: 2 }}><InputLabel>Payment method</InputLabel>
            <Select label="Payment method" value={paymentData.paymentMethod} onChange={(e) => setPaymentData({ ...paymentData, paymentMethod: e.target.value })}>
              <MenuItem value="Bank Wire / Cheque">Bank Wire / Cheque</MenuItem>
              <MenuItem value="Mobile Money">Mobile Money</MenuItem>
              <MenuItem value="Paystack">Paystack</MenuItem>
              <MenuItem value="Cash">Cash</MenuItem>
            </Select>
          </FormControl>
          <TextField fullWidth label="Reference (optional)" value={paymentData.reference} onChange={(e) => setPaymentData({ ...paymentData, reference: e.target.value })} />
        </DialogContent>
        <DialogActions sx={{ p: 2.5 }}>
          <Button onClick={() => setPayModalOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleRecordPayment} disabled={submitting} sx={{ fontWeight: 700 }}>{submitting ? <CircularProgress size={20} /> : 'Confirm payment'}</Button>
        </DialogActions>
      </Dialog>

      {/* View Invoice */}
      <Dialog open={viewModalOpen} onClose={() => setViewModalOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>Invoice {selectedInvoice?.id}</DialogTitle>
        <DialogContent dividers>
          {selectedInvoice && (
            <Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                <Box><Typography variant="caption" color="text.secondary">Billed to</Typography><Typography fontWeight={700}>{selectedInvoice.tenantName}</Typography></Box>
                {statusChip(selectedInvoice.status)}
              </Box>
              <Divider sx={{ my: 1.5 }} />
              <Grid container spacing={1.5}>
                <Grid size={{ xs: 6 }}><Typography variant="caption" color="text.secondary">Plan</Typography><Typography>{(selectedInvoice.planId || '').toUpperCase()} · {selectedInvoice.billingCycle}</Typography></Grid>
                <Grid size={{ xs: 6 }}><Typography variant="caption" color="text.secondary">Amount</Typography><Typography fontWeight={800}>{GHS(selectedInvoice.amount)}</Typography></Grid>
                <Grid size={{ xs: 6 }}><Typography variant="caption" color="text.secondary">Issued</Typography><Typography>{selectedInvoice.issueDate ? new Date(selectedInvoice.issueDate).toLocaleDateString() : '—'}</Typography></Grid>
                <Grid size={{ xs: 6 }}><Typography variant="caption" color="text.secondary">Due</Typography><Typography>{selectedInvoice.dueDate ? new Date(selectedInvoice.dueDate).toLocaleDateString() : '—'}</Typography></Grid>
                <Grid size={{ xs: 12 }}><Typography variant="caption" color="text.secondary">Description</Typography><Typography>{selectedInvoice.description}</Typography></Grid>
              </Grid>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2.5 }}>
          <Button onClick={() => window.print()} startIcon={<FileText size={16} />}>Print</Button>
          <Button variant="contained" onClick={() => setViewModalOpen(false)} sx={{ fontWeight: 700 }}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Billing;
