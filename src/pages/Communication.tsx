import React, { useState, useEffect } from 'react';
import { 
  Box, Typography, Grid, Paper, Button, 
  List, ListItem, ListItemText, ListItemIcon, 
  Divider, Chip, TextField, IconButton, Skeleton, Alert
} from '@mui/material';
import { Megaphone, MessageSquare, BookOpen, AlertTriangle, Send, Search, MoreHorizontal, Plus } from 'lucide-react';
import { communicationService } from '../services/communicationService';

const Communication: React.FC = () => {
  const [tickets, setTickets] = useState<any[]>([]);
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [ticketsData, announcementsData] = await Promise.all([
        communicationService.getSupportTickets(),
        communicationService.getAnnouncements()
      ]);
      setTickets(Array.isArray(ticketsData) ? ticketsData : []);
      setAnnouncements(Array.isArray(announcementsData) ? announcementsData : []);
    } catch (err: any) {
      console.error('Error fetching communication data:', err);
      setError('Failed to load communication data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);
  return (
    <Box>
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" fontWeight={800} sx={{ letterSpacing: '-1px' }}>
          Communication & Support
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Broadcast announcements, manage support tickets, and update the knowledge base.
        </Typography>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}>{error}</Alert>}

      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 8 }}>
          <Paper sx={{ p: 3, borderRadius: 3, mb: 3, border: (theme) => `1px solid ${theme.palette.divider}` }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
              <Typography variant="h6" fontWeight={700}>Support Tickets</Typography>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Chip label={`${(Array.isArray(tickets) ? tickets : []).filter(t => t.status === 'open').length} Open`} color="primary" size="small" sx={{ fontWeight: 700 }} />
                <IconButton size="small"><Search size={18} /></IconButton>
              </Box>
            </Box>
            <List disablePadding>
              {loading ? (
                Array.from(new Array(3)).map((_, i) => (
                  <ListItem key={i} sx={{ px: 0, py: 2 }}>
                    <ListItemIcon><Skeleton variant="circular" width={24} height={24} /></ListItemIcon>
                    <ListItemText primary={<Skeleton width="60%" />} secondary={<Skeleton width="40%" />} />
                  </ListItem>
                ))
              ) : !Array.isArray(tickets) || tickets.length === 0 ? (
                <Typography color="text.secondary" sx={{ py: 2 }}>No support tickets found.</Typography>
              ) : (
                tickets.map((ticket, i) => (
                  <React.Fragment key={ticket.id}>
                    <ListItem sx={{ px: 0, py: 2 }}>
                      <ListItemIcon>
                        <MessageSquare size={24} color="#64748b" />
                      </ListItemIcon>
                      <ListItemText 
                        primary={<Typography fontWeight={700}>{ticket.subject}</Typography>}
                        secondary={`${ticket.tenantName} • ${new Date(ticket.createdAt).toLocaleString()}`}
                      />
                      <Chip 
                        label={(ticket.priority || 'normal').toUpperCase()} 
                        size="small" 
                        color={ticket.priority === 'high' ? 'error' : 'warning'} 
                        sx={{ fontWeight: 700, fontSize: '0.6rem', mr: 2 }} 
                      />
                      <Button variant="outlined" size="small">Reply</Button>
                    </ListItem>
                    {i < tickets.length - 1 && <Divider />}
                  </React.Fragment>
                ))
              )}
            </List>
            <Button fullWidth sx={{ mt: 2 }}>View All Tickets</Button>
          </Paper>

          <Paper sx={{ p: 3, borderRadius: 3 }}>
            <Typography variant="h6" fontWeight={700} sx={{ mb: 3 }}>Broadcast Announcement</Typography>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12 }}>
                <TextField label="Subject" fullWidth size="small" />
              </Grid>
              <Grid size={{ xs: 12 }}>
                <TextField label="Message" fullWidth multiline rows={4} />
              </Grid>
              <Grid size={{ xs: 12 }} sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Button variant="contained" startIcon={<Send size={18} />}>Send Broadcast</Button>
              </Grid>
            </Grid>
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, md: 4 }}>
          <Paper sx={{ p: 3, borderRadius: 3, mb: 3, bgcolor: 'primary.main', color: 'white' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
              <AlertTriangle size={24} />
              <Typography variant="h6" fontWeight={700}>Maintenance Alert</Typography>
            </Box>
            <Typography variant="body2" sx={{ mb: 3, opacity: 0.9 }}>
              Schedule a platform-wide downtime notification for all churches.
            </Typography>
            <Button variant="contained" sx={{ bgcolor: 'white', color: 'primary.main', '&:hover': { bgcolor: '#f1f5f9' } }}>
              Schedule Alert
            </Button>
          </Paper>

          <Paper sx={{ p: 3, borderRadius: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6" fontWeight={700}>Knowledge Base</Typography>
              <IconButton size="small"><Plus size={18} /></IconButton>
            </Box>
            <List disablePadding>
              {['Setting up your first tenant', 'Managing member roles', 'Configuring Paystack'].map((text) => (
                <ListItem key={text} sx={{ px: 0 }}>
                  <ListItemIcon sx={{ minWidth: 32 }}><BookOpen size={16} /></ListItemIcon>
                  <ListItemText primary={text} primaryTypographyProps={{ variant: 'body2' }} />
                  <IconButton size="small"><MoreHorizontal size={14} /></IconButton>
                </ListItem>
              ))}
            </List>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default Communication;
