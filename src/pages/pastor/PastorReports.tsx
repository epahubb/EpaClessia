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
} from '@mui/material';
import {
  Users,
  UserPlus,
  HeartHandshake,
  HandHeart,
  Home,
  Wallet,
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { pastorService } from '../../services/pastorService';

interface TrendPoint {
  month: string;
  value: number;
}

interface ReportData {
  generatedAt: string;
  summary: {
    totalMembers: number;
    newMembers30d: number;
    givingThisMonth: number;
    openPrayerRequests: number;
    answeredPrayers: number;
    scheduledVisits: number;
    completedVisits: number;
    activeCounseling: number;
  };
  givingTrend: TrendPoint[];
  attendanceTrend: TrendPoint[];
  newMembersTrend: TrendPoint[];
}

const STAT_CARDS = (s: ReportData['summary']) => [
  { label: 'Total Members', value: s.totalMembers.toLocaleString(), icon: Users, color: '#6366f1' },
  { label: 'New (30 days)', value: s.newMembers30d.toLocaleString(), icon: UserPlus, color: '#10b981' },
  { label: 'Giving This Month', value: `GHS ${s.givingThisMonth.toLocaleString()}`, icon: Wallet, color: '#f59e0b' },
  { label: 'Open Prayers', value: s.openPrayerRequests.toLocaleString(), icon: HandHeart, color: '#ef4444' },
  { label: 'Answered Prayers', value: s.answeredPrayers.toLocaleString(), icon: HeartHandshake, color: '#8b5cf6' },
  { label: 'Scheduled Visits', value: s.scheduledVisits.toLocaleString(), icon: Home, color: '#0ea5e9' },
];

export default function PastorReports() {
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await pastorService.getReports();
        setData(res);
      } catch {
        setError('Failed to load reports.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}>
        <CircularProgress />
      </Box>
    );
  }
  if (error || !data) {
    return <Alert severity="error">{error || 'No report data available.'}</Alert>;
  }

  return (
    <Box>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" fontWeight={700}>
          Congregation Reports
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Generated {new Date(data.generatedAt).toLocaleString()}
        </Typography>
      </Box>

      <Grid container spacing={2} sx={{ mb: 1 }}>
        {STAT_CARDS(data.summary).map((c) => {
          const Icon = c.icon;
          return (
            <Grid size={{ xs: 12, sm: 6, md: 4, lg: 2 }} key={c.label}>
              <Card>
                <CardContent>
                  <Stack direction="row" spacing={1.5} alignItems="center">
                    <Box
                      sx={{
                        width: 40,
                        height: 40,
                        borderRadius: 2,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        bgcolor: `${c.color}22`,
                        color: c.color,
                      }}
                    >
                      <Icon size={20} />
                    </Box>
                    <Box>
                      <Typography variant="h6" fontWeight={700} lineHeight={1.1}>
                        {c.value}
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
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Giving Trend (GHS)
            </Typography>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={data.givingTrend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="value" stroke="#f59e0b" strokeWidth={2} name="Giving" />
              </LineChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Attendance Trend
            </Typography>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={data.attendanceTrend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" fill="#6366f1" name="Check-ins" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              New Members Trend
            </Typography>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={data.newMembersTrend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" fill="#10b981" name="New members" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Pastoral Care Summary
            </Typography>
            <Stack spacing={2} sx={{ mt: 1 }}>
              <CareRow label="Completed visits" value={data.summary.completedVisits} />
              <CareRow label="Scheduled visits" value={data.summary.scheduledVisits} />
              <CareRow label="Active counseling sessions" value={data.summary.activeCounseling} />
              <CareRow label="Answered prayers" value={data.summary.answeredPrayers} />
            </Stack>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}

function CareRow({ label, value }: { label: string; value: number }) {
  return (
    <Stack direction="row" justifyContent="space-between" alignItems="center">
      <Typography variant="body1">{label}</Typography>
      <Typography variant="h6" fontWeight={700}>
        {value.toLocaleString()}
      </Typography>
    </Stack>
  );
}
