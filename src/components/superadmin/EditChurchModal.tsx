import React, { useEffect } from 'react';
import { 
  Dialog, DialogTitle, DialogContent, DialogActions, 
  Button, TextField, Grid, MenuItem, Typography, 
  Box, Divider, FormControlLabel, CircularProgress, 
  Alert, Switch, useTheme
} from '@mui/material';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Globe, Shield, CheckCircle } from 'lucide-react';
import { Church, FeatureFlags } from '../../types/church';

const editChurchSchema = z.object({
  name: z.string().min(3, 'Church name must be at least 3 characters'),
  contactEmail: z.string().email('Invalid contact email'),
  status: z.enum(['active', 'trial', 'suspended', 'deleted']),
  planId: z.enum(['free_trial', 'basic', 'pro', 'enterprise']),
  phone: z.string().optional(),
  timezone: z.string(),
  street: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  trialEndDate: z.string().optional(),
  featureFlags: z.object({
    giving: z.boolean(),
    childCheckin: z.boolean(),
    sms: z.boolean(),
    api: z.boolean(),
  })
});

type EditChurchFormValues = z.infer<typeof editChurchSchema>;

interface EditChurchModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: EditChurchFormValues) => void;
  isLoading: boolean;
  church: Church | null;
  error?: string | null;
}

