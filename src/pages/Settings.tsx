import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Paper, Grid, TextField, Button, Switch, FormControlLabel,
  Alert, CircularProgress, List, ListItemButton, ListItemIcon, ListItemText,
  Divider, InputAdornment, IconButton, MenuItem,
} from '@mui/material';
import {
  Palette, Mail, MessageSquare, CreditCard, ShieldCheck, HardDrive, Save,
  Eye, EyeOff, SendHorizonal, Upload, KeyRound,
} from 'lucide-react';
import { settingsService } from '../services/settingsService';
import TwoFactorSetup from '../components/TwoFactorSetup';

type FieldType = 'text' | 'password' | 'number' | 'bool' | 'select' | 'image';
interface Field { key: string; label: string; type?: FieldType; options?: string[]; help?: string; }
interface Section { key: string; label: string; icon: React.ReactNode; description: string; fields: Field[]; test?: 'email' | 'sms'; custom?: 'twofa'; }

const SECTIONS: Section[] = [
  { key: 'branding', label: 'General & Branding', icon: <Palette size={18} />, description: 'Platform identity, logo, favicon and login screen shown across the app.', fields: [
    { key: 'platformName', label: 'Platform name', help: 'Shown in the browser tab, e.g. "EpaChurch".' },
    { key: 'tagline', label: 'Tagline' },
    { key: 'supportEmail', label: 'Support email' },
    { key: 'primaryColor', label: 'Primary color (hex)' },
    { key: 'logoUrl', label: 'Platform logo', type: 'image', help: 'Used as the default favicon and login-screen logo.' },
    { key: 'faviconUrl', label: 'Favicon', type: 'image', help: 'Overrides the default browser-tab icon. Churches see their own logo when logged in.' },
    { key: 'loginBackground', label: 'Login screen background image', type: 'image', help: 'Shown behind the sign-in form for all users.' },
    { key: 'maxUploadMb', label: 'Max upload file size (MB)', type: 'number', help: 'Applies to all file & image uploads across the platform.' },
  ] },
  { key: 'email', label: 'Email (SMTP)', icon: <Mail size={18} />, description: 'Outbound email configuration.', test: 'email', fields: [
    { key: 'host', label: 'SMTP host' },
    { key: 'port', label: 'SMTP port', type: 'number' },
    { key: 'username', label: 'Username' },
    { key: 'password', label: 'Password', type: 'password' },
    { key: 'fromName', label: 'From name' },
    { key: 'fromEmail', label: 'From email' },
    { key: 'secure', label: 'Use TLS/SSL', type: 'bool' },
  ] },
  { key: 'sms', label: 'SMS Gateway', icon: <MessageSquare size={18} />, description: 'Platform-wide SMS provider (mNotify).', test: 'sms', fields: [
    { key: 'provider', label: 'Provider', type: 'select', options: ['mNotify', 'Twilio', 'Other'] },
    { key: 'apiKey', label: 'API key', type: 'password' },
    { key: 'senderId', label: 'Sender ID' },
    { key: 'enabled', label: 'Enable SMS', type: 'bool' },
  ] },
  { key: 'payment', label: 'Payments', icon: <CreditCard size={18} />, description: 'Default Paystack keys for platform billing.', fields: [
    { key: 'provider', label: 'Provider', type: 'select', options: ['Paystack', 'Flutterwave'] },
    { key: 'publicKey', label: 'Public key' },
    { key: 'secretKey', label: 'Secret key', type: 'password' },
    { key: 'currency', label: 'Currency', type: 'select', options: ['GHS', 'NGN', 'USD'] },
    { key: 'enabled', label: 'Enable online payments', type: 'bool' },
    /*
     * Transaction charge applied to every transaction that runs through the
     * platform: online giving, SMS bundle purchases and invoices. "Payer"
     * adds the charge on top of the amount; "recipient" deducts it from what
     * the church receives.
     */
    { key: 'transactionChargeEnabled', label: 'Apply a transaction charge', type: 'bool' },
    { key: 'transactionChargePercent', label: 'Charge percentage (%)', type: 'number' },
    { key: 'transactionChargeFlat', label: 'Flat charge per transaction', type: 'number' },
    { key: 'transactionChargeCap', label: 'Maximum charge (0 = no cap)', type: 'number' },
    { key: 'transactionChargeBearer', label: 'Who pays the charge', type: 'select', options: ['payer', 'recipient'] },
  ] },
  { key: 'security', label: 'Security', icon: <ShieldCheck size={18} />, description: 'Authentication & session policy.', fields: [
    { key: 'passwordMinLength', label: 'Minimum password length', type: 'number' },
    { key: 'sessionTimeoutMins', label: 'Session timeout (minutes)', type: 'number' },
    { key: 'maxLoginAttempts', label: 'Max login attempts', type: 'number' },
    { key: 'enforceMfa', label: 'Enforce MFA for admins', type: 'bool' },
  ] },
  { key: 'storage', label: 'Storage', icon: <HardDrive size={18} />, description: 'File storage configuration.', fields: [
    { key: 'provider', label: 'Provider', type: 'select', options: ['Local', 'AWS S3', 'Cloudinary'] },
    { key: 'bucket', label: 'Bucket / Cloud name' },
    { key: 'region', label: 'Region' },
    { key: 'accessKey', label: 'Access key' },
    { key: 'secretKey', label: 'Secret key', type: 'password' },
    { key: 'maxUploadMb', label: 'Max upload size (MB)', type: 'number' },
  ] },
  { key: 'twofa', label: 'Two-Factor Auth', icon: <KeyRound size={18} />, description: 'Secure your super admin account. Church admins can enable 2FA from their own settings.', fields: [], custom: 'twofa' },
];

