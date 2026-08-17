import React from 'react';
import { 
  AppBar, Toolbar, IconButton, Typography, 
  Box, Button, Chip, Avatar, Tooltip
} from '@mui/material';
import { Menu, Settings, LogOut, Bell, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

interface TopbarProps {
  onToggleSidebar: () => void;
}

const Topbar: React.FC<TopbarProps> = ({ onToggleSidebar }) => {
  const navigate = useNavigate();
  const { logout, user } = useAuth();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <AppBar 
      position="sticky" 
      sx={{ 
        bgcolor: 'white', 
        color: 'text.primary',
        boxShadow: 'none',
        borderBottom: '1px solid',
        borderColor: 'divider'
      }}
    >
      <Toolbar sx={{ justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <IconButton onClick={onToggleSidebar} edge="start">
            <Menu size={20} />
          </IconButton>
          
          <Box sx={{ display: { xs: 'none', sm: 'flex' }, alignItems: 'center', gap: 1.5 }}>
            <Chip 
              label="PLATFORM" 
              size="small" 
              sx={{ 
                bgcolor: 'rgba(37, 99, 235, 0.1)', 
                color: 'primary.main', 
                fontWeight: 700,
                fontSize: '0.65rem'
              }} 
            />
            <Typography variant="body2" fontWeight={600} color="text.secondary">
              Super Admin Portal
            </Typography>
          </Box>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 1, sm: 2 } }}>
          <IconButton size="small">
            <Search size={18} />
          </IconButton>
          
          <IconButton size="small">
            <Bell size={18} />
          </IconButton>

          <Box sx={{ height: 24, width: 1, bgcolor: 'divider', mx: 1 }} />

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box sx={{ display: { xs: 'none', md: 'block' }, textAlign: 'right' }}>
              <Typography variant="body2" fontWeight={700}>
                {user?.name || 'Admin User'}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Super Admin
              </Typography>
            </Box>
            <Avatar 
              sx={{ width: 32, height: 32, bgcolor: 'primary.main', fontSize: '0.875rem' }}
            >
              {user?.name?.[0] || 'A'}
            </Avatar>
          </Box>

          <Tooltip title="System Settings">
            <IconButton onClick={() => navigate('/super-admin/settings')} size="small">
              <Settings size={18} />
            </IconButton>
          </Tooltip>

          <Button 
            variant="outlined" 
            color="inherit" 
            size="small"
            startIcon={<LogOut size={16} />}
            onClick={handleLogout}
            sx={{ 
              ml: 1,
              borderColor: 'divider',
              '&:hover': { borderColor: 'error.light', color: 'error.main', bgcolor: 'error.lighter' }
            }}
          >
            Logout
          </Button>
        </Box>
      </Toolbar>
    </AppBar>
  );
};

export default Topbar;
