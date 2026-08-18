import React, { useCallback, useEffect, useState } from 'react';
import {
  Box, Typography, Tabs, Tab, Card, CardContent, Chip, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Paper, TextField, MenuItem,
  Button, Stack, Alert, CircularProgress, IconButton, Tooltip,
} from '@mui/material';
import { Delete } from '@mui/icons-material';
import CrudTable from '../../components/church/CrudTable';
import churchApi from '../../services/churchApi';

const categoryOpts = [
  { value: 'leadership', label: 'Leadership' },
  { value: 'ministry', label: 'Ministry' },
  { value: 'administration', label: 'Administration' },
  { value: 'finance', label: 'Finance' },
  { value: 'support', label: 'Support' },
  { value: 'other', label: 'Other' },
];

/**
 * Portal roles a position can be *associated* with. This is a label only -- the
 * server does not grant the role when the position is assigned, because anyone
 * able to assign positions would then be able to escalate privileges. Roles are
 * still changed from Users & Permissions.
 */
const linkedRoleOpts = [
  { value: '', label: 'None (descriptive only)' },
  { value: 'CHURCH_ADMIN', label: 'Church Admin' },
  { value: 'PASTOR', label: 'Pastor' },
  { value: 'MINISTRY_LEADER', label: 'Ministry Leader' },
  { value: 'FINANCE', label: 'Finance Officer' },
  { value: 'SECRETARY', label: 'Secretary' },
];

const catLabel = (v?: string) => categoryOpts.find((o) => o.value === v)?.label || v || '\u2014';
const roleLabel = (v?: string) => linkedRoleOpts.find((o) => o.value === v)?.label || v || '\u2014';

/** The catalogue of positions this church recognises. */
const PositionCatalogue: React.FC = () => {
  const cols: any[] = [
    { key: 'name', label: 'Position' },
    { key: 'category', label: 'Category', render: (r: any) => <Chip size="small" label={catLabel(r.category)} /> },
    {
      key: 'linkedRole',
      label: 'Associated role',
      render: (r: any) => (r.linkedRole
        ? <Chip size="small" variant="outlined" label={roleLabel(r.linkedRole)} />
        : <Typography variant="body2" color="text.secondary">Descriptive only</Typography>),
    },
    { key: 'description', label: 'Description' },
  ];
  const fields: any[] = [
    { name: 'name', label: 'Position name', required: true },
    { name: 'category', label: 'Category', type: 'select', options: categoryOpts, defaultValue: 'ministry' },
    { name: 'linkedRole', label: 'Associated portal role', type: 'select', options: linkedRoleOpts },
    { name: 'description', label: 'Description', type: 'textarea' },
    { name: 'active', label: 'Active', type: 'checkbox', defaultValue: true },
  ];
  return (
    <Box>
      <Alert severity="info" sx={{ mb: 2, borderRadius: 2 }}>
        A position describes someone's place in the church, such as Usher or Treasurer. It is separate
        from their portal role, which controls what they can access. Choosing an associated role here
        is a label only and does not grant access.
      </Alert>
      <CrudTable
        idKey="id"
        columns={cols}
        fields={fields}
        fetchRows={() => churchApi.getPositions()}
        createRow={churchApi.createPosition}
        updateRow={churchApi.updatePosition}
        deleteRow={churchApi.deletePosition}
        addLabel="Add Position"
        emptyText="No positions defined yet. Add one to start assigning members."
      />
    </Box>
  );
};

