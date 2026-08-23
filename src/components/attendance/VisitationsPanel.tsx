/**
 * The visitation log.
 *
 * Visits by the presiding elder and by ministers appear on every unit's
 * statistical return, and this is where they are recorded. It is kept as a
 * pastoral record rather than a tally deliberately: the church keeps the useful
 * part -- who was visited, when and why -- and the return counts it from here,
 * so nobody types a visit total onto a statistics sheet.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
  Grid,
  IconButton,
  InputAdornment,
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
import { Plus, Search, Trash2 } from 'lucide-react';
import churchApi from '../../services/churchApi';

type Visit = {
  id: string;
  visitDate: string;
  visitorRole: string;
  visitorName?: string | null;
  purpose?: string | null;
  notes?: string | null;
  unitName?: string | null;
  unitType?: string | null;
  memberName?: string | null;
};

/**
 * The first two roles are the ones the statistical return counts. The others are
 * offered because a church that can only log two kinds of visit will start
 * mislabelling the rest as one of them, which would quietly corrupt the figures.
 */
const ROLES = [
  { value: 'presiding_elder', label: 'Presiding elder', counted: true },
  { value: 'minister', label: 'Minister', counted: true },
  { value: 'pastor', label: 'Pastor', counted: false },
  { value: 'elder', label: 'Elder', counted: false },
  { value: 'other', label: 'Other', counted: false },
];

const roleLabel = (value: string) => ROLES.find((r) => r.value === value)?.label || value;

const iso = (d: Date) => d.toISOString().slice(0, 10);

