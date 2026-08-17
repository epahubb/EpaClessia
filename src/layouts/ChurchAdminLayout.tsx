import React, { useState, useEffect } from 'react';
import { 
  Box, AppBar, Toolbar, IconButton, Typography, Drawer, 
  List, ListItem, ListItemButton, ListItemIcon, ListItemText, 
  Divider, Avatar, Button, Tooltip, useTheme, useMediaQuery,
  Chip
} from '@mui/material';
import { 
  Menu as MenuIcon, LayoutDashboard, Users, 
  CreditCard, Calendar, Layers, MessageSquare, 
  BarChart3, Settings, LogOut, Bell, Search, 
  ShieldCheck, UserCheck
} from 'lucide-react';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useColorMode } from '../contexts/ThemeContext';
import { Sun, Moon } from 'lucide-react';

const drawerWidth = 280;

const ChurchAdminLayout: React.FC = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [open, setOpen] = useState(!isMobile);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const { toggleColorMode, mode } = useColorMode();

  useEffect(() => {
    setOpen(!isMobile);
  }, [isMobile]);

  const toggleDrawer = () => {
    setOpen(!open);
  };

  const menuItems = [
    { text: 'Dashboard', icon: <LayoutDashboard size={20} />, path: '/admin/dashboard' },
    { text: 'Members', icon: <Users size={20} />, path: '/admin/members' },
    { text: 'Finances', icon: <CreditCard size={20} />, path: '/admin/finances' },
    { text: 'Events', icon: <Calendar size={20} />, path: '/admin/events' },
    { text: 'Ministries', icon: <Layers size={20} />, path: '/admin/ministries' },
    { text: 'Communication', icon: <MessageSquare size={20} />, path: '/admin/communication' },
    { text: 'Attendance', icon: <UserCheck size={20} />, path: '/admin/attendance' },
    { text: 'Reports', icon: <BarChart3 size={20} />, path: '/admin/reports' },
    { text: 'Settings', icon: <Settings size={20} />, path: '/admin/settings' },
  ];

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar 
        position="fixed" 
        sx={{ 
          zIndex: theme.zIndex.drawer + 1, 
          bgcolor: 'background.paper', 
          color: 'text.primary',
          boxShadow: 'none',
          borderBottom: `1px solid ${theme.palette.divider}`
        }}
      >
        <Toolbar sx={{ justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <IconButton color="inherit" onClick={toggleDrawer} edge="start" sx={{ mr: 2 }}>
              <MenuIcon size={20} />
            </IconButton>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box sx={{ bgcolor: 'primary.main', p: 0.5, borderRadius: 1, display: 'flex' }}>
                <ShieldCheck size={20} color="white" />
              </Box>
              <Typography variant="h6" noWrap fontWeight={700} sx={{ letterSpacing: '-0.5px' }}>
                Ecclesia
              </Typography>
              <Chip label="CHURCH ADMIN" size="small" sx={{ ml: 1, height: 18, fontSize: '0.65rem', fontWeight: 700, bgcolor: 'primary.main', color: 'primary.contrastText' }} />
            </Box>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <IconButton size="small" onClick={toggleColorMode} color="inherit">
              {mode === 'light' ? <Moon size={18} /> : <Sun size={18} />}
            </IconButton>
            <IconButton size="small"><Bell size={18} /></IconButton>
            <Divider orientation="vertical" flexItem sx={{ mx: 1, height: 24, my: 'auto' }} />
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Avatar sx={{ width: 32, height: 32, bgcolor: 'primary.main', fontSize: '0.875rem' }}>
                {user?.name?.[0] || 'A'}
              </Avatar>
              <Typography variant="body2" fontWeight={700} sx={{ display: { xs: 'none', md: 'block' } }}>
                {user?.name}
              </Typography>
            </Box>
            <Button variant="outlined" color="inherit" size="small" startIcon={<LogOut size={16} />} onClick={handleLogout} sx={{ ml: 1, textTransform: 'none' }}>
              Logout
            </Button>
          </Box>
        </Toolbar>
      </AppBar>

      <Drawer
        variant={isMobile ? "temporary" : "permanent"}
        open={open}
        onClose={toggleDrawer}
        sx={{
          width: drawerWidth,
          flexShrink: 0,
          [`& .MuiDrawer-paper`]: { 
            width: drawerWidth, 
            boxSizing: 'border-box',
            borderRight: `1px solid ${theme.palette.divider}`,
            bgcolor: 'background.paper',
            ...(!open && !isMobile && { width: theme.spacing(9), overflowX: 'hidden' })
          },
        }}
      >
        <Toolbar />
        <Box sx={{ overflow: 'auto', mt: 2, px: 2 }}>
          <List>
            {menuItems.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <ListItem key={item.text} disablePadding sx={{ display: 'block', mb: 0.5 }}>
                  <ListItemButton
                    onClick={() => {
                      navigate(item.path);
                      if (isMobile) setOpen(false);
                    }}
                    sx={{
                      minHeight: 48,
                      justifyContent: open ? 'initial' : 'center',
                      px: 2.5,
                      borderRadius: 2,
                      bgcolor: isActive ? 'rgba(37, 99, 235, 0.08)' : 'transparent',
                      color: isActive ? 'primary.main' : 'text.secondary',
                    }}
                  >
                    <ListItemIcon sx={{ minWidth: 0, mr: open ? 2 : 'auto', justifyContent: 'center', color: isActive ? 'primary.main' : 'inherit' }}>
                      {item.icon}
                    </ListItemIcon>
                    <ListItemText primary={item.text} sx={{ opacity: open ? 1 : 0 }} primaryTypographyProps={{ fontSize: '0.875rem', fontWeight: isActive ? 700 : 500 }} />
                  </ListItemButton>
                </ListItem>
              );
            })}
          </List>
        </Box>
      </Drawer>

      <Box component="main" sx={{ flexGrow: 1, p: 3, mt: 8 }}>
        <Outlet />
      </Box>
    </Box>
  );
};

export default ChurchAdminLayout;
