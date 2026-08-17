import { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  CardMedia,
  CardActions,
  Button,
  Chip,
  Snackbar,
  Alert,
  CircularProgress,
  Stack,
  TextField,
  MenuItem,
  InputAdornment,
} from '@mui/material';
import { PlayCircle, Headphones, FileText, Search, BookOpen } from 'lucide-react';
import { memberEngagementService, Sermon } from '../../services/memberEngagementService';

type Toast = { open: boolean; message: string; severity: 'success' | 'error' | 'info' };

function formatDate(iso?: string): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return iso;
  }
}

export default function MemberSermons() {
  const [sermons, setSermons] = useState<Sermon[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [series, setSeries] = useState('');
  const [toast, setToast] = useState<Toast>({ open: false, message: '', severity: 'success' });

  useEffect(() => {
    (async () => {
      try {
        const res = await memberEngagementService.getSermons();
        setSermons(res);
      } catch {
        setToast({ open: true, message: 'Failed to load sermons', severity: 'error' });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const seriesOptions = useMemo(
    () => Array.from(new Set(sermons.map((s) => s.seriesName).filter(Boolean))) as string[],
    [sermons],
  );

  const filtered = sermons.filter((s) => {
    const matchesSearch = [s.title, s.speaker, s.scripture, s.description]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(search.toLowerCase());
    const matchesSeries = !series || s.seriesName === series;
    return matchesSearch && matchesSeries;
  });

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3, flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="h4" fontWeight={700}>
            Sermons
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Watch, listen, and revisit past messages.
          </Typography>
        </Box>
        <Stack direction="row" spacing={2}>
          <TextField
            size="small"
            placeholder="Search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Search size={16} />
                </InputAdornment>
              ),
            }}
          />
          <TextField
            select
            size="small"
            label="Series"
            value={series}
            onChange={(e) => setSeries(e.target.value)}
            sx={{ minWidth: 160 }}
          >
            <MenuItem value="">All series</MenuItem>
            {seriesOptions.map((s) => (
              <MenuItem key={s} value={s}>
                {s}
              </MenuItem>
            ))}
          </TextField>
        </Stack>
      </Stack>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}>
          <CircularProgress />
        </Box>
      ) : filtered.length === 0 ? (
        <Alert severity="info">No sermons available yet.</Alert>
      ) : (
        <Grid container spacing={3}>
          {filtered.map((s) => (
            <Grid item xs={12} sm={6} md={4} key={s.id}>
              <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                {s.thumbnailUrl ? (
                  <CardMedia component="img" height="160" image={s.thumbnailUrl} alt={s.title} />
                ) : (
                  <Box
                    sx={{
                      height: 160,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      bgcolor: 'action.hover',
                      color: 'text.secondary',
                    }}
                  >
                    <BookOpen size={48} />
                  </Box>
                )}
                <CardContent sx={{ flexGrow: 1 }}>
                  {s.seriesName && <Chip size="small" label={s.seriesName} sx={{ mb: 1 }} />}
                  <Typography variant="h6" fontWeight={700}>
                    {s.title}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {[s.speaker, formatDate(s.date)].filter(Boolean).join(' \u00b7 ')}
                  </Typography>
                  {s.scripture && (
                    <Typography variant="caption" color="primary" sx={{ display: 'block', mt: 0.5 }}>
                      {s.scripture}
                    </Typography>
                  )}
                  {s.description && (
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                      {s.description.slice(0, 120)}
                      {s.description.length > 120 ? '…' : ''}
                    </Typography>
                  )}
                </CardContent>
                <CardActions sx={{ p: 2, pt: 0, gap: 1, flexWrap: 'wrap' }}>
                  {s.videoUrl && (
                    <Button
                      size="small"
                      variant="contained"
                      startIcon={<PlayCircle size={16} />}
                      href={s.videoUrl}
                      target="_blank"
                      rel="noopener"
                    >
                      Watch
                    </Button>
                  )}
                  {s.audioUrl && (
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<Headphones size={16} />}
                      href={s.audioUrl}
                      target="_blank"
                      rel="noopener"
                    >
                      Listen
                    </Button>
                  )}
                  {s.notesUrl && (
                    <Button
                      size="small"
                      variant="text"
                      startIcon={<FileText size={16} />}
                      href={s.notesUrl}
                      target="_blank"
                      rel="noopener"
                    >
                      Notes
                    </Button>
                  )}
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
