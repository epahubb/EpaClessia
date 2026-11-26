import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Grid,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { BookOpen, Pencil, Plus, Printer, Search, Trash2 } from 'lucide-react';
import churchApi from '../../services/churchApi';
import api from '../../services/api';
import PrintDocument from '../../components/common/PrintDocument';

type Scope = { scopeType: string; scopeId: string | null; label: string };

type Minute = {
  id: string;
  title: string;
  scopeType: string;
  scopeId: string | null;
  scopeName: string;
  meetingType?: string | null;
  meetingDate: string;
  venue?: string | null;
  chairperson?: string | null;
  secretary?: string | null;
  attendees?: string | null;
  absentees?: string | null;
  agenda?: string | null;
  content?: string | null;
  resolutions?: string | null;
  status?: string;
  createdBy?: string | null;
  createdByName?: string | null;
  canEdit?: boolean;
  canDelete?: boolean;
};

const isoDate = (value?: string | null) => (value ? new Date(value).toISOString().slice(0, 10) : '');
const longDate = (value?: string | null) =>
  value
    ? new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })
    : '—';

const scopeLabel = (type: string) =>
  type === 'church' ? 'Church-wide' : type === 'department' ? 'Department' : type === 'group' ? 'Group' : 'Ministry';

const emptyForm = {
  title: '',
  scopeType: 'church',
  scopeId: '',
  meetingType: 'Leaders meeting',
  meetingDate: isoDate(new Date().toISOString()),
  venue: '',
  chairperson: '',
  secretary: '',
  attendees: '',
  absentees: '',
  agenda: '',
  content: '',
  resolutions: '',
  status: 'draft',
};

const MEETING_TYPES = [
  'Church service',
  'Leaders meeting',
  'Board meeting',
  'Ministry meeting',
  'Department meeting',
  'Group / cell meeting',
  'Committee meeting',
  'Other',
];

/** The printable minute, complete with the church letterhead. */
function MinutePrint({ minute, onClose }: { minute: Minute; onClose: () => void }) {
  const [church, setChurch] = useState<{ name?: string; logo?: string | null }>({});
  useEffect(() => {
    api.get('/workspace/identity').then(r => setChurch(r.data || {})).catch(() => undefined);
  }, []);

  const block = (label: string, value?: string | null) =>
    value && value.trim() ? (
      <Box sx={{ mb: 2 }}>
        <Typography variant="subtitle2" fontWeight={800} sx={{ mb: 0.5 }}>{label}</Typography>
        <Typography sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{value}</Typography>
      </Box>
    ) : null;

  return (
    <PrintDocument title="Meeting minutes" onClose={onClose}>
      <Box sx={{ maxWidth: 780, mx: 'auto' }}>
        <Stack direction="row" spacing={2} alignItems="center" sx={{ pb: 2, borderBottom: '2px solid #1b4332' }}>
          {church.logo ? (
            <Box component="img" src={church.logo} alt="Church logo" sx={{ width: 72, height: 72, objectFit: 'contain' }} />
          ) : (
            <Box sx={{ width: 72, height: 72, borderRadius: 2, bgcolor: '#1b4332', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, fontWeight: 800 }}>
              {(church.name || 'C')[0]}
            </Box>
          )}
          <Box>
            <Typography variant="h5" fontWeight={800} sx={{ color: '#1b4332' }}>{church.name || 'Church'}</Typography>
            <Typography variant="body2">Minutes of meeting</Typography>
          </Box>
        </Stack>

        <Typography variant="h6" align="center" fontWeight={800} sx={{ my: 2.5 }}>{minute.title}</Typography>

        <Grid container spacing={1} sx={{ mb: 2 }}>
          {[
            ['Date', longDate(minute.meetingDate)],
            ['Meeting', minute.meetingType || '—'],
            ['Unit', minute.scopeName || scopeLabel(minute.scopeType)],
            ['Venue', minute.venue || '—'],
            ['Chairperson', minute.chairperson || '—'],
            ['Secretary', minute.secretary || '—'],
          ].map(([label, value]) => (
            <Grid key={label} size={{ xs: 12, sm: 6 }}>
              <Typography variant="body2"><strong>{label}:</strong> {value}</Typography>
            </Grid>
          ))}
        </Grid>

        <Divider sx={{ my: 2 }} />
        {block('Members present', minute.attendees)}
        {block('Members absent / apologies', minute.absentees)}
        {block('Agenda', minute.agenda)}
        {block('Minutes', minute.content)}
        {block('Resolutions / decisions', minute.resolutions)}

        <Divider sx={{ my: 3 }} />
        <Stack direction="row" justifyContent="space-between" sx={{ mt: 4 }}>
          <Box sx={{ borderTop: '1px solid #777', width: 240, pt: 0.5 }}>
            <Typography variant="caption">Secretary's signature</Typography>
          </Box>
          <Box sx={{ borderTop: '1px solid #777', width: 240, pt: 0.5 }}>
            <Typography variant="caption">Chairperson's signature</Typography>
          </Box>
        </Stack>
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 3, textAlign: 'center' }}>
          Recorded by {minute.createdByName || 'the church office'} · {minute.status === 'final' ? 'Approved minute' : 'Draft minute'}
        </Typography>
      </Box>
    </PrintDocument>
  );
}

