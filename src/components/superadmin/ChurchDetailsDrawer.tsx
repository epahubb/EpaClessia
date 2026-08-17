import React from 'react';
import { 
  Drawer, Box, Typography, IconButton, Grid, 
  Paper, Divider, Chip, Avatar, Button,
  List, ListItem, ListItemText, ListItemAvatar, 
  CircularProgress, Alert, alpha, useTheme
} from '@mui/material';
import { 
  X, Mail, Phone, Globe, Users, DollarSign, 
  Shield, Clock, ExternalLink, UserCheck, 
  History, Settings, UserX
} from 'lucide-react';
import { Church } from '../../types/church';

interface ChurchDetailsDrawerProps {
  open: boolean;
  onClose: () => void;
  churchId: string | null;
  churchDetails: any; // Result from GET /api/superadmin/churches/:id
  isLoading: boolean;
  onImpersonate: (id: string) => void;
  onOpenSettings?: (church: any) => void;
}

const ChurchDetailsDrawer: React.FC<ChurchDetailsDrawerProps> = ({ 
  open, 
  onClose, 
  churchId, 
  churchDetails, 
  isLoading,
  onImpersonate,
  onOpenSettings
}) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  if (!churchId) return null;

  return (
    <Drawer 
      anchor="right" 
      open={open} 
      onClose={onClose}
      PaperProps={{ 
        sx: { 
          width: { xs: '100%', sm: 520 }, 
          border: 'none',
          bgcolor: 'background.default'
        } 
      }}
    >
      <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <Box sx={{ 
          p: 3, 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between', 
          bgcolor: 'background.paper', 
          borderBottom: '1px solid',
          borderColor: 'divider'
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Avatar 
              src={churchDetails?.logo} 
              sx={{ 
                bgcolor: '#1b4332', 
                color: 'white', 
                fontWeight: 800, 
                width: 44, 
                height: 44,
                borderRadius: 2
              }}
            >
              {(churchDetails?.name || 'C').charAt(0)}
            </Avatar>
            <Box>
              <Typography variant="h6" fontWeight={800} color="text.primary" sx={{ letterSpacing: '-0.5px', lineHeight: 1.2 }}>
                {churchDetails?.name || 'Church Details'}
              </Typography>
              <Typography variant="caption" color="text.secondary" fontWeight={600}>
                {churchDetails?.websiteUrl || 'Viewing workspace details'}
              </Typography>
            </Box>
          </Box>
          <IconButton onClick={onClose} size="small" sx={{ color: 'text.secondary' }}>
            <X size={20} />
          </IconButton>
        </Box>

        <Box sx={{ flexGrow: 1, overflowY: 'auto', p: 3, bgcolor: 'background.default' }}>
          {isLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', minHeight: 300 }}>
              <CircularProgress color="primary" />
            </Box>
          ) : churchDetails ? (
            <Box>
              {/* Summary Cards */}
              <Grid container spacing={2} sx={{ mb: 4 }}>
                <Grid size={{ xs: 6 }}>
                  <Paper sx={{ p: 2.5, borderRadius: 3, border: '1px solid', borderColor: 'divider', boxShadow: 'none', bgcolor: 'background.paper' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, color: 'text.secondary' }}>
                      <DollarSign size={16} />
                      <Typography variant="caption" fontWeight={700}>DONATIONS (30D)</Typography>
                    </Box>
                    <Typography variant="h5" fontWeight={800} color="text.primary">
                      GHS {churchDetails.totalDonations?.toLocaleString() || 0}
                    </Typography>
                  </Paper>
                </Grid>
                <Grid size={{ xs: 6 }}>
                  <Paper sx={{ p: 2.5, borderRadius: 3, border: '1px solid', borderColor: 'divider', boxShadow: 'none', bgcolor: 'background.paper' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, color: 'text.secondary' }}>
                      <Users size={16} />
                      <Typography variant="caption" fontWeight={700}>MEMBERS</Typography>
                    </Box>
                    <Typography variant="h5" fontWeight={800} color="text.primary">{churchDetails.memberCount || 0}</Typography>
                  </Paper>
                </Grid>
              </Grid>

              {/* Status Section */}
              <Box sx={{ mb: 4 }}>
                <Typography variant="subtitle2" fontWeight={800} color="text.secondary" sx={{ mb: 1.5, letterSpacing: '0.05em' }}>SUBSCRIPTION & STATUS</Typography>
                <Box sx={{ p: 2.5, bgcolor: 'background.paper', borderRadius: 3, display: 'flex', flexDirection: 'column', gap: 2, border: '1px solid', borderColor: 'divider' }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="body2" fontWeight={600} color="text.secondary">Current Plan</Typography>
                    <Chip 
                      label={churchDetails.planId.replace('_', ' ').toUpperCase()} 
                      size="small"
                      sx={{ 
                        fontWeight: 800, 
                        bgcolor: isDark ? 'rgba(59, 130, 246, 0.2)' : '#1b4332', 
                        color: isDark ? '#60a5fa' : 'white',
                        border: '1px solid',
                        borderColor: isDark ? 'rgba(59, 130, 246, 0.4)' : '#1b4332'
                      }}
                    />
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="body2" fontWeight={600} color="text.secondary">Status</Typography>
                    <Chip 
                      label={churchDetails.status.toUpperCase()} 
                      size="small"
                      sx={{ 
                        fontWeight: 800, 
                        bgcolor: churchDetails.status === 'active' ? alpha('#10b981', 0.15) : alpha('#ef4444', 0.15),
                        color: churchDetails.status === 'active' ? (isDark ? '#34d399' : '#10b981') : (isDark ? '#f87171' : '#ef4444'),
                        border: '1px solid',
                        borderColor: churchDetails.status === 'active' ? alpha('#10b981', 0.3) : alpha('#ef4444', 0.3)
                      }}
                    />
                  </Box>
                  {churchDetails.trialEndDate && (
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography variant="body2" fontWeight={600} color="text.secondary">Trial Ends</Typography>
                      <Typography variant="body2" fontWeight={700} color="text.primary">
                        {new Date(churchDetails.trialEndDate).toLocaleDateString()}
                      </Typography>
                    </Box>
                  )}
                </Box>
              </Box>

              {/* Admin Users */}
              <Box sx={{ mb: 4 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                  <Typography variant="subtitle2" fontWeight={800} color="text.secondary" sx={{ letterSpacing: '0.05em' }}>CHURCH ADMINS</Typography>
                </Box>
                <List disablePadding>
                  {churchDetails.admins?.map((admin: any) => (
                    <Paper key={admin.uid} sx={{ mb: 1.5, borderRadius: 2.5, border: '1px solid', borderColor: 'divider', boxShadow: 'none', bgcolor: 'background.paper' }}>
                      <ListItem sx={{ py: 1.5 }}>
                        <ListItemAvatar>
                          <Avatar sx={{ bgcolor: isDark ? 'rgba(59, 130, 246, 0.2)' : alpha('#1b4332', 0.1), color: isDark ? '#60a5fa' : '#1b4332', fontWeight: 800 }}>
                            {admin.name.charAt(0)}
                          </Avatar>
                        </ListItemAvatar>
                        <ListItemText 
                          primary={<Typography variant="body2" fontWeight={700} color="text.primary">{admin.name}</Typography>}
                          secondary={<Typography variant="caption" color="text.secondary">{admin.email} • {admin.churchRole}</Typography>}
                        />
                        <Button 
                          variant="contained" 
                          size="small"
                          onClick={() => { onClose(); onImpersonate(churchId); }}
                          sx={{ 
                            borderRadius: 2, 
                            fontSize: '0.7rem', 
                            fontWeight: 800,
                            textTransform: 'none',
                            bgcolor: isDark ? '#2563eb' : '#1b4332',
                            '&:hover': { bgcolor: isDark ? '#1d4ed8' : '#2d6a4f' }
                          }}
                        >
                          Impersonate
                        </Button>
                      </ListItem>
                    </Paper>
                  ))}
                  {(!churchDetails.admins || churchDetails.admins.length === 0) && (
                    <Typography variant="body2" color="text.secondary" textAlign="center" sx={{ py: 2 }}>No admins found for this church.</Typography>
                  )}
                </List>
              </Box>

              {/* Feature Flags */}
              <Box sx={{ mb: 4 }}>
                <Typography variant="subtitle2" fontWeight={800} color="text.secondary" sx={{ mb: 1.5, letterSpacing: '0.05em' }}>ACTIVE FEATURES</Typography>
                <Grid container spacing={1.5}>
                  {Object.entries(churchDetails.featureFlags || {}).map(([flag, enabled]: [string, any]) => (
                    <Grid size={{ xs: 6 }} key={flag}>
                      <Box sx={{ 
                        p: 1.5, 
                        borderRadius: 2.5, 
                        border: '1px solid',
                        borderColor: enabled 
                          ? (isDark ? 'rgba(16, 185, 129, 0.4)' : 'rgba(27, 67, 50, 0.25)')
                          : (isDark ? 'rgba(255, 255, 255, 0.08)' : '#e2e8f0'),
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        bgcolor: enabled 
                          ? (isDark ? 'rgba(16, 185, 129, 0.12)' : 'rgba(27, 67, 50, 0.06)')
                          : (isDark ? 'rgba(255, 255, 255, 0.02)' : '#f8fafc')
                      }}>
                        <Typography 
                          variant="caption" 
                          fontWeight={800} 
                          sx={{ 
                            color: enabled 
                              ? (isDark ? '#34d399' : '#1b4332') 
                              : 'text.secondary',
                            letterSpacing: '0.03em'
                          }}
                        >
                          {flag.toUpperCase()}
                        </Typography>
                        <Box sx={{ 
                          width: 8, 
                          height: 8, 
                          borderRadius: '50%', 
                          bgcolor: enabled ? '#10b981' : '#94a3b8',
                          boxShadow: enabled ? '0 0 6px #10b981' : 'none' 
                        }} />
                      </Box>
                    </Grid>
                  ))}
                </Grid>
              </Box>

              {/* Recent Audit Log */}
              <Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                  <Typography variant="subtitle2" fontWeight={800} color="text.secondary" sx={{ letterSpacing: '0.05em' }}>RECENT AUDIT LOG</Typography>
                </Box>
                <List disablePadding>
                  {churchDetails.auditLogs?.map((log: any) => (
                    <ListItem key={log.id} sx={{ px: 0, py: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
                      <ListItemAvatar sx={{ minWidth: 36 }}>
                        <History size={16} color={isDark ? '#94a3b8' : '#64748b'} />
                      </ListItemAvatar>
                      <ListItemText 
                        primary={<Typography variant="caption" fontWeight={700} color="text.primary">{log.action.replace('_', ' ')}</Typography>}
                        secondary={<Typography variant="caption" color="text.secondary">{new Date(log.createdAt).toLocaleString()}</Typography>}
                      />
                    </ListItem>
                  ))}
                  {(!churchDetails.auditLogs || churchDetails.auditLogs.length === 0) && (
                    <Typography variant="body2" color="text.secondary" textAlign="center" sx={{ py: 2 }}>No recent audit logs.</Typography>
                  )}
                </List>
              </Box>
            </Box>
          ) : (
            <Alert severity="error">Failed to load church details.</Alert>
          )}
        </Box>

        {/* Footer Actions */}
        <Box sx={{ p: 3, borderTop: '1px solid', borderColor: 'divider', display: 'flex', gap: 2, bgcolor: 'background.paper' }}>
          <Button 
            fullWidth 
            variant="contained" 
            onClick={() => {
              if (onOpenSettings) onOpenSettings(churchDetails);
              onClose();
            }}
            startIcon={<Settings size={18} />}
            sx={{ 
              borderRadius: 2.5, 
              fontWeight: 800, 
              bgcolor: isDark ? '#2563eb' : '#1b4332',
              '&:hover': { bgcolor: isDark ? '#1d4ed8' : '#2d6a4f' } 
            }}
          >
            Settings
          </Button>
          <Button 
            fullWidth 
            variant="outlined" 
            color="error"
            onClick={() => {
              if (onOpenSettings) onOpenSettings(churchDetails);
              onClose();
            }}
            startIcon={<UserX size={18} />}
            sx={{ borderRadius: 2.5, fontWeight: 800 }}
          >
            Manage
          </Button>
        </Box>
      </Box>
    </Drawer>
  );
};

export default ChurchDetailsDrawer;
