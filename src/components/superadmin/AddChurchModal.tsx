import React from 'react';
import { 
  Dialog, DialogTitle, DialogContent, DialogActions, 
  Button, TextField, Grid, MenuItem, Typography, 
  Box, Divider, FormControlLabel, Checkbox, 
  CircularProgress, Alert, InputAdornment, 
  LinearProgress, Switch
} from '@mui/material';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Globe, Mail, Phone, MapPin, Shield, CheckCircle } from 'lucide-react';
import { ChurchWithAdmin, FeatureFlags } from '../../types/church';
import { DENOMINATIONS, DEFAULT_DENOMINATION } from '../../lib/denominations';

const churchSchema = z.object({
  name: z.string().min(3, 'Church name must be at least 3 characters'),
  websiteUrl: z.string().url('Please enter a valid website URL').optional().or(z.literal('')),
  contactEmail: z.string().email('Invalid contact email'),
  denomination: z.enum(['pentecostal_charismatic', 'evangelical_baptist', 'mainline_protestant', 'orthodox_catholic', 'adventist', 'non_denominational']),
  adminName: z.string().min(2, 'Admin name must be at least 2 characters'),
  adminEmail: z.string().email('Invalid admin email'),
  adminPassword: z.string().optional(),
  autoGeneratePassword: z.boolean(),
  planId: z.enum(['free_trial', 'basic', 'pro', 'enterprise']),
  phone: z.string().optional(),
  timezone: z.string(),
  street: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  sendWelcomeEmail: z.boolean(),
  featureFlags: z.object({
    giving: z.boolean(),
    childCheckin: z.boolean(),
    sms: z.boolean(),
    api: z.boolean(),
  })
});

type ChurchFormValues = z.infer<typeof churchSchema>;

interface AddChurchModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: ChurchFormValues) => void;
  isLoading: boolean;
  error?: string | null;
}

