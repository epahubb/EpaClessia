import React, { useEffect, useState } from 'react';
import {
  Grid,
  Typography,
  Box,
  Paper,
  Button,
  Card,
  CardContent,
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
  Avatar,
  Divider,
  CircularProgress,
} from '@mui/material';
import { PlayCircle, ArrowRight, Heart, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { profileService } from '../../services/profileService';
import { givingService, GivingRecord } from '../../services/givingService';
import { eventsService, MemberEvent } from '../../services/eventsService';
import {
  memberEngagementService,
  PrayerRequest,
  Sermon,
} from '../../services/memberEngagementService';

interface DashboardState {
  yearlyGivingTotal: number;
  currency: string;
  recentGiving: GivingRecord[];
  upcomingEvents: MemberEvent[];
  recentSermons: Sermon[];
  myPrayers: PrayerRequest[];
}

function formatDate(iso?: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

function formatDateTime(iso?: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

const MemberDashboard: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardState | null>(null);
  const [displayName, setDisplayName] = useState<string>(user?.name || 'Friend');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      // Each source is independent, so a failure in one should not blank the
      // whole dashboard. All calls use the shared authenticated api client.
      const [profileRes, givingRes, eventsRes, prayersRes, sermonsRes] = await Promise.all([
        profileService.getProfile().catch(() => null),
        givingService.getGiving().catch(() => null),
        eventsService.getEvents().catch(() => ({ data: [] as MemberEvent[] })),
        memberEngagementService.getPrayers().catch(() => ({ mine: [], wall: [] })),
        memberEngagementService.getSermons().catch(() => [] as Sermon[]),
      ]);

      if (profileRes?.account?.name) setDisplayName(profileRes.account.name);

      const now = new Date();
      const upcoming = (eventsRes?.data || [])
        .filter((e) => {
          const t = e.startTime ? new Date(e.startTime) : null;
          return !t || t >= now;
        })
        .slice(0, 4);

      setStats({
        yearlyGivingTotal: Number(givingRes?.summary?.thisYear || 0),
        currency: givingRes?.summary?.currency || 'GHS',
        recentGiving: (givingRes?.data || []).slice(0, 3),
        upcomingEvents: upcoming,
        recentSermons: (sermonsRes || []).slice(0, 3),
        myPrayers: (prayersRes?.mine || []).slice(0, 3),
      });
      setLoading(false);
    };
    fetchData();
  }, []);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ mb: 4, display: 'flex', alignItems: 'center', gap: 2 }}>
        <Avatar sx={{ width: 64, height: 64, bgcolor: 'info.main', fontSize: '1.5rem' }}>
          {displayName?.[0]?.toUpperCase()}
        </Avatar>
        <Box>
          <Typography variant="h4" fontWeight={800} sx={{ letterSpacing: '-1px' }}>
            Welcome, {displayName}
          </Typography>
          <Typography variant="body1" color="text.secondary">
            It's good to see you today.
          </Typography>
        </Box>
      </Box>

      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 8 }}>
          <Paper sx={{ p: 3, borderRadius: 4, mb: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
              <Typography variant="h6" fontWeight={700}>
                Upcoming Events
              </Typography>
              <Button
                size="small"
                endIcon={<ArrowRight size={16} />}
                onClick={() => navigate('/member/events')}
              >
                Browse All
              </Button>
            </Box>
            {stats?.upcomingEvents?.length ? (
              <Grid container spacing={2}>
                {stats.upcomingEvents.map((event) => (
                  <Grid size={{ xs: 12, sm: 6 }} key={event.id}>
                    <Card variant="outlined" sx={{ borderRadius: 3 }}>
                      <CardContent>
                        <Typography variant="subtitle2" fontWeight={700} gutterBottom>
                          {event.title}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" display="block">
                          {formatDateTime(event.startTime)}
                        </Typography>
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          display="block"
                          sx={{ mb: 2 }}
                        >
                          {event.location}
                        </Typography>
                        <Button
                          size="small"
                          variant="contained"
                          fullWidth
                          onClick={() => navigate('/member/events')}
                        >
                          {event.myStatus ? 'View' : 'Register'}
                        </Button>
                      </CardContent>
                    </Card>
                  </Grid>
                ))}
              </Grid>
            ) : (
              <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                No upcoming events right now.
              </Typography>
            )}
          </Paper>

          <Paper sx={{ p: 3, borderRadius: 4 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
              <Typography variant="h6" fontWeight={700}>
                Recent Sermons
              </Typography>
              <Button
                size="small"
                endIcon={<ArrowRight size={16} />}
                onClick={() => navigate('/member/sermons')}
              >
                Sermon Archive
              </Button>
            </Box>
            <List>
              {stats?.recentSermons?.map((sermon) => (
                <ListItem key={sermon.id} sx={{ px: 0 }}>
                  <ListItemAvatar>
                    <Avatar sx={{ bgcolor: 'info.light', color: 'info.main' }}>
                      <PlayCircle size={20} />
                    </Avatar>
                  </ListItemAvatar>
                  <ListItemText
                    primary={<Typography fontWeight={700}>{sermon.title}</Typography>}
                    secondary={`${sermon.speaker || ''}${
                      sermon.speaker && sermon.date ? ' \u2022 ' : ''
                    }${formatDate(sermon.date)}`}
                  />
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={() => navigate('/member/sermons')}
                  >
                    Watch
                  </Button>
                </ListItem>
              ))}
              {!stats?.recentSermons?.length && (
                <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                  No sermons available yet.
                </Typography>
              )}
            </List>
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, md: 4 }}>
          <Paper sx={{ p: 3, borderRadius: 4, mb: 3 }}>
            <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>
              Giving Summary
            </Typography>
            <Box sx={{ mb: 2 }}>
              <Typography variant="h4" fontWeight={800} color="primary.main">
                {stats?.currency || 'GHS'}{' '}
                {Number(stats?.yearlyGivingTotal || 0).toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Total contributions this year
              </Typography>
            </Box>
            <Divider sx={{ my: 2 }} />
            <List dense>
              {stats?.recentGiving?.map((g) => (
                <ListItem key={g.id} sx={{ px: 0 }}>
                  <ListItemText primary={g.purpose || 'Offering'} secondary={formatDate(g.createdAt)} />
                  <Typography variant="body2" fontWeight={700}>
                    {g.currency || stats?.currency || 'GHS'}{' '}
                    {Number(g.amount || 0).toLocaleString()}
                  </Typography>
                </ListItem>
              ))}
              {!stats?.recentGiving?.length && (
                <Typography variant="body2" color="text.secondary">
                  No giving records yet.
                </Typography>
              )}
            </List>
            <Button
              fullWidth
              variant="contained"
              sx={{ mt: 2, borderRadius: 2 }}
              onClick={() => navigate('/member/giving')}
            >
              Give Now
            </Button>
          </Paper>

          <Paper sx={{ p: 3, borderRadius: 4 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6" fontWeight={700}>
                My Prayers
              </Typography>
              <Button size="small" onClick={() => navigate('/member/prayer')}>
                <Plus size={16} />
              </Button>
            </Box>
            <List dense>
              {stats?.myPrayers?.map((p) => {
                const answered = p.status === 'answered';
                return (
                  <ListItem key={p.id} sx={{ px: 0 }}>
                    <ListItemAvatar>
                      <Avatar
                        sx={{
                          width: 32,
                          height: 32,
                          bgcolor: answered ? 'success.light' : 'warning.light',
                        }}
                      >
                        <Heart size={16} color={answered ? 'green' : 'orange'} />
                      </Avatar>
                    </ListItemAvatar>
                    <ListItemText
                      primary={
                        <Typography variant="caption" fontWeight={700} sx={{ display: 'block' }}>
                          {formatDate(p.createdAt)}
                        </Typography>
                      }
                      secondary={
                        <Typography
                          variant="caption"
                          sx={{
                            display: '-webkit-box',
                            WebkitLineClamp: 1,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                          }}
                        >
                          {p.request}
                        </Typography>
                      }
                    />
                  </ListItem>
                );
              })}
              {!stats?.myPrayers?.length && (
                <Typography variant="body2" color="text.secondary">
                  You have no prayer requests yet.
                </Typography>
              )}
            </List>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default MemberDashboard;
