import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Paper, Grid, Button, TextField, Select, MenuItem,
  FormControl, InputLabel, Chip, IconButton, Dialog, DialogTitle,
  DialogContent, DialogActions, Alert, CircularProgress, Tooltip,
  Divider, Drawer, Avatar, Switch, FormControlLabel
} from '@mui/material';
import {
  HelpCircle, MessageSquare, AlertCircle, Clock, CheckCircle2,
  Search, Filter, Plus, User, Send, ExternalLink, Shield, RefreshCw,
  Tag, Paperclip
} from 'lucide-react';
import { ticketService, Ticket, TicketReply } from '../services/ticketService';
import { churchService } from '../services/churchService';

const Tickets: React.FC = () => {
  const [stats, setStats] = useState<any>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [churches, setChurches] = useState<any[]>([]);

  // Filters
  const [search, setSearch] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // Drawer / Thread Details
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [ticketReplies, setTicketReplies] = useState<TicketReply[]>([]);
  const [drawerOpen, setDrawerOpen] = useState<boolean>(false);
  const [loadingThread, setLoadingThread] = useState<boolean>(false);

  // Reply form
  const [replyMessage, setReplyMessage] = useState<string>('');
  const [isInternalNote, setIsInternalNote] = useState<boolean>(false);
  const [replySubmitting, setReplySubmitting] = useState<boolean>(false);

  // New Ticket Modal
  const [createModalOpen, setCreateModalOpen] = useState<boolean>(false);
  const [newTicketData, setNewTicketData] = useState({
    subject: '',
    message: '',
    category: 'Technical',
    priority: 'normal',
    tenantId: ''
  });

  const [alertSuccess, setAlertSuccess] = useState<string | null>(null);
  const [alertError, setAlertError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [statsRes, ticketsRes] = await Promise.all([
        ticketService.getStats(),
        ticketService.getTickets({ search, status: statusFilter, priority: priorityFilter, category: categoryFilter })
      ]);
      setStats(statsRes);
      setTickets(ticketsRes || []);
    } catch (err) {
      console.error('Failed to load tickets:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [search, statusFilter, priorityFilter, categoryFilter]);

  useEffect(() => {
    (async () => {
      try {
        const list = await churchService.getAll();
        setChurches(Array.isArray(list) ? list : []);
      } catch (e) {
        console.error('Failed to load churches', e);
      }
    })();
  }, []);

  const handleOpenTicketThread = async (ticket: Ticket) => {
    setSelectedTicket(ticket);
    setDrawerOpen(true);
    setLoadingThread(true);
    try {
      const details = await ticketService.getTicketDetail(ticket.id);
      setSelectedTicket(details.ticket);
      setTicketReplies(details.replies || []);
    } catch (err) {
      console.error('Failed to load thread:', err);
    } finally {
      setLoadingThread(false);
    }
  };

  const handlePostReply = async () => {
    if (!selectedTicket || !replyMessage.trim()) return;
    setReplySubmitting(true);
    try {
      await ticketService.addReply(selectedTicket.id, {
        message: replyMessage,
        isInternalNote
      });
      setReplyMessage('');
      setIsInternalNote(false);
      // Refresh thread
      const details = await ticketService.getTicketDetail(selectedTicket.id);
      setSelectedTicket(details.ticket);
      setTicketReplies(details.replies || []);
      fetchData();
    } catch (err) {
      setAlertError('Failed to post reply');
    } finally {
      setReplySubmitting(false);
    }
  };

  const handleUpdateStatus = async (status?: string, priority?: string) => {
    if (!selectedTicket) return;
    try {
      await ticketService.updateStatus(selectedTicket.id, { status, priority });
      setAlertSuccess('Ticket status updated.');
      const details = await ticketService.getTicketDetail(selectedTicket.id);
      setSelectedTicket(details.ticket);
      fetchData();
    } catch (err) {
      setAlertError('Failed to update ticket');
    }
  };

  const handleCreateTicket = async () => {
    try {
      await ticketService.createTicket(newTicketData);
      setAlertSuccess('Support ticket created.');
      setCreateModalOpen(false);
      setNewTicketData({ subject: '', message: '', category: 'Technical', priority: 'normal', tenantId: '' });
      fetchData();
    } catch (err) {
      setAlertError('Failed to create ticket');
    }
  };

  const getPriorityChip = (priority: string) => {
    switch (priority) {
      case 'urgent':
        return <Chip label="URGENT" color="error" size="small" sx={{ fontWeight: 800 }} />;
      case 'high':
        return <Chip label="HIGH" color="warning" size="small" sx={{ fontWeight: 700 }} />;
      case 'normal':
        return <Chip label="NORMAL" color="info" size="small" sx={{ fontWeight: 600 }} />;
      default:
        return <Chip label="LOW" size="small" />;
    }
  };

  const getStatusChip = (status: string) => {
    switch (status) {
      case 'open':
        return <Chip label="OPEN" color="error" size="small" variant="outlined" sx={{ fontWeight: 700 }} />;
      case 'in_progress':
        return <Chip label="IN PROGRESS" color="warning" size="small" sx={{ fontWeight: 700 }} />;
      case 'resolved':
        return <Chip label="RESOLVED" color="success" size="small" sx={{ fontWeight: 700 }} />;
      case 'closed':
        return <Chip label="CLOSED" color="default" size="small" sx={{ fontWeight: 700 }} />;
      default:
        return <Chip label={status.toUpperCase()} size="small" />;
    }
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      {/* Header */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', mb: 3, gap: 2 }}>
        <Box>
          <Typography variant="h4" fontWeight={800} sx={{ letterSpacing: '-0.5px' }}>
            Support Tickets & Requests
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Manage church tenant support tickets, technical inquiries, and feature requests.
          </Typography>
        </Box>

        <Button
          variant="contained"
          startIcon={<Plus size={18} />}
          onClick={() => setCreateModalOpen(true)}
          sx={{ borderRadius: 2, fontWeight: 700 }}
        >
          Create Support Ticket
        </Button>
      </Box>

      {/* Alerts */}
      {alertSuccess && (
        <Alert severity="success" onClose={() => setAlertSuccess(null)} sx={{ mb: 3, borderRadius: 2 }}>
          {alertSuccess}
        </Alert>
      )}
      {alertError && (
        <Alert severity="error" onClose={() => setAlertError(null)} sx={{ mb: 3, borderRadius: 2 }}>
          {alertError}
        </Alert>
      )}

      {/* Stats Cards */}
      <Grid container spacing={2.5} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Paper sx={{ p: 2.5, borderRadius: 3, border: '1px solid', borderColor: 'divider' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
              <Typography variant="body2" color="text.secondary" fontWeight={600}>Total Tickets</Typography>
              <Box sx={{ p: 1, borderRadius: 2, bgcolor: 'primary.light', color: 'primary.dark' }}>
                <HelpCircle size={20} />
              </Box>
            </Box>
            <Typography variant="h5" fontWeight={800}>{stats?.total || 0}</Typography>
            <Typography variant="caption" color="text.secondary">Platform support inquiries</Typography>
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Paper sx={{ p: 2.5, borderRadius: 3, border: '1px solid', borderColor: 'divider' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
              <Typography variant="body2" color="text.secondary" fontWeight={600}>Open Tickets</Typography>
              <Box sx={{ p: 1, borderRadius: 2, bgcolor: 'error.light', color: 'error.dark' }}>
                <AlertCircle size={20} />
              </Box>
            </Box>
            <Typography variant="h5" fontWeight={800} color="error.main">{stats?.open || 0}</Typography>
            <Typography variant="caption" color="text.secondary">Requires first response</Typography>
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Paper sx={{ p: 2.5, borderRadius: 3, border: '1px solid', borderColor: 'divider' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
              <Typography variant="body2" color="text.secondary" fontWeight={600}>In Progress</Typography>
              <Box sx={{ p: 1, borderRadius: 2, bgcolor: 'warning.light', color: 'warning.dark' }}>
                <Clock size={20} />
              </Box>
            </Box>
            <Typography variant="h5" fontWeight={800}>{stats?.inProgress || 0}</Typography>
            <Typography variant="caption" color="text.secondary">Being handled by support</Typography>
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Paper sx={{ p: 2.5, borderRadius: 3, border: '1px solid', borderColor: 'divider' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
              <Typography variant="body2" color="text.secondary" fontWeight={600}>Resolved / Closed</Typography>
              <Box sx={{ p: 1, borderRadius: 2, bgcolor: 'success.light', color: 'success.dark' }}>
                <CheckCircle2 size={20} />
              </Box>
            </Box>
            <Typography variant="h5" fontWeight={800}>{stats?.resolved || 0}</Typography>
            <Typography variant="caption" color="text.secondary">Successfully completed</Typography>
          </Paper>
        </Grid>
      </Grid>

      {/* Filter Toolbar */}
      <Paper sx={{ p: 2, mb: 3, borderRadius: 3, border: '1px solid', borderColor: 'divider' }}>
        <Grid container spacing={2} alignItems="center">
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField
              fullWidth
              size="small"
              placeholder="Search by Ticket ID, Subject, Church Name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              InputProps={{
                startAdornment: <Search size={18} style={{ marginRight: 8, opacity: 0.6 }} />
              }}
            />
          </Grid>

          <Grid size={{ xs: 4, md: 2.5 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Status</InputLabel>
              <Select
                value={statusFilter}
                label="Status"
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <MenuItem value="all">All Statuses</MenuItem>
                <MenuItem value="open">Open</MenuItem>
                <MenuItem value="in_progress">In Progress</MenuItem>
                <MenuItem value="resolved">Resolved</MenuItem>
                <MenuItem value="closed">Closed</MenuItem>
              </Select>
            </FormControl>
          </Grid>

          <Grid size={{ xs: 4, md: 2.5 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Priority</InputLabel>
              <Select
                value={priorityFilter}
                label="Priority"
                onChange={(e) => setPriorityFilter(e.target.value)}
              >
                <MenuItem value="all">All Priorities</MenuItem>
                <MenuItem value="urgent">Urgent</MenuItem>
                <MenuItem value="high">High</MenuItem>
                <MenuItem value="normal">Normal</MenuItem>
                <MenuItem value="low">Low</MenuItem>
              </Select>
            </FormControl>
          </Grid>

          <Grid size={{ xs: 4, md: 2 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Category</InputLabel>
              <Select
                value={categoryFilter}
                label="Category"
                onChange={(e) => setCategoryFilter(e.target.value)}
              >
                <MenuItem value="all">All Categories</MenuItem>
                <MenuItem value="Billing">Billing</MenuItem>
                <MenuItem value="Technical">Technical</MenuItem>
                <MenuItem value="Account">Account</MenuItem>
                <MenuItem value="Communication">Communication</MenuItem>
              </Select>
            </FormControl>
          </Grid>

          <Grid size={{ xs: 12, md: 1 }} sx={{ textAlign: 'right' }}>
            <Tooltip title="Refresh">
              <IconButton onClick={fetchData}>
                <RefreshCw size={18} />
              </IconButton>
            </Tooltip>
          </Grid>
        </Grid>
      </Paper>

      {/* Tickets List / Grid */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress size={36} />
        </Box>
      ) : tickets.length === 0 ? (
        <Paper sx={{ p: 6, textAlign: 'center', borderRadius: 3, border: '1px solid', borderColor: 'divider' }}>
          <MessageSquare size={48} style={{ opacity: 0.3, marginBottom: 12 }} />
          <Typography variant="h6" fontWeight={700}>No Tickets Match Criteria</Typography>
          <Typography variant="body2" color="text.secondary">
            Adjust search filters or create a new support ticket.
          </Typography>
        </Paper>
      ) : (
        <Grid container spacing={2}>
          {tickets.map((ticket) => (
            <Grid key={ticket.id} size={{ xs: 12 }}>
              <Paper
                onClick={() => handleOpenTicketThread(ticket)}
                sx={{
                  p: 2.5,
                  borderRadius: 3,
                  border: '1px solid',
                  borderColor: 'divider',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  '&:hover': {
                    borderColor: 'primary.main',
                    boxShadow: 2
                  }
                }}
              >
                <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1, mb: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Typography variant="subtitle2" fontWeight={800} sx={{ fontFamily: 'monospace', color: 'primary.main' }}>
                      {ticket.ticketNumber}
                    </Typography>
                    <Typography variant="subtitle1" fontWeight={700}>
                      {ticket.subject}
                    </Typography>
                  </Box>

                  <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                    {getPriorityChip(ticket.priority)}
                    {getStatusChip(ticket.status)}
                  </Box>
                </Box>

                <Typography variant="body2" color="text.secondary" sx={{
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                  mb: 2
                }}>
                  {ticket.message}
                </Typography>

                <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', pt: 1, borderTop: '1px solid', borderColor: 'divider' }}>
                  <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                    <Typography variant="caption" fontWeight={700} color="text.primary">
                      {ticket.tenantName || 'Global Platform'}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Contact: {ticket.userName || ticket.userEmail || 'Admin'}
                    </Typography>
                    <Chip label={ticket.category} size="small" variant="outlined" sx={{ height: 20, fontSize: '0.7rem' }} />
                  </Box>

                  <Typography variant="caption" color="text.secondary">
                    Updated: {new Date(ticket.updatedAt || ticket.createdAt).toLocaleString()}
                  </Typography>
                </Box>
              </Paper>
            </Grid>
          ))}
        </Grid>
      )}

      {/* Ticket Conversation Drawer */}
      <Drawer
        anchor="right"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        PaperProps={{ sx: { width: { xs: '100%', sm: 540 }, p: 0 } }}
      >
        {selectedTicket && (
          <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Drawer Header */}
            <Box sx={{ p: 2.5, borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                <Typography variant="subtitle2" fontWeight={800} color="primary.main" sx={{ fontFamily: 'monospace' }}>
                  {selectedTicket.ticketNumber}
                </Typography>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  {getStatusChip(selectedTicket.status)}
                  {getPriorityChip(selectedTicket.priority)}
                </Box>
              </Box>

              <Typography variant="h6" fontWeight={800} sx={{ mb: 1 }}>
                {selectedTicket.subject}
              </Typography>

              <Typography variant="body2" color="text.secondary">
                Church: <strong>{selectedTicket.tenantName}</strong> ({selectedTicket.userName})
              </Typography>
            </Box>

            {/* Quick Status Bar */}
            <Box sx={{ p: 2, bgcolor: 'action.hover', borderBottom: '1px solid', borderColor: 'divider', display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <Button size="small" variant="outlined" onClick={() => handleUpdateStatus('in_progress')}>
                Mark In Progress
              </Button>
              <Button size="small" variant="outlined" color="success" onClick={() => handleUpdateStatus('resolved')}>
                Mark Resolved
              </Button>
              <Button size="small" variant="outlined" color="secondary" onClick={() => handleUpdateStatus('closed')}>
                Close Ticket
              </Button>
            </Box>

            {/* Message Thread History */}
            <Box sx={{ p: 2.5, flexGrow: 1, overflowY: 'auto', bgcolor: 'background.default' }}>
              {loadingThread ? (
                <Box sx={{ textAlign: 'center', py: 4 }}><CircularProgress size={28} /></Box>
              ) : (
                <>
                  {/* Original Question Card */}
                  <Paper sx={{ p: 2, mb: 2, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                      <Typography variant="subtitle2" fontWeight={700}>
                        {selectedTicket.userName || 'Church Admin'}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {new Date(selectedTicket.createdAt).toLocaleString()}
                      </Typography>
                    </Box>
                    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                      {selectedTicket.message}
                    </Typography>
                  </Paper>

                  {/* Replies List */}
                  {ticketReplies.map((reply, idx) => (
                    <Paper
                      key={idx}
                      sx={{
                        p: 2,
                        mb: 2,
                        borderRadius: 2,
                        border: '1px solid',
                        borderColor: reply.isInternalNote ? 'warning.main' : 'divider',
                        bgcolor: reply.isInternalNote ? 'warning.light' : 'background.paper',
                        opacity: reply.isInternalNote ? 0.95 : 1
                      }}
                    >
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography variant="subtitle2" fontWeight={700}>
                            {reply.authorName}
                          </Typography>
                          {reply.isInternalNote && (
                            <Chip label="INTERNAL NOTE" size="small" color="warning" sx={{ height: 18, fontSize: '0.65rem', fontWeight: 800 }} />
                          )}
                        </Box>
                        <Typography variant="caption" color="text.secondary">
                          {new Date(reply.createdAt).toLocaleString()}
                        </Typography>
                      </Box>
                      <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                        {reply.message}
                      </Typography>
                    </Paper>
                  ))}
                </>
              )}
            </Box>

            {/* Reply Composer Footer */}
            <Box sx={{ p: 2.5, borderTop: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={isInternalNote}
                    onChange={(e) => setIsInternalNote(e.target.checked)}
                    size="small"
                  />
                }
                label={<Typography variant="caption" fontWeight={700}>Post as Internal Admin Note (Invisible to Church)</Typography>}
                sx={{ mb: 1 }}
              />

              <TextField
                fullWidth
                multiline
                rows={3}
                placeholder={isInternalNote ? "Write internal staff note..." : "Type response to church admin..."}
                value={replyMessage}
                onChange={(e) => setReplyMessage(e.target.value)}
                sx={{ mb: 1.5 }}
              />

              <Button
                fullWidth
                variant="contained"
                startIcon={<Send size={16} />}
                onClick={handlePostReply}
                disabled={replySubmitting || !replyMessage.trim()}
              >
                {replySubmitting ? 'Posting...' : isInternalNote ? 'Save Internal Note' : 'Send Response'}
              </Button>
            </Box>
          </Box>
        )}
      </Drawer>

      {/* New Ticket Modal */}
      <Dialog open={createModalOpen} onClose={() => setCreateModalOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle fontWeight={700}>Create New Support Ticket</DialogTitle>
        <DialogContent dividers>
          <Grid container spacing={2} sx={{ pt: 1 }}>
            <Grid size={{ xs: 12 }}>
              <FormControl fullWidth size="small">
                <InputLabel>Church (Tenant)</InputLabel>
                <Select
                  value={newTicketData.tenantId}
                  label="Church (Tenant)"
                  onChange={(e) => setNewTicketData({ ...newTicketData, tenantId: e.target.value })}
                >
                  <MenuItem value="">Global Platform (no specific church)</MenuItem>
                  {churches.map((c: any) => (
                    <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            <Grid size={{ xs: 12 }}>
              <TextField
                fullWidth
                size="small"
                label="Ticket Subject"
                value={newTicketData.subject}
                onChange={(e) => setNewTicketData({ ...newTicketData, subject: e.target.value })}
              />
            </Grid>

            <Grid size={{ xs: 6 }}>
              <FormControl fullWidth size="small">
                <InputLabel>Category</InputLabel>
                <Select
                  value={newTicketData.category}
                  label="Category"
                  onChange={(e) => setNewTicketData({ ...newTicketData, category: e.target.value })}
                >
                  <MenuItem value="Technical">Technical Issue</MenuItem>
                  <MenuItem value="Billing">Billing & Subscription</MenuItem>
                  <MenuItem value="Communication">SMS / Email Delivery</MenuItem>
                  <MenuItem value="Account">Account Access</MenuItem>
                </Select>
              </FormControl>
            </Grid>

            <Grid size={{ xs: 6 }}>
              <FormControl fullWidth size="small">
                <InputLabel>Priority</InputLabel>
                <Select
                  value={newTicketData.priority}
                  label="Priority"
                  onChange={(e) => setNewTicketData({ ...newTicketData, priority: e.target.value })}
                >
                  <MenuItem value="low">Low</MenuItem>
                  <MenuItem value="normal">Normal</MenuItem>
                  <MenuItem value="high">High</MenuItem>
                  <MenuItem value="urgent">Urgent</MenuItem>
                </Select>
              </FormControl>
            </Grid>

            <Grid size={{ xs: 12 }}>
              <TextField
                fullWidth
                size="small"
                multiline
                rows={4}
                label="Detailed Description"
                value={newTicketData.message}
                onChange={(e) => setNewTicketData({ ...newTicketData, message: e.target.value })}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateModalOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleCreateTicket}>
            Create Ticket
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Tickets;
