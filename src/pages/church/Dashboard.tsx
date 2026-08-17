import React, { useEffect, useState } from 'react';
import { Box, Grid, Card, CardContent, Typography, Avatar, List, ListItem, ListItemText, ListItemAvatar, CircularProgress, Stack, Divider } from '@mui/material';
import { People, PersonAddAlt1, EventAvailable, VolunteerActivism, Event, Cake, PendingActions, History } from '@mui/icons-material';
import { AreaChart, Area, LineChart, Line, XAxis, YAxis, Tooltip as RTooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import churchApi from '../../services/churchApi';

const GHS = (n: number) => new Intl.NumberFormat('en-GH', { style: 'currency', currency: 'GHS', maximumFractionDigits: 0 }).format(Number(n) || 0);

const Row: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <Stack direction="row" justifyContent="space-between"><Typography variant="body2" color="text.secondary">{label}</Typography><Typography variant="body2" fontWeight={700}>{value}</Typography></Stack>
);

export const Dashboard: React.FC = () => {
  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { churchApi.getDashboard().then(setD).catch((e) => console.error(e)).finally(() => setLoading(false)); }, []);
  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>;
  const data = d || {}; const giving = data.giving || {};
  const stats = [
    { label: 'Total Members', value: data.members ?? 0, icon: <People />, color: '#6366f1' },
    { label: 'Visitors', value: data.visitors ?? 0, icon: <PersonAddAlt1 />, color: '#06b6d4' },
    { label: 'Attendance Today', value: data.attendanceToday ?? 0, icon: <EventAvailable />, color: '#22c55e' },
    { label: 'Giving (This Month)', value: GHS(giving.thisMonth || 0), icon: <VolunteerActivism />, color: '#f59e0b' },
    { label: 'Upcoming Events', value: data.upcomingEvents ?? 0, icon: <Event />, color: '#a855f7' },
    { label: 'Pending Approvals', value: data.pendingApprovals ?? 0, icon: <PendingActions />, color: '#ef4444' },
  ];
  return (
    <Box>
      <Typography variant="h4" fontWeight={800} gutterBottom>Church Dashboard</Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>A live overview of your church community and activity.</Typography>
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {stats.map((s) => (<Grid size={{ xs: 12, sm: 6, md: 4 }} key={s.label}><Card variant="outlined"><CardContent>
          <Stack direction="row" spacing={2} alignItems="center">
            <Avatar sx={{ bgcolor: s.color }}>{s.icon}</Avatar>
            <Box><Typography variant="body2" color="text.secondary">{s.label}</Typography><Typography variant="h5" fontWeight={800}>{s.value}</Typography></Box>
          </Stack>
        </CardContent></Card></Grid>))}
      </Grid>
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, md: 8 }}><Card variant="outlined"><CardContent>
          <Typography fontWeight={700} gutterBottom>Giving Trend (last 6 months)</Typography>
          <ResponsiveContainer width="100%" height={260}><AreaChart data={data.charts?.giving || []}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="month" /><YAxis /><RTooltip formatter={(v: any) => GHS(v)} /><Area dataKey="total" stroke="#6366f1" fill="#6366f1" fillOpacity={0.2} /></AreaChart></ResponsiveContainer>
        </CardContent></Card></Grid>
        <Grid size={{ xs: 12, md: 4 }}><Card variant="outlined"><CardContent>
          <Typography fontWeight={700} gutterBottom>Giving Summary</Typography>
          <Stack spacing={1}>
            <Row label="This Week" value={GHS(giving.thisWeek || 0)} />
            <Row label="This Month" value={GHS(giving.thisMonth || 0)} />
            <Row label="All Time" value={GHS(giving.total || 0)} />
          </Stack>
          <Divider sx={{ my: 1.5 }} />
          {(giving.byPurpose || []).slice(0, 5).map((p: any) => <Row key={p.purpose} label={p.purpose} value={GHS(p.total)} />)}
        </CardContent></Card></Grid>
      </Grid>
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 4 }}><Card variant="outlined"><CardContent>
          <Typography fontWeight={700} gutterBottom>Attendance (last 6 weeks)</Typography>
          <ResponsiveContainer width="100%" height={220}><LineChart data={data.charts?.attendance || []}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="week" /><YAxis /><RTooltip /><Line dataKey="attendance" stroke="#22c55e" strokeWidth={2} /></LineChart></ResponsiveContainer>
        </CardContent></Card></Grid>
        <Grid size={{ xs: 12, md: 4 }}><Card variant="outlined"><CardContent>
          <Typography fontWeight={700} gutterBottom>Upcoming Events</Typography>
          <List dense>{(data.upcomingEventsList || []).length === 0 && <Typography variant="body2" color="text.secondary">No upcoming events.</Typography>}
            {(data.upcomingEventsList || []).map((e: any) => <ListItem key={e.id} disableGutters><ListItemAvatar><Avatar sx={{ bgcolor: '#a855f7' }}><Event /></Avatar></ListItemAvatar><ListItemText primary={e.title || e.name} secondary={e.startTime ? new Date(e.startTime).toLocaleString() : ''} /></ListItem>)}</List>
        </CardContent></Card></Grid>
        <Grid size={{ xs: 12, md: 4 }}><Card variant="outlined"><CardContent>
          <Typography fontWeight={700} gutterBottom>Birthdays & Anniversaries</Typography>
          <List dense>
            {((data.birthdays || []).length + (data.anniversaries || []).length) === 0 && <Typography variant="body2" color="text.secondary">None this month.</Typography>}
            {(data.birthdays || []).map((b: any) => <ListItem key={'b' + b.id} disableGutters><ListItemAvatar><Avatar sx={{ bgcolor: '#ec4899' }}><Cake /></Avatar></ListItemAvatar><ListItemText primary={b.name} secondary={`Birthday \u2022 ${b.date ? new Date(b.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''}`} /></ListItem>)}
            {(data.anniversaries || []).map((a: any) => <ListItem key={'a' + a.id} disableGutters><ListItemAvatar><Avatar sx={{ bgcolor: '#f59e0b' }}><Cake /></Avatar></ListItemAvatar><ListItemText primary={a.name} secondary={`Anniversary \u2022 ${a.date ? new Date(a.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''}`} /></ListItem>)}
          </List>
        </CardContent></Card></Grid>
        <Grid size={{ xs: 12 }}><Card variant="outlined"><CardContent>
          <Typography fontWeight={700} gutterBottom>Recent Activities</Typography>
          <List dense>{(data.recentActivities || []).length === 0 && <Typography variant="body2" color="text.secondary">No recent activity.</Typography>}
            {(data.recentActivities || []).map((r: any, i: number) => <ListItem key={r.id || i} disableGutters><ListItemAvatar><Avatar sx={{ bgcolor: '#64748b' }}><History /></Avatar></ListItemAvatar><ListItemText primary={`${r.userName || 'System'} ${r.action} ${r.entity}`} secondary={r.createdAt ? new Date(r.createdAt).toLocaleString() : ''} /></ListItem>)}</List>
        </CardContent></Card></Grid>
      </Grid>
    </Box>
  );
};

export default Dashboard;
