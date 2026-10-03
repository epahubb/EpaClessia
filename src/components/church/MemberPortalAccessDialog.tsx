import React, { useEffect, useState } from 'react';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Stack, Switch, TextField, Typography } from '@mui/material';
import churchApi from '../../services/churchApi';

const MemberPortalAccessDialog: React.FC<{ open: boolean; row: any; onClose: () => void; onSaved: (message: string) => void }> = ({ open, row, onClose, onSaved }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [active, setActive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (open) {
      const suggested = [row?.firstName, row?.lastName].map(p => String(p || '').toLowerCase().replace(/[^a-z0-9]/g, '')).filter(Boolean).join('.').slice(0, 32);
      setUsername(row?.portalUsername || suggested); setPassword(''); setActive(true); setError('');
    } else setPassword('');
  }, [open, row?.id]);
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setError('');
    if (!/^[a-zA-Z0-9._-]{3,32}$/.test(username.trim())) { setError('Use a username with 3–32 letters, numbers, dots, dashes or underscores.'); return; }
    if (password.length < 8) { setError('The password must be at least 8 characters.'); return; }
    setBusy(true);
    try {
      const result = await churchApi.sendPortalInvite(row.id, { username: username.trim(), password, activateNow: active });
      setPassword('');
      onSaved(result.message || 'Portal access saved.');
      onClose();
    } catch (e: any) { setError(e?.friendlyMessage || e?.response?.data?.error || 'Could not save portal access.'); }
    finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onClose={() => { if (!busy) onClose(); }} maxWidth="sm" fullWidth aria-labelledby="member-portal-access-title">
      <form onSubmit={save}>
        <DialogTitle id="member-portal-access-title">{row?.portalUserUid ? 'Reset member portal access' : 'Create member portal access'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}
            <Typography sx={{ overflowWrap: 'anywhere' }}>{[row?.firstName, row?.lastName].filter(Boolean).join(' ')} · {row?.email || 'No email required for username sign-in'}</Typography>
            {row?.portalUserUid && <Alert severity="warning">Saving replaces this member’s current password. Share the new credentials with the member securely.</Alert>}
            <TextField label="Username" required fullWidth value={username} onChange={e => setUsername(e.target.value)} disabled={busy} autoComplete="off"
              helperText="The member signs in with this username or their email address." />
            <TextField label="New password" type="password" required fullWidth value={password} onChange={e => setPassword(e.target.value)} disabled={busy} autoComplete="new-password"
              helperText="At least 8 characters. Only a password hash is stored; the password cannot be read back." />
            <FormControlLabel control={<Switch checked={active} onChange={e => setActive(e.target.checked)} disabled={busy} />} label="Allow sign-in immediately" />
            <Alert severity="info">{active ? 'After saving, the member can sign in immediately using this username and password. An invitation will be sent if email or SMS delivery is available.' : 'The member must use the emailed activation link before signing in.'}</Alert>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={onClose} disabled={busy} sx={{ minHeight: 44 }}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={busy} sx={{ minHeight: 44 }}>{busy ? 'Saving…' : 'Save portal access'}</Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};
export default MemberPortalAccessDialog;
