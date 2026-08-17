import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Paper, Grid, Button, Select, MenuItem,
  FormControl, InputLabel, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Chip, CircularProgress,
  Divider, Tooltip, Menu
} from '@mui/material';
import {
  TrendingUp, Users, DollarSign, Download, Calendar,
  BarChart2, PieChart as PieChartIcon, Activity, CheckCircle,
  Building, RefreshCw, FileText, ArrowUpRight
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend, BarChart, Bar
} from 'recharts';
import { reportService } from '../services/reportService';

const Reports: React.FC = () => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [timeRange, setTimeRange] = useState<string>('30days');
  const [exportAnchorEl, setExportAnchorEl] = useState<null | HTMLElement>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await reportService.getOverview();
      setData(res);
    } catch (err) {
      console.error('Failed to load reports:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [timeRange]);

  const handleExport = (format: 'csv' | 'pdf') => {
    setExportAnchorEl(null);
    if (format === 'pdf') {
      window.print();
      return;
    }

    if (!data) return;
    const headers = ['Metric / Church', 'Value', 'Details'];
    const rows = [
      ['Total Churches', data.totalChurches, 'Registered Tenants'],
      ['Total Users', data.totalUsers, 'Platform Admins & Members'],
      ['Total Subscriptions Paid (GHS)', data.totalSubscriptionsPaid, 'Invoice Revenues'],
      ['Total Church Donations Logged (GHS)', data.totalChurchDonationsLogged, 'Giving Records'],
      ...data.topChurches.map((c: any) => [c.name, c.planId.toUpperCase(), `${c.memberCount} Members (${c.city})`])
    ];

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Ecclesia_Executive_Report_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      {/* Header */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', mb: 3, gap: 2 }}>
        <Box>
          <Typography variant="h4" fontWeight={800} sx={{ letterSpacing: '-0.5px' }}>
            System Reports & Analytics
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Executive metrics, church growth curves, subscription revenue, and system activity logs.
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', gap: 1.5 }}>
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <Select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
            >
              <MenuItem value="7days">Last 7 Days</MenuItem>
              <MenuItem value="30days">Last 30 Days</MenuItem>
              <MenuItem value="quarter">This Quarter</MenuItem>
              <MenuItem value="ytd">Year to Date (YTD)</MenuItem>
            </Select>
          </FormControl>

          <Button
            variant="outlined"
            startIcon={<Download size={18} />}
            onClick={(e) => setExportAnchorEl(e.currentTarget)}
            sx={{ borderRadius: 2 }}
          >
            Export Report
          </Button>
          <Menu
            anchorEl={exportAnchorEl}
            open={Boolean(exportAnchorEl)}
            onClose={() => setExportAnchorEl(null)}
          >
            <MenuItem onClick={() => handleExport('csv')}>Export CSV Dataset</MenuItem>
            <MenuItem onClick={() => handleExport('pdf')}>Print Executive Briefing (PDF)</MenuItem>
          </Menu>

          <Tooltip title="Refresh Data">
            <Button variant="outlined" onClick={fetchData} sx={{ minWidth: 40, p: 1, borderRadius: 2 }}>
              <RefreshCw size={18} />
            </Button>
          </Tooltip>
        </Box>
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}>
          <CircularProgress size={36} />
        </Box>
      ) : (
        <>
          {/* Executive Metrics Cards */}
          <Grid container spacing={2.5} sx={{ mb: 3 }}>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <Paper sx={{ p: 2.5, borderRadius: 3, border: '1px solid', borderColor: 'divider' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                  <Typography variant="body2" color="text.secondary" fontWeight={600}>Registered Churches</Typography>
                  <Box sx={{ p: 1, borderRadius: 2, bgcolor: 'primary.light', color: 'primary.dark' }}>
                    <Building size={20} />
                  </Box>
                </Box>
                <Typography variant="h4" fontWeight={800}>{data?.totalChurches || 0}</Typography>
                {(() => {
                  const g = data?.monthlyGrowth || [];
                  const cur = Number(g[g.length - 1]?.churches ?? g[g.length - 1]?.count ?? 0);
                  const prev = Number(g[g.length - 2]?.churches ?? g[g.length - 2]?.count ?? 0);
                  const pct = prev > 0 ? Math.round(((cur - prev) / prev) * 1000) / 10 : 0;
                  const positive = pct >= 0;
                  return (
                    <Typography variant="caption" color={positive ? 'success.main' : 'error.main'} fontWeight={700} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <TrendingUp size={14} /> {positive ? '+' : ''}{pct}% vs last month
                    </Typography>
                  );
                })()}
              </Paper>
            </Grid>

            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <Paper sx={{ p: 2.5, borderRadius: 3, border: '1px solid', borderColor: 'divider' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                  <Typography variant="body2" color="text.secondary" fontWeight={600}>Total Platform Users</Typography>
                  <Box sx={{ p: 1, borderRadius: 2, bgcolor: 'secondary.light', color: 'secondary.dark' }}>
                    <Users size={20} />
                  </Box>
                </Box>
                <Typography variant="h4" fontWeight={800}>{data?.totalUsers || 0}</Typography>
                <Typography variant="caption" color="text.secondary">Admins, pastors & congregation members</Typography>
              </Paper>
            </Grid>

            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <Paper sx={{ p: 2.5, borderRadius: 3, border: '1px solid', borderColor: 'divider' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                  <Typography variant="body2" color="text.secondary" fontWeight={600}>Subscription Revenues</Typography>
                  <Box sx={{ p: 1, borderRadius: 2, bgcolor: 'success.light', color: 'success.dark' }}>
                    <DollarSign size={20} />
                  </Box>
                </Box>
                <Typography variant="h4" fontWeight={800}>
                  GH₵ {Number(data?.totalSubscriptionsPaid || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </Typography>
                <Typography variant="caption" color="text.secondary">Collected subscription fees</Typography>
              </Paper>
            </Grid>

            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <Paper sx={{ p: 2.5, borderRadius: 3, border: '1px solid', borderColor: 'divider' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                  <Typography variant="body2" color="text.secondary" fontWeight={600}>Total Giving Logged</Typography>
                  <Box sx={{ p: 1, borderRadius: 2, bgcolor: 'warning.light', color: 'warning.dark' }}>
                    <Activity size={20} />
                  </Box>
                </Box>
                <Typography variant="h4" fontWeight={800}>
                  GH₵ {Number(data?.totalChurchDonationsLogged || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </Typography>
                <Typography variant="caption" color="text.secondary">Processed across all churches</Typography>
              </Paper>
            </Grid>
          </Grid>

          {/* Charts Row */}
          <Grid container spacing={3} sx={{ mb: 3 }}>
            {/* Growth Curve */}
            <Grid size={{ xs: 12, md: 8 }}>
              <Paper sx={{ p: 3, borderRadius: 3, border: '1px solid', borderColor: 'divider', height: 380 }}>
                <Typography variant="h6" fontWeight={800} sx={{ mb: 0.5 }}>
                  Platform MRR & Church Growth Trend
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Monthly Recurring Revenue (GH₵) vs total active church accounts
                </Typography>

                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={data?.monthlyGrowth || []}>
                    <defs>
                      <linearGradient id="mrrColor" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4}/>
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <RechartsTooltip />
                    <Area type="monotone" dataKey="mrr" stroke="#3b82f6" fillOpacity={1} fill="url(#mrrColor)" name="MRR (GHS)" />
                  </AreaChart>
                </ResponsiveContainer>
              </Paper>
            </Grid>

            {/* Plan Distribution */}
            <Grid size={{ xs: 12, md: 4 }}>
              <Paper sx={{ p: 3, borderRadius: 3, border: '1px solid', borderColor: 'divider', height: 380 }}>
                <Typography variant="h6" fontWeight={800} sx={{ mb: 0.5 }}>
                  Subscription Tier Share
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  Breakdown by church plan tier
                </Typography>

                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie
                      data={data?.planDistribution || []}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={85}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {data?.planDistribution?.map((entry: any, index: number) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <RechartsTooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </Paper>
            </Grid>
          </Grid>

          {/* Top Churches Table */}
          <Paper sx={{ p: 3, borderRadius: 3, border: '1px solid', borderColor: 'divider' }}>
            <Typography variant="h6" fontWeight={800} sx={{ mb: 0.5 }}>
              Top Active Church Tenants
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              High-engagement church organizations on the Ecclesia platform
            </Typography>

            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>Church Name</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Location</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Current Plan</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Account Status</TableCell>
                    <TableCell sx={{ fontWeight: 700 }} align="right">Est. Members</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data?.topChurches?.map((church: any) => (
                    <TableRow key={church.id} hover>
                      <TableCell sx={{ fontWeight: 700 }}>{church.name}</TableCell>
                      <TableCell>{church.city}</TableCell>
                      <TableCell>
                        <Chip label={church.planId.toUpperCase()} size="small" variant="outlined" sx={{ fontWeight: 700 }} />
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={church.status.toUpperCase()}
                          size="small"
                          color={church.status === 'active' ? 'success' : 'warning'}
                          sx={{ fontWeight: 700 }}
                        />
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>
                        {church.memberCount.toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </>
      )}
    </Box>
  );
};

export default Reports;
