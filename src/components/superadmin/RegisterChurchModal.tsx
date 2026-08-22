import React, { useState } from 'react';
import { 
  Dialog, DialogTitle, DialogContent, Box, 
  TextField, Button, IconButton, Typography, 
  MenuItem, Checkbox, FormControlLabel, Switch,
  InputAdornment, CircularProgress,
  Stepper, Step, StepLabel, Divider, Alert
} from '@mui/material';
import { X, ShieldCheck, ChevronRight, ChevronLeft, Globe } from 'lucide-react';
import { useForm, Controller, SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
// Use the shared authenticated axios instance so the JWT bearer token is
// attached. Using the raw axios import previously caused 401 Unauthorized
// errors on the protected /superadmin endpoints.
import api from '../../services/api';
import { DENOMINATIONS, DEFAULT_DENOMINATION } from '../../lib/denominations';

const churchSchema = z.object({
  // Basic Info
  name: z.string().min(2, 'Church name must be at least 2 characters').max(100),
  websiteUrl: z.string().url('Enter a valid URL (e.g. https://mychurch.org)').optional().or(z.literal('')),
  contactEmail: z.string().email('Invalid contact email'),
  phone: z.string().optional(),
  
  // The denomination decides which portal the church admin will see, so it is
  // required rather than optional.
  denomination: z.enum(['pentecostal_charismatic', 'evangelical_baptist', 'mainline_protestant', 'orthodox_catholic', 'adventist', 'non_denominational']),

  // Address
  street: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  postal_code: z.string().optional(),
  country: z.string().min(1, 'Country is required'),
  timezone: z.string().min(1, 'Timezone is required'),

  // Admin Info
  adminName: z.string().min(2, 'Admin name must be at least 2 characters'),
  adminEmail: z.string().email('Invalid admin email'),
  adminPhone: z.string().optional(),
  adminPassword: z.string().optional(),
  autoGeneratePassword: z.boolean(),
  sendWelcomeEmail: z.boolean(),

  // Billing & Features
  planId: z.enum(['free_trial', 'basic', 'pro', 'enterprise']),
  trialEndDate: z.string().optional(),
  featureFlags: z.object({
    giving: z.boolean(),
    childCheckin: z.boolean(),
    sms: z.boolean(),
    api: z.boolean(),
  })
});

type ChurchSchema = z.infer<typeof churchSchema>;

const steps = ['Church Details', 'Primary Admin', 'Billing & Features'];

const TIMEZONES = [
  { value: 'UTC', label: 'UTC (GMT)' },
  { value: 'Africa/Accra', label: 'Africa/Accra (GMT)' },
  { value: 'America/New_York', label: 'America/New_York (EST/EDT)' },
  { value: 'Europe/London', label: 'Europe/London (GMT/BST)' },
  { value: 'Africa/Lagos', label: 'Africa/Lagos (GMT+1)' },
  { value: 'Asia/Dubai', label: 'Asia/Dubai (GMT+4)' },
];

const COUNTRIES = [
  { value: 'GH', label: 'Ghana' },
  { value: 'NG', label: 'Nigeria' },
  { value: 'US', label: 'United States' },
  { value: 'UK', label: 'United Kingdom' },
  { value: 'CA', label: 'Canada' },
];

export default function RegisterChurchModal({ open, onClose }: { open: boolean, onClose: () => void }) {
  const [activeStep, setActiveStep] = useState(0);
  const queryClient = useQueryClient();

  const { control, handleSubmit, watch, trigger, formState: { errors } } = useForm<ChurchSchema>({
    resolver: zodResolver(churchSchema),
    defaultValues: {
      name: '',
      websiteUrl: '',
      contactEmail: '',
      denomination: DEFAULT_DENOMINATION,
      phone: '',
      street: '',
      city: '',
      state: '',
      postal_code: '',
      adminName: '',
      adminEmail: '',
      adminPhone: '',
      adminPassword: '',
      autoGeneratePassword: true,
      sendWelcomeEmail: true,
      planId: 'free_trial',
      country: 'GH',
      timezone: 'Africa/Accra',
      featureFlags: {
        giving: true,
        childCheckin: false,
        sms: true,
        api: false
      }
    } as any
  });

  const churchName = watch('name');
  const planId = watch('planId');
  const autoGeneratePassword = watch('autoGeneratePassword');
  void churchName;

  const mutation = useMutation({
    mutationFn: (data: ChurchSchema) => api.post('/superadmin/churches', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['churches'] });
      onClose();
    }
  });

  const handleNext = async () => {
    if (activeStep === 0) {
      const isStep0Valid = await trigger(['name', 'contactEmail', 'denomination', 'country', 'timezone', 'phone', 'city', 'state', 'street', 'websiteUrl']);
      if (isStep0Valid) {
        setActiveStep(1);
      }
    } else if (activeStep === 1) {
      const step1Fields: (keyof ChurchSchema)[] = ['adminName', 'adminEmail', 'adminPhone'];
      if (!autoGeneratePassword) {
        step1Fields.push('adminPassword');
      }
      const isStep1Valid = await trigger(step1Fields);
      if (isStep1Valid) {
        setActiveStep(2);
      }
    }
  };

  const onSubmit: SubmitHandler<ChurchSchema> = (data) => {
    mutation.mutate(data);
  };

  const handleBack = () => setActiveStep((prev) => prev - 1);

  return (
    <Dialog 
      open={open} 
      onClose={onClose} 
      maxWidth="md" 
      fullWidth 
      PaperProps={{ 
        sx: { 
          borderRadius: 4, 
          overflow: 'hidden',
          bgcolor: '#0f172a',
          color: '#f8fafc',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
        } 
      }}
    >
      <DialogTitle sx={{ p: 3, bgcolor: '#1e293b', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid', borderColor: 'rgba(255, 255, 255, 0.1)' }}>
        <Box>
          <Typography variant="h5" fontWeight={800} sx={{ letterSpacing: '-0.5px', color: '#f8fafc' }}>Register New Church</Typography>
          <Typography variant="body2" sx={{ color: '#94a3b8' }}>Step {activeStep + 1}: {steps[activeStep]}</Typography>
        </Box>
        <IconButton onClick={onClose} size="small" sx={{ color: '#94a3b8', '&:hover': { color: '#f8fafc', bgcolor: 'rgba(255,255,255,0.1)' } }}><X size={20} /></IconButton>
      </DialogTitle>

      <form onSubmit={handleSubmit(onSubmit)}>
        <DialogContent sx={{ p: 4, bgcolor: '#0f172a' }}>
          <Stepper 
            activeStep={activeStep} 
            sx={{ 
              mb: 4,
              '& .MuiStepLabel-label': { color: '#94a3b8', fontWeight: 600 },
              '& .MuiStepLabel-label.Mui-active': { color: '#10b981', fontWeight: 800 },
              '& .MuiStepLabel-label.Mui-completed': { color: '#34d399' },
              '& .MuiStepIcon-root': { color: '#334155' },
              '& .MuiStepIcon-root.Mui-active': { color: '#10b981' },
              '& .MuiStepIcon-root.Mui-completed': { color: '#059669' }
            }}
          >
            {steps.map((label) => <Step key={label}><StepLabel>{label}</StepLabel></Step>)}
          </Stepper>

          {mutation.isError && (
            <Alert severity="error" sx={{ mb: 3, bgcolor: 'rgba(239, 68, 68, 0.15)', color: '#fca5a5', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
              {mutation.error instanceof Error ? mutation.error.message : 'Registration failed. Please try again.'}
            </Alert>
          )}

          <Box sx={{ minHeight: 320 }}>
            {activeStep === 0 && (
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3 }}>
                <Box>
                  <Controller name="name" control={control} render={({ field }) => (
                    <TextField 
                      {...field} 
                      label="Church Name" 
                      fullWidth 
                      required 
                      error={!!errors.name} 
                      helperText={errors.name?.message} 
                      InputLabelProps={{ sx: { color: '#94a3b8', '&.Mui-focused': { color: '#10b981' } } }}
                      sx={{ '& .MuiOutlinedInput-root': { color: '#f8fafc', bgcolor: '#1e293b', borderRadius: 2, '& fieldset': { borderColor: 'rgba(255,255,255,0.15)' }, '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.3)' }, '&.Mui-focused fieldset': { borderColor: '#10b981' } } }}
                    />
                  )} />
                </Box>
                <Box>
                  <Controller name="websiteUrl" control={control} render={({ field }) => (
                    <TextField 
                      {...field} 
                      label="Website URL (optional)" 
                      placeholder="https://mychurch.org"
                      fullWidth 
                      error={!!errors.websiteUrl}
                      helperText={errors.websiteUrl?.message || 'Optional — the church\u2019s public website'}
                      InputLabelProps={{ sx: { color: '#94a3b8', '&.Mui-focused': { color: '#10b981' } } }}
                      sx={{ '& .MuiOutlinedInput-root': { color: '#f8fafc', bgcolor: '#1e293b', borderRadius: 2, '& fieldset': { borderColor: 'rgba(255,255,255,0.15)' }, '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.3)' }, '&.Mui-focused fieldset': { borderColor: '#10b981' } } }}
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start"><Globe size={16} color="#94a3b8" /></InputAdornment>
                        )
                      }}
                    />
                  )} />
                </Box>
                <Box>
                  <Controller name="contactEmail" control={control} render={({ field }) => (
                    <TextField 
                      {...field} 
                      label="Contact Email" 
                      fullWidth 
                      required 
                      error={!!errors.contactEmail} 
                      helperText={errors.contactEmail?.message} 
                      InputLabelProps={{ sx: { color: '#94a3b8', '&.Mui-focused': { color: '#10b981' } } }}
                      sx={{ '& .MuiOutlinedInput-root': { color: '#f8fafc', bgcolor: '#1e293b', borderRadius: 2, '& fieldset': { borderColor: 'rgba(255,255,255,0.15)' }, '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.3)' }, '&.Mui-focused fieldset': { borderColor: '#10b981' } } }}
                    />
                  )} />
                </Box>
                <Box>
                  <Controller name="phone" control={control} render={({ field }) => (
                    <TextField 
                      {...field} 
                      label="Church Phone" 
                      fullWidth 
                      error={!!errors.phone} 
                      helperText={errors.phone?.message} 
                      InputLabelProps={{ sx: { color: '#94a3b8', '&.Mui-focused': { color: '#10b981' } } }}
                      sx={{ '& .MuiOutlinedInput-root': { color: '#f8fafc', bgcolor: '#1e293b', borderRadius: 2, '& fieldset': { borderColor: 'rgba(255,255,255,0.15)' }, '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.3)' }, '&.Mui-focused fieldset': { borderColor: '#10b981' } } }}
                    />
                  )} />
                </Box>
                <Box sx={{ gridColumn: 'span 2' }}>
                  <Controller name="denomination" control={control} render={({ field }) => (
                    <TextField
                      {...field}
                      select
                      label="Denomination"
                      fullWidth
                      required
                      error={!!errors.denomination}
                      helperText={
                        errors.denomination?.message ||
                        `Determines the portal the church admin will use \u2014 ${DENOMINATIONS.find(d => d.id === field.value)?.description || 'select a tradition'}`
                      }
                      InputLabelProps={{ sx: { color: '#94a3b8', '&.Mui-focused': { color: '#10b981' } } }}
                      FormHelperTextProps={{ sx: { color: '#94a3b8' } }}
                      sx={{ '& .MuiOutlinedInput-root': { color: '#f8fafc', bgcolor: '#1e293b', borderRadius: 2, '& fieldset': { borderColor: 'rgba(255,255,255,0.15)' }, '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.3)' }, '&.Mui-focused fieldset': { borderColor: '#10b981' } } }}
                    >
                      {DENOMINATIONS.map(d => (
                        <MenuItem key={d.id} value={d.id}>{d.label}</MenuItem>
                      ))}
                    </TextField>
                  )} />
                </Box>
                <Box sx={{ gridColumn: 'span 2' }}><Divider sx={{ borderColor: 'rgba(255,255,255,0.1)', color: '#94a3b8' }}>Location Info</Divider></Box>
                <Box>
                  <Controller name="country" control={control} render={({ field }) => (
                    <TextField 
                      {...field} 
                      select 
                      label="Country" 
                      fullWidth 
                      required
                      InputLabelProps={{ sx: { color: '#94a3b8', '&.Mui-focused': { color: '#10b981' } } }}
                      sx={{ '& .MuiOutlinedInput-root': { color: '#f8fafc', bgcolor: '#1e293b', borderRadius: 2, '& fieldset': { borderColor: 'rgba(255,255,255,0.15)' }, '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.3)' }, '&.Mui-focused fieldset': { borderColor: '#10b981' } } }}
                    >
                      {COUNTRIES.map(c => <MenuItem key={c.value} value={c.value}>{c.label}</MenuItem>)}
                    </TextField>
                  )} />
                </Box>
                <Box>
                  <Controller name="timezone" control={control} render={({ field }) => (
                    <TextField 
                      {...field} 
                      select 
                      label="Timezone" 
                      fullWidth 
                      required
                      InputLabelProps={{ sx: { color: '#94a3b8', '&.Mui-focused': { color: '#10b981' } } }}
                      sx={{ '& .MuiOutlinedInput-root': { color: '#f8fafc', bgcolor: '#1e293b', borderRadius: 2, '& fieldset': { borderColor: 'rgba(255,255,255,0.15)' }, '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.3)' }, '&.Mui-focused fieldset': { borderColor: '#10b981' } } }}
                    >
                      {TIMEZONES.map(t => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
                    </TextField>
                  )} />
                </Box>
                <Box sx={{ gridColumn: { xs: 'span 1', md: 'span 2' }, display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr 1fr' }, gap: 3 }}>
                   <Controller name="city" control={control} render={({ field }) => (
                     <TextField {...field} label="City" fullWidth InputLabelProps={{ sx: { color: '#94a3b8' } }} sx={{ '& .MuiOutlinedInput-root': { color: '#f8fafc', bgcolor: '#1e293b', borderRadius: 2, '& fieldset': { borderColor: 'rgba(255,255,255,0.15)' } } }} />
                   )} />
                   <Controller name="state" control={control} render={({ field }) => (
                     <TextField {...field} label="State / Province" fullWidth InputLabelProps={{ sx: { color: '#94a3b8' } }} sx={{ '& .MuiOutlinedInput-root': { color: '#f8fafc', bgcolor: '#1e293b', borderRadius: 2, '& fieldset': { borderColor: 'rgba(255,255,255,0.15)' } } }} />
                   )} />
                   <Controller name="street" control={control} render={({ field }) => (
                     <TextField {...field} label="Street Address" fullWidth InputLabelProps={{ sx: { color: '#94a3b8' } }} sx={{ '& .MuiOutlinedInput-root': { color: '#f8fafc', bgcolor: '#1e293b', borderRadius: 2, '& fieldset': { borderColor: 'rgba(255,255,255,0.15)' } } }} />
                   )} />
                </Box>
              </Box>
            )}

            {activeStep === 1 && (
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3 }}>
                <Box>
                  <Controller name="adminName" control={control} render={({ field }) => (
                    <TextField 
                      {...field} 
                      label="Admin Full Name" 
                      fullWidth 
                      required 
                      error={!!errors.adminName} 
                      helperText={errors.adminName?.message} 
                      InputLabelProps={{ sx: { color: '#94a3b8', '&.Mui-focused': { color: '#10b981' } } }}
                      sx={{ '& .MuiOutlinedInput-root': { color: '#f8fafc', bgcolor: '#1e293b', borderRadius: 2, '& fieldset': { borderColor: 'rgba(255,255,255,0.15)' }, '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.3)' }, '&.Mui-focused fieldset': { borderColor: '#10b981' } } }}
                    />
                  )} />
                </Box>
                <Box>
                  <Controller name="adminEmail" control={control} render={({ field }) => (
                    <TextField 
                      {...field} 
                      label="Admin Email" 
                      fullWidth 
                      required 
                      error={!!errors.adminEmail} 
                      helperText={errors.adminEmail?.message} 
                      InputLabelProps={{ sx: { color: '#94a3b8', '&.Mui-focused': { color: '#10b981' } } }}
                      sx={{ '& .MuiOutlinedInput-root': { color: '#f8fafc', bgcolor: '#1e293b', borderRadius: 2, '& fieldset': { borderColor: 'rgba(255,255,255,0.15)' }, '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.3)' }, '&.Mui-focused fieldset': { borderColor: '#10b981' } } }}
                    />
                  )} />
                </Box>
                <Box>
                  <Controller name="adminPhone" control={control} render={({ field }) => (
                    <TextField 
                      {...field} 
                      label="Admin Phone" 
                      fullWidth 
                      error={!!errors.adminPhone} 
                      helperText={errors.adminPhone?.message} 
                      InputLabelProps={{ sx: { color: '#94a3b8', '&.Mui-focused': { color: '#10b981' } } }}
                      sx={{ '& .MuiOutlinedInput-root': { color: '#f8fafc', bgcolor: '#1e293b', borderRadius: 2, '& fieldset': { borderColor: 'rgba(255,255,255,0.15)' }, '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.3)' }, '&.Mui-focused fieldset': { borderColor: '#10b981' } } }}
                    />
                  )} />
                </Box>
                <Box sx={{ gridColumn: 'span 2' }}><Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1, color: '#f8fafc' }}>Security</Typography></Box>
                <Box sx={{ gridColumn: 'span 2' }}>
                  <FormControlLabel
                    control={<Controller name="autoGeneratePassword" control={control} render={({ field: { value, onChange } }) => (
                      <Checkbox checked={value} onChange={onChange} sx={{ color: '#94a3b8', '&.Mui-checked': { color: '#10b981' } }} />
                    )} />}
                    label={<Typography sx={{ color: '#e2e8f0' }}>Auto-generate strong password</Typography>}
                  />
                  {!autoGeneratePassword && (
                    <Controller name="adminPassword" control={control} render={({ field }) => (
                      <TextField 
                        {...field} 
                        type="password" 
                        label="Custom Password" 
                        fullWidth 
                        sx={{ mt: 2, '& .MuiOutlinedInput-root': { color: '#f8fafc', bgcolor: '#1e293b', borderRadius: 2, '& fieldset': { borderColor: 'rgba(255,255,255,0.15)' } } }} 
                        InputLabelProps={{ sx: { color: '#94a3b8' } }}
                      />
                    )} />
                  )}
                </Box>
                <Box sx={{ gridColumn: 'span 2' }}>
                  <FormControlLabel
                    control={<Controller name="sendWelcomeEmail" control={control} render={({ field: { value, onChange } }) => (
                      <Checkbox checked={value} onChange={onChange} sx={{ color: '#94a3b8', '&.Mui-checked': { color: '#10b981' } }} />
                    )} />}
                    label={<Typography sx={{ color: '#e2e8f0' }}>Send welcome email with login credentials</Typography>}
                  />
                </Box>
              </Box>
            )}

            {activeStep === 2 && (
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3 }}>
                <Box>
                  <Controller name="planId" control={control} render={({ field }) => (
                    <TextField 
                      {...field} 
                      select 
                      label="Subscription Plan" 
                      fullWidth 
                      required
                      InputLabelProps={{ sx: { color: '#94a3b8', '&.Mui-focused': { color: '#10b981' } } }}
                      sx={{ '& .MuiOutlinedInput-root': { color: '#f8fafc', bgcolor: '#1e293b', borderRadius: 2, '& fieldset': { borderColor: 'rgba(255,255,255,0.15)' }, '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.3)' }, '&.Mui-focused fieldset': { borderColor: '#10b981' } } }}
                    >
                      <MenuItem value="free_trial">Free Trial</MenuItem>
                      <MenuItem value="basic">Basic Plan ($49/mo)</MenuItem>
                      <MenuItem value="pro">Pro Plan ($99/mo)</MenuItem>
                      <MenuItem value="enterprise">Enterprise Plan ($249/mo)</MenuItem>
                    </TextField>
                  )} />
                </Box>
                {planId === 'free_trial' && (
                  <Box>
                    <Controller name="trialEndDate" control={control} render={({ field }) => (
                      <TextField 
                        {...field} 
                        type="date" 
                        label="Trial End Date" 
                        fullWidth 
                        InputLabelProps={{ shrink: true, sx: { color: '#94a3b8' } }} 
                        sx={{ '& .MuiOutlinedInput-root': { color: '#f8fafc', bgcolor: '#1e293b', borderRadius: 2, '& fieldset': { borderColor: 'rgba(255,255,255,0.15)' } } }}
                      />
                    )} />
                  </Box>
                )}
                
                <Box sx={{ gridColumn: 'span 2' }}><Divider sx={{ borderColor: 'rgba(255,255,255,0.1)', color: '#94a3b8' }}>Feature Flags</Divider></Box>
                
                <Box sx={{ gridColumn: 'span 2', display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: '1fr 1fr 1fr 1fr' }, gap: 3 }}>
                   <Box sx={{ textAlign: 'center', p: 2, border: '1px solid rgba(255,255,255,0.1)', bgcolor: '#1e293b', borderRadius: 2 }}>
                    <Typography variant="caption" fontWeight={700} sx={{ color: '#94a3b8' }}>ONLINE GIVING</Typography>
                    <Box><Controller name="featureFlags.giving" control={control} render={({ field: { value, onChange } }) => <Switch checked={value} onChange={onChange} color="success" />} /></Box>
                  </Box>
                  <Box sx={{ textAlign: 'center', p: 2, border: '1px solid rgba(255,255,255,0.1)', bgcolor: '#1e293b', borderRadius: 2 }}>
                    <Typography variant="caption" fontWeight={700} sx={{ color: '#94a3b8' }}>CHILD CHECK-IN</Typography>
                    <Box><Controller name="featureFlags.childCheckin" control={control} render={({ field: { value, onChange } }) => <Switch checked={value} onChange={onChange} color="success" />} /></Box>
                  </Box>
                  <Box sx={{ textAlign: 'center', p: 2, border: '1px solid rgba(255,255,255,0.1)', bgcolor: '#1e293b', borderRadius: 2 }}>
                    <Typography variant="caption" fontWeight={700} sx={{ color: '#94a3b8' }}>SMS NOTIFS</Typography>
                    <Box><Controller name="featureFlags.sms" control={control} render={({ field: { value, onChange } }) => <Switch checked={value} onChange={onChange} color="success" />} /></Box>
                  </Box>
                  <Box sx={{ textAlign: 'center', p: 2, border: '1px solid rgba(255,255,255,0.1)', bgcolor: '#1e293b', borderRadius: 2 }}>
                    <Typography variant="caption" fontWeight={700} sx={{ color: '#94a3b8' }}>API ACCESS</Typography>
                    <Box><Controller name="featureFlags.api" control={control} render={({ field: { value, onChange } }) => <Switch checked={value} onChange={onChange} color="success" />} /></Box>
                  </Box>
                </Box>
              </Box>
            )}
          </Box>
        </DialogContent>

        <Box sx={{ p: 3, bgcolor: '#1e293b', display: 'flex', justifyContent: 'space-between', borderTop: '1px solid', borderColor: 'rgba(255, 255, 255, 0.1)' }}>
          <Button 
            disabled={activeStep === 0 || mutation.isPending} 
            onClick={handleBack} 
            startIcon={<ChevronLeft size={18} />}
            sx={{ fontWeight: 700, color: '#94a3b8', '&:hover': { color: '#f8fafc' } }}
          >
            Back
          </Button>
          
          {activeStep < steps.length - 1 ? (
            <Button 
              type="button" 
              variant="contained" 
              onClick={handleNext}
              disabled={mutation.isPending}
              endIcon={<ChevronRight size={18} />}
              sx={{ borderRadius: 3, px: 4, fontWeight: 800, bgcolor: '#10b981', color: '#0f172a', '&:hover': { bgcolor: '#34d399' } }}
            >
              Next
            </Button>
          ) : (
            <Button 
              type="submit" 
              variant="contained" 
              disabled={mutation.isPending}
              endIcon={mutation.isPending ? <CircularProgress size={18} color="inherit" /> : <ShieldCheck size={18} />}
              sx={{ borderRadius: 3, px: 4, fontWeight: 800, bgcolor: '#10b981', color: '#0f172a', '&:hover': { bgcolor: '#34d399' } }}
            >
              {mutation.isPending ? 'Registering...' : 'Complete Registration'}
            </Button>
          )}
        </Box>
      </form>
    </Dialog>
  );
}
