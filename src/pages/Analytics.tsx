import React, { useState, useEffect } from 'react';
import { Box, Typography, Grid, Paper, Tab, Tabs, Skeleton, Alert } from '@mui/material';
import { 
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, 
  CartesianGrid, Tooltip, Legend, BarChart, Bar 
} from 'recharts';
import AuditLogs from '../components/AuditLogs';
import { subscriptionService } from '../services/subscriptionService';

const Analytics: React.FC = () => {
  const [tabValue, setTabValue] = React.useState(0);
  const [growthData, setGrowthData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      // Real cumulative church & member growth, computed server-side from the database.
      const data = await subscriptionService.getGrowthMonthly();
      const dataArray = Array.isArray(data) ? data : [];
      setGrowthData(dataArray.map((item: any) => ({
        month: item.month,
        churches: Number(item.churches) || 0,
        members: Number(item.members) || 0,
      })));
    } catch (err: any) {
      console.error('Error fetching analytics data:', err);
      setError('Failed to load analytics data.');
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
        <Typography variant="h4" fontWeight={800} sx={{ letterSpacing: '-1px', fontSize: { xs: '1.75rem', md: '2.125rem' } }}>
          Platform Analytics & Logs
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ fontSize: { xs: '0.875rem', md: '1rem' } }}>
          Deep dive into platform growth, usage statistics, and system logs.
        </Typography>
      </Box>

      <Paper sx={{ borderRadius: 3, mb: 4, border: (theme) => `1px solid ${theme.palette.divider}` }}>
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={tabValue} onChange={(_, v) => setTabValue(v)} sx={{ px: 3 }}>
            <Tab label="Growth Trends" sx={{ fontWeight: 700, py: 2 }} />
            <Tab label="Usage Stats" sx={{ fontWeight: 700, py: 2 }} />
            <Tab label="System Logs" sx={{ fontWeight: 700, py: 2 }} />
          </Tabs>
        </Box>

        <Box sx={{ p: 3 }}>
          {error && (
            <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}>
              {error}
            </Alert>
          )}

                  {tabValue === 0 && (
            <Grid container spacing={3}>
              <Grid size={{ xs: 12, md: 6 }}>
                <Typography variant="subtitle1" fontWeight={700} gutterBottom>Church Growth</Typography>
                <Box sx={{ height: 300 }}>
                  {loading ? (
                    <Skeleton variant="rectangular" width="100%" height="100%" sx={{ borderRadius: 2 }} />
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={growthData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#94a3b8', fontWeight: 600 }} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#94a3b8', fontWeight: 600 }} />
                        <Tooltip contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }} />
                        <Line type="monotone" dataKey="churches" stroke="#1b4332" strokeWidth={4} dot={{ r: 6, fill: '#1b4332', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 8 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </Box>
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <Typography variant="subtitle1" fontWeight={700} gutterBottom>Member Growth</Typography>
                <Box sx={{ height: 300 }}>
                  {loading ? (
                    <Skeleton variant="rectangular" width="100%" height="100%" sx={{ borderRadius: 2 }} />
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={growthData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#94a3b8', fontWeight: 600 }} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#94a3b8', fontWeight: 600 }} />
                        <Tooltip contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }} />
                        <Line type="monotone" dataKey="members" stroke="#10b981" strokeWidth={4} dot={{ r: 6, fill: '#10b981', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 8 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </Box>
              </Grid>
            </Grid>
          )}

          {tabValue === 1 && (
            <Box sx={{ py: 4, textAlign: 'center' }}>
              <Typography color="text.secondary">API usage and login statistics will be displayed here.</Typography>
            </Box>
          )}

          {tabValue === 2 && (
            <AuditLogs />
          )}
        </Box>
      </Paper>
    </Box>
  );
};

export default Analytics;
