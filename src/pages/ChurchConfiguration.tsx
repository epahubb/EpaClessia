import React, { useEffect, useState } from 'react';
import {
  Box, Typography, Card, CardContent, Grid, TextField, MenuItem, Button, Stack,
  Alert, CircularProgress, FormControlLabel, Switch, Tabs, Tab, Divider,
} from '@mui/material';
import { Building2, Send } from 'lucide-react';
import api from '../services/api';

/**
 * Church configuration, owned by the platform administrator.
 *
 * SMS, email, the payment gateway, integrations and backup are set up here on
 * behalf of each church rather than by the church itself. The church portal
 * shows the same sections read-only, and the church API refuses writes to
 * them, so this page is the single place they are changed.
 */

type Field = {
  key: string;
  label: string;
  type?: 'text' | 'password' | 'number' | 'bool' | 'select';
  options?: string[];
  full?: boolean;
  help?: string;
};

const SECTIONS: Array<{ key: string; label: string; description: string; fields: Field[] }> = [
  {
    key: 'sms',
    label: 'SMS',
    description: 'The SMS gateway this church sends bulk messages and absence follow-ups through.',
    fields: [
      { key: 'enabled', label: 'Enable SMS for this church', type: 'bool' },
      { key: 'provider', label: 'Provider', type: 'select', options: ['mNotify', 'Twilio', 'Other'] },
      { key: 'senderId', label: 'Sender ID', help: 'The name recipients see, e.g. the church short name.' },
      { key: 'apiKey', label: 'API key', type: 'password' },
    ],
  },
  {
    key: 'email',
    label: 'Email',
    description: 'Where this church\u2019s receipts, notices and absence questionnaires are sent from.',
    fields: [
      { key: 'apiUrl', label: 'Email API URL', full: true, help: 'The HTTP send endpoint of your email provider.' },
      { key: 'apiKey', label: 'Email API key', type: 'password' },
      { key: 'fromName', label: 'From name' },
      { key: 'fromEmail', label: 'From email' },
      { key: 'replyTo', label: 'Reply-to address' },
    ],
  },
  {
    key: 'payment',
    label: 'Payment gateway',
    description: 'Online giving and SMS bundle purchases for this church run through this gateway.',
    fields: [
      { key: 'enabled', label: 'Enable online payments', type: 'bool' },
      { key: 'provider', label: 'Provider', type: 'select', options: ['Paystack', 'Flutterwave'] },
      { key: 'currency', label: 'Currency', type: 'select', options: ['GHS', 'NGN', 'USD'] },
    ],
  },
  {
    key: 'paystack',
    label: 'Gateway keys',
    description: 'Leave these blank to use the platform keys for this church.',
    fields: [
      { key: 'enabled', label: 'Use church-specific keys', type: 'bool' },
      { key: 'publicKey', label: 'Public key', full: true },
      { key: 'secretKey', label: 'Secret key', type: 'password', full: true },
    ],
  },
  {
    key: 'integration',
    label: 'Integrations',
    description: 'Third-party services connected for this church.',
    fields: [
      { key: 'zoomApiKey', label: 'Zoom API key' },
      { key: 'googleCalendarId', label: 'Google Calendar ID' },
      { key: 'mailchimpKey', label: 'Mailchimp API key' },
      { key: 'webhookUrl', label: 'Webhook URL', full: true },
    ],
  },
  {
    key: 'backup',
    label: 'Backup & restore',
    description: 'How often this church\u2019s data is backed up.',
    fields: [
      { key: 'autoBackup', label: 'Enable automatic backups', type: 'bool' },
      { key: 'backupFrequency', label: 'Frequency', type: 'select', options: ['daily', 'weekly', 'monthly'] },
      { key: 'retentionDays', label: 'Keep backups for (days)', type: 'number' },
      { key: 'destination', label: 'Destination', full: true },
    ],
  },
];

