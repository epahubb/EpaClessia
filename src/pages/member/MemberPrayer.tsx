import { useEffect, useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  Grid,
  Card,
  CardContent,
  Button,
  Chip,
  TextField,
  MenuItem,
  Snackbar,
  Alert,
  CircularProgress,
  Stack,
  Divider,
  FormControlLabel,
  Checkbox,
  Tabs,
  Tab,
} from '@mui/material';
import { HandHeart, Send, Users } from 'lucide-react';
import {
  memberEngagementService,
  PrayerRequest,
  PrayerFeed,
} from '../../services/memberEngagementService';

type Toast = { open: boolean; message: string; severity: 'success' | 'error' | 'info' };

const CATEGORIES = ['general', 'healing', 'family', 'financial', 'thanksgiving', 'guidance'];

const STATUS_COLORS: Record<string, 'default' | 'info' | 'success' | 'warning'> = {
  open: 'info',
  praying: 'warning',
  answered: 'success',
  closed: 'default',
};

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return iso;
  }
}

export default function MemberPrayer() {
  const [feed, setFeed] = useState<PrayerFeed>({ mine: [], wall: [] });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [tab, setTab] = useState(0);
  const [toast, setToast] = useState<Toast>({ open: false, message: '', severity: 'success' });

  const [request, setRequest] = useState('');
  const [category, setCategory] = useState('general');
  const [isPrivate, setIsPrivate] = useState(false);
  const [anonymous, setAnonymous] = useState(false);

  const notify = (message: string, severity: Toast['severity'] = 'success') =>
    setToast({ open: true, message, severity });

  const load = async () => {
    setLoading(true);
    try {
      const res = await memberEngagementService.getPrayers();
      setFeed(res);
    } catch {
      notify('Failed to load prayer requests', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleSubmit = async () => {
    if (!request.trim()) return notify('Please write your prayer request', 'error');
    setSubmitting(true);
    try {
      await memberEngagementService.submitPrayer({
        request: request.trim(),
        category,
        isPrivate,
        anonymous,
      });
      notify('Your prayer request has been submitted.', 'success');
      setRequest('');
      setIsPrivate(false);
      setAnonymous(false);
      setCategory('general');
      load();
    } catch {
      notify('Failed to submit prayer request', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const renderCard = (p: PrayerRequest, showName: boolean) => (
    <Card key={p.id} variant="outlined" sx={{ mb: 2 }}>
      <CardContent>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
          <Stack direction="row" spacing={1} alignItems="center">
            {showName && (
              <Typography variant="subtitle2" fontWeight={700}>
                {p.requesterName}
              </Typography>
            )}
            <Chip size="small" label={p.category} />
          </Stack>
          <Chip size="small" color={STATUS_COLORS[p.status] || 'default'} label={p.status} />
        </Stack>
        <Typography variant="body1">{p.request}</Typography>
        <Typography variant="caption" color="text.secondary">
          {formatDate(p.createdAt)}
        </Typography>
      </CardContent>
    </Card>
  );

  return (
    <Box>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" fontWeight={700}>
          Prayer Requests
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Share your needs and join others in prayer.
        </Typography>
      </Box>

      <Grid container spacing={3}>
        <Grid item xs={12} md={5}>
          <Paper sx={{ p: 3 }}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
              <HandHeart size={20} />
              <Typography variant="h6">Submit a request</Typography>
            </Stack>
            <TextField
              fullWidth
              multiline
              minRows={4}
              label="Your prayer request"
              value={request}
              onChange={(e) => setRequest(e.target.value)}
              sx={{ mb: 2 }}
            />
            <TextField
              select
              fullWidth
              label="Category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              sx={{ mb: 1 }}
            >
              {CATEGORIES.map((c) => (
                <MenuItem key={c} value={c} sx={{ textTransform: 'capitalize' }}>
                  {c}
                </MenuItem>
              ))}
            </TextField>
            <FormControlLabel
              control={<Checkbox checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} />}
              label="Keep private (pastoral team only)"
            />
            <FormControlLabel
              control={<Checkbox checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} />}
              label="Post anonymously"
            />
            <Divider sx={{ my: 2 }} />
            <Button
              fullWidth
              variant="contained"
              startIcon={<Send size={16} />}
              disabled={submitting || !request.trim()}
              onClick={handleSubmit}
            >
              {submitting ? 'Submitting\u2026' : 'Submit request'}
            </Button>
          </Paper>
        </Grid>

        <Grid item xs={12} md={7}>
          <Paper sx={{ p: 3 }}>
            <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
              <Tab label={`My Requests (${feed.mine.length})`} />
              <Tab icon={<Users size={16} />} iconPosition="start" label="Prayer Wall" />
            </Tabs>
            {loading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                <CircularProgress />
              </Box>
            ) : tab === 0 ? (
              feed.mine.length === 0 ? (
                <Typography color="text.secondary">You have not submitted any prayer requests yet.</Typography>
              ) : (
                feed.mine.map((p) => renderCard(p, false))
              )
            ) : feed.wall.length === 0 ? (
              <Typography color="text.secondary">No public prayer requests right now.</Typography>
            ) : (
              feed.wall.map((p) => renderCard(p, true))
            )}
          </Paper>
        </Grid>
      </Grid>

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
