import React from 'react';
import { Box, Typography, Paper, Grid, Tooltip } from '@mui/material';
import { CheckCircle2, AlertCircle, XCircle } from 'lucide-react';

interface HealthStatusProps {
  health: {
    db: 'green' | 'yellow' | 'red';
    storage: 'green' | 'yellow' | 'red';
    api: 'green' | 'yellow' | 'red';
  } | undefined;
  loading: boolean;
}

const HealthStatus: React.FC<HealthStatusProps> = ({ health, loading }) => {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'green': return '#10b981';
      case 'yellow': return '#f59e0b';
      case 'red': return '#ef4444';
      default: return '#94a3b8';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'green': return <CheckCircle2 size={16} color="#10b981" />;
      case 'yellow': return <AlertCircle size={16} color="#f59e0b" />;
      case 'red': return <XCircle size={16} color="#ef4444" />;
      default: return null;
    }
  };

  const components = [
    { name: 'Database', key: 'db' },
    { name: 'Storage', key: 'storage' },
    { name: 'API', key: 'api' },
  ];

  return (
    <Box sx={{ mt: 3 }}>
      <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 2, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        System Health Status
      </Typography>
      <Grid container spacing={2}>
        {components.map((comp) => {
          const status = health ? health[comp.key as keyof typeof health] : 'unknown';
          return (
            <Grid size={{ xs: 4 }} key={comp.key}>
              <Paper 
                variant="outlined" 
                sx={{ 
                  p: 1.5, 
                  textAlign: 'center', 
                  borderRadius: 2,
                  bgcolor: 'action.hover',
                  border: 'none'
                }}
              >
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
                  {getStatusIcon(status)}
                  <Typography variant="caption" fontWeight={700} sx={{ mt: 0.5 }}>
                    {comp.name}
                  </Typography>
                </Box>
              </Paper>
            </Grid>
          );
        })}
      </Grid>
    </Box>
  );
};

export default HealthStatus;
