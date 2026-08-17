import React, { useState, useEffect, useMemo } from 'react';
import {
  Box, Typography, Paper, Grid, Card, CardContent, Chip, CircularProgress,
  Divider, FormControlLabel, Checkbox, Button, Alert, Snackbar, Tabs, Tab,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, MenuItem,
  TextField, IconButton, Tooltip,
} from '@mui/material';
import { Shield, Save, RefreshCw, UserCog } from 'lucide-react';
import { roleService } from '../services/roleService';
import { userService } from '../services/userService';

interface PermissionDef { id: string; name: string; code: string; description: string; }

const ROLE_ORDER = ['SUPER_ADMIN', 'CHURCH_ADMIN', 'PASTOR', 'MINISTRY_LEADER', 'MEMBER'];

const RolesPermissions: React.FC = () => {
  const [tab, setTab] = useState(0);
  const [catalog, setCatalog] = useState<PermissionDef[]>([]);
  const [rolePerms, setRolePerms] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  // Per-user override editor
  const [users, setUsers] = useState<any[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [cat, roles] = await Promise.all([
        roleService.getPermissionsCatalog().catch(() => []),
        roleService.getRolePermissions().catch(() => []),
      ]);
      const catArr: PermissionDef[] = Array.isArray(cat) ? cat : (cat?.data || []);
      setCatalog(catArr);

      // roles may come back as [{ role, permissions: Permission[] | string[] }]
      const map: Record<string, string[]> = {};
      (Array.isArray(roles) ? roles : []).forEach((r: any) => {
        const codes = (r.permissions || []).map((p: any) => (typeof p === 'string' ? p : p.code));
        map[r.role] = codes;
      });
      setRolePerms(map);
    } catch (e) {
      console.error('Failed to load roles/permissions', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const loadUsers = async () => {
    setUsersLoading(true);
    try {
      const data = await userService.getAll();
      const list = Array.isArray(data) ? data : data?.data || [];
      // Focus on church-scoped users (those with a tenant)
      setUsers(list.filter((u: any) => u.tenantId && u.role !== 'SUPER_ADMIN'));
    } catch (e) {
      console.error(e);
    } finally {
      setUsersLoading(false);
    }
  };

  useEffect(() => { if (tab === 1 && users.length === 0) loadUsers(); /* eslint-disable-next-line */ }, [tab]);

  const roles = useMemo(() => {
    const known = ROLE_ORDER.filter((r) => rolePerms[r] !== undefined);
    const extra = Object.keys(rolePerms).filter((r) => !ROLE_ORDER.includes(r));
    return [...known, ...extra];
  }, [rolePerms]);

  const toggle = (role: string, code: string) => {
    setRolePerms((prev) => {
      const current = new Set(prev[role] || []);
      if (current.has(code)) current.delete(code); else current.add(code);
      return { ...prev, [role]: Array.from(current) };
    });
  };

  const saveRole = async (role: string) => {
    setSaving(role);
    try {
      await roleService.updateRolePermissions(role, rolePerms[role] || []);
      setToast({ type: 'success', msg: `${role.replace(/_/g, ' ')} permissions saved.` });
    } catch {
      setToast({ type: 'error', msg: 'Failed to save permissions.' });
    } finally {
      setSaving(null);
    }
  };

  const saveUserRole = async (user: any, role: string) => {
    try {
      await roleService.updateUserRole(user.roleAssignmentId || user.id, { role });
      setToast({ type: 'success', msg: `${user.name}'s role updated to ${role.replace(/_/g, ' ')}.` });
      loadUsers();
    } catch {
      setToast({ type: 'error', msg: 'Failed to update user role.' });
    }
  };

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>;

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="subtitle1" fontWeight={800}>Role-Based Access Control (RBAC)</Typography>
        <Tooltip title="Reload"><IconButton onClick={load}><RefreshCw size={18} /></IconButton></Tooltip>
      </Box>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3 }}>
        <Tab icon={<Shield size={16} />} iconPosition="start" label="Role Permissions" sx={{ fontWeight: 700, minHeight: 48 }} />
        <Tab icon={<UserCog size={16} />} iconPosition="start" label="User Assignments" sx={{ fontWeight: 700, minHeight: 48 }} />
      </Tabs>

      {tab === 0 && (
        <Grid container spacing={3}>
          {roles.map((role) => {
            const selected = new Set(rolePerms[role] || []);
            const isSuper = role === 'SUPER_ADMIN';
            return (
              <Grid size={{ xs: 12, md: 6 }} key={role}>
                <Card variant="outlined" sx={{ borderRadius: 3, height: '100%' }}>
                  <CardContent>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <Box sx={{ p: 1, borderRadius: 2, bgcolor: 'primary.main', color: 'white', display: 'flex' }}><Shield size={20} /></Box>
                        <Typography variant="h6" fontWeight={800}>{role.replace(/_/g, ' ')}</Typography>
                      </Box>
                      <Chip label={`${selected.size} perms`} size="small" sx={{ fontWeight: 700 }} />
                    </Box>
                    <Divider sx={{ mb: 1.5 }} />
                    {isSuper && <Alert severity="info" sx={{ mb: 1.5 }}>Super Admin always has full access.</Alert>}
                    <Box sx={{ display: 'flex', flexDirection: 'column', maxHeight: 260, overflowY: 'auto' }}>
                      {catalog.map((p) => (
                        <FormControlLabel
                          key={p.code}
                          control={
                            <Checkbox
                              size="small"
                              checked={isSuper || selected.has(p.code)}
                              disabled={isSuper}
                              onChange={() => toggle(role, p.code)}
                            />
                          }
                          label={
                            <Box>
                              <Typography variant="body2" fontWeight={600}>{p.name}</Typography>
                              <Typography variant="caption" color="text.secondary">{p.description}</Typography>
                            </Box>
                          }
                        />
                      ))}
                    </Box>
                    <Box sx={{ mt: 2 }}>
                      <Button
                        variant="contained"
                        size="small"
                        startIcon={<Save size={16} />}
                        disabled={isSuper || saving === role}
                        onClick={() => saveRole(role)}
                        sx={{ borderRadius: 2, fontWeight: 700 }}
                      >
                        {saving === role ? 'Saving…' : 'Save permissions'}
                      </Button>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            );
          })}
        </Grid>
      )}

      {tab === 1 && (
        <Paper variant="outlined" sx={{ borderRadius: 3, overflow: 'hidden' }}>
          <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="body2" color="text.secondary">Assign a role to each user in a church. Permissions follow the role definitions above.</Typography>
            <IconButton onClick={loadUsers}><RefreshCw size={16} /></IconButton>
          </Box>
          {usersLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>
          ) : (
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>User</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Church</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Role</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {users.length === 0 ? (
                    <TableRow><TableCell colSpan={3} align="center" sx={{ py: 5 }}><Typography color="text.secondary">No church users found.</Typography></TableCell></TableRow>
                  ) : users.map((u) => (
                    <TableRow key={u.id} hover>
                      <TableCell>
                        <Typography variant="body2" fontWeight={700}>{u.name}</Typography>
                        <Typography variant="caption" color="text.secondary">{u.email}</Typography>
                      </TableCell>
                      <TableCell>{u.churchName || u.tenantName || 'Church'}</TableCell>
                      <TableCell>
                        <TextField
                          select size="small" value={u.role || 'MEMBER'}
                          onChange={(e) => saveUserRole(u, e.target.value)}
                          sx={{ minWidth: 180 }}
                        >
                          {ROLE_ORDER.filter((r) => r !== 'SUPER_ADMIN').map((r) => (
                            <MenuItem key={r} value={r}>{r.replace(/_/g, ' ')}</MenuItem>
                          ))}
                        </TextField>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Paper>
      )}

      <Snackbar open={!!toast} autoHideDuration={3500} onClose={() => setToast(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
        {toast ? <Alert severity={toast.type} onClose={() => setToast(null)}>{toast.msg}</Alert> : undefined}
      </Snackbar>
    </Box>
  );
};

export default RolesPermissions;
