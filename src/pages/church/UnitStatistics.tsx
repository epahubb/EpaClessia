/**
 * The statistical return for a ministry, department or group.
 *
 * Every figure here is counted from records the church already keeps, and none
 * of them can be typed on this page. That constraint is what makes the sheet
 * worth reading: it cannot disagree with the register it describes. The
 * corollary is that every figure must be traceable, so each one is a link that
 * opens the actual people, services, visits or payments it counted, and each row
 * says where that fact is recorded in case it needs correcting.
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
import {
  Search,
  TrendingUp,
  TrendingDown,
  Minus,
  Info,
  X,
  ExternalLink,
  Database,
} from 'lucide-react';
import { Link as RouterLink } from 'react-router-dom';
import churchApi from '../../services/churchApi';

type Unit = {
  id: string;
  name: string;
  unitType: 'ministry' | 'department' | 'group';
  leaderName?: string | null;
  active?: boolean;
};

type StatRow = {
  key: string;
  label: string;
  source: string;
  sourceLabel: string;
  recordedAt: string;
  kind: 'count' | 'currency' | 'people';
  description: string;
  standing: boolean;
  hasRecords: boolean;
  current: number;
  previous: number;
  variance: number;
  variancePercent: number | null;
  direction: 'up' | 'down' | 'flat';
  sentiment: 'good' | 'bad' | 'neutral';
};

type StatRecord = {
  title: string;
  date: string | null;
  value: number;
  origin: string;
  detail?: string | null;
  memberId?: string | null;
  sourceId?: string | null;
};

const UNIT_LABELS: Record<string, string> = {
  ministry: 'Ministry',
  department: 'Department',
  group: 'Group',
};

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Opens on the last 30 days: recent enough to be current, long enough to hold something. */
const defaultRange = () => {
  const to = new Date();
  const from = new Date(to.getTime() - 29 * 24 * 60 * 60 * 1000);
  return { from: iso(from), to: iso(to) };
};