const EditChurchModal: React.FC<EditChurchModalProps> = ({ open, onClose, onSubmit, isLoading, church, error }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  const { control, handleSubmit, reset, watch, formState: { errors } } = useForm<EditChurchFormValues>({
    resolver: zodResolver(editChurchSchema),
    defaultValues: {
      name: '',
      contactEmail: '',
      status: 'active',
      planId: 'basic',
      timezone: 'UTC',
      featureFlags: {
        giving: true,
        childCheckin: true,
        sms: false,
        api: false
      }
    }
  });

  useEffect(() => {
    if (church) {
      const flags = typeof church.featureFlags === 'string' 
        ? JSON.parse(church.featureFlags) 
        : (church.featureFlags || { giving: true, childCheckin: true, sms: false, api: false });

      reset({
        name: church.name,
        contactEmail: church.contactEmail || church.adminEmail,
        status: church.status,
        planId: church.planId,
        phone: church.phone || '',
        timezone: church.timezone || 'UTC',
        street: church.street || '',
        city: church.city || '',
        country: church.country || '',
        trialEndDate: church.trialEndDate ? new Date(church.trialEndDate).toISOString().split('T')[0] : '',
        featureFlags: flags
      });
    }
  }, [church, reset]);

  const planId = watch('planId');

  return (
    <Dialog 
      open={open} 
      onClose={onClose} 
      maxWidth="md" 
      fullWidth 
      PaperProps={{ 
        sx: { 
          borderRadius: 4,
          bgcolor: 'background.paper',
          border: '1px solid',
          borderColor: 'divider'
        } 
      }}
    >
      <form onSubmit={handleSubmit(onSubmit)}>
        <DialogTitle sx={{ fontWeight: 800, fontSize: '1.5rem', px: 4, pt: 4, color: 'text.primary' }}>
          Edit Church: {church?.name}
          <Typography variant="body2" color="text.secondary" fontWeight={500}>
            Update church settings, plan, and feature availability.
          </Typography>
        </DialogTitle>
        
        <DialogContent sx={{ px: 4, pb: 4 }}>
          {error && <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}>{error}</Alert>}
          
          <Grid container spacing={3}>
            <Grid size={{ xs: 12 }}>
              <Typography variant="subtitle2" fontWeight={800} color="primary" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                <Globe size={18} /> BASIC INFORMATION
              </Typography>
            </Grid>
            
            <Grid size={{ xs: 12, md: 8 }}>
              <Controller
                name="name"
                control={control}
                render={({ field }) => (
                  <TextField 
                    {...field}
                    label="Church Name"
                    fullWidth
                    error={!!errors.name}
                    helperText={errors.name?.message}
                  />
                )}
              />
            </Grid>

            <Grid size={{ xs: 12, md: 4 }}>
              <Box sx={{ p: 1.5, bgcolor: isDark ? 'rgba(255, 255, 255, 0.05)' : '#f1f5f9', borderRadius: 2, display: 'flex', alignItems: 'center', gap: 1, border: '1px solid', borderColor: 'divider' }}>
                <Globe size={16} color={isDark ? '#94a3b8' : '#64748b'} />
                <Typography variant="body2" fontWeight={700} color="text.secondary" noWrap>
                  {church?.websiteUrl || 'No website set'}
                </Typography>
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                Church website address.
              </Typography>
            </Grid>
            
            <Grid size={{ xs: 12, md: 6 }}>
              <Controller
                name="contactEmail"
                control={control}
                render={({ field }) => (
                  <TextField 
                    {...field}
                    label="Contact Email"
                    fullWidth
                    error={!!errors.contactEmail}
                    helperText={errors.contactEmail?.message}
                  />
                )}
              />
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <Controller
                name="phone"
                control={control}
                render={({ field }) => (
                  <TextField 
                    {...field}
                    label="Phone Number"
                    fullWidth
                  />
                )}
              />
            </Grid>

            <Grid size={{ xs: 12 }}>
              <Divider sx={{ my: 1 }} />
              <Typography variant="subtitle2" fontWeight={800} color="primary" sx={{ my: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                <Shield size={18} /> STATUS & SUBSCRIPTION
              </Typography>
            </Grid>

            <Grid size={{ xs: 12, md: 4 }}>
              <Controller
                name="status"
                control={control}
                render={({ field }) => (
                  <TextField 
                    {...field}
                    select
                    label="Status"
                    fullWidth
                  >
                    <MenuItem value="active">Active</MenuItem>
                    <MenuItem value="trial">Free Trial</MenuItem>
                    <MenuItem value="suspended">Suspended</MenuItem>
                    <MenuItem value="deleted">Deleted</MenuItem>
                  </TextField>
                )}
              />
            </Grid>

            <Grid size={{ xs: 12, md: 4 }}>
              <Controller
                name="planId"
                control={control}
                render={({ field }) => (
                  <TextField 
                    {...field}
                    select
                    label="Plan"
                    fullWidth
                  >
                    <MenuItem value="free_trial">Free Trial</MenuItem>
                    <MenuItem value="basic">Basic</MenuItem>
                    <MenuItem value="pro">Pro</MenuItem>
                    <MenuItem value="enterprise">Enterprise</MenuItem>
                  </TextField>
                )}
              />
            </Grid>

            {planId === 'free_trial' && (
              <Grid size={{ xs: 12, md: 4 }}>
                <Controller
                  name="trialEndDate"
                  control={control}
                  render={({ field }) => (
                    <TextField 
                      {...field}
                      label="Trial End Date"
                      type="date"
                      fullWidth
                      InputLabelProps={{ shrink: true }}
                    />
                  )}
                />
              </Grid>
            )}

            <Grid size={{ xs: 12 }}>
              <Divider sx={{ my: 1 }} />
              <Typography variant="subtitle2" fontWeight={800} color="primary" sx={{ my: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                <CheckCircle size={18} /> FEATURE ACCESS
              </Typography>
            </Grid>

            <Grid size={{ xs: 12 }}>
              <Box sx={{ p: 2, bgcolor: isDark ? 'rgba(255, 255, 255, 0.03)' : '#f8fafc', borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
                <Grid container spacing={2}>
                  {['giving', 'childCheckin', 'sms', 'api'].map((flag) => (
                    <Grid size={{ xs: 12, sm: 3 }} key={flag}>
                      <FormControlLabel
                        control={<Controller name={`featureFlags.${flag}` as any} control={control} render={({ field: { value, onChange } }) => (
                          <Switch checked={value} onChange={onChange} />
                        )} />}
                        label={flag.charAt(0).toUpperCase() + flag.slice(1).replace(/([A-Z])/g, ' $1')}
                        sx={{ '& .MuiTypography-root': { fontSize: '0.875rem', fontWeight: 600 } }}
                      />
                    </Grid>
                  ))}
                </Grid>
              </Box>
            </Grid>

          </Grid>
        </DialogContent>
        
        <DialogActions sx={{ px: 4, pb: 4, pt: 0 }}>
          <Button onClick={onClose} variant="text" color="inherit" sx={{ fontWeight: 700 }}>Cancel</Button>
          <Button 
            type="submit" 
            variant="contained" 
            disabled={isLoading}
            sx={{ 
              borderRadius: 3, 
              px: 4, 
              fontWeight: 800, 
              bgcolor: isDark ? '#2563eb' : '#1b4332',
              '&:hover': { bgcolor: isDark ? '#1d4ed8' : '#2d6a4f' }
            }}
          >
            {isLoading ? <CircularProgress size={24} color="inherit" /> : 'Save Changes'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};

export default EditChurchModal;
