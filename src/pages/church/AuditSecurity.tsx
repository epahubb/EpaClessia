import React, { useEffect, useState } from 'react';
import { Box, Typography, Tabs, Tab, Card, CardContent, List, ListItem, ListItemText, Divider, Grid, FormControlLabel, Switch, TextField, MenuItem, Button, Stack, Alert, Chip } from '@mui/material';
import churchApi from '../../services/churchApi';

const ActivityLog: React.FC = () => {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { churchApi.getActivityLog().then(setRows).catch(() => setRows([])).finally(() => setLoading(false)); }, []);
  return (
    <Card variant="outlined"><List>
      {loading && <ListItem><ListItemText primary="Loading\u2026" /></ListItem>}
      {!loading && rows.length === 0 && <ListItem><ListItemText primary="No audit records yet." secondary="Actions such as creating members, recording finances and managing users appear here." /></ListItem>}
      {rows.map((r: any, i: number) => (<React.Fragment key={r.id || i}><ListItem secondaryAction={<Chip size="small" label={r.action} />}>
        <ListItemText primary={`${r.userName || 'System'} ${r.action} ${r.entity}${r.details ? ` \u2014 ${r.details}` : ''}`} secondary={r.createdAt ? new Date(r.createdAt).toLocaleString() : ''} />
      </ListItem>{i < rows.length - 1 && <Divider />}</React.Fragment>))}
    </List></Card>
  );
};

const Security: React.FC = () => {
  const [cfg, setCfg] = useState<any>({});
  const [saved, setSaved] = useState(false);
  useEffect(() => { churchApi.getSettings().then((s: any) => setCfg(s?.backup || {})).catch(() => {}); }, []);
  const save = async () => { try { await churchApi.updateSettings('backup', cfg); setSaved(true); setTimeout(() => setSaved(false), 2500); } catch (e) { alert('Failed to save'); } };
  const sw = (k: string, label: string, desc: string) => (<Grid size={{ xs: 12, md: 6 }}><Card variant="outlined"><CardContent>
    <FormControlLabel control={<Switch checked={!!cfg[k]} onChange={e => setCfg({ ...cfg, [k]: e.target.checked })} />} label={label} />
    <Typography variant="body2" color="text.secondary">{desc}</Typography>
  </CardContent></Card></Grid>);
  return (
    <Box>
      {saved && <Alert severity="success" sx={{ mb: 2 }}>Security settings saved.</Alert>}
      <Grid container spacing={2}>
        {sw('twoFactorRequired', 'Two-Factor Authentication', 'Require a one-time code at login for all staff accounts.')}
        {sw('deviceApproval', 'Device Management', 'Require admin approval for new devices before granting access.')}
        {sw('securityAlerts', 'Security Alerts', 'Email admins about suspicious logins and permission changes.')}
        {sw('autoBackup', 'Automatic Data Backup', 'Automatically back up church data on a schedule.')}
        <Grid size={{ xs: 12, md: 6 }}><Card variant="outlined"><CardContent>
          <TextField select fullWidth label="Session timeout" value={cfg.sessionTimeout || '30'} onChange={e => setCfg({ ...cfg, sessionTimeout: e.target.value })}>
            {['15', '30', '60', '120', '480'].map(m => <MenuItem key={m} value={m}>{m} minutes</MenuItem>)}
          </TextField>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>Automatically sign out inactive sessions.</Typography>
        </CardContent></Card></Grid>
        <Grid size={{ xs: 12, md: 6 }}><Card variant="outlined"><CardContent>
          <TextField select fullWidth label="Backup frequency" value={cfg.backupFrequency || 'weekly'} onChange={e => setCfg({ ...cfg, backupFrequency: e.target.value })}>
            {[['daily', 'Daily'], ['weekly', 'Weekly'], ['monthly', 'Monthly']].map(([v, l]) => <MenuItem key={v} value={v}>{l}</MenuItem>)}
          </TextField>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>How often automatic backups run.</Typography>
        </CardContent></Card></Grid>
      </Grid>
      <Stack direction="row" justifyContent="flex-end" sx={{ mt: 2 }}><Button variant="contained" onClick={save}>Save Security Settings</Button></Stack>
    </Box>
  );
};

export const AuditSecurity: React.FC = () => {
  const [tab, setTab] = useState(0);
  return (
    <Box>
      <Typography variant="h4" fontWeight={800} gutterBottom>Audit & Security</Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>Activity logs, audit trail and account security controls.</Typography>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="Activity Log & Audit Trail" /><Tab label="Security Controls" />
      </Tabs>
      {tab === 0 ? <ActivityLog /> : <Security />}
    </Box>
  );
};

export default AuditSecurity;
