import React, { useEffect, useState } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Typography, CircularProgress, Alert, TextField, Stack } from '@mui/material';
import { Trash2 } from 'lucide-react';
import { Church } from '../../types/church';

interface DeleteConfirmModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (mode: 'soft') => void;
  isLoading: boolean;
  church: Church | null;
  error?: string | null;
}
const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({ open, onClose, onConfirm, isLoading, church, error }) => {
  const [confirmation, setConfirmation] = useState('');
  useEffect(() => { if (open) setConfirmation(''); }, [open, church?.id]);
  const confirmed = !!church && confirmation.trim() === church.name.trim();
  return (
    <Dialog open={open} onClose={() => { if (!isLoading) onClose(); }} maxWidth="xs" fullWidth aria-labelledby="delete-church-title">
      <DialogTitle id="delete-church-title" fontWeight={700}>Delete church?</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <Typography>You are deleting <strong>{church?.name}</strong>.</Typography>
          <Alert severity="warning">The church will be removed from the normal list, and its users will lose access immediately. Records are retained. You can restore it from the Deleted status filter.</Alert>
          <TextField fullWidth autoFocus label="Type the church name to confirm" value={confirmation} disabled={isLoading}
            onChange={e => setConfirmation(e.target.value)} autoComplete="off" helperText={church?.name} />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ p: 3, gap: 1 }}>
        <Button onClick={onClose} disabled={isLoading} sx={{ minHeight: 44 }}>Cancel</Button>
        <Button variant="contained" color="error" onClick={() => onConfirm('soft')} disabled={isLoading || !confirmed} sx={{ minHeight: 44 }}
          startIcon={isLoading ? <CircularProgress size={18} color="inherit" /> : <Trash2 size={18} />}>
          {isLoading ? 'Deleting…' : 'Delete Church'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
export default DeleteConfirmModal;