const AddChurchModal: React.FC<AddChurchModalProps> = ({ open, onClose, onSubmit, isLoading, error }) => {
  const { control, handleSubmit, watch, setValue, formState: { errors } } = useForm<ChurchFormValues>({
    resolver: zodResolver(churchSchema),
    defaultValues: {
      name: '',
      websiteUrl: '',
      contactEmail: '',
      denomination: DEFAULT_DENOMINATION,
      adminName: '',
      adminEmail: '',
      autoGeneratePassword: true,
      planId: 'free_trial',
      timezone: 'UTC',
      sendWelcomeEmail: true,
      featureFlags: {
        giving: true,
        childCheckin: true,
        sms: false,
        api: false
      }
    }
  });

  const autoGenerate = watch('autoGeneratePassword');
  const planId = watch('planId');

  const passwordStrength = (pass: string) => {
    if (!pass) return 0;
    let score = 0;
    if (pass.length > 8) score += 25;
    if (/[a-z]/.test(pass)) score += 25;
    if (/[A-Z]/.test(pass)) score += 25;
    if (/[0-9]/.test(pass) || /[^A-Za-z0-9]/.test(pass)) score += 25;
    return score;
  };

  const pass = watch('adminPassword') || '';
  const strength = passwordStrength(pass);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth PaperProps={{ sx: { borderRadius: 4 } }}>
      <form onSubmit={handleSubmit(onSubmit)}>
        <DialogTitle sx={{ fontWeight: 800, fontSize: '1.5rem', px: 4, pt: 4 }}>
          Add New Church
          <Typography variant="body2" color="text.secondary" fontWeight={500}>
            Provision a new church instance and set up the primary admin.
          </Typography>
        </DialogTitle>
        
        <DialogContent sx={{ px: 4, pb: 4 }}>
          {error && <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}>{error}</Alert>}
          
          <Grid container spacing={3}>
            {/* Section 1: Church Identity */}
            <Grid size={{ xs: 12 }}>
              <Typography variant="subtitle2" fontWeight={800} color="primary" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                <Globe size={18} /> CHURCH IDENTITY
              </Typography>
            </Grid>
            
            <Grid size={{ xs: 12, md: 6 }}>
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
                    placeholder="e.g. Grace Fellowship"
                  />
                )}
              />
            </Grid>
            
            <Grid size={{ xs: 12, md: 6 }}>
              <Controller
                name="websiteUrl"
                control={control}
                render={({ field }) => (
                  <TextField 
                    {...field}
                    label="Website URL"
                    fullWidth
                    error={!!errors.websiteUrl}
                    helperText={errors.websiteUrl?.message || 'Optional. The church\u2019s public website address.'}
                    placeholder="https://www.gracefellowship.org"
                  />
                )}
              />
            </Grid>

            <Grid size={{ xs: 12 }}>
              <Controller
                name="denomination"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    select
                    label="Denomination"
                    fullWidth
                    error={!!errors.denomination}
                    helperText={
                      errors.denomination?.message ||
                      'Determines the portal the church admin will use.'
                    }
                  >
                    {DENOMINATIONS.map(d => (
                      <MenuItem key={d.id} value={d.id}>{d.label}</MenuItem>
                    ))}
                  </TextField>
                )}
              />
            </Grid>

            {/* Section 2: Contact & Admin */}
            <Grid size={{ xs: 12 }}>
              <Divider sx={{ my: 1 }} />
              <Typography variant="subtitle2" fontWeight={800} color="primary" sx={{ my: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                <Shield size={18} /> PRIMARY ADMIN & CONTACT
              </Typography>
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <Controller
                name="adminName"
                control={control}
                render={({ field }) => (
                  <TextField 
                    {...field}
                    label="Admin Full Name"
                    fullWidth
                    error={!!errors.adminName}
                    helperText={errors.adminName?.message}
                  />
                )}
              />
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <Controller
                name="adminEmail"
                control={control}
                render={({ field }) => (
                  <TextField 
                    {...field}
                    label="Admin Email"
                    fullWidth
                    error={!!errors.adminEmail}
                    helperText={errors.adminEmail?.message}
                  />
                )}
              />
            </Grid>

            <Grid size={{ xs: 12 }}>
              <FormControlLabel
                control={<Controller name="autoGeneratePassword" control={control} render={({ field: { value, onChange } }) => (
                  <Checkbox checked={value} onChange={onChange} />
                )} />}
                label="Auto-generate password and email to user"
              />
            </Grid>

            {!autoGenerate && (
              <Grid size={{ xs: 12 }}>
                <Controller
                  name="adminPassword"
                  control={control}
                  render={({ field }) => (
                    <Box>
                      <TextField 
                        {...field}
                        label="Set Custom Password"
                        type="password"
                        fullWidth
                        error={ strength > 0 && strength < 75 }
                        helperText="Use a strong password with symbols and numbers."
                      />
                      <Box sx={{ mt: 1 }}>
                        <LinearProgress 
                          variant="determinate" 
                          value={strength} 
                          color={strength < 50 ? 'error' : strength < 75 ? 'warning' : 'success'} 
                          sx={{ borderRadius: 1, height: 6 }}
                        />
                      </Box>
                    </Box>
                  )}
                />
              </Grid>
            )}

            {/* Section 3: Billing & Plan */}
            <Grid size={{ xs: 12 }}>
              <Divider sx={{ my: 1 }} />
              <Typography variant="subtitle2" fontWeight={800} color="primary" sx={{ my: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                <CheckCircle size={18} /> PLAN & FEATURES
              </Typography>
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <Controller
                name="planId"
                control={control}
                render={({ field }) => (
                  <TextField 
                    {...field}
                    select
                    label="Subscription Plan"
                    fullWidth
                  >
                    <MenuItem value="free_trial">Free Trial (30 Days)</MenuItem>
                    <MenuItem value="basic">Basic Plan</MenuItem>
                    <MenuItem value="pro">Pro Plan</MenuItem>
                    <MenuItem value="enterprise">Enterprise Plan</MenuItem>
                  </TextField>
                )}
              />
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <Box sx={{ p: 2, bgcolor: 'background.default', borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
                <Typography variant="caption" fontWeight={700} color="text.secondary">FEATURE FLAGS</Typography>
                <Grid container spacing={1}>
                  {['giving', 'childCheckin', 'sms', 'api'].map((flag) => (
                    <Grid size={{ xs: 6 }} key={flag}>
                      <FormControlLabel
                        control={<Controller name={`featureFlags.${flag}` as any} control={control} render={({ field: { value, onChange } }) => (
                          <Switch size="small" checked={value} onChange={onChange} />
                        )} />}
                        label={flag.charAt(0).toUpperCase() + flag.slice(1)}
                        sx={{ '& .MuiTypography-root': { fontSize: '0.75rem', fontWeight: 600 } }}
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
              bgcolor: '#1b4332',
              '&:hover': { bgcolor: '#2d6a4f' }
            }}
          >
            {isLoading ? <CircularProgress size={24} /> : 'Create Church'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};

export default AddChurchModal;
