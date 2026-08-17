import React, { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { 
  Box, Drawer, AppBar, Toolbar, List, 
  Typography, Divider, IconButton, ListItem, 
  ListItemButton, ListItemIcon, ListItemText,
  Avatar, Tooltip, Badge, Button
} from '@mui/material';
import { 
  Menu, Bell, LogOut, User,
  LayoutDashboard, Users, Building2, 
  CreditCard, Calendar, MessageSquare,
  Settings, Heart, CheckSquare, BookOpen,
  ChevronLeft, Search, HelpCircle, Smartphone
} from 'lucide-react';
import { useAuth, UserRole } from '../contexts/AuthContext';
import ContextSwitcher from '../components/ContextSwitcher';

const drawerWidth = 260;

interface MenuItem {
  text: string;
  icon: React.ReactNode;
  path: string;
  roles: UserRole[];
  badge?: string;
}

const menuItems: MenuItem[] = [
  // Super Admin
  { text: 'Dashboard', icon: <LayoutDashboard size={20} />, path: '/dashboard', roles: ['SUPER_ADMIN'] },
  { text: 'Churches', icon: <Building2 size={20} />, path: '/churches', roles: ['SUPER_ADMIN'], badge: '12+' },
  { text: 'Subscriptions', icon: <CreditCard size={20} />, path: '/subscriptions', roles: ['SUPER_ADMIN'] },
  { text: 'Analytics', icon: <Calendar size={20} />, path: '/analytics', roles: ['SUPER_ADMIN'] },
  
  // Church Admin
  { text: 'Dashboard', icon: <LayoutDashboard size={20} />, path: '/admin/dashboard', roles: ['CHURCH_ADMIN'] },
  { text: 'Members', icon: <Users size={20} />, path: '/admin/members', roles: ['CHURCH_ADMIN'] },
  { text: 'Finances', icon: <CreditCard size={20} />, path: '/admin/finances', roles: ['CHURCH_ADMIN'] },
  { text: 'Events', icon: <Calendar size={20} />, path: '/admin/events', roles: ['CHURCH_ADMIN'] },
  
  // Pastor
  { text: 'Dashboard', icon: <LayoutDashboard size={20} />, path: '/pastor/dashboard', roles: ['PASTOR'] },
  { text: 'Member Care', icon: <Heart size={20} />, path: '/pastor/members', roles: ['PASTOR'] },
  { text: 'Prayer Requests', icon: <MessageSquare size={20} />, path: '/pastor/prayers', roles: ['PASTOR'] },
  
  // Ministry Leader
  { text: 'Dashboard', icon: <LayoutDashboard size={20} />, path: '/ministry/dashboard', roles: ['MINISTRY_LEADER'] },
  { text: 'Team Tasks', icon: <CheckSquare size={20} />, path: '/ministry/tasks', roles: ['MINISTRY_LEADER'] },
  
  // Member
  { text: 'Dashboard', icon: <LayoutDashboard size={20} />, path: '/member/dashboard', roles: ['MEMBER'] },
  { text: 'My Giving', icon: <CreditCard size={20} />, path: '/member/giving', roles: ['MEMBER'] },
  { text: 'Events', icon: <Calendar size={20} />, path: '/member/events', roles: ['MEMBER'] },
  { text: 'Sermons', icon: <BookOpen size={20} />, path: '/member/sermons', roles: ['MEMBER'] },
];

const generalItems: MenuItem[] = [
  { text: 'Settings', icon: <Settings size={20} />, path: '/settings', roles: ['SUPER_ADMIN', 'CHURCH_ADMIN', 'PASTOR', 'MINISTRY_LEADER', 'MEMBER'] },
  { text: 'Help', icon: <HelpCircle size={20} />, path: '/help', roles: ['SUPER_ADMIN', 'CHURCH_ADMIN', 'PASTOR', 'MINISTRY_LEADER', 'MEMBER'] },
];

const UnifiedLayout: React.FC = () => {
  const { user, logout, currentContext } = useAuth();
  const [open, setOpen] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();

  const toggleDrawer = () => setOpen(!open);

  const filteredMenu = menuItems.filter(item => 
    currentContext && item.roles.includes(currentContext.role)
  );

  const filteredGeneral = generalItems.filter(item =>
    currentContext && item.roles.includes(currentContext.role)
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: '#f8fafc' }}>
      <AppBar 
        position="fixed" 
        sx={{ 
          zIndex: (theme) => theme.zIndex.drawer + 1,
          bgcolor: '#ffffff',
          boxShadow: 'none',
          borderBottom: '1px solid #e2e8f0',
          width: open ? `calc(100% - ${drawerWidth}px)` : `calc(100% - 70px)`,
          ml: open ? `${drawerWidth}px` : '70px',
          transition: 'width 0.2s, margin 0.2s',
        }}
      >
        <Toolbar sx={{ justifyContent: 'space-between', px: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', flexGrow: 1 }}>
            <Box 
              sx={{ 
                display: 'flex', 
                alignItems: 'center', 
                bgcolor: '#f1f5f9', 
                px: 2, 
                py: 1, 
                borderRadius: 2.5,
                width: '100%',
                maxWidth: 400,
                mr: 3
              }}
            >
              <Search size={18} color="#64748b" />
              <Typography variant="body2" sx={{ ml: 1.5, color: '#64748b', flexGrow: 1 }}>
                Search task
              </Typography>
              <Box sx={{ bgcolor: '#ffffff', px: 0.8, py: 0.2, borderRadius: 1, border: '1px solid #e2e8f0' }}>
                <Typography variant="caption" fontWeight={700} color="#64748b">⌘F</Typography>
              </Box>
            </Box>
            <ContextSwitcher />
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <IconButton sx={{ color: '#64748b' }}>
              <MessageSquare size={20} />
            </IconButton>
            <IconButton sx={{ color: '#64748b' }}>
              <Badge badgeContent={4} color="error" overlap="circular">
                <Bell size={20} />
              </Badge>
            </IconButton>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, ml: 1 }}>
              <Box sx={{ textAlign: 'right', display: { xs: 'none', sm: 'block' } }}>
                <Typography variant="body2" fontWeight={700} color="#1e293b">{user?.name}</Typography>
                <Typography variant="caption" color="#64748b">{user?.email}</Typography>
              </Box>
              <Avatar 
                src={user?.avatar}
                sx={{ 
                  width: 40, 
                  height: 40, 
                  bgcolor: '#10b981', 
                  fontSize: '1rem', 
                  cursor: 'pointer',
                  border: '2px solid #ffffff',
                  boxShadow: '0 0 0 1px #e2e8f0'
                }}
              >
                {user?.name?.[0]}
              </Avatar>
            </Box>
          </Box>
        </Toolbar>
      </AppBar>

      <Drawer
        variant="permanent"
        open={open}
        sx={{
          width: open ? drawerWidth : 70,
          transition: 'width 0.2s',
          '& .MuiDrawer-paper': {
            width: open ? drawerWidth : 70,
            transition: 'width 0.2s',
            boxSizing: 'border-box',
            bgcolor: '#ffffff',
            borderRight: '1px solid #e2e8f0',
            overflowX: 'hidden',
            display: 'flex',
            flexDirection: 'column'
          },
        }}
      >
        <Box sx={{ p: 3, display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box 
            sx={{ 
              width: 32, 
              height: 32, 
              bgcolor: '#10b981', 
              borderRadius: 1, 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              color: '#ffffff'
            }}
          >
            <Heart size={20} fill="currentColor" />
          </Box>
          <Typography variant="h6" sx={{ fontWeight: 800, letterSpacing: '-0.5px', display: open ? 'block' : 'none' }}>
            Donezo
          </Typography>
        </Box>

        <Box sx={{ flexGrow: 1, overflow: 'auto', px: 1.5 }}>
          <Typography variant="caption" sx={{ px: 2.5, py: 2, display: open ? 'block' : 'none', fontWeight: 700, color: '#94a3b8', letterSpacing: '1px' }}>
            MENU
          </Typography>
          <List>
            {filteredMenu.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <ListItem key={item.text} disablePadding sx={{ display: 'block', mb: 0.5 }}>
                  <ListItemButton
                    onClick={() => navigate(item.path)}
                    sx={{
                      minHeight: 48,
                      justifyContent: open ? 'initial' : 'center',
                      px: 2.5,
                      borderRadius: 2,
                      color: isActive ? '#10b981' : '#64748b',
                      position: 'relative',
                      '&:hover': { bgcolor: '#f1f5f9' },
                      ...(isActive && {
                        '&::before': {
                          content: '""',
                          position: 'absolute',
                          left: 0,
                          top: '20%',
                          bottom: '20%',
                          width: 4,
                          bgcolor: '#10b981',
                          borderRadius: '0 4px 4px 0'
                        }
                      })
                    }}
                  >
                    <ListItemIcon
                      sx={{
                        minWidth: 0,
                        mr: open ? 2 : 'auto',
                        justifyContent: 'center',
                        color: isActive ? '#10b981' : '#64748b',
                      }}
                    >
                      {item.icon}
                    </ListItemIcon>
                    <ListItemText 
                      primary={item.text} 
                      sx={{ 
                        opacity: open ? 1 : 0,
                        '& .MuiTypography-root': { fontWeight: isActive ? 700 : 500, fontSize: '0.9rem' }
                      }} 
                    />
                    {item.badge && open && (
                      <Box sx={{ bgcolor: '#1e293b', color: '#ffffff', px: 0.8, py: 0.2, borderRadius: 1, fontSize: '0.7rem', fontWeight: 700 }}>
                        {item.badge}
                      </Box>
                    )}
                  </ListItemButton>
                </ListItem>
              );
            })}
          </List>

          <Typography variant="caption" sx={{ px: 2.5, py: 2, display: open ? 'block' : 'none', fontWeight: 700, color: '#94a3b8', letterSpacing: '1px', mt: 2 }}>
            GENERAL
          </Typography>
          <List>
            {filteredGeneral.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <ListItem key={item.text} disablePadding sx={{ display: 'block', mb: 0.5 }}>
                  <ListItemButton
                    onClick={() => navigate(item.path)}
                    sx={{
                      minHeight: 48,
                      justifyContent: open ? 'initial' : 'center',
                      px: 2.5,
                      borderRadius: 2,
                      color: isActive ? '#10b981' : '#64748b',
                      '&:hover': { bgcolor: '#f1f5f9' }
                    }}
                  >
                    <ListItemIcon
                      sx={{
                        minWidth: 0,
                        mr: open ? 2 : 'auto',
                        justifyContent: 'center',
                        color: isActive ? '#10b981' : '#64748b',
                      }}
                    >
                      {item.icon}
                    </ListItemIcon>
                    <ListItemText 
                      primary={item.text} 
                      sx={{ 
                        opacity: open ? 1 : 0,
                        '& .MuiTypography-root': { fontWeight: isActive ? 700 : 500, fontSize: '0.9rem' }
                      }} 
                    />
                  </ListItemButton>
                </ListItem>
              );
            })}
            <ListItem disablePadding sx={{ display: 'block', mb: 0.5 }}>
              <ListItemButton
                onClick={logout}
                sx={{
                  minHeight: 48,
                  justifyContent: open ? 'initial' : 'center',
                  px: 2.5,
                  borderRadius: 2,
                  color: '#64748b',
                  '&:hover': { bgcolor: '#fef2f2', color: '#ef4444' }
                }}
              >
                <ListItemIcon sx={{ minWidth: 0, mr: open ? 2 : 'auto', justifyContent: 'center', color: 'inherit' }}>
                  <LogOut size={20} />
                </ListItemIcon>
                <ListItemText primary="Logout" sx={{ opacity: open ? 1 : 0, '& .MuiTypography-root': { fontWeight: 500, fontSize: '0.9rem' } }} />
              </ListItemButton>
            </ListItem>
          </List>
        </Box>

        {open && (
          <Box sx={{ p: 2, mb: 2 }}>
            <Box 
              sx={{ 
                bgcolor: '#000000', 
                borderRadius: 3, 
                p: 2.5, 
                color: '#ffffff',
                position: 'relative',
                overflow: 'hidden',
                '&::before': {
                  content: '""',
                  position: 'absolute',
                  top: -20,
                  right: -20,
                  width: 80,
                  height: 80,
                  bgcolor: 'rgba(16, 185, 129, 0.2)',
                  borderRadius: '50%'
                }
              }}
            >
              <Box sx={{ bgcolor: '#ffffff', width: 32, height: 32, borderRadius: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 2 }}>
                <Smartphone size={20} color="#000000" />
              </Box>
              <Typography variant="body2" fontWeight={700} sx={{ mb: 0.5 }}>Download our Mobile App</Typography>
              <Typography variant="caption" sx={{ opacity: 0.7, display: 'block', mb: 2 }}>Get easy in another way</Typography>
              <Button 
                fullWidth 
                variant="contained" 
                sx={{ 
                  bgcolor: '#10b981', 
                  color: '#ffffff', 
                  textTransform: 'none', 
                  borderRadius: 2,
                  fontWeight: 700,
                  '&:hover': { bgcolor: '#059669' }
                }}
              >
                Download
              </Button>
            </Box>
          </Box>
        )}
      </Drawer>

      <Box component="main" sx={{ flexGrow: 1, p: 4, mt: 8, bgcolor: '#ffffff' }}>
        <Outlet />
      </Box>
    </Box>
  );
};

export default UnifiedLayout;
