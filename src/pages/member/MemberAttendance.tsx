import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Box, Paper, Typography, Button, Alert, CircularProgress, Chip, Stack,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
} from '@mui/material';
import { QrCode, CameraOff, CheckCircle2, History } from 'lucide-react';
import { BrowserMultiFormatReader } from '@zxing/library';
import memberAttendanceApi, { AttendanceHistoryRow } from '../../services/memberAttendanceApi';

type ScanState =
  | { kind: 'idle' }
  | { kind: 'scanning' }
  | { kind: 'success'; message: string; repeat?: boolean }
  | { kind: 'expired' }
  | { kind: 'error'; message: string };

export const MemberAttendance: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  // Guards against the camera firing the same payload dozens of times a second.
  const submittingRef = useRef(false);

  const [state, setState] = useState<ScanState>({ kind: 'idle' });
  const [history, setHistory] = useState<AttendanceHistoryRow[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      setHistory(await memberAttendanceApi.getHistory({ limit: 25 }));
    } catch {
      setHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const stopCamera = useCallback(() => {
    try { readerRef.current?.reset(); } catch { /* already stopped */ }
    readerRef.current = null;
  }, []);

  // Always release the camera when leaving the page.
  useEffect(() => stopCamera, [stopCamera]);

  const submit = useCallback(async (payload: string) => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    try {
      const res = await memberAttendanceApi.scan(payload);
      stopCamera();
      if (res?.alreadyRecorded) {
        setState({
          kind: 'success',
          repeat: true,
          message: res.eventName
            ? `You were already recorded for ${res.eventName}.`
            : 'You were already recorded for this service.',
        });
      } else {
        setState({
          kind: 'success',
          message: res?.eventName
            ? `Attendance recorded for ${res.eventName}.`
            : 'Attendance recorded.',
        });
      }
      loadHistory();
    } catch (e: any) {
      const status = e?.response?.status;
      const reason = e?.response?.data?.reason;
      stopCamera();
      // 410 means the code timed out -- a fresh code is needed, not a retry.
      if (status === 410 || reason === 'expired') {
        setState({ kind: 'expired' });
      } else {
        setState({
          kind: 'error',
          message: e?.friendlyMessage || 'That code could not be accepted. Ask for a fresh code.',
        });
      }
    } finally {
      submittingRef.current = false;
    }
  }, [loadHistory, stopCamera]);

  const startCamera = async () => {
    setState({ kind: 'scanning' });
    submittingRef.current = false;
    try {
      const reader = new BrowserMultiFormatReader();
      readerRef.current = reader;
      await reader.decodeFromVideoDevice(null, videoRef.current, (result) => {
        const text = result?.getText?.();
        if (text) submit(text);
      });
    } catch (e: any) {
      stopCamera();
      setState({
        kind: 'error',
        message:
          'Could not open the camera. Check that you granted camera permission and that the site is on HTTPS.',
      });
    }
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" fontWeight={800} sx={{ letterSpacing: '-0.5px' }}>My attendance</Typography>
        <Typography variant="body2" color="text.secondary">
          Scan the code displayed at your service to record that you were present.
        </Typography>
      </Box>

      <Paper sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider', p: { xs: 2.5, md: 4 }, mb: 3, textAlign: 'center' }}>
        {state.kind === 'success' ? (
          <Box sx={{ py: 3 }}>
            <CheckCircle2 size={48} color="#16a34a" />
            <Typography variant="h6" fontWeight={700} sx={{ mt: 1.5 }}>
              {state.repeat ? 'Already recorded' : 'You are checked in'}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>{state.message}</Typography>
            <Button variant="outlined" onClick={() => setState({ kind: 'idle' })}>Done</Button>
          </Box>
        ) : state.kind === 'scanning' ? (
          <Box>
            <Box
              component="video"
              ref={videoRef}
              sx={{ width: '100%', maxWidth: 420, borderRadius: 3, bgcolor: 'common.black' }}
              muted
              playsInline
            />
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
              Point your camera at the code. It will submit automatically.
            </Typography>
            <Button sx={{ mt: 1.5 }} startIcon={<CameraOff size={18} />} onClick={() => { stopCamera(); setState({ kind: 'idle' }); }}>
              Stop camera
            </Button>
          </Box>
        ) : (
          <Box sx={{ py: 3 }}>
            {state.kind === 'expired' && (
              <Alert severity="warning" sx={{ borderRadius: 2, mb: 2.5, textAlign: 'left' }}>
                That code has expired. Codes only last ten minutes -- ask for the code to be
                refreshed on screen, then scan again.
              </Alert>
            )}
            {state.kind === 'error' && (
              <Alert severity="error" sx={{ borderRadius: 2, mb: 2.5, textAlign: 'left' }}>{state.message}</Alert>
            )}
            <QrCode size={44} />
            <Typography variant="h6" fontWeight={700} sx={{ mt: 1.5 }}>Scan attendance code</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3, maxWidth: 420, mx: 'auto' }}>
              Your phone will ask for camera permission the first time.
            </Typography>
            <Button variant="contained" size="large" startIcon={<QrCode size={18} />} onClick={startCamera}>
              Open camera
            </Button>
          </Box>
        )}
      </Paper>

      <Paper sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider' }}>
        <Box sx={{ p: 2.5 }}>
          <Typography variant="h6" fontWeight={700}>Attendance history</Typography>
        </Box>
        {loadingHistory ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}><CircularProgress /></Box>
        ) : history.length === 0 ? (
          <Box sx={{ textAlign: 'center', p: 5, color: 'text.secondary' }}>
            <History size={40} />
            <Typography sx={{ mt: 1 }}>No attendance recorded yet.</Typography>
          </Box>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700 }}>Service</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>When</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Recorded by</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {history.map((h, i) => (
                  <TableRow key={`${h.eventId || i}-${i}`} hover>
                    <TableCell>{h.eventName || 'Service'}</TableCell>
                    <TableCell>
                      {h.checkInAt || h.date ? new Date((h.checkInAt || h.date) as string).toLocaleString() : '-'}
                    </TableCell>
                    <TableCell>
                      <Chip size="small" variant="outlined" label={h.method || 'manual'} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>
    </Box>
  );
};

export default MemberAttendance;
