/**
 * The church registers.
 *
 * One page, one tab per register: the new converts class, the two baptisms,
 * transfers in and out, marriages, births, children's dedications, deaths, and
 * changes of office.
 *
 * Two ideas hold the page together. First, a register is a door onto facts that
 * already have a home, so every tab says plainly what filing an entry will write
 * to a member's record and which figures on the statistical return it moves --
 * nothing is changed invisibly. Second, the paperwork follows the fact rather
 * than gating it: a transfer or a death is filed the day it happens, and the
 * letter or certificate is attached whenever it arrives.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  DialogContentText,
  DialogTitle,
  Divider,
  Grid,
  IconButton,
  InputAdornment,
  Link,
  List,
  ListItem,
  ListItemText,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tab,
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
  Paperclip,
  Upload,
  Download,
  X,
  GraduationCap,
  Award,
} from 'lucide-react';
import { Link as RouterLink } from 'react-router-dom';
import churchApi from '../../services/churchApi';

type RegisterField = {
  name: string;
  label: string;
  type: 'member' | 'date' | 'text' | 'textarea' | 'select';
  required?: boolean;
  allowFuture?: boolean;
  options?: Array<{ value: string; label: string }>;
  optionSource?: 'convert_classes' | 'offices';
  helperText?: string;
};

type RegisterDef = {
  key: string;
  label: string;
  plural: string;
  description: string;
  primaryDateField: string;
  memberField: string;
  writes: string[];
  countsAs: string[];
  changesStanding?: boolean;
  documentKinds?: Array<{ value: string; label: string }>;
  tracksCertificate?: boolean;
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
  documentCount?: number;
  certificateStatus?: string | null;
  linkLabel?: string;
};

type MemberOption = { id: string; label: string };

type StoredDocument = {
  id: string;
  kind: string;
  kindLabel: string;
  fileName: string;
  mimeType: string;
  bytes: number;
  size: string;
  uploadedAt: string | null;
};

type ConvertClass = {
  id: string;
  name: string;
  description?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  active?: boolean;
};

/**
 * Held here rather than imported from the server library: that module reads and
 * writes file bytes, which has no business in a browser bundle.
 */
const CERTIFICATE_STATUSES = [
  { value: 'processing', label: 'Being processed' },
  { value: 'ready', label: 'Ready for collection' },
  { value: 'delivered', label: 'Delivered' },
];

const certificateLabel = (value?: string | null) =>
  CERTIFICATE_STATUSES.find((s) => s.value === value)?.label || 'Not yet processed';

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Opens on the year to date, which is the period a register is usually read for. */
const defaultRange = () => {
  const now = new Date();
  return { from: iso(new Date(now.getFullYear(), 0, 1)), to: iso(now) };
};

const ISO_LIKE = /^\d{4}-\d{2}-\d{2}T/;

const shortDate = (value?: string | null) =>
  value
    ? new Date(value).toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : '\u2014';

/** Particulars may hold a date or a plain word; dates are shown as dates. */
const pretty = (value: string) => (ISO_LIKE.test(value) ? shortDate(value) : value);

/** Reads a chosen file into a data URL, which is how the server takes it. */
function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('That file could not be read.'));
    reader.readAsDataURL(file);
  });
}

/* ------------------------------------------------------------------ */
/* The paperwork behind one entry                                     */
/* ------------------------------------------------------------------ */

/**
 * Letters of transfer, certificates, permits.
 *
 * Uploading a baptism certificate here is what marks it delivered: the file is
 * the evidence, so asking the church to attach it and then separately say it was
 * handed over would be asking the same question twice.
 */
