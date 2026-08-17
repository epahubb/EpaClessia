import React, { useState } from 'react';
import { Box, Typography, Chip, Button, Avatar } from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import CrudTable from '../../components/church/CrudTable';
import MemberImportModal from '../../components/church/MemberImportModal';
import useAuthedImage from '../../hooks/useAuthedImage';
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

/**
 * Member photos live behind an authenticated endpoint, so they are fetched with
 * the auth client rather than set directly as an <img> source. The list only
 * requests a photo for members who actually have one (`hasPhoto`), and the
 * endpoint sends caching headers so re-renders do not refetch.
 */
const MemberAvatar: React.FC<{ row: any }> = ({ row }) => {
  const { url } = useAuthedImage(row?.hasPhoto ? `/church/members/${row.id}/photo` : null);
  return (
    <Avatar src={url || undefined} sx={{ width: 32, height: 32, fontSize: 14 }}>
      {(row?.firstName || '?').charAt(0).toUpperCase()}
    </Avatar>
  );
};

export const MemberList: React.FC = () => {
  const [importOpen, setImportOpen] = useState(false);

  return (
    <Box>
      <Typography variant="h4" sx={{ fontWeight: 700, mb: 0.5 }}>Member Management</Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        Register members, manage profiles, family grouping and membership IDs — all stored in your church database.
      </Typography>
      <CrudTable
        idKey="id"
        columns={[
          { key: 'photo', label: '', render: (r: any) => <MemberAvatar row={r} /> },
          { key: 'name', label: 'Name', render: (r: any) => `${r.firstName || ''} ${r.lastName || ''}`.trim() || '—' },
          { key: 'membershipId', label: 'Member ID' },
          { key: 'email', label: 'Email' },
          { key: 'phone', label: 'Phone' },
          { key: 'membershipStatus', label: 'Status', render: (r: any) => <Chip size="small" label={r.membershipStatus || 'active'} color={statusColor(r.membershipStatus || 'active')} sx={{ textTransform: 'capitalize' }} /> },
          { key: 'occupation', label: 'Occupation' },
        ]}
        fields={[
          {
            name: 'photo',
            label: 'Profile picture',
            type: 'image',
            imageVariant: 'avatar',
            imagePath: (row: any) => (row?.hasPhoto ? `/church/members/${row.id}/photo` : null),
          },
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
        toolbarActions={(reload) => (
          <>
            <Button variant="outlined" startIcon={<UploadFileIcon />} onClick={() => setImportOpen(true)}>
              Import from Excel
            </Button>
            <MemberImportModal
              open={importOpen}
              onClose={() => setImportOpen(false)}
              onImported={() => { void reload(); }}
            />
          </>
        )}
      />
    </Box>
  );
};

export default MemberList;
