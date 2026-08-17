import { useEffect, useState } from 'react';
import {
  Box,
  Paper,
  Typography,
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
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from '@mui/material';
import { Plus, MapPin, CheckCircle2 } from 'lucide-react';
import { pastorService } from '../../services/pastorService';

type Toast = { open: boolean; message: string; severity: 'success' | 'error' | 'info' };

interface Visit {
  id: string;
  memberName: string | null;
  visitType: string;
  location: string | null;
  scheduledDate: string | null;
  completedDate: string | null;
  status: string;
  notes: string | null;
}

const VISIT_TYPES = ['home', 'hospital', 'bereavement', 'prison', 'other'];
const STATUS_COLORS: Record<string, 'warning' | 'success' | 'default'> = {
  scheduled: 'warning',
  completed: 'success',
  cancelled: 'default',
};

function fmt(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  } catch {
    return iso;
  }
}

export default function PastorVisitation() {
  const [visits, setVisits] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<Toast>({ open: false, message: '', severity: 'success' });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ memberName: '', visitType: 'home', location: '', scheduledDate: '', notes: '' });

  const notify = (message: string, severity: Toast['severity'] = 'success') =>
    setToast({ open: true, message, severity });

  const load = async () => {
    try {
      const res = await pastorService.getVisitations();
      setVisits(res.data || []);
    } catch (e: any) {
      notify(e?.message || 'Failed to load visitations', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreate = async () => {
    if (!form.memberName.trim()) {
      notify('Please enter who you are visiting', 'error');
      return;
    }
    try {
      await pastorService.recordVisitation(form as any);
      notify('Visit scheduled.');
      setDialogOpen(false);
      setForm({ memberName: '', visitType: 'home', location: '', scheduledDate: '', notes: '' });
      await load();
    } catch (e: any) {
      notify(e?.message || 'Could not schedule visit', 'error');
    }
  };

  const markComplete = async (v: Visit) => {
    try {
      await pastorService.updateVisitation(v.id, { status: 'completed' });
      notify('Visit marked complete.');
      await load();
    } catch (e: any) {
      notify(e?.message || 'Could not update visit', 'error');
    }
  };

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }} flexWrap="wrap" gap={2}>
        <Box>
          <Typography variant="h4" fontWeight={700} gutterBottom>
            Visitation
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Plan and log pastoral visits — home, hospital, and bereavement.
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<Plus size={18} />} onClick={() => setDialogOpen(true)}>
          Schedule visit
        </Button>
      </Stack>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : visits.length === 0 ? (
        <Paper sx={{ p: 6, textAlign: 'center' }}>
          <MapPin size={40} style={{ opacity: 0.4 }} />
          <Typography variant="h6" sx={{ mt: 2 }}>
            No visits yet
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Schedule your first pastoral visit with the button above.
          </Typography>
        </Paper>
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Member</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Location</TableCell>
                <TableCell>Scheduled</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Action</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {visits.map((v) => (
                <TableRow key={v.id} hover>
                  <TableCell>{v.memberName || '—'}</TableCell>
                  <TableCell sx={{ textTransform: 'capitalize' }}>{v.visitType}</TableCell>
                  <TableCell>{v.location || '—'}</TableCell>
                  <TableCell>{fmt(v.scheduledDate)}</TableCell>
                  <TableCell>
                    <Chip size="small" color={STATUS_COLORS[v.status] || 'default'} label={v.status} sx={{ textTransform: 'capitalize' }} />
                  </TableCell>
                  <TableCell align="right">
                    {v.status === 'scheduled' && (
                      <Button size="small" startIcon={<CheckCircle2 size={16} />} onClick={() => markComplete(v)}>
                        Complete
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Schedule a visit</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="Member / person" required fullWidth value={form.memberName} onChange={(e) => setForm({ ...form, memberName: e.target.value })} />
            <TextField select label="Visit type" fullWidth value={form.visitType} onChange={(e) => setForm({ ...form, visitType: e.target.value })}>
              {VISIT_TYPES.map((t) => (
                <MenuItem key={t} value={t} sx={{ textTransform: 'capitalize' }}>
                  {t}
                </MenuItem>
              ))}
            </TextField>
            <TextField label="Location" fullWidth value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
            <TextField
              label="Scheduled date & time"
              type="datetime-local"
              fullWidth
              InputLabelProps={{ shrink: true }}
              value={form.scheduledDate}
              onChange={(e) => setForm({ ...form, scheduledDate: e.target.value })}
            />
            <TextField label="Notes" fullWidth multiline minRows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleCreate}>
            Schedule
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
