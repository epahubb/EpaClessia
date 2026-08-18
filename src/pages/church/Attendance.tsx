import React, { useEffect, useMemo, useState } from 'react';
import {
  Box, Typography, Paper, Tabs, Tab, TextField, MenuItem, Alert, CircularProgress,
} from '@mui/material';
import { QrCode, ClipboardList, Fingerprint } from 'lucide-react';
import { churchApi } from '../../services/churchApi';
import QrAttendancePanel from '../../components/attendance/QrAttendancePanel';
import RollCallPanel from '../../components/attendance/RollCallPanel';
import BiometricDevicesPanel from '../../components/attendance/BiometricDevicesPanel';

/**
 * Attendance can be taken three ways, so each gets its own tab:
 *  - QR code    : members scan from their own phone
 *  - Roll call  : an admin, pastor or secretary marks people manually
 *  - Biometric  : ZKTeco terminals post punches on their own
 */
export const ChurchAttendancePage: React.FC = () => {
  const [tab, setTab] = useState(0);
  const [events, setEvents] = useState<any[]>([]);
  const [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const evs = await churchApi.getEvents();
        setEvents(evs);
        if (evs.length) setSelected(evs[0].id);
      } catch {
        setError('Could not load events.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const selectedEvent = useMemo(
    () => events.find((e) => e.id === selected),
    [events, selected],
  );
  const eventName = selectedEvent?.name || selectedEvent?.title;

  // QR and roll call are both per-event; biometric devices are church-wide.
  const needsEvent = tab === 0 || tab === 1;

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" fontWeight={800} sx={{ letterSpacing: '-0.5px' }}>Attendance</Typography>
        <Typography variant="body2" color="text.secondary">
          Record attendance by QR code, by manual roll call, or from a biometric device.
        </Typography>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}>{error}</Alert>}

      <Paper sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider', mb: 3 }}>
        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{ px: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}
        >
          <Tab icon={<QrCode size={18} />} iconPosition="start" label="QR code" sx={{ minHeight: 56, fontWeight: 600 }} />
          <Tab icon={<ClipboardList size={18} />} iconPosition="start" label="Roll call" sx={{ minHeight: 56, fontWeight: 600 }} />
          <Tab icon={<Fingerprint size={18} />} iconPosition="start" label="Biometric devices" sx={{ minHeight: 56, fontWeight: 600 }} />
        </Tabs>

        {needsEvent && (
          <Box sx={{ p: 2.5 }}>
            <TextField
              select
              fullWidth
              label="Event or service"
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              sx={{ maxWidth: 420 }}
            >
              {events.length === 0 && <MenuItem value="" disabled>No events available</MenuItem>}
              {events.map((ev) => (
                <MenuItem key={ev.id} value={ev.id}>{ev.name || ev.title}</MenuItem>
              ))}
            </TextField>
          </Box>
        )}
      </Paper>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}><CircularProgress /></Box>
      ) : needsEvent && !selected ? (
        <Alert severity="info" sx={{ borderRadius: 2 }}>
          Create an event first, then come back to take attendance for it.
        </Alert>
      ) : (
        <>
          {tab === 0 && <QrAttendancePanel eventId={selected} eventName={eventName} />}
          {tab === 1 && <RollCallPanel eventId={selected} />}
          {tab === 2 && <BiometricDevicesPanel />}
        </>
      )}
    </Box>
  );
};

export default ChurchAttendancePage;
