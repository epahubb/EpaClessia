import React, { useEffect, useState } from 'react';
import {
  Box, Typography, Paper, Button, Grid, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Chip, IconButton, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, Alert, CircularProgress, Tooltip,
} from '@mui/material';
import { CalendarPlus, Users, QrCode, Trash2, RefreshCw, Calendar } from 'lucide-react';
import { churchApi } from '../../services/churchApi';

export const ChurchEventsPage: React.FC = () => {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<any>({ name: '', location: '', startTime: '', description: '' });
  const [checkinFor, setCheckinFor] = useState<any | null>(null);
  const [code, setCode] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      setEvents(await churchApi.getEvents());
    } catch {
      setMsg({ type: 'error', text: 'Could not load events.' });
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const create = async () => {
    setSaving(true);
    try {
      await churchApi.createEvent(form);
      setMsg({ type: 'success', text: 'Event created.' });
      setOpen(false);
      setForm({ name: '', location: '', startTime: '', description: '' });
      await load();
    } catch {
      setMsg({ type: 'error', text: 'Failed to create event.' });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm('Delete this event?')) return;
    try { await churchApi.deleteEvent(id); await load(); } catch { setMsg({ type: 'error', text: 'Delete failed.' }); }
  };

  const doCheckin = async () => {
    if (!checkinFor) return;
    try {
      await churchApi.checkIn(checkinFor.id, { code });
      setMsg({ type: 'success', text: 'Attendance recorded.' });
      setCheckinFor(null); setCode('');
    } catch {
      setMsg({ type: 'error', text: 'Check-in failed. Verify the code.' });
    }
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2, mb: 3 }}>
        <Box>
          <Typography variant="h4" fontWeight={800} sx={{ letterSpacing: '-0.5px' }}>Events & Services</Typography>
          <Typography variant="body2" color="text.secondary">Plan services, programmes, and run attendance check-in.</Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1.5 }}>
          <Button variant="outlined" startIcon={<RefreshCw size={18} />} onClick={load} sx={{ borderRadius: 2 }}>Refresh</Button>
          <Button variant="contained" startIcon={<CalendarPlus size={18} />} onClick={() => setOpen(true)} sx={{ borderRadius: 2, fontWeight: 700 }}>New Event</Button>
        </Box>
      </Box>

      {msg && <Alert severity={msg.type} onClose={() => setMsg(null)} sx={{ mb: 3, borderRadius: 2 }}>{msg.text}</Alert>}

      <Paper sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider' }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}><CircularProgress /></Box>
        ) : events.length === 0 ? (
          <Box sx={{ textAlign: 'center', p: 6, color: 'text.secondary' }}>
            <Calendar size={40} />
            <Typography sx={{ mt: 1 }}>No events yet. Create your first service or programme.</Typography>
          </Box>
        ) : (
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700 }}>Event</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>When</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Location</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Check-in code</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {events.map((ev) => (
                  <TableRow key={ev.id} hover>
                    <TableCell>
                      <Typography variant="body2" fontWeight={700}>{ev.name || ev.title}</Typography>
                      <Typography variant="caption" color="text.secondary">{ev.description}</Typography>
                    </TableCell>
                    <TableCell>{ev.startTime ? new Date(ev.startTime).toLocaleString() : '—'}</TableCell>
                    <TableCell>{ev.location || '—'}</TableCell>
                    <TableCell>{ev.checkinCode ? <Chip size="small" label={ev.checkinCode} color="primary" /> : '—'}</TableCell>
                    <TableCell align="right">
                      <Tooltip title="Check-in"><IconButton size="small" onClick={() => setCheckinFor(ev)}><QrCode size={18} /></IconButton></Tooltip>
                      <Tooltip title="Delete"><IconButton size="small" color="error" onClick={() => remove(ev.id)}><Trash2 size={18} /></IconButton></Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>Create event</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid size={{ xs: 12 }}><TextField fullWidth label="Event name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Grid>
            <Grid size={{ xs: 12, sm: 6 }}><TextField fullWidth type="datetime-local" label="Start time" InputLabelProps={{ shrink: true }} value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} /></Grid>
            <Grid size={{ xs: 12, sm: 6 }}><TextField fullWidth label="Location" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></Grid>
            <Grid size={{ xs: 12 }}><TextField fullWidth multiline minRows={2} label="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ p: 2.5 }}>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={create} disabled={saving || !form.name} sx={{ fontWeight: 700 }}>Create</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!checkinFor} onClose={() => setCheckinFor(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 1 }}><Users size={20} /> Attendance check-in</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Enter the member's check-in code for <strong>{checkinFor?.name}</strong>.
          </Typography>
          <TextField fullWidth label="Check-in code" value={code} onChange={(e) => setCode(e.target.value)} autoFocus />
        </DialogContent>
        <DialogActions sx={{ p: 2.5 }}>
          <Button onClick={() => setCheckinFor(null)}>Cancel</Button>
          <Button variant="contained" onClick={doCheckin} disabled={!code} sx={{ fontWeight: 700 }}>Record</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ChurchEventsPage;
