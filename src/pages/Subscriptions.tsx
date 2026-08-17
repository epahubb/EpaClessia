import React, { useState, useEffect } from 'react';
import { 
  Box, Typography, Grid, Paper, Card, CardContent, 
  Button, Table, TableBody, TableCell, TableContainer, 
  TableHead, TableRow, Chip, IconButton, Tab, Tabs,
  Skeleton, Alert, useTheme, useMediaQuery
} from '@mui/material';
import { Plus, CreditCard, Download, RefreshCw, Edit, Trash2 } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { subscriptionService } from '../services/subscriptionService';

const Subscriptions: React.FC = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [tabValue, setTabValue] = useState(0);
  const [plans, setPlans] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [revenueData, setRevenueData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [plansData, transactionsData, monthlyRevenueData] = await Promise.all([
        subscriptionService.getPlans(),
        subscriptionService.getTransactions(),
        subscriptionService.getRevenueMonthly()
      ]);
      setPlans(Array.isArray(plansData) ? plansData : []);
      setTransactions(Array.isArray(transactionsData) ? transactionsData : []);
      setRevenueData(Array.isArray(monthlyRevenueData) ? monthlyRevenueData : []);
    } catch (err: any) {
      console.error('Error fetching subscription data:', err);
      setError('Failed to load subscription data. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  return (
    <Box>
      <Box sx={{ 
        mb: 4, 
        display: 'flex', 
        flexDirection: { xs: 'column', sm: 'row' },
        justifyContent: 'space-between', 
        alignItems: { xs: 'flex-start', sm: 'center' },
        gap: 2
      }}>
        <Box>
          <Typography variant="h4" fontWeight={800} sx={{ letterSpacing: '-1px', fontSize: { xs: '1.75rem', md: '2.125rem' } }}>
            Subscriptions & Payments
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ fontSize: { xs: '0.875rem', md: '1rem' } }}>
            Manage plans, track revenue, and monitor payment transactions.
          </Typography>
        </Box>
        <Button 
          variant="contained" 
          fullWidth={isMobile}
          startIcon={<Plus size={18} />}
          sx={{ borderRadius: 2, px: 3, py: 1, whiteSpace: 'nowrap' }}
        >
          Create New Plan
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}>
          {error}
        </Alert>
      )}

      <Grid container spacing={3} sx={{ mb: 4 }}>
        {loading ? (
          Array.from(new Array(3)).map((_, index) => (
            <Grid size={{ xs: 12, md: 4 }} key={index}>
              <Card sx={{ border: (theme) => `1px solid ${theme.palette.divider}` }}>
                <CardContent sx={{ p: 3 }}>
                  <Skeleton variant="text" width="40%" height={32} />
                  <Skeleton variant="text" width="60%" height={48} />
                  <Box sx={{ mt: 2 }}>
                    <Skeleton variant="text" width="100%" />
                    <Skeleton variant="text" width="100%" />
                  </Box>
                  <Box sx={{ mt: 3, display: 'flex', gap: 1 }}>
                    <Skeleton variant="rectangular" width="100%" height={32} />
                    <Skeleton variant="rectangular" width="100%" height={32} />
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          ))
        ) : (Array.isArray(plans) ? plans : []).map((plan) => (
          <Grid size={{ xs: 12, md: 4 }} key={plan.name}>
              <Card sx={{ border: (theme) => `1px solid ${theme.palette.divider}` }}>
              <CardContent sx={{ p: 3 }}>
                <Typography variant="h6" fontWeight={700} color="primary.main" gutterBottom>
                  {plan.name}
                </Typography>
                <Typography variant="h4" fontWeight={800} sx={{ mb: 1 }}>
                  ${plan.price}<Box component="span" sx={{ fontSize: '1rem', fontWeight: 500, color: 'text.secondary' }}>/mo</Box>
                </Typography>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 2 }}>
                  <Typography variant="body2" color="text.secondary">Active Churches</Typography>
                  <Typography variant="body2" fontWeight={700}>{plan.churches}</Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1 }}>
                  <Typography variant="body2" color="text.secondary">Monthly Revenue</Typography>
                  <Typography variant="body2" fontWeight={700}>${plan.revenue?.toLocaleString() || '0'}</Typography>
                </Box>
                <Box sx={{ mt: 3, display: 'flex', gap: 1 }}>
                  <Button variant="outlined" size="small" fullWidth startIcon={<Edit size={14} />}>Edit</Button>
                  <Button variant="outlined" color="error" size="small" fullWidth startIcon={<Trash2 size={14} />}>Delete</Button>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Paper sx={{ mb: 4 }}>
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={tabValue} onChange={(_, v) => setTabValue(v)} sx={{ px: 3 }}>
            <Tab label="Revenue Analytics" sx={{ fontWeight: 700, py: 2 }} />
            <Tab label="Recent Transactions" sx={{ fontWeight: 700, py: 2 }} />
            <Tab label="Failed Payments" sx={{ fontWeight: 700, py: 2 }} />
          </Tabs>
        </Box>

        <Box sx={{ p: 3 }}>
          {tabValue === 0 && (
            <Box sx={{ height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={revenueData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#94a3b8', fontWeight: 600 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#94a3b8', fontWeight: 600 }} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }} />
                  <Bar dataKey="revenue" fill="#1b4332" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Box>
          )}

          {tabValue === 1 && (
            <TableContainer sx={{ overflowX: 'auto' }}>
              <Table sx={{ minWidth: 650 }}>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>Church</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Date</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Amount</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>Invoice</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {loading ? (
                    Array.from(new Array(3)).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell><Skeleton variant="text" /></TableCell>
                        <TableCell><Skeleton variant="text" /></TableCell>
                        <TableCell><Skeleton variant="text" /></TableCell>
                        <TableCell><Skeleton variant="rectangular" width={60} height={24} /></TableCell>
                        <TableCell align="right"><Skeleton variant="circular" width={32} height={32} sx={{ ml: 'auto' }} /></TableCell>
                      </TableRow>
                    ))
                  ) : (Array.isArray(transactions) ? transactions : []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                        <Typography color="text.secondary">No transactions found.</Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    (Array.isArray(transactions) ? transactions : []).map((tx) => (
                      <TableRow key={tx.id}>
                        <TableCell sx={{ fontWeight: 600 }}>{tx.tenantName}</TableCell>
                        <TableCell>{new Date(tx.createdAt).toLocaleDateString()}</TableCell>
                        <TableCell>${tx.amount.toFixed(2)}</TableCell>
                        <TableCell>
                          <Chip 
                            label={(tx.status || 'unknown').toUpperCase()} 
                            size="small" 
                            color={tx.status === 'success' ? 'success' : 'error'} 
                            sx={{ fontWeight: 700, fontSize: '0.6rem' }} 
                          />
                        </TableCell>
                        <TableCell align="right">
                          <IconButton size="small"><Download size={18} /></IconButton>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}

          {tabValue === 2 && (
            <Box sx={{ py: 4, textAlign: 'center' }}>
              <Typography color="text.secondary">No failed payments in the last 30 days.</Typography>
            </Box>
          )}
        </Box>
      </Paper>
    </Box>
  );
};

export default Subscriptions;
