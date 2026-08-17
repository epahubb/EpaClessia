import React, { useEffect, useState } from 'react';
import { Box, Typography, Grid, Card, CardContent } from '@mui/material';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip as RTooltip, ResponsiveContainer, CartesianGrid, LineChart, Line } from 'recharts';
import churchApi from '../../services/churchApi';

const GHS = (n: number) => new Intl.NumberFormat('en-GH', { style: 'currency', currency: 'GHS', maximumFractionDigits: 0 }).format(Number(n) || 0);

export const Reports: React.FC = () => {
  const [d, setD] = useState<any>(null);
  const [fin, setFin] = useState<any>(null);
  useEffect(() => { churchApi.getDashboard().then(setD).catch(() => {}); churchApi.getFinanceSummary().then(setFin).catch(() => {}); }, []);
  const kpi = (t: string, v: any) => (<Card variant="outlined"><CardContent><Typography variant="body2" color="text.secondary">{t}</Typography><Typography variant="h5" fontWeight={800}>{v}</Typography></CardContent></Card>);
  return (
    <Box>
      <Typography variant="h4" fontWeight={800} gutterBottom>Reports & Analytics</Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>Membership, attendance trends and financial performance.</Typography>
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 6, md: 3 }}>{kpi('Total Members', d?.members ?? '—')}</Grid>
        <Grid size={{ xs: 6, md: 3 }}>{kpi('Visitors', d?.visitors ?? '—')}</Grid>
        <Grid size={{ xs: 6, md: 3 }}>{kpi('Total Income', GHS(fin?.totalIncome || 0))}</Grid>
        <Grid size={{ xs: 6, md: 3 }}>{kpi('Net Balance', GHS(fin?.net || 0))}</Grid>
      </Grid>
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6 }}><Card variant="outlined"><CardContent>
          <Typography fontWeight={700} gutterBottom>Giving Trend (6 months)</Typography>
          <ResponsiveContainer width="100%" height={280}><AreaChart data={d?.charts?.giving || []}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="month" /><YAxis /><RTooltip formatter={(v: any) => GHS(v)} /><Area dataKey="total" stroke="#6366f1" fill="#6366f1" fillOpacity={0.2} /></AreaChart></ResponsiveContainer>
        </CardContent></Card></Grid>
        <Grid size={{ xs: 12, md: 6 }}><Card variant="outlined"><CardContent>
          <Typography fontWeight={700} gutterBottom>Attendance Trend (6 weeks)</Typography>
          <ResponsiveContainer width="100%" height={280}><LineChart data={d?.charts?.attendance || []}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="week" /><YAxis /><RTooltip /><Line dataKey="attendance" stroke="#22c55e" strokeWidth={2} /></LineChart></ResponsiveContainer>
        </CardContent></Card></Grid>
        <Grid size={{ xs: 12 }}><Card variant="outlined"><CardContent>
          <Typography fontWeight={700} gutterBottom>Income by Purpose</Typography>
          <ResponsiveContainer width="100%" height={280}><BarChart data={fin?.incomeByPurpose || []}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="purpose" /><YAxis /><RTooltip formatter={(v: any) => GHS(v)} /><Bar dataKey="total" fill="#06b6d4" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer>
        </CardContent></Card></Grid>
      </Grid>
    </Box>
  );
};

export default Reports;
