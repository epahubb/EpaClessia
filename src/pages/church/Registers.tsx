import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Grid,
  IconButton,
  InputAdornment,
  Link,
  MenuItem,
  Paper,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Tooltip,
  Typography,
  Autocomplete,
} from '@mui/material';
import {
  Search,
  Plus,
  Trash2,
  BookOpen,
  Database,
  Info,
  AlertTriangle,
} from 'lucide-react';
import { churchApi } from '../../services/churchApi';

/**
 * The church registers.
 *
 * One page for the books a church actually keeps: the new converts class, the
 * two baptisms, transfers in and out, marriages and deaths. Before this, those
 * facts could only be reached one member at a time through the member record,
 * which is the wrong shape for a secretary sitting down after a baptismal
 * service with twenty names to enter.
 *
 * Nothing here is a separate tally. An entry writes the same member columns and
 * dated history rows the statistical return counts from, so the register and
 * the return are two views of one fact and cannot drift apart. Each register
 * says plainly what an entry will write and which figures it moves.
 */

type RegisterField = {
  name: string;
  label: string;
  type: 'member' | 'date' | 'text' | 'textarea' | 'select';
  required?: boolean;
  allowFuture?: boolean;
  options?: Array<{ value: string; label: string }>;
  helperText?: string;
};

type RegisterDef = {
  key: string;
  label: string;
  plural: string;
  description: string;
  primaryDateField: string;
  writes: string[];
  countsAs: string[];
  changesStanding?: boolean;
  fields: RegisterField[];
};

type Entry = {
  id: string;
  memberId: string | null;
  memberName: string;
  date: string | null;
  detail: string;
  particulars: Array<{ label: string; value: string }>;
  origin: string;
  notes?: string | null;
};

type MemberOption = { id: string; label: string };

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Defaults to the year so far, which is the period a register is usually read for. */
function defaultRange() {
  const now = new Date();
  return { from: iso(new Date(now.getFullYear(), 0, 1)), to: iso(now) };
}

const ISO_LIKE = /^\d{4}-\d{2}-\d{2}T/;

