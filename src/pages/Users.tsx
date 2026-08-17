import React, { useState, useEffect, useMemo } from 'react';
import {
  Box, Typography, Paper, Grid, Button, TextField, InputAdornment, Tabs, Tab,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Chip,
  IconButton, Menu, MenuItem, Avatar, CircularProgress, Tooltip, Skeleton,
  Dialog, DialogTitle, DialogContent, DialogActions, DialogContentText, Alert,
} from '@mui/material';
import {
  Search, UserPlus, MoreVertical, Shield, User, UserCheck, Key, Lock, Unlock,
  Trash2, Users as UsersIcon, RefreshCw, ShieldCheck, Ban,
} from 'lucide-react';
import { userService } from '../services/userService';
import UserForm from '../components/UserForm';
import LoginLogs from '../components/LoginLogs';
import ChurchAdminAssignment from '../components/ChurchAdminAssignment';
import RolesPermissions from '../components/RolesPermissions';

interface StatCardProps { icon: React.ReactNode; label: string; value: number | string; color: string; }
const StatCard: React.FC<StatCardProps> = ({ icon, label, value, color }) => (
  <Paper sx={{ p: 2.5, borderRadius: 3, border: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 2 }}>
    <Box sx={{ width: 48, height: 48, borderRadius: 2.5, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: `${color}18`, color }}>
      {icon}
    </Box>
    <Box>
      <Typography variant="h5" fontWeight={800} sx={{ lineHeight: 1 }}>{value}</Typography>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
    </Box>
  </Paper>
);

