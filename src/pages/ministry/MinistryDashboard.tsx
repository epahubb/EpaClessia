import React, { useEffect, useState } from 'react';
import { 
  Grid, Typography, Box, Paper, 
  Button, Card, CardContent,
  List, ListItem, ListItemText, ListItemAvatar, Avatar,
  LinearProgress
} from '@mui/material';
import { 
  LayoutDashboard, Users, CheckSquare, Calendar, 
  Plus, ArrowRight, Clock, BarChart3
} from 'lucide-react';
import { ministryLeaderService } from '../../services/ministryLeaderService';

const MinistryDashboard: React.FC = () => {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const ministries = await ministryLeaderService.getManagedMinistries();
        if (ministries.length > 0) {
          const data = await ministryLeaderService.getDashboardStats(ministries[0].id);
          setStats(data);
        }
      } catch (error) {
        console.error('Error fetching stats:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  const statCards = [
    { title: 'Ministry Members', value: stats?.memberCount || 0, icon: <Users />, color: '#10b981' },
    { title: 'Pending Tasks', value: stats?.pendingTasksCount || 0, icon: <CheckSquare />, color: '#f59e0b' },
    { title: 'Upcoming Events', value: stats?.upcomingEventsCount || 0, icon: <Calendar />, color: '#3b82f6' },
    { title: 'Avg Attendance', value: `${stats?.avgAttendance || 0}%`, icon: <BarChart3 />, color: '#8b5cf6' },
  ];

  return (
    <Box>
      <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography variant="h4" fontWeight={800} sx={{ letterSpacing: '-1px' }}>Ministry Dashboard</Typography>
          <Typography variant="body1" color="text.secondary">Managing your ministry team and tasks</Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Button variant="contained" startIcon={<Plus size={18} />} sx={{ borderRadius: 2 }}>Create Task</Button>
          <Button variant="outlined" startIcon={<Calendar size={18} />} sx={{ borderRadius: 2 }}>Schedule Event</Button>
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
              <Typography variant="h6" fontWeight={700}>Pending Tasks</Typography>
              <Button size="small" endIcon={<ArrowRight size={16} />}>View All</Button>
            </Box>
            <List>
              {stats?.pendingTasks?.map((task: any) => (
                <ListItem key={task.id} sx={{ px: 0 }}>
                  <ListItemAvatar>
                    <Avatar sx={{ bgcolor: 'warning.light', color: 'warning.main' }}>
                      <Clock size={20} />
                    </Avatar>
                  </ListItemAvatar>
                  <ListItemText 
                    primary={<Typography fontWeight={700}>{task.title}</Typography>}
                    secondary={`Assigned to: ${task.assigneeName} • Due: ${task.dueDate}`}
                  />
                  <Button variant="outlined" size="small">Complete</Button>
                </ListItem>
              ))}
            </List>
          </Paper>

          <Paper sx={{ p: 3, borderRadius: 4 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
              <Typography variant="h6" fontWeight={700}>Ministry Events</Typography>
              <Button size="small" endIcon={<ArrowRight size={16} />}>Calendar</Button>
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
                  <Button variant="text" size="small">Details</Button>
                </ListItem>
              ))}
            </List>
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, md: 4 }}>
          <Paper sx={{ p: 3, borderRadius: 4, mb: 3 }}>
            <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>Member Participation</Typography>
            <Box sx={{ mb: 3 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="body2" fontWeight={600}>Active Volunteers</Typography>
                <Typography variant="body2" fontWeight={700}>{Number(stats?.activeVolunteersRate || 0)}%</Typography>
              </Box>
              <LinearProgress variant="determinate" value={Number(stats?.activeVolunteersRate || 0)} sx={{ height: 8, borderRadius: 4 }} />
            </Box>
            <Box sx={{ mb: 3 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="body2" fontWeight={600}>Task Completion</Typography>
                <Typography variant="body2" fontWeight={700}>{Number(stats?.taskCompletionRate || 0)}%</Typography>
              </Box>
              <LinearProgress variant="determinate" value={Number(stats?.taskCompletionRate || 0)} color="warning" sx={{ height: 8, borderRadius: 4 }} />
            </Box>
          </Paper>

          <Paper sx={{ p: 3, borderRadius: 4 }}>
            <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>Recent Members</Typography>
            <List>
              {stats?.recentMembers?.map((member: any) => (
                <ListItem key={member.id} sx={{ px: 0 }}>
                  <ListItemAvatar>
                    <Avatar sx={{ width: 32, height: 32 }}>{member.name[0]}</Avatar>
                  </ListItemAvatar>
                  <ListItemText 
                    primary={<Typography variant="body2" fontWeight={700}>{member.name}</Typography>}
                    secondary={member.role}
                  />
                </ListItem>
              ))}
            </List>
            <Button fullWidth variant="text" sx={{ mt: 1, fontWeight: 700 }}>View Team</Button>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default MinistryDashboard;
