import React, { useState } from 'react';
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
  Button
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
  Settings as SettingsIcon,
  PersonAddAlt1 as VisitorIcon,
  ManageAccounts as UsersIcon,
  Badge as PositionIcon,
  Security as SecurityIcon,
  Logout as LogoutIcon,
  ChevronLeft as ChevronLeftIcon
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';

const drawerWidth = 240;

const menuItems = [
  { text: 'Dashboard', icon: <DashboardIcon />, path: '/church/dashboard' },
  { text: 'Members', icon: <PeopleIcon />, path: '/church/members' },
  { text: 'Visitors', icon: <VisitorIcon />, path: '/church/visitors' },
  { text: 'Attendance', icon: <AttendanceIcon />, path: '/church/attendance' },
  { text: 'Engagement & Follow-up', icon: <AttendanceIcon />, path: '/church/engagement' },
  { text: 'Ministries & Groups', icon: <MinistryIcon />, path: '/church/ministries' },
  { text: 'Events & Calendar', icon: <EventIcon />, path: '/church/events' },
  { text: 'Finance', icon: <FinanceIcon />, path: '/church/finances' },
  { text: 'Communication', icon: <CommunicationIcon />, path: '/church/communication' },
  { text: 'SMS Bundles', icon: <SmsIcon />, path: '/church/sms-bundles' },
  { text: 'Users & Permissions', icon: <UsersIcon />, path: '/church/users' },
  // Keep this list in step with the router in App.tsx. A nav entry whose path is
  // not a registered route falls through to the catch-all and lands on /login.
  { text: 'Roles & Positions', icon: <PositionIcon />, path: '/church/positions' },
  { text: 'Reports & Analytics', icon: <ReportsIcon />, path: '/church/reports' },
  { text: 'Audit & Security', icon: <SecurityIcon />, path: '/church/audit' },
  { text: 'Settings', icon: <SettingsIcon />, path: '/church/settings' },
];

export const ChurchAdminLayout: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(true);
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
            ...(open && {
              marginLeft: drawerWidth,
              width: `calc(100% - ${drawerWidth}px)`,
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
              sx={{ marginRight: 5, ...(open && { display: 'none' }) }}
            >
              <MenuIcon />
            </IconButton>
            <Typography variant="h6" noWrap component="div" sx={{ flexGrow: 1, fontWeight: 600 }}>
              {user?.tenant?.name}
            </Typography>
            
            <Tooltip title="Account settings">
              <IconButton onClick={handleMenuOpen} sx={{ p: 0 }}>
                <Avatar sx={{ bgcolor: 'primary.main' }}>
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
        variant="permanent"
        open={open}
        sx={{
          width: drawerWidth,
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
          {menuItems.map((item) => (
            <ListItem key={item.text} disablePadding sx={{ display: 'block' }}>
              <ListItemButton
                onClick={() => navigate(item.path)}
                selected={location.pathname === item.path}
                sx={{
                  minHeight: 48,
                  justifyContent: open ? 'initial' : 'center',
                  px: 2.5,
                  '&.Mui-selected': {
                    backgroundColor: 'primary.light',
                    color: 'primary.main',
                    '& .MuiListItemIcon-root': {
                      color: 'primary.main',
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
          p: 3, 
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
