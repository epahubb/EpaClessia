import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { UserMinus } from 'lucide-react';
import churchApi from '../../services/churchApi';

type UnitType = 'ministry' | 'department' | 'group';

type RosterRow = {
  id: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  membershipId?: string;
  membershipStatus?: string;
  phone?: string;
  email?: string;
  role?: string;
  joinStatus?: string;
};

type MemberOption = { id: string; name: string; membershipId?: string; membershipStatus?: string };

/**
 * Manage who belongs to a ministry, department or group.
 *
 * The same dialog serves all three because the question is identical: show the
 * people already in the unit, let an administrator add an existing member, and
 * remove someone without deleting their church record. A member is never
 * created here -- that belongs on the member form -- so nobody is registered
 * twice by mistake.
 */
export default function UnitMembersDialog({
  open,
  unitType,
  unit,
  onClose,
  onChanged,
}: {
  open: boolean;
  unitType: UnitType;
  unit: any;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const [rows, setRows] = useState<RosterRow[]>([]);
  const [options, setOptions] = useState<MemberOption[]>([]);
  const [picked, setPicked] = useState<MemberOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const unitId = unit?.id || '';

  const load = useCallback(async () => {
    if (!unitId) return;
    setLoading(true);
    setError('');
    try {
      const res = unitType === 'group'
        ? await churchApi.getGroupMembers(unitId)
        : await churchApi.getMinistryMembers(unitId);
      setRows(Array.isArray(res?.data) ? res.data : []);
    } catch (e: any) {
      setError(e?.friendlyMessage || 'The member list could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [unitId, unitType]);

  useEffect(() => {
    if (!open) return;
    setPicked([]);
    setNotice('');
    setError('');
    void load();
    churchApi
      .getMemberOptions()
      .then((list: any[]) => setOptions(Array.isArray(list) ? list : []))
      .catch(() => setOptions([]));
  }, [open, load]);

  const available = useMemo(() => {
    const present = new Set(rows.map(r => r.id));
    return options.filter(o => !present.has(o.id));
  }, [options, rows]);

  const add = async () => {
    if (!picked.length) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const ids = picked.map(p => p.id);
      const res = unitType === 'group'
        ? await churchApi.addGroupMembers(unitId, ids)
        : await churchApi.addMinistryMembers(unitId, ids);
      setNotice(res?.message || 'The members were added.');
      setPicked([]);
      await load();
      onChanged?.();
    } catch (e: any) {
      setError(e?.friendlyMessage || 'The members could not be added.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (row: RosterRow) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const res = unitType === 'group'
        ? await churchApi.removeGroupMember(unitId, row.id)
        : await churchApi.removeMinistryMember(unitId, row.id);
      setNotice(res?.message || 'The member was removed.');
      await load();
      onChanged?.();
    } catch (e: any) {
      setError(e?.friendlyMessage || 'This member could not be removed.');
    } finally {
      setBusy(false);
    }
  };

  const displayName = (r: RosterRow) =>
    r.name || [r.firstName, r.lastName].filter(Boolean).join(' ') || r.membershipId || 'Unnamed member';

  return (
    <Dialog open={open} onClose={() => { if (!busy) onClose(); }} fullWidth maxWidth="md">
      <DialogTitle>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Box>
            <Typography variant="h6">{unit?.name || 'Members'}</Typography>
            <Typography variant="caption" color="text.secondary">
              {rows.length} member{rows.length === 1 ? '' : 's'} in this {unitType === 'group' ? 'group' : unitType}
            </Typography>
          </Box>
        </Stack>
      </DialogTitle>
      <DialogContent dividers>
        {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
        {notice && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setNotice('')}>{notice}</Alert>}

        <Alert severity="info" sx={{ mb: 2 }}>
          Add an existing church member here. To register a brand-new person, use Members → Add Member; they will
          then be available in this list.
        </Alert>

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 2 }}>
          <Autocomplete
            multiple
            options={available}
            value={picked}
            onChange={(_e, value) => setPicked(value)}
            getOptionLabel={(o) => `${o.name}${o.membershipId ? ` · ${o.membershipId}` : ''}`}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            sx={{ flex: 1 }}
            renderInput={(params) => (
              <TextField {...params} size="small" label="Find members to add" placeholder="Type a name or member ID" />
            )}
          />
          <Button variant="contained" onClick={add} disabled={busy || !picked.length}>
            {busy ? 'Saving…' : `Add ${picked.length || ''}`.trim()}
          </Button>
        </Stack>

        {loading ? (
          <Box sx={{ py: 4, textAlign: 'center' }}><CircularProgress size={24} /></Box>
        ) : rows.length === 0 ? (
          <Typography color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
            Nobody has been added to this {unitType === 'group' ? 'group' : unitType} yet.
          </Typography>
        ) : (
          <TableContainer sx={{ border: 1, borderColor: 'divider', borderRadius: 1 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  {['Member', 'Member ID', 'Contact', 'Role', 'Status', ''].map((h) => (
                    <TableCell key={h} sx={{ fontWeight: 700 }}>{h}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id} hover>
                    <TableCell>{displayName(r)}</TableCell>
                    <TableCell>{r.membershipId || '—'}</TableCell>
                    <TableCell>
                      <Typography variant="body2">{r.phone || '—'}</Typography>
                      <Typography variant="caption" color="text.secondary">{r.email || ''}</Typography>
                    </TableCell>
                    <TableCell sx={{ textTransform: 'capitalize' }}>{r.role || 'member'}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={r.joinStatus || r.membershipStatus || 'active'}
                        color={(r.membershipStatus && r.membershipStatus !== 'active') ? 'default' : 'success'}
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Tooltip title="Remove from this unit">
                        <span>
                          <IconButton size="small" color="error" disabled={busy} onClick={() => remove(r)}>
                            <UserMinus size={16} />
                          </IconButton>
                        </span>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
