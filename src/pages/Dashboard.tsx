import React, { useState, useEffect, useMemo } from 'react';
import {
  Box, Typography, Paper, Grid, Button, Menu, MenuItem, IconButton, Avatar,
  Chip, CircularProgress, LinearProgress, alpha, useTheme,
} from '@mui/material';
import {
  Building2, Users, DollarSign, LifeBuoy, Download, ChevronDown, FileText,
  FileSpreadsheet, FileCode, MoreHorizontal, Calendar, Clock, Activity,
  TrendingUp,
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, PieChart, Pie, Cell, AreaChart, Area,
} from 'recharts';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { dashboardService } from '../services/dashboardService';

const GHS = (n: number) =>
  `GH\u20b5 ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const COLORS = ['#1b4332', '#2d6a4f', '#40916c', '#52b788', '#74c69d'];

function formatUptime(seconds: number): string {
  if (!seconds || seconds < 0) return '\u2014';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${d}d ${h}h ${m}m ${s}s`;
}

const StatCard: React.FC<{ icon: React.ReactNode; label: string; value: string; color: string; trend?: string }> = ({ icon, label, value, color, trend }) => (
  <Paper sx={{ p: 3, borderRadius: 4, border: '1px solid', borderColor: 'divider', height: '100%' }}>
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
      <Box>
        <Typography variant="body2" color="text.secondary" fontWeight={700}>{label}</Typography>
        <Typography variant="h4" fontWeight={900} sx={{ mt: 1, letterSpacing: '-1px' }}>{value}</Typography>
        {trend && <Typography variant="caption" color="text.secondary" fontWeight={600}>{trend}</Typography>}
      </Box>
      <Box sx={{ p: 1.5, borderRadius: 3, bgcolor: alpha(color, 0.12), color, display: 'flex' }}>{icon}</Box>
    </Box>
  </Paper>
);

