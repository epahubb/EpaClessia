import React, { useEffect, useState } from 'react';
import {
  Box, Typography, Paper, Button, Chip, Stack, Snackbar, Alert,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField,
  MenuItem, Select, FormControl, InputLabel, CircularProgress,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Avatar, Tabs, Tab,
} from '@mui/material';
import { Plus, Users, ClipboardCheck } from 'lucide-react';
import { ministryLeaderService } from '../../services/ministryLeaderService';

interface MinistryOption {
  id: string;
  name: string;
}

interface RosterMember {
  id: string;
  name: string;
  role: string;
  status: string;
  phone?: string;
  email?: string;
}

interface AttendanceRecord {
  id: string;
  title?: string;
  sessionDate?: string;
  presentCount: number;
  totalCount: number;
  notes?: string;
}

const MinistryMembers: React.FC = () => {
  const [ministries, setMinistries] = useState<MinistryOption[]>([]);
  const [ministryId, setMinistryId] = useState<string>('');
  const [tab, setTab] = useState(0);
  const [members, setMembers] = useState<RosterMember[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; sev: 'success' | 'error' } | null>(null);

  const [memberDialog, setMemberDialog] = useState(false);
  const [memberForm, setMemberForm] = useState({ name: '', role: 'member', phone: '', email: '' });

  const [attDialog, setAttDialog] = useState(false);
  const [attForm, setAttForm] = useState({ title: '', sessionDate: '', presentCount: '', notes: '' });

  useEffect(() => {
    (async () => {
      try {
        const list = await ministryLeaderService.getManagedMinistries();
        setMinistries(list || []);
        if (list && list.length > 0) setMinistryId(list[0].id);
        else setLoading(false);
      } catch {
        setToast({ msg: 'Failed to load ministries', sev: 'error' });
        setLoading(false);
      }
    })();
  }, []);

  const loadData = async (mid: string) => {
    if (!mid) return;
    setLoading(true);
    try {
      const [m, a] = await Promise.all([
        ministryLeaderService.getMinistryMembers(mid),
        ministryLeaderService.getAttendance(mid),
      ]);
      setMembers(m || []);
      setAttendance(a || []);
    } catch {
      setToast({ msg: 'Failed to load roster', sev: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (ministryId) loadData(ministryId);
  }, [ministryId]);

  const addMember = async () => {
    if (!memberForm.name.trim()) {
      setToast({ msg: 'Member name is required', sev: 'error' });
      return;
    }
    setSaving(true);
    try {
      await ministryLeaderService.addMember(ministryId, {
        name: memberForm.name.trim(),
        role: memberForm.role,
        phone: memberForm.phone.trim() || undefined,
        email: memberForm.email.trim() || undefined,
      } as any);
      setToast({ msg: 'Member added', sev: 'success' });
      setMemberDialog(false);
      setMemberForm({ name: '', role: 'member', phone: '', email: '' });
      loadData(ministryId);
    } catch {
      setToast({ msg: 'Failed to add member', sev: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (m: RosterMember) => {
    const status = m.status === 'active' ? 'inactive' : 'active';
    try {
      await ministryLeaderService.updateMember(m.id, { status } as any);
      setMembers((prev) => prev.map((x) => (x.id === m.id ? { ...x, status } : x)));
    } catch {
      setToast({ msg: 'Failed to update member', sev: 'error' });
    }
  };

  const recordAttendance = async () => {
    setSaving(true);
    try {
      await ministryLeaderService.recordAttendance(ministryId, {
        title: attForm.title.trim() || 'Attendance',
        sessionDate: attForm.sessionDate || undefined,
        presentCount: Number(attForm.presentCount || 0),
        notes: attForm.notes.trim() || undefined,
      });
      setToast({ msg: 'Attendance recorded', sev: 'success' });
      setAttDialog(false);
      setAttForm({ title: '', sessionDate: '', presentCount: '', notes: '' });
      loadData(ministryId);
    } catch {
      setToast({ msg: 'Failed to record attendance', sev: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="h4" fontWeight={800} sx={{ letterSpacing: '-1px' }}>Members & Attendance</Typography>
          <Typography variant="body1" color="text.secondary">Manage your ministry roster and track participation</Typography>
        </Box>
        <Stack direction="row" spacing={2} alignItems="center">
          {ministries.length > 0 && (
            <FormControl size="small" sx={{ minWidth: 200 }}>
              <InputLabel>Ministry</InputLabel>
              <Select value={ministryId} label="Ministry" onChange={(e) => setMinistryId(e.target.value)}>
                {ministries.map((m) => (
                  <MenuItem key={m.id} value={m.id}>{m.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
        </Stack>
      </Box>

      {ministries.length === 0 && !loading && (
        <Paper sx={{ p: 4, borderRadius: 4, textAlign: 'center' }}>
          <Typography color="text.secondary">You are not leading any ministries yet. Ask a church admin to assign you as a ministry leader.</Typography>
        </Paper>
      )}

      {ministryId && (
        <Paper sx={{ borderRadius: 4, overflow: 'hidden' }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: 2, borderBottom: 1, borderColor: 'divider' }}>
            <Tabs value={tab} onChange={(_, v) => setTab(v)}>
              <Tab icon={<Users size={16} />} iconPosition="start" label={`Roster (${members.length})`} />
              <Tab icon={<ClipboardCheck size={16} />} iconPosition="start" label="Attendance" />
            </Tabs>
            {tab === 0 ? (
              <Button variant="contained" size="small" startIcon={<Plus size={16} />} sx={{ borderRadius: 2 }}
                onClick={() => setMemberDialog(true)}>Add member</Button>
            ) : (
              <Button variant="contained" size="small" startIcon={<Plus size={16} />} sx={{ borderRadius: 2 }}
                onClick={() => setAttDialog(true)}>Record attendance</Button>
            )}
          </Box>

          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}><CircularProgress /></Box>
          ) : tab === 0 ? (
            members.length === 0 ? (
              <Box sx={{ p: 4, textAlign: 'center' }}>
                <Typography color="text.secondary">No members yet. Add your first team member.</Typography>
              </Box>
            ) : (
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Name</TableCell>
                      <TableCell>Role</TableCell>
                      <TableCell>Contact</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell align="right">Action</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {members.map((m) => (
                      <TableRow key={m.id} hover>
                        <TableCell>
                          <Stack direction="row" spacing={1.5} alignItems="center">
                            <Avatar sx={{ width: 32, height: 32 }}>{m.name?.[0]?.toUpperCase()}</Avatar>
                            <Typography fontWeight={600}>{m.name}</Typography>
                          </Stack>
                        </TableCell>
                        <TableCell><Chip size="small" label={m.role} variant="outlined" /></TableCell>
                        <TableCell>
                          <Typography variant="body2">{m.phone || '-'}</Typography>
                          <Typography variant="caption" color="text.secondary">{m.email || ''}</Typography>
                        </TableCell>
                        <TableCell>
                          <Chip size="small" label={m.status} color={m.status === 'active' ? 'success' : 'default'} />
                        </TableCell>
                        <TableCell align="right">
                          <Button size="small" onClick={() => toggleStatus(m)}>
                            {m.status === 'active' ? 'Deactivate' : 'Activate'}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )
          ) : attendance.length === 0 ? (
            <Box sx={{ p: 4, textAlign: 'center' }}>
              <Typography color="text.secondary">No attendance recorded yet.</Typography>
            </Box>
          ) : (
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Session</TableCell>
                    <TableCell>Date</TableCell>
                    <TableCell align="center">Present</TableCell>
                    <TableCell align="center">Total</TableCell>
                    <TableCell align="center">Rate</TableCell>
                    <TableCell>Notes</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {attendance.map((a) => {
                    const rate = a.totalCount > 0 ? Math.round((a.presentCount / a.totalCount) * 100) : 0;
                    return (
                      <TableRow key={a.id} hover>
                        <TableCell>{a.title || 'Attendance'}</TableCell>
                        <TableCell>{a.sessionDate ? new Date(a.sessionDate).toLocaleDateString() : '-'}</TableCell>
                        <TableCell align="center">{a.presentCount}</TableCell>
                        <TableCell align="center">{a.totalCount}</TableCell>
                        <TableCell align="center">
                          <Chip size="small" label={`${rate}%`} color={rate >= 70 ? 'success' : rate >= 40 ? 'warning' : 'default'} />
                        </TableCell>
                        <TableCell>{a.notes || '-'}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Paper>
      )}

      {/* Add member dialog */}
      <Dialog open={memberDialog} onClose={() => setMemberDialog(false)} fullWidth maxWidth="sm">
        <DialogTitle>Add member</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="Name" fullWidth required value={memberForm.name}
              onChange={(e) => setMemberForm({ ...memberForm, name: e.target.value })} />
            <FormControl fullWidth>
              <InputLabel>Role</InputLabel>
              <Select value={memberForm.role} label="Role"
                onChange={(e) => setMemberForm({ ...memberForm, role: e.target.value })}>
                <MenuItem value="member">Member</MenuItem>
                <MenuItem value="coordinator">Coordinator</MenuItem>
                <MenuItem value="assistant">Assistant</MenuItem>
                <MenuItem value="volunteer">Volunteer</MenuItem>
              </Select>
            </FormControl>
            <TextField label="Phone" fullWidth value={memberForm.phone}
              onChange={(e) => setMemberForm({ ...memberForm, phone: e.target.value })} />
            <TextField label="Email" fullWidth value={memberForm.email}
              onChange={(e) => setMemberForm({ ...memberForm, email: e.target.value })} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMemberDialog(false)}>Cancel</Button>
          <Button variant="contained" onClick={addMember} disabled={saving}>{saving ? 'Saving...' : 'Add'}</Button>
        </DialogActions>
      </Dialog>

      {/* Record attendance dialog */}
      <Dialog open={attDialog} onClose={() => setAttDialog(false)} fullWidth maxWidth="sm">
        <DialogTitle>Record attendance</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="Session title" fullWidth placeholder="e.g. Sunday rehearsal" value={attForm.title}
              onChange={(e) => setAttForm({ ...attForm, title: e.target.value })} />
            <TextField label="Date" type="date" fullWidth InputLabelProps={{ shrink: true }}
              value={attForm.sessionDate} onChange={(e) => setAttForm({ ...attForm, sessionDate: e.target.value })} />
            <TextField label="Present count" type="number" fullWidth value={attForm.presentCount}
              onChange={(e) => setAttForm({ ...attForm, presentCount: e.target.value })}
              helperText="Total defaults to your active roster size" />
            <TextField label="Notes" fullWidth multiline rows={2} value={attForm.notes}
              onChange={(e) => setAttForm({ ...attForm, notes: e.target.value })} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAttDialog(false)}>Cancel</Button>
          <Button variant="contained" onClick={recordAttendance} disabled={saving}>{saving ? 'Saving...' : 'Record'}</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!toast} autoHideDuration={4000} onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        {toast ? <Alert severity={toast.sev} onClose={() => setToast(null)}>{toast.msg}</Alert> : undefined}
      </Snackbar>
    </Box>
  );
};

export default MinistryMembers;
