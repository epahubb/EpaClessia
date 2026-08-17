import { useEffect, useMemo, useState } from 'react';
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
  Tabs,
  Tab,
  Snackbar,
  Alert,
  CircularProgress,
  Stack,
  Divider,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
} from '@mui/material';
import { MessageSquare, Megaphone, History, Send, Wallet } from 'lucide-react';
import { churchApi } from '../services/churchApi';

type Toast = { open: boolean; message: string; severity: 'success' | 'error' | 'info' };

interface CommRecord {
  id: number;
  channel: string;
  recipient: string;
  subject?: string | null;
  message?: string;
  status: string;
  createdAt: string;
}

interface MemberLite {
  id: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  ministryId?: string;
}

interface MinistryLite {
  id: string;
  name: string;
}

const SMS_SEGMENT = 160;

/**
 * Shared communication hub used by both the Pastor and Ministry Leader portals.
 * Handles SMS blasts (with live credit balance + cost preview), announcements,
 * and a delivery history log. All backed by the tenant-scoped church API, so
 * credit enforcement and audit logging happen server-side.
 */
export default function CommunicationCenter({ title = 'Communication' }: { title?: string }) {
  const [tab, setTab] = useState(0);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<Toast>({ open: false, message: '', severity: 'success' });

  const [members, setMembers] = useState<MemberLite[]>([]);
  const [ministries, setMinistries] = useState<MinistryLite[]>([]);
  const [history, setHistory] = useState<CommRecord[]>([]);
  const [credits, setCredits] = useState<number>(0);

  // SMS composer state
  const [audience, setAudience] = useState<'all' | 'ministry' | 'manual'>('all');
  const [ministryId, setMinistryId] = useState('');
  const [manualNumbers, setManualNumbers] = useState('');
  const [smsMessage, setSmsMessage] = useState('');

  // Announcement composer state
  const [subject, setSubject] = useState('');
  const [announcement, setAnnouncement] = useState('');

  const notify = (message: string, severity: Toast['severity'] = 'success') =>
    setToast({ open: true, message, severity });

  const loadAll = async () => {
    setLoading(true);
    try {
      const [mem, min, hist, bal] = await Promise.all([
        churchApi.getMembers().catch(() => []),
        churchApi.getMinistries().catch(() => []),
        churchApi.getCommunications().catch(() => []),
        churchApi.getSmsBalance().catch(() => ({ credits: 0 })),
      ]);
      setMembers(Array.isArray(mem) ? mem : []);
      setMinistries(Array.isArray(min) ? min : []);
      setHistory(Array.isArray(hist) ? hist : []);
      setCredits(Number(bal?.credits || 0));
    } catch {
      notify('Failed to load communication data', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  // Resolve the recipient set for the current audience selection.
  const recipientMemberIds = useMemo(() => {
    if (audience === 'all') {
      return members.filter((m) => m.phone).map((m) => m.id);
    }
    if (audience === 'ministry' && ministryId) {
      return members.filter((m) => m.phone && m.ministryId === ministryId).map((m) => m.id);
    }
    return [];
  }, [audience, ministryId, members]);

  const manualList = useMemo(
    () =>
      manualNumbers
        .split(/[\n,]/)
        .map((n) => n.trim())
        .filter(Boolean),
    [manualNumbers],
  );

  const recipientCount = audience === 'manual' ? manualList.length : recipientMemberIds.length;
  const segments = Math.max(1, Math.ceil(smsMessage.length / SMS_SEGMENT));
  const estimatedCost = recipientCount * segments;

  const handleSendSms = async () => {
    if (!smsMessage.trim()) return notify('Enter a message to send', 'error');
    if (recipientCount === 0) return notify('No recipients selected', 'error');
    if (estimatedCost > credits) {
      return notify(
        `This send needs ${estimatedCost} credits but only ${credits} are available. Purchase an SMS bundle to continue.`,
        'error',
      );
    }
    setSending(true);
    try {
      const payload: any = { message: smsMessage.trim() };
      if (audience === 'manual') payload.recipients = manualList;
      else payload.memberIds = recipientMemberIds;
      const res = await churchApi.sendSms(payload);
      notify(`Sent ${res?.sent ?? 0} of ${res?.total ?? recipientCount} messages.`, 'success');
      if (typeof res?.creditsRemaining === 'number') setCredits(res.creditsRemaining);
      setSmsMessage('');
      loadAll();
    } catch (e: any) {
      notify(e?.response?.data?.message || e?.response?.data?.error || 'Failed to send SMS', 'error');
    } finally {
      setSending(false);
    }
  };

  const handleSendAnnouncement = async () => {
    if (!subject.trim()) return notify('Enter a subject', 'error');
    setSending(true);
    try {
      await churchApi.sendAnnouncement({ subject: subject.trim(), message: announcement.trim() });
      notify('Announcement posted.', 'success');
      setSubject('');
      setAnnouncement('');
      loadAll();
    } catch (e: any) {
      notify(e?.response?.data?.error || 'Failed to post announcement', 'error');
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3, flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="h4" fontWeight={700}>
            {title}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Reach your congregation by SMS and announcements.
          </Typography>
        </Box>
        <Chip
          icon={<Wallet size={16} />}
          color={credits > 0 ? 'primary' : 'default'}
          label={`${credits.toLocaleString()} SMS credits`}
          sx={{ fontWeight: 600 }}
        />
      </Stack>

      <Paper sx={{ mb: 3 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto">
          <Tab icon={<MessageSquare size={18} />} iconPosition="start" label="Send SMS" />
          <Tab icon={<Megaphone size={18} />} iconPosition="start" label="Announcement" />
          <Tab icon={<History size={18} />} iconPosition="start" label="History" />
        </Tabs>
      </Paper>

      {tab === 0 && (
        <Grid container spacing={3}>
          <Grid item xs={12} md={7}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Compose SMS
                </Typography>
                <TextField
                  select
                  fullWidth
                  label="Audience"
                  value={audience}
                  onChange={(e) => setAudience(e.target.value as any)}
                  sx={{ mb: 2 }}
                >
                  <MenuItem value="all">All members with a phone</MenuItem>
                  <MenuItem value="ministry">Specific ministry</MenuItem>
                  <MenuItem value="manual">Enter numbers manually</MenuItem>
                </TextField>

                {audience === 'ministry' && (
                  <TextField
                    select
                    fullWidth
                    label="Ministry"
                    value={ministryId}
                    onChange={(e) => setMinistryId(e.target.value)}
                    sx={{ mb: 2 }}
                  >
                    {ministries.length === 0 && <MenuItem disabled>No ministries found</MenuItem>}
                    {ministries.map((m) => (
                      <MenuItem key={m.id} value={m.id}>
                        {m.name}
                      </MenuItem>
                    ))}
                  </TextField>
                )}

                {audience === 'manual' && (
                  <TextField
                    fullWidth
                    multiline
                    minRows={2}
                    label="Phone numbers (comma or line separated)"
                    value={manualNumbers}
                    onChange={(e) => setManualNumbers(e.target.value)}
                    sx={{ mb: 2 }}
                  />
                )}

                <TextField
                  fullWidth
                  multiline
                  minRows={4}
                  label="Message"
                  value={smsMessage}
                  onChange={(e) => setSmsMessage(e.target.value)}
                  helperText={`${smsMessage.length} characters \u00b7 ${segments} segment(s)`}
                />
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={5}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Send summary
                </Typography>
                <Stack spacing={1.5} sx={{ mb: 2 }}>
                  <Row label="Recipients" value={recipientCount.toString()} />
                  <Row label="Segments each" value={segments.toString()} />
                  <Divider />
                  <Row label="Estimated cost" value={`${estimatedCost} credits`} strong />
                  <Row label="Balance after" value={`${Math.max(0, credits - estimatedCost)} credits`} />
                </Stack>
                {estimatedCost > credits && (
                  <Alert severity="warning" sx={{ mb: 2 }}>
                    Not enough credits. Purchase an SMS bundle to continue.
                  </Alert>
                )}
                <Button
                  fullWidth
                  variant="contained"
                  startIcon={<Send size={16} />}
                  disabled={sending || recipientCount === 0 || !smsMessage.trim()}
                  onClick={handleSendSms}
                >
                  {sending ? 'Sending\u2026' : 'Send SMS'}
                </Button>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {tab === 1 && (
        <Card sx={{ maxWidth: 720 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Post an announcement
            </Typography>
            <TextField
              fullWidth
              label="Subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              sx={{ mb: 2 }}
            />
            <TextField
              fullWidth
              multiline
              minRows={5}
              label="Message"
              value={announcement}
              onChange={(e) => setAnnouncement(e.target.value)}
              sx={{ mb: 2 }}
            />
            <Button
              variant="contained"
              startIcon={<Megaphone size={16} />}
              disabled={sending || !subject.trim()}
              onClick={handleSendAnnouncement}
            >
              {sending ? 'Posting\u2026' : 'Post announcement'}
            </Button>
          </CardContent>
        </Card>
      )}

      {tab === 2 && (
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Delivery history
            </Typography>
            {history.length === 0 ? (
              <Typography color="text.secondary">No messages sent yet.</Typography>
            ) : (
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Date</TableCell>
                    <TableCell>Channel</TableCell>
                    <TableCell>Recipient</TableCell>
                    <TableCell>Message</TableCell>
                    <TableCell>Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {history.slice(0, 100).map((h) => (
                    <TableRow key={h.id}>
                      <TableCell>{new Date(h.createdAt).toLocaleString()}</TableCell>
                      <TableCell>
                        <Chip size="small" label={h.channel} />
                      </TableCell>
                      <TableCell>{h.recipient}</TableCell>
                      <TableCell sx={{ maxWidth: 320 }} title={h.subject || h.message || ''}>
                        {h.subject ? `${h.subject}: ` : ''}
                        {(h.message || '').slice(0, 60)}
                      </TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          color={h.status === 'sent' ? 'success' : 'error'}
                          label={h.status}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
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

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <Stack direction="row" justifyContent="space-between">
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body2" fontWeight={strong ? 700 : 500}>
        {value}
      </Typography>
    </Stack>
  );
}
