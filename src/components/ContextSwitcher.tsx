import React from 'react';
import { 
  Box, IconButton, Menu, MenuItem, 
  Typography, ListItemIcon, ListItemText,
  Divider, Chip
} from '@mui/material';
import { ChevronDown, Building2, UserCircle, Check } from 'lucide-react';
import { useAuth, TenantRole } from '../contexts/AuthContext';

const ContextSwitcher: React.FC = () => {
  const { user, currentContext, switchContext } = useAuth();
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleSelect = (context: TenantRole) => {
    switchContext(context);
    handleClose();
  };

  if (!user || user.roles.length <= 1 || currentContext?.role !== 'SUPER_ADMIN') return null;

  return (
    <Box>
      <Box 
        onClick={handleClick}
        sx={{ 
          display: 'flex', 
          alignItems: 'center', 
          cursor: 'pointer',
          bgcolor: 'rgba(255,255,255,0.1)',
          px: 1.5,
          py: 0.5,
          borderRadius: 2,
          '&:hover': { bgcolor: 'rgba(255,255,255,0.2)' }
        }}
      >
        <Box sx={{ mr: 1 }}>
          <Typography variant="caption" sx={{ display: 'block', opacity: 0.7, lineHeight: 1 }}>
            {currentContext?.tenantName}
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 700 }}>
            {currentContext?.role.replace('_', ' ')}
          </Typography>
        </Box>
        <ChevronDown size={16} />
      </Box>

      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        PaperProps={{
          sx: { width: 280, mt: 1, borderRadius: 2 }
        }}
      >
        <Box sx={{ px: 2, py: 1 }}>
          <Typography variant="overline" color="text.secondary">Switch Context</Typography>
        </Box>
        <Divider />
        
        {(Array.isArray(user.roles) ? user.roles : []).map((role, index) => {
          const isSelected = currentContext?.tenantId === role.tenantId && currentContext?.role === role.role;
          return (
            <MenuItem 
              key={index} 
              onClick={() => handleSelect(role)}
              selected={isSelected}
              sx={{ py: 1.5 }}
            >
              <ListItemIcon>
                <Building2 size={20} />
              </ListItemIcon>
              <ListItemText 
                primary={role.tenantName}
                secondary={role.role.replace('_', ' ')}
                primaryTypographyProps={{ fontWeight: isSelected ? 700 : 400 }}
              />
              {isSelected && <Check size={16} color="green" />}
            </MenuItem>
          );
        })}
      </Menu>
    </Box>
  );
};

export default ContextSwitcher;
