import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Grid, Card, CardContent, Button, Chip, IconButton, Dialog,
  DialogTitle, DialogContent, DialogActions, TextField, MenuItem, FormControlLabel,
  Checkbox, CircularProgress, Divider, Alert, Snackbar, Tooltip,
} from '@mui/material';
import { Plus, Edit, Trash2, Check, Package } from 'lucide-react';
import { subscriptionService } from '../../services/subscriptionService';

// Feature catalogue that can be assigned to a plan.
const FEATURE_CATALOG: { code: string; label: string }[] = [
  { code: 'members', label: 'Member Management' },
  { code: 'families', label: 'Families & Households' },
  { code: 'visitors', label: 'Visitor Tracking' },
  { code: 'ministries', label: 'Ministries & Groups' },
  { code: 'events', label: 'Events & Calendar' },
  { code: 'attendance', label: 'Attendance' },
  { code: 'giving', label: 'Giving & Donations' },
  { code: 'sms', label: 'SMS Communication' },
  { code: 'email', label: 'Email Communication' },
  { code: 'reports', label: 'Reports & Analytics' },
  { code: 'children', label: 'Children / Check-in' },
  { code: 'assets', label: 'Assets & Inventory' },
];

const GHS = (n: number) => `GHS ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

interface PlanForm {
  id?: string;
  name: string;
  price: number;
  billingCycle: string;
  maxMembers: number;
  features: string[];
  active: boolean;
}

const EMPTY: PlanForm = { name: '', price: 0, billingCycle: 'monthly', maxMembers: 100, features: [], active: true };

const PlansManager: React.FC = () => {
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<PlanForm>(EMPTY);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await subscriptionService.getPlans();
      const list = Array.isArray(res) ? res : res?.data || [];
      setPlans(list.map((p: any) => ({
        ...p,
        features: Array.isArray(p.features) ? p.features : (typeof p.features === 'string' ? safeParse(p.features) : []),
      })));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => { setForm(EMPTY); setOpen(true); };
  const openEdit = (p: any) => {
    setForm({
      id: p.id, name: p.name, price: Number(p.price || 0), billingCycle: p.billingCycle || 'monthly',
      maxMembers: Number(p.maxMembers || 0), features: p.features || [], active: p.active !== false,
    });
    setOpen(true);
  };

  const toggleFeature = (code: string) => setForm((f) => ({
    ...f,
    features: f.features.includes(code) ? f.features.filter((c) => c !== code) : [...f.features, code],
  }));

  const save = async () => {
    if (!form.name.trim()) { setToast({ type: 'error', msg: 'Plan name is required.' }); return; }
    setSaving(true);
    try {
      const payload = { ...form, features: form.features };
      if (form.id) await subscriptionService.updatePlan(form.id, payload);
      else await subscriptionService.createPlan(payload);
      setToast({ type: 'success', msg: `Plan ${form.id ? 'updated' : 'created'} successfully.` });
      setOpen(false); load();
    } catch {
      setToast({ type: 'error', msg: 'Failed to save plan.' });
    } finally { setSaving(false); }
  };

  const remove = async (id: string) => {
    if (!window.confirm('Delete this plan? Churches on this plan will keep their current subscription.')) return;
    try { await subscriptionService.deletePlan(id); setToast({ type: 'success', msg: 'Plan deleted.' }); load(); }
    catch { setToast({ type: 'error', msg: 'Failed to delete plan.' }); }
  };

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>;

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6" fontWeight={800}>Subscription Plans</Typography>
        <Button variant="contained" startIcon={<Plus size={18} />} onClick={openCreate} sx={{ borderRadius: 2, fontWeight: 700 }}>Add Plan</Button>
      </Box>

      <Grid container spacing={2.5}>
        {plans.length === 0 && (
          <Grid size={{ xs: 12 }}><Alert severity="info">No plans yet. Create your first subscription plan.</Alert></Grid>
        )}
        {plans.map((p) => (
          <Grid size={{ xs: 12, sm: 6, md: 4 }} key={p.id}>
            <Card variant="outlined" sx={{ borderRadius: 3, height: '100%' }}>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Box sx={{ p: 1, borderRadius: 2, bgcolor: 'primary.main', color: 'white', display: 'flex' }}><Package size={18} /></Box>
                    <Box>
                      <Typography variant="h6" fontWeight={800}>{p.name}</Typography>
                      <Chip size="small" label={p.active !== false ? 'Active' : 'Inactive'} color={p.active !== false ? 'success' : 'default'} sx={{ fontWeight: 700, fontSize: '0.6rem' }} />
                    </Box>
                  </Box>
                  <Box>
                    <Tooltip title="Edit"><IconButton size="small" onClick={() => openEdit(p)}><Edit size={16} /></IconButton></Tooltip>
                    <Tooltip title="Delete"><IconButton size="small" color="error" onClick={() => remove(p.id)}><Trash2 size={16} /></IconButton></Tooltip>
                  </Box>
                </Box>
                <Typography variant="h4" fontWeight={900} sx={{ mt: 2 }}>{GHS(p.price)}<Typography component="span" variant="body2" color="text.secondary">/{p.billingCycle || 'monthly'}</Typography></Typography>
                <Typography variant="caption" color="text.secondary">Up to {p.maxMembers || 'unlimited'} members</Typography>
                <Divider sx={{ my: 1.5 }} />
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                  {(p.features || []).length === 0 && <Typography variant="caption" color="text.secondary">No features assigned.</Typography>}
                  {(p.features || []).map((code: string) => {
                    const f = FEATURE_CATALOG.find((x) => x.code === code);
                    return (
                      <Box key={code} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Check size={14} color="#16a34a" />
                        <Typography variant="body2">{f ? f.label : code}</Typography>
                      </Box>
                    );
                  })}
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>{form.id ? 'Edit Plan' : 'Create Plan'}</DialogTitle>
        <DialogContent dividers>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6 }}><TextField fullWidth label="Plan name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Grid>
            <Grid size={{ xs: 12, sm: 6 }}><TextField fullWidth select label="Billing cycle" value={form.billingCycle} onChange={(e) => setForm({ ...form, billingCycle: e.target.value })}>
              <MenuItem value="monthly">Monthly</MenuItem>
              <MenuItem value="yearly">Yearly</MenuItem>
              <MenuItem value="one_time">One-time</MenuItem>
            </TextField></Grid>
            <Grid size={{ xs: 12, sm: 6 }}><TextField fullWidth type="number" label="Price (GHS)" value={form.price} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} /></Grid>
            <Grid size={{ xs: 12, sm: 6 }}><TextField fullWidth type="number" label="Max members" value={form.maxMembers} onChange={(e) => setForm({ ...form, maxMembers: Number(e.target.value) })} /></Grid>
            <Grid size={{ xs: 12 }}>
              <FormControlLabel control={<Checkbox checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />} label="Plan is active and selectable" />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <Typography variant="subtitle2" fontWeight={800} sx={{ mb: 1 }}>Assign features</Typography>
              <Grid container>
                {FEATURE_CATALOG.map((f) => (
                  <Grid size={{ xs: 12, sm: 6 }} key={f.code}>
                    <FormControlLabel control={<Checkbox size="small" checked={form.features.includes(f.code)} onChange={() => toggleFeature(f.code)} />} label={<Typography variant="body2">{f.label}</Typography>} />
                  </Grid>
                ))}
              </Grid>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={save} disabled={saving} sx={{ borderRadius: 2, fontWeight: 700 }}>{saving ? 'Saving\u2026' : 'Save Plan'}</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!toast} autoHideDuration={3500} onClose={() => setToast(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
        {toast ? <Alert severity={toast.type} onClose={() => setToast(null)}>{toast.msg}</Alert> : undefined}
      </Snackbar>
    </Box>
  );
};

function safeParse(s: string): string[] {
  try { const v = JSON.parse(s); return Array.isArray(v) ? v : []; } catch { return []; }
}

export default PlansManager;
