import React, { useEffect, useState } from 'react';
import {
  Box, Typography, Paper, Button, Card, CardContent, Grid, Chip,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField,
  FormControl, InputLabel, Select, MenuItem, Snackbar, Alert,
  CircularProgress, Stack,
} from '@mui/material';
import { Plus, Calendar, MapPin, Clock } from 'lucide-react';
import { ministryLeaderService } from '../../services/ministryLeaderService';

interface MinistryOption {
  id: string;
  name: string;
}

interface MinistryEvent {
  id: string;
  title: string;
  description?: string;
  location?: string;
  startTime?: string;
  endTime?: string;
  category?: string;
}

const MinistryEvents: React.FC = () => {
  const [ministries, setMinistries] = useState<MinistryOption[]>([]);
  const [ministryId, setMinistryId] = useState<string>('');
  const [events, setEvents] = useState<MinistryEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [toast, setToast] = useState<{ msg: string; sev: 'success' | 'error' } | null>(null);

  const [form, setForm] = useState({
    title: '',
    description: '',
    location: '',
    startTime: '',
    endTime: '',
    category: 'ministry',
  });

  useEffect(() => {
    (async () => {
      try {
        const list = await ministryLeaderService.getManagedMinistries();
        setMinistries(list || []);
        if (list && list.length > 0) setMinistryId(list[0].id);
        else setLoading(false);
      } catch {
        setToast({ msg: 'Failed to load ministries', sev: 'error' });
        setLoading(false);
      }
    })();
  }, []);

  const loadEvents = async (mid: string) => {
    if (!mid) return;
    setLoading(true);
    try {
      const data = await ministryLeaderService.getEvents(mid);
      setEvents(data || []);
    } catch {
      setToast({ msg: 'Failed to load events', sev: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (ministryId) loadEvents(ministryId);
  }, [ministryId]);

  const handleCreate = async () => {
    if (!form.title.trim()) {
      setToast({ msg: 'Event title is required', sev: 'error' });
      return;
    }
    setSaving(true);
    try {
      await ministryLeaderService.createEvent(ministryId, {
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        location: form.location.trim() || undefined,
        startTime: form.startTime || undefined,
        endTime: form.endTime || undefined,
        category: form.category,
      } as any);
      setToast({ msg: 'Event created', sev: 'success' });
      setDialogOpen(false);
      setForm({ title: '', description: '', location: '', startTime: '', endTime: '', category: 'ministry' });
      loadEvents(ministryId);
    } catch {
      setToast({ msg: 'Failed to create event', sev: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const now = Date.now();

  return (
    <Box>
      <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="h4" fontWeight={800} sx={{ letterSpacing: '-1px' }}>Ministry Events</Typography>
          <Typography variant="body1" color="text.secondary">Organize meetings, rehearsals, and activities</Typography>
        </Box>
        <Stack direction="row" spacing={2} alignItems="center">
          {ministries.length > 0 && (
            <FormControl size="small" sx={{ minWidth: 200 }}>
              <InputLabel>Ministry</InputLabel>
              <Select value={ministryId} label="Ministry" onChange={(e) => setMinistryId(e.target.value)}>
                {ministries.map((m) => (
                  <MenuItem key={m.id} value={m.id}>{m.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
          <Button variant="contained" startIcon={<Plus size={18} />} sx={{ borderRadius: 2 }}
            disabled={!ministryId} onClick={() => setDialogOpen(true)}>Schedule event</Button>
        </Stack>
      </Box>

      {ministries.length === 0 && !loading && (
        <Paper sx={{ p: 4, borderRadius: 4, textAlign: 'center' }}>
          <Typography color="text.secondary">You are not leading any ministries yet. Ask a church admin to assign you as a ministry leader.</Typography>
        </Paper>
      )}

      {ministryId && (
        loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}><CircularProgress /></Box>
        ) : events.length === 0 ? (
          <Paper sx={{ p: 4, borderRadius: 4, textAlign: 'center' }}>
            <Calendar size={32} style={{ opacity: 0.3 }} />
            <Typography color="text.secondary" sx={{ mt: 1 }}>No events scheduled yet.</Typography>
          </Paper>
        ) : (
          <Grid container spacing={2}>
            {events.map((ev) => {
              const start = ev.startTime ? new Date(ev.startTime) : null;
              const isUpcoming = start ? start.getTime() >= now : false;
              return (
                <Grid size={{ xs: 12, md: 6 }} key={ev.id}>
                  <Card sx={{ borderRadius: 3, height: '100%' }}>
                    <CardContent>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1 }}>
                        <Typography fontWeight={700}>{ev.title}</Typography>
                        <Chip size="small" label={isUpcoming ? 'Upcoming' : 'Past'} color={isUpcoming ? 'success' : 'default'} />
                      </Box>
                      {ev.description && (
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{ev.description}</Typography>
                      )}
                      <Stack spacing={0.5} sx={{ mt: 1.5 }}>
                        {start && (
                          <Stack direction="row" spacing={1} alignItems="center">
                            <Clock size={14} />
                            <Typography variant="body2">{start.toLocaleString()}</Typography>
                          </Stack>
                        )}
                        {ev.location && (
                          <Stack direction="row" spacing={1} alignItems="center">
                            <MapPin size={14} />
                            <Typography variant="body2">{ev.location}</Typography>
                          </Stack>
                        )}
                      </Stack>
                    </CardContent>
                  </Card>
                </Grid>
              );
            })}
          </Grid>
        )
      )}

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Schedule event</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="Title" fullWidth required value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <TextField label="Description" fullWidth multiline rows={3} value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })} />
            <TextField label="Location" fullWidth value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })} />
            <TextField label="Start" type="datetime-local" fullWidth InputLabelProps={{ shrink: true }}
              value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} />
            <TextField label="End" type="datetime-local" fullWidth InputLabelProps={{ shrink: true }}
              value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleCreate} disabled={saving}>{saving ? 'Saving...' : 'Schedule'}</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!toast} autoHideDuration={4000} onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        {toast ? <Alert severity={toast.sev} onClose={() => setToast(null)}>{toast.msg}</Alert> : undefined}
      </Snackbar>
    </Box>
  );
};

export default MinistryEvents;
