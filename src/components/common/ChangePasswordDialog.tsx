import React, { useState } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  Stack,
  TextField,
  Tooltip,
} from '@mui/material';
import { Eye, EyeOff, KeyRound } from 'lucide-react';
import api from '../../services/api';

/**
 * Change-your-own-password dialog.
 *
 * Available to every signed-in account from the workspace toolbar, so members,
 * volunteers, leaders and administrators all have the same self-service route.
 * The server verifies the current password before accepting a new one.
 */
export function ChangePasswordDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const reset = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirm('');
    setShow(false);
    setError('');
    setNotice('');
  };

  const close = () => {
    if (busy) return;
    reset();
    onClose();
  };

  const submit = async () => {
    setError('');
    setNotice('');
    if (!currentPassword) {
      setError('Enter your current password.');
      return;
    }
    if (newPassword.length < 8) {
      setError('Choose a password of at least 8 characters.');
      return;
    }
    if (newPassword !== confirm) {
      setError('The two new passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      const res = await api.post('/auth/change-password', { currentPassword, newPassword });
      setNotice(res.data?.message || 'Your password has been changed.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirm('');
    } catch (e: any) {
      setError(e?.friendlyMessage || e?.response?.data?.error || 'Your password could not be changed.');
    } finally {
      setBusy(false);
    }
  };

  const inputType = show ? 'text' : 'password';
  const endAdornment = (
    <InputAdornment position="end">
      <IconButton size="small" aria-label={show ? 'Hide passwords' : 'Show passwords'} onClick={() => setShow(v => !v)}>
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </IconButton>
    </InputAdornment>
  );

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="xs">
      <DialogTitle>Change your password</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}
          {notice && <Alert severity="success" onClose={() => setNotice('')}>{notice}</Alert>}
          <TextField
            label="Current password"
            type={inputType}
            autoComplete="current-password"
            value={currentPassword}
            onChange={e => setCurrentPassword(e.target.value)}
            InputProps={{ endAdornment }}
            fullWidth
          />
          <TextField
            label="New password"
            type={inputType}
            autoComplete="new-password"
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
            helperText="At least 8 characters. Avoid a password you use elsewhere."
            fullWidth
          />
          <TextField
            label="Confirm new password"
            type={inputType}
            autoComplete="new-password"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            fullWidth
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={close} disabled={busy}>Close</Button>
        <Button
          variant="contained"
          onClick={submit}
          disabled={busy || !currentPassword || !newPassword || !confirm}
        >
          {busy ? 'Saving…' : 'Change password'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** Toolbar button + dialog, for shells that only need one element. */
export default function ChangePasswordButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Tooltip title="Change your password">
        <IconButton aria-label="Change your password" onClick={() => setOpen(true)}>
          <KeyRound size={19} />
        </IconButton>
      </Tooltip>
      <ChangePasswordDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
