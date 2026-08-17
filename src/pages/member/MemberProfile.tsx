import { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  Grid,
  TextField,
  Button,
  Avatar,
  Chip,
  Snackbar,
  Alert,
  CircularProgress,
  Stack,
  Divider,
  MenuItem,
  FormGroup,
  FormControlLabel,
  Switch,
  Card,
  CardContent,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
} from '@mui/material';
import { Save, User, Users, CreditCard, Bell, Printer } from 'lucide-react';
import {
  profileService,
  ProfileResponse,
  ProfileUpdatePayload,
  CommPreferences,
} from '../../services/profileService';
import { useAuth } from '../../contexts/AuthContext';

type Toast = { open: boolean; message: string; severity: 'success' | 'error' | 'info' };

const COMM_CHANNELS: Array<{ key: keyof CommPreferences; label: string }> = [
  { key: 'email', label: 'Email' },
  { key: 'sms', label: 'SMS' },
  { key: 'whatsapp', label: 'WhatsApp' },
];
const COMM_TOPICS: Array<{ key: keyof CommPreferences; label: string }> = [
  { key: 'announcements', label: 'Announcements' },
  { key: 'events', label: 'Event reminders' },
  { key: 'giving', label: 'Giving receipts' },
];

function toDateInput(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    return new Date(iso).toISOString().split('T')[0];
  } catch {
    return '';
  }
}

