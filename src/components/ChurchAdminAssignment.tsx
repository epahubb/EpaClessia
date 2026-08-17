import React, { useState, useEffect } from 'react';
import {
  Box, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, Button, IconButton,
  Typography, CircularProgress, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, MenuItem,
  Alert
} from '@mui/material';
import { UserPlus, Trash2, Church } from 'lucide-react';
import { userService } from '../services/userService';
import { churchService } from '../services/churchService';
import { TenantRole, User, Tenant } from '../types';

const ChurchAdminAssignment: React.FC = () => {
  const [assignments, setAssignments] = useState<TenantRole[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [churches, setChurches] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [openDialog, setOpenDialog] = useState(false);
  const [formData, setFormData] = useState({ userId: '', tenantId: '', role: 'CHURCH_ADMIN' });
  const [error, setError] = useState('');

  const fetchData = async () => {
    setLoading(true);
    try {
      const [assignmentsData, usersData, churchesData] = await Promise.all([
        userService.getUserTenantRoles(),
        userService.getAll(),
        churchService.getAll()
      ]);
      setAssignments(Array.isArray(assignmentsData) ? assignmentsData : []);
      setUsers(Array.isArray(usersData) ? usersData.filter(u => u.role === 'CHURCH_ADMIN') : []);
      setChurches(Array.isArray(churchesData) ? churchesData : []);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleAssign = async () => {
    if (!formData.userId || !formData.tenantId) {
      setError('Please select both a user and a church');
      return;
    }
    try {
      await userService.assignChurchAdmin(formData);
      setOpenDialog(false);
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to assign admin');
    }
  };

  const handleRemove = async (id: string) => {
    if (window.confirm('Are you sure you want to remove this admin assignment?')) {
      try {
        await userService.removeChurchAdmin(id);
        fetchData();
      } catch (error) {
        console.error('Error removing assignment:', error);
      }
    }
  };

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>;

  return (
    <Box>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="subtitle1" fontWeight={700}>Church Admin Assignments</Typography>
        <Button
          variant="contained"
          startIcon={<UserPlus size={18} />}
          onClick={() => setOpenDialog(true)}
        >
          Assign Admin to Church
        </Button>
      </Box>

      <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
        <Table>
          <TableHead sx={{ bgcolor: 'action.hover' }}>
            <TableRow>
              <TableCell sx={{ fontWeight: 700 }}>Admin Name</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Church Tenant</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Role</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700 }}>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {assignments.map((assignment) => (
              <TableRow key={assignment.id} hover>
                <TableCell sx={{ fontWeight: 600 }}>{assignment.userName}</TableCell>
                <TableCell>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Church size={16} color="#2563eb" />
                    {assignment.tenantName}
                  </Box>
                </TableCell>
                <TableCell>{assignment.role}</TableCell>
                <TableCell align="right">
                  <IconButton color="error" size="small" onClick={() => handleRemove(assignment.id)}>
                    <Trash2 size={18} />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={openDialog} onClose={() => setOpenDialog(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Assign Church Admin</DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField
              select
              label="Select User"
              fullWidth
              value={formData.userId}
              onChange={(e) => setFormData({ ...formData, userId: e.target.value })}
            >
              {users.map(user => (
                <MenuItem key={user.id} value={user.id}>{user.name} ({user.email})</MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label="Select Church"
              fullWidth
              value={formData.tenantId}
              onChange={(e) => setFormData({ ...formData, tenantId: e.target.value })}
            >
              {churches.map(church => (
                <MenuItem key={church.id} value={church.id}>{church.name}</MenuItem>
              ))}
            </TextField>
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 2.5 }}>
          <Button onClick={() => setOpenDialog(false)} color="inherit">Cancel</Button>
          <Button variant="contained" onClick={handleAssign}>Assign Admin</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ChurchAdminAssignment;
