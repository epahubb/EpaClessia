import React, { useEffect, useState } from 'react';
import {
  Box, Typography, Card, CardContent, Grid, Tabs, Tab, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Paper, Chip, Button, Stack,
  TextField, MenuItem, Alert, CircularProgress, Dialog, DialogTitle,
  DialogContent, DialogActions, Tooltip,
} from '@mui/material';
import { RefreshCw, Send, UserCheck } from 'lucide-react';
import churchApi from '../../services/churchApi';

/**
 * Member engagement and absence follow-up.
 *
 * Two related things live here because they are one workflow in practice: the
 * church looks at who has stopped attending, then sends those people the
 * questionnaire asking why.
 */

const STATUS_META: Record<string, { label: string; color: any; help: string }> = {
  active: { label: 'Active', color: 'success', help: 'Attending regularly.' },
  inactive: { label: 'Inactive', color: 'warning', help: 'Has not attended for a while.' },
  backslider: { label: 'Backslider', color: 'error', help: 'Absent long enough to need pastoral attention.' },
  new: { label: 'New', color: 'info', help: 'Recently joined, not yet enough attendance to judge.' },
};

const statusChip = (status: string) => {
  const meta = STATUS_META[status] || { label: status || 'unknown', color: 'default', help: '' };
  return (
    <Tooltip title={meta.help}>
      <Chip size="small" label={meta.label} color={meta.color} />
    </Tooltip>
  );
};

