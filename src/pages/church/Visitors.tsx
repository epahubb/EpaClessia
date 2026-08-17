import React, { useState } from 'react';
import { Box, Typography, Tabs, Tab, Chip, Button } from '@mui/material';
import { CheckCircle } from '@mui/icons-material';
import CrudTable from '../../components/church/CrudTable';
import churchApi from '../../services/churchApi';

const visitorFields: any[] = [
  { name: 'firstName', label: 'First name', required: true },
  { name: 'lastName', label: 'Last name' },
  { name: 'phone', label: 'Phone' },
  { name: 'email', label: 'Email' },
  { name: 'gender', label: 'Gender', type: 'select', options: [{ value: 'Male', label: 'Male' }, { value: 'Female', label: 'Female' }] },
  { name: 'invitedBy', label: 'Invited by' },
  { name: 'serviceAttended', label: 'Service attended' },
  { name: 'howHeard', label: 'How they heard about us' },
  { name: 'isFirstTime', label: 'First-time visitor', type: 'checkbox', defaultValue: true },
  { name: 'followUpStatus', label: 'Follow-up status', type: 'select', options: [{ value: 'pending', label: 'Pending' }, { value: 'contacted', label: 'Contacted' }, { value: 'converted', label: 'Converted' }] },
  { name: 'notes', label: 'Notes', type: 'textarea' },
];
const columns: any[] = [
  { key: 'firstName', label: 'Name', render: (r: any) => `${r.firstName} ${r.lastName || ''}` },
  { key: 'phone', label: 'Phone' },
  { key: 'serviceAttended', label: 'Service' },
  { key: 'isFirstTime', label: 'Type', render: (r: any) => <Chip size="small" label={r.isFirstTime ? 'First-time' : 'Returning'} color={r.isFirstTime ? 'info' : 'default'} /> },
  { key: 'followUpStatus', label: 'Follow-up', render: (r: any) => <Chip size="small" label={r.followUpStatus || 'pending'} color={r.followUpStatus === 'converted' ? 'success' : r.followUpStatus === 'contacted' ? 'warning' : 'default'} /> },
];

export const Visitors: React.FC = () => {
  const [tab, setTab] = useState(0);
  const typeFor = tab === 1 ? 'first_time' : tab === 2 ? 'returning' : 'all';
  return (
    <Box>
      <Typography variant="h4" fontWeight={800} gutterBottom>Visitor Management</Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>Register visitors, track first-time and returning guests, and convert them into members.</Typography>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="All Visitors" /><Tab label="First-time" /><Tab label="Returning" />
      </Tabs>
      <CrudTable
        key={typeFor}
        columns={columns}
        fields={visitorFields}
        fetchRows={() => churchApi.getVisitors(typeFor === 'all' ? {} : { type: typeFor })}
        createRow={churchApi.createVisitor}
        updateRow={churchApi.updateVisitor}
        deleteRow={churchApi.deleteVisitor}
        addLabel="Register Visitor"
        rowActions={(row: any, reload: () => void) => row.followUpStatus !== 'converted' ? (
          <Button size="small" startIcon={<CheckCircle />} onClick={async () => { if (window.confirm('Convert this visitor into a member?')) { try { await churchApi.convertVisitor(row.id); reload(); } catch (e) { alert('Failed to convert'); } } }}>Convert</Button>
        ) : null}
      />
    </Box>
  );
};

export default Visitors;
