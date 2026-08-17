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
import { Plus, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { pastorService } from '../../services/pastorService';

type Toast = { open: boolean; message: string; severity: 'success' | 'error' | 'info' };

interface Session {
  id: string;
  memberName: string | null;
  category: string;
  sessionDate: string | null;
  status: string;
  followUpDate: string | null;
  notes: string | null;
}

const CATEGORIES = ['general', 'marriage', 'grief', 'spiritual', 'financial', 'addiction', 'other'];
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

export default function PastorCounseling() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<Toast>({ open: false, message: '', severity: 'success' });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ memberName: '', category: 'general', sessionDate: '', notes: '' });

  const notify = (message: string, severity: Toast['severity'] = 'success') =>
    setToast({ open: true, message, severity });

  const load = async () => {
    try {
      const res = await pastorService.getCounselingSessions();
      setSessions(res.data || []);
    } catch (e: any) {
      notify(e?.message || 'Failed to load counseling sessions', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreate = async () => {
    if (!form.memberName.trim()) {
      notify('Please enter the member name', 'error');
      return;
    }
    try {
      await pastorService.recordCounseling(form as any);
      notify('Counseling session recorded.');
      setDialogOpen(false);
      setForm({ memberName: '', category: 'general', sessionDate: '', notes: '' });
      await load();
    } catch (e: any) {
      notify(e?.message || 'Could not record session', 'error');
    }
  };

  const markComplete = async (s: Session) => {
    try {
      await pastorService.updateCounseling(s.id, { status: 'completed' });
      notify('Session marked complete.');
      await load();
    } catch (e: any) {
      notify(e?.message || 'Could not update session', 'error');
    }
  };

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }} flexWrap="wrap" gap={2}>
        <Box>
          <Typography variant="h4" fontWeight={700} gutterBottom>
            Counseling
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Schedule sessions and keep confidential case notes.
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<Plus size={18} />} onClick={() => setDialogOpen(true)}>
          New session
        </Button>
      </Stack>

      <Alert severity="info" icon={<ShieldCheck size={18} />} sx={{ mb: 3 }}>
        Counseling notes are confidential and visible only to pastoral staff in your church.
      </Alert>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : sessions.length === 0 ? (
        <Paper sx={{ p: 6, textAlign: 'center' }}>
          <ShieldCheck size={40} style={{ opacity: 0.4 }} />
          <Typography variant="h6" sx={{ mt: 2 }}>
            No sessions yet
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Record your first counseling session with the button above.
          </Typography>
        </Paper>
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Member</TableCell>
                <TableCell>Category</TableCell>
                <TableCell>Session</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Action</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sessions.map((s) => (
                <TableRow key={s.id} hover>
                  <TableCell>{s.memberName || '—'}</TableCell>
                  <TableCell sx={{ textTransform: 'capitalize' }}>{s.category}</TableCell>
                  <TableCell>{fmt(s.sessionDate)}</TableCell>
                  <TableCell>
                    <Chip size="small" color={STATUS_COLORS[s.status] || 'default'} label={s.status} sx={{ textTransform: 'capitalize' }} />
                  </TableCell>
                  <TableCell align="right">
                    {s.status === 'scheduled' && (
                      <Button size="small" startIcon={<CheckCircle2 size={16} />} onClick={() => markComplete(s)}>
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
        <DialogTitle>New counseling session</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="Member" required fullWidth value={form.memberName} onChange={(e) => setForm({ ...form, memberName: e.target.value })} />
            <TextField select label="Category" fullWidth value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {CATEGORIES.map((c) => (
                <MenuItem key={c} value={c} sx={{ textTransform: 'capitalize' }}>
                  {c}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Session date & time"
              type="datetime-local"
              fullWidth
              InputLabelProps={{ shrink: true }}
              value={form.sessionDate}
              onChange={(e) => setForm({ ...form, sessionDate: e.target.value })}
            />
            <TextField label="Confidential notes" fullWidth multiline minRows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleCreate}>
            Save session
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
