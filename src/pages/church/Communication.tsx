import React, { useEffect, useState } from 'react';
import {
  Box, Typography, Paper, Grid, Tabs, Tab, TextField, Button, Alert,
  CircularProgress, Chip, List, ListItem, ListItemText, Divider,
} from '@mui/material';
import { MessageSquare, Megaphone, Send, History } from 'lucide-react';
import { churchApi } from '../../services/churchApi';

export const ChurchCommunicationPage: React.FC = () => {
  const [tab, setTab] = useState(0);
  const [recipients, setRecipients] = useState('');
  const [smsMessage, setSmsMessage] = useState('');
  const [annTitle, setAnnTitle] = useState('');
  const [annBody, setAnnBody] = useState('');
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadHistory = async () => {
    setLoading(true);
    try { setHistory(await churchApi.getCommunications()); } catch { /* ignore */ } finally { setLoading(false); }
  };
  useEffect(() => { loadHistory(); }, []);

  const sendSms = async () => {
    setSending(true); setMsg(null);
    try {
      const numbers = recipients.split(/[\n,]/).map((n) => n.trim()).filter(Boolean);
      await churchApi.sendSms({ recipients: numbers, message: smsMessage });
      setMsg({ type: 'success', text: `SMS queued to ${numbers.length} recipient(s).` });
      setSmsMessage(''); setRecipients('');
      await loadHistory();
    } catch {
      setMsg({ type: 'error', text: 'Failed to send SMS. Check your SMS settings.' });
    } finally { setSending(false); }
  };

  const sendAnnouncement = async () => {
    setSending(true); setMsg(null);
    try {
      await churchApi.sendAnnouncement({ title: annTitle, body: annBody });
      setMsg({ type: 'success', text: 'Announcement published.' });
      setAnnTitle(''); setAnnBody('');
      await loadHistory();
    } catch {
      setMsg({ type: 'error', text: 'Failed to publish announcement.' });
    } finally { setSending(false); }
  };

  const chars = smsMessage.length;
  const segments = Math.max(1, Math.ceil(chars / 160));

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" fontWeight={800} sx={{ letterSpacing: '-0.5px' }}>Communication Hub</Typography>
        <Typography variant="body2" color="text.secondary">Reach your congregation via SMS and announcements.</Typography>
      </Box>

      {msg && <Alert severity={msg.type} onClose={() => setMsg(null)} sx={{ mb: 3, borderRadius: 2 }}>{msg.text}</Alert>}

      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 7 }}>
          <Paper sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider' }}>
            <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ px: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
              <Tab icon={<MessageSquare size={18} />} iconPosition="start" label="Send SMS" sx={{ minHeight: 60, fontWeight: 700 }} />
              <Tab icon={<Megaphone size={18} />} iconPosition="start" label="Announcement" sx={{ minHeight: 60, fontWeight: 700 }} />
            </Tabs>
            <Box sx={{ p: 3 }}>
              {tab === 0 && (
                <Box>
                  <TextField fullWidth multiline minRows={3} label="Recipients (comma or line separated numbers)"
                    value={recipients} onChange={(e) => setRecipients(e.target.value)} sx={{ mb: 2 }} />
                  <TextField fullWidth multiline minRows={4} label="Message" value={smsMessage}
                    onChange={(e) => setSmsMessage(e.target.value)} sx={{ mb: 1 }} />
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Chip size="small" label={`${chars} chars · ${segments} SMS`} />
                    <Button variant="contained" startIcon={<Send size={18} />} disabled={sending || !smsMessage || !recipients}
                      onClick={sendSms} sx={{ borderRadius: 2, fontWeight: 700 }}>Send SMS</Button>
                  </Box>
                </Box>
              )}
              {tab === 1 && (
                <Box>
                  <TextField fullWidth label="Title" value={annTitle} onChange={(e) => setAnnTitle(e.target.value)} sx={{ mb: 2 }} />
                  <TextField fullWidth multiline minRows={5} label="Body" value={annBody} onChange={(e) => setAnnBody(e.target.value)} sx={{ mb: 2 }} />
                  <Button variant="contained" startIcon={<Megaphone size={18} />} disabled={sending || !annTitle || !annBody}
                    onClick={sendAnnouncement} sx={{ borderRadius: 2, fontWeight: 700 }}>Publish announcement</Button>
                </Box>
              )}
            </Box>
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, md: 5 }}>
          <Paper sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider', p: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <History size={18} /><Typography fontWeight={800}>Recent activity</Typography>
            </Box>
            <Divider />
            {loading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress size={24} /></Box>
            ) : history.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>No messages sent yet.</Typography>
            ) : (
              <List dense>
                {history.slice(0, 20).map((h, i) => (
                  <ListItem key={h.id || i} divider>
                    <ListItemText
                      primary={<Typography variant="body2" fontWeight={700}>{(h.channel || 'message').toUpperCase()} · {h.recipient || h.title || '—'}</Typography>}
                      secondary={`${h.message || h.body || ''} ${h.createdAt ? '· ' + new Date(h.createdAt).toLocaleString() : ''}`}
                    />
                  </ListItem>
                ))}
              </List>
            )}
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default ChurchCommunicationPage;