const Users: React.FC = () => {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tabValue, setTabValue] = useState(0);

  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [menuUser, setMenuUser] = useState<any | null>(null);
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  const [openForm, setOpenForm] = useState(false);
  const [resetInfo, setResetInfo] = useState<{ name: string; password: string } | null>(null);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const data = await userService.getAll();
      setUsers(Array.isArray(data) ? data : data?.data || []);
    } catch (e) {
      console.error('Failed to load users', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, []);

  const handleMenuOpen = (e: React.MouseEvent<HTMLElement>, user: any) => {
    setAnchorEl(e.currentTarget);
    setMenuUser(user);
  };
  const handleMenuClose = () => setAnchorEl(null);

  const handleCreateSuperAdmin = async (data: any) => {
    await userService.createSuperAdmin(data);
    setOpenForm(false);
    fetchUsers();
  };
  const handleUpdateUser = async (data: any) => {
    if (!selectedUser) return;
    await userService.update(selectedUser.id, data);
    setOpenForm(false);
    fetchUsers();
  };
  const handleResetPassword = async () => {
    if (!menuUser) return;
    const target = menuUser;
    handleMenuClose();
    try {
      const result = await userService.resetPassword(target.id, {});
      // The backend returns a one-time temporary password to share securely.
      if (result?.temporaryPassword) {
        setResetInfo({ name: target.name || target.email, password: result.temporaryPassword });
      }
      fetchUsers();
    } catch (e) { console.error(e); }
  };
  const handleLockUnlock = async () => {
    if (!menuUser) return;
    handleMenuClose();
    try {
      if (menuUser.status === 'active') await userService.lock(menuUser.id);
      else await userService.unlock(menuUser.id);
      fetchUsers();
    } catch (e) { console.error(e); }
  };
  const handleDelete = async () => {
    if (!menuUser) return;
    handleMenuClose();
    if (!window.confirm(`Delete ${menuUser.name}? This cannot be undone.`)) return;
    try { await userService.delete(menuUser.id); fetchUsers(); } catch (e) { console.error(e); }
  };

  const filteredUsers = useMemo(() => {
    const q = search.toLowerCase();
    return users.filter((u) =>
      (u.name || '').toLowerCase().includes(q) ||
      (u.email || '').toLowerCase().includes(q) ||
      (u.role || '').toLowerCase().includes(q));
  }, [users, search]);

  const stats = useMemo(() => ({
    total: users.length,
    superAdmins: users.filter((u) => u.role === 'SUPER_ADMIN').length,
    active: users.filter((u) => u.status === 'active').length,
    locked: users.filter((u) => u.status && u.status !== 'active').length,
  }), [users]);

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', mb: 3, gap: 2 }}>
        <Box>
          <Typography variant="h4" fontWeight={800} sx={{ letterSpacing: '-0.5px' }}>User & Access Control</Typography>
          <Typography variant="body2" color="text.secondary">Manage platform users, church admins, sign-in activity, and role permissions.</Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1.5 }}>
          <Button variant="outlined" startIcon={<RefreshCw size={18} />} onClick={fetchUsers} sx={{ borderRadius: 2 }}>Refresh</Button>
          <Button variant="contained" startIcon={<UserPlus size={18} />} onClick={() => { setSelectedUser(null); setOpenForm(true); }} sx={{ borderRadius: 2, fontWeight: 700 }}>New Super Admin</Button>
        </Box>
      </Box>

      <Grid container spacing={2.5} sx={{ mb: 3 }}>
        <Grid size={{ xs: 6, md: 3 }}><StatCard icon={<UsersIcon size={22} />} label="Total users" value={stats.total} color="#2563eb" /></Grid>
        <Grid size={{ xs: 6, md: 3 }}><StatCard icon={<ShieldCheck size={22} />} label="Super admins" value={stats.superAdmins} color="#7c3aed" /></Grid>
        <Grid size={{ xs: 6, md: 3 }}><StatCard icon={<UserCheck size={22} />} label="Active" value={stats.active} color="#16a34a" /></Grid>
        <Grid size={{ xs: 6, md: 3 }}><StatCard icon={<Ban size={22} />} label="Locked" value={stats.locked} color="#dc2626" /></Grid>
      </Grid>

      <Paper sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
        <Tabs value={tabValue} onChange={(_, v) => setTabValue(v)} sx={{ px: 2, borderBottom: '1px solid', borderColor: 'divider' }} variant="scrollable">
          <Tab label="User Management" sx={{ fontWeight: 700, minHeight: 56 }} />
          <Tab label="Church Admins" sx={{ fontWeight: 700, minHeight: 56 }} />
          <Tab label="Login Logs" sx={{ fontWeight: 700, minHeight: 56 }} />
          <Tab label="Roles & Permissions" sx={{ fontWeight: 700, minHeight: 56 }} />
        </Tabs>

        <Box sx={{ p: { xs: 2, md: 3 } }}>
          {tabValue === 0 && (
            <>
              <TextField
                size="small" placeholder="Search by name, email, or role" value={search}
                onChange={(e) => setSearch(e.target.value)} sx={{ mb: 2, maxWidth: 380, width: '100%' }}
                InputProps={{ startAdornment: <InputAdornment position="start"><Search size={16} /></InputAdornment> }}
              />
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700 }}>User</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Role</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Scope</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Last login</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {loading ? (
                      [...Array(4)].map((_, i) => (
                        <TableRow key={i}>
                          <TableCell colSpan={6}><Skeleton height={40} /></TableCell>
                        </TableRow>
                      ))
                    ) : filteredUsers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} align="center" sx={{ py: 6 }}>
                          <Typography color="text.secondary">No users found.</Typography>
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredUsers.map((user) => (
                        <TableRow key={user.id} hover>
                          <TableCell>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                              <Avatar sx={{ width: 36, height: 36, bgcolor: user.role === 'SUPER_ADMIN' ? 'primary.main' : 'secondary.main', fontWeight: 700 }}>
                                {(user.name || '?')[0]}
                              </Avatar>
                              <Box>
                                <Typography variant="body2" fontWeight={700}>{user.name}</Typography>
                                <Typography variant="caption" color="text.secondary">{user.email}</Typography>
                              </Box>
                            </Box>
                          </TableCell>
                          <TableCell>
                            <Chip
                              icon={user.role === 'SUPER_ADMIN' ? <Shield size={14} /> : <User size={14} />}
                              label={(user.role || '').replace(/_/g, ' ')} size="small"
                              variant={user.role === 'SUPER_ADMIN' ? 'filled' : 'outlined'}
                              color={user.role === 'SUPER_ADMIN' ? 'primary' : 'default'}
                              sx={{ fontWeight: 700, fontSize: '0.65rem' }}
                            />
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" color="text.secondary">{user.churchName || (user.tenantId ? 'Church' : 'Platform')}</Typography>
                          </TableCell>
                          <TableCell>
                            <Chip label={(user.status || 'unknown').toUpperCase()} size="small"
                              color={user.status === 'active' ? 'success' : 'error'} sx={{ fontWeight: 700, fontSize: '0.6rem' }} />
                          </TableCell>
                          <TableCell>
                            <Typography variant="caption" color="text.secondary">{user.lastLogin ? new Date(user.lastLogin).toLocaleString() : 'Never'}</Typography>
                          </TableCell>
                          <TableCell align="right">
                            <IconButton size="small" onClick={(e) => handleMenuOpen(e, user)}><MoreVertical size={18} /></IconButton>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </>
          )}

          {tabValue === 1 && <ChurchAdminAssignment />}
          {tabValue === 2 && <LoginLogs />}
          {tabValue === 3 && <RolesPermissions />}
        </Box>
      </Paper>

      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={handleMenuClose}
        PaperProps={{ sx: { width: 210, boxShadow: '0 4px 20px rgba(0,0,0,0.12)', borderRadius: 2 } }}>
        <MenuItem onClick={() => { setSelectedUser(menuUser); setOpenForm(true); handleMenuClose(); }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}><UserCheck size={16} /> Edit Details</Box>
        </MenuItem>
        <MenuItem onClick={handleResetPassword}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}><Key size={16} /> Reset Password</Box>
        </MenuItem>
        <MenuItem onClick={handleLockUnlock}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, color: menuUser?.status === 'active' ? 'error.main' : 'success.main' }}>
            {menuUser?.status === 'active' ? <Lock size={16} /> : <Unlock size={16} />}
            {menuUser?.status === 'active' ? 'Lock Account' : 'Unlock Account'}
          </Box>
        </MenuItem>
        <MenuItem onClick={handleDelete} sx={{ color: 'error.main' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}><Trash2 size={16} /> Delete User</Box>
        </MenuItem>
      </Menu>

      <UserForm open={openForm} onClose={() => setOpenForm(false)} user={selectedUser}
        onSubmit={selectedUser ? handleUpdateUser : handleCreateSuperAdmin} />

      <Dialog open={Boolean(resetInfo)} onClose={() => setResetInfo(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Password reset</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            A temporary password has been generated for <strong>{resetInfo?.name}</strong>. Share it
            securely — it is shown only once and the user should change it after signing in.
          </DialogContentText>
          <Alert severity="info" sx={{ fontFamily: 'monospace', fontSize: '1.05rem', fontWeight: 700, letterSpacing: 0.5 }}>
            {resetInfo?.password}
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { if (resetInfo?.password) navigator.clipboard?.writeText(resetInfo.password); }}>Copy</Button>
          <Button variant="contained" onClick={() => setResetInfo(null)}>Done</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Users;