export const ChurchConfigurationPage: React.FC = () => {
  const [churches, setChurches] = useState<any[]>([]);
  const [tenantId, setTenantId] = useState('');
  const [settings, setSettings] = useState<Record<string, any>>({});
  const [tab, setTab] = useState(0);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  useEffect(() => {
    api.get('/superadmin/churches', { params: { limit: 200 } })
      .then((r) => {
        const rows = r.data?.data || r.data?.churches || r.data || [];
        setChurches(Array.isArray(rows) ? rows : []);
      })
      .catch(() => setMsg({ type: 'error', text: 'Could not load the list of churches.' }));
  }, []);

  const loadSettings = async (id: string) => {
    if (!id) return;
    setLoading(true);
    setMsg(null);
    try {
      const r = await api.get(`/superadmin/churches/${id}/settings`);
      setSettings(r.data?.settings || {});
    } catch (e: any) {
      setMsg({ type: 'error', text: e?.friendlyMessage || 'Could not load this church\u2019s settings.' });
      setSettings({});
    } finally {
      setLoading(false);
    }
  };

  const pickChurch = (id: string) => {
    setTenantId(id);
    loadSettings(id);
  };

  const section = SECTIONS[tab];
  const values = settings[section.key] || {};

  const setValue = (key: string, value: any) => {
    setSettings((prev) => ({
      ...prev,
      [section.key]: { ...(prev[section.key] || {}), [key]: value },
    }));
  };

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const r = await api.put(`/superadmin/churches/${tenantId}/settings/${section.key}`, values);
      setMsg({ type: 'success', text: r.data?.message || 'Saved.' });
      // Re-read so masked secrets are shown exactly as stored.
      await loadSettings(tenantId);
    } catch (e: any) {
      setMsg({ type: 'error', text: e?.friendlyMessage || e?.response?.data?.error || 'Could not save these settings.' });
    } finally {
      setSaving(false);
    }
  };

  const applyToAll = async () => {
    if (!window.confirm(`Apply the platform ${section.label} settings to every church? This overwrites what each church currently has.`)) return;
    setSaving(true);
    setMsg(null);
    try {
      const r = await api.post(`/superadmin/churches/settings/apply-to-all/${section.key}`, { overwrite: true });
      setMsg({ type: 'success', text: `Applied to ${r.data?.applied || 0} of ${r.data?.churches || 0} churches.` });
      if (tenantId) await loadSettings(tenantId);
    } catch (e: any) {
      setMsg({ type: 'error', text: e?.friendlyMessage || e?.response?.data?.error || 'Could not apply these settings.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <Typography variant="h4" fontWeight={800} sx={{ letterSpacing: '-0.5px' }}>Church Configuration</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Set up SMS, email, the payment gateway, integrations and backup on behalf of each church.
        Churches can see these settings but cannot change them.
      </Typography>

      <Card variant="outlined" sx={{ mb: 3, borderRadius: 2 }}>
        <CardContent>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }}>
            <Building2 size={20} />
            <TextField
              select fullWidth label="Church" value={tenantId}
              onChange={(e) => pickChurch(e.target.value)}
              sx={{ maxWidth: 420 }}
            >
              {churches.map((c: any) => (
                <MenuItem key={c.id} value={c.id}>{c.name || c.churchName || c.id}</MenuItem>
              ))}
            </TextField>
            <Box sx={{ flex: 1 }} />
            <Button
              variant="outlined" startIcon={<Send size={16} />} onClick={applyToAll}
              disabled={saving}
            >
              Apply {section.label} to all churches
            </Button>
          </Stack>
        </CardContent>
      </Card>

      {msg && <Alert severity={msg.type} sx={{ mb: 2 }} onClose={() => setMsg(null)}>{msg.text}</Alert>}

      {!tenantId ? (
        <Alert severity="info">Choose a church to configure.</Alert>
      ) : loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
      ) : (
        <Card variant="outlined" sx={{ borderRadius: 2 }}>
          <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto">
            {SECTIONS.map((s) => <Tab key={s.key} label={s.label} sx={{ fontWeight: 600 }} />)}
          </Tabs>
          <Divider />
          <CardContent>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{section.description}</Typography>
            <Grid container spacing={2}>
              {section.fields.map((f) => (
                <Grid size={{ xs: 12, md: f.full ? 12 : 6 }} key={f.key}>
                  {f.type === 'bool' ? (
                    <FormControlLabel
                      control={<Switch checked={!!values[f.key]} onChange={(e) => setValue(f.key, e.target.checked)} />}
                      label={f.label}
                    />
                  ) : f.type === 'select' ? (
                    <TextField
                      select fullWidth label={f.label} value={values[f.key] ?? ''}
                      onChange={(e) => setValue(f.key, e.target.value)} helperText={f.help}
                    >
                      {(f.options || []).map((o) => <MenuItem key={o} value={o}>{o}</MenuItem>)}
                    </TextField>
                  ) : (
                    <TextField
                      fullWidth label={f.label}
                      type={f.type === 'number' ? 'number' : 'text'}
                      value={values[f.key] ?? ''}
                      onChange={(e) => setValue(f.key, e.target.value)}
                      helperText={f.type === 'password' ? (f.help || 'Leave the masked value untouched to keep the stored key.') : f.help}
                    />
                  )}
                </Grid>
              ))}
            </Grid>
            <Stack direction="row" justifyContent="flex-end" sx={{ mt: 3 }}>
              <Button variant="contained" onClick={save} disabled={saving} sx={{ fontWeight: 700 }}>
                {saving ? 'Saving\u2026' : `Save ${section.label} settings`}
              </Button>
            </Stack>
          </CardContent>
        </Card>
      )}
    </Box>
  );
};

export default ChurchConfigurationPage;
