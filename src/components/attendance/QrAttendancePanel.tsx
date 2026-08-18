import React, { useCallback, useEffect, useState } from 'react';
import {
  Box, Paper, Typography, Button, Alert, CircularProgress, Chip, GlobalStyles, Stack,
} from '@mui/material';
import { QrCode, Printer, RefreshCw } from 'lucide-react';
import { churchApi } from '../../services/churchApi';
import QrCodeCanvas from './QrCodeCanvas';

interface QrAttendancePanelProps {
  eventId: string;
  eventName?: string;
}

// Hide the app chrome when printing so only the code and event name go on paper.
const printStyles = (
  <GlobalStyles
    styles={{
      '@media print': {
        'body *': { visibility: 'hidden' },
        '#qr-print-area, #qr-print-area *': { visibility: 'visible' },
        '#qr-print-area': { position: 'absolute', left: 0, top: 0, width: '100%', textAlign: 'center' },
        '.qr-no-print': { display: 'none' },
      },
    }}
  />
);

/** Seconds until `iso`, floored at zero. */
const secondsUntil = (iso?: string): number => {
  if (!iso) return 0;
  const ms = new Date(iso).getTime() - Date.now();
  return ms > 0 ? Math.floor(ms / 1000) : 0;
};

const formatCountdown = (total: number): string =>
  `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;

export const QrAttendancePanel: React.FC<QrAttendancePanelProps> = ({ eventId, eventName }) => {
  const [payload, setPayload] = useState('');
  const [expiresAt, setExpiresAt] = useState<string | undefined>();
  const [remaining, setRemaining] = useState(0);
  const [loading, setLoading] = useState(true);
  const [issuing, setIssuing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reuse a code that is still valid so re-opening this page mid-service does
  // not invalidate the code people are already scanning.
  const load = useCallback(async () => {
    if (!eventId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await churchApi.getEventQr(eventId);
      if (res?.payload && secondsUntil(res.expiresAt) > 0) {
        setPayload(res.payload);
        setExpiresAt(res.expiresAt);
      } else {
        setPayload('');
        setExpiresAt(undefined);
      }
    } catch (e: any) {
      setError(e?.friendlyMessage || 'Could not load the QR code for this event.');
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => { load(); }, [load]);

  const issue = async () => {
    setIssuing(true);
    setError(null);
    try {
      const res = await churchApi.issueEventQr(eventId);
      setPayload(res.payload);
      setExpiresAt(res.expiresAt);
    } catch (e: any) {
      setError(e?.friendlyMessage || 'Could not generate a QR code.');
    } finally {
      setIssuing(false);
    }
  };

  useEffect(() => {
    if (!expiresAt) { setRemaining(0); return; }
    setRemaining(secondsUntil(expiresAt));
    const t = setInterval(() => setRemaining(secondsUntil(expiresAt)), 1000);
    return () => clearInterval(t);
  }, [expiresAt]);

  const expired = Boolean(payload) && remaining === 0;

  if (loading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}><CircularProgress /></Box>;
  }

  return (
    <>
      {printStyles}
      {error && <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}>{error}</Alert>}

      <Paper sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider', p: { xs: 2.5, md: 4 }, textAlign: 'center' }}>
        {!payload ? (
          <Box sx={{ py: 4 }}>
            <QrCode size={44} />
            <Typography variant="h6" fontWeight={700} sx={{ mt: 1.5 }}>No active code</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3, maxWidth: 460, mx: 'auto' }}>
              Generate a code for members to scan from their own phones. Codes last ten
              minutes, so a photograph taken during the service stops working soon after.
            </Typography>
            <Button variant="contained" size="large" startIcon={<QrCode size={18} />} onClick={issue} disabled={issuing}>
              {issuing ? 'Generating...' : 'Generate QR code'}
            </Button>
          </Box>
        ) : (
          <>
            <Box id="qr-print-area">
              <Typography variant="h5" fontWeight={800}>{eventName || 'Attendance'}</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Scan from the member portal to record your attendance.
              </Typography>
              <QrCodeCanvas value={payload} size={340} />
            </Box>

            <Box className="qr-no-print" sx={{ mt: 3 }}>
              {expired ? (
                <Alert severity="warning" sx={{ mb: 2, borderRadius: 2, textAlign: 'left' }}>
                  This code has expired. Generate a new one -- the server rejects scans
                  against an expired code.
                </Alert>
              ) : (
                <Chip
                  color={remaining < 60 ? 'warning' : 'success'}
                  label={`Expires in ${formatCountdown(remaining)}`}
                  sx={{ mb: 2, fontWeight: 700 }}
                />
              )}

              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} justifyContent="center">
                <Button variant="contained" startIcon={<RefreshCw size={18} />} onClick={issue} disabled={issuing}>
                  {issuing ? 'Generating...' : 'New code'}
                </Button>
                <Button variant="outlined" startIcon={<Printer size={18} />} onClick={() => window.print()} disabled={expired}>
                  Print
                </Button>
              </Stack>

              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2.5, maxWidth: 520, mx: 'auto' }}>
                A printed sheet is only valid for the ten-minute life of the code, so it
                suits a short window at the entrance. For a full service, display this on
                a screen and press New code when the timer runs low.
              </Typography>
            </Box>
          </>
        )}
      </Paper>
    </>
  );
};

export default QrAttendancePanel;