export default function MinutesPage() {
  const [context, setContext] = useState<{ manager: boolean; scopes: Scope[] }>({ manager: false, scopes: [] });
  const [rows, setRows] = useState<Minute[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [scopeType, setScopeType] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [query, setQuery] = useState('');

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Minute | null>(null);
  const [form, setForm] = useState<any>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const [printing, setPrinting] = useState<Minute | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await churchApi.getMinutes({
        scopeType: scopeType === 'all' ? undefined : scopeType,
        from: from || undefined,
        to: to || undefined,
        q: query || undefined,
      });
      setRows(Array.isArray(res?.data) ? res.data : []);
      setError('');
    } catch (e: any) {
      setError(e?.friendlyMessage || 'Meeting minutes could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [scopeType, from, to, query]);

  useEffect(() => {
    churchApi.getMinuteContext().then((ctx) => {
      setContext(ctx);
      const first = ctx?.scopes?.[0];
      if (first) setForm((f: any) => ({ ...f, scopeType: first.scopeType, scopeId: first.scopeId || '' }));
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    const timer = setTimeout(load, query ? 300 : 0);
    return () => clearTimeout(timer);
  }, [load, query]);

  const scopesForType = useMemo(
    () => context.scopes.filter(s => s.scopeType === (form.scopeType || 'church')),
    [context.scopes, form.scopeType],
  );

  const openNew = () => {
    const first = context.scopes[0];
    setEditing(null);
    setForm({ ...emptyForm, ...(first ? { scopeType: first.scopeType, scopeId: first.scopeId || '' } : {}) });
    setFormError('');
    setOpen(true);
  };

  const openEdit = (row: Minute) => {
    setEditing(row);
    setForm({
      ...emptyForm,
      ...row,
      meetingDate: isoDate(row.meetingDate),
      scopeId: row.scopeId || '',
      status: row.status || 'draft',
    });
    setFormError('');
    setOpen(true);
  };

  const save = async () => {
    setFormError('');
    if (!String(form.title || '').trim()) { setFormError('Give the minute a title.'); return; }
    if (!form.meetingDate) { setFormError('Enter the date of the meeting.'); return; }
    if (form.scopeType !== 'church' && !form.scopeId) { setFormError('Choose the unit this meeting belongs to.'); return; }
    setSaving(true);
    try {
      const payload = { ...form, scopeId: form.scopeType === 'church' ? null : form.scopeId };
      if (editing) {
        await churchApi.updateMinute(editing.id, payload);
        setNotice('The minute was updated.');
      } else {
        await churchApi.createMinute(payload);
        setNotice('The minute was saved.');
      }
      setOpen(false);
      await load();
    } catch (e: any) {
      setFormError(e?.friendlyMessage || 'This minute could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row: Minute) => {
    if (!window.confirm(`Delete "${row.title}"? This cannot be undone.`)) return;
    try {
      const res = await churchApi.deleteMinute(row.id);
      setNotice(res?.message || 'The minute was deleted.');
      await load();
    } catch (e: any) {
      setError(e?.friendlyMessage || 'This minute could not be deleted.');
    }
  };

  const set = (key: string, value: any) => setForm((f: any) => ({ ...f, [key]: value }));

  return (
    <Box>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={2} sx={{ mb: 2 }}>
        <Box>
          <Typography variant="h4" fontWeight={800}>Meeting minutes</Typography>
          <Typography color="text.secondary" sx={{ mt: 0.5 }}>
            Write, keep and print the minutes of church, ministry, department and group meetings.
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<Plus size={16} />} onClick={openNew} disabled={!context.scopes.length}>
          Write a minute
        </Button>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
      {notice && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setNotice('')}>{notice}</Alert>}
      {!context.scopes.length && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Your account is not yet linked to a ministry or group. Ask a church administrator to assign you as its
          leader; until then you can read existing minutes but cannot write a new one.
        </Alert>
      )}

      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid size={{ xs: 12, sm: 3 }}>
            <TextField select fullWidth size="small" label="Type" value={scopeType} onChange={e => setScopeType(e.target.value)}>
              <MenuItem value="all">All types</MenuItem>
              <MenuItem value="church">Church-wide</MenuItem>
              <MenuItem value="ministry">Ministry</MenuItem>
              <MenuItem value="department">Department</MenuItem>
              <MenuItem value="group">Group</MenuItem>
            </TextField>
          </Grid>
          <Grid size={{ xs: 6, sm: 2 }}>
            <TextField fullWidth size="small" type="date" label="From" value={from} onChange={e => setFrom(e.target.value)} InputLabelProps={{ shrink: true }} />
          </Grid>
          <Grid size={{ xs: 6, sm: 2 }}>
            <TextField fullWidth size="small" type="date" label="To" value={to} onChange={e => setTo(e.target.value)} InputLabelProps={{ shrink: true }} />
          </Grid>
          <Grid size={{ xs: 12, sm: 5 }}>
            <TextField
              fullWidth
              size="small"
              label="Search minutes"
              value={query}
              onChange={e => setQuery(e.target.value)}
              InputProps={{ startAdornment: <Search size={16} style={{ marginRight: 8 }} /> }}
            />
          </Grid>
        </Grid>
      </Paper>

      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              {['Date', 'Title', 'Unit', 'Meeting', 'Recorded by', 'Status', 'Actions'].map(h => (
                <TableCell key={h} sx={{ fontWeight: 700 }}>{h}</TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} align="center" sx={{ py: 5 }}><CircularProgress size={24} /></TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ py: 5 }}>
                  <BookOpen size={22} />
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                    No minutes have been recorded for this period.
                  </Typography>
                </TableCell>
              </TableRow>
            ) : rows.map((row) => (
              <TableRow key={row.id} hover>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>{longDate(row.meetingDate)}</TableCell>
                <TableCell>
                  <Typography variant="body2" fontWeight={600}>{row.title}</Typography>
                </TableCell>
                <TableCell>
                  <Chip size="small" variant="outlined" label={row.scopeName || scopeLabel(row.scopeType)} />
                </TableCell>
                <TableCell>{row.meetingType || '—'}</TableCell>
                <TableCell>{row.createdByName || '—'}</TableCell>
                <TableCell>
                  <Chip size="small" label={row.status === 'final' ? 'Approved' : 'Draft'} color={row.status === 'final' ? 'success' : 'default'} />
                </TableCell>
                <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                  <Tooltip title="Print with church logo"><IconButton size="small" onClick={() => setPrinting(row)}><Printer size={16} /></IconButton></Tooltip>
                  {row.canEdit && <Tooltip title="Edit"><IconButton size="small" onClick={() => openEdit(row)}><Pencil size={16} /></IconButton></Tooltip>}
                  {row.canDelete && <Tooltip title="Delete"><IconButton size="small" color="error" onClick={() => remove(row)}><Trash2 size={16} /></IconButton></Tooltip>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={open} onClose={() => { if (!saving) setOpen(false); }} fullWidth maxWidth="md">
        <DialogTitle>{editing ? 'Edit minute' : 'Write a minute'}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            {formError && <Alert severity="error" onClose={() => setFormError('')}>{formError}</Alert>}
            <TextField label="Title" required fullWidth value={form.title} onChange={e => set('title', e.target.value)} placeholder="Board meeting — March 2026" />
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField select fullWidth label="Unit" value={form.scopeType} onChange={e => {
                  set('scopeType', e.target.value);
                  const first = context.scopes.find(s => s.scopeType === e.target.value);
                  set('scopeId', first?.scopeId || '');
                }}>
                  {[...new Set(context.scopes.map(s => s.scopeType))].map(t => (
                    <MenuItem key={t} value={t}>{scopeLabel(t)}</MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField select fullWidth label="Which unit" value={form.scopeId || ''} onChange={e => set('scopeId', e.target.value)} disabled={form.scopeType === 'church'}>
                  <MenuItem value="">{form.scopeType === 'church' ? 'The whole church' : 'Choose…'}</MenuItem>
                  {scopesForType.filter(s => s.scopeId).map(s => (
                    <MenuItem key={s.scopeId!} value={s.scopeId!}>{s.label}</MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField select fullWidth label="Type of meeting" value={form.meetingType} onChange={e => set('meetingType', e.target.value)}>
                  {MEETING_TYPES.map(t => <MenuItem key={t} value={t}>{t}</MenuItem>)}
                </TextField>
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField fullWidth type="date" label="Date of meeting" required value={form.meetingDate} onChange={e => set('meetingDate', e.target.value)} InputLabelProps={{ shrink: true }} />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField fullWidth label="Venue" value={form.venue} onChange={e => set('venue', e.target.value)} />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField fullWidth label="Chairperson" value={form.chairperson} onChange={e => set('chairperson', e.target.value)} />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField fullWidth label="Secretary" value={form.secretary} onChange={e => set('secretary', e.target.value)} />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField select fullWidth label="Status" value={form.status} onChange={e => set('status', e.target.value)}>
                  <MenuItem value="draft">Draft</MenuItem>
                  <MenuItem value="final">Approved / final</MenuItem>
                </TextField>
              </Grid>
            </Grid>
            <TextField label="Members present" fullWidth multiline minRows={2} value={form.attendees} onChange={e => set('attendees', e.target.value)} />
            <TextField label="Members absent / apologies" fullWidth multiline minRows={2} value={form.absentees} onChange={e => set('absentees', e.target.value)} />
            <TextField label="Agenda" fullWidth multiline minRows={3} value={form.agenda} onChange={e => set('agenda', e.target.value)} />
            <TextField label="Minutes / proceedings" fullWidth multiline minRows={6} value={form.content} onChange={e => set('content', e.target.value)} helperText="Write what was discussed and agreed. The text is printed exactly as entered." />
            <TextField label="Resolutions / decisions" fullWidth multiline minRows={3} value={form.resolutions} onChange={e => set('resolutions', e.target.value)} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
          <Button variant="contained" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save minute'}</Button>
        </DialogActions>
      </Dialog>

      {printing && <MinutePrint minute={printing} onClose={() => setPrinting(null)} />}
    </Box>
  );
}
