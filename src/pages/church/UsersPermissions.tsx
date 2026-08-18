import React, { useCallback, useEffect, useState } from 'react';
import {
  Box, Typography, Tabs, Tab, Grid, Card, CardContent, Chip, List, ListItem,
  ListItemText, Divider, Checkbox, FormControlLabel, Button, Alert,
  CircularProgress, Stack,
} from '@mui/material';
import CrudTable from '../../components/church/CrudTable';
import churchApi from '../../services/churchApi';

const roleOpts = [
  { value: 'CHURCH_ADMIN', label: 'Church Admin' },
  { value: 'PASTOR', label: 'Pastor' },
  { value: 'MINISTRY_LEADER', label: 'Ministry Leader' },
  { value: 'FINANCE', label: 'Finance Officer' },
  { value: 'SECRETARY', label: 'Secretary' },
  { value: 'MEMBER', label: 'Member' },
];
const statusOpts = [{ value: 'active', label: 'Active' }, { value: 'suspended', label: 'Suspended' }];

/**
 * Human labels for permission codes. The server decides which codes a church may
 * hold (platform-level ones such as billing are stripped server-side), so this
 * map only needs to cover what the catalogue actually returns.
 */
const PERMISSION_LABELS: Record<string, string> = {
  'users.manage': 'Manage users & roles',
  'members.manage': 'Manage members',
  'events.manage': 'Manage events & services',
  'giving.manage': 'Record giving',
  'finance.manage': 'Expenses, budgets & pledges',
  'attendance.manage': 'Mark attendance',
  'comms.send': 'Send SMS & announcements',
  'reports.view': 'View reports',
  'settings.manage': 'Manage church settings',
  'churches.manage': 'Manage churches (platform)',
  'billing.manage': 'Manage billing (platform)',
};

interface RoleRow { role: string; permissions: string[]; customised: boolean }

const roleLabel = (role: string) => roleOpts.find((o) => o.value === role)?.label || role;

/**
 * Per-church role editor. Every change here is scoped to this church only: the
 * server writes to a (tenantId, role) keyed table, so customising "Secretary"
 * does not touch any other church on the platform. A role that has never been
 * customised shows the platform default and is marked as such.
 */
