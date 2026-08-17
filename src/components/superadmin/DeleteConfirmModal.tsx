import React from 'react';
import { 
  Dialog, DialogTitle, DialogContent, DialogActions, 
  Button, Typography, Box, CircularProgress, 
  Alert, RadioGroup, FormControlLabel, Radio
} from '@mui/material';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { Church } from '../../types/church';

interface DeleteConfirmModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (mode: 'soft' | 'permanent') => void;
  isLoading: boolean;
  church: Church | null;
  error?: string | null;
}

const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({ open, onClose, onConfirm, isLoading, church, error }) => {
  const [mode, setMode] = React.useState<'soft' | 'permanent'>('soft');

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 4 } }}>
      <DialogTitle sx={{ fontWeight: 800, pt: 4, px: 3, textAlign: 'center' }}>
        <Box sx={{ display: 'inline-flex', p: 2, bgcolor: '#fef2f2', color: '#ef4444', borderRadius: '50%', mb: 2 }}>
          <AlertTriangle size={32} />
        </Box>
        <Typography variant="h5" fontWeight={800} sx={{ display: 'block' }}>
          Delete Church?
        </Typography>
      </DialogTitle>
      
      <DialogContent sx={{ px: 3 }}>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        
        <Typography variant="body1" textAlign="center" color="text.secondary" sx={{ mb: 3 }}>
          You are about to delete <strong>{church?.name}</strong>. Please choose how you want to proceed.
        </Typography>

        <Box sx={{ p: 2, bgcolor: '#f8fafc', borderRadius: 2 }}>
          <RadioGroup value={mode} onChange={(e) => setMode(e.target.value as any)}>
            <FormControlLabel 
              value="soft" 
              control={<Radio color="error" />} 
              label={
                <Box>
                  <Typography variant="body2" fontWeight={700}>Soft Delete (Recommended)</Typography>
                  <Typography variant="caption" color="text.secondary">Move to deleted status. Data is preserved but hidden and inactive.</Typography>
                </Box>
              }
              sx={{ mb: 2, alignItems: 'flex-start', '& .MuiRadio-root': { pt: 0 } }}
            />
            <FormControlLabel 
              value="permanent" 
              control={<Radio color="error" />} 
              label={
                <Box>
                  <Typography variant="body2" fontWeight={700}>Permanent Delete</Typography>
                  <Typography variant="caption" color="error">COMPLETELY REMOVE all data. This action cannot be undone.</Typography>
                </Box>
              }
              sx={{ alignItems: 'flex-start', '& .MuiRadio-root': { pt: 0 } }}
            />
          </RadioGroup>
        </Box>
      </DialogContent>
      
      <DialogActions sx={{ p: 3, flexDirection: 'column', gap: 1 }}>
        <Button 
          fullWidth
          variant="contained" 
          color="error"
          onClick={() => onConfirm(mode)}
          disabled={isLoading}
          startIcon={isLoading ? <CircularProgress size={18} color="inherit" /> : <Trash2 size={18} />}
          sx={{ py: 1.5, borderRadius: 3, fontWeight: 800 }}
        >
          {isLoading ? 'Processing...' : mode === 'soft' ? 'Soft Delete Church' : 'Permanently Delete Church'}
        </Button>
        <Button 
          fullWidth
          onClick={onClose} 
          variant="text" 
          color="inherit" 
          sx={{ fontWeight: 700 }}
        >
          Cancel
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default DeleteConfirmModal;