const Dashboard: React.FC = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const [exportAnchorEl, setExportAnchorEl] = useState<null | HTMLElement>(null);
  const [liveUptime, setLiveUptime] = useState(0);

  const { data: stats, isLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: dashboardService.getStats,
  });

  // Time tracker: seed from the server's real process uptime, then tick locally.
  useEffect(() => {
    const seconds = Number(stats?.systemHealth?.uptimeSeconds || 0);
    if (!seconds) return;
    setLiveUptime(seconds);
    const id = setInterval(() => setLiveUptime((v) => v + 1), 1000);
    return () => clearInterval(id);
  }, [stats?.systemHealth?.uptimeSeconds]);

  const growth = useMemo(() => {
    const g = stats?.growth || [];
    return g.map((row: any) => ({
      name: row.month || row.label || '',
      value: Number(row.churches ?? row.count ?? row.value ?? 0),
    }));
  }, [stats]);

  const revenueSeries = useMemo(() => {
    const r = stats?.revenueSeries || [];
    return r.map((row: any) => ({
      name: row.month || row.label || '',
      revenue: Number(row.revenue ?? row.value ?? 0),
    }));
  }, [stats]);

  const revenueTarget = Number(stats?.revenueTarget || 0);
  const revenueThisYear = Number(stats?.revenueThisYear || 0);
  const targetPct = revenueTarget > 0 ? Math.min(100, Math.round((revenueThisYear / revenueTarget) * 100)) : 0;
  const gaugeData = [{ value: targetPct }, { value: 100 - targetPct }];

  const recentRegistrations = stats?.recentRegistrations || [];
  const expiring = stats?.expiringSubscriptions || [];

  const buildRows = () => {
    const rows: Array<[string, string]> = [
      ['Total Churches', String(stats?.totalChurches ?? 0)],
      ['Active Members', String(stats?.totalMembers ?? 0)],
      ['Monthly Revenue', GHS(stats?.monthlyRevenue ?? stats?.mrr ?? 0)],
      ['Monthly Recurring Revenue (MRR)', GHS(stats?.mrr ?? 0)],
      ['Active Subscriptions', String(stats?.activeSubscriptions ?? 0)],
      ['Support Tickets (Open)', String(stats?.pendingTickets ?? 0)],
      ['Revenue This Year', GHS(revenueThisYear)],
      ['Revenue Target', GHS(revenueTarget)],
      ['System Uptime', formatUptime(liveUptime)],
      ['System Status', String(stats?.systemHealth?.status || 'healthy')],
    ];
    return rows;
  };

  const handleExport = (format: 'csv' | 'excel' | 'pdf') => {
    setExportAnchorEl(null);
    const rows = buildRows();
    const stamp = new Date().toISOString().slice(0, 10);

    if (format === 'pdf') {
      const w = window.open('', '_blank');
      if (!w) return;
      const html = `<!DOCTYPE html><html><head><title>EpaChurch Dashboard Report</title>
        <style>body{font-family:system-ui,sans-serif;padding:24px;color:#0f172a}h1{font-size:22px}
        table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border:1px solid #e2e8f0;padding:10px 14px;text-align:left;font-size:13px}
        th{background:#f8fafc;text-transform:uppercase;font-size:11px}</style></head>
        <body><h1>EpaChurch \u2014 Platform Dashboard</h1><p>Generated: ${new Date().toLocaleString()}</p>
        <table><thead><tr><th>Metric</th><th>Value</th></tr></thead><tbody>
        ${rows.map((r) => `<tr><td>${r[0]}</td><td>${r[1]}</td></tr>`).join('')}
        </tbody></table><script>window.onload=function(){window.print()}</script></body></html>`;
      w.document.write(html);
      w.document.close();
      return;
    }

    if (format === 'excel') {
      // Excel-compatible HTML table workbook (.xls)
      const table = `<table><tr><th>Metric</th><th>Value</th></tr>${rows.map((r) => `<tr><td>${r[0]}</td><td>${r[1]}</td></tr>`).join('')}</table>`;
      const blob = new Blob([`<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"/></head><body>${table}</body></html>`], { type: 'application/vnd.ms-excel' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `EpaChurch_Dashboard_${stamp}.xls`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return;
    }

    // CSV
    const csv = 'data:text/csv;charset=utf-8,' + ['Metric,Value', ...rows.map((r) => `"${r[0]}","${r[1]}"`)].join('\n');
    const a = document.createElement('a');
    a.href = encodeURI(csv);
    a.download = `EpaChurch_Dashboard_${stamp}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  if (isLoading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', py: 12 }}><CircularProgress /></Box>;
  }

  const health = stats?.systemHealth || {};
  const healthColor = health.status === 'degraded' ? '#f59e0b' : '#10b981';

  return (
    <Box sx={{ p: { xs: 2, md: 4 } }}>
      {/* Header */}
      <Box sx={{ mb: 4, display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' }, gap: 2 }}>
        <Box>
          <Typography variant="h4" fontWeight={900} sx={{ letterSpacing: '-1.5px' }}>Platform Dashboard</Typography>
          <Typography variant="body1" color="text.secondary" fontWeight={500}>Live overview of all churches on the EpaChurch platform.</Typography>
        </Box>
        <Box>
          <Button
            variant="outlined"
            onClick={(e) => setExportAnchorEl(e.currentTarget)}
            startIcon={<Download size={18} />}
            endIcon={<ChevronDown size={16} />}
            sx={{ borderRadius: 3, px: 3, fontWeight: 700 }}
          >
            Export
          </Button>
          <Menu
            anchorEl={exportAnchorEl}
            open={Boolean(exportAnchorEl)}
            onClose={() => setExportAnchorEl(null)}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            PaperProps={{ sx: { width: 190, borderRadius: 3, mt: 1 } }}
          >
            <MenuItem onClick={() => handleExport('csv')} sx={{ gap: 1.5, fontWeight: 600, py: 1.2 }}><FileText size={18} color="#3b82f6" /> CSV Format</MenuItem>
            <MenuItem onClick={() => handleExport('excel')} sx={{ gap: 1.5, fontWeight: 600, py: 1.2 }}><FileSpreadsheet size={18} color="#10b981" /> Excel (.xls)</MenuItem>
            <MenuItem onClick={() => handleExport('pdf')} sx={{ gap: 1.5, fontWeight: 600, py: 1.2 }}><FileCode size={18} color="#ef4444" /> Print / PDF</MenuItem>
          </Menu>
        </Box>
      </Box>

      {/* Stat Cards */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}><StatCard icon={<Building2 size={22} />} label="Total Churches" value={String(stats?.totalChurches ?? 0)} color="#1b4332" trend={`${stats?.activeSubscriptions ?? 0} active subscriptions`} /></Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}><StatCard icon={<Users size={22} />} label="Active Members" value={Number(stats?.totalMembers ?? 0).toLocaleString()} color="#2563eb" trend="Across all churches" /></Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}><StatCard icon={<DollarSign size={22} />} label="Monthly Revenue" value={GHS(stats?.monthlyRevenue ?? stats?.mrr ?? 0)} color="#16a34a" trend={`MRR ${GHS(stats?.mrr ?? 0)}`} /></Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}><StatCard icon={<LifeBuoy size={22} />} label="Support Tickets" value={String(stats?.pendingTickets ?? 0)} color="#f59e0b" trend="Open / pending" /></Grid>
      </Grid>

      {/* Charts Row */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={{ p: 3, borderRadius: 4, border: '1px solid', borderColor: 'divider', height: '100%' }}>
            <Typography variant="h6" fontWeight={800} sx={{ mb: 2 }}>Church Growth (12 months)</Typography>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={growth}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme.palette.divider} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <RechartsTooltip />
                <Bar dataKey="value" radius={[8, 8, 0, 0]} fill="#1b4332" name="Churches" />
              </BarChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={{ p: 3, borderRadius: 4, border: '1px solid', borderColor: 'divider', height: '100%' }}>
            <Typography variant="h6" fontWeight={800} sx={{ mb: 2 }}>Revenue (12 months)</Typography>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={revenueSeries}>
                <defs>
                  <linearGradient id="dashRev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#16a34a" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#16a34a" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme.palette.divider} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <RechartsTooltip formatter={(v: any) => GHS(Number(v))} />
                <Area type="monotone" dataKey="revenue" stroke="#16a34a" strokeWidth={2.5} fill="url(#dashRev)" />
              </AreaChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>
      </Grid>

      {/* Health / Expiring / Revenue Target */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        {/* System Health */}
        <Grid size={{ xs: 12, md: 3 }}>
          <Paper sx={{ p: 3, borderRadius: 4, border: '1px solid', borderColor: 'divider', height: '100%' }}>
            <Typography variant="h6" fontWeight={800} sx={{ mb: 2 }}>System Health</Typography>
            <Chip label={String(health.status || 'healthy').toUpperCase()} size="small" sx={{ mb: 2, bgcolor: alpha(healthColor, 0.12), color: healthColor, fontWeight: 800 }} />
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="caption" fontWeight={700} color="text.secondary">Database</Typography>
                <Typography variant="caption" fontWeight={800} sx={{ color: health.database ? '#10b981' : '#ef4444' }}>{health.database ? 'Connected' : 'Down'}</Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="caption" fontWeight={700} color="text.secondary">Engine</Typography>
                <Typography variant="caption" fontWeight={800}>{String(health.databaseClient || 'postgres')}</Typography>
              </Box>
            </Box>
          </Paper>
        </Grid>

        {/* Time Tracker */}
        <Grid size={{ xs: 12, md: 3 }}>
          <Paper sx={{ p: 3, borderRadius: 4, border: '1px solid', borderColor: 'divider', height: '100%' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
              <Clock size={18} color="#2563eb" />
              <Typography variant="h6" fontWeight={800}>Time Tracker</Typography>
            </Box>
            <Typography variant="caption" color="text.secondary" fontWeight={700}>Server uptime</Typography>
            <Typography variant="h5" fontWeight={900} sx={{ mt: 0.5 }}>{formatUptime(liveUptime)}</Typography>
          </Paper>
        </Grid>

        {/* Revenue Target */}
        <Grid size={{ xs: 12, md: 3 }}>
          <Paper sx={{ p: 3, borderRadius: 4, border: '1px solid', borderColor: 'divider', height: '100%', textAlign: 'center' }}>
            <Typography variant="h6" fontWeight={800} sx={{ mb: 1 }}>Revenue Target</Typography>
            <Box sx={{ height: 130, position: 'relative' }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={gaugeData} cx="50%" cy="90%" startAngle={180} endAngle={0} innerRadius={55} outerRadius={80} paddingAngle={0} dataKey="value" stroke="none">
                    <Cell fill="#1b4332" />
                    <Cell fill={theme.palette.action.hover} />
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <Box sx={{ position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)' }}>
                <Typography variant="h4" fontWeight={900}>{targetPct}%</Typography>
              </Box>
            </Box>
            <Typography variant="caption" color="text.secondary" fontWeight={600}>{GHS(revenueThisYear)} of {GHS(revenueTarget)}</Typography>
          </Paper>
        </Grid>

        {/* Expiring */}
        <Grid size={{ xs: 12, md: 3 }}>
          <Paper sx={{ p: 3, borderRadius: 4, border: '1px solid', borderColor: 'divider', height: '100%' }}>
            <Typography variant="h6" fontWeight={800} sx={{ mb: 2 }}>Expiring Soon</Typography>
            {expiring.length === 0 ? (
              <Typography variant="caption" color="text.secondary">No upcoming expiries.</Typography>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {expiring.slice(0, 5).map((sub: any, i: number) => (
                  <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Box sx={{ p: 1, borderRadius: 2, bgcolor: alpha('#f59e0b', 0.12), color: '#f59e0b', display: 'flex' }}><Calendar size={16} /></Box>
                    <Box>
                      <Typography variant="body2" fontWeight={700}>{sub.name || sub.tenantName}</Typography>
                      <Typography variant="caption" color="text.secondary">Expires: {sub.expiryDate || sub.subscriptionEndDate ? new Date(sub.expiryDate || sub.subscriptionEndDate).toLocaleDateString() : '\u2014'}</Typography>
                    </Box>
                  </Box>
                ))}
              </Box>
            )}
          </Paper>
        </Grid>
      </Grid>

      {/* Recent Registrations */}
      <Paper sx={{ p: 3, borderRadius: 4, border: '1px solid', borderColor: 'divider' }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6" fontWeight={800}>Recent Registrations</Typography>
          <Button size="small" onClick={() => navigate('/super-admin/churches')} sx={{ fontWeight: 700, textTransform: 'none' }}>View all</Button>
        </Box>
        {recentRegistrations.length === 0 ? (
          <Typography variant="caption" color="text.secondary">No recent church registrations.</Typography>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {recentRegistrations.map((church: any, i: number) => (
              <Box key={church.id || i} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Avatar src={church.logo} variant="rounded" sx={{ width: 42, height: 42, bgcolor: alpha(COLORS[i % COLORS.length], 0.15), color: COLORS[i % COLORS.length], fontWeight: 800 }}>
                    {(church.name || '?').charAt(0)}
                  </Avatar>
                  <Box>
                    <Typography variant="body2" fontWeight={800}>{church.name}</Typography>
                    <Typography variant="caption" color="text.secondary">{church.city || church.location || '\u2014'}</Typography>
                  </Box>
                </Box>
                <Chip label={(church.status || 'active').toUpperCase()} size="small" sx={{ fontWeight: 800, fontSize: '0.65rem' }} />
              </Box>
            ))}
          </Box>
        )}
      </Paper>
    </Box>
  );
};

export default Dashboard;