export default function MemberProfile() {
  const { user } = useAuth();
  const [data, setData] = useState<ProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<Toast>({ open: false, message: '', severity: 'success' });

  const [form, setForm] = useState<ProfileUpdatePayload>({});
  const [prefs, setPrefs] = useState<CommPreferences>({});

  const notify = (message: string, severity: Toast['severity'] = 'success') =>
    setToast({ open: true, message, severity });

  const load = async () => {
    try {
      const res = await profileService.getProfile();
      setData(res);
      const p = res.profile;
      setForm({
        firstName: p?.firstName || (res.account.name || '').split(' ')[0] || '',
        lastName: p?.lastName || (res.account.name || '').split(' ').slice(1).join(' ') || '',
        phone: p?.phone || '',
        gender: p?.gender || '',
        dateOfBirth: toDateInput(p?.dateOfBirth),
        maritalStatus: p?.maritalStatus || '',
        anniversaryDate: toDateInput(p?.anniversaryDate),
        address: p?.address || '',
        occupation: p?.occupation || '',
        photoUrl: p?.photoUrl || '',
      });
      setPrefs(p?.commPreferences || {});
    } catch (e: any) {
      notify(e?.message || 'Failed to load your profile', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const setField = (key: keyof ProfileUpdatePayload, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: ProfileUpdatePayload = { ...form, commPreferences: prefs };
      const res = await profileService.updateProfile(payload);
      notify(res.created ? 'Profile created. Pending church approval.' : 'Your profile has been updated.');
      await load();
    } catch (e: any) {
      notify(e?.message || 'Could not save your profile', 'error');
    } finally {
      setSaving(false);
    }
  };

  const fullName = useMemo(
    () => `${form.firstName || ''} ${form.lastName || ''}`.trim() || user?.name || 'Member',
    [form.firstName, form.lastName, user]
  );

  const printCard = () => window.print();

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  const profile = data?.profile;
  const church = data?.church;

  return (
    <Box>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" fontWeight={700} gutterBottom>
          My Profile
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Keep your details current so your church can stay in touch.
        </Typography>
      </Box>

      {!data?.hasMemberRecord && (
        <Alert severity="info" sx={{ mb: 3 }}>
          You don't have a member record yet. Fill in your details and save to create one — your church
          will review and approve it.
        </Alert>
      )}

      <Grid container spacing={3}>
        {/* Left: editable form */}
        <Grid item xs={12} md={8}>
          <Paper sx={{ p: 3 }}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
              <User size={18} />
              <Typography variant="h6" fontWeight={700}>
                Personal details
              </Typography>
            </Stack>

            <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 3 }}>
              <Avatar src={form.photoUrl || undefined} sx={{ width: 72, height: 72 }}>
                {(form.firstName || 'M').charAt(0)}
              </Avatar>
              <TextField
                label="Photo URL"
                fullWidth
                size="small"
                value={form.photoUrl || ''}
                onChange={(e) => setField('photoUrl', e.target.value)}
                placeholder="https://…"
                helperText="Paste a link to your photo"
              />
            </Stack>

            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <TextField label="First name" fullWidth value={form.firstName || ''} onChange={(e) => setField('firstName', e.target.value)} />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField label="Last name" fullWidth value={form.lastName || ''} onChange={(e) => setField('lastName', e.target.value)} />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField label="Email" fullWidth value={data?.account.email || ''} disabled helperText="Managed by your login" />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField label="Phone" fullWidth value={form.phone || ''} onChange={(e) => setField('phone', e.target.value)} />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField select label="Gender" fullWidth value={form.gender || ''} onChange={(e) => setField('gender', e.target.value)}>
                  <MenuItem value="">Prefer not to say</MenuItem>
                  <MenuItem value="Male">Male</MenuItem>
                  <MenuItem value="Female">Female</MenuItem>
                </TextField>
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField select label="Marital status" fullWidth value={form.maritalStatus || ''} onChange={(e) => setField('maritalStatus', e.target.value)}>
                  <MenuItem value="">—</MenuItem>
                  <MenuItem value="Single">Single</MenuItem>
                  <MenuItem value="Married">Married</MenuItem>
                  <MenuItem value="Widowed">Widowed</MenuItem>
                  <MenuItem value="Divorced">Divorced</MenuItem>
                </TextField>
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField label="Date of birth" type="date" fullWidth InputLabelProps={{ shrink: true }} value={form.dateOfBirth || ''} onChange={(e) => setField('dateOfBirth', e.target.value)} />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField label="Anniversary" type="date" fullWidth InputLabelProps={{ shrink: true }} value={form.anniversaryDate || ''} onChange={(e) => setField('anniversaryDate', e.target.value)} />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField label="Occupation" fullWidth value={form.occupation || ''} onChange={(e) => setField('occupation', e.target.value)} />
              </Grid>
              <Grid item xs={12}>
                <TextField label="Address" fullWidth multiline minRows={2} value={form.address || ''} onChange={(e) => setField('address', e.target.value)} />
              </Grid>
            </Grid>

            <Divider sx={{ my: 3 }} />

            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
              <Bell size={18} />
              <Typography variant="h6" fontWeight={700}>
                Communication preferences
              </Typography>
            </Stack>
            <Typography variant="body2" color="text.secondary">
              How would you like to hear from your church?
            </Typography>
            <Grid container spacing={2} sx={{ mt: 0.5 }}>
              <Grid item xs={12} sm={6}>
                <Typography variant="subtitle2" gutterBottom>
                  Channels
                </Typography>
                <FormGroup>
                  {COMM_CHANNELS.map((c) => (
                    <FormControlLabel
                      key={c.key}
                      control={
                        <Switch
                          checked={!!prefs[c.key]}
                          onChange={(e) => setPrefs((p) => ({ ...p, [c.key]: e.target.checked }))}
                        />
                      }
                      label={c.label}
                    />
                  ))}
                </FormGroup>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Typography variant="subtitle2" gutterBottom>
                  Topics
                </Typography>
                <FormGroup>
                  {COMM_TOPICS.map((c) => (
                    <FormControlLabel
                      key={c.key}
                      control={
                        <Switch
                          checked={!!prefs[c.key]}
                          onChange={(e) => setPrefs((p) => ({ ...p, [c.key]: e.target.checked }))}
                        />
                      }
                      label={c.label}
                    />
                  ))}
                </FormGroup>
              </Grid>
            </Grid>

            <Box sx={{ mt: 3, textAlign: 'right' }}>
              <Button variant="contained" size="large" startIcon={<Save size={18} />} disabled={saving} onClick={handleSave}>
                {saving ? 'Saving…' : 'Save changes'}
              </Button>
            </Box>
          </Paper>
        </Grid>

        {/* Right: digital member card + family */}
        <Grid item xs={12} md={4}>
          <Card
            sx={{
              mb: 3,
              background: 'linear-gradient(135deg, #1e3a8a 0%, #4338ca 100%)',
              color: '#fff',
            }}
          >
            <CardContent>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Stack direction="row" spacing={1} alignItems="center">
                  <CreditCard size={18} />
                  <Typography variant="overline">Member Card</Typography>
                </Stack>
                {profile?.approvalStatus && (
                  <Chip
                    size="small"
                    label={profile.approvalStatus}
                    sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: '#fff', textTransform: 'capitalize' }}
                  />
                )}
              </Stack>
              <Stack direction="row" spacing={2} alignItems="center" sx={{ mt: 2 }}>
                <Avatar src={form.photoUrl || undefined} sx={{ width: 56, height: 56, border: '2px solid rgba(255,255,255,0.6)' }}>
                  {(form.firstName || 'M').charAt(0)}
                </Avatar>
                <Box>
                  <Typography variant="h6" fontWeight={700} sx={{ lineHeight: 1.2 }}>
                    {fullName}
                  </Typography>
                  <Typography variant="body2" sx={{ opacity: 0.85 }}>
                    {church?.name || 'Your Church'}
                  </Typography>
                </Box>
              </Stack>
              <Divider sx={{ my: 2, borderColor: 'rgba(255,255,255,0.2)' }} />
              <Stack direction="row" justifyContent="space-between">
                <Box>
                  <Typography variant="caption" sx={{ opacity: 0.7 }}>
                    Member ID
                  </Typography>
                  <Typography variant="body2" fontFamily="monospace">
                    {profile?.membershipId || profile?.id?.slice(-8).toUpperCase() || '—'}
                  </Typography>
                </Box>
                <Box sx={{ textAlign: 'right' }}>
                  <Typography variant="caption" sx={{ opacity: 0.7 }}>
                    Member since
                  </Typography>
                  <Typography variant="body2">
                    {profile?.joinDate ? new Date(profile.joinDate).getFullYear() : '—'}
                  </Typography>
                </Box>
              </Stack>
            </CardContent>
          </Card>
          <Button fullWidth startIcon={<Printer size={16} />} onClick={printCard} sx={{ mb: 3 }}>
            Print / save card
          </Button>

          <Paper sx={{ p: 3 }}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
              <Users size={18} />
              <Typography variant="h6" fontWeight={700}>
                My family
              </Typography>
            </Stack>
            {data?.family ? (
              <Typography variant="body2" color="text.secondary" gutterBottom>
                {data.family.name}
              </Typography>
            ) : null}
            {data && data.familyMembers.length > 0 ? (
              <List dense>
                {data.familyMembers.map((m) => (
                  <ListItem key={m.id} disableGutters>
                    <ListItemAvatar>
                      <Avatar>{(m.firstName || '?').charAt(0)}</Avatar>
                    </ListItemAvatar>
                    <ListItemText
                      primary={`${m.firstName} ${m.lastName}`}
                      secondary={m.phone || m.email || ''}
                    />
                  </ListItem>
                ))}
              </List>
            ) : (
              <Typography variant="body2" color="text.secondary">
                No family members linked yet. Ask your church office to link your household.
              </Typography>
            )}
          </Paper>
        </Grid>
      </Grid>

      <Snackbar
        open={toast.open}
        autoHideDuration={4000}
        onClose={() => setToast((t) => ({ ...t, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={toast.severity} variant="filled" onClose={() => setToast((t) => ({ ...t, open: false }))}>
          {toast.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