const Settings: React.FC = () => {
  const [active, setActive] = useState(0);
  const [values, setValues] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showSecret, setShowSecret] = useState<Record<string, boolean>>({});

  const section = SECTIONS[active];

  const loadSection = async (key: string) => {
    setLoading(true);
    try {
      const data = await settingsService.getSettings(key);
      setValues(data && typeof data === 'object' ? data : {});
    } catch {
      setValues({});
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadSection(section.key); /* eslint-disable-next-line */ }, [active]);

  const save = async () => {
    setSaving(true); setMsg(null);
    try {
      await settingsService.updateSettings(section.key, values);
      setMsg({ type: 'success', text: `${section.label} saved.` });
    } catch {
      setMsg({ type: 'error', text: 'Failed to save settings.' });
    } finally { setSaving(false); }
  };

  const runTest = async () => {
    setTesting(true); setMsg(null);
    try {
      if (section.test === 'email') await settingsService.testEmail();
      else if (section.test === 'sms') await settingsService.testSms();
      setMsg({ type: 'success', text: 'Test dispatched successfully.' });
    } catch {
      setMsg({ type: 'error', text: 'Test failed. Check your configuration.' });
    } finally { setTesting(false); }
  };

  const setField = (k: string, v: any) => setValues((prev) => ({ ...prev, [k]: v }));

  const handleImageUpload = (key: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const maxMb = Number(values.maxUploadMb) || 5;
    if (file.size > maxMb * 1024 * 1024) {
      setMsg({ type: 'error', text: `File exceeds the ${maxMb}MB limit.` });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setField(key, reader.result as string);
    reader.readAsDataURL(file);
  };

  const renderField = (f: Field) => {
    if (f.type === 'image') {
      const val = values[f.key];
      return (
        <Box key={f.key} sx={{ border: '1px dashed', borderColor: 'divider', borderRadius: 2, p: 2 }}>
          <Typography variant="body2" fontWeight={700} sx={{ mb: 1 }}>{f.label}</Typography>
          {val
            ? <Box component="img" src={val} alt={f.label} sx={{ maxHeight: 90, maxWidth: '100%', borderRadius: 1, mb: 1, display: 'block', bgcolor: 'action.hover' }} />
            : <Typography variant="caption" color="text.secondary">No image uploaded yet.</Typography>}
          <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
            <Button component="label" variant="outlined" size="small" startIcon={<Upload size={16} />} sx={{ borderRadius: 2 }}>
              Upload
              <input hidden type="file" accept="image/*" onChange={(e) => handleImageUpload(f.key, e)} />
            </Button>
            {val && <Button size="small" color="error" onClick={() => setField(f.key, '')}>Remove</Button>}
          </Box>
          {f.help && <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>{f.help}</Typography>}
        </Box>
      );
    }
    if (f.type === 'bool') {
      return (
        <FormControlLabel key={f.key}
          control={<Switch checked={!!values[f.key]} onChange={(e) => setField(f.key, e.target.checked)} />}
          label={<Typography fontWeight={600}>{f.label}</Typography>} />
      );
    }
    if (f.type === 'select') {
      return (
        <TextField key={f.key} select fullWidth label={f.label} value={values[f.key] || ''} onChange={(e) => setField(f.key, e.target.value)}>
          {(f.options || []).map((o) => <MenuItem key={o} value={o}>{o}</MenuItem>)}
        </TextField>
      );
    }
    if (f.type === 'password') {
      const shown = showSecret[f.key];
      return (
        <TextField key={f.key} fullWidth label={f.label} type={shown ? 'text' : 'password'} value={values[f.key] || ''}
          onChange={(e) => setField(f.key, e.target.value)}
          InputProps={{ endAdornment: (
            <InputAdornment position="end">
              <IconButton size="small" onClick={() => setShowSecret((s) => ({ ...s, [f.key]: !s[f.key] }))}>{shown ? <EyeOff size={16} /> : <Eye size={16} />}</IconButton>
            </InputAdornment>) }} />
      );
    }
    return (
      <TextField key={f.key} fullWidth label={f.label} type={f.type === 'number' ? 'number' : 'text'}
        value={values[f.key] ?? ''} onChange={(e) => setField(f.key, f.type === 'number' ? Number(e.target.value) : e.target.value)} helperText={f.help} />
    );
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" fontWeight={800} sx={{ letterSpacing: '-0.5px' }}>System Settings</Typography>
        <Typography variant="body2" color="text.secondary">Configure platform-wide branding, integrations, security, and storage.</Typography>
      </Box>

      {msg && <Alert severity={msg.type} onClose={() => setMsg(null)} sx={{ mb: 3, borderRadius: 2 }}>{msg.text}</Alert>}

      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 3 }}>
          <Paper sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
            <List disablePadding>
              {SECTIONS.map((s, i) => (
                <ListItemButton key={s.key} selected={active === i} onClick={() => setActive(i)}
                  sx={{ py: 1.5, '&.Mui-selected': { bgcolor: 'primary.light', color: 'primary.main', '& .MuiListItemIcon-root': { color: 'primary.main' } } }}>
                  <ListItemIcon sx={{ minWidth: 38 }}>{s.icon}</ListItemIcon>
                  <ListItemText primary={<Typography variant="body2" fontWeight={700}>{s.label}</Typography>} />
                </ListItemButton>
              ))}
            </List>
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, md: 9 }}>
          <Paper sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider', p: { xs: 2.5, md: 4 } }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5 }}>
              {section.icon}
              <Typography variant="h6" fontWeight={800}>{section.label}</Typography>
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>{section.description}</Typography>
            <Divider sx={{ mb: 3 }} />

            {section.custom === 'twofa' ? (
              <TwoFactorSetup />
            ) : loading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>
            ) : (
              <Grid container spacing={2.5}>
                {section.fields.map((f) => (
                  <Grid key={f.key} size={{ xs: 12, sm: (f.type === 'bool' || f.type === 'image') ? 12 : 6 }}>{renderField(f)}</Grid>
                ))}
              </Grid>
            )}

            {section.custom !== 'twofa' && (
            <Box sx={{ display: 'flex', gap: 1.5, mt: 4 }}>
              <Button variant="contained" startIcon={<Save size={18} />} onClick={save} disabled={saving} sx={{ borderRadius: 2, fontWeight: 700 }}>
                {saving ? 'Saving…' : 'Save changes'}
              </Button>
              {section.test && (
                <Button variant="outlined" startIcon={<SendHorizonal size={18} />} onClick={runTest} disabled={testing} sx={{ borderRadius: 2 }}>
                  {testing ? 'Sending…' : `Send test ${section.test}`}
                </Button>
              )}
            </Box>
            )}
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default Settings;
