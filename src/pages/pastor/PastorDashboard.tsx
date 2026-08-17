import React, { useEffect, useState } from 'react';
import { 
  Grid, Typography, Box, Paper, 
  Button, Card, CardContent,
  List, ListItem, ListItemText, ListItemAvatar, Avatar, Chip
} from '@mui/material';
import { 
  Heart, MessageCircle, MapPin, Calendar, 
  Plus, ArrowRight, CheckCircle
} from 'lucide-react';
import { pastorService } from '../../services/pastorService';

const PastorDashboard: React.FC = () => {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const data = await pastorService.getDashboardStats();
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
    { title: 'New Members (7d)', value: stats?.newMembersCount || 0, icon: <Plus />, color: '#8b5cf6' },
    { title: 'Pending Prayers', value: stats?.pendingPrayersCount || 0, icon: <MessageCircle />, color: '#f59e0b' },
    { title: 'Upcoming Visits', value: stats?.upcomingVisitsCount || 0, icon: <MapPin />, color: '#10b981' },
    { title: 'Birthdays Today', value: stats?.birthdaysTodayCount || 0, icon: <Calendar />, color: '#ef4444' },
  ];

  return (
    <Box>
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" fontWeight={800} sx={{ letterSpacing: '-1px' }}>Pastoral Dashboard</Typography>
        <Typography variant="body1" color="text.secondary">Shepherding the flock with care</Typography>
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
        <Grid size={{ xs: 12, md: 7 }}>
          <Paper sx={{ p: 3, borderRadius: 4, mb: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
              <Typography variant="h6" fontWeight={700}>Recent Prayer Requests</Typography>
              <Button size="small" endIcon={<ArrowRight size={16} />}>All Requests</Button>
            </Box>
            <List>
              {stats?.recentPrayers?.map((prayer: any) => (
                <ListItem key={prayer.id} sx={{ px: 0, alignItems: 'flex-start' }}>
                  <ListItemAvatar>
                    <Avatar sx={{ bgcolor: 'warning.light', color: 'warning.main' }}>
                      <Heart size={20} />
                    </Avatar>
                  </ListItemAvatar>
                  <ListItemText 
                    primary={<Typography fontWeight={700}>{prayer.memberName}</Typography>}
                    secondary={prayer.request}
                  />
                  <Button variant="text" size="small" startIcon={<CheckCircle size={14} />}>Answered</Button>
                </ListItem>
              ))}
            </List>
          </Paper>

          <Paper sx={{ p: 3, borderRadius: 4 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
              <Typography variant="h6" fontWeight={700}>Upcoming Visitations</Typography>
              <Button size="small" endIcon={<ArrowRight size={16} />}>Schedule Visit</Button>
            </Box>
            <List>
              {stats?.upcomingVisits?.map((visit: any) => (
                <ListItem key={visit.id} sx={{ px: 0 }}>
                  <ListItemAvatar>
                    <Avatar sx={{ bgcolor: 'success.light', color: 'success.main' }}>
                      <MapPin size={20} />
                    </Avatar>
                  </ListItemAvatar>
                  <ListItemText 
                    primary={<Typography fontWeight={700}>{visit.memberName}</Typography>}
                    secondary={`${visit.date} • ${visit.location}`}
                  />
                  <Chip label="Upcoming" size="small" color="info" sx={{ fontWeight: 700, fontSize: '0.65rem' }} />
                </ListItem>
              ))}
            </List>
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, md: 5 }}>
          <Paper sx={{ p: 3, borderRadius: 4, mb: 3 }}>
            <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>Follow-up Reminders</Typography>
            <List>
              {stats?.followUps?.map((follow: any) => (
                <ListItem key={follow.id} sx={{ px: 0 }}>
                  <ListItemAvatar>
                    <Avatar sx={{ bgcolor: 'error.light', color: 'error.main' }}>
                      <Calendar size={20} />
                    </Avatar>
                  </ListItemAvatar>
                  <ListItemText 
                    primary={<Typography variant="body2" fontWeight={700}>{follow.memberName}</Typography>}
                    secondary={`Needs contact: ${follow.reason}`}
                  />
                  <Button variant="outlined" size="small">Call</Button>
                </ListItem>
              ))}
            </List>
          </Paper>

          <Paper sx={{ p: 3, borderRadius: 4 }}>
            <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>Quick Actions</Typography>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12 }}>
                <Button fullWidth variant="contained" startIcon={<Plus size={18} />} sx={{ borderRadius: 2, justifyContent: 'flex-start', py: 1.5 }}>
                  Log Visitation
                </Button>
              </Grid>
              <Grid size={{ xs: 12 }}>
                <Button fullWidth variant="outlined" startIcon={<MessageCircle size={18} />} sx={{ borderRadius: 2, justifyContent: 'flex-start', py: 1.5 }}>
                  New Prayer Request
                </Button>
              </Grid>
              <Grid size={{ xs: 12 }}>
                <Button fullWidth variant="outlined" startIcon={<Heart size={18} />} sx={{ borderRadius: 2, justifyContent: 'flex-start', py: 1.5 }}>
                  Add Pastoral Note
                </Button>
              </Grid>
            </Grid>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default PastorDashboard;
