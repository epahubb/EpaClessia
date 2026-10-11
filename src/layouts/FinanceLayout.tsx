import React, { useState } from 'react';
import { AppBar, Avatar, Box, Button, Chip, Divider, Drawer, IconButton, InputBase, ListItemButton, ListItemIcon, ListItemText, Stack, Toolbar, Tooltip, Typography, useMediaQuery, useTheme } from '@mui/material';
import { ArrowDownLeft, ArrowUpRight, Building2, ChartNoAxesCombined, FileText, LayoutDashboard, LogOut, Menu, Moon, Package, Search, Settings2, ShieldCheck, Sun, Wallet, X } from 'lucide-react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { useColorMode } from '../contexts/ThemeContext';
import api from '../services/api';
import { financeSections } from '../pages/finance/financeNavigation';
const icons: any = { giving: ArrowDownLeft, dues: Wallet, pledges: FileText, expenses: ArrowUpRight, budgets: ChartNoAxesCombined, inventory: Package, charges: Building2, purposes: Settings2 };
export default function FinanceLayout() {
    const theme = useTheme(), mobile = useMediaQuery(theme.breakpoints.down('lg')), navigate = useNavigate(), location = useLocation();
    const { user, logout } = useAuth(), { mode, toggleColorMode } = useColorMode();
    const [open, setOpen] = useState(false), [search, setSearch] = useState('');
    const identity = useQuery({ queryKey: ['finance-identity', user?.tenantId], queryFn: async () => (await api.get('/church/finance/identity')).data, staleTime: 300000 });
    const nav = (label: string, path: string, Icon: any) => <ListItemButton key={path} selected={location.pathname === path} onClick={() => { navigate(path); setOpen(false); }} sx={{ borderRadius: 2, minHeight: 42, mb: .4, px: 1.5, color: '#adbdcc', '&.Mui-selected': { bgcolor: '#1e493f', color: '#a4f3cb' }, '&.Mui-selected:hover': { bgcolor: '#28584a' }, '&:hover': { bgcolor: '#182a38' } }}><ListItemIcon sx={{ minWidth: 32, color: 'inherit' }}><Icon size={18}/></ListItemIcon><ListItemText primary={label} primaryTypographyProps={{ fontSize: 13, fontWeight: location.pathname === path ? 700 : 500 }}/></ListItemButton>;
    const sidebar = <Box component="nav" aria-label="Finance navigation" sx={{ height: '100%', display: 'flex', flexDirection: 'column', bgcolor: '#0e202c', color: '#fff', p: 2 }}>
    <Stack direction="row" spacing={1.2} sx={{ p: 1, mb: 3, alignItems: 'center' }}><Box sx={{ bgcolor: '#b5f3d1', color: '#123e30', borderRadius: 2, p: 1, display: 'flex' }}><Wallet size={23}/></Box><Box><Typography fontWeight={800}>Ecclesia Finance</Typography><Typography sx={{ fontSize: 11, color: '#92a7b8' }}>CHURCH FINANCE WORKSPACE</Typography></Box>{mobile && <IconButton aria-label="Close navigation" onClick={() => setOpen(false)} sx={{ color: '#fff' }}><X size={18}/></IconButton>}</Stack>
    <Box sx={{ flex: 1, overflowY: 'auto' }}>{nav('Overview', '/finance/dashboard', LayoutDashboard)}{nav('Transaction ledger', '/finance/transactions', Wallet)}
      {['Money in', 'Operations'].map(group => <Box key={group}><Typography sx={{ fontSize: 10.5, letterSpacing: 1.3, color: '#718d9f', mt: 2.2, mb: .8, px: 1.5, textTransform: 'uppercase', fontWeight: 700 }}>{group}</Typography>{financeSections.filter(s => s.group === group).map(s => nav(s.title, `/finance/${s.path}`, icons[s.path]))}</Box>)}
      <Typography sx={{ fontSize: 10.5, letterSpacing: 1.3, color: '#718d9f', mt: 2.2, mb: .8, px: 1.5, fontWeight: 700 }}>REPORTING</Typography>{nav('Reports & receipts', '/finance/reports', ChartNoAxesCombined)}{nav('Church invoices', '/finance/invoices', FileText)}
      <Typography sx={{ fontSize: 10.5, letterSpacing: 1.3, color: '#718d9f', mt: 2.2, mb: .8, px: 1.5, fontWeight: 700 }}>ADMINISTRATION</Typography>{financeSections.filter(s => s.group === 'Administration').map(s => nav(s.title, `/finance/${s.path}`, icons[s.path]))}
    </Box><Box sx={{ mt: 2, p: 1.5, border: '1px solid #2b404d', borderRadius: 2 }}><Stack direction="row" gap={1}><ShieldCheck size={16} color="#85cfaa"/><Typography fontSize={11} color="#bfd0db">Church-scoped finance access</Typography></Stack><Typography fontSize={10.5} color="#8ba5b5" sx={{ mt: .7 }}>Records belong only to your church.</Typography></Box>
  </Box>;
    return <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: mode === 'light' ? '#f3f6f8' : 'background.default' }}>
    <Drawer variant={mobile ? 'temporary' : 'permanent'} open={!mobile || open} onClose={() => setOpen(false)} sx={{ width: mobile ? 0 : 250, flexShrink: 0, '& .MuiDrawer-paper': { width: 250, border: 0, borderRadius: 0 } }}>{sidebar}</Drawer>
    <Box sx={{ flex: 1, minWidth: 0 }}><AppBar position="sticky" elevation={0} sx={{ bgcolor: 'background.paper', color: 'text.primary', borderRadius: 0, borderBottom: '1px solid', borderColor: 'divider' }}><Toolbar sx={{ gap: 1.5, minHeight: '76px!important', px: { xs: 2, md: 3 } }}>
      {mobile && <IconButton aria-label="Open finance navigation" onClick={() => setOpen(true)}><Menu size={22}/></IconButton>}
      <Avatar variant="rounded" src={identity.data?.logo || undefined} sx={{ width: 34, height: 34, bgcolor: 'primary.main', color: '#fff' }}>{(identity.data?.name || 'C')[0]}</Avatar><Box sx={{ minWidth: 0, mr: 'auto' }}><Typography fontWeight={700} noWrap sx={{ maxWidth: { xs: 115, sm: 300 } }}>{identity.data?.name || 'Your church'}</Typography><Typography variant="caption" color="text.secondary">Finance officer portal</Typography></Box>
      <Box component="form" onSubmit={e => { e.preventDefault(); navigate('/finance/transactions?q=' + encodeURIComponent(search)); setSearch(''); }} sx={{ display: { xs: 'none', md: 'flex' }, alignItems: 'center', gap: 1, bgcolor: 'action.hover', borderRadius: 2, px: 1.5, py: .7 }}><Search size={16}/><InputBase inputProps={{ 'aria-label': 'Search transactions' }} placeholder="Search transactions…" value={search} onChange={e => setSearch(e.target.value)} sx={{ fontSize: 13 }}/></Box>
      <Tooltip title={mode === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}><IconButton aria-label="Toggle color mode" onClick={toggleColorMode}>{mode === 'light' ? <Moon size={19}/> : <Sun size={19}/>}</IconButton></Tooltip><Divider orientation="vertical" flexItem sx={{ my: 2, display: { xs: 'none', sm: 'block' } }}/><Avatar sx={{ width: 32, height: 32, bgcolor: 'primary.main', color: '#fff', fontSize: 13, display: { xs: 'none', sm: 'flex' } }}>{user?.name?.[0] || 'F'}</Avatar><Button size="small" aria-label="Sign out" startIcon={<LogOut size={16}/>} onClick={() => { logout(); navigate('/login'); }}>Sign out</Button>
    </Toolbar></AppBar>
      <Box component="main" sx={{ p: { xs: 2, md: 3.5 }, maxWidth: 1600, mx: 'auto', '& .MuiCard-root': { borderRadius: 3 }, '& .MuiTableContainer-root': { borderRadius: 3 }, '& .MuiTableCell-head': { fontSize: 11, letterSpacing: .5 }, '& .MuiButton-root': { textTransform: 'none', borderRadius: 2 }, '& .MuiTab-root': { textTransform: 'none' } }}><Outlet /></Box>
      <Box component="footer" sx={{ px: 3.5, pb: 2, display: 'flex', justifyContent: 'space-between', gap: 2 }}><Typography variant="caption" color="text.secondary">Ecclesia · Responsible stewardship, clear records.</Typography><Chip size="small" variant="outlined" label="Church finance" sx={{ fontSize: 10 }}/></Box>
    </Box>
  </Box>;
}
