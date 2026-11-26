import GroupLeaderPortal from '../group/GroupLeaderPortal';
import { Drawer, Stack } from '@mui/material';
import React, { useState, useEffect } from 'react';
import { Box, Typography, Tabs, Tab, Chip } from '@mui/material';
import CrudTable from '../../components/church/CrudTable';
import MinistryDetailPanel from '../../components/church/MinistryDetailPanel';
import UnitMembersDialog from '../../components/church/UnitMembersDialog';
import { Button } from '@mui/material';
import churchApi from '../../services/churchApi';

const dayOpts = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map(d => ({ value: d, label: d }));
const statusOpts = [{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }];

const tabs = [
  { label: 'Ministries', type: 'ministry' },
  { label: 'Departments', type: 'department' },
  { label: 'Groups', type: 'group' },
  { label: 'Legacy cell ministries', type: 'cell_group' },
];

export const Ministries: React.FC = () => {
  const [selected, setSelected] = useState<any>(null);
  const [selectedGroup, setSelectedGroup] = useState<any>(null);
  const [membersFor, setMembersFor] = useState<{ type: 'ministry' | 'department' | 'group'; unit: any } | null>(null);
  const [leaders, setLeaders] = useState<any[]>([]);
  const loadLeaders = () => { churchApi.getUsers().then(rows => setLeaders(rows.filter((u: any) => ['MEMBER','GROUP_LEADER'].includes(u.role) && u.status === 'active').map((u: any) => ({ value: u.uid, label: u.name || u.email })))).catch(() => {}); };
  useEffect(loadLeaders, []);
  const groupFields: any[] = [{ name: 'name', label: 'Group name', required: true }, { name: 'description', label: 'Description', type: 'textarea' }, { name: 'leaderId', label: 'Group leader account', type: 'select', options: [{ value: '', label: 'Unassigned' }, ...leaders], helperText: 'Choosing a member account grants its assigned-group leader portal. A descriptive position or name alone does not grant access.' }, { name: 'meetingDays', label: 'Meeting days', type: 'multiselect', options: dayOpts }, { name: 'meetingTime', label: 'Meeting time' }, { name: 'location', label: 'Location' }, { name: 'active', label: 'Active', type: 'checkbox', defaultValue: true }];
  const [tab, setTab] = useState(0);
  const type = tabs[tab].type;
  const fields: any[] = [
    { name: 'name', label: 'Name', required: true },
    { name: 'description', label: 'Description', type: 'textarea' },
    { name: 'leaderName', label: 'Leader' },
    { name: 'meetingDay', label: 'Meeting day', type: 'select', options: dayOpts },
    { name: 'meetingTime', label: 'Meeting time' },
    { name: 'location', label: 'Location' },
    { name: 'status', label: 'Status', type: 'select', options: statusOpts, defaultValue: 'active' },
  ];
  const columns: any[] = [
    { key: 'name', label: 'Name', render: (r: any) => <Button sx={{ textTransform: 'none', justifyContent: 'flex-start' }} onClick={() => setSelected(r)}>{r.name}</Button> },
    { key: 'leaderName', label: 'Leader' },
    { key: 'meets', label: 'Meets', render: (r: any) => [r.meetingDay, r.meetingTime].filter(Boolean).join(' ') || '—' },
    { key: 'location', label: 'Location' },
    { key: 'memberCount', label: 'Members', render: (r: any) => <Box><Typography variant="body2" fontWeight={700}>{r.memberCount || 0}</Typography>{Array.isArray(r.memberNames) && r.memberNames.length > 0 && <Typography variant="caption" color="text.secondary">{r.memberNames.slice(0, 3).join(', ')}{r.memberNames.length > 3 ? '…' : ''}</Typography>}</Box> },
    { key: 'status', label: 'Status', render: (r: any) => <Chip size="small" label={r.status || 'active'} color={r.status === 'inactive' ? 'default' : 'success'} /> },
  ];
  return (
    <Box>
      <Typography variant="h4" fontWeight={800} gutterBottom>Ministries & Groups</Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>Manage ministries, departments, cell groups and their leaders.</Typography>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto" sx={{ mb: 2 }}>
        {tabs.map(t => <Tab key={t.type} label={t.label} />)}
      </Tabs>
      {tab === 2 ? <CrudTable key="groups" columns={[
        { key: 'name', label: 'Group', render: r => <Button onClick={() => setSelectedGroup(r)}>{r.name}</Button> },
        { key: 'leaderName', label: 'Leader' },
        {
          key: 'memberCount',
          label: 'Members',
          render: (r: any) => (
            <Box>
              <Typography variant="body2" fontWeight={700}>{r.memberCount || 0}</Typography>
              {Array.isArray(r.memberNames) && r.memberNames.length > 0 && (
                <Typography variant="caption" color="text.secondary">
                  {r.memberNames.slice(0, 3).join(', ')}{r.memberNames.length > 3 ? '…' : ''}
                </Typography>
              )}
            </Box>
          ),
        },
        { key: 'meetingDays', label: 'Meeting days', render: r => r.meetingDays?.join(', ') || '—' },
      ]} fields={groupFields} fetchRows={churchApi.getGroups} createRow={churchApi.createGroup} updateRow={churchApi.updateGroup} deleteRow={churchApi.deleteGroup} onDialogOpen={loadLeaders} addLabel="Add Group" rowActions={r => <Stack direction="row" gap={0.5} flexWrap="wrap"><Button onClick={() => setSelectedGroup(r)}>Details</Button><Button onClick={() => setMembersFor({ type: 'group', unit: r })}>Members</Button></Stack>} /> : <CrudTable
        key={type}
        columns={columns}
        fields={fields}
        fetchRows={() => churchApi.getMinistries({ type })}
        createRow={(d: any) => churchApi.createMinistry({ ...d, type })}
        updateRow={churchApi.updateMinistry}
        deleteRow={churchApi.deleteMinistry}
        addLabel={['Add Ministry', 'Add Department', 'Add Group', 'Add Cell Ministry'][tab]}
        rowActions={r => <Stack direction="row" gap={0.5} flexWrap="wrap"><Button onClick={() => setSelected(r)}>Details</Button><Button onClick={() => setMembersFor({ type: type === 'department' ? 'department' : 'ministry', unit: r })}>Members</Button></Stack>}
      />}
      <Drawer anchor="right" open={!!selectedGroup} onClose={() => setSelectedGroup(null)} sx={{ zIndex: theme => theme.zIndex.modal, '& .MuiDrawer-paper': { width: { xs: '100%', md: 920 }, maxWidth: '100vw', p: 2 } }}><Stack gap={2}><Button onClick={() => setSelectedGroup(null)}>Close group details</Button>{selectedGroup && <GroupLeaderPortal key={selectedGroup.id} initialGroupId={selectedGroup.id} />}</Stack></Drawer>
      <MinistryDetailPanel ministry={selected} onClose={() => setSelected(null)} />
      {membersFor && (
        <UnitMembersDialog
          open
          unitType={membersFor.type}
          unit={membersFor.unit}
          onClose={() => setMembersFor(null)}
          onChanged={() => undefined}
        />
      )}
    </Box>
  );
};

export default Ministries;