/** Assign members to positions and see who currently holds what. */
const Assignments: React.FC = () => {
  const [assignments, setAssignments] = useState<any[]>([]);
  const [positions, setPositions] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [ministries, setMinistries] = useState<any[]>([]);
  const [memberId, setMemberId] = useState('');
  const [positionId, setPositionId] = useState('');
  const [ministryId, setMinistryId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [a, p, m, mi] = await Promise.all([
        churchApi.getPositionAssignments().catch(() => []),
        churchApi.getPositions().catch(() => []),
        churchApi.getMembers({ limit: 500 }).catch(() => []),
        churchApi.getMinistries().catch(() => []),
      ]);
      setAssignments(Array.isArray(a) ? a : []);
      setPositions(Array.isArray(p) ? p : []);
      setMembers(Array.isArray(m) ? m : []);
      setMinistries(Array.isArray(mi) ? mi : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const ministryName = (id?: string) => ministries.find((x: any) => x.id === id)?.name || '\u2014';

  const assign = async () => {
    setError('');
    setNotice('');
    if (!memberId || !positionId) {
      setError('Choose both a member and a position.');
      return;
    }
    setSaving(true);
    try {
      await churchApi.assignPosition({
        memberId,
        positionId,
        ministryId: ministryId || undefined,
        startDate: startDate || undefined,
      });
      setNotice('Position assigned.');
      setMemberId('');
      setPositionId('');
      setMinistryId('');
      setStartDate('');
      await load();
    } catch (e: any) {
      setError(e?.friendlyMessage || e?.response?.data?.error || 'Could not assign that position.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: number) => {
    setError('');
    setNotice('');
    try {
      await churchApi.removePositionAssignment(id);
      setNotice('Assignment removed.');
      await load();
    } catch {
      setError('Could not remove that assignment.');
    }
  };

  if (loading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>;
  }

  return (
    <Box>
      {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{error}</Alert>}
      {notice && <Alert severity="success" sx={{ mb: 2, borderRadius: 2 }}>{notice}</Alert>}

      <Card variant="outlined" sx={{ mb: 3, borderRadius: 3 }}>
        <CardContent>
          <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>Assign a position</Typography>
          {positions.length === 0 && (
            <Alert severity="warning" sx={{ mb: 2, borderRadius: 2 }}>
              No positions exist yet. Create one on the Positions tab first.
            </Alert>
          )}
          <Stack spacing={2} direction={{ xs: 'column', md: 'row' }}>
            <TextField
              select fullWidth label="Member" value={memberId}
              onChange={(e) => setMemberId(e.target.value)}
            >
              {members.map((m: any) => (
                <MenuItem key={m.id} value={m.id}>
                  {`${m.firstName || ''} ${m.lastName || ''}`.trim() || m.id}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select fullWidth label="Position" value={positionId}
              onChange={(e) => setPositionId(e.target.value)}
            >
              {positions.map((p: any) => (
                <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>
              ))}
            </TextField>
            <TextField
              select fullWidth label="Ministry (optional)" value={ministryId}
              onChange={(e) => setMinistryId(e.target.value)}
            >
              <MenuItem value="">None</MenuItem>
              {ministries.map((m: any) => (
                <MenuItem key={m.id} value={m.id}>{m.name}</MenuItem>
              ))}
            </TextField>
            <TextField
              fullWidth type="date" label="Start date" value={startDate}
              InputLabelProps={{ shrink: true }}
              onChange={(e) => setStartDate(e.target.value)}
            />
            <Button
              variant="contained" onClick={assign}
              disabled={saving || positions.length === 0}
              sx={{ minWidth: 140 }}
            >
              {saving ? 'Assigning...' : 'Assign'}
            </Button>
          </Stack>
        </CardContent>
      </Card>

      <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 3 }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Member</TableCell>
              <TableCell>Position</TableCell>
              <TableCell>Category</TableCell>
              <TableCell>Ministry</TableCell>
              <TableCell>Since</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {assignments.length === 0 && (
              <TableRow>
                <TableCell colSpan={6}>
                  <Typography color="text.secondary">No positions have been assigned yet.</Typography>
                </TableCell>
              </TableRow>
            )}
            {assignments.map((a: any) => (
              <TableRow key={a.id} hover>
                <TableCell>{`${a.memberFirstName || ''} ${a.memberLastName || ''}`.trim() || a.memberId}</TableCell>
                <TableCell>{a.positionName || a.positionId}</TableCell>
                <TableCell><Chip size="small" label={catLabel(a.positionCategory)} /></TableCell>
                <TableCell>{ministryName(a.ministryId)}</TableCell>
                <TableCell>{a.startDate ? new Date(a.startDate).toLocaleDateString() : '\u2014'}</TableCell>
                <TableCell align="right">
                  <Tooltip title="Remove assignment">
                    <IconButton size="small" color="error" onClick={() => remove(a.id)}>
                      <Delete fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
};

export const Positions: React.FC = () => {
  const [tab, setTab] = useState(0);
  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <Typography variant="h4" fontWeight={800} sx={{ letterSpacing: '-0.5px' }} gutterBottom>
        Roles &amp; Positions
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        Define the positions your church recognises and assign members to them.
      </Typography>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="Positions" />
        <Tab label="Assignments" />
      </Tabs>
      {tab === 0 && <PositionCatalogue />}
      {tab === 1 && <Assignments />}
    </Box>
  );
};

export default Positions;