const VisitationsPanel: React.FC = () => {
  const [visits, setVisits] = useState<Visit[]>([]);
  const [units, setUnits] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const emptyForm = useMemo(
    () => ({
      visitDate: iso(new Date()),
      visitorRole: 'presiding_elder',
      visitorName: '',
      unitKey: '',
      memberId: '',
      purpose: '',
      notes: '',
    }),
    [],
  );
  const [form, setForm] = useState<any>(emptyForm);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // A generous window, so the log is a log rather than a snapshot of the
      // last few weeks.
      const from = new Date();
      from.setFullYear(from.getFullYear() - 2);
      const rows = await churchApi.getVisits({
        from: iso(from),
        to: iso(new Date()),
        visitorRole: roleFilter || undefined,
        q: query || undefined,
      });
      setVisits(rows || []);
      setError('');
    } catch (e: any) {
      setError(e?.friendlyMessage || 'Could not load the visitation log.');
    } finally {
      setLoading(false);
    }
  }, [query, roleFilter]);

  useEffect(() => {
    const t = setTimeout(load, query ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, query]);

  useEffect(() => {
    churchApi.getUnits().then(setUnits).catch(() => setUnits([]));
    churchApi.getMembers().then((rows: any[]) => setMembers(rows || [])).catch(() => setMembers([]));
  }, []);

  const submit = async () => {
    setSaving(true);
    setError('');
    try {
      const [unitType, unitId] = form.unitKey ? String(form.unitKey).split(':') : [null, null];
      await churchApi.logVisit({
        visitDate: form.visitDate,
        visitorRole: form.visitorRole,
        visitorName: form.visitorName || undefined,
        unitType: unitType || undefined,
        unitId: unitId || undefined,
        memberId: form.memberId || undefined,
        purpose: form.purpose || undefined,
        notes: form.notes || undefined,
      });
      setNotice('The visit was added to the log.');
      setOpen(false);
      setForm(emptyForm);
      load();
    } catch (e: any) {
      setError(e?.friendlyMessage || 'Could not log this visit.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await churchApi.deleteVisit(id);
      setVisits((prev) => prev.filter((v) => v.id !== id));
      setNotice('The visit was removed from the log.');
    } catch (e: any) {
      setError(e?.friendlyMessage || 'Could not remove this visit.');
    }
  };

  return (
    <Box>
      {error && (
        <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}
      {notice && (
        <Alert severity="success" sx={{ mb: 2, borderRadius: 2 }} onClose={() => setNotice('')}>
          {notice}
        </Alert>
      )}

      <Paper sx={{ p: 2, mb: 2, borderRadius: 3, border: '1px solid', borderColor: 'divider' }}>
        <Grid container spacing={2} alignItems="center">
          <Grid size={{ xs: 12, md: 5 }}>
            <TextField
              fullWidth
              size="small"
              placeholder="Search by visitor, member, unit or purpose"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Search size={16} />
                  </InputAdornment>
                ),
              }}
            />
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField
              select
              fullWidth
              size="small"
              label="Visited by"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
            >
              <MenuItem value="">Everyone</MenuItem>
              {ROLES.map((r) => (
                <MenuItem key={r.value} value={r.value}>
                  {r.label}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, md: 3 }}>
            <Button
              fullWidth
              variant="contained"
              startIcon={<Plus size={16} />}
              onClick={() => setOpen(true)}
              sx={{ fontWeight: 700 }}
            >
              Log a visit
            </Button>
          </Grid>
        </Grid>
      </Paper>

      <Paper sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider' }}>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>Date</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Visited by</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Who or what was visited</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Purpose</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>
                  &nbsp;
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                    <CircularProgress size={24} />
                  </TableCell>
                </TableRow>
              )}

              {!loading && visits.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                    <Typography variant="body2" color="text.secondary">
                      No visits logged yet. Visits recorded here are counted onto the statistical
                      returns of the ministries, departments and groups they concern.
                    </Typography>
                  </TableCell>
                </TableRow>
              )}

              {visits.map((v) => (
                <TableRow key={v.id} hover>
                  <TableCell>{new Date(v.visitDate).toLocaleDateString()}</TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={0.75} alignItems="center">
                      <Chip size="small" label={roleLabel(v.visitorRole)} variant="outlined" />
                      {v.visitorName && <Typography variant="body2">{v.visitorName}</Typography>}
                    </Stack>
                  </TableCell>
                  <TableCell>
                    {[v.unitName, v.memberName].filter(Boolean).join(' — ') || '—'}
                  </TableCell>
                  <TableCell>{v.purpose || '—'}</TableCell>
                  <TableCell align="right">
                    <Tooltip title="Remove this visit">
                      <IconButton size="small" onClick={() => remove(v.id)}>
                        <Trash2 size={15} />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>Log a visit</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                type="date"
                label="Date of visit"
                InputLabelProps={{ shrink: true }}
                value={form.visitDate}
                onChange={(e) => setForm({ ...form, visitDate: e.target.value })}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                select
                fullWidth
                label="Visited by"
                value={form.visitorRole}
                onChange={(e) => setForm({ ...form, visitorRole: e.target.value })}
                helperText="Presiding elder and minister visits appear on the statistical returns."
              >
                {ROLES.map((r) => (
                  <MenuItem key={r.value} value={r.value}>
                    {r.label}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField
                fullWidth
                label="Name of the visitor"
                value={form.visitorName}
                onChange={(e) => setForm({ ...form, visitorName: e.target.value })}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                select
                fullWidth
                label="Ministry, department or group"
                value={form.unitKey}
                onChange={(e) => setForm({ ...form, unitKey: e.target.value })}
              >
                <MenuItem value="">None</MenuItem>
                {units.map((u: any) => (
                  <MenuItem key={`${u.unitType}:${u.id}`} value={`${u.unitType}:${u.id}`}>
                    {u.name}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                select
                fullWidth
                label="Member visited"
                value={form.memberId}
                onChange={(e) => setForm({ ...form, memberId: e.target.value })}
                helperText="A visit to a member counts for the units they belong to."
              >
                <MenuItem value="">None</MenuItem>
                {members.map((m: any) => (
                  <MenuItem key={m.id} value={m.id}>
                    {`${m.firstName || ''} ${m.lastName || ''}`.trim() || m.membershipId}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField
                fullWidth
                label="Purpose"
                value={form.purpose}
                onChange={(e) => setForm({ ...form, purpose: e.target.value })}
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField
                fullWidth
                multiline
                minRows={2}
                label="Notes"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ p: 2.5 }}>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={submit}
            disabled={saving || (!form.unitKey && !form.memberId)}
            sx={{ fontWeight: 700 }}
          >
            Log visit
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default VisitationsPanel;
