import { useEffect, useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  Grid,
  Card,
  CardContent,
  CardActions,
  Button,
  Chip,
  Snackbar,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
  Stack,
  Divider,
} from '@mui/material';
import {
  Calendar,
  MapPin,
  Users,
  CheckCircle2,
  Clock,
  CalendarPlus,
  Ticket,
} from 'lucide-react';
import { eventsService, MemberEvent } from '../../services/eventsService';
import { useAuth } from '../../contexts/AuthContext';

type Toast = { open: boolean; message: string; severity: 'success' | 'error' | 'info' };

const CATEGORY_COLORS: Record<string, 'primary' | 'secondary' | 'success' | 'warning' | 'info' | 'default'> = {
  service: 'primary',
  class: 'info',
  meeting: 'secondary',
  outreach: 'success',
};

function formatDateTime(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

// Build and download an .ics calendar file for an event (no dependency needed).
function addToCalendar(ev: MemberEvent) {
  const dt = (iso: string | null): string => {
    const d = iso ? new Date(iso) : new Date();
    return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  };
  const end = ev.endTime || new Date(new Date(ev.startTime).getTime() + 60 * 60 * 1000).toISOString();
  const esc = (s: string) => (s || '').replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//EpaChurch//Events//EN',
    'BEGIN:VEVENT',
    `UID:${ev.id}@epachurch`,
    `DTSTAMP:${dt(new Date().toISOString())}`,
    `DTSTART:${dt(ev.startTime)}`,
    `DTEND:${dt(end)}`,
    `SUMMARY:${esc(ev.title)}`,
    ev.description ? `DESCRIPTION:${esc(ev.description)}` : '',
    ev.location ? `LOCATION:${esc(ev.location)}` : '',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean);
  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${ev.title.replace(/[^a-z0-9]+/gi, '_').toLowerCase()}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function MemberEvents() {
  const { user } = useAuth();
  const [events, setEvents] = useState<MemberEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast>({ open: false, message: '', severity: 'success' });
  const [checkInDialog, setCheckInDialog] = useState<{ open: boolean; code: string; title: string }>({
    open: false,
    code: '',
    title: '',
  });

  const notify = (message: string, severity: Toast['severity'] = 'success') =>
    setToast({ open: true, message, severity });

  const loadEvents = async () => {
    try {
      const res = await eventsService.getEvents();
      setEvents(res.data || []);
    } catch (e: any) {
      notify(e?.message || 'Failed to load events', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEvents();
  }, []);

  const handleRegister = async (ev: MemberEvent) => {
    setBusyId(ev.id);
    try {
      const res = await eventsService.register(ev.id);
      notify(res.alreadyRegistered ? "You're already registered." : "You're registered! See you there.");
      await loadEvents();
    } catch (e: any) {
      notify(e?.message || 'Could not register for this event', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleCancel = async (ev: MemberEvent) => {
    setBusyId(ev.id);
    try {
      await eventsService.cancel(ev.id);
      notify('Your registration was cancelled.', 'info');
      await loadEvents();
    } catch (e: any) {
      notify(e?.message || 'Could not cancel your registration', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleCheckIn = async (ev: MemberEvent) => {
    setBusyId(ev.id);
    try {
      const res = await eventsService.checkIn(ev.id);
      setCheckInDialog({ open: true, code: res.checkInCode, title: ev.title });
      await loadEvents();
    } catch (e: any) {
      notify(e?.message || 'Could not check you in', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const firstName = (user?.name || '').split(' ')[0];

  const renderStatusChip = (ev: MemberEvent) => {
    if (ev.myStatus === 'checked_in')
      return <Chip size="small" color="success" icon={<CheckCircle2 size={14} />} label="Checked in" />;
    if (ev.myStatus === 'registered')
      return <Chip size="small" color="primary" variant="outlined" icon={<Ticket size={14} />} label="Registered" />;
    return null;
  };

  const renderActions = (ev: MemberEvent) => {
    const busy = busyId === ev.id;
    const isFull = ev.spotsLeft !== null && ev.spotsLeft <= 0 && ev.myStatus === null;
    return (
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        {ev.myStatus === null && (
          <Button
            size="small"
            variant="contained"
            disabled={busy || isFull}
            onClick={() => handleRegister(ev)}
          >
            {isFull ? 'Fully booked' : 'Register'}
          </Button>
        )}
        {ev.myStatus === 'registered' && (
          <>
            <Button size="small" variant="contained" color="success" disabled={busy} onClick={() => handleCheckIn(ev)}>
              Check in
            </Button>
            <Button size="small" color="error" disabled={busy} onClick={() => handleCancel(ev)}>
              Cancel
            </Button>
          </>
        )}
        {ev.myStatus === 'checked_in' && (
          <Button
            size="small"
            variant="outlined"
            color="success"
            onClick={() => setCheckInDialog({ open: true, code: ev.myCheckInCode || '', title: ev.title })}
          >
            Show code
          </Button>
        )}
        <Button size="small" startIcon={<CalendarPlus size={16} />} onClick={() => addToCalendar(ev)}>
          Add to calendar
        </Button>
      </Stack>
    );
  };

  return (
    <Box>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" fontWeight={700} gutterBottom>
          Events
        </Typography>
        <Typography variant="body1" color="text.secondary">
          {firstName ? `${firstName}, discover` : 'Discover'} what's happening and reserve your spot.
        </Typography>
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : events.length === 0 ? (
        <Paper sx={{ p: 6, textAlign: 'center' }}>
          <Calendar size={40} style={{ opacity: 0.4 }} />
          <Typography variant="h6" sx={{ mt: 2 }}>
            No upcoming events
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Check back soon — your church hasn't published any upcoming events yet.
          </Typography>
        </Paper>
      ) : (
        <Grid container spacing={3}>
          {events.map((ev) => (
            <Grid item xs={12} md={6} lg={4} key={ev.id}>
              <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                <CardContent sx={{ flexGrow: 1 }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                    <Chip
                      size="small"
                      label={ev.category || 'event'}
                      color={CATEGORY_COLORS[ev.category] || 'default'}
                      sx={{ textTransform: 'capitalize' }}
                    />
                    {renderStatusChip(ev)}
                  </Stack>
                  <Typography variant="h6" fontWeight={700} sx={{ mt: 1.5 }}>
                    {ev.title}
                  </Typography>
                  <Stack spacing={0.75} sx={{ mt: 1.5, color: 'text.secondary' }}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Clock size={15} />
                      <Typography variant="body2">{formatDateTime(ev.startTime)}</Typography>
                    </Stack>
                    {ev.location && (
                      <Stack direction="row" spacing={1} alignItems="center">
                        <MapPin size={15} />
                        <Typography variant="body2">{ev.location}</Typography>
                      </Stack>
                    )}
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Users size={15} />
                      <Typography variant="body2">
                        {ev.registeredCount} going
                        {ev.spotsLeft !== null ? ` · ${ev.spotsLeft} spots left` : ''}
                      </Typography>
                    </Stack>
                  </Stack>
                  {ev.description && (
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
                      {ev.description.length > 160 ? `${ev.description.slice(0, 160)}…` : ev.description}
                    </Typography>
                  )}
                </CardContent>
                <Divider />
                <CardActions sx={{ p: 2 }}>{renderActions(ev)}</CardActions>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      <Dialog open={checkInDialog.open} onClose={() => setCheckInDialog({ open: false, code: '', title: '' })}>
        <DialogTitle>You're checked in!</DialogTitle>
        <DialogContent sx={{ textAlign: 'center', minWidth: 320 }}>
          <CheckCircle2 size={48} color="#2e7d32" style={{ marginBottom: 8 }} />
          <Typography variant="body2" color="text.secondary">
            {checkInDialog.title}
          </Typography>
          <Typography variant="body2" sx={{ mt: 2 }}>
            Show this code to an usher:
          </Typography>
          <Typography
            variant="h2"
            fontWeight={800}
            sx={{ letterSpacing: 8, my: 1, fontFamily: 'monospace' }}
          >
            {checkInDialog.code}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCheckInDialog({ open: false, code: '', title: '' })}>Done</Button>
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
