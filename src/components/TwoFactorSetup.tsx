import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Button, TextField, Alert, CircularProgress, Chip, Divider,
  Paper, Stepper, Step, StepLabel,
} from '@mui/material';
import { ShieldCheck, ShieldOff, Copy } from 'lucide-react';
import { twoFactorService } from '../services/brandingService';
import QrCodeCanvas from './attendance/QrCodeCanvas';

// Reusable 2FA self-service panel used by the super admin System Settings and
// by church admins in their own settings screen.
const TwoFactorSetup: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Setup flow
  const [setupMode, setSetupMode] = useState(false);
  const [secret, setSecret] = useState('');
  const [otpauthUrl, setOtpauthUrl] = useState('');
  const [code, setCode] = useState('');

  const loadStatus = async () => {
    setLoading(true);
    try {
      const res = await twoFactorService.status();
      setEnabled(!!res.enabled);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadStatus(); }, []);

  const beginSetup = async () => {
    setBusy(true); setMsg(null);
    try {
      const res = await twoFactorService.setup();
      setSecret(res.secret);
      setOtpauthUrl(res.otpauthUrl);
      setSetupMode(true);
    } catch {
      setMsg({ type: 'error', text: 'Failed to start 2FA setup.' });
    } finally { setBusy(false); }
  };

  const confirmEnable = async () => {
    if (code.trim().length < 6) { setMsg({ type: 'error', text: 'Enter the 6-digit code from your authenticator app.' }); return; }
    setBusy(true); setMsg(null);
    try {
      await twoFactorService.enable(code.trim());
      setMsg({ type: 'success', text: 'Two-factor authentication is now enabled.' });
      setSetupMode(false); setCode(''); setSecret(''); setOtpauthUrl('');
      loadStatus();
    } catch {
      setMsg({ type: 'error', text: 'Invalid code. Please try again.' });
    } finally { setBusy(false); }
  };

  const disable = async () => {
    if (!window.confirm('Disable two-factor authentication for your account?')) return;
    setBusy(true); setMsg(null);
    try {
      await twoFactorService.disable();
      setMsg({ type: 'success', text: 'Two-factor authentication disabled.' });
      loadStatus();
    } catch {
      setMsg({ type: 'error', text: 'Failed to disable 2FA.' });
    } finally { setBusy(false); }
  };

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}><CircularProgress /></Box>;

  return (
    <Box>
      {msg && <Alert severity={msg.type} onClose={() => setMsg(null)} sx={{ mb: 2, borderRadius: 2 }}>{msg.text}</Alert>}

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
        {enabled ? <ShieldCheck size={22} color="#16a34a" /> : <ShieldOff size={22} color="#d97706" />}
        <Typography variant="body1" fontWeight={700}>Two-Factor Authentication</Typography>
        <Chip size="small" label={enabled ? 'ENABLED' : 'DISABLED'} color={enabled ? 'success' : 'default'} sx={{ fontWeight: 700, fontSize: '0.6rem' }} />
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Add an extra layer of security using an authenticator app (Google Authenticator, Authy, Microsoft Authenticator, etc.).
      </Typography>

      {!enabled && !setupMode && (
        <Button variant="contained" startIcon={<ShieldCheck size={18} />} onClick={beginSetup} disabled={busy} sx={{ borderRadius: 2, fontWeight: 700 }}>
          {busy ? 'Preparing…' : 'Set up 2FA'}
        </Button>
      )}

      {enabled && (
        <Button variant="outlined" color="error" startIcon={<ShieldOff size={18} />} onClick={disable} disabled={busy} sx={{ borderRadius: 2, fontWeight: 700 }}>
          Disable 2FA
        </Button>
      )}

      {setupMode && (
        <Paper variant="outlined" sx={{ p: 3, borderRadius: 3, mt: 1 }}>
          <Stepper activeStep={1} alternativeLabel sx={{ mb: 3 }}>
            <Step completed><StepLabel>Generate secret</StepLabel></Step>
            <Step><StepLabel>Scan & verify</StepLabel></Step>
            <Step><StepLabel>Done</StepLabel></Step>
          </Stepper>
          <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 3, alignItems: 'center' }}>
            {/*
              Rendered locally on purpose. This previously used an external QR
              image service, which meant the TOTP secret -- the one thing that
              must never leave this system -- was placed in a URL and sent to a
              third party on every 2FA setup.
            */}
            {otpauthUrl && <QrCodeCanvas value={otpauthUrl} size={180} />}
            <Box sx={{ flex: 1 }}>
              <Typography variant="body2" fontWeight={700} sx={{ mb: 0.5 }}>1. Scan the QR code</Typography>
              <Typography variant="caption" color="text.secondary">Or enter this secret manually:</Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, my: 1 }}>
                <Chip label={secret} sx={{ fontFamily: 'monospace', fontWeight: 700 }} />
                <Button size="small" startIcon={<Copy size={14} />} onClick={() => navigator.clipboard?.writeText(secret)}>Copy</Button>
              </Box>
              <Divider sx={{ my: 2 }} />
              <Typography variant="body2" fontWeight={700} sx={{ mb: 1 }}>2. Enter the 6-digit code</Typography>
              <Box sx={{ display: 'flex', gap: 1.5 }}>
                <TextField size="small" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" inputProps={{ maxLength: 6, style: { letterSpacing: '0.4em', fontWeight: 700 } }} />
                <Button variant="contained" onClick={confirmEnable} disabled={busy} sx={{ borderRadius: 2, fontWeight: 700 }}>Verify & Enable</Button>
                <Button onClick={() => { setSetupMode(false); setCode(''); }}>Cancel</Button>
              </Box>
            </Box>
          </Box>
        </Paper>
      )}
    </Box>
  );
};

export default TwoFactorSetup;
