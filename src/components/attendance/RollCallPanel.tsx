import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box, Paper, Typography, Button, Alert, CircularProgress, TextField, Chip, Stack,
  ToggleButton, ToggleButtonGroup, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Snackbar,
} from '@mui/material';
import { Save, Search, Users } from 'lucide-react';
import { churchApi } from '../../services/churchApi';

interface RollCallPanelProps {
  eventId: string;
}

type Mark = boolean | null;

interface Entry {
  memberId: string;
  name?: string | null;
  // The register is also sent as separate parts, so the panel can build a name
  // itself rather than showing a blank row if `name` is ever missing.
  firstName?: string | null;
  lastName?: string | null;
  membershipId?: string | null;
  groupName?: string | null;
  present: Mark;
  method?: string | null;
  recordedAt?: string | null;
}

/**
 * The one place a member's display name is decided. The sheet used to render
 * `entry.name` alone, which was blank for every row -- the server sends first
 * and last names -- so the register looked empty even with members registered.
 */
const displayName = (e: Entry): string =>
  (e.name && e.name.trim())
  || [e.firstName, e.lastName].filter(Boolean).join(' ').trim()
  || e.membershipId
  || 'Unnamed member';

export const RollCallPanel: React.FC<RollCallPanelProps> = ({ eventId }) => {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [changes, setChanges] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!eventId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await churchApi.getRollCall(eventId);
      // The endpoint returns the sheet under `entries`; `data` is the generic
      // key used elsewhere. Reading only one of them is what made a register
      // full of members show up as empty.
      // The endpoint may answer with the sheet under `entries`, under the
      // generic `data` key, or as a bare array. All three are accepted so the
      // register cannot appear empty merely because of the envelope used.
      const sheet = Array.isArray(res) ? res : (res?.entries || res?.data || []);
      setEntries(sheet as Entry[]);
      setChanges({});
    } catch (e: any) {
      setError(e?.friendlyMessage || 'Could not load the roll call for this event.');
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => { load(); }, [load]);

  // Local marks layered over what the server already knows.
  const markOf = (e: Entry): Mark =>
    Object.prototype.hasOwnProperty.call(changes, e.memberId) ? changes[e.memberId] : e.present;

  const setMark = (memberId: string, value: boolean) => {
    setChanges((prev) => ({ ...prev, [memberId]: value }));
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    // Searchable by name, membership ID and group, since roll call is often
    // taken one group at a time.
    return entries.filter((e) =>
      `${displayName(e)} ${e.membershipId || ''} ${e.groupName || ''}`.toLowerCase().includes(q));
  }, [entries, query]);

  const summary = useMemo(() => {
    let present = 0, absent = 0, unmarked = 0;
    entries.forEach((e) => {
      const m = markOf(e);
      if (m === true) present += 1;
      else if (m === false) absent += 1;
      else unmarked += 1;
    });
    return { present, absent, unmarked, total: entries.length };
  }, [entries, changes]);

  const dirtyCount = Object.keys(changes).length;

  const save = async () => {
    const payload = Object.entries(changes).map(([memberId, present]) => ({ memberId, present }));
    if (payload.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      await churchApi.saveRollCall(eventId, payload);
      setSaved(`Saved ${payload.length} ${payload.length === 1 ? 'mark' : 'marks'}.`);
      await load();
    } catch (e: any) {
      setError(e?.friendlyMessage || 'Could not save the roll call. Your marks are still on screen.');
    } finally {
      setSaving(false);
    }
  };

  const markAllVisible = (value: boolean) => {
    const next = { ...changes };
    filtered.forEach((e) => { next[e.memberId] = value; });
    setChanges(next);
  };

  if (loading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}><CircularProgress /></Box>;
  }

  return (
    <>
      {error && <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}>{error}</Alert>}

      <Paper sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider', p: 2.5, mb: 3 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }} justifyContent="space-between">
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Chip color="success" label={`Present ${summary.present}`} sx={{ fontWeight: 700 }} />
            <Chip color="default" label={`Absent ${summary.absent}`} sx={{ fontWeight: 700 }} />
            <Chip variant="outlined" label={`Unmarked ${summary.unmarked}`} sx={{ fontWeight: 700 }} />
          </Stack>
          <Stack direction="row" spacing={1}>
            <Button size="small" variant="outlined" onClick={() => markAllVisible(true)}>Mark all present</Button>
            <Button
              variant="contained"
              startIcon={<Save size={18} />}
              onClick={save}
              disabled={saving || dirtyCount === 0}
            >
              {saving ? 'Saving...' : dirtyCount > 0 ? `Save ${dirtyCount}` : 'Save'}
            </Button>
          </Stack>
        </Stack>

        <TextField
          fullWidth
          size="small"
          placeholder="Search members"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          InputProps={{ startAdornment: <Box sx={{ mr: 1, display: 'flex' }}><Search size={18} /></Box> }}
          sx={{ mt: 2.5 }}
        />
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
          Unmarked is not the same as absent. Members you never touch are left untouched
          on the server, so a half-finished roll call does not record everyone as missing.
        </Typography>
      </Paper>

      <Paper sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider' }}>
        {filtered.length === 0 ? (
          <Box sx={{ textAlign: 'center', p: 6, color: 'text.secondary' }}>
            <Users size={40} />
            <Typography sx={{ mt: 1 }}>
              {entries.length === 0
                ? 'No members in the register yet. Register members under Members, and they will appear here.'
                : 'No members match that search.'}
            </Typography>
          </Box>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700 }}>Member</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Group</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Recorded</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="right">Attendance</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filtered.map((e) => {
                  const mark = markOf(e);
                  return (
                    <TableRow key={e.memberId} hover>
                      <TableCell>{displayName(e)}</TableCell>
                      <TableCell>
                        {e.groupName
                          ? <Chip size="small" variant="outlined" label={e.groupName} />
                          : <Typography variant="body2" color="text.secondary">—</Typography>}
                      </TableCell>
                      <TableCell>
                        {e.recordedAt ? (
                          <Typography variant="caption" color="text.secondary">
                            {new Date(e.recordedAt).toLocaleTimeString()}
                            {e.method ? ` - ${e.method}` : ''}
                          </Typography>
                        ) : (
                          <Typography variant="caption" color="text.secondary">-</Typography>
                        )}
                      </TableCell>
                      <TableCell align="right">
                        <ToggleButtonGroup
                          size="small"
                          exclusive
                          value={mark === null ? null : mark ? 'present' : 'absent'}
                          onChange={(_, v) => { if (v) setMark(e.memberId, v === 'present'); }}
                        >
                          <ToggleButton value="present" color="success">Present</ToggleButton>
                          <ToggleButton value="absent">Absent</ToggleButton>
                        </ToggleButtonGroup>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      <Snackbar
        open={Boolean(saved)}
        autoHideDuration={4000}
        onClose={() => setSaved(null)}
        message={saved || ''}
      />
    </>
  );
};

export default RollCallPanel;