const Roles: React.FC = () => {
  const [rows, setRows] = useState<RoleRow[]>([]);
  const [catalog, setCatalog] = useState<string[]>([]);
  const [draft, setDraft] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [busyRole, setBusyRole] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await churchApi.getRolePermissions();
      const data = res?.data || [];
      setRows(data);
      setCatalog(res?.catalog || []);
      const next: Record<string, string[]> = {};
      for (const r of data) next[r.role] = [...(r.permissions || [])];
      setDraft(next);
    } catch {
      setError('Could not load the permission matrix. Only a church admin or pastor can view it.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggle = (role: string, code: string) => {
    setDraft((prev) => {
      const current = prev[role] || [];
      const next = current.includes(code) ? current.filter((c) => c !== code) : [...current, code];
      return { ...prev, [role]: next };
    });
  };

  const dirty = (role: string) => {
    const saved = rows.find((r) => r.role === role)?.permissions || [];
    const current = draft[role] || [];
    return saved.length !== current.length || saved.some((c) => !current.includes(c));
  };

  const save = async (role: string) => {
    setBusyRole(role);
    setError('');
    setNotice('');
    try {
      await churchApi.saveRolePermissions(role, draft[role] || []);
      setNotice(`${roleLabel(role)} permissions saved for this church.`);
      await load();
    } catch {
      setError(`Could not save ${roleLabel(role)}. Only a church admin can change permissions.`);
    } finally {
      setBusyRole(null);
    }
  };

  const reset = async (role: string) => {
    setBusyRole(role);
    setError('');
    setNotice('');
    try {
      await churchApi.resetRolePermissions(role);
      setNotice(`${roleLabel(role)} reverted to the platform default.`);
      await load();
    } catch {
      setError(`Could not reset ${roleLabel(role)}.`);
    } finally {
      setBusyRole(null);
    }
  };

  if (loading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>;
  }

  return (
    <Box>
      {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{error}</Alert>}
      {notice && <Alert severity="success" sx={{ mb: 2, borderRadius: 2 }}>{notice}</Alert>}
      <Alert severity="info" sx={{ mb: 2, borderRadius: 2 }}>
        These permissions apply to your church only. Changing them here does not affect any other church.
      </Alert>
      <Grid container spacing={2}>
        {rows.map((r) => (
          <Grid size={{ xs: 12, md: 6 }} key={r.role}>
            <Card variant="outlined" sx={{ borderRadius: 3, height: '100%' }}>
              <CardContent>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                  <Chip label={roleLabel(r.role)} color="primary" />
                  <Chip
                    size="small"
                    label={r.customised ? 'Customised' : 'Platform default'}
                    color={r.customised ? 'success' : 'default'}
                  />
                </Stack>
                <Box>
                  {catalog.map((code) => (
                    <FormControlLabel
                      key={code}
                      sx={{ display: 'block' }}
                      control={(
                        <Checkbox
                          size="small"
                          checked={(draft[r.role] || []).includes(code)}
                          onChange={() => toggle(r.role, code)}
                        />
                      )}
                      label={PERMISSION_LABELS[code] || code}
                    />
                  ))}
                </Box>
                <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
                  <Button
                    variant="contained"
                    size="small"
                    disabled={busyRole === r.role || !dirty(r.role)}
                    onClick={() => save(r.role)}
                  >
                    {busyRole === r.role ? 'Saving...' : 'Save'}
                  </Button>
                  {r.customised && (
                    <Button
                      variant="text"
                      size="small"
                      disabled={busyRole === r.role}
                      onClick={() => reset(r.role)}
                    >
                      Reset to default
                    </Button>
                  )}
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
};

const LoginHistory: React.FC = () => {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => { churchApi.getActivityLog().then(setRows).catch(() => setRows([])); }, []);
  return (
    <Card variant="outlined"><List>
      {rows.length === 0 && <ListItem><ListItemText primary="No activity recorded yet." /></ListItem>}
      {rows.map((r: any, i: number) => (<React.Fragment key={r.id || i}><ListItem>
        <ListItemText primary={`${r.userName || 'System'} \u2014 ${r.action} ${r.entity}`} secondary={r.createdAt ? new Date(r.createdAt).toLocaleString() : ''} />
      </ListItem>{i < rows.length - 1 && <Divider />}</React.Fragment>))}
    </List></Card>
  );
};

export const UsersPermissions: React.FC = () => {
  const [tab, setTab] = useState(0);
  const cols: any[] = [
    { key: 'name', label: 'Name' }, { key: 'email', label: 'Email' },
    { key: 'role', label: 'Role', render: (r: any) => <Chip size="small" label={roleLabel(r.role)} /> },
    { key: 'status', label: 'Status', render: (r: any) => <Chip size="small" label={r.status || 'active'} color={r.status === 'suspended' ? 'default' : 'success'} /> },
    { key: 'lastLogin', label: 'Last login', render: (r: any) => r.lastLogin ? new Date(r.lastLogin).toLocaleString() : 'Never' },
  ];
  const fields: any[] = [
    { name: 'name', label: 'Full name', required: true },
    { name: 'email', label: 'Email', required: true },
    { name: 'role', label: 'Role', type: 'select', options: roleOpts, defaultValue: 'MEMBER', required: true },
    { name: 'phone', label: 'Phone' },
    { name: 'status', label: 'Status', type: 'select', options: statusOpts, defaultValue: 'active' },
    { name: 'password', label: 'Temporary password (new users only)' },
  ];
  return (
    <Box>
      <Typography variant="h4" fontWeight={800} gutterBottom>Users &amp; Permissions</Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>Manage staff accounts, roles, permissions and login activity.</Typography>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="User Accounts" /><Tab label="Roles &amp; Permissions" /><Tab label="Login History" />
      </Tabs>
      {tab === 0 && <CrudTable idKey="uid" columns={cols} fields={fields} fetchRows={() => churchApi.getUsers()} createRow={churchApi.createUser} updateRow={churchApi.updateUser} deleteRow={churchApi.deleteUser} addLabel="Add User" />}
      {tab === 1 && <Roles />}
      {tab === 2 && <LoginHistory />}
    </Box>
  );
};

export default UsersPermissions;
