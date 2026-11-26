import React, { useEffect, useState } from 'react';
import { Alert, Box, CircularProgress, Divider, Stack, Table, TableBody, TableCell, TableRow, Typography } from '@mui/material';
import PrintDocument from '../common/PrintDocument';
import api from '../../services/api';

const money = (value: number, currency = 'GHS') => {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 2 }).format(Number(value) || 0);
  } catch {
    return `${currency} ${Number(value || 0).toFixed(2)}`;
  }
};

const dt = (value?: string | null) =>
  value ? new Date(value).toLocaleString(undefined, { dateStyle: 'long', timeStyle: 'short' }) : '—';

/**
 * The church's own receipt, printed from the payment record.
 *
 * The data comes from the server's receipt endpoint so the printed figures are
 * the recorded ones. The letterhead uses the church's uploaded logo; when a
 * church has not uploaded one, its name is set large enough to stand alone.
 */
export default function ReceiptDialog({
  kind,
  recordId,
  onClose,
}: {
  kind: 'giving' | 'dues';
  recordId: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setData(null);
    setError('');
    api
      .get(`/church/finance/receipts/${kind}/${encodeURIComponent(recordId)}`)
      .then((res) => { if (active) setData(res.data); })
      .catch((e) => { if (active) setError(e?.friendlyMessage || 'This receipt could not be prepared.'); });
    return () => { active = false; };
  }, [kind, recordId]);

  return (
    <PrintDocument title="Church receipt" onClose={onClose}>
      {error && <Alert severity="error">{error}</Alert>}
      {!data && !error && (
        <Box sx={{ py: 6, textAlign: 'center' }}><CircularProgress size={28} /></Box>
      )}
      {data && (
        <Box sx={{ maxWidth: 760, mx: 'auto' }}>
          {/* Letterhead */}
          <Stack direction="row" spacing={2} alignItems="center" sx={{ pb: 2, borderBottom: '2px solid #1b4332' }}>
            {data.church?.logo ? (
              <Box
                component="img"
                src={data.church.logo}
                alt={`${data.church.name} logo`}
                sx={{ width: 76, height: 76, objectFit: 'contain', flexShrink: 0 }}
              />
            ) : (
              <Box sx={{ width: 76, height: 76, borderRadius: 2, bgcolor: '#1b4332', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, fontWeight: 800, flexShrink: 0 }}>
                {(data.church?.name || 'C')[0]}
              </Box>
            )}
            <Box>
              <Typography variant="h5" fontWeight={800} sx={{ color: '#1b4332' }}>{data.church?.name}</Typography>
              {data.church?.address && <Typography variant="body2">{data.church.address}</Typography>}
              <Typography variant="body2">
                {[data.church?.phone, data.church?.email, data.church?.website].filter(Boolean).join(' · ')}
              </Typography>
            </Box>
          </Stack>

          <Typography variant="h6" align="center" fontWeight={800} sx={{ letterSpacing: 2, my: 2.5, textTransform: 'uppercase' }}>
            Official receipt
          </Typography>

          <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={2} sx={{ mb: 2 }}>
            <Box>
              <Typography variant="caption" color="text.secondary">Receipt number</Typography>
              <Typography fontWeight={700}>{data.receiptNumber}</Typography>
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>Received from</Typography>
              <Typography fontWeight={600}>{data.payer?.name}</Typography>
              {data.payer?.memberId && <Typography variant="body2">Member ID: {data.payer.memberId}</Typography>}
            </Box>
            <Box sx={{ textAlign: { sm: 'right' } }}>
              <Typography variant="caption" color="text.secondary">Date received</Typography>
              <Typography fontWeight={700}>{dt(data.issuedAt)}</Typography>
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>Status</Typography>
              <Typography fontWeight={600} sx={{ textTransform: 'capitalize' }}>{data.status}</Typography>
            </Box>
          </Stack>

          <Table size="small" sx={{ my: 2 }}>
            <TableBody>
              <TableRow>
                <TableCell sx={{ fontWeight: 700, width: '45%' }}>Being payment for</TableCell>
                <TableCell>{data.purpose}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>Category</TableCell>
                <TableCell>{data.category}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>Payment method</TableCell>
                <TableCell sx={{ textTransform: 'capitalize' }}>{String(data.method || '—').replaceAll('_', ' ')}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>Reference</TableCell>
                <TableCell sx={{ overflowWrap: 'anywhere' }}>{data.reference}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell sx={{ fontWeight: 800, fontSize: 16 }}>Amount received</TableCell>
                <TableCell sx={{ fontWeight: 800, fontSize: 16 }}>{money(data.amount, data.currency)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>

          <Divider sx={{ my: 3 }} />
          <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={2}>
            <Box>
              <Typography variant="caption" color="text.secondary">Received by</Typography>
              <Typography fontWeight={600}>{data.receivedBy || 'Church finance office'}</Typography>
            </Box>
            <Box sx={{ textAlign: { sm: 'right' } }}>
              <Box sx={{ mt: 4, borderTop: '1px solid #999', width: 220, pt: 0.5 }}>
                <Typography variant="caption">Authorised signature / stamp</Typography>
              </Box>
            </Box>
          </Stack>

          <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 3, textAlign: 'center' }}>
            Thank you for your faithfulness. This receipt is computer-generated from the church's recorded payment.
          </Typography>
        </Box>
      )}
    </PrintDocument>
  );
}
