import React, { useState, useEffect } from 'react';
import { 
  Box, Typography, Paper, Table, TableBody, TableCell, 
  TableContainer, TableHead, TableRow, Button, TextField,
  InputAdornment, Chip, Avatar, IconButton, Tooltip
} from '@mui/material';
import { Search, UserPlus, Filter, Download, MoreVertical, Eye, Edit } from 'lucide-react';
import { churchAdminService } from '../../services/churchAdminService';
import { Member } from '../../types';

const MemberManagement: React.FC = () => {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const fetchMembers = async () => {
      try {
        const data = await churchAdminService.getMembers();
        setMembers(data);
      } catch (error) {
        console.error('Error fetching members:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchMembers();
  }, []);

  const filteredMembers = members.filter(m => 
    `${m.firstName} ${m.lastName}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
    m.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <Box>
      <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography variant="h4" fontWeight={800} sx={{ letterSpacing: '-1px' }}>Members</Typography>
          <Typography variant="body1" color="text.secondary">Manage your church congregation</Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Button variant="outlined" startIcon={<Download size={18} />}>Export CSV</Button>
          <Button variant="contained" startIcon={<UserPlus size={18} />}>Add New Member</Button>
        </Box>
      </Box>

      <Paper sx={{ p: 2, borderRadius: 3, mb: 3 }}>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <TextField
            placeholder="Search members by name or email..."
            size="small"
            fullWidth
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Search size={18} color="#94a3b8" />
                </InputAdornment>
              ),
            }}
          />
          <Button variant="outlined" startIcon={<Filter size={18} />}>Filters</Button>
        </Box>
      </Paper>

      <TableContainer component={Paper} sx={{ borderRadius: 3, boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}>
        <Table>
          <TableHead sx={{ bgcolor: 'action.hover' }}>
            <TableRow>
              <TableCell sx={{ fontWeight: 700 }}>Member</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Contact</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Ministries</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Joined</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700 }}>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredMembers.map((member) => (
              <TableRow key={member.id} hover>
                <TableCell>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Avatar src={member.photoUrl} sx={{ width: 32, height: 32, bgcolor: 'primary.main' }}>
                      {member.firstName[0]}
                    </Avatar>
                    <Typography variant="body2" fontWeight={700}>{member.firstName} {member.lastName}</Typography>
                  </Box>
                </TableCell>
                <TableCell>
                  <Typography variant="body2">{member.email}</Typography>
                  <Typography variant="caption" color="text.secondary">{member.phone}</Typography>
                </TableCell>
                <TableCell>
                  <Chip 
                    label={(member.status || 'unknown').toUpperCase()} 
                    size="small" 
                    color={member.status === 'ACTIVE' ? 'success' : 'default'}
                    sx={{ fontWeight: 700, fontSize: '0.65rem' }}
                  />
                </TableCell>
                <TableCell>
                  <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                    {member.ministries.map((m, i) => (
                      <Chip key={i} label={m} size="small" variant="outlined" sx={{ fontSize: '0.6rem' }} />
                    ))}
                  </Box>
                </TableCell>
                <TableCell>
                  <Typography variant="body2">{new Date(member.createdAt).toLocaleDateString()}</Typography>
                </TableCell>
                <TableCell align="right">
                  <Tooltip title="View Profile">
                    <IconButton size="small"><Eye size={18} /></IconButton>
                  </Tooltip>
                  <Tooltip title="Edit">
                    <IconButton size="small"><Edit size={18} /></IconButton>
                  </Tooltip>
                  <IconButton size="small"><MoreVertical size={18} /></IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
};

export default MemberManagement;
