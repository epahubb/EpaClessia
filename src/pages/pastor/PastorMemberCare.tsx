import { useEffect, useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  Grid,
  TextField,
  InputAdornment,
  List,
  ListItemButton,
  ListItemAvatar,
  Avatar,
  ListItemText,
  CircularProgress,
  Stack,
  Chip,
  Divider,
  Button,
  Snackbar,
  Alert,
} from '@mui/material';
import { Search, Heart, Send, User } from 'lucide-react';
import { pastorService } from '../../services/pastorService';

type Toast = { open: boolean; message: string; severity: 'success' | 'error' | 'info' };

interface MemberRow {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  membershipStatus: string | null;
}

interface Note {
  id: string;
  note: string;
  createdByName: string | null;
  createdAt: string;
}

export default function PastorMemberCare() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MemberRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<MemberRow | null>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [toast, setToast] = useState<Toast>({ open: false, message: '', severity: 'success' });

  const notify = (message: string, severity: Toast['severity'] = 'success') =>
    setToast({ open: true, message, severity });

  const runSearch = async () => {
    setSearching(true);
    try {
      const res = await pastorService.searchMembers(query);
      setResults(res.data || []);
    } catch (e: any) {
      notify(e?.message || 'Search failed', 'error');
    } finally {
      setSearching(false);
    }
  };

  // Load an initial list on mount.
  useEffect(() => {
    runSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectMember = async (m: MemberRow) => {
    setSelected(m);
    setProfile(null);
    setLoadingProfile(true);
    try {
      const res = await pastorService.getMemberProfile(m.id);
      setProfile(res);
    } catch (e: any) {
      notify(e?.message || 'Could not load member', 'error');
    } finally {
      setLoadingProfile(false);
    }
  };

  const addNote = async () => {
    if (!selected || !noteText.trim()) return;
    setSavingNote(true);
    try {
      await pastorService.addPastoralNote(selected.id, noteText.trim());
      setNoteText('');
      notify('Note added.');
      await selectMember(selected);
    } catch (e: any) {
      notify(e?.message || 'Could not add note', 'error');
    } finally {
      setSavingNote(false);
    }
  };

  return (
    <Box>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" fontWeight={700} gutterBottom>
          Member Care
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Shepherd your congregation — search a member to view their care history and add confidential notes.
        </Typography>
      </Box>

      <Grid container spacing={3}>
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 2 }}>
            <TextField
              fullWidth
              size="small"
              placeholder="Search by name, email, phone…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && runSearch()}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Search size={16} />
                  </InputAdornment>
                ),
              }}
            />
            <Box sx={{ mt: 1, minHeight: 300 }}>
              {searching ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                  <CircularProgress size={24} />
                </Box>
              ) : results.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
                  No members found.
                </Typography>
              ) : (
                <List dense>
                  {results.map((m) => (
                    <ListItemButton key={m.id} selected={selected?.id === m.id} onClick={() => selectMember(m)}>
                      <ListItemAvatar>
                        <Avatar>{(m.firstName || '?').charAt(0)}</Avatar>
                      </ListItemAvatar>
                      <ListItemText primary={`${m.firstName} ${m.lastName}`} secondary={m.phone || m.email || ''} />
                    </ListItemButton>
                  ))}
                </List>
              )}
            </Box>
          </Paper>
        </Grid>

        <Grid item xs={12} md={8}>
          {!selected ? (
            <Paper sx={{ p: 6, textAlign: 'center' }}>
              <User size={40} style={{ opacity: 0.4 }} />
              <Typography variant="h6" sx={{ mt: 2 }}>
                Select a member
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Choose someone from the list to see their care profile.
              </Typography>
            </Paper>
          ) : loadingProfile ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
              <CircularProgress />
            </Box>
          ) : (
            <Stack spacing={3}>
              <Paper sx={{ p: 3 }}>
                <Stack direction="row" spacing={2} alignItems="center">
                  <Avatar sx={{ width: 56, height: 56 }}>{(selected.firstName || '?').charAt(0)}</Avatar>
                  <Box>
                    <Typography variant="h6" fontWeight={700}>
                      {selected.firstName} {selected.lastName}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {selected.phone || ''} {selected.email ? `· ${selected.email}` : ''}
                    </Typography>
                  </Box>
                  {selected.membershipStatus && (
                    <Chip size="small" label={selected.membershipStatus} sx={{ ml: 'auto', textTransform: 'capitalize' }} />
                  )}
                </Stack>
              </Paper>

              <Paper sx={{ p: 3 }}>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
                  <Heart size={18} />
                  <Typography variant="h6" fontWeight={700}>
                    Pastoral notes
                  </Typography>
                </Stack>
                <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
                  <TextField
                    fullWidth
                    size="small"
                    placeholder="Add a confidential note…"
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    multiline
                    minRows={1}
                  />
                  <Button variant="contained" onClick={addNote} disabled={savingNote || !noteText.trim()} startIcon={<Send size={16} />}>
                    Add
                  </Button>
                </Stack>
                {profile?.notes?.length ? (
                  <List dense>
                    {profile.notes.map((n: Note) => (
                      <Box key={n.id}>
                        <ListItemText
                          primary={n.note}
                          secondary={`${n.createdByName || 'Pastor'} · ${new Date(n.createdAt).toLocaleString()}`}
                        />
                        <Divider component="div" sx={{ my: 1 }} />
                      </Box>
                    ))}
                  </List>
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    No notes yet.
                  </Typography>
                )}
              </Paper>

              <Grid container spacing={3}>
                <Grid item xs={12} sm={6}>
                  <Paper sx={{ p: 3, height: '100%' }}>
                    <Typography variant="subtitle1" fontWeight={700} gutterBottom>
                      Prayer history
                    </Typography>
                    {profile?.prayers?.length ? (
                      profile.prayers.map((p: any) => (
                        <Typography key={p.id} variant="body2" sx={{ mb: 1 }}>
                          • {p.request} <Chip size="small" label={p.status} sx={{ ml: 0.5, textTransform: 'capitalize' }} />
                        </Typography>
                      ))
                    ) : (
                      <Typography variant="body2" color="text.secondary">
                        No prayer requests.
                      </Typography>
                    )}
                  </Paper>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Paper sx={{ p: 3, height: '100%' }}>
                    <Typography variant="subtitle1" fontWeight={700} gutterBottom>
                      Visit history
                    </Typography>
                    {profile?.visits?.length ? (
                      profile.visits.map((v: any) => (
                        <Typography key={v.id} variant="body2" sx={{ mb: 1 }}>
                          • {v.visitType} — {v.status}
                        </Typography>
                      ))
                    ) : (
                      <Typography variant="body2" color="text.secondary">
                        No visits recorded.
                      </Typography>
                    )}
                  </Paper>
                </Grid>
              </Grid>
            </Stack>
          )}
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
