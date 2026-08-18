import React, { useEffect, useState, useCallback } from 'react';
import {
  Box, Grid, Paper, Typography, Card, CardContent, TextField, Button,
  MenuItem, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Chip, CircularProgress, Snackbar, Alert, Dialog, DialogTitle, DialogContent,
  DialogActions, Divider, InputAdornment, Stack, Tooltip,
} from '@mui/material';
import {
  CreditCard, Heart, TrendingUp, Clock, Download, Printer, RefreshCw, HandCoins,
} from 'lucide-react';
import {
  givingService, GivingRecord, GivingSummary, StatementResponse,
} from '../../services/givingService';

const PURPOSES = [
  'General', 'Tithe', 'Offering', 'Thanksgiving', 'Missions',
  'Building Fund', 'Welfare', 'Seed',
];

const fmt = (n: number | null | undefined) =>
  `GHS ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—';

const statusColor = (s: string): 'success' | 'warning' | 'error' | 'default' => {
  if (s === 'completed') return 'success';
  if (s === 'pending') return 'warning';
  if (s === 'failed') return 'error';
  return 'default';
};

const MemberGiving: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<GivingRecord[]>([]);
  const [summary, setSummary] = useState<GivingSummary | null>(null);

  const [amount, setAmount] = useState('');
  const [purpose, setPurpose] = useState('General');
  const [submitting, setSubmitting] = useState(false);

  const [snack, setSnack] = useState<{ open: boolean; msg: string; sev: 'success' | 'error' | 'info' }>({
    open: false, msg: '', sev: 'info',
  });

  const currentYear = new Date().getFullYear();
  const [stmtYear, setStmtYear] = useState(currentYear);
  const [statement, setStatement] = useState<StatementResponse | null>(null);
  const [stmtOpen, setStmtOpen] = useState(false);
  const [stmtLoading, setStmtLoading] = useState(false);

  const notify = (msg: string, sev: 'success' | 'error' | 'info' = 'info') =>
    setSnack({ open: true, msg, sev });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await givingService.getGiving();
      setRecords(res.data || []);
      setSummary(res.summary);
    } catch (e: any) {
      notify(e?.friendlyMessage || e?.message || 'Failed to load your giving history.', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  // Handle the Paystack redirect callback (?reference=... or ?trxref=...).
  const handleCallback = useCallback(async () => {
    const params = new URLSearchParams(window.location.search);
    const reference = params.get('reference') || params.get('trxref');
    if (!reference) return false;
    try {
      const result = await givingService.verify(reference);
      if (result.status === 'completed') {
        notify(`Thank you! Your gift of ${fmt(result.amount)} was received.`, 'success');
      } else {
        notify('Your payment could not be confirmed. If you were charged, please contact your church.', 'error');
      }
    } catch (e: any) {
      notify(e?.friendlyMessage || e?.message || 'Could not verify your payment.', 'error');
    } finally {
      // Clean the query string so a refresh does not re-verify.
      window.history.replaceState({}, '', window.location.pathname);
    }
    return true;
  }, []);

  useEffect(() => {
    (async () => {
      await handleCallback();
      await load();
    })();
  }, [handleCallback, load]);

  const handleGive = async () => {
    const value = Number(amount);
    if (!value || value <= 0) {
      notify('Please enter a valid amount.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const res = await givingService.initialize({
        amount: value,
        purpose,
        callbackUrl: `${window.location.origin}/member/giving`,
      });
      if (res.authorizationUrl) {
        window.location.href = res.authorizationUrl;
      } else {
        notify('Payment could not be started. Please try again.', 'error');
        setSubmitting(false);
      }
    } catch (e: any) {
      notify(e?.friendlyMessage || e?.message || 'Failed to start your payment.', 'error');
      setSubmitting(false);
    }
  };

  const openStatement = async () => {
    setStmtLoading(true);
    try {
      const data = await givingService.getStatement(stmtYear);
      setStatement(data);
      setStmtOpen(true);
    } catch (e: any) {
      notify(e?.friendlyMessage || e?.message || 'Failed to generate your statement.', 'error');
    } finally {
      setStmtLoading(false);
    }
  };

  const downloadCsv = () => {
    if (!statement) return;
    const rows = [
      ['Date', 'Purpose', 'Method', 'Reference', 'Amount (GHS)'],
      ...statement.gifts.map((g) => [
        fmtDate(g.date), g.purpose, g.method, g.reference || '', Number(g.amount).toFixed(2),
      ]),
      [],
      ['', '', '', 'Total', Number(statement.total).toFixed(2)],
    ];
    const csv = rows
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `contribution-statement-${statement.year}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const printStatement = () => {
    if (!statement) return;
    const w = window.open('', '_blank', 'width=800,height=900');
    if (!w) {
      notify('Please allow pop-ups to print your statement.', 'error');
      return;
    }
    const rowsHtml = statement.gifts
      .map(
        (g) => `<tr><td>${fmtDate(g.date)}</td><td>${g.purpose}</td><td>${g.method}</td><td style="text-align:right">${Number(g.amount).toFixed(2)}</td></tr>`,
      )
      .join('');
    w.document.write(`<!doctype html><html><head><title>Contribution Statement ${statement.year}</title>
      <style>body{font-family:Arial,Helvetica,sans-serif;color:#111;padding:32px;}h1{font-size:20px;margin:0 0 4px;}
      .muted{color:#666;font-size:13px;}table{width:100%;border-collapse:collapse;margin-top:24px;font-size:13px;}
      th,td{border-bottom:1px solid #ddd;padding:8px;text-align:left;}th{background:#f5f5f5;}
      .total{font-weight:700;font-size:15px;margin-top:16px;text-align:right;}
      .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #111;padding-bottom:12px;}</style>
      </head><body>
      <div class="head"><div><h1>${statement.church.name}</h1><div class="muted">Annual Contribution Statement</div></div>
      <div class="muted" style="text-align:right">Year: ${statement.year}<br/>Generated: ${fmtDate(statement.generatedAt)}</div></div>
      <p style="margin-top:16px"><strong>${statement.donor.name}</strong><br/><span class="muted">${statement.donor.email || ''}</span></p>
      <table><thead><tr><th>Date</th><th>Purpose</th><th>Method</th><th style="text-align:right">Amount (GHS)</th></tr></thead>
      <tbody>${rowsHtml || '<tr><td colspan=4 style="text-align:center;color:#666">No contributions recorded for this year.</td></tr>'}</tbody></table>
      <div class="total">Total for ${statement.year}: GHS ${Number(statement.total).toFixed(2)}</div>
      <p class="muted" style="margin-top:32px">Thank you for your faithful giving. This statement is provided for your records.</p>
      </body></html>`);
    w.document.close();
    w.focus();
    w.print();
  };

  const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - i);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 320 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ mb: 3, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <HandCoins size={28} />
          <Box>
            <Typography variant="h4" fontWeight={800} sx={{ letterSpacing: '-1px' }}>Giving</Typography>
            <Typography color="text.secondary" variant="body2">Give securely and track your contributions</Typography>
          </Box>
        </Box>
        <Tooltip title="Refresh">
          <span>
            <Button startIcon={<RefreshCw size={16} />} onClick={load} variant="outlined" size="small">Refresh</Button>
          </span>
        </Tooltip>
      </Box>

      {/* Summary cards */}
      <Grid container spacing={2} sx={{ mb: 1 }}>
        <Grid size={{ xs: 12, sm: 4 }}>
          <Card variant="outlined" sx={{ borderRadius: 3 }}>
            <CardContent>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ color: 'success.main', mb: 1 }}>
                <TrendingUp size={18} /><Typography variant="body2" fontWeight={600}>This Year ({currentYear})</Typography>
              </Stack>
              <Typography variant="h5" fontWeight={800}>{fmt(summary?.thisYear)}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 4 }}>
          <Card variant="outlined" sx={{ borderRadius: 3 }}>
            <CardContent>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ color: 'primary.main', mb: 1 }}>
                <Heart size={18} /><Typography variant="body2" fontWeight={600}>All-Time Giving</Typography>
              </Stack>
              <Typography variant="h5" fontWeight={800}>{fmt(summary?.allTime)}</Typography>
              <Typography variant="caption" color="text.secondary">{summary?.count || 0} gift{(summary?.count || 0) === 1 ? '' : 's'}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 4 }}>
          <Card variant="outlined" sx={{ borderRadius: 3 }}>
            <CardContent>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ color: 'info.main', mb: 1 }}>
                <Clock size={18} /><Typography variant="body2" fontWeight={600}>Last Gift</Typography>
              </Stack>
              <Typography variant="h5" fontWeight={800}>{summary?.lastGiftAmount != null ? fmt(summary.lastGiftAmount) : '—'}</Typography>
              <Typography variant="caption" color="text.secondary">{fmtDate(summary?.lastGiftDate)}</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Grid container spacing={3} sx={{ mt: 0 }}>
        {/* Give now */}
        <Grid size={{ xs: 12, md: 4 }}>
          <Paper variant="outlined" sx={{ p: 3, borderRadius: 3 }}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
              <CreditCard size={20} /><Typography variant="h6" fontWeight={700}>Give Now</Typography>
            </Stack>
            <TextField
              label="Amount" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
              fullWidth type="number" inputProps={{ min: 1, step: '0.01' }}
              InputProps={{ startAdornment: <InputAdornment position="start">GHS</InputAdornment> }}
              sx={{ mb: 2 }}
            />
            <TextField select label="Purpose" value={purpose} onChange={(e) => setPurpose(e.target.value)} fullWidth sx={{ mb: 1 }}>
              {PURPOSES.map((p) => <MenuItem key={p} value={p}>{p}</MenuItem>)}
            </TextField>
            <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: 'wrap', gap: 1 }}>
              {[20, 50, 100, 200].map((q) => (
                <Chip key={q} label={fmt(q)} onClick={() => setAmount(String(q))} variant="outlined" size="small" />
              ))}
            </Stack>
            <Button
              fullWidth variant="contained" size="large" onClick={handleGive} disabled={submitting}
              startIcon={submitting ? <CircularProgress size={18} color="inherit" /> : <HandCoins size={18} />}
            >
              {submitting ? 'Redirecting…' : 'Give securely'}
            </Button>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5, textAlign: 'center' }}>
              Secured by Paystack — Mobile Money & card supported.
            </Typography>
          </Paper>

          {/* Statement */}
          <Paper variant="outlined" sx={{ p: 3, borderRadius: 3, mt: 3 }}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
              <Download size={20} /><Typography variant="h6" fontWeight={700}>Contribution Statement</Typography>
            </Stack>
            <TextField select label="Year" value={stmtYear} onChange={(e) => setStmtYear(Number(e.target.value))} fullWidth sx={{ mb: 2 }}>
              {yearOptions.map((y) => <MenuItem key={y} value={y}>{y}</MenuItem>)}
            </TextField>
            <Button
              fullWidth variant="outlined" onClick={openStatement} disabled={stmtLoading}
              startIcon={stmtLoading ? <CircularProgress size={18} /> : <Download size={18} />}
            >
              {stmtLoading ? 'Preparing…' : 'Generate statement'}
            </Button>
          </Paper>
        </Grid>

        {/* History */}
        <Grid size={{ xs: 12, md: 8 }}>
          <Paper variant="outlined" sx={{ borderRadius: 3, overflow: 'hidden' }}>
            <Box sx={{ p: 2.5, pb: 1.5 }}>
              <Typography variant="h6" fontWeight={700}>Giving History</Typography>
            </Box>
            <Divider />
            {records.length === 0 ? (
              <Box sx={{ p: 6, textAlign: 'center' }}>
                <Heart size={40} style={{ opacity: 0.3 }} />
                <Typography color="text.secondary" sx={{ mt: 1 }}>You have no giving records yet.</Typography>
                <Typography variant="body2" color="text.secondary">Your gifts will appear here once you give.</Typography>
              </Box>
            ) : (
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Date</TableCell>
                      <TableCell>Purpose</TableCell>
                      <TableCell>Method</TableCell>
                      <TableCell align="right">Amount</TableCell>
                      <TableCell align="center">Status</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {records.map((r) => (
                      <TableRow key={r.id} hover>
                        <TableCell>{fmtDate(r.createdAt)}</TableCell>
                        <TableCell>{r.purpose}</TableCell>
                        <TableCell sx={{ textTransform: 'capitalize' }}>{r.paymentMethod}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600 }}>{fmt(r.amount)}</TableCell>
                        <TableCell align="center">
                          <Chip size="small" label={r.status} color={statusColor(r.status)} sx={{ textTransform: 'capitalize' }} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Paper>
        </Grid>
      </Grid>

      {/* Statement dialog */}
      <Dialog open={stmtOpen} onClose={() => setStmtOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Contribution Statement — {statement?.year}</DialogTitle>
        <DialogContent dividers>
          {statement && (
            <Box>
              <Typography variant="subtitle1" fontWeight={700}>{statement.church.name}</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                {statement.donor.name}{statement.donor.email ? ` • ${statement.donor.email}` : ''}
              </Typography>
              {statement.gifts.length === 0 ? (
                <Typography color="text.secondary">No contributions recorded for {statement.year}.</Typography>
              ) : (
                <TableContainer sx={{ maxHeight: 320 }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell>Date</TableCell>
                        <TableCell>Purpose</TableCell>
                        <TableCell align="right">Amount</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {statement.gifts.map((g, i) => (
                        <TableRow key={i}>
                          <TableCell>{fmtDate(g.date)}</TableCell>
                          <TableCell>{g.purpose}</TableCell>
                          <TableCell align="right">{fmt(g.amount)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
              <Box sx={{ mt: 2, textAlign: 'right' }}>
                <Typography variant="h6" fontWeight={800}>Total: {fmt(statement.total)}</Typography>
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={downloadCsv} startIcon={<Download size={16} />}>Download CSV</Button>
          <Button onClick={printStatement} startIcon={<Printer size={16} />} variant="contained">Print / Save PDF</Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snack.open} autoHideDuration={6000} onClose={() => setSnack((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snack.sev} variant="filled" onClose={() => setSnack((s) => ({ ...s, open: false }))}>
          {snack.msg}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default MemberGiving;
