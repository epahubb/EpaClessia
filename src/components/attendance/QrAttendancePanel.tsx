import React, { useCallback, useEffect, useState } from 'react';
import {
  Box, Paper, Typography, Button, Alert, CircularProgress, Chip, GlobalStyles, Stack,
} from '@mui/material';
import { QrCode, Printer, RefreshCw, Clock, CheckCircle2 } from 'lucide-react';
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
const secondsUntil = (iso?: string | null): number => {
  if (!iso) return 0;
  const ms = new Date(iso).getTime() - Date.now();
  return ms > 0 ? Math.floor(ms / 1000) : 0;
};

const formatCountdown = (total: number): string =>
  `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;

/** "Sat 22 Aug, 9:00 am" - enough to act on, short enough for a chip. */
const formatWhen = (iso?: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString();
};

/** How long until the service starts, in words. */
const untilText = (seconds: number): string => {
  if (seconds <= 0) return 'now';
  const days = Math.floor(seconds / 86400);
  if (days >= 1) return `in ${days} day${days === 1 ? '' : 's'}`;
  const hours = Math.floor(seconds / 3600);
  if (hours >= 1) return `in ${hours} hour${hours === 1 ? '' : 's'}`;
  const minutes = Math.max(1, Math.floor(seconds / 60));
  return `in ${minutes} minute${minutes === 1 ? '' : 's'}`;
};

type WindowState = {
  active: boolean;
  reason?: 'not_started' | 'ended' | 'no_schedule';
  message?: string;
  startsAt?: string | null;
  endsAt?: string | null;
};

export const QrAttendancePanel: React.FC<QrAttendancePanelProps> = ({ eventId, eventName }) => {
  const [payload, setPayload] = useState('');
  const [expiresAt, setExpiresAt] = useState<string | undefined>();
  const [remaining, setRemaining] = useState(0);
  const [loading, setLoading] = useState(true);
  const [issuing, setIssuing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [window_, setWindow] = useState<WindowState>({ active: true });

  // Reuse a code that is still valid so re-opening this page mid-service does
  // not invalidate the code people are already scanning.
  const load = useCallback(async () => {
    if (!eventId) return;
    setError(null);
    try {
      const res = await churchApi.getEventQr(eventId);
      const active = res?.active !== false;
      setWindow({
        active,
        reason: res?.reason,
        message: res?.message,
        startsAt: res?.startsAt,
        endsAt: res?.endsAt,
      });

      if (active && res?.payload && secondsUntil(res.expiresAt) > 0) {
        setPayload(res.payload);
        setExpiresAt(res.expiresAt);
      } else {
        // Outside the service window there is nothing to display, and a stale
        // code left on screen would invite people to scan something the server
        // is going to reject.
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

  // Keep checking while the window is shut, so the code appears by itself when
  // the service starts and disappears when it ends. The screen at the entrance
  // is often left unattended, so it has to cross those boundaries on its own.
  useEffect(() => {
    const interval = setInterval(() => { void load(); }, 30000);
    return () => clearInterval(interval);
  }, [load]);

  const issue = async () => {
    setIssuing(true);
    setError(null);
    try {
      const res = await churchApi.issueEventQr(eventId);
      setPayload(res.payload);
      setExpiresAt(res.expiresAt);
      setWindow({ active: true });
    } catch (e: any) {
      setError(e?.friendlyMessage || 'Could not generate a QR code.');
      // The refusal may itself be the window closing between render and click.
      void load();
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

  /* --- Outside the event's own start/end window ---------------------- */
  if (!window_.active) {
    const notYet = window_.reason === 'not_started';
    const startsIn = secondsUntil(window_.startsAt);
    return (
      <>
        {error && <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}>{error}</Alert>}
        <Paper sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider', p: { xs: 2.5, md: 4 }, textAlign: 'center' }}>
          <Box sx={{ py: 3, color: 'text.secondary' }}>
            {notYet ? <Clock size={44} /> : <CheckCircle2 size={44} />}
            <Typography variant="h6" fontWeight={700} color="text.primary" sx={{ mt: 1.5 }}>
              {notYet
                ? 'Attendance has not opened yet'
                : window_.reason === 'ended'
                  ? 'Attendance is closed'
                  : 'Attendance is unavailable'}
            </Typography>
            <Typography variant="body2" sx={{ mt: 1, mb: 2.5, maxWidth: 480, mx: 'auto' }}>
              {window_.message
                || 'A QR code only works between the start and end of the event.'}
            </Typography>

            <Stack direction="row" spacing={1} justifyContent="center" flexWrap="wrap" useFlexGap>
              {window_.startsAt && (
                <Chip
                  variant="outlined"
                  label={`Starts ${formatWhen(window_.startsAt)}`}
                  sx={{ fontWeight: 600 }}
                />
              )}
              {window_.endsAt && (
                <Chip
                  variant="outlined"
                  label={`Ends ${formatWhen(window_.endsAt)}`}
                  sx={{ fontWeight: 600 }}
                />
              )}
              {notYet && startsIn > 0 && (
                <Chip color="info" label={`Opens ${untilText(startsIn)}`} sx={{ fontWeight: 700 }} />
              )}
            </Stack>

            <Typography variant="caption" sx={{ display: 'block', mt: 3, maxWidth: 520, mx: 'auto' }}>
              {notYet
                ? 'You can leave this screen open — the code appears by itself when the event starts.'
                : window_.reason === 'no_schedule'
                  ? 'Set a date and time on this event, then attendance can be opened.'
                  : 'Marks already recorded are kept. Use the roll call to correct anything by hand.'}
            </Typography>
          </Box>
        </Paper>
      </>
    );
  }

  /* --- Inside the window -------------------------------------------- */
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
              minutes, so a photograph taken during the service stops working soon after —
              and no code works once the event has ended.
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
                <Stack direction="row" spacing={1} justifyContent="center" flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
                  <Chip
                    color={remaining < 60 ? 'warning' : 'success'}
                    label={`Expires in ${formatCountdown(remaining)}`}
                    sx={{ fontWeight: 700 }}
                  />
                  {window_.endsAt && (
                    <Chip variant="outlined" label={`Closes ${formatWhen(window_.endsAt)}`} sx={{ fontWeight: 600 }} />
                  )}
                </Stack>
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
                a screen and press New code when the timer runs low. Scanning stops
                automatically when the event ends.
              </Typography>
            </Box>
          </>
        )}
      </Paper>
    </>
  );
};

export default QrAttendancePanel;