function DocumentsDialog({
  def,
  entry,
  onClose,
  onChanged,
}: {
  def: RegisterDef;
  entry: Entry;
  onClose: () => void;
  onChanged: () => void;
}) {
  const kinds = def.documentKinds || [];
  const [docs, setDocs] = useState<StoredDocument[]>([]);
  const [kind, setKind] = useState(kinds[0]?.value || 'other');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const fileInput = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await churchApi.getRegisterDocuments(def.key, entry.id);
      setDocs(res?.data || []);
      setError('');
    } catch (e: any) {
      setError(e?.friendlyMessage || 'Could not load the paperwork for this entry.');
    } finally {
      setLoading(false);
    }
  }, [def.key, entry.id]);

  useEffect(() => {
    load();
  }, [load]);

  const upload = async (file: File) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const dataUrl = await readAsDataUrl(file);
      const res = await churchApi.uploadRegisterDocument(def.key, entry.id, {
        fileName: file.name,
        dataUrl,
        kind,
      });
      setNotice(res?.message || 'The document was attached.');
      await load();
      onChanged();
    } catch (e: any) {
      setError(e?.friendlyMessage || 'That document could not be attached.');
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  /**
   * Opened from the data URL rather than a direct link, because the file is
   * held in the church's own database behind the same permissions as the entry.
   */
  const open = async (doc: StoredDocument) => {
    try {
      const res = await churchApi.openRegisterDocument(doc.id);
      if (!res?.dataUrl) throw new Error('empty');
      const anchor = document.createElement('a');
      anchor.href = res.dataUrl;
      anchor.download = doc.fileName || 'document';
      anchor.click();
    } catch (e: any) {
      setError(e?.friendlyMessage || 'That document could not be opened.');
    }
  };

  const remove = async (doc: StoredDocument) => {
    setBusy(true);
    try {
      const res = await churchApi.deleteRegisterDocument(doc.id);
      setNotice(res?.message || 'The document was removed.');
      await load();
      onChanged();
    } catch (e: any) {
      setError(e?.friendlyMessage || 'That document could not be removed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ pb: 1 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
          <Box>
            <Typography variant="h6">Paperwork</Typography>
            <Typography variant="caption" color="text.secondary">
              {entry.memberName} \u00b7 {shortDate(entry.date)}
            </Typography>
          </Box>
          <IconButton size="small" onClick={onClose}>
            <X size={18} />
          </IconButton>
        </Stack>
      </DialogTitle>
      <DialogContent dividers>
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

        <Alert severity="info" icon={<Info size={18} />} sx={{ mb: 2 }}>
          Attachments are never required. File the entry when it happens and attach the paper
          whenever it arrives. PDFs or photographs, up to 5MB each.
          {def.tracksCertificate && ' Attaching the certificate marks it as delivered.'}
        </Alert>

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 2 }}>
          <TextField
            select
            size="small"
            label="What is this paper?"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            sx={{ minWidth: 220 }}
          >
            {kinds.map((k) => (
              <MenuItem key={k.value} value={k.value}>
                {k.label}
              </MenuItem>
            ))}
          </TextField>
          <Button
            variant="contained"
            startIcon={<Upload size={16} />}
            disabled={busy}
            onClick={() => fileInput.current?.click()}
          >
            {busy ? 'Uploading\u2026' : 'Choose a file'}
          </Button>
          <input
            ref={fileInput}
            type="file"
            hidden
            accept="application/pdf,image/jpeg,image/png,image/webp"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) upload(file);
            }}
          />
        </Stack>

        {loading ? (
          <Box sx={{ py: 3, textAlign: 'center' }}>
            <CircularProgress size={24} />
          </Box>
        ) : docs.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
            Nothing has been attached to this entry yet.
          </Typography>
        ) : (
          <List dense disablePadding>
            {docs.map((doc) => (
              <ListItem
                key={doc.id}
                divider
                secondaryAction={
                  <Stack direction="row" spacing={0.5}>
                    <Tooltip title="Download">
                      <IconButton size="small" onClick={() => open(doc)}>
                        <Download size={16} />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Remove">
                      <IconButton size="small" color="error" disabled={busy} onClick={() => remove(doc)}>
                        <Trash2 size={16} />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                }
              >
                <ListItemText
                  primary={doc.fileName}
                  secondary={`${doc.kindLabel} \u00b7 ${doc.size} \u00b7 attached ${shortDate(doc.uploadedAt)}`}
                />
              </ListItem>
            ))}
          </List>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Done</Button>
      </DialogActions>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* The classes behind the converts dropdown                           */
/* ------------------------------------------------------------------ */

/**
 * Intakes are named once here so that enrolling a convert is a choice rather
 * than a piece of typing. Two secretaries spelling the same class differently is
 * how a class list quietly becomes useless.
 */
function ClassesDialog({
  classes,
  onClose,
  onChanged,
}: {
  classes: ConvertClass[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const add = async () => {
    if (!name.trim()) {
      setError('Give the class a name.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await churchApi.createConvertClass({ name: name.trim(), startDate: startDate || null });
      setName('');
      setStartDate('');
      setNotice('The class was added.');
      onChanged();
    } catch (e: any) {
      setError(e?.friendlyMessage || 'That class could not be added.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (cls: ConvertClass) => {
    setBusy(true);
    setError('');
    try {
      const res = await churchApi.deleteConvertClass(cls.id);
      setNotice(res?.message || 'The class was removed.');
      onChanged();
    } catch (e: any) {
      setError(e?.friendlyMessage || 'That class could not be removed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Converts classes</DialogTitle>
      <DialogContent dividers>
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

        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Name each intake once \u2014 "January 2026 intake", "Easter convention class" \u2014 and it
          becomes a choice on the converts register. A class with converts enrolled in it is closed
          rather than deleted, so their enrolment is never left pointing at nothing.
        </Typography>

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 2 }}>
          <TextField
            size="small"
            label="Class name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            fullWidth
          />
          <TextField
            size="small"
            type="date"
            label="Starts"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          <Button variant="contained" onClick={add} disabled={busy} startIcon={<Plus size={16} />}>
            Add
          </Button>
        </Stack>

        {classes.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
            No classes have been set up yet.
          </Typography>
        ) : (
          <List dense disablePadding>
            {classes.map((cls) => (
              <ListItem
                key={cls.id}
                divider
                secondaryAction={
                  <IconButton size="small" color="error" disabled={busy} onClick={() => remove(cls)}>
                    <Trash2 size={16} />
                  </IconButton>
                }
              >
                <ListItemText
                  primary={
                    <Stack direction="row" spacing={1} alignItems="center">
                      <span>{cls.name}</span>
                      {cls.active === false && <Chip label="Closed" size="small" />}
                    </Stack>
                  }
                  secondary={cls.startDate ? `Started ${shortDate(cls.startDate)}` : null}
                />
              </ListItem>
            ))}
          </List>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Done</Button>
      </DialogActions>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* The page                                                           */
/* ------------------------------------------------------------------ */

export function RegistersPage() {
  const [defs, setDefs] = useState<RegisterDef[]>([]);
  const [active, setActive] = useState(0);
  const [range, setRange] = useState(defaultRange);
  const [query, setQuery] = useState('');

  const [entries, setEntries] = useState<Entry[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [classes, setClasses] = useState<ConvertClass[]>([]);
  const [offices, setOffices] = useState<string[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<Record<string, any>>({});
  const [formErrors, setFormErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const [pendingWithdrawal, setPendingWithdrawal] = useState<Entry | null>(null);
  const [docsFor, setDocsFor] = useState<Entry | null>(null);
  const [classesOpen, setClassesOpen] = useState(false);

  const timer = useRef<any>(null);
  const current = defs[active];

  /** The catalogue and the lists the dropdowns are built from, loaded once. */
  useEffect(() => {
    churchApi
      .getRegisters()
      .then((list: RegisterDef[]) => setDefs(list || []))
      .catch((e: any) => setError(e?.friendlyMessage || 'Could not load the registers.'));

    churchApi
      .getMembers({ limit: 2000 })
      .then((list: any[]) =>
        setMembers(
          (list || []).map((m: any) => ({
            id: m.id,
            label: [m.firstName, m.lastName].filter(Boolean).join(' ') || m.email || m.id,
          })),
        ),
      )
      .catch(() => undefined);

    churchApi
      .getOffices()
      .then((list: any[]) => setOffices((list || []).map((o: any) => o.name).filter(Boolean)))
      .catch(() => undefined);
  }, []);

  const loadClasses = useCallback(() => {
    churchApi
      .getConvertClasses()
      .then((list: ConvertClass[]) => setClasses(list || []))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    loadClasses();
  }, [loadClasses]);

  const load = useCallback(async () => {
    if (!current) return;
    setLoading(true);
    try {
      const [res, summary] = await Promise.all([
        churchApi.getRegisterEntries(current.key, {
          from: range.from,
          to: range.to,
          q: query || undefined,
        }),
        churchApi.getRegisterSummary({ from: range.from, to: range.to }),
      ]);
      setEntries(res?.data || []);
      setCounts(summary || {});
      setError('');
    } catch (e: any) {
      setError(e?.friendlyMessage || 'Could not load this register.');
    } finally {
      setLoading(false);
    }
  }, [current, range.from, range.to, query]);

  // Typing in the search box should not fire a request per keystroke.
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(load, query ? 350 : 0);
    return () => timer.current && clearTimeout(timer.current);
  }, [load, query]);

  /** The choices for a dropdown whose options belong to the church. */
  const optionsFor = (field: RegisterField): Array<{ value: string; label: string }> => {
    if (field.optionSource === 'convert_classes') {
      return classes
        .filter((c) => c.active !== false)
        .map((c) => ({ value: c.id, label: c.name }));
    }
    if (field.optionSource === 'offices') {
      return offices.map((name) => ({ value: name, label: name }));
    }
    return field.options || [];
  };

  const emptySourceHint = (field: RegisterField): string | null => {
    if (field.optionSource === 'convert_classes' && classes.length === 0) {
      return 'No classes have been set up yet. Use the Classes button on this register.';
    }
    if (field.optionSource === 'offices' && offices.length === 0) {
      return 'No offices have been spelt out yet. Add them under Settings \u203a Offices.';
    }
    return null;
  };

  const openForm = () => {
    if (!current) return;
    // The primary date defaults to today, since a register is usually written up
    // the same day. Everything else is left for the person filing to say.
    setForm({ [current.primaryDateField]: iso(new Date()) });
    setFormErrors([]);
    setFormOpen(true);
  };

  const file = async () => {
    if (!current) return;
    setSaving(true);
    setFormErrors([]);
    try {
      const res = await churchApi.fileRegisterEntry(current.key, form);
      setFormOpen(false);
      setNotice(res?.message || 'The entry was filed.');
      await load();
      // A register that takes paperwork opens straight onto it, so the letter or
      // certificate can be attached now if it is already to hand.
      if (current.documentKinds?.length && res?.data) setDocsFor(res.data);
    } catch (e: any) {
      const list = e?.response?.data?.errors;
      setFormErrors(
        Array.isArray(list) && list.length
          ? list
          : [e?.friendlyMessage || 'That entry could not be filed.'],
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
      await load();
    } catch (e: any) {
      setError(e?.friendlyMessage || 'That entry could not be withdrawn.');
    } finally {
      setPendingWithdrawal(null);
    }
  };

  const setCertificate = async (entry: Entry, status: string) => {
    try {
      const res = await churchApi.setBaptismCertificateStatus(entry.id, status);
      setNotice(res?.message || 'The certificate was updated.');
      await load();
    } catch (e: any) {
      setError(e?.friendlyMessage || 'The certificate could not be updated.');
    }
  };

  const memberOption = (id: any) => members.find((m) => m.id === id) || null;

  const cards = useMemo(
    () => defs.map((def) => ({ key: def.key, label: def.plural, count: counts[def.key] ?? 0 })),
    [defs, counts],
  );

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <Typography variant="h5" fontWeight={700}>
        Registers
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
        A book for each kind of event in a member's life. Entries here write straight to the member's
        own record, so the registers and the statistical return can never disagree.
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

      {/* ---- How many entries each register holds in this period ---- */}
      <Grid container spacing={1.5} sx={{ mb: 2.5 }}>
        {cards.map((card, index) => (
          <Grid key={card.key} size={{ xs: 6, sm: 4, md: 12 / 6 }}>
            <Card
              variant="outlined"
              sx={{
                cursor: 'pointer',
                borderColor: index === active ? 'primary.main' : undefined,
              }}
              onClick={() => setActive(index)}
            >
              <CardContent sx={{ py: 1.25, '&:last-child': { pb: 1.25 } }}>
                <Typography variant="caption" color="text.secondary" noWrap display="block">
                  {card.label}
                </Typography>
                <Typography variant="h6" fontWeight={700}>
                  {card.count}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Paper variant="outlined" sx={{ mb: 2.5 }}>
        <Tabs
          value={active}
          onChange={(_e, v) => setActive(v)}
          variant="scrollable"
          scrollButtons="auto"
        >
          {defs.map((def) => (
            <Tab key={def.key} label={def.plural} />
          ))}
        </Tabs>
      </Paper>

      {current && (
        <>
          {/* ---- What filing an entry will do ---- */}
          <Alert severity="info" icon={<Info size={18} />} sx={{ mb: 2 }}>
            <Typography variant="body2" sx={{ mb: 0.5 }}>
              {current.description}
            </Typography>
            <Typography variant="caption" color="text.secondary" component="div">
              Filing an entry here will:
            </Typography>
            <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
              {current.writes.map((line) => (
                <Typography key={line} component="li" variant="caption" color="text.secondary">
                  {line}
                </Typography>
              ))}
            </Box>
            {current.countsAs.length > 0 && (
              <Stack direction="row" spacing={0.75} sx={{ mt: 1, flexWrap: 'wrap', gap: 0.75 }}>
                <Typography variant="caption" color="text.secondary" sx={{ alignSelf: 'center' }}>
                  Counts towards:
                </Typography>
                {current.countsAs.map((figure) => (
                  <Chip
                    key={figure}
                    label={figure}
                    size="small"
                    variant="outlined"
                    component={RouterLink}
                    to="/church/statistics"
                    clickable
                  />
                ))}
              </Stack>
            )}
          </Alert>

          {/* ---- Period, search and filing ---- */}
          <Paper variant="outlined" sx={{ p: 2, mb: 2.5 }}>
            <Grid container spacing={2} alignItems="center">
              <Grid size={{ xs: 6, md: 2 }}>
                <TextField
                  fullWidth
                  size="small"
                  type="date"
                  label="From"
                  value={range.from}
                  onChange={(e) => setRange({ ...range, from: e.target.value })}
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
              <Grid size={{ xs: 6, md: 2 }}>
                <TextField
                  fullWidth
                  size="small"
                  type="date"
                  label="To"
                  value={range.to}
                  onChange={(e) => setRange({ ...range, to: e.target.value })}
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <TextField
                  fullWidth
                  size="small"
                  placeholder="Search names and particulars\u2026"
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
                <Stack direction="row" spacing={1} justifyContent="flex-end">
                  {current.key === 'converts' && (
                    <Button
                      variant="outlined"
                      startIcon={<GraduationCap size={16} />}
                      onClick={() => setClassesOpen(true)}
                    >
                      Classes
                    </Button>
                  )}
                  <Button variant="contained" startIcon={<Plus size={16} />} onClick={openForm}>
                    Record {current.label}
                  </Button>
                </Stack>
              </Grid>
            </Grid>
          </Paper>

          {/* ---- The register itself ---- */}
          <Paper variant="outlined">
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>Date</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Name</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Particulars</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Kept in</TableCell>
                    {current.documentKinds?.length ? (
                      <TableCell align="center" sx={{ fontWeight: 700 }}>
                        Paperwork
                      </TableCell>
                    ) : null}
                    {current.tracksCertificate && (
                      <TableCell sx={{ fontWeight: 700 }}>Certificate</TableCell>
                    )}
                    <TableCell align="right" sx={{ fontWeight: 700 }}>
                      Withdraw
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {loading && entries.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                        <CircularProgress size={24} />
                      </TableCell>
                    </TableRow>
                  )}

                  {!loading && entries.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                        <BookOpen size={22} />
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                          {query
                            ? `Nothing in this register matches \u201c${query}\u201d.`
                            : 'Nothing has been entered in this register for this period.'}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )}

                  {entries.map((entry) => (
                    <TableRow key={entry.id} hover>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{shortDate(entry.date)}</TableCell>
                      <TableCell>
                        {/* The name in the row is not always the member the entry
                            hangs from -- a birth names the child -- so the link is
                            labelled rather than pretending otherwise. */}
                        {entry.memberId && !entry.linkLabel ? (
                          <Link
                            component={RouterLink}
                            to={`/church/members?member=${entry.memberId}`}
                            underline="hover"
                            fontWeight={500}
                          >
                            {entry.memberName}
                          </Link>
                        ) : (
                          <Stack spacing={0.25}>
                            <Typography variant="body2" fontWeight={500}>
                              {entry.memberName}
                            </Typography>
                            {entry.memberId && entry.linkLabel && (
                              <Link
                                component={RouterLink}
                                to={`/church/members?member=${entry.memberId}`}
                                underline="hover"
                                variant="caption"
                              >
                                {entry.linkLabel}
                              </Link>
                            )}
                          </Stack>
                        )}
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">{entry.detail}</Typography>
                        <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', gap: 0.5, mt: 0.25 }}>
                          {entry.particulars.map((p) => (
                            <Chip
                              key={`${p.label}-${p.value}`}
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
                        <Tooltip title="Where this fact is actually stored">
                          <Chip
                            icon={<Database size={13} />}
                            label={entry.origin}
                            size="small"
                            variant="outlined"
                          />
                        </Tooltip>
                      </TableCell>

                      {current.documentKinds?.length ? (
                        <TableCell align="center">
                          <Tooltip
                            title={
                              entry.documentCount
                                ? `${entry.documentCount} document${entry.documentCount === 1 ? '' : 's'} attached`
                                : 'Attach the paperwork'
                            }
                          >
                            <IconButton size="small" onClick={() => setDocsFor(entry)}>
                              <Paperclip size={16} />
                            </IconButton>
                          </Tooltip>
                          {entry.documentCount ? (
                            <Typography variant="caption" color="text.secondary">
                              {entry.documentCount}
                            </Typography>
                          ) : null}
                        </TableCell>
                      ) : null}

                      {current.tracksCertificate && (
                        <TableCell sx={{ minWidth: 190 }}>
                          {/* The certificate has a life of its own after the
                              baptism, so it is moved along here rather than being
                              left to memory. Uploading it marks it delivered. */}
                          <TextField
                            select
                            size="small"
                            fullWidth
                            value={entry.certificateStatus || ''}
                            onChange={(e) => setCertificate(entry, e.target.value)}
                            SelectProps={{
                              renderValue: (value: any) => (
                                <Stack direction="row" spacing={0.5} alignItems="center">
                                  <Award size={13} />
                                  <span>{certificateLabel(value)}</span>
                                </Stack>
                              ),
                            }}
                          >
                            {CERTIFICATE_STATUSES.map((s) => (
                              <MenuItem key={s.value} value={s.value}>
                                {s.label}
                              </MenuItem>
                            ))}
                          </TextField>
                        </TableCell>
                      )}

                      <TableCell align="right">
                        <Tooltip title="Withdraw this entry">
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => setPendingWithdrawal(entry)}
                          >
                            <Trash2 size={16} />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </>
      )}

      {/* ---- Filing an entry ---- */}
      {current && (
        <Dialog open={formOpen} onClose={() => setFormOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle>Record {current.label}</DialogTitle>
          <DialogContent dividers>
            {formErrors.length > 0 && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {formErrors.length === 1 ? (
                  formErrors[0]
                ) : (
                  <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
                    {formErrors.map((message) => (
                      <li key={message}>{message}</li>
                    ))}
                  </Box>
                )}
              </Alert>
            )}

            {current.changesStanding && (
              <Alert severity="warning" icon={<AlertTriangle size={18} />} sx={{ mb: 2 }}>
                This entry changes the member's standing, which moves the membership figure from the
                date you give. Use the date it actually happened, not today's date.
              </Alert>
            )}

            <Grid container spacing={2} sx={{ mt: 0.5 }}>
              {current.fields.map((field) => {
                const hint = emptySourceHint(field);
                const wide = field.type === 'textarea';
                return (
                  <Grid key={field.name} size={{ xs: 12, sm: wide ? 12 : 6 }}>
                    {field.type === 'member' ? (
                      <Autocomplete
                        options={members}
                        value={memberOption(form[field.name])}
                        onChange={(_e, value) =>
                          setForm({ ...form, [field.name]: value ? value.id : '' })
                        }
                        isOptionEqualToValue={(a, b) => a.id === b.id}
                        renderInput={(params) => (
                          <TextField
                            {...params}
                            size="small"
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
                        size="small"
                        label={field.label}
                        required={field.required}
                        value={form[field.name] || ''}
                        onChange={(e) => setForm({ ...form, [field.name]: e.target.value })}
                        helperText={hint || field.helperText}
                      >
                        <MenuItem value="">
                          <em>Not stated</em>
                        </MenuItem>
                        {optionsFor(field).map((o) => (
                          <MenuItem key={o.value} value={o.value}>
                            {o.label}
                          </MenuItem>
                        ))}
                      </TextField>
                    ) : (
                      <TextField
                        fullWidth
                        size="small"
                        type={field.type === 'date' ? 'date' : 'text'}
                        multiline={wide}
                        minRows={wide ? 2 : undefined}
                        label={field.label}
                        required={field.required}
                        value={form[field.name] || ''}
                        onChange={(e) => setForm({ ...form, [field.name]: e.target.value })}
                        InputLabelProps={field.type === 'date' ? { shrink: true } : undefined}
                        helperText={field.helperText}
                      />
                    )}
                  </Grid>
                );
              })}
            </Grid>

            {current.documentKinds?.length ? (
              <Alert severity="info" icon={<Paperclip size={16} />} sx={{ mt: 2 }}>
                Once the entry is filed you can attach the paperwork. It is never required \u2014 file
                the fact now and attach the document whenever it arrives.
              </Alert>
            ) : null}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button variant="contained" onClick={file} disabled={saving}>
              {saving ? 'Filing\u2026' : 'File the entry'}
            </Button>
          </DialogActions>
        </Dialog>
      )}

      {/* ---- Withdrawing an entry ---- */}
      <Dialog open={!!pendingWithdrawal} onClose={() => setPendingWithdrawal(null)}>
        <DialogTitle>Withdraw this entry?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This clears the fact from {pendingWithdrawal?.memberName}'s record, not just the row in
            this register, and removes any paperwork attached to it.
            {current?.changesStanding &&
              ' Their standing goes back to active, and the dated history entry is removed.'}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPendingWithdrawal(null)}>Keep it</Button>
          <Button color="error" variant="contained" onClick={withdraw}>
            Withdraw
          </Button>
        </DialogActions>
      </Dialog>

      {docsFor && current && (
        <DocumentsDialog
          def={current}
          entry={docsFor}
          onClose={() => setDocsFor(null)}
          onChanged={load}
        />
      )}

      {classesOpen && (
        <ClassesDialog
          classes={classes}
          onClose={() => setClassesOpen(false)}
          onChanged={loadClasses}
        />
      )}

      <Divider sx={{ mt: 3, mb: 1.5 }} />
      <Typography variant="caption" color="text.secondary">
        Nothing on this page keeps its own tally. Each register reads and writes the same member
        records and status history the statistical return counts from, so the two can never disagree.
      </Typography>
    </Box>
  );
}

export default RegistersPage;
