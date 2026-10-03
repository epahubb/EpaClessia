import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, MenuItem, Paper, Stack,
  Table, TableBody, TableCell, TableContainer, TableHead, TablePagination,
  TableRow, TextField, Typography, useTheme,
} from '@mui/material';
import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import churchApi from '../../services/churchApi';
import {
  attendanceDateRange, attendanceOutcome, defaultAttendanceRange,
  summarizeMemberAttendance, type MemberAttendanceRecord,
} from '../../lib/memberAttendance';

const dayLabel = (value: string) => new Date(value).toLocaleDateString(undefined, { timeZone: 'UTC', year: 'numeric', month: 'short', day: 'numeric' });
const monthLabel = (value: string) => new Date(`${value}-01T00:00:00Z`).toLocaleDateString(undefined, { timeZone: 'UTC', month: 'short', year: '2-digit' });

/** Read-only attendance facts, separate from the larger profile request. */
const MemberAttendanceSection: React.FC<{ memberId: string }> = ({ memberId }) => {
  const theme = useTheme();
  const [range, setRange] = useState(defaultAttendanceRange);
  const [draft, setDraft] = useState(range);
  const [records, setRecords] = useState<MemberAttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [validation, setValidation] = useState('');
  const [retry, setRetry] = useState(0);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [preset, setPreset] = useState('90');
  const summary = useMemo(() => summarizeMemberAttendance(records), [records]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(''); setRecords([]); setPage(0);
    churchApi.getMemberAttendance(memberId, range, controller.signal)
      .then(result => { if (!controller.signal.aborted) setRecords(result.records); })
      .catch(e => {
        if (!controller.signal.aborted) setError(e?.friendlyMessage || e?.response?.data?.error || 'Could not load attendance. Please try again.');
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [memberId, range, retry]);

  const apply = () => {
    try { attendanceDateRange(draft.from, draft.to); }
    catch (e) { setValidation((e as Error).message); return; }
    setValidation(''); setRange({ ...draft });
  };
  const choosePreset = (value: string) => {
    setPreset(value); setValidation('');
    if (value === 'custom') return;
    const now = new Date();
    const to = now.toISOString().slice(0, 10);
    const from = value === 'year' ? `${now.getUTCFullYear()}-01-01`
      : new Date(now.getTime() - (Number(value) - 1) * 86400000).toISOString().slice(0, 10);
    setDraft({ from, to }); setRange({ from, to });
  };
  const colors = { present: theme.palette.success.main, absent: theme.palette.error.main };
  const chartStyle = { color: theme.palette.text.primary, backgroundColor: theme.palette.background.paper, borderColor: theme.palette.divider };
  const axis = { fill: theme.palette.text.secondary, fontSize: 12 };

  return (
    <Paper variant="outlined" component="section" aria-labelledby="member-attendance-title" sx={{ p: 2, minWidth: 0 }}>
      <Typography id="member-attendance-title" variant="subtitle1" fontWeight={700} sx={{ mb: 1.5 }}>Attendance</Typography>
      <Stack component="form" onSubmit={e => { e.preventDefault(); apply(); }} direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'flex-start' }} sx={{ '& .MuiInputBase-root': { minHeight: 44 }, '& input[type="date"]': { colorScheme: theme.palette.mode } }}>
        <TextField select label="Date range" size="small" value={preset} onChange={e => choosePreset(e.target.value)} sx={{ minWidth: 145 }}>
          <MenuItem value="30">Last 30 days</MenuItem><MenuItem value="90">Last 90 days</MenuItem>
          <MenuItem value="year">This year</MenuItem><MenuItem value="custom">Custom range</MenuItem>
        </TextField>
        <TextField label="From" type="date" size="small" value={draft.from} slotProps={{ inputLabel: { shrink: true } }}
          onChange={e => { setDraft({ ...draft, from: e.target.value }); setPreset('custom'); setValidation(''); }} sx={{ flex: 1, minWidth: 0 }} />
        <TextField label="To" type="date" size="small" value={draft.to} slotProps={{ inputLabel: { shrink: true } }}
          onChange={e => { setDraft({ ...draft, to: e.target.value }); setPreset('custom'); setValidation(''); }} sx={{ flex: 1, minWidth: 0 }} />
        <Button variant="contained" type="submit" sx={{ minHeight: 44 }}>Apply</Button>
      </Stack>
      {validation && <Alert severity="warning" sx={{ mt: 1.5 }}>{validation}</Alert>}
      <Typography variant="body2" color="text.secondary" sx={{ my: 1.5 }}>
        {dayLabel(range.from)} – {dayLabel(range.to)} · Event dates, inclusive (UTC).
        {' '}Only recorded marks count toward the attendance rate; registrations and unmarked events are not absences.
      </Typography>
      {loading ? <Box role="status" sx={{ py: 4, textAlign: 'center' }}><CircularProgress size={28} /><Typography variant="body2" sx={{ mt: 1 }}>Loading attendance…</Typography></Box>
        : error ? <Alert severity="error" action={<Button color="inherit" sx={{ minHeight: 44 }} onClick={() => setRetry(v => v + 1)}>Retry</Button>}>{error}</Alert>
        : !summary.records.length ? <Alert severity="info">No attendance records for this member in the selected date range. Try a wider range.</Alert>
        : <>
          <Box aria-live="polite" sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' }, gap: 1.5, mb: 2 }}>
            {[
              ['Present', summary.present], ['Absent', summary.absent],
              ['Attendance rate', summary.rate === null ? 'Not available' : `${summary.rate}%`],
              ['Not marked / registration', summary.unmarked],
            ].map(([label, value]) => <Box key={label} sx={{ p: 1.5, border: 1, borderColor: 'divider', borderRadius: 1 }}>
              <Typography variant="body2" color="text.secondary">{label}</Typography>
              <Typography variant="h6" fontWeight={700}>{value}</Typography>
            </Box>)}
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Rate: {summary.present} present / {summary.marked} marked events. Missing monthly marks are not treated as zero attendance.
          </Typography>
          {summary.marked > 0 && <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }, gap: 2, mb: 2 }}>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body2" fontWeight={700}>Monthly attendance counts</Typography>
              <Typography variant="caption" color="text.secondary">Recorded present and absent events</Typography>
              <Box role="img" aria-label={`Monthly attendance counts: ${summary.monthly.map(m => `${monthLabel(m.month)}: ${m.present ?? 'not available'} present, ${m.absent ?? 'not available'} absent`).join('; ')}`} sx={{ height: 250, mt: 1 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={summary.monthly} margin={{ top: 8, right: 8, left: -18, bottom: 8 }} accessibilityLayer>
                    <CartesianGrid stroke={theme.palette.divider} vertical={false} />
                    <XAxis dataKey="month" tickFormatter={monthLabel} tick={axis} minTickGap={24} />
                    <YAxis allowDecimals={false} domain={[0, 'auto']} tick={axis} />
                    <Tooltip labelFormatter={v => monthLabel(String(v))} contentStyle={chartStyle} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="present" name="Present" stackId="attendance" fill={colors.present} maxBarSize={40} isAnimationActive={false} />
                    <Bar dataKey="absent" name="Absent" stackId="attendance" fill={colors.absent} maxBarSize={40} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </Box>
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body2" fontWeight={700}>Monthly attendance rate</Typography>
              <Typography variant="caption" color="text.secondary">Present ÷ marked events (%)</Typography>
              <Box role="img" aria-label={`Monthly attendance rates: ${summary.monthly.map(m => `${monthLabel(m.month)}: ${m.rate === null ? 'not available' : `${m.rate}% of ${m.marked} marked events`}`).join('; ')}`} sx={{ height: 250, mt: 1 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={summary.monthly} margin={{ top: 8, right: 18, left: -8, bottom: 8 }} accessibilityLayer>
                    <CartesianGrid stroke={theme.palette.divider} vertical={false} />
                    <XAxis dataKey="month" tickFormatter={monthLabel} tick={axis} minTickGap={24} />
                    <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={v => `${v}%`} tick={axis} />
                    <Tooltip labelFormatter={v => monthLabel(String(v))} contentStyle={chartStyle}
                      formatter={(v, _name, item) => [`${v}% (${item.payload.marked} marked events)`, 'Attendance rate']} />
                    <Line dataKey="rate" name="Attendance rate" stroke={theme.palette.primary.main} strokeWidth={2} dot={{ r: 4 }} connectNulls={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </Box>
            </Box>
          </Box>}
          <Typography variant="body2" fontWeight={700} sx={{ mb: 1 }}>Attendance history</Typography>
          <TableContainer>
            <Table size="small" aria-label="Member attendance history" sx={{ minWidth: 480 }}>
              <TableHead><TableRow><TableCell>Event date (UTC)</TableCell><TableCell>Event</TableCell><TableCell>Status</TableCell><TableCell>Method</TableCell></TableRow></TableHead>
              <TableBody>{summary.records.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage).map(row => {
                const outcome = attendanceOutcome(row);
                return <TableRow key={row.eventId}>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{dayLabel(row.eventStartTime)}</TableCell>
                  <TableCell sx={{ overflowWrap: 'anywhere' }}>{row.eventTitle || 'Untitled event'}</TableCell>
                  <TableCell><Chip size="small" variant="outlined" color={outcome === 'Present' ? 'success' : outcome === 'Absent' ? 'error' : 'default'} label={outcome} /></TableCell>
                  <TableCell sx={{ textTransform: 'capitalize' }}>{outcome === 'Not marked' ? '—' : row.method === 'qr' ? 'QR' : row.method || 'Not recorded'}</TableCell>
                </TableRow>;
              })}</TableBody>
            </Table>
          </TableContainer>
          <TablePagination component="div" count={summary.records.length} page={page} rowsPerPage={rowsPerPage} rowsPerPageOptions={[10, 25, 50]}
            onPageChange={(_, value) => setPage(value)} onRowsPerPageChange={e => { setRowsPerPage(Number(e.target.value)); setPage(0); }}
            sx={{ '.MuiTablePagination-toolbar': { flexWrap: 'wrap', px: 0 }, '.MuiTablePagination-spacer': { display: { xs: 'none', sm: 'block' } } }} />
        </>}
    </Paper>
  );
};
export default MemberAttendanceSection;
