import React, { useState, useEffect } from 'react';
import {
  Box, AppBar, Toolbar, IconButton, Typography, Drawer,
  List, ListItem, ListItemButton, ListItemIcon, ListItemText,
  Divider, Avatar, Button, useTheme, useMediaQuery, Chip,
} from '@mui/material';
import { Menu as MenuIcon, LogOut, Bell, ShieldCheck, Sun, Moon } from 'lucide-react';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useColorMode } from '../contexts/ThemeContext';

export interface PortalNavItem {
  text: string;
  icon: React.ReactNode;
  path: string;
}

interface PortalLayoutProps {
  /** Short role badge shown beside the product name, e.g. "FINANCE". */
  roleLabel: string;
  /** Sidebar entries, in display order. */
  menuItems: PortalNavItem[];
  /** MUI palette key used for the accent colour. */
  accent?: 'primary' | 'secondary' | 'info' | 'success' | 'warning';
}

const drawerWidth = 280;

/**
 * Shared chrome for the role portals.
 *
 * The existing portals (member, pastor, ministry) each carry their own copy of
 * this drawer/appbar markup. Rather than paste it a fourth and fifth time for
 * finance and secretary, the structure lives here once and each portal supplies
 * only its navigation and badge.
 */
const PortalLayout: React.FC<PortalLayoutProps> = ({ roleLabel, menuItems, accent = 'primary' }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [open, setOpen] = useState(!isMobile);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const { toggleColorMode, mode } = useColorMode();

  useEffect(() => { setOpen(!isMobile); }, [isMobile]);

  const handleLogout = () => { logout(); navigate('/login'); };

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar position="fixed" sx={{ zIndex: theme.zIndex.drawer + 1, bgcolor: 'background.paper', color: 'text.primary', boxShadow: 'none', borderBottom: `1px solid ${theme.palette.divider}` }}>
        <Toolbar sx={{ justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <IconButton color="inherit" onClick={() => setOpen(!open)} edge="start" sx={{ mr: 2 }}><MenuIcon size={20} /></IconButton>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box sx={{ bgcolor: `${accent}.main`, p: 0.5, borderRadius: 1, display: 'flex' }}><ShieldCheck size={20} color="white" /></Box>
              <Typography variant="h6" noWrap fontWeight={700} sx={{ letterSpacing: '-0.5px' }}>Ecclesia</Typography>
              <Chip label={roleLabel} size="small" sx={{ ml: 1, height: 18, fontSize: '0.65rem', fontWeight: 700, bgcolor: `${accent}.main`, color: 'white' }} />
            </Box>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <IconButton size="small" onClick={toggleColorMode} color="inherit">{mode === 'light' ? <Moon size={18} /> : <Sun size={18} />}</IconButton>
            <IconButton size="small"><Bell size={18} /></IconButton>
            <Divider orientation="vertical" flexItem sx={{ mx: 1, height: 24, my: 'auto' }} />
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Avatar sx={{ width: 32, height: 32, bgcolor: `${accent}.main`, fontSize: '0.875rem' }}>{user?.name?.[0] || 'U'}</Avatar>
              <Typography variant="body2" fontWeight={700} sx={{ display: { xs: 'none', md: 'block' } }}>{user?.name}</Typography>
            </Box>
            <Button variant="outlined" color="inherit" size="small" startIcon={<LogOut size={16} />} onClick={handleLogout} sx={{ ml: 1, textTransform: 'none' }}>Logout</Button>
          </Box>
        </Toolbar>
      </AppBar>
      <Drawer variant={isMobile ? 'temporary' : 'permanent'} open={open} onClose={() => setOpen(!open)} sx={{ width: drawerWidth, flexShrink: 0, [`& .MuiDrawer-paper`]: { width: drawerWidth, boxSizing: 'border-box', borderRight: `1px solid ${theme.palette.divider}`, bgcolor: 'background.paper', ...(!open && !isMobile && { width: theme.spacing(9), overflowX: 'hidden' }) } }}>
        <Toolbar />
        <Box sx={{ overflow: 'auto', mt: 2, px: 2 }}>
          <List>
            {menuItems.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <ListItem key={item.text} disablePadding sx={{ display: 'block', mb: 0.5 }}>
                  <ListItemButton onClick={() => { navigate(item.path); if (isMobile) setOpen(false); }} sx={{ minHeight: 48, justifyContent: open ? 'initial' : 'center', px: 2.5, borderRadius: 2, bgcolor: isActive ? 'action.selected' : 'transparent', color: isActive ? `${accent}.main` : 'text.secondary' }}>
                    <ListItemIcon sx={{ minWidth: 0, mr: open ? 2 : 'auto', justifyContent: 'center', color: isActive ? `${accent}.main` : 'inherit' }}>{item.icon}</ListItemIcon>
                    <ListItemText primary={item.text} sx={{ opacity: open ? 1 : 0 }} primaryTypographyProps={{ fontSize: '0.875rem', fontWeight: isActive ? 700 : 500 }} />
                  </ListItemButton>
                </ListItem>
              );
            })}
          </List>
        </Box>
      </Drawer>
      <Box component="main" sx={{ flexGrow: 1, p: 3, mt: 8 }}><Outlet /></Box>
    </Box>
  );
};

export default PortalLayout;