const EngagementPanel: React.FC = () => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [override, setOverride] = useState<any | null>(null);
  const [overrideStatus, setOverrideStatus] = useState('active');
  const [overrideReason, setOverrideReason] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      setData(await churchApi.getMemberEngagement(filter));
    } catch (e: any) {
      setMsg({ type: 'error', text: e?.friendlyMessage || 'Could not work out member engagement.' });
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filter]);

  const recalc = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await churchApi.recalculateEngagement();
      setMsg({ type: 'success', text: `Updated ${r?.updated || 0} member records.` });
      await load();
    } catch (e: any) {
      setMsg({ type: 'error', text: e?.friendlyMessage || 'Could not update member engagement.' });
    } finally {
      setBusy(false);
    }
  };

  const saveOverride = async () => {
    if (!override) return;
    setBusy(true);
    try {
      await churchApi.setMemberEngagement(override.id, overrideStatus, overrideReason, true);
      setOverride(null);
      setOverrideReason('');
      await load();
      setMsg({ type: 'success', text: 'Member updated.' });
    } catch (e: any) {
      setMsg({ type: 'error', text: e?.friendlyMessage || 'Could not update that member.' });
    } finally {
      setBusy(false);
    }
  };

  const summary = data?.summary || {};
  const rows: any[] = data?.data || [];
  const t = data?.thresholds || {};

  return (
    <Box>
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {['active', 'inactive', 'backslider', 'new'].map((k) => (
          <Grid size={{ xs: 6, md: 3 }} key={k}>
            <Card variant="outlined">
              <CardContent>
                <Typography variant="body2" color="text.secondary">{STATUS_META[k].label}</Typography>
                <Typography variant="h5" fontWeight={800}>{summary[k] ?? 0}</Typography>
                <Typography variant="caption" color="text.secondary">{STATUS_META[k].help}</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {msg && <Alert severity={msg.type} sx={{ mb: 2 }} onClose={() => setMsg(null)}>{msg.text}</Alert>}

      <Alert severity="info" sx={{ mb: 2 }}>
        A member counts as inactive after {t.inactiveAfterDays ?? 28} days without attending, and as a
        backslider after {t.backsliderAfterDays ?? 84} days. Active means at least
        {' '}{t.activeMinAttendances ?? 2} attendances in the last {t.windowDays ?? 56} days.
        You can adjust these in Settings, and you can always set a member manually.
      </Alert>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }} alignItems={{ sm: 'center' }}>
        <TextField
          select size="small" label="Show" value={filter}
          onChange={(e) => setFilter(e.target.value)} sx={{ minWidth: 200 }}
        >
          <MenuItem value="all">Everyone</MenuItem>
          {Object.keys(STATUS_META).map((k) => (
            <MenuItem key={k} value={k}>{STATUS_META[k].label}</MenuItem>
          ))}
        </TextField>
        <Box sx={{ flex: 1 }} />
        <Button variant="outlined" startIcon={<RefreshCw size={16} />} onClick={load} disabled={loading}>Refresh</Button>
        <Button variant="contained" startIcon={<UserCheck size={16} />} onClick={recalc} disabled={busy}>
          Save these labels to members
        </Button>
      </Stack>

      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              {['Member', 'Status', 'Last attended', 'Days absent', 'Recent attendance', 'Why', ''].map((h) => (
                <TableCell key={h} sx={{ fontWeight: 700 }}>{h}</TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} align="center" sx={{ py: 4 }}><CircularProgress size={28} /></TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={7} align="center" sx={{ py: 4, color: 'text.secondary' }}>No members to show.</TableCell></TableRow>
            ) : rows.map((r) => (
              <TableRow key={r.id} hover>
                <TableCell>{r.name || '\u2014'}</TableCell>
                <TableCell>
                  {statusChip(r.engagementStatus)}
                  {r.engagementLocked && <Chip size="small" label="set manually" sx={{ ml: 0.5 }} />}
                </TableCell>
                <TableCell>{r.lastAttendanceAt ? new Date(r.lastAttendanceAt).toLocaleDateString() : 'Never'}</TableCell>
                <TableCell>{r.daysSinceLastAttendance ?? '\u2014'}</TableCell>
                <TableCell>{r.attendancesInWindow ?? 0}</TableCell>
                <TableCell sx={{ color: 'text.secondary', fontSize: 13 }}>{r.reason || '\u2014'}</TableCell>
                <TableCell align="right">
                  <Button size="small" onClick={() => { setOverride(r); setOverrideStatus(r.engagementStatus || 'active'); setOverrideReason(''); }}>
                    Change
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={!!override} onClose={() => setOverride(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>Describe {override?.name}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField select fullWidth label="Status" value={overrideStatus} onChange={(e) => setOverrideStatus(e.target.value)}>
              {Object.keys(STATUS_META).map((k) => <MenuItem key={k} value={k}>{STATUS_META[k].label}</MenuItem>)}
            </TextField>
            <TextField
              fullWidth multiline minRows={2} label="Note (optional)"
              value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)}
              helperText="Setting a member manually keeps that label until you change it again."
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2.5 }}>
          <Button onClick={() => setOverride(null)}>Cancel</Button>
          <Button variant="contained" onClick={saveOverride} disabled={busy} sx={{ fontWeight: 700 }}>Save</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

const AbsenceFollowUpPanel: React.FC = () => {
  const [events, setEvents] = useState<any[]>([]);
  const [eventId, setEventId] = useState('');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      setData(await churchApi.getAbsenceSurveys());
    } catch (e: any) {
      setMsg({ type: 'error', text: e?.friendlyMessage || 'Could not load the follow-ups.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    churchApi.getEvents().then((rows: any[]) => setEvents(rows || [])).catch(() => setEvents([]));
  }, []);

  const send = async () => {
    const scope = eventId
      ? 'everyone who was not checked in at that service'
      : 'every member the system currently counts as inactive or a backslider';
    if (!window.confirm(`Send the absence questionnaire to ${scope}? Each person receives one SMS and one email.`)) return;
    setSending(true);
    setMsg(null);
    try {
      const r = await churchApi.sendAbsenceSurveys(eventId ? { eventId } : {});
      setMsg({
        type: 'success',
        text: r?.message || `Sent ${r?.sent || 0} questionnaire(s).${r?.skipped ? ` ${r.skipped} skipped (no phone or email, or sending failed).` : ''}`,
      });
      await load();
    } catch (e: any) {
      setMsg({ type: 'error', text: e?.friendlyMessage || e?.response?.data?.error || 'Could not send the questionnaires.' });
    } finally {
      setSending(false);
    }
  };

  const rows: any[] = data?.data || [];
  const summary = data?.summary || {};

  return (
    <Box>
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {[['Sent', summary.sent], ['Answered', summary.responded], ['Awaiting reply', summary.awaiting]].map(([label, value]) => (
          <Grid size={{ xs: 4 }} key={String(label)}>
            <Card variant="outlined"><CardContent>
              <Typography variant="body2" color="text.secondary">{label}</Typography>
              <Typography variant="h5" fontWeight={800}>{Number(value) || 0}</Typography>
            </CardContent></Card>
          </Grid>
        ))}
      </Grid>

      {msg && <Alert severity={msg.type} sx={{ mb: 2 }} onClose={() => setMsg(null)}>{msg.text}</Alert>}

      <Card variant="outlined" sx={{ mb: 3 }}>
        <CardContent>
          <Typography fontWeight={700} gutterBottom>Send the questionnaire</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Each absent member receives an SMS and an email with their own link asking why they were away.
            Their answer appears in the table below.
          </Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }}>
            <TextField
              select size="small" label="Who to ask" value={eventId}
              onChange={(e) => setEventId(e.target.value)} sx={{ minWidth: 320 }}
            >
              <MenuItem value="">Members who have stopped attending</MenuItem>
              {events.map((ev: any) => (
                <MenuItem key={ev.id} value={ev.id}>
                  Absentees from: {ev.title || ev.name}
                </MenuItem>
              ))}
            </TextField>
            <Button variant="contained" startIcon={<Send size={16} />} onClick={send} disabled={sending} sx={{ fontWeight: 700 }}>
              {sending ? 'Sending\u2026' : 'Send questionnaire'}
            </Button>
          </Stack>
        </CardContent>
      </Card>

      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              {['Member', 'Service', 'Sent', 'SMS', 'Email', 'Reason given', 'Wants a visit'].map((h) => (
                <TableCell key={h} sx={{ fontWeight: 700 }}>{h}</TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} align="center" sx={{ py: 4 }}><CircularProgress size={28} /></TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={7} align="center" sx={{ py: 4, color: 'text.secondary' }}>No questionnaires sent yet.</TableCell></TableRow>
            ) : rows.map((r) => (
              <TableRow key={r.id} hover>
                <TableCell>{r.memberName || '\u2014'}</TableCell>
                <TableCell>{r.eventName || 'General'}</TableCell>
                <TableCell>{r.sentAt ? new Date(r.sentAt).toLocaleDateString() : '\u2014'}</TableCell>
                <TableCell><Chip size="small" label={r.smsStatus || 'not sent'} color={r.smsStatus === 'sent' ? 'success' : 'default'} /></TableCell>
                <TableCell><Chip size="small" label={r.emailStatus || 'not sent'} color={r.emailStatus === 'sent' ? 'success' : 'default'} /></TableCell>
                <TableCell>
                  {r.status === 'responded'
                    ? <Box><Typography variant="body2" fontWeight={600}>{r.reasonCategory || 'Answered'}</Typography>
                        {r.reason && <Typography variant="caption" color="text.secondary">{r.reason}</Typography>}</Box>
                    : <Chip size="small" label="awaiting reply" />}
                </TableCell>
                <TableCell>{r.needsFollowUp === 'yes' ? <Chip size="small" color="warning" label="Yes" /> : '\u2014'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
};

export const MemberEngagementPage: React.FC = () => {
  const [tab, setTab] = useState(0);
  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <Typography variant="h4" fontWeight={800} sx={{ letterSpacing: '-0.5px' }}>Engagement & Follow-up</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        See who is active, inactive or backsliding based on attendance, and ask those who are away why.
      </Typography>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3 }}>
        <Tab label="Member engagement" sx={{ fontWeight: 600 }} />
        <Tab label="Absence follow-up" sx={{ fontWeight: 600 }} />
      </Tabs>
      {tab === 0 ? <EngagementPanel /> : <AbsenceFollowUpPanel />}
    </Box>
  );
};

export default MemberEngagementPage;
