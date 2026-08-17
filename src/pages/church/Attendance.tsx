import React, { useEffect, useState } from 'react';
import {
  Box, Typography, Paper, Grid, TextField, MenuItem, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Chip, Alert, CircularProgress,
} from '@mui/material';
import { CheckCircle2, Users } from 'lucide-react';
import { churchApi } from '../../services/churchApi';

export const ChurchAttendancePage: React.FC = () => {
  const [events, setEvents] = useState<any[]>([]);
  const [selected, setSelected] = useState('');
  const [attendance, setAttendance] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingAtt, setLoadingAtt] = useState(false);
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

  useEffect(() => {
    if (!selected) return;
    (async () => {
      setLoadingAtt(true);
      try { setAttendance(await churchApi.getAttendance(selected)); }
      catch { setAttendance([]); }
      finally { setLoadingAtt(false); }
    })();
  }, [selected]);

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" fontWeight={800} sx={{ letterSpacing: '-0.5px' }}>Attendance</Typography>
        <Typography variant="body2" color="text.secondary">Track who attended each service or programme.</Typography>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}>{error}</Alert>}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}><CircularProgress /></Box>
      ) : (
        <Grid container spacing={3}>
          <Grid size={{ xs: 12, md: 4 }}>
            <Paper sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider', p: 2.5 }}>
              <TextField select fullWidth label="Select event" value={selected} onChange={(e) => setSelected(e.target.value)}>
                {events.length === 0 && <MenuItem value="" disabled>No events available</MenuItem>}
                {events.map((ev) => <MenuItem key={ev.id} value={ev.id}>{ev.name || ev.title}</MenuItem>)}
              </TextField>
              <Box sx={{ mt: 3, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Box sx={{ width: 44, height: 44, borderRadius: 2, bgcolor: 'success.light', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Users size={22} />
                </Box>
                <Box>
                  <Typography variant="h5" fontWeight={800}>{attendance.length}</Typography>
                  <Typography variant="caption" color="text.secondary">Checked in</Typography>
                </Box>
              </Box>
            </Paper>
          </Grid>

          <Grid size={{ xs: 12, md: 8 }}>
            <Paper sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider' }}>
              {loadingAtt ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}><CircularProgress /></Box>
              ) : attendance.length === 0 ? (
                <Box sx={{ textAlign: 'center', p: 6, color: 'text.secondary' }}>
                  <CheckCircle2 size={40} />
                  <Typography sx={{ mt: 1 }}>No check-ins recorded for this event yet.</Typography>
                </Box>
              ) : (
                <TableContainer>
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 700 }}>Member</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Checked in</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {attendance.map((a, i) => (
                        <TableRow key={a.id || i} hover>
                          <TableCell>{a.memberName || a.name || a.memberId || 'Guest'}</TableCell>
                          <TableCell>{a.checkinTime || a.createdAt ? new Date(a.checkinTime || a.createdAt).toLocaleString() : '—'}</TableCell>
                          <TableCell><Chip size="small" color={a.checkoutTime ? 'default' : 'success'} label={a.checkoutTime ? 'Checked out' : 'Present'} /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </Paper>
          </Grid>
        </Grid>
      )}
    </Box>
  );
};

export default ChurchAttendancePage;
