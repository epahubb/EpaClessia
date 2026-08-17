import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Grid, Paper, Button, Chip, IconButton, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, FormControlLabel, Checkbox, MenuItem,
  CircularProgress, Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, Alert, Snackbar, Tooltip,
} from '@mui/material';
import { Plus, Edit, Trash2, MessageSquare, DollarSign, ShoppingCart, Layers } from 'lucide-react';
import { smsService, SmsPackage, SmsPurchase } from '../../services/smsService';

const money = (n: number, ccy = 'GHS') => `${ccy} ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

interface PackageForm { id?: string; name: string; credits: number; price: number; currency: string; description: string; active: boolean; }
const EMPTY: PackageForm = { name: '', credits: 100, price: 0, currency: 'GHS', description: '', active: true };

const StatCard: React.FC<{ icon: React.ReactNode; label: string; value: string; color: string }> = ({ icon, label, value, color }) => (
  <Paper sx={{ p: 2.5, borderRadius: 3, border: '1px solid', borderColor: 'divider' }}>
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
      <Box>
        <Typography variant="caption" color="text.secondary" fontWeight={600}>{label}</Typography>
        <Typography variant="h5" fontWeight={800} sx={{ mt: 0.5 }}>{value}</Typography>
      </Box>
      <Box sx={{ width: 44, height: 44, borderRadius: 2.5, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: `${color}18`, color }}>{icon}</Box>
    </Box>
  </Paper>
);

const SmsManager: React.FC = () => {
  const [packages, setPackages] = useState<SmsPackage[]>([]);
  const [purchases, setPurchases] = useState<SmsPurchase[]>([]);
  const [stats, setStats] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<PackageForm>(EMPTY);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [pkgs, purch, st] = await Promise.all([
        smsService.getPackages().catch(() => []),
        smsService.getPurchases().catch(() => []),
        smsService.getStats().catch(() => ({})),
      ]);
      setPackages(Array.isArray(pkgs) ? pkgs : (pkgs as any)?.data || []);
      setPurchases(Array.isArray(purch) ? purch : (purch as any)?.data || []);
      setStats(st || {});
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => { setForm(EMPTY); setOpen(true); };
  const openEdit = (p: SmsPackage) => {
    setForm({ id: p.id, name: p.name, credits: p.credits, price: p.price, currency: p.currency || 'GHS', description: p.description || '', active: p.active !== false });
    setOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) { setToast({ type: 'error', msg: 'Package name is required.' }); return; }
    setSaving(true);
    try {
      if (form.id) await smsService.updatePackage(form.id, form);
      else await smsService.createPackage(form);
      setToast({ type: 'success', msg: `Package ${form.id ? 'updated' : 'created'}.` });
      setOpen(false); load();
    } catch {
      setToast({ type: 'error', msg: 'Failed to save package.' });
    } finally { setSaving(false); }
  };

  const remove = async (id: string) => {
    if (!window.confirm('Delete this SMS package?')) return;
    try { await smsService.deletePackage(id); setToast({ type: 'success', msg: 'Package deleted.' }); load(); }
    catch { setToast({ type: 'error', msg: 'Failed to delete package.' }); }
  };

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>;

  const totalRevenue = Number(stats.totalRevenue ?? purchases.reduce((s, p) => s + Number(p.amount || 0), 0));
  const totalCredits = Number(stats.totalCredits ?? purchases.reduce((s, p) => s + Number(p.credits || 0), 0));
  const totalPurchases = Number(stats.totalPurchases ?? purchases.length);

  return (
    <Box>
      <Grid container spacing={2.5} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, sm: 4 }}><StatCard icon={<DollarSign size={22} />} label="SMS revenue" value={money(totalRevenue)} color="#16a34a" /></Grid>
        <Grid size={{ xs: 12, sm: 4 }}><StatCard icon={<Layers size={22} />} label="Credits sold" value={totalCredits.toLocaleString()} color="#2563eb" /></Grid>
        <Grid size={{ xs: 12, sm: 4 }}><StatCard icon={<ShoppingCart size={22} />} label="Total purchases" value={String(totalPurchases)} color="#d97706" /></Grid>
      </Grid>

      {/* Packages */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6" fontWeight={800}>SMS Bundles</Typography>
        <Button variant="contained" startIcon={<Plus size={18} />} onClick={openCreate} sx={{ borderRadius: 2, fontWeight: 700 }}>Add SMS Package</Button>
      </Box>
      <Grid container spacing={2.5} sx={{ mb: 4 }}>
        {packages.length === 0 && <Grid size={{ xs: 12 }}><Alert severity="info">No SMS packages yet. Create bundles that churches can purchase from their admin portal.</Alert></Grid>}
        {packages.map((p) => (
          <Grid size={{ xs: 12, sm: 6, md: 3 }} key={p.id}>
            <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3, height: '100%' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Box sx={{ p: 1, borderRadius: 2, bgcolor: 'primary.main', color: 'white', display: 'flex' }}><MessageSquare size={18} /></Box>
                <Box>
                  <Tooltip title="Edit"><IconButton size="small" onClick={() => openEdit(p)}><Edit size={15} /></IconButton></Tooltip>
                  <Tooltip title="Delete"><IconButton size="small" color="error" onClick={() => remove(p.id)}><Trash2 size={15} /></IconButton></Tooltip>
                </Box>
              </Box>
              <Typography variant="h6" fontWeight={800} sx={{ mt: 1.5 }}>{p.name}</Typography>
              <Typography variant="h5" fontWeight={900} color="primary.main">{Number(p.credits).toLocaleString()}<Typography component="span" variant="caption" color="text.secondary"> credits</Typography></Typography>
              <Typography variant="body2" fontWeight={700}>{money(p.price, p.currency)}</Typography>
              {p.description && <Typography variant="caption" color="text.secondary">{p.description}</Typography>}
              <Box sx={{ mt: 1 }}><Chip size="small" label={p.active !== false ? 'Active' : 'Inactive'} color={p.active !== false ? 'success' : 'default'} sx={{ fontWeight: 700, fontSize: '0.6rem' }} /></Box>
            </Paper>
          </Grid>
        ))}
      </Grid>

      {/* Purchases */}
      <Typography variant="h6" fontWeight={800} sx={{ mb: 2 }}>SMS Purchases</Typography>
      <Paper variant="outlined" sx={{ borderRadius: 3, overflow: 'hidden' }}>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>Package</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Church</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Credits</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Amount</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Reference</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Date</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {purchases.length === 0 ? (
                <TableRow><TableCell colSpan={7} align="center" sx={{ py: 5 }}><Typography color="text.secondary">No SMS purchases yet.</Typography></TableCell></TableRow>
              ) : purchases.map((p) => (
                <TableRow key={p.id} hover>
                  <TableCell><Typography variant="body2" fontWeight={700}>{p.packageName}</Typography></TableCell>
                  <TableCell>{p.tenantName}</TableCell>
                  <TableCell>{Number(p.credits).toLocaleString()}</TableCell>
                  <TableCell><Typography variant="body2" fontWeight={700}>{money(p.amount, p.currency)}</Typography></TableCell>
                  <TableCell><Chip size="small" label={(p.status || 'completed').toUpperCase()} color={p.status === 'completed' ? 'success' : 'warning'} sx={{ fontWeight: 700, fontSize: '0.6rem' }} /></TableCell>
                  <TableCell><Typography variant="caption">{p.reference || '\u2014'}</Typography></TableCell>
                  <TableCell><Typography variant="caption">{p.createdAt ? new Date(p.createdAt).toLocaleDateString() : '\u2014'}</Typography></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>{form.id ? 'Edit SMS Package' : 'Create SMS Package'}</DialogTitle>
        <DialogContent dividers>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6 }}><TextField fullWidth label="Package name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Grid>
            <Grid size={{ xs: 12, sm: 6 }}><TextField fullWidth type="number" label="Credits" value={form.credits} onChange={(e) => setForm({ ...form, credits: Number(e.target.value) })} /></Grid>
            <Grid size={{ xs: 12, sm: 6 }}><TextField fullWidth type="number" label="Price" value={form.price} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} /></Grid>
            <Grid size={{ xs: 12, sm: 6 }}><TextField fullWidth select label="Currency" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
              <MenuItem value="GHS">GHS</MenuItem>
              <MenuItem value="NGN">NGN</MenuItem>
              <MenuItem value="USD">USD</MenuItem>
            </TextField></Grid>
            <Grid size={{ xs: 12 }}><TextField fullWidth multiline minRows={2} label="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Grid>
            <Grid size={{ xs: 12 }}><FormControlLabel control={<Checkbox checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />} label="Available for churches to purchase" /></Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={save} disabled={saving} sx={{ borderRadius: 2, fontWeight: 700 }}>{saving ? 'Saving\u2026' : 'Save Package'}</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!toast} autoHideDuration={3500} onClose={() => setToast(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
        {toast ? <Alert severity={toast.type} onClose={() => setToast(null)}>{toast.msg}</Alert> : undefined}
      </Snackbar>
    </Box>
  );
};

export default SmsManager;
