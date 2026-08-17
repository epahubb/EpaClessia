import React, { useEffect, useState } from 'react';
import { Box, Typography, Tabs, Tab, Grid, Card, CardContent, Chip, List, ListItem, ListItemText, Divider } from '@mui/material';
import CrudTable from '../../components/church/CrudTable';
import churchApi from '../../services/churchApi';

const roleOpts = [{ value: 'CHURCH_ADMIN', label: 'Church Admin' }, { value: 'PASTOR', label: 'Pastor' }, { value: 'MINISTRY_LEADER', label: 'Ministry Leader' }, { value: 'MEMBER', label: 'Member' }];
const statusOpts = [{ value: 'active', label: 'Active' }, { value: 'suspended', label: 'Suspended' }];

const Roles: React.FC = () => {
  const [roles, setRoles] = useState<any[]>([]);
  useEffect(() => { churchApi.getRoles().then(setRoles).catch(() => setRoles([])); }, []);
  return (
    <Grid container spacing={2}>
      {roles.map((r: any) => (<Grid size={{ xs: 12, md: 6 }} key={r.role}><Card variant="outlined"><CardContent>
        <Chip label={r.label || r.role} color="primary" sx={{ mb: 1 }} />
        <List dense>{(r.permissions || []).map((p: string, i: number) => <ListItem key={i} sx={{ py: 0 }}><ListItemText primary={`\u2022 ${p}`} /></ListItem>)}</List>
      </CardContent></Card></Grid>))}
    </Grid>
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
    { key: 'role', label: 'Role', render: (r: any) => <Chip size="small" label={roleOpts.find(o => o.value === r.role)?.label || r.role} /> },
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
      <Typography variant="h4" fontWeight={800} gutterBottom>Users & Permissions</Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>Manage staff accounts, roles, permissions and login activity.</Typography>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="User Accounts" /><Tab label="Roles & Permissions" /><Tab label="Login History" />
      </Tabs>
      {tab === 0 && <CrudTable idKey="uid" columns={cols} fields={fields} fetchRows={() => churchApi.getUsers()} createRow={churchApi.createUser} updateRow={churchApi.updateUser} deleteRow={churchApi.deleteUser} addLabel="Add User" />}
      {tab === 1 && <Roles />}
      {tab === 2 && <LoginHistory />}
    </Box>
  );
};

export default UsersPermissions;