function shortDate(value?: string | null): string {
  if (!value) return '—';
  const when = new Date(value);
  if (Number.isNaN(when.getTime())) return value;
  return when.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** Particulars arrive as text; dates among them are printed as dates. */
function pretty(value: string): string {
  return ISO_LIKE.test(value) ? shortDate(value) : value;
}

export function RegistersPage() {
  const [defs, setDefs] = useState<RegisterDef[]>([]);
  const [active, setActive] = useState(0);
  const [range, setRange] = useState(defaultRange);
  const [query, setQuery] = useState('');
  const [entries, setEntries] = useState<Entry[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [formErrors, setFormErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [pendingWithdrawal, setPendingWithdrawal] = useState<Entry | null>(null);

  const current = defs[active];

  // The catalogue and the member list are loaded once. The registers describe
  // their own boxes, so a register gained on the server appears here without a
  // second copy of its fields living in this file.
  useEffect(() => {
    (async () => {
      try {
        const [cat, people] = await Promise.all([
          churchApi.getRegisters(),
          churchApi.getMembers(),
        ]);
        setDefs(Array.isArray(cat) ? cat : []);
        setMembers(
          (Array.isArray(people) ? people : []).map((m: any) => ({
            id: m.id,
            label: [m.firstName, m.lastName].filter(Boolean).join(' ') ||
              m.name ||
              m.membershipId ||
              m.id,
          })),
        );
      } catch (e: any) {
        setError(e?.friendlyMessage || 'Failed to load the registers.');
      }
    })();
  }, []);

  const load = useCallback(async () => {
    if (!current) return;
    setLoading(true);
    setError('');
    try {
      const [res, summary] = await Promise.all([
        churchApi.getRegisterEntries(current.key, {
          from: range.from,
          to: range.to,
          q: query,
        }),
        churchApi.getRegisterSummary({ from: range.from, to: range.to }),
      ]);
      setEntries(res?.data || []);
      setCounts(summary || {});
    } catch (e: any) {
      setError(e?.friendlyMessage || 'Failed to load this register.');
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [current, range.from, range.to, query]);

  // Debounced so typing in the search box does not fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(load, query ? 350 : 0);
    return () => clearTimeout(timer);
  }, [load, query]);

  const openForm = () => {
    const blank: Record<string, string> = {};
    for (const field of current?.fields || []) {
      // The register's own date defaults to today, which is what it usually is.
      blank[field.name] =
        field.type === 'date' && field.name === current?.primaryDateField ? iso(new Date()) : '';
    }
    setForm(blank);
    setFormErrors([]);
    setFormOpen(true);
  };

  const setValue = (name: string, value: string) =>
    setForm((prev) => ({ ...prev, [name]: value }));

  const submit = async () => {
    if (!current) return;
    setSaving(true);
    setFormErrors([]);
    try {
      const res = await churchApi.fileRegisterEntry(current.key, form);
      setFormOpen(false);
      setNotice(res?.message || 'The entry was filed.');
      await load();
    } catch (e: any) {
      const payload = e?.response?.data;
      setFormErrors(
        payload?.errors?.length
          ? payload.errors
          : [payload?.error || e?.friendlyMessage || 'Failed to file this entry.'],
      );
    } finally {
      setSaving(false);
    }
  };

  const withdraw = async () => {
    if (!current || !pendingWithdrawal) return;
    try {
      const res = await churchApi.withdrawRegisterEntry(current.key, pendingWithdrawal.id);
      setNotice(res?.message || 'The entry was withdrawn.');
      setPendingWithdrawal(null);
      await load();
    } catch (e: any) {
      setError(e?.friendlyMessage || 'Failed to withdraw this entry.');
      setPendingWithdrawal(null);
    }
  };

  const requiredMissing = useMemo(() => {
    if (!current) return true;
    return current.fields.some((f) => f.required && !String(form[f.name] || '').trim());
  }, [current, form]);

  const memberValue = (name: string) =>
    members.find((m) => m.id === form[name]) || null;

  return (
    <Box sx={{ p: 3 }}>
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 0.5 }}>
        <BookOpen size={22} />
        <Typography variant="h5" fontWeight={700}>
          Registers
        </Typography>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
        The books of the church, in one place. An entry filed here is written onto the
        member's own record, so every figure on the statistical return moves with it. Nothing
        on this page is a second copy of a figure kept by hand.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}
      {notice && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setNotice('')}>
          {notice}
        </Alert>
      )}

      {/* How many entries each book holds in the chosen period. */}
      <Grid container spacing={1.5} sx={{ mb: 2.5 }}>
        {defs.map((def, index) => (
          <Grid key={def.key} size={{ xs: 6, sm: 4, md: 12 / 7 }}>
            <Card
              variant={index === active ? 'elevation' : 'outlined'}
              onClick={() => setActive(index)}
              sx={{
                cursor: 'pointer',
                borderColor: index === active ? 'primary.main' : undefined,
                borderWidth: index === active ? 2 : 1,
                borderStyle: 'solid',
                height: '100%',
              }}
            >
              <CardContent sx={{ py: 1.5, px: 1.75 }}>
                <Typography variant="h6" fontWeight={700} lineHeight={1.2}>
                  {counts[def.key] ?? 0}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {def.plural}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Paper variant="outlined">
        <Tabs
          value={active}
          onChange={(_e, v) => setActive(v)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{ borderBottom: 1, borderColor: 'divider' }}
        >
          {defs.map((def) => (
            <Tab key={def.key} label={def.plural} />
          ))}
        </Tabs>

        {current && (
          <Box sx={{ p: 2.5 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {current.description}
            </Typography>

            {/* What filing an entry actually changes, said before it is filed. */}
            <Alert severity="info" icon={<Info size={18} />} sx={{ mb: 2.5 }}>
              <Typography variant="subtitle2" fontWeight={700}>
                What an entry in this register writes
              </Typography>
              <Box component="ul" sx={{ pl: 2.5, mb: current.countsAs.length ? 1 : 0, mt: 0.5 }}>
                {current.writes.map((line) => (
                  <li key={line}>
                    <Typography variant="body2">{line}</Typography>
                  </li>
                ))}
              </Box>
              {current.countsAs.length > 0 && (
                <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap alignItems="center">
                  <Typography variant="body2">Counted on the return as</Typography>
                  {current.countsAs.map((figure) => (
                    <Chip
                      key={figure}
                      size="small"
                      label={figure}
                      component={Link as any}
                      href="/church/statistics"
                      clickable
                    />
                  ))}
                </Stack>
              )}
            </Alert>

            <Stack
              direction={{ xs: 'column', md: 'row' }}
              spacing={1.5}
              alignItems={{ md: 'center' }}
              sx={{ mb: 2 }}
            >
              <TextField
                label="From"
                type="date"
                size="small"
                value={range.from}
                onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
                InputLabelProps={{ shrink: true }}
              />
              <TextField
                label="To"
                type="date"
                size="small"
                value={range.to}
                onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
                InputLabelProps={{ shrink: true }}
              />
              <TextField
                size="small"
                placeholder="Search this register"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                sx={{ flex: 1, minWidth: 220 }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <Search size={16} />
                    </InputAdornment>
                  ),
                }}
              />
              <Button variant="contained" startIcon={<Plus size={16} />} onClick={openForm}>
                Record {current.label}
              </Button>
            </Stack>

            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Date</TableCell>
                    <TableCell>Name</TableCell>
                    <TableCell>Particulars</TableCell>
                    <TableCell>Kept in</TableCell>
                    <TableCell align="right">Withdraw</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {loading && (
                    <TableRow>
                      <TableCell colSpan={5} align="center" sx={{ py: 5 }}>
                        <CircularProgress size={22} />
                      </TableCell>
                    </TableRow>
                  )}

                  {!loading && entries.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} sx={{ py: 5 }} align="center">
                        <Typography variant="body2" color="text.secondary">
                          Nothing has been entered in this register for the chosen dates.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )}

                  {!loading &&
                    entries.map((entry) => (
                      <TableRow key={entry.id} hover>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>{shortDate(entry.date)}</TableCell>
                        <TableCell>
                          {entry.memberId ? (
                            <Link href={`/church/members?member=${entry.memberId}`} underline="hover">
                              {entry.memberName}
                            </Link>
                          ) : (
                            entry.memberName
                          )}
                          <Typography variant="caption" color="text.secondary" display="block">
                            {entry.detail}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                            {entry.particulars.length === 0 && (
                              <Typography variant="caption" color="text.secondary">
                                —
                              </Typography>
                            )}
                            {entry.particulars.map((p) => (
                              <Chip
                                key={p.label}
                                size="small"
                                variant="outlined"
                                label={`${p.label}: ${pretty(p.value)}`}
                              />
                            ))}
                          </Stack>
                          {entry.notes && (
                            <Typography variant="caption" color="text.secondary" display="block">
                              {entry.notes}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell>
                          <Tooltip title="The entry is read from here, not stored twice">
                            <Chip
                              size="small"
                              icon={<Database size={13} />}
                              label={entry.origin}
                              variant="outlined"
                            />
                          </Tooltip>
                        </TableCell>
                        <TableCell align="right">
                          <Tooltip title="Withdraw this entry">
                            <IconButton size="small" onClick={() => setPendingWithdrawal(entry)}>
                              <Trash2 size={15} />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        )}
      </Paper>

      {/* Filing dialog, built from the register's own fields. */}
      <Dialog open={formOpen} onClose={() => setFormOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Record {current?.label}</DialogTitle>
        <DialogContent dividers>
          {formErrors.length > 0 && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {formErrors.map((message) => (
                <div key={message}>{message}</div>
              ))}
            </Alert>
          )}
          <Grid container spacing={2}>
            {(current?.fields || []).map((field) => (
              <Grid key={field.name} size={{ xs: 12, sm: field.type === 'textarea' ? 12 : 6 }}>
                {field.type === 'member' ? (
                  <Autocomplete
                    options={members}
                    value={memberValue(field.name)}
                    onChange={(_e, value) => setValue(field.name, value?.id || '')}
                    isOptionEqualToValue={(a, b) => a.id === b.id}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label={field.label}
                        required={field.required}
                        helperText={field.helperText}
                      />
                    )}
                  />
                ) : field.type === 'select' ? (
                  <TextField
                    select
                    fullWidth
                    label={field.label}
                    required={field.required}
                    helperText={field.helperText}
                    value={form[field.name] || ''}
                    onChange={(e) => setValue(field.name, e.target.value)}
                  >
                    {(field.options || []).map((opt) => (
                      <MenuItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </MenuItem>
                    ))}
                  </TextField>
                ) : (
                  <TextField
                    fullWidth
                    label={field.label}
                    required={field.required}
                    helperText={field.helperText}
                    type={field.type === 'date' ? 'date' : 'text'}
                    multiline={field.type === 'textarea'}
                    minRows={field.type === 'textarea' ? 2 : undefined}
                    InputLabelProps={field.type === 'date' ? { shrink: true } : undefined}
                    value={form[field.name] || ''}
                    onChange={(e) => setValue(field.name, e.target.value)}
                  />
                )}
              </Grid>
            ))}
          </Grid>

          {current?.changesStanding && (
            <>
              <Divider sx={{ my: 2 }} />
              <Stack direction="row" spacing={1} alignItems="flex-start">
                <AlertTriangle size={16} />
                <Typography variant="caption" color="text.secondary">
                  This entry changes the member's standing from the date given, so the membership
                  figure for that period moves with it. A return already filed for an earlier
                  period keeps the membership it had at the time.
                </Typography>
              </Stack>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setFormOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={submit} disabled={saving || requiredMissing}>
            {saving ? 'Filing…' : 'File entry'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Withdrawal asks first, because an entry withdrawn clears the fact from
          the member's record rather than only hiding a row here. */}
      <Dialog open={!!pendingWithdrawal} onClose={() => setPendingWithdrawal(null)}>
        <DialogTitle>Withdraw this entry?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            This clears {pendingWithdrawal?.memberName}'s entry of {shortDate(pendingWithdrawal?.date)}{' '}
            from the member's record, and the figures it feeds fall back accordingly.
            {current?.changesStanding
              ? " The member's standing is returned to active."
              : ''}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPendingWithdrawal(null)}>Keep it</Button>
          <Button color="error" variant="contained" onClick={withdraw}>
            Withdraw
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default RegistersPage;
