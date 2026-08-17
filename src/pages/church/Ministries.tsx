import React, { useState } from 'react';
import { Box, Typography, Tabs, Tab, Chip } from '@mui/material';
import CrudTable from '../../components/church/CrudTable';
import churchApi from '../../services/churchApi';

const dayOpts = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map(d => ({ value: d, label: d }));
const statusOpts = [{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }];

const tabs = [
  { label: 'Ministries', type: 'ministry' },
  { label: 'Departments', type: 'department' },
  { label: 'Cell Groups', type: 'cell_group' },
];

export const Ministries: React.FC = () => {
  const [tab, setTab] = useState(0);
  const type = tabs[tab].type;
  const fields: any[] = [
    { name: 'name', label: 'Name', required: true },
    { name: 'description', label: 'Description', type: 'textarea' },
    { name: 'leaderName', label: 'Leader' },
    { name: 'meetingDay', label: 'Meeting day', type: 'select', options: dayOpts },
    { name: 'meetingTime', label: 'Meeting time' },
    { name: 'location', label: 'Location' },
    { name: 'memberCount', label: 'Members', type: 'number' },
    { name: 'status', label: 'Status', type: 'select', options: statusOpts, defaultValue: 'active' },
  ];
  const columns: any[] = [
    { key: 'name', label: 'Name' },
    { key: 'leaderName', label: 'Leader' },
    { key: 'meets', label: 'Meets', render: (r: any) => [r.meetingDay, r.meetingTime].filter(Boolean).join(' ') || '\u2014' },
    { key: 'location', label: 'Location' },
    { key: 'memberCount', label: 'Members' },
    { key: 'status', label: 'Status', render: (r: any) => <Chip size="small" label={r.status || 'active'} color={r.status === 'inactive' ? 'default' : 'success'} /> },
  ];
  return (
    <Box>
      <Typography variant="h4" fontWeight={800} gutterBottom>Ministries & Groups</Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>Manage ministries, departments, cell groups and their leaders.</Typography>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        {tabs.map(t => <Tab key={t.type} label={t.label} />)}
      </Tabs>
      <CrudTable
        key={type}
        columns={columns}
        fields={fields}
        fetchRows={() => churchApi.getMinistries({ type })}
        createRow={(d: any) => churchApi.createMinistry({ ...d, type })}
        updateRow={churchApi.updateMinistry}
        deleteRow={churchApi.deleteMinistry}
        addLabel={`Add ${tabs[tab].label.replace(/s$/, '')}`}
      />
    </Box>
  );
};

export default Ministries;
