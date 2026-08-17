import React from 'react';
import { 
  Box, Drawer, AppBar, Toolbar, List, Typography, 
  Divider, IconButton, ListItem, ListItemButton, 
  ListItemIcon, ListItemText, Avatar 
} from '@mui/material';
import { 
  LayoutDashboard, Users, Calendar, DollarSign, 
  Heart, Settings, LogOut, Menu, MessageSquare, Activity,
  ShieldCheck, UserCheck, Globe
} from 'lucide-react';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ThemeToggle } from './ThemeToggle';

const drawerWidth = 240;

const MainLayout = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = React.useState(false);

  const menuItems = [
    { text: 'Dashboard', icon: <LayoutDashboard size={20} />, path: '/', roles: ['CHURCH_ADMIN', 'PASTOR', 'MINISTRY_LEADER', 'MEMBER'], section: 'Church' },
    { text: 'Super Admin', icon: <ShieldCheck size={20} />, path: '/super-admin', roles: ['SUPER_ADMIN'], section: 'Platform' },
    { text: 'Members', icon: <Users size={20} />, path: '/members', roles: ['CHURCH_ADMIN'], section: 'Church' },
    { text: 'Check-in', icon: <UserCheck size={20} />, path: '/checkin', roles: ['CHURCH_ADMIN', 'PASTOR', 'MINISTRY_LEADER'], section: 'Church' },
    { text: 'Events', icon: <Calendar size={20} />, path: '/events', roles: ['CHURCH_ADMIN', 'PASTOR', 'MINISTRY_LEADER', 'MEMBER'], section: 'Church' },
    { text: 'Finance', icon: <DollarSign size={20} />, path: '/finance', roles: ['CHURCH_ADMIN'], section: 'Church' },
    { text: 'Ministries', icon: <MessageSquare size={20} />, path: '/ministries', roles: ['CHURCH_ADMIN', 'PASTOR', 'MINISTRY_LEADER'], section: 'Church' },
    { text: 'Pastoral Care', icon: <Heart size={20} />, path: '/pastoral', roles: ['CHURCH_ADMIN', 'PASTOR'], section: 'Church' },
    { text: 'Settings', icon: <Settings size={20} />, path: '/settings', roles: ['SUPER_ADMIN', 'CHURCH_ADMIN'], section: 'System' },
  ];

  const filteredMenuItems = menuItems.filter(item => 
    user && item.roles.includes(user.role)
  );

  const sections = ['Platform', 'Church', 'System'];

  const drawer = (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Toolbar sx={{ px: 2 }}>
        <Globe size={24} style={{ marginRight: 12 }} color="#2563eb" />
        <Typography variant="h6" sx={{ fontWeight: 800, letterSpacing: -0.5, color: 'text.primary' }}>
          Ecclesia
        </Typography>
      </Toolbar>
      <Divider />
      <Box sx={{ overflow: 'auto', flexGrow: 1, px: 1, py: 2 }}>
        {sections.map(section => {
          const sectionItems = filteredMenuItems.filter(item => item.section === section);
          if (sectionItems.length === 0) return null;

          return (
            <Box key={section} sx={{ mb: 3 }}>
              <Typography 
                variant="overline" 
                sx={{ 
                  px: 2, 
                  mb: 1, 
                  display: 'block', 
                  color: 'text.secondary', 
                  fontWeight: 700,
                  fontSize: '0.65rem',
                  letterSpacing: '0.1em'
                }}
              >
                {section}
              </Typography>
              <List disablePadding>
                {sectionItems.map((item) => {
                  const isSuperAdminItem = item.path === '/super-admin';
                  const isSelected = location.pathname === item.path;
                  
                  return (
                    <ListItem key={item.text} disablePadding sx={{ mb: 0.5 }}>
                      <ListItemButton 
                        selected={isSelected}
                        onClick={() => navigate(item.path)}
                        sx={{
                          borderRadius: 2,
                          py: 1,
                          ...(isSuperAdminItem && {
                            bgcolor: isSelected ? 'primary.main' : 'rgba(37, 99, 235, 0.08)',
                            color: isSelected ? 'white' : 'primary.main',
                            '&:hover': {
                              bgcolor: isSelected ? 'primary.dark' : 'rgba(37, 99, 235, 0.12)',
                            },
                            '& .MuiListItemIcon-root': {
                              color: 'inherit',
                            }
                          })
                        }}
                      >
                        <ListItemIcon sx={{ minWidth: 40, color: isSelected && isSuperAdminItem ? 'white' : isSelected ? 'primary.main' : 'text.secondary' }}>
                          {item.icon}
                        </ListItemIcon>
                        <ListItemText 
                          primary={item.text} 
                          primaryTypographyProps={{ 
                            fontSize: '0.85rem', 
                            fontWeight: isSelected ? 700 : 500 
                          }} 
                        />
                      </ListItemButton>
                    </ListItem>
                  );
                })}
              </List>
            </Box>
          );
        })}
      </Box>
      <Box sx={{ p: 2, borderTop: '1px solid', borderColor: 'divider' }}>
        <List disablePadding>
          <ListItem disablePadding>
            <ListItemButton 
              onClick={logout}
              sx={{ borderRadius: 2, color: 'error.main', '&:hover': { bgcolor: 'error.lighter' } }}
            >
              <ListItemIcon sx={{ minWidth: 40, color: 'inherit' }}><LogOut size={20} /></ListItemIcon>
              <ListItemText primary="Logout" primaryTypographyProps={{ fontSize: '0.85rem', fontWeight: 600 }} />
            </ListItemButton>
          </ListItem>
        </List>
      </Box>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex' }}>
      <AppBar
        position="fixed"
        sx={{
          width: { sm: `calc(100% - ${drawerWidth}px)` },
          ml: { sm: `${drawerWidth}px` },
          bgcolor: 'background.paper',
          color: 'text.primary',
          boxShadow: 'none',
          borderBottom: '1px solid rgba(0,0,0,0.12)'
        }}
      >
        <Toolbar>
          <IconButton
            color="inherit"
            edge="start"
            onClick={() => setMobileOpen(!mobileOpen)}
            sx={{ mr: 2, display: { sm: 'none' } }}
          >
            <Menu />
          </IconButton>
          <Box sx={{ flexGrow: 1 }} />
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <ThemeToggle />
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                {user?.name}
              </Typography>
              <Avatar sx={{ width: 32, height: 32, bgcolor: 'primary.main' }}>
                {user?.name?.[0]?.toUpperCase() || 'U'}
              </Avatar>
            </Box>
          </Box>
        </Toolbar>
      </AppBar>
      <Box
        component="nav"
        sx={{ width: { sm: drawerWidth }, flexShrink: { sm: 0 } }}
      >
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          ModalProps={{ keepMounted: true }}
          sx={{
            display: { xs: 'block', sm: 'none' },
            '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth },
          }}
        >
          {drawer}
        </Drawer>
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: 'none', sm: 'block' },
            '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth },
          }}
          open
        >
          {drawer}
        </Drawer>
      </Box>
      <Box
        component="main"
        sx={{ flexGrow: 1, p: 3, width: { sm: `calc(100% - ${drawerWidth}px)` }, mt: 8 }}
      >
        <Outlet />
      </Box>
    </Box>
  );
};

export default MainLayout;
