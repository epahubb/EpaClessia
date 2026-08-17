import { useEffect, useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  Grid,
  Card,
  CardContent,
  Avatar,
  Chip,
  Snackbar,
  Alert,
  CircularProgress,
  Stack,
  TextField,
  InputAdornment,
  FormControlLabel,
  Switch,
  Button,
  Divider,
} from '@mui/material';
import { Search, Phone, Mail, Shield } from 'lucide-react';
import {
  memberEngagementService,
  DirectoryEntry,
  DirectoryPreferences,
} from '../../services/memberEngagementService';

type Toast = { open: boolean; message: string; severity: 'success' | 'error' | 'info' };

function initials(name: string): string {
  return name
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export default function MemberDirectory() {
  const [entries, setEntries] = useState<DirectoryEntry[]>([]);
  const [prefs, setPrefs] = useState<DirectoryPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState<Toast>({ open: false, message: '', severity: 'success' });

  const notify = (message: string, severity: Toast['severity'] = 'success') =>
    setToast({ open: true, message, severity });

  const load = async () => {
    setLoading(true);
    try {
      const [dir, pref] = await Promise.all([
        memberEngagementService.getDirectory().catch(() => []),
        memberEngagementService.getDirectoryPreferences().catch(() => null),
      ]);
      setEntries(dir);
      setPrefs(pref);
    } catch {
      notify('Failed to load directory', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const updatePref = async (patch: Partial<DirectoryPreferences>) => {
    if (!prefs) return;
    const next = { ...prefs, ...patch };
    setPrefs(next);
    setSaving(true);
    try {
      await memberEngagementService.updateDirectoryPreferences({
        directoryOptIn: next.directoryOptIn,
        directoryShowPhone: next.directoryShowPhone,
        directoryShowEmail: next.directoryShowEmail,
      });
      notify('Directory preferences updated.', 'success');
      load();
    } catch (e: any) {
      notify(e?.response?.data?.error || 'Failed to update preferences', 'error');
    } finally {
      setSaving(false);
    }
  };

  const filtered = entries.filter((e) =>
    [e.name, e.occupation].filter(Boolean).join(' ').toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <Box>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" fontWeight={700}>
          Member Directory
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Connect with fellow members who have opted in.
        </Typography>
      </Box>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
          <Shield size={18} />
          <Typography variant="h6">Your privacy</Typography>
        </Stack>
        {prefs && !prefs.hasProfile ? (
          <Alert severity="info">
            No member profile is linked to your account yet, so you cannot appear in the directory.
          </Alert>
        ) : prefs ? (
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={3} sx={{ flexWrap: 'wrap' }}>
            <FormControlLabel
              control={
                <Switch
                  checked={prefs.directoryOptIn}
                  onChange={(e) => updatePref({ directoryOptIn: e.target.checked })}
                  disabled={saving}
                />
              }
              label="List me in the directory"
            />
            <FormControlLabel
              control={
                <Switch
                  checked={prefs.directoryShowPhone}
                  onChange={(e) => updatePref({ directoryShowPhone: e.target.checked })}
                  disabled={saving || !prefs.directoryOptIn}
                />
              }
              label="Show my phone"
            />
            <FormControlLabel
              control={
                <Switch
                  checked={prefs.directoryShowEmail}
                  onChange={(e) => updatePref({ directoryShowEmail: e.target.checked })}
                  disabled={saving || !prefs.directoryOptIn}
                />
              }
              label="Show my email"
            />
          </Stack>
        ) : (
          <CircularProgress size={20} />
        )}
      </Paper>

      <Stack direction="row" justifyContent="flex-end" sx={{ mb: 2 }}>
        <TextField
          size="small"
          placeholder="Search members"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Search size={16} />
              </InputAdornment>
            ),
          }}
          sx={{ minWidth: 260 }}
        />
      </Stack>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}>
          <CircularProgress />
        </Box>
      ) : filtered.length === 0 ? (
        <Alert severity="info">No members are listed in the directory yet.</Alert>
      ) : (
        <Grid container spacing={2}>
          {filtered.map((e) => (
            <Grid item xs={12} sm={6} md={4} key={e.id}>
              <Card>
                <CardContent>
                  <Stack direction="row" spacing={2} alignItems="center">
                    <Avatar src={e.photoUrl || undefined} sx={{ width: 56, height: 56 }}>
                      {initials(e.name)}
                    </Avatar>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="subtitle1" fontWeight={700} noWrap>
                        {e.name}
                      </Typography>
                      {e.occupation && (
                        <Typography variant="caption" color="text.secondary">
                          {e.occupation}
                        </Typography>
                      )}
                    </Box>
                  </Stack>
                  {(e.phone || e.email) && <Divider sx={{ my: 1.5 }} />}
                  <Stack spacing={0.75}>
                    {e.phone && (
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Phone size={14} />
                        <Typography variant="body2" component="a" href={`tel:${e.phone}`} sx={{ color: 'inherit' }}>
                          {e.phone}
                        </Typography>
                      </Stack>
                    )}
                    {e.email && (
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Mail size={14} />
                        <Typography variant="body2" component="a" href={`mailto:${e.email}`} sx={{ color: 'inherit' }} noWrap>
                          {e.email}
                        </Typography>
                      </Stack>
                    )}
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      <Snackbar
        open={toast.open}
        autoHideDuration={5000}
        onClose={() => setToast((t) => ({ ...t, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={toast.severity} onClose={() => setToast((t) => ({ ...t, open: false }))}>
          {toast.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
