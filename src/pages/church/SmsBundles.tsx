import React, { useEffect, useState } from 'react';
import {
  Box, Typography, Grid, Card, CardContent, Button, Chip, Divider,
  Table, TableHead, TableRow, TableCell, TableBody, Paper, CircularProgress,
  Alert, Dialog, DialogTitle, DialogContent, DialogActions,
} from '@mui/material';
import { MessageSquare, Check, Wallet } from 'lucide-react';
import { churchApi } from '../../services/churchApi';

interface SmsPackage { id: string; name: string; credits: number; price: number; currency?: string; description?: string; }
interface SmsPurchase { id: number | string; packageName: string; credits: number; amount: number; currency?: string; status: string; reference?: string; createdAt: string; }

const fmt = (n: number, c = 'GHS') => `${c} ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

const SmsBundles: React.FC = () => {
  const [packages, setPackages] = useState<SmsPackage[]>([]);
  const [purchases, setPurchases] = useState<SmsPurchase[]>([]);
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [confirm, setConfirm] = useState<SmsPackage | null>(null);
  const [buying, setBuying] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [pkgs, purs, bal] = await Promise.all([
        churchApi.getSmsPackages(),
        churchApi.getSmsPurchases(),
        churchApi.getSmsBalance(),
      ]);
      setPackages(pkgs);
      setPurchases(purs);
      setBalance(bal?.credits || 0);
    } catch {
      setMsg({ type: 'error', text: 'Failed to load SMS bundles.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const buy = async () => {
    if (!confirm) return;
    setBuying(true);
    try {
      const res = await churchApi.purchaseSms(confirm.id);
      setBalance(res?.credits ?? balance);
      setMsg({ type: 'success', text: `Purchased ${confirm.credits.toLocaleString()} SMS credits.` });
      setConfirm(null);
      await load();
    } catch {
      setMsg({ type: 'error', text: 'Purchase failed. Please try again.' });
    } finally {
      setBuying(false);
    }
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2, mb: 3 }}>
        <Box>
          <Typography variant="h5" fontWeight={800}>SMS Bundles</Typography>
          <Typography variant="body2" color="text.secondary">Purchase SMS credits to send messages to your members.</Typography>
        </Box>
        <Card sx={{ borderRadius: 3 }}>
          <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: '12px !important' }}>
            <Wallet size={22} />
            <Box>
              <Typography variant="caption" color="text.secondary">Current balance</Typography>
              <Typography variant="h6" fontWeight={800}>{balance.toLocaleString()} credits</Typography>
            </Box>
          </CardContent>
        </Card>
      </Box>

      {msg && <Alert severity={msg.type} sx={{ mb: 2 }} onClose={() => setMsg(null)}>{msg.text}</Alert>}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}><CircularProgress /></Box>
      ) : (
        <>
          <Grid container spacing={2.5}>
            {packages.length === 0 && (
              <Grid size={{ xs: 12 }}>
                <Alert severity="info">No SMS packages are available yet. Please check back later.</Alert>
              </Grid>
            )}
            {packages.map((p) => (
              <Grid key={p.id} size={{ xs: 12, sm: 6, md: 4 }}>
                <Card sx={{ borderRadius: 3, height: '100%', display: 'flex', flexDirection: 'column' }}>
                  <CardContent sx={{ flexGrow: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                      <MessageSquare size={20} />
                      <Typography variant="h6" fontWeight={800}>{p.name}</Typography>
                    </Box>
                    <Typography variant="h4" fontWeight={900} sx={{ my: 1 }}>{fmt(p.price, p.currency)}</Typography>
                    <Chip label={`${p.credits.toLocaleString()} SMS credits`} color="primary" size="small" sx={{ fontWeight: 700 }} />
                    {p.description && <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>{p.description}</Typography>}
                  </CardContent>
                  <Divider />
                  <Box sx={{ p: 2 }}>
                    <Button fullWidth variant="contained" startIcon={<Check size={18} />} onClick={() => setConfirm(p)} sx={{ borderRadius: 2, fontWeight: 700 }}>
                      Purchase bundle
                    </Button>
                  </Box>
                </Card>
              </Grid>
            ))}
          </Grid>

          <Typography variant="h6" fontWeight={800} sx={{ mt: 4, mb: 1.5 }}>Purchase history</Typography>
          <Paper sx={{ borderRadius: 3, overflow: 'hidden' }}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Package</TableCell>
                  <TableCell>Credits</TableCell>
                  <TableCell>Amount</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Reference</TableCell>
                  <TableCell>Date</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {purchases.length === 0 ? (
                  <TableRow><TableCell colSpan={6} align="center" sx={{ py: 4, color: 'text.secondary' }}>No purchases yet.</TableCell></TableRow>
                ) : purchases.map((pu) => (
                  <TableRow key={pu.id}>
                    <TableCell>{pu.packageName}</TableCell>
                    <TableCell>{Number(pu.credits).toLocaleString()}</TableCell>
                    <TableCell>{fmt(pu.amount, pu.currency)}</TableCell>
                    <TableCell><Chip size="small" label={pu.status} color={pu.status === 'completed' ? 'success' : 'default'} /></TableCell>
                    <TableCell>{pu.reference || '\u2014'}</TableCell>
                    <TableCell>{pu.createdAt ? new Date(pu.createdAt).toLocaleDateString() : '\u2014'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Paper>
        </>
      )}

      <Dialog open={!!confirm} onClose={() => setConfirm(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Confirm purchase</DialogTitle>
        <DialogContent>
          {confirm && (
            <Typography variant="body2">
              Purchase <b>{confirm.name}</b> for <b>{fmt(confirm.price, confirm.currency)}</b> and add
              {' '}<b>{confirm.credits.toLocaleString()}</b> SMS credits to your balance?
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirm(null)}>Cancel</Button>
          <Button variant="contained" onClick={buy} disabled={buying}>{buying ? 'Processing\u2026' : 'Confirm'}</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default SmsBundles;
