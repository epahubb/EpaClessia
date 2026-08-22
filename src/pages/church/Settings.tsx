import React, { useEffect, useState } from 'react';
import { Box, Typography, Tabs, Tab, Card, CardContent, Grid, TextField, Button, Stack, FormControlLabel, Switch, Alert, MenuItem, CircularProgress } from '@mui/material';
import CrudTable from '../../components/church/CrudTable';
import ChurchLogoCard from '../../components/church/ChurchLogoCard';
import churchApi from '../../services/churchApi';

const currencyOpts = [['GHS', 'Ghana Cedi (GHS)'], ['USD', 'US Dollar (USD)'], ['NGN', 'Nigerian Naira (NGN)'], ['EUR', 'Euro (EUR)'], ['GBP', 'Pound (GBP)']].map(([v, l]) => ({ value: v, label: l }));
const dayOpts = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map(d => ({ value: d, label: d }));

/**
 * SMS, email, the payment gateway, integrations and backup are configured by
 * the platform administrator on behalf of each church. Those sections are
 * still shown here -- a church needs to see what it is using -- but they are
 * displayed read-only, and the server refuses a write to them as well.
 */
const MANAGED_NOTICE = 'These settings are managed for your church by your platform administrator. Contact support if something here needs to change.';

const SectionForm: React.FC<{ sectionKey: string; title: string; description?: string; fields: any[]; initial: any; readOnly?: boolean }> = ({ sectionKey, title, description, fields, initial, readOnly }) => {
  const [form, setForm] = useState<any>(initial || {});
  const [saved, setSaved] = useState(false); const [saving, setSaving] = useState(false);
  useEffect(() => { setForm(initial || {}); }, [initial]);
  const save = async () => { setSaving(true); try { await churchApi.updateSettings(sectionKey, form); setSaved(true); setTimeout(() => setSaved(false), 2500); } catch (e) { alert('Failed to save'); } finally { setSaving(false); } };
  return (
    <Card variant="outlined"><CardContent>
      <Typography variant="h6" fontWeight={700}>{title}</Typography>
      {description && <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{description}</Typography>}
      {saved && <Alert severity="success" sx={{ mb: 2 }}>Saved successfully.</Alert>}
      {readOnly && <Alert severity="info" sx={{ mb: 2 }}>{MANAGED_NOTICE}</Alert>}
      <Grid container spacing={2}>
        {fields.map((f: any) => (<Grid size={{ xs: 12, md: f.full ? 12 : 6 }} key={f.name}>
          {f.type === 'switch' ? (<FormControlLabel control={<Switch checked={!!form[f.name]} disabled={readOnly} onChange={e => setForm({ ...form, [f.name]: e.target.checked })} />} label={f.label} />)
            : f.type === 'select' ? (<TextField select fullWidth label={f.label} disabled={readOnly} value={form[f.name] ?? ''} onChange={e => setForm({ ...form, [f.name]: e.target.value })}>{(f.options || []).map((o: any) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}</TextField>)
              : (<TextField fullWidth label={f.label} disabled={readOnly} type={f.type === 'textarea' ? 'text' : (f.type || 'text')} value={form[f.name] ?? ''} onChange={e => setForm({ ...form, [f.name]: e.target.value })} multiline={f.type === 'textarea'} minRows={f.type === 'textarea' ? 2 : undefined} InputLabelProps={f.type === 'date' ? { shrink: true } : undefined} />)}
        </Grid>))}
      </Grid>
      {!readOnly && (
        <Stack direction="row" justifyContent="flex-end" sx={{ mt: 2 }}><Button variant="contained" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</Button></Stack>
      )}
    </CardContent></Card>
  );
};

export const ChurchSettingsPage: React.FC = () => {
  const [tab, setTab] = useState(0);
  const [s, setS] = useState<any>(null); const [loading, setLoading] = useState(true);
  useEffect(() => { churchApi.getSettings().then(v => setS(v || {})).catch(() => setS({})).finally(() => setLoading(false)); }, []);
  if (loading || !s) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>;
  const tabs = ['Church Profile & Logo', 'Branches', 'Offices', 'Service Schedules', 'Financial Year', 'SMS', 'Email', 'Payment Gateway', 'Integration', 'Backup & Restore'];
  const g = s.general || {};
  // The server tells us which sections it manages centrally, so this page does
  // not have to keep its own copy of that list in step.
  const managed: string[] = s.managedSections || ['sms', 'email', 'payment', 'paystack', 'integration', 'backup'];
  const locked = (key: string) => managed.includes(key);
  return (
    <Box>
      <Typography variant="h4" fontWeight={800} gutterBottom>Church Settings</Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>Configure your church account, branches, schedules, finance year and integrations.</Typography>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto" sx={{ mb: 2 }}>
        {tabs.map(t => <Tab key={t} label={t} />)}
      </Tabs>
      {tab === 0 && (<Stack spacing={2}>
        <ChurchLogoCard churchName={g.churchName} />
        <SectionForm sectionKey="general" title="Church Profile" description="Basic information about your church." initial={g}
          fields={[
            { name: 'churchName', label: 'Church name' },
            { name: 'phone', label: 'Phone' },
            { name: 'email', label: 'Email' },
            { name: 'website', label: 'Website' },
            { name: 'currency', label: 'Default currency', type: 'select', options: currencyOpts },
            { name: 'timezone', label: 'Timezone' },
            { name: 'address', label: 'Address', type: 'textarea', full: true },
          ]} />
      </Stack>)}
      {tab === 1 && <CrudTable columns={[{ key: 'name', label: 'Branch' }, { key: 'location', label: 'Location' }, { key: 'pastorName', label: 'Pastor' }, { key: 'phone', label: 'Phone' }, { key: 'memberCount', label: 'Members' }]} fields={[{ name: 'name', label: 'Branch name', required: true }, { name: 'location', label: 'Location' }, { name: 'pastorName', label: 'Pastor / Overseer' }, { name: 'phone', label: 'Phone' }, { name: 'email', label: 'Email' }, { name: 'memberCount', label: 'Members', type: 'number' }, { name: 'isMain', label: 'Main branch', type: 'checkbox' }]} fetchRows={() => churchApi.getBranches()} createRow={churchApi.createBranch} updateRow={churchApi.updateBranch} deleteRow={churchApi.deleteBranch} addLabel="Add Branch" />}
      {tab === 2 && (<Stack spacing={2}>
        <Card variant="outlined"><CardContent>
          <Typography fontWeight={700} gutterBottom>Offices</Typography>
          <Typography variant="body2" color="text.secondary">
            Spell out the offices your church recognises — Elder, Deacon, Usher, Choir Master, and so on.
            These appear as a searchable list when registering a member, so every office is recorded the same way.
            An office nobody holds can be deleted; one that is already assigned should be marked inactive instead,
            which keeps it on existing members without offering it for new ones.
          </Typography>
        </CardContent></Card>
        <CrudTable
          columns={[
            { key: 'name', label: 'Office' },
            { key: 'description', label: 'Description' },
            { key: 'sortOrder', label: 'Order' },
            { key: 'active', label: 'Active', render: (r: any) => (r.active === false ? 'No' : 'Yes') },
          ]}
          fields={[
            { name: 'name', label: 'Office name', required: true, helperText: 'For example: Elder, Deacon, Usher, Choir Master.' },
            { name: 'description', label: 'Description', type: 'textarea' },
            { name: 'sortOrder', label: 'Display order', type: 'number', helperText: 'Lower numbers appear first.' },
            { name: 'active', label: 'Active', type: 'checkbox', defaultValue: true },
          ]}
          fetchRows={() => churchApi.getOffices()}
          createRow={churchApi.createOffice}
          updateRow={churchApi.updateOffice}
          deleteRow={churchApi.deleteOffice}
          addLabel="Add Office"
          emptyText="No offices yet. Add the offices your church recognises so they can be assigned to members."
        />
      </Stack>)}
      {tab === 3 && <CrudTable columns={[{ key: 'name', label: 'Service' }, { key: 'dayOfWeek', label: 'Day' }, { key: 'startTime', label: 'Start' }, { key: 'endTime', label: 'End' }, { key: 'location', label: 'Location' }]} fields={[{ name: 'name', label: 'Service name', required: true }, { name: 'dayOfWeek', label: 'Day', type: 'select', options: dayOpts }, { name: 'startTime', label: 'Start time' }, { name: 'endTime', label: 'End time' }, { name: 'location', label: 'Location' }]} fetchRows={() => churchApi.getSchedules()} createRow={churchApi.createSchedule} updateRow={churchApi.updateSchedule} deleteRow={churchApi.deleteSchedule} addLabel="Add Service Schedule" />}
      {tab === 4 && <SectionForm sectionKey="financial" title="Financial Year" description="Define your church's fiscal year and reporting currency." initial={s.financial || {}} fields={[{ name: 'fiscalYearStart', label: 'Fiscal year start', type: 'date' }, { name: 'fiscalYearEnd', label: 'Fiscal year end', type: 'date' }, { name: 'currency', label: 'Reporting currency', type: 'select', options: currencyOpts }]} />}
      {tab === 5 && <SectionForm sectionKey="sms" title="SMS Settings" description="Configure your SMS gateway for bulk messaging (e.g. mNotify)." initial={s.sms || {}} readOnly={locked('sms')} fields={[{ name: 'enabled', label: 'Enable SMS', type: 'switch' }, { name: 'provider', label: 'Provider' }, { name: 'senderId', label: 'Sender ID' }, { name: 'apiKey', label: 'API key' }]} />}
      {tab === 6 && <SectionForm sectionKey="email" title="Email Settings" description="SMTP configuration for sending emails and receipts." initial={s.email || {}} readOnly={locked('email')} fields={[{ name: 'provider', label: 'Provider' }, { name: 'host', label: 'SMTP host' }, { name: 'port', label: 'SMTP port' }, { name: 'username', label: 'Username' }, { name: 'password', label: 'Password' }, { name: 'fromName', label: 'From name' }, { name: 'fromEmail', label: 'From email' }]} />}
      {tab === 7 && (<Stack spacing={2}>
        <SectionForm sectionKey="payment" title="Payment Gateway" description="Configure online giving." initial={s.payment || {}} readOnly={locked('payment')} fields={[{ name: 'enableOnlineGiving', label: 'Enable online giving', type: 'switch' }, { name: 'provider', label: 'Provider', type: 'select', options: [{ value: 'paystack', label: 'Paystack' }, { value: 'flutterwave', label: 'Flutterwave' }, { value: 'stripe', label: 'Stripe' }] }, { name: 'currency', label: 'Currency', type: 'select', options: currencyOpts }]} />
        <SectionForm sectionKey="paystack" title="Paystack Keys" description="Your Paystack API keys (kept private to your church)." initial={s.paystack || {}} readOnly={locked('paystack')} fields={[{ name: 'enabled', label: 'Enable Paystack', type: 'switch' }, { name: 'publicKey', label: 'Public key' }, { name: 'secretKey', label: 'Secret key' }]} />
      </Stack>)}
      {tab === 8 && <SectionForm sectionKey="integration" title="Integrations" description="Connect third-party services." initial={s.integration || {}} readOnly={locked('integration')} fields={[{ name: 'zoomApiKey', label: 'Zoom API key' }, { name: 'googleCalendarId', label: 'Google Calendar ID' }, { name: 'mailchimpKey', label: 'Mailchimp API key' }, { name: 'webhookUrl', label: 'Webhook URL', full: true }]} />}
      {tab === 9 && (<Stack spacing={2}>
        <SectionForm sectionKey="backup" title="Backup & Restore" description="Automatic backup schedule and data safety controls." initial={s.backup || {}} readOnly={locked('backup')} fields={[{ name: 'autoBackup', label: 'Enable automatic backups', type: 'switch' }, { name: 'backupFrequency', label: 'Backup frequency', type: 'select', options: [{ value: 'daily', label: 'Daily' }, { value: 'weekly', label: 'Weekly' }, { value: 'monthly', label: 'Monthly' }] }]} />
        <Card variant="outlined"><CardContent>
          <Typography fontWeight={700} gutterBottom>Manual Backup</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Download a snapshot of your current church configuration.</Typography>
          <Button variant="outlined" onClick={() => { const blob = new Blob([JSON.stringify(s, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `church-settings-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click(); URL.revokeObjectURL(url); }}>Download Settings Backup</Button>
        </CardContent></Card>
      </Stack>)}
    </Box>
  );
};

export default ChurchSettingsPage;
