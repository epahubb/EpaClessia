import React from 'react';
import { Box, Typography, Chip } from '@mui/material';
import CrudTable from '../../components/church/CrudTable';
import churchApi from '../../services/churchApi';

const statusOpts = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'visitor', label: 'Visitor' },
];
const genderOpts = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
];
const maritalOpts = [
  { value: 'single', label: 'Single' },
  { value: 'married', label: 'Married' },
  { value: 'widowed', label: 'Widowed' },
  { value: 'divorced', label: 'Divorced' },
];

const statusColor = (s: string): any =>
  s === 'inactive' ? 'error' : s === 'visitor' ? 'info' : 'success';

export const MemberList: React.FC = () => {
  return (
    <Box>
      <Typography variant="h4" sx={{ fontWeight: 700, mb: 0.5 }}>Member Management</Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        Register members, manage profiles, family grouping and membership IDs \u2014 all stored in your church database.
      </Typography>
      <CrudTable
        idKey="id"
        columns={[
          { key: 'name', label: 'Name', render: (r: any) => `${r.firstName || ''} ${r.lastName || ''}`.trim() || '\u2014' },
          { key: 'membershipId', label: 'Member ID' },
          { key: 'email', label: 'Email' },
          { key: 'phone', label: 'Phone' },
          { key: 'membershipStatus', label: 'Status', render: (r: any) => <Chip size="small" label={r.membershipStatus || 'active'} color={statusColor(r.membershipStatus || 'active')} sx={{ textTransform: 'capitalize' }} /> },
          { key: 'occupation', label: 'Occupation' },
        ]}
        fields={[
          { name: 'firstName', label: 'First name', required: true },
          { name: 'lastName', label: 'Last name', required: true },
          { name: 'email', label: 'Email' },
          { name: 'phone', label: 'Phone' },
          { name: 'gender', label: 'Gender', type: 'select', options: genderOpts },
          { name: 'dateOfBirth', label: 'Date of birth', type: 'date' },
          { name: 'anniversaryDate', label: 'Anniversary', type: 'date' },
          { name: 'maritalStatus', label: 'Marital status', type: 'select', options: maritalOpts },
          { name: 'occupation', label: 'Occupation' },
          { name: 'membershipStatus', label: 'Status', type: 'select', options: statusOpts, defaultValue: 'active' },
          { name: 'address', label: 'Address', type: 'textarea' },
          { name: 'notes', label: 'Notes', type: 'textarea' },
        ]}
        fetchRows={() => churchApi.getMembers()}
        createRow={churchApi.createMember}
        updateRow={churchApi.updateMember}
        deleteRow={churchApi.deleteMember}
        addLabel="Add Member"
        emptyText="No members yet. Click Add Member to register your first member."
      />
    </Box>
  );
};

export default MemberList;