const money = (n: number) =>
  `GHS ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatValue = (row: { kind: string }, n: number) =>
  row.kind === 'currency' ? money(n) : String(Number(n || 0).toLocaleString());

const shortDate = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

/**
 * The movement, shown in the colour of what it means rather than of its
 * direction. A rise in deaths or backsliders is never green.
 */
function VarianceCell({ row }: { row: StatRow }) {
  const colour =
    row.sentiment === 'good' ? 'success.main' : row.sentiment === 'bad' ? 'error.main' : 'text.secondary';

  const Icon = row.direction === 'up' ? TrendingUp : row.direction === 'down' ? TrendingDown : Minus;

  return (
    <Stack direction="row" spacing={0.75} alignItems="center" justifyContent="flex-end">
      <Icon size={15} />
      <Typography variant="body2" sx={{ color: colour, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
        {row.variance > 0 ? '+' : ''}
        {formatValue(row, row.variance)}
      </Typography>
      {/* Growth from nothing has no percentage. Printing one would be inventing a
          number for the people reading the sheet. */}
      {row.variancePercent !== null && row.variance !== 0 && (
        <Typography variant="caption" sx={{ color: colour }}>
          ({row.variancePercent > 0 ? '+' : ''}
          {row.variancePercent}%)
        </Typography>
      )}
    </Stack>
  );
}

/**
 * The records behind one figure.
 *
 * The point of the whole design: a leader who doubts a number sees the names,
 * dates and documents that produced it, and can click through to the member
 * record to correct it.
 */
function RecordsDialog({
  unit,
  row,
  range,
  onClose,
}: {
  unit: Unit;
  row: StatRow;
  range: { from: string; to: string };
  onClose: () => void;
}) {
  const [records, setRecords] = useState<StatRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    setLoading(true);
    churchApi
      .getUnitStatRecords(unit.unitType, unit.id, row.key, { from: range.from, to: range.to })
      .then((res: any) => {
        if (!live) return;
        setRecords(res?.data || []);
        setTotal(res?.total ?? 0);
        setError('');
      })
      .catch((e: any) => live && setError(e?.friendlyMessage || 'Could not load the records behind this figure.'))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [unit.unitType, unit.id, row.key, range.from, range.to]);

  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ pb: 1 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
          <Box>
            <Typography variant="h6">{row.label}</Typography>
            <Typography variant="caption" color="text.secondary">
              {unit.name} · {shortDate(range.from)} to {shortDate(range.to)}
            </Typography>
          </Box>
          <IconButton onClick={onClose} size="small">
            <X size={18} />
          </IconButton>
        </Stack>
      </DialogTitle>
      <DialogContent dividers>
        <Alert severity="info" icon={<Database size={18} />} sx={{ mb: 2 }}>
          Counted from {row.sourceLabel.toLowerCase()}. Recorded in {row.recordedAt}.
        </Alert>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {loading ? (
          <Box sx={{ py: 4, textAlign: 'center' }}>
            <CircularProgress size={26} />
          </Box>
        ) : records.length === 0 ? (
          <Box sx={{ py: 4, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              Nothing was recorded against this figure in this period.
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Records are counted from {row.recordedAt}.
            </Typography>
          </Box>
        ) : (
          <>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Record</TableCell>
                    <TableCell>Date</TableCell>
                    <TableCell>Where it came from</TableCell>
                    <TableCell align="right">{row.kind === 'currency' ? 'Amount' : 'Counts as'}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {records.map((rec, i) => (
                    <TableRow key={`${rec.sourceId || i}-${i}`} hover>
                      <TableCell>
                        <Stack direction="row" spacing={0.5} alignItems="center">
                          <Typography variant="body2" fontWeight={500}>
                            {rec.title}
                          </Typography>
                          {/* A record about a person links to that person, so a
                              wrong figure can be corrected at its source. */}
                          {rec.memberId && (
                            <Tooltip title="Open this member's record">
                              <IconButton
                                size="small"
                                component={RouterLink}
                                to={`/church/members?member=${rec.memberId}`}
                              >
                                <ExternalLink size={13} />
                              </IconButton>
                            </Tooltip>
                          )}
                        </Stack>
                        {rec.detail && (
                          <Typography variant="caption" color="text.secondary">
                            {rec.detail}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>{shortDate(rec.date)}</TableCell>
                      <TableCell>
                        <Chip label={rec.origin} size="small" variant="outlined" />
                      </TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                        {row.kind === 'currency' ? money(rec.value) : rec.value}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            <Divider sx={{ my: 1.5 }} />
            <Stack direction="row" justifyContent="space-between">
              <Typography variant="body2" color="text.secondary">
                {records.length} record{records.length === 1 ? '' : 's'}
              </Typography>
              <Typography variant="body2" fontWeight={600}>
                Total: {formatValue(row, total)}
              </Typography>
            </Stack>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function UnitStatisticsPage() {
  const [units, setUnits] = useState<Unit[]>([]);
  const [unitKey, setUnitKey] = useState('');
  const [range, setRange] = useState(defaultRange);
  const [query, setQuery] = useState('');

  const [rows, setRows] = useState<StatRow[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [cover, setCover] = useState<any>(null);
  const [period, setPeriod] = useState<any>(null);
  const [prior, setPrior] = useState<any>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [openRow, setOpenRow] = useState<StatRow | null>(null);

  const timer = useRef<any>(null);

  const unit = useMemo(() => units.find((u) => `${u.unitType}:${u.id}` === unitKey) || null, [units, unitKey]);

  useEffect(() => {
    churchApi
      .getUnits()
      .then((list: Unit[]) => {
        setUnits(list || []);
        if (list?.length) setUnitKey(`${list[0].unitType}:${list[0].id}`);
      })
      .catch((e: any) => setError(e?.friendlyMessage || 'Could not load the ministries, departments and groups.'));
  }, []);

  const load = useCallback(async () => {
    if (!unit) return;
    setLoading(true);
    try {
      const res = await churchApi.getUnitStatistics(unit.unitType, unit.id, {
        from: range.from,
        to: range.to,
        q: query || undefined,
      });
      setRows(res?.data || []);
      setSummary(res?.summary || null);
      setCover(res?.coverage || null);
      setPeriod(res?.period || null);
      setPrior(res?.previousPeriod || null);
      setError('');
    } catch (e: any) {
      setError(e?.friendlyMessage || 'Could not build the statistics for this unit.');
    } finally {
      setLoading(false);
    }
  }, [unit, range.from, range.to, query]);

  // Typing in the search box should not fire a request per keystroke.
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(load, query ? 300 : 0);
    return () => timer.current && clearTimeout(timer.current);
  }, [load, query]);

  const preset = (days: number) => {
    const to = new Date();
    const from = new Date(to.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
    setRange({ from: iso(from), to: iso(to) });
  };

  const thisMonth = () => {
    const now = new Date();
    setRange({ from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: iso(now) });
  };

  const cards = summary
    ? [
        { label: 'Total membership', value: summary.membership, delta: summary.membershipVariance },
        { label: 'Gained', value: summary.growth, hint: 'Converts, transfers in and members restored' },
        { label: 'Lost', value: summary.losses, hint: 'Transfers out, backsliders and deaths' },
        { label: 'Meetings held', value: summary.meetings },
        { label: 'Interventional support', value: money(summary.support) },
      ]
    : [];

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <Typography variant="h5" fontWeight={700}>
        Statistics
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
        The statistical return for a ministry, department or group. Every figure is counted from your
        own records, so nothing here is typed in — click any number to see the records behind it.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {/* ---- Filters ---- */}
      <Paper variant="outlined" sx={{ p: 2, mb: 2.5 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField
              select
              fullWidth
              size="small"
              label="Ministry, department or group"
              value={unitKey}
              onChange={(e) => setUnitKey(e.target.value)}
            >
              {units.length === 0 && <MenuItem value="">No units have been created yet</MenuItem>}
              {units.map((u) => (
                <MenuItem key={`${u.unitType}:${u.id}`} value={`${u.unitType}:${u.id}`}>
                  {u.name} · {UNIT_LABELS[u.unitType]}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
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
              placeholder="Search the figures…"
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
        </Grid>

        <Stack direction="row" spacing={1} sx={{ mt: 1.5, flexWrap: 'wrap', gap: 1 }}>
          <Button size="small" variant="outlined" onClick={thisMonth}>
            This month
          </Button>
          <Button size="small" variant="outlined" onClick={() => preset(30)}>
            Last 30 days
          </Button>
          <Button size="small" variant="outlined" onClick={() => preset(90)}>
            Last 90 days
          </Button>
          <Button size="small" variant="outlined" onClick={() => preset(365)}>
            Last 12 months
          </Button>
          {period && prior && (
            <Typography variant="caption" color="text.secondary" sx={{ alignSelf: 'center', ml: 1 }}>
              Compared against the {period.days} days before this period ({shortDate(prior.from)}{' '}
              to {shortDate(prior.to)})
            </Typography>
          )}
        </Stack>
      </Paper>

      {/* ---- Headline figures ---- */}
      {summary && (
        <Grid container spacing={2} sx={{ mb: 2.5 }}>
          {cards.map((c) => (
            <Grid key={c.label} size={{ xs: 12, sm: 6, md: 2.4 }}>
              <Card variant="outlined" sx={{ height: '100%' }}>
                <CardContent>
                  <Typography variant="caption" color="text.secondary">
                    {c.label}
                  </Typography>
                  <Typography variant="h5" fontWeight={700} sx={{ mt: 0.5 }}>
                    {typeof c.value === 'number' ? c.value.toLocaleString() : c.value}
                  </Typography>
                  {c.delta !== undefined && c.delta !== 0 && (
                    <Typography
                      variant="caption"
                      sx={{ color: c.delta > 0 ? 'success.main' : 'error.main' }}
                    >
                      {c.delta > 0 ? '+' : ''}
                      {c.delta} on the previous period
                    </Typography>
                  )}
                  {c.hint && (
                    <Typography variant="caption" color="text.secondary" display="block">
                      {c.hint}
                    </Typography>
                  )}
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {/* A sheet of zeroes is ambiguous: it may mean nothing happened, or that
          nobody is recording the underlying facts. Saying which is which is more
          use than presenting an empty return as though the unit did nothing. */}
      {cover && cover.withData === 0 && cover.total > 0 && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Nothing has been recorded for this unit in either period. These figures are counted from
          member records, attendance, the visitation log and finance — once those are being kept, the
          return fills itself in.
        </Alert>
      )}

      {/* ---- The return ---- */}
      <Paper variant="outlined">
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>Figure</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Counted from</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>
                  Current
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>
                  Previous
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>
                  Variance
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                    <CircularProgress size={24} />
                  </TableCell>
                </TableRow>
              )}

              {!loading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                    <Typography variant="body2" color="text.secondary">
                      {units.length === 0
                        ? 'Create a ministry, department or group first, and its return will appear here.'
                        : query
                          ? `No figure matches “${query}”.`
                          : 'Choose a ministry, department or group.'}
                    </Typography>
                  </TableCell>
                </TableRow>
              )}

              {rows.map((row) => (
                <TableRow key={row.key} hover>
                  <TableCell>
                    <Stack direction="row" spacing={0.75} alignItems="center">
                      <Typography variant="body2" fontWeight={500}>
                        {row.label}
                      </Typography>
                      <Tooltip title={row.description}>
                        <Box sx={{ display: 'flex', color: 'text.disabled' }}>
                          <Info size={13} />
                        </Box>
                      </Tooltip>
                    </Stack>
                  </TableCell>
                  <TableCell>
                    {/* Naming the source on every row is what makes the sheet
                        actionable: a figure that looks wrong comes with the
                        address of the record behind it. */}
                    <Tooltip title={`Recorded in ${row.recordedAt}`}>
                      <Chip label={row.sourceLabel} size="small" variant="outlined" />
                    </Tooltip>
                  </TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                    {row.hasRecords && row.current > 0 ? (
                      <Link
                        component="button"
                        type="button"
                        underline="hover"
                        onClick={() => setOpenRow(row)}
                        sx={{ fontWeight: 700 }}
                      >
                        {formatValue(row, row.current)}
                      </Link>
                    ) : (
                      <Typography variant="body2" fontWeight={700} component="span">
                        {formatValue(row, row.current)}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', color: 'text.secondary' }}>
                    {formatValue(row, row.previous)}
                  </TableCell>
                  <TableCell align="right">
                    <VarianceCell row={row} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
        Figures counted from the roster describe the unit as it stands, so they have no list of
        events behind them. Every other figure can be opened to show the records it counted.
      </Typography>

      {openRow && unit && (
        <RecordsDialog unit={unit} row={openRow} range={range} onClose={() => setOpenRow(null)} />
      )}
    </Box>
  );
}

export default UnitStatisticsPage;
