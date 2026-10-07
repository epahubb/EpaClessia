import React, { useEffect, useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  Box,
  Drawer,
  AppBar,
  Toolbar,
  List,
  Typography,
  Divider,
  IconButton,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Avatar,
  Menu,
  MenuItem,
  Tooltip,
  Alert,
  Button, useMediaQuery, useTheme
} from '@mui/material';
import {
  Menu as MenuIcon,
  Dashboard as DashboardIcon,
  People as PeopleIcon,
  AccountBalance as FinanceIcon,
  Event as EventIcon,
  Groups as MinistryIcon,
  Message as CommunicationIcon,
  Sms as SmsIcon,
  CheckCircle as AttendanceIcon,
  Assessment as ReportsIcon,
  Insights as StatisticsIcon,
  Settings as SettingsIcon,
  PersonAddAlt1 as VisitorIcon,
  ManageAccounts as UsersIcon,
  Badge as PositionIcon,
  Security as SecurityIcon,
  MenuBook as RegistersIcon,
  Logout as LogoutIcon,
  ChevronLeft as ChevronLeftIcon
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import { usePortalProfile } from '../hooks/usePortalProfile';
import type { PortalFeature } from '../lib/denominations';
import { ThemeToggle } from '../components/ThemeToggle';

const drawerWidth = 240;

const menuItems = [
  { feature: 'dashboard' as PortalFeature, text: 'Dashboard', icon: <DashboardIcon />, path: '/church/dashboard' },
  { feature: 'members' as PortalFeature, text: 'Members', icon: <PeopleIcon />, path: '/church/members' },
  { feature: 'visitors' as PortalFeature, text: 'Visitors', icon: <VisitorIcon />, path: '/church/visitors' },
  { feature: 'attendance' as PortalFeature, text: 'Attendance', icon: <AttendanceIcon />, path: '/church/attendance' },
  { feature: 'engagement' as PortalFeature, text: 'Engagement & Follow-up', icon: <AttendanceIcon />, path: '/church/engagement' },
  { feature: 'ministries' as PortalFeature, text: 'Ministries & Groups', icon: <MinistryIcon />, path: '/church/ministries' },
  // Statistical returns sit beside the units they describe, since a leader
  // arriving to file one is thinking about their ministry, not about reports.
  { feature: 'members' as PortalFeature, text: 'Registers', icon: <RegistersIcon />, path: '/church/registers' },
  { feature: 'ministries' as PortalFeature, text: 'Statistics', icon: <StatisticsIcon />, path: '/church/statistics' },
  { feature: 'events' as PortalFeature, text: 'Events & Calendar', icon: <EventIcon />, path: '/church/events' },
  { feature: 'finances' as PortalFeature, text: 'Finance', icon: <FinanceIcon />, path: '/church/finances' },
  { feature: 'communication' as PortalFeature, text: 'Communication', icon: <CommunicationIcon />, path: '/church/communication' },
  { feature: 'smsBundles' as PortalFeature, text: 'SMS Bundles', icon: <SmsIcon />, path: '/church/sms-bundles' },
  { feature: 'users' as PortalFeature, text: 'Users & Permissions', icon: <UsersIcon />, path: '/church/users' },
  // Keep this list in step with the router in App.tsx. A nav entry whose path is
  // not a registered route falls through to the catch-all and lands on /login.
  { feature: 'positions' as PortalFeature, text: 'Roles & Positions', icon: <PositionIcon />, path: '/church/positions' },
  { feature: 'reports' as PortalFeature, text: 'Reports & Analytics', icon: <ReportsIcon />, path: '/church/reports' },
  { feature: 'audit' as PortalFeature, text: 'Audit & Security', icon: <SecurityIcon />, path: '/church/audit' },
  { feature: 'settings' as PortalFeature, text: 'Settings', icon: <SettingsIcon />, path: '/church/settings' },
];

export const ChurchAdminLayout: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  // The denomination chosen when the church was registered decides which areas
  // appear here and what they are called. Every denomination currently gets the
  // whole portal, so this filters nothing out until a tradition is described.
  const { profile, has, label } = usePortalProfile();
  const visibleMenuItems = menuItems.filter((item) => has(item.feature));
  const theme = useTheme();
  const mobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [open, setOpen] = useState(!mobile);
  useEffect(() => { setOpen(!mobile); }, [mobile]);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  const isImpersonating = localStorage.getItem('is_impersonating') === 'true';

  const handleExitImpersonation = () => {
    const originalToken = localStorage.getItem('original_sa_token');
    const originalUser = localStorage.getItem('original_sa_user');
    if (originalToken && originalUser) {
      localStorage.setItem('token', originalToken);
      localStorage.setItem('user', originalUser);
      localStorage.removeItem('original_sa_token');
      localStorage.removeItem('original_sa_user');
      localStorage.removeItem('is_impersonating');
      window.location.href = '/superadmin/churches';
    } else {
      localStorage.clear();
      window.location.href = '/login';
    }
  };

  const handleDrawerToggle = () => {
    setOpen(!open);
  };

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      {isImpersonating && (
        <Alert 
          severity="warning" 
          variant="filled"
          action={
            <Button color="inherit" size="small" onClick={handleExitImpersonation} sx={{ fontWeight: 800 }}>
              Return to SuperAdmin Portal
            </Button>
          }
          sx={{ borderRadius: 0, zIndex: (theme) => theme.zIndex.drawer + 2, py: 0.5 }}
        >
          <strong>Impersonation Mode:</strong> You are currently managing <strong>{user?.tenant?.name}</strong> as a SuperAdmin.
        </Alert>
      )}

      <Box sx={{ display: 'flex', flexGrow: 1 }}>
        <AppBar
          position="fixed"
          sx={{
            top: isImpersonating ? 40 : 0,
            zIndex: (theme) => theme.zIndex.drawer + 1,
            transition: (theme) =>
              theme.transitions.create(['width', 'margin', 'top'], {
                easing: theme.transitions.easing.sharp,
                duration: theme.transitions.duration.leavingScreen,
              }),
            ...(!mobile && {
              marginLeft: open ? drawerWidth : 56,
              width: `calc(100% - ${open ? drawerWidth : 56}px)`,
              transition: (theme) =>
                theme.transitions.create(['width', 'margin', 'top'], {
                  easing: theme.transitions.easing.sharp,
                  duration: theme.transitions.duration.enteringScreen,
                }),
            }),
            backgroundColor: 'background.paper',
            color: 'text.primary',
            boxShadow: 'none',
            borderBottom: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Toolbar>
            <IconButton
              color="inherit"
              aria-label="open drawer"
              onClick={handleDrawerToggle}
              edge="start"
              sx={{ marginRight: { xs: 1, sm: 5 }, ...(!mobile && open && { display: 'none' }) }}
            >
              <MenuIcon />
            </IconButton>
            <Typography variant="h6" noWrap component="div" sx={{ flexGrow: 1, minWidth: 0, fontWeight: 600 }}>
              {user?.tenant?.name}
            </Typography>
            
            <ThemeToggle />
            <Button
              variant="outlined"
              color="inherit"
              size="small"
              startIcon={<LogoutIcon fontSize="small" />}
              onClick={handleLogout}
              sx={{ ml: 1 }}
            >
              Logout
            </Button>
            <Tooltip title="Account settings">
              <IconButton onClick={handleMenuOpen} sx={{ p: 0, ml: 1, display: { xs: 'none', sm: 'inline-flex' } }}>
                <Avatar sx={{ bgcolor: 'primary.main', color: '#fff' }}>
                  {user?.email?.charAt(0).toUpperCase() || 'A'}
                </Avatar>
              </IconButton>
            </Tooltip>
            <Menu
              anchorEl={anchorEl}
              open={Boolean(anchorEl)}
              onClose={handleMenuClose}
              onClick={handleMenuClose}
            >
              <MenuItem onClick={() => navigate('/church/settings')}>Profile</MenuItem>
              {isImpersonating && (
                <MenuItem onClick={handleExitImpersonation} sx={{ color: 'warning.main', fontWeight: 700 }}>
                  Exit Impersonation
                </MenuItem>
              )}
              <Divider />
              <MenuItem onClick={handleLogout}>
                <ListItemIcon>
                  <LogoutIcon fontSize="small" />
                </ListItemIcon>
                Logout
              </MenuItem>
            </Menu>
          </Toolbar>
        </AppBar>

      <Drawer
        variant={mobile ? "temporary" : "permanent"}
        open={open}
        onClose={() => setOpen(false)}
        sx={{
          width: mobile ? 0 : open ? drawerWidth : 56,
          flexShrink: 0,
          whiteSpace: 'nowrap',
          boxSizing: 'border-box',
          ...(open && {
            '& .MuiDrawer-paper': {
              width: drawerWidth,
              transition: (theme) =>
                theme.transitions.create('width', {
                  easing: theme.transitions.easing.sharp,
                  duration: theme.transitions.duration.enteringScreen,
                }),
              overflowX: 'hidden',
            },
          }),
          ...(!open && {
            '& .MuiDrawer-paper': {
              width: (theme) => theme.spacing(7),
              transition: (theme) =>
                theme.transitions.create('width', {
                  easing: theme.transitions.easing.sharp,
                  duration: theme.transitions.duration.leavingScreen,
                }),
              overflowX: 'hidden',
            },
          }),
        }}
      >
        <Toolbar sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', px: [1] }}>
          <IconButton onClick={handleDrawerToggle}>
            <ChevronLeftIcon />
          </IconButton>
        </Toolbar>
        <Divider />
        <List>
          {visibleMenuItems.map((item) => (
            <ListItem key={item.text} disablePadding sx={{ display: 'block' }}>
              <ListItemButton
                onClick={() => { navigate(item.path); if (mobile) setOpen(false); }}
                selected={location.pathname === item.path}
                sx={{
                  minHeight: 48,
                  justifyContent: open ? 'initial' : 'center',
                  px: 2.5,
                  '&.Mui-selected': {
                    backgroundColor: theme.palette.mode === 'dark' ? '#1e293b' : 'primary.light',
                    color: theme.palette.mode === 'dark' ? '#72bc8f' : 'primary.main',
                    '& .MuiListItemIcon-root': {
                      color: theme.palette.mode === 'dark' ? '#72bc8f' : 'primary.main',
                    },
                  },
                }}
              >
                <ListItemIcon
                  sx={{
                    minWidth: 0,
                    mr: open ? 3 : 'auto',
                    justifyContent: 'center',
                  }}
                >
                  {item.icon}
                </ListItemIcon>
                <ListItemText primary={item.text} sx={{ opacity: open ? 1 : 0 }} />
              </ListItemButton>
            </ListItem>
          ))}
        </List>
      </Drawer>

      <Box 
        component="main" 
        sx={{ 
          flexGrow: 1,
          minWidth: 0,
          p: { xs: 2, sm: 3 }, 
          backgroundColor: 'background.default', 
          minHeight: '100vh' 
        }}
        className="animate-fade-in"
      >
        <Toolbar />
        <Outlet />
      </Box>
    </Box>
  </Box>
);
};

// Exported both ways so either import style resolves.
export default ChurchAdminLayout;
