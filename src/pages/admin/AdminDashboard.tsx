import React, { useEffect, useState } from 'react';
import { 
  Grid, Typography, Box, Paper, 
  Button, Card, CardContent, Divider,
  List, ListItem, ListItemText, ListItemAvatar, Avatar, Chip
} from '@mui/material';
import { 
  Users, Calendar, CreditCard, MessageCircle, 
  Plus, ArrowRight, UserPlus, Heart
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import { churchAdminService } from '../../services/churchAdminService';

const AdminDashboard: React.FC = () => {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const data = await churchAdminService.getDashboardStats();
        setStats(data);
      } catch (error) {
        console.error('Error fetching stats:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  const statCards = [
    { title: 'Total Members', value: stats?.totalMembers || 0, icon: <Users />, color: '#2563eb' },
    { title: 'Attendance Today', value: stats?.attendanceToday || 0, icon: <UserPlus />, color: '#10b981' },
    { title: 'Giving (7d)', value: `GHS ${Number(stats?.recentGiving || 0).toLocaleString()}`, icon: <CreditCard />, color: '#f59e0b' },
    { title: 'Upcoming Events', value: stats?.upcomingEventsCount || 0, icon: <Calendar />, color: '#8b5cf6' },
  ];

  return (
    <Box>
      <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography variant="h4" fontWeight={800} sx={{ letterSpacing: '-1px' }}>Church Overview</Typography>
          <Typography variant="body1" color="text.secondary">Welcome back, Admin</Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Button variant="contained" startIcon={<Plus size={18} />} sx={{ borderRadius: 2 }}>Add Member</Button>
          <Button variant="outlined" startIcon={<CreditCard size={18} />} sx={{ borderRadius: 2 }}>Record Giving</Button>
        </Box>
      </Box>

      <Grid container spacing={3} sx={{ mb: 4 }}>
        {statCards.map((card, index) => (
          <Grid size={{ xs: 12, sm: 6, md: 3 }} key={index}>
            <Card sx={{ borderRadius: 3, boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}>
              <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Box sx={{ bgcolor: `${card.color}15`, color: card.color, p: 1.5, borderRadius: 2, display: 'flex' }}>
                  {card.icon}
                </Box>
                <Box>
                  <Typography variant="body2" color="text.secondary" fontWeight={600}>{card.title}</Typography>
                  <Typography variant="h5" fontWeight={800}>{card.value}</Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 8 }}>
          <Paper sx={{ p: 3, borderRadius: 4, mb: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
              <Typography variant="h6" fontWeight={700}>Upcoming Events</Typography>
              <Button size="small" endIcon={<ArrowRight size={16} />}>View Calendar</Button>
            </Box>
            <List>
              {stats?.upcomingEvents?.map((event: any) => (
                <ListItem key={event.id} sx={{ px: 0 }}>
                  <ListItemAvatar>
                    <Avatar sx={{ bgcolor: 'primary.light', color: 'primary.main' }}>
                      <Calendar size={20} />
                    </Avatar>
                  </ListItemAvatar>
                  <ListItemText 
                    primary={<Typography fontWeight={700}>{event.title}</Typography>}
                    secondary={`${event.date} • ${event.location}`}
                  />
                  <Button variant="outlined" size="small">Manage</Button>
                </ListItem>
              ))}
            </List>
          </Paper>

          <Paper sx={{ p: 3, borderRadius: 4 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
              <Typography variant="h6" fontWeight={700}>Recent Giving</Typography>
              <Button size="small" endIcon={<ArrowRight size={16} />}>Finance Dashboard</Button>
            </Box>
            <Box sx={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {stats?.givingTrends?.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={stats.givingTrends}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="period" />
                    <YAxis />
                    <Tooltip formatter={(v: any) => `GHS ${Number(v).toLocaleString()}`} />
                    <Area type="monotone" dataKey="amount" stroke="#2563eb" fill="#2563eb22" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <Typography color="text.secondary">
                  {loading ? 'Loading giving trends…' : 'No giving recorded yet.'}
                </Typography>
              )}
            </Box>
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, md: 4 }}>
          <Paper sx={{ p: 3, borderRadius: 4, mb: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
              <Typography variant="h6" fontWeight={700}>Pending Prayers</Typography>
              <Chip label={stats?.pendingPrayersCount || 0} size="small" color="warning" />
            </Box>
            <List>
              {stats?.pendingPrayers?.map((prayer: any) => (
                <ListItem key={prayer.id} sx={{ px: 0, alignItems: 'flex-start' }}>
                  <ListItemAvatar>
                    <Avatar sx={{ bgcolor: 'warning.light', color: 'warning.main' }}>
                      <Heart size={20} />
                    </Avatar>
                  </ListItemAvatar>
                  <ListItemText 
                    primary={<Typography variant="body2" fontWeight={700}>{prayer.memberName}</Typography>}
                    secondary={<Typography variant="caption" color="text.secondary" sx={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{prayer.request}</Typography>}
                  />
                </ListItem>
              ))}
            </List>
          </Paper>

          <Paper sx={{ p: 3, borderRadius: 4 }}>
            <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>Quick Actions</Typography>
            <Grid container spacing={1}>
              <Grid size={{ xs: 6 }}>
                <Button fullWidth variant="outlined" sx={{ height: 80, flexDirection: 'column', gap: 1, borderRadius: 3 }}>
                  <UserPlus size={20} />
                  <Typography variant="caption" fontWeight={700}>New Member</Typography>
                </Button>
              </Grid>
              <Grid size={{ xs: 6 }}>
                <Button fullWidth variant="outlined" sx={{ height: 80, flexDirection: 'column', gap: 1, borderRadius: 3 }}>
                  <Calendar size={20} />
                  <Typography variant="caption" fontWeight={700}>New Event</Typography>
                </Button>
              </Grid>
              <Grid size={{ xs: 6 }}>
                <Button fullWidth variant="outlined" sx={{ height: 80, flexDirection: 'column', gap: 1, borderRadius: 3 }}>
                  <CreditCard size={20} />
                  <Typography variant="caption" fontWeight={700}>Record Giving</Typography>
                </Button>
              </Grid>
              <Grid size={{ xs: 6 }}>
                <Button fullWidth variant="outlined" sx={{ height: 80, flexDirection: 'column', gap: 1, borderRadius: 3 }}>
                  <MessageCircle size={20} />
                  <Typography variant="caption" fontWeight={700}>Send SMS</Typography>
                </Button>
              </Grid>
            </Grid>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default AdminDashboard;
