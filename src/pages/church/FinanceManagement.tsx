import { useMemo } from 'react';
import {
  Box,
  Typography,
  Grid,
  Paper,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Stack,
  Card,
  CardContent,
  Avatar,
  CircularProgress
} from '@mui/material';
import {
  Add as AddIcon,
  TrendingUp as IncomeIcon,
  TrendingDown as ExpenseIcon,
  AccountBalanceWallet as WalletIcon,
  FileDownload as ExportIcon
} from '@mui/icons-material';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import { useQuery } from '@tanstack/react-query';
import churchApi from '../../services/churchApi';

type TxnRow = {
  id: string;
  date: string;
  member: string;
  fund: string;
  amount: number;
  type: 'INCOME' | 'EXPENSE';
  description?: string;
};

const money = (n: number) =>
  new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    Number(n || 0)
  );

const monthKey = (d: Date) => d.toLocaleDateString('en', { month: 'short' });

export const FinanceManagement: React.FC = () => {
  // All figures below come from the signed-in church's own tenant-scoped data.
  const summaryQuery = useQuery({
    queryKey: ['church', 'finance', 'summary'],
    queryFn: churchApi.getFinanceSummary,
  });
  const givingQuery = useQuery({
    queryKey: ['church', 'giving', 'recent'],
    queryFn: () => churchApi.getGiving({ limit: 25 }),
  });
  const expensesQuery = useQuery({
    queryKey: ['church', 'expenses', 'recent'],
    queryFn: () => churchApi.getExpenses({ limit: 25 }),
  });

  const summary = summaryQuery.data || {};
  const totalIncome = Number(summary.totalIncome || 0);
  const totalExpenses = Number(summary.totalExpenses || 0);
  const netBalance = Number(summary.net ?? totalIncome - totalExpenses);

  const giving: any[] = Array.isArray(givingQuery.data) ? givingQuery.data : [];
  const expenses: any[] = Array.isArray(expensesQuery.data) ? expensesQuery.data : [];

  // Recent transactions = real giving (income) + real expenses, merged by date.
  const transactions: TxnRow[] = useMemo(() => {
    const incomeRows: TxnRow[] = giving.map((g, i) => ({
      id: `g_${g.id ?? i}`,
      date: (g.createdAt || g.date || '').toString().slice(0, 10),
      member: g.donorName || g.memberName || g.member || 'Anonymous',
      fund: g.purpose || g.fund || 'General',
      amount: Number(g.amount || 0),
      type: 'INCOME',
    }));
    const expenseRows: TxnRow[] = expenses.map((e, i) => ({
      id: `e_${e.id ?? i}`,
      date: (e.date || e.createdAt || '').toString().slice(0, 10),
      member: 'N/A',
      fund: e.category || 'General',
      amount: Number(e.amount || 0),
      type: 'EXPENSE',
      description: e.description || e.title || 'Expense',
    }));
    return [...incomeRows, ...expenseRows]
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .slice(0, 10);
  }, [giving, expenses]);

  // Monthly income vs expense chart derived from the real records.
  const financeData = useMemo(() => {
    const now = new Date();
    const buckets: { key: string; month: string; income: number; expense: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      buckets.push({
        key: `${d.getFullYear()}-${d.getMonth()}`,
        month: monthKey(d),
        income: 0,
        expense: 0,
      });
    }
    const idxFor = (raw: string) => {
      const d = new Date(raw);
      if (isNaN(d.getTime())) return -1;
      return buckets.findIndex((b) => b.key === `${d.getFullYear()}-${d.getMonth()}`);
    };
    giving.forEach((g) => {
      const idx = idxFor(g.createdAt || g.date);
      if (idx >= 0) buckets[idx].income += Number(g.amount || 0);
    });
    expenses.forEach((e) => {
      const idx = idxFor(e.date || e.createdAt);
      if (idx >= 0) buckets[idx].expense += Number(e.amount || 0);
    });
    return buckets;
  }, [giving, expenses]);

  // Fund balances derived from income-by-purpose in the real summary.
  const fundColors = ['#3f51b5', '#4caf50', '#ff9800', '#9c27b0', '#00acc1', '#e91e63'];
  const funds: { name: string; balance: number; color: string }[] = Array.isArray(
    summary.incomeByPurpose
  )
    ? summary.incomeByPurpose.map((f: any, i: number) => ({
        name: f.purpose || 'General',
        balance: Number(f.total || 0),
        color: fundColors[i % fundColors.length],
      }))
    : [];
  const maxFund = funds.reduce((m, f) => Math.max(m, f.balance), 0) || 1;

  const loading = summaryQuery.isLoading || givingQuery.isLoading || expensesQuery.isLoading;
  const hasChartData = financeData.some((d) => d.income > 0 || d.expense > 0);

  return (
    <Box>
      <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h4" sx={{ fontWeight: 700 }}>
          Finance Management
        </Typography>
        <Stack direction="row" spacing={2}>
          <Button variant="outlined" startIcon={<ExportIcon />}>
            Reports
          </Button>
          <Button variant="contained" startIcon={<AddIcon />}>
            Record Transaction
          </Button>
        </Stack>
      </Box>

      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid size={{ xs: 12, md: 4 }}>
          <Card sx={{ bgcolor: 'success.light', color: 'success.contrastText' }}>
            <CardContent>
              <Stack direction="row" spacing={2} alignItems="center">
                <Avatar sx={{ bgcolor: 'success.main' }}><IncomeIcon /></Avatar>
                <Box>
                  <Typography variant="subtitle2">Total Income</Typography>
                  <Typography variant="h4" sx={{ fontWeight: 700 }}>GHS {money(totalIncome)}</Typography>
                </Box>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <Card sx={{ bgcolor: 'error.light', color: 'error.contrastText' }}>
            <CardContent>
              <Stack direction="row" spacing={2} alignItems="center">
                <Avatar sx={{ bgcolor: 'error.main' }}><ExpenseIcon /></Avatar>
                <Box>
                  <Typography variant="subtitle2">Total Expenses</Typography>
                  <Typography variant="h4" sx={{ fontWeight: 700 }}>GHS {money(totalExpenses)}</Typography>
                </Box>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <Card sx={{ bgcolor: 'primary.light', color: 'primary.contrastText' }}>
            <CardContent>
              <Stack direction="row" spacing={2} alignItems="center">
                <Avatar sx={{ bgcolor: 'primary.main' }}><WalletIcon /></Avatar>
                <Box>
                  <Typography variant="subtitle2">Net Balance</Typography>
                  <Typography variant="h4" sx={{ fontWeight: 700 }}>GHS {money(netBalance)}</Typography>
                </Box>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Grid container spacing={3}>
        <Grid size={{ xs: 12, lg: 8 }}>
          <Paper sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" sx={{ mb: 3, fontWeight: 600 }}>Income vs Expenses</Typography>
            <Box sx={{ height: 350, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {loading ? (
                <CircularProgress />
              ) : hasChartData ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={financeData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="income" fill="#4caf50" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="expense" fill="#f44336" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <Typography color="text.secondary">No financial activity recorded yet.</Typography>
              )}
            </Box>
          </Paper>

          <TableContainer component={Paper}>
            <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
              <Typography variant="h6" sx={{ fontWeight: 600 }}>Recent Transactions</Typography>
            </Box>
            <Table>
              <TableHead sx={{ bgcolor: 'grey.50' }}>
                <TableRow>
                  <TableCell>Date</TableCell>
                  <TableCell>Member / Description</TableCell>
                  <TableCell>Fund</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell align="right">Amount</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {transactions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                      {loading ? 'Loading transactions…' : 'No transactions recorded yet.'}
                    </TableCell>
                  </TableRow>
                ) : (
                  transactions.map((tx) => (
                    <TableRow key={tx.id} hover>
                      <TableCell variant="body">{tx.date}</TableCell>
                      <TableCell variant="body">{tx.member !== 'N/A' ? tx.member : tx.description}</TableCell>
                      <TableCell variant="body">{tx.fund}</TableCell>
                      <TableCell>
                        <Chip
                          label={tx.type}
                          size="small"
                          color={tx.type === 'INCOME' ? 'success' : 'error'}
                          variant="outlined"
                          sx={{ fontWeight: 600, fontSize: '0.65rem' }}
                        />
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600, color: tx.type === 'INCOME' ? 'success.main' : 'error.main' }}>
                        {tx.type === 'INCOME' ? '+' : '-'}GHS {money(tx.amount)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Grid>

        <Grid size={{ xs: 12, lg: 4 }}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ mb: 3, fontWeight: 600 }}>Fund Balances</Typography>
            <Stack spacing={2}>
              {funds.length === 0 ? (
                <Typography color="text.secondary">No fund activity recorded yet.</Typography>
              ) : (
                funds.map((fund) => (
                  <Box key={fund.name} sx={{ p: 2, border: '1px solid', borderColor: 'divider' }}>
                    <Typography variant="subtitle2" color="text.secondary">{fund.name}</Typography>
                    <Typography variant="h6" sx={{ fontWeight: 700 }}>GHS {money(fund.balance)}</Typography>
                    <Box sx={{ mt: 1, height: 4, bgcolor: 'grey.100', borderRadius: 1 }}>
                      <Box sx={{ width: `${Math.round((fund.balance / maxFund) * 100)}%`, height: '100%', bgcolor: fund.color, borderRadius: 1 }} />
                    </Box>
                  </Box>
                ))
              )}
            </Stack>
            <Button fullWidth variant="text" sx={{ mt: 2 }}>View All Funds</Button>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};
