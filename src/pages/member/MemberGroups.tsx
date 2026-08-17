import { useEffect, useState } from 'react';
import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  CardActions,
  Button,
  Chip,
  Snackbar,
  Alert,
  CircularProgress,
  Stack,
  TextField,
  InputAdornment,
} from '@mui/material';
import { Users, MapPin, Clock, Search, LogIn, LogOut } from 'lucide-react';
import { memberEngagementService, MemberGroup } from '../../services/memberEngagementService';

type Toast = { open: boolean; message: string; severity: 'success' | 'error' | 'info' };

export default function MemberGroups() {
  const [groups, setGroups] = useState<MemberGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState<Toast>({ open: false, message: '', severity: 'success' });

  const notify = (message: string, severity: Toast['severity'] = 'success') =>
    setToast({ open: true, message, severity });

  const load = async () => {
    setLoading(true);
    try {
      const res = await memberEngagementService.getGroups();
      setGroups(res);
    } catch {
      notify('Failed to load groups', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const toggle = async (g: MemberGroup) => {
    setBusyId(g.id);
    try {
      if (g.joined) {
        await memberEngagementService.leaveGroup(g.id);
        notify(`You left ${g.name}.`, 'info');
      } else {
        await memberEngagementService.joinGroup(g.id);
        notify(`You joined ${g.name}!`, 'success');
      }
      load();
    } catch {
      notify('Action failed. Please try again.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const filtered = groups.filter((g) =>
    [g.name, g.description, g.type].filter(Boolean).join(' ').toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3, flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="h4" fontWeight={700}>
            Groups &amp; Ministries
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Find a community and get involved.
          </Typography>
        </Box>
        <TextField
          size="small"
          placeholder="Search groups"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Search size={16} />
              </InputAdornment>
            ),
          }}
          sx={{ minWidth: 240 }}
        />
      </Stack>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}>
          <CircularProgress />
        </Box>
      ) : filtered.length === 0 ? (
        <Alert severity="info">No groups found.</Alert>
      ) : (
        <Grid container spacing={3}>
          {filtered.map((g) => (
            <Grid item xs={12} sm={6} md={4} key={g.id}>
              <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                <CardContent sx={{ flexGrow: 1 }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 1 }}>
                    <Typography variant="h6" fontWeight={700}>
                      {g.name}
                    </Typography>
                    {g.joined && <Chip size="small" color="success" label="Joined" />}
                  </Stack>
                  {g.type && <Chip size="small" label={g.type} sx={{ mb: 1 }} />}
                  {g.description && (
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                      {g.description}
                    </Typography>
                  )}
                  <Stack spacing={0.75}>
                    {g.leaderName && (
                      <Typography variant="caption" color="text.secondary">
                        Led by {g.leaderName}
                      </Typography>
                    )}
                    {(g.meetingDay || g.meetingTime) && (
                      <Stack direction="row" spacing={0.5} alignItems="center">
                        <Clock size={14} />
                        <Typography variant="caption" color="text.secondary">
                          {[g.meetingDay, g.meetingTime].filter(Boolean).join(' at ')}
                        </Typography>
                      </Stack>
                    )}
                    {g.location && (
                      <Stack direction="row" spacing={0.5} alignItems="center">
                        <MapPin size={14} />
                        <Typography variant="caption" color="text.secondary">
                          {g.location}
                        </Typography>
                      </Stack>
                    )}
                    <Stack direction="row" spacing={0.5} alignItems="center">
                      <Users size={14} />
                      <Typography variant="caption" color="text.secondary">
                        {g.memberCount} member(s)
                      </Typography>
                    </Stack>
                  </Stack>
                </CardContent>
                <CardActions sx={{ p: 2, pt: 0 }}>
                  <Button
                    fullWidth
                    variant={g.joined ? 'outlined' : 'contained'}
                    color={g.joined ? 'inherit' : 'primary'}
                    startIcon={g.joined ? <LogOut size={16} /> : <LogIn size={16} />}
                    disabled={busyId === g.id}
                    onClick={() => toggle(g)}
                  >
                    {busyId === g.id ? 'Working…' : g.joined ? 'Leave' : 'Join'}
                  </Button>
                </CardActions>
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
