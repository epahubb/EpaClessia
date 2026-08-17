import { useEffect, useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  Grid,
  Card,
  CardContent,
  CircularProgress,
  Stack,
  Alert,
  TextField,
  MenuItem,
  LinearProgress,
} from '@mui/material';
import { Users, UserCheck, ListChecks, CalendarClock, Percent } from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { ministryLeaderService } from '../../services/ministryLeaderService';

interface TrendPoint {
  month: string;
  value: number;
}

interface ReportData {
  generatedAt: string;
  ministryCount?: number;
  summary: {
    totalMembers: number;
    activeMembers: number;
    totalTasks: number;
    completedTasks: number;
    taskCompletionRate: number;
    upcomingEvents: number;
    avgAttendance: number;
  };
  attendanceTrend: TrendPoint[];
  taskTrend: TrendPoint[];
  rosterTrend: TrendPoint[];
}

interface Ministry {
  id: string;
  name: string;
}

export default function MinistryReports() {
  const [ministries, setMinistries] = useState<Ministry[]>([]);
  const [ministryId, setMinistryId] = useState<string>('');
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const list = await ministryLeaderService.getManagedMinistries();
        setMinistries(Array.isArray(list) ? list : []);
      } catch {
        /* non-fatal: reports can still aggregate across all */
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError('');
      try {
        const res = await ministryLeaderService.getReports(ministryId || undefined);
        setData(res);
      } catch {
        setError('Failed to load ministry reports.');
      } finally {
        setLoading(false);
      }
    })();
  }, [ministryId]);

  const cards = data
    ? [
        { label: 'Members', value: data.summary.totalMembers, icon: Users, color: '#6366f1' },
        { label: 'Active Members', value: data.summary.activeMembers, icon: UserCheck, color: '#10b981' },
        { label: 'Open Tasks', value: data.summary.totalTasks - data.summary.completedTasks, icon: ListChecks, color: '#f59e0b' },
        { label: 'Upcoming Events', value: data.summary.upcomingEvents, icon: CalendarClock, color: '#0ea5e9' },
      ]
    : [];

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3, flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="h4" fontWeight={700}>
            Ministry Reports
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Engagement, attendance, and task analytics.
          </Typography>
        </Box>
        <TextField
          select
          size="small"
          label="Ministry"
          value={ministryId}
          onChange={(e) => setMinistryId(e.target.value)}
          sx={{ minWidth: 220 }}
        >
          <MenuItem value="">All my ministries</MenuItem>
          {ministries.map((m) => (
            <MenuItem key={m.id} value={m.id}>
              {m.name}
            </MenuItem>
          ))}
        </TextField>
      </Stack>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}>
          <CircularProgress />
        </Box>
      ) : error || !data ? (
        <Alert severity="error">{error || 'No report data available.'}</Alert>
      ) : (
        <>
          <Grid container spacing={2}>
            {cards.map((c) => {
              const Icon = c.icon;
              return (
                <Grid item xs={12} sm={6} md={3} key={c.label}>
                  <Card>
                    <CardContent>
                      <Stack direction="row" spacing={1.5} alignItems="center">
                        <Box
                          sx={{
                            width: 44,
                            height: 44,
                            borderRadius: 2,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            bgcolor: `${c.color}22`,
                            color: c.color,
                          }}
                        >
                          <Icon size={22} />
                        </Box>
                        <Box>
                          <Typography variant="h5" fontWeight={700} lineHeight={1.1}>
                            {c.value.toLocaleString()}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {c.label}
                          </Typography>
                        </Box>
                      </Stack>
                    </CardContent>
                  </Card>
                </Grid>
              );
            })}
          </Grid>

          <Grid container spacing={3} sx={{ mt: 0.5 }}>
            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 3 }}>
                <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                  <Percent size={18} />
                  <Typography variant="h6">Task Completion</Typography>
                </Stack>
                <Typography variant="h3" fontWeight={700} color="primary">
                  {data.summary.taskCompletionRate}%
                </Typography>
                <LinearProgress
                  variant="determinate"
                  value={Math.min(100, data.summary.taskCompletionRate)}
                  sx={{ height: 10, borderRadius: 5, my: 1 }}
                />
                <Typography variant="body2" color="text.secondary">
                  {data.summary.completedTasks} of {data.summary.totalTasks} tasks completed &middot; Avg attendance {data.summary.avgAttendance}%
                </Typography>
              </Paper>
            </Grid>
            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 3 }}>
                <Typography variant="h6" gutterBottom>
                  Attendance Rate (%)
                </Typography>
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={data.attendanceTrend}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis domain={[0, 100]} />
                    <Tooltip />
                    <Line type="monotone" dataKey="value" stroke="#6366f1" strokeWidth={2} name="Attendance %" />
                  </LineChart>
                </ResponsiveContainer>
              </Paper>
            </Grid>
            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 3 }}>
                <Typography variant="h6" gutterBottom>
                  Tasks Completed
                </Typography>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={data.taskTrend}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="value" fill="#10b981" name="Completed" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Paper>
            </Grid>
            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 3 }}>
                <Typography variant="h6" gutterBottom>
                  Roster Growth
                </Typography>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={data.rosterTrend}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="value" fill="#f59e0b" name="New members" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Paper>
            </Grid>
          </Grid>
        </>
      )}
    </Box>
  );
}
