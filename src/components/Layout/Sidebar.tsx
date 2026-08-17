import React from 'react';
import { 
  Box, Drawer, List, ListItem, ListItemButton, 
  ListItemIcon, ListItemText, Typography, Divider,
  IconButton, useTheme, useMediaQuery
} from '@mui/material';
import { useLocation, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, Church, CreditCard, Users, 
  MessageSquare, BarChart3, Settings, ChevronLeft,
  ShieldCheck
} from 'lucide-react';

interface SidebarProps {
  isCollapsed: boolean;
  isMobileOpen: boolean;
  onCloseMobile: () => void;
  width: number;
}

const menuItems = [
  { label: 'Dashboard', icon: LayoutDashboard, path: '/super-admin/dashboard' },
  { label: 'Churches', icon: Church, path: '/super-admin/churches' },
  { label: 'Subscriptions & Payment', icon: CreditCard, path: '/super-admin/subscriptions' },
  { label: 'User & Access Control', icon: Users, path: '/super-admin/users' },
  { label: 'Communication & Support', icon: MessageSquare, path: '/super-admin/communication' },
  { label: 'Platform Analytics & Logs', icon: BarChart3, path: '/super-admin/analytics' },
  { label: 'System Settings', icon: Settings, path: '/super-admin/settings' },
];

const Sidebar: React.FC<SidebarProps> = ({ isCollapsed, isMobileOpen, onCloseMobile, width }) => {
  const theme = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const drawerContent = (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', bgcolor: '#1e293b', color: 'white' }}>
      {/* Logo Section */}
      <Box sx={{ p: 3, display: 'flex', alignItems: 'center', gap: 2 }}>
        <Box sx={{ bgcolor: 'primary.main', p: 1, borderRadius: 2, display: 'flex' }}>
          <ShieldCheck size={24} color="white" />
        </Box>
        {(!isCollapsed || isMobile) && (
          <Typography variant="h6" fontWeight={800} sx={{ letterSpacing: -0.5 }}>
            Ecclesia
          </Typography>
        )}
      </Box>

      <Divider sx={{ borderColor: 'rgba(255,255,255,0.1)' }} />

      {/* Navigation Items */}
      <List sx={{ px: 2, py: 3, flexGrow: 1 }}>
        {menuItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <ListItem key={item.path} disablePadding sx={{ mb: 1 }}>
              <ListItemButton
                onClick={() => {
                  navigate(item.path);
                  if (isMobile) onCloseMobile();
                }}
                sx={{
                  borderRadius: 2,
                  justifyContent: isCollapsed && !isMobile ? 'center' : 'flex-start',
                  px: isCollapsed && !isMobile ? 1 : 2,
                  bgcolor: isActive ? 'primary.main' : 'transparent',
                  '&:hover': {
                    bgcolor: isActive ? 'primary.main' : 'rgba(255,255,255,0.05)',
                  },
                }}
              >
                <ListItemIcon 
                  sx={{ 
                    minWidth: isCollapsed && !isMobile ? 0 : 40,
                    color: isActive ? 'white' : 'rgba(255,255,255,0.6)',
                  }}
                >
                  <item.icon size={22} />
                </ListItemIcon>
                {(!isCollapsed || isMobile) && (
                  <ListItemText 
                    primary={item.label} 
                    primaryTypographyProps={{ 
                      fontSize: '0.875rem', 
                      fontWeight: isActive ? 600 : 500,
                      color: isActive ? 'white' : 'rgba(255,255,255,0.8)'
                    }} 
                  />
                )}
              </ListItemButton>
            </ListItem>
          );
        })}
      </List>

      {/* Footer / Version */}
      {(!isCollapsed || isMobile) && (
        <Box sx={{ p: 3, textAlign: 'center' }}>
          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)' }}>
            v1.0.4 Platform Admin
          </Typography>
        </Box>
      )}
    </Box>
  );

  return (
    <>
      {/* Desktop Drawer */}
      {!isMobile && (
        <Drawer
          variant="permanent"
          sx={{
            width: width,
            flexShrink: 0,
            '& .MuiDrawer-paper': {
              width: width,
              boxSizing: 'border-box',
              borderRight: 'none',
              transition: theme.transitions.create('width', {
                easing: theme.transitions.easing.sharp,
                duration: theme.transitions.duration.enteringScreen,
              }),
            },
          }}
          open
        >
          {drawerContent}
        </Drawer>
      )}

      {/* Mobile Drawer */}
      {isMobile && (
        <Drawer
          variant="temporary"
          open={isMobileOpen}
          onClose={onCloseMobile}
          sx={{
            '& .MuiDrawer-paper': {
              width: 280,
              boxSizing: 'border-box',
              borderRight: 'none',
            },
          }}
        >
          {drawerContent}
        </Drawer>
      )}
    </>
  );
};

export default Sidebar;
