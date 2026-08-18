import React, { useCallback, useEffect, useState } from 'react';
import {
  Box, Paper, Typography, Button, Alert, CircularProgress, Chip, Stack, TextField,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Dialog,
  DialogTitle, DialogContent, DialogActions, IconButton, MenuItem, Tooltip,
} from '@mui/material';
import { Fingerprint, Plus, RefreshCw, Trash2, Copy, Link2, Power } from 'lucide-react';
import { churchApi } from '../../services/churchApi';

interface Device {
  id: string;
  name: string;
  serialNumber?: string;
  location?: string;
  active?: boolean;
  lastSeenAt?: string;
}

interface Punch {
  id?: number | string;
  biometricId?: string;
  punchedAt?: string;
  deviceId?: string;
  status?: string;
  note?: string;
}

export const BiometricDevicesPanel: React.FC = () => {
  const [devices, setDevices] = useState<Device[]>([]);
  const [punches, setPunches] = useState<Punch[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Registration / rotation
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ name: '', serialNumber: '', location: '' });
  const [saving, setSaving] = useState(false);
  // The plaintext key is held ONLY in this state, only until the dialog closes.
  const [issuedKey, setIssuedKey] = useState<{ name: string; apiKey: string } | null>(null);

  // Fingerprint linking
  const [linkPunch, setLinkPunch] = useState<Punch | null>(null);
  const [linkMemberId, setLinkMemberId] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [d, p] = await Promise.all([
        churchApi.getBiometricDevices(),
        churchApi.getBiometricPunches({ status: 'unmatched', limit: 50 }),
      ]);
      setDevices(d || []);
      setPunches(p || []);
    } catch (e: any) {
      setError(e?.friendlyMessage || 'Could not load biometric devices.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const register = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await churchApi.createBiometricDevice({
        name: form.name.trim(),
        serialNumber: form.serialNumber.trim() || undefined,
        location: form.location.trim() || undefined,
      });
      setAddOpen(false);
      setForm({ name: '', serialNumber: '', location: '' });
      setIssuedKey({ name: res.name || form.name, apiKey: res.apiKey });
      await load();
    } catch (e: any) {
      setError(e?.friendlyMessage || 'Could not register the device.');
    } finally {
      setSaving(false);
    }
  };

  const rotate = async (d: Device) => {
    setError(null);
    try {
      const res = await churchApi.rotateBiometricDeviceKey(d.id);
      setIssuedKey({ name: d.name, apiKey: res.apiKey });
      await load();
    } catch (e: any) {
      setError(e?.friendlyMessage || 'Could not rotate the device key.');
    }
  };

  const toggleActive = async (d: Device) => {
    try {
      await churchApi.updateBiometricDevice(d.id, { active: !d.active });
      await load();
    } catch (e: any) {
      setError(e?.friendlyMessage || 'Could not update the device.');
    }
  };

  const remove = async (d: Device) => {
    try {
      await churchApi.deleteBiometricDevice(d.id);
      await load();
    } catch (e: any) {
      setError(e?.friendlyMessage || 'Could not delete the device.');
    }
  };

  const openLink = async (p: Punch) => {
    setLinkPunch(p);
    setLinkMemberId('');
    if (members.length === 0) {
      try { setMembers(await churchApi.getMembers()); } catch { /* list stays empty */ }
    }
  };

  const confirmLink = async () => {
    if (!linkPunch?.biometricId || !linkMemberId) return;
    setError(null);
    try {
      await churchApi.linkMemberBiometric(linkMemberId, linkPunch.biometricId);
      setNotice('Fingerprint linked. Future punches from this finger will match automatically.');
      setLinkPunch(null);
      await load();
    } catch (e: any) {
      // The server returns 409 when that fingerprint already belongs to someone.
      setError(e?.friendlyMessage || 'Could not link that fingerprint. It may already belong to another member.');
    }
  };

  const copyKey = async (key: string) => {
    try {
      await navigator.clipboard.writeText(key);
      setNotice('Key copied to the clipboard.');
    } catch {
      setNotice('Copy failed -- select the key and copy it manually.');
    }
  };

  if (loading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}><CircularProgress /></Box>;
  }

  return (
    <>
      {error && <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }} onClose={() => setError(null)}>{error}</Alert>}
      {notice && <Alert severity="success" sx={{ mb: 3, borderRadius: 2 }} onClose={() => setNotice(null)}>{notice}</Alert>}

      <Paper sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider', mb: 3 }}>
        <Box sx={{ p: 2.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
          <Box>
            <Typography variant="h6" fontWeight={700}>Biometric devices</Typography>
            <Typography variant="body2" color="text.secondary">
              ZKTeco and compatible terminals that post attendance to this church.
            </Typography>
          </Box>
          <Button variant="contained" startIcon={<Plus size={18} />} onClick={() => setAddOpen(true)}>
            Register device
          </Button>
        </Box>

        {devices.length === 0 ? (
          <Box sx={{ textAlign: 'center', p: 6, color: 'text.secondary' }}>
            <Fingerprint size={40} />
            <Typography sx={{ mt: 1 }}>No devices registered yet.</Typography>
          </Box>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700 }}>Device</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Serial</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Location</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Last seen</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {devices.map((d) => (
                  <TableRow key={d.id} hover>
                    <TableCell>{d.name}</TableCell>
                    <TableCell>{d.serialNumber || '-'}</TableCell>
                    <TableCell>{d.location || '-'}</TableCell>
                    <TableCell>
                      {d.lastSeenAt ? new Date(d.lastSeenAt).toLocaleString() : 'Never'}
                    </TableCell>
                    <TableCell>
                      <Chip size="small" color={d.active ? 'success' : 'default'} label={d.active ? 'Active' : 'Disabled'} />
                    </TableCell>
                    <TableCell align="right">
                      <Tooltip title="Issue a new key">
                        <IconButton size="small" onClick={() => rotate(d)}><RefreshCw size={16} /></IconButton>
                      </Tooltip>
                      <Tooltip title={d.active ? 'Disable' : 'Enable'}>
                        <IconButton size="small" onClick={() => toggleActive(d)}><Power size={16} /></IconButton>
                      </Tooltip>
                      <Tooltip title="Delete">
                        <IconButton size="small" color="error" onClick={() => remove(d)}><Trash2 size={16} /></IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      <Paper sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider' }}>
        <Box sx={{ p: 2.5 }}>
          <Typography variant="h6" fontWeight={700}>Unrecognised fingerprints</Typography>
          <Typography variant="body2" color="text.secondary">
            Punches received from a device whose fingerprint ID is not linked to any member.
            Link them once and they will match automatically from then on.
          </Typography>
        </Box>
        {punches.length === 0 ? (
          <Box sx={{ textAlign: 'center', p: 5, color: 'text.secondary' }}>
            <Typography variant="body2">Nothing waiting. Every punch received so far matched a member.</Typography>
          </Box>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700 }}>Fingerprint ID</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Punched at</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Note</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="right">Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {punches.map((p, i) => (
                  <TableRow key={p.id ?? i} hover>
                    <TableCell><code>{p.biometricId || '-'}</code></TableCell>
                    <TableCell>{p.punchedAt ? new Date(p.punchedAt).toLocaleString() : '-'}</TableCell>
                    <TableCell>
                      <Typography variant="caption" color="text.secondary">{p.note || '-'}</Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Button size="small" startIcon={<Link2 size={16} />} onClick={() => openLink(p)}>
                        Link to member
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      {/* Register a device */}
      <Dialog open={addOpen} onClose={() => setAddOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ fontWeight: 700 }}>Register biometric device</DialogTitle>
        <DialogContent>
          <Stack spacing={2.5} sx={{ mt: 1 }}>
            <TextField
              label="Device name"
              required
              fullWidth
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Main entrance terminal"
            />
            <TextField
              label="Serial number"
              fullWidth
              value={form.serialNumber}
              onChange={(e) => setForm({ ...form, serialNumber: e.target.value })}
              helperText="Printed on the back of the device. Optional, but useful for support."
            />
            <TextField
              label="Location"
              fullWidth
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              placeholder="Main auditorium door"
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2.5 }}>
          <Button onClick={() => setAddOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={register} disabled={saving || !form.name.trim()}>
            {saving ? 'Registering...' : 'Register'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* One-time key display */}
      <Dialog open={Boolean(issuedKey)} onClose={() => setIssuedKey(null)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ fontWeight: 700 }}>Device key for {issuedKey?.name}</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ borderRadius: 2, mb: 2.5 }}>
            Copy this key now. It is shown once and cannot be recovered -- only a hash is
            stored on the server. If you lose it, rotate the key to issue a new one.
          </Alert>
          <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, bgcolor: 'action.hover', wordBreak: 'break-all' }}>
            <code style={{ fontSize: 14 }}>{issuedKey?.apiKey}</code>
          </Paper>
          <Button
            sx={{ mt: 2 }}
            startIcon={<Copy size={16} />}
            onClick={() => issuedKey && copyKey(issuedKey.apiKey)}
          >
            Copy key
          </Button>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2.5 }}>
            Paste it into the device configuration as the <code>x-device-key</code> header
            for every request. Also check the device clock is correct, since punches are
            matched to services by time.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2.5 }}>
          <Button variant="contained" onClick={() => setIssuedKey(null)}>I have copied it</Button>
        </DialogActions>
      </Dialog>

      {/* Link a fingerprint to a member */}
      <Dialog open={Boolean(linkPunch)} onClose={() => setLinkPunch(null)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ fontWeight: 700 }}>Link fingerprint to member</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
            Fingerprint <code>{linkPunch?.biometricId}</code> is not yet linked to anybody.
          </Typography>
          <TextField
            select
            fullWidth
            label="Member"
            value={linkMemberId}
            onChange={(e) => setLinkMemberId(e.target.value)}
          >
            {members.length === 0 && <MenuItem value="" disabled>No members loaded</MenuItem>}
            {members.map((m: any) => (
              <MenuItem key={m.id} value={m.id}>
                {[m.firstName, m.lastName].filter(Boolean).join(' ') || m.name || m.id}
              </MenuItem>
            ))}
          </TextField>
        </DialogContent>
        <DialogActions sx={{ p: 2.5 }}>
          <Button onClick={() => setLinkPunch(null)}>Cancel</Button>
          <Button variant="contained" onClick={confirmLink} disabled={!linkMemberId}>Link</Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default BiometricDevicesPanel;
