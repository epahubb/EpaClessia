import { useEffect, useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  Grid,
  Card,
  CardContent,
  Button,
  Chip,
  Snackbar,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  CircularProgress,
  Stack,
  Select,
  FormControlLabel,
  Switch,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import { Plus, HeartHandshake, Lock } from 'lucide-react';
import { pastorService } from '../../services/pastorService';

type Toast = { open: boolean; message: string; severity: 'success' | 'error' | 'info' };

interface Prayer {
  id: string;
  requesterName: string | null;
  request: string;
  category: string;
  status: string;
  isPrivate: boolean | number;
  assignedTo: string | null;
  followUpDate: string | null;
  notes: string | null;
  createdAt: string;
}

const CATEGORIES = ['general', 'healing', 'family', 'financial', 'thanksgiving', 'guidance'];
const STATUSES = ['open', 'praying', 'answered', 'closed'];
const STATUS_COLORS: Record<string, 'warning' | 'info' | 'success' | 'default'> = {
  open: 'warning',
  praying: 'info',
  answered: 'success',
  closed: 'default',
};

export default function PastorPrayers() {
  const [prayers, setPrayers] = useState<Prayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('active');
  const [toast, setToast] = useState<Toast>({ open: false, message: '', severity: 'success' });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ requesterName: '', request: '', category: 'general', isPrivate: false });

  const notify = (message: string, severity: Toast['severity'] = 'success') =>
    setToast({ open: true, message, severity });

  const load = async () => {
    try {
      const res = await pastorService.getPrayerRequests();
      setPrayers(res.data || []);
    } catch (e: any) {
      notify(e?.message || 'Failed to load prayer requests', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreate = async () => {
    if (!form.request.trim()) {
      notify('Please enter the prayer request', 'error');
      return;
    }
    try {
      await pastorService.createPrayerRequest(form);
      notify('Prayer request added.');
      setDialogOpen(false);
      setForm({ requesterName: '', request: '', category: 'general', isPrivate: false });
      await load();
    } catch (e: any) {
      notify(e?.message || 'Could not add prayer request', 'error');
    }
  };

  const changeStatus = async (p: Prayer, status: string) => {
    try {
      await pastorService.updatePrayerRequest(p.id, { status } as any);
      setPrayers((prev) => prev.map((x) => (x.id === p.id ? { ...x, status } : x)));
    } catch (e: any) {
      notify(e?.message || 'Could not update status', 'error');
    }
  };

  const visible = prayers.filter((p) =>
    filter === 'all' ? true : filter === 'active' ? ['open', 'praying'].includes(p.status) : p.status === filter
  );

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }} flexWrap="wrap" gap={2}>
        <Box>
          <Typography variant="h4" fontWeight={700} gutterBottom>
            Prayer Requests
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Receive, pray over, and follow up with your congregation.
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<Plus size={18} />} onClick={() => setDialogOpen(true)}>
          New request
        </Button>
      </Stack>

      <ToggleButtonGroup
        size="small"
        value={filter}
        exclusive
        onChange={(_, v) => v && setFilter(v)}
        sx={{ mb: 3, flexWrap: 'wrap' }}
      >
        <ToggleButton value="active">Active</ToggleButton>
        <ToggleButton value="answered">Answered</ToggleButton>
        <ToggleButton value="closed">Closed</ToggleButton>
        <ToggleButton value="all">All</ToggleButton>
      </ToggleButtonGroup>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : visible.length === 0 ? (
        <Paper sx={{ p: 6, textAlign: 'center' }}>
          <HeartHandshake size={40} style={{ opacity: 0.4 }} />
          <Typography variant="h6" sx={{ mt: 2 }}>
            No prayer requests here
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Add one with the button above, or check another filter.
          </Typography>
        </Paper>
      ) : (
        <Grid container spacing={2}>
          {visible.map((p) => (
            <Grid size={{ xs: 12, md: 6 }} key={p.id}>
              <Card sx={{ height: '100%' }}>
                <CardContent>
                  <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                      <Chip size="small" label={p.category} sx={{ textTransform: 'capitalize' }} />
                      {(p.isPrivate === true || p.isPrivate === 1) && (
                        <Chip size="small" color="default" icon={<Lock size={12} />} label="Private" />
                      )}
                    </Stack>
                    <Chip
                      size="small"
                      color={STATUS_COLORS[p.status] || 'default'}
                      label={p.status}
                      sx={{ textTransform: 'capitalize' }}
                    />
                  </Stack>
                  <Typography variant="body1" sx={{ mt: 1.5 }}>
                    {p.request}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {p.requesterName || 'Anonymous'} · {new Date(p.createdAt).toLocaleDateString()}
                  </Typography>
                  <Box sx={{ mt: 2 }}>
                    <Select
                      size="small"
                      value={p.status}
                      onChange={(e) => changeStatus(p, e.target.value)}
                      sx={{ minWidth: 140 }}
                    >
                      {STATUSES.map((s) => (
                        <MenuItem key={s} value={s} sx={{ textTransform: 'capitalize' }}>
                          {s}
                        </MenuItem>
                      ))}
                    </Select>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>New prayer request</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Requester name (optional)"
              fullWidth
              value={form.requesterName}
              onChange={(e) => setForm({ ...form, requesterName: e.target.value })}
            />
            <TextField
              label="Prayer request"
              fullWidth
              required
              multiline
              minRows={3}
              value={form.request}
              onChange={(e) => setForm({ ...form, request: e.target.value })}
            />
            <TextField
              select
              label="Category"
              fullWidth
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            >
              {CATEGORIES.map((c) => (
                <MenuItem key={c} value={c} sx={{ textTransform: 'capitalize' }}>
                  {c}
                </MenuItem>
              ))}
            </TextField>
            <FormControlLabel
              control={
                <Switch
                  checked={form.isPrivate}
                  onChange={(e) => setForm({ ...form, isPrivate: e.target.checked })}
                />
              }
              label="Mark as private (care team only)"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleCreate}>
            Add request
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={toast.open}
        autoHideDuration={4000}
        onClose={() => setToast((t) => ({ ...t, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={toast.severity} variant="filled" onClose={() => setToast((t) => ({ ...t, open: false }))}>
          {toast.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
