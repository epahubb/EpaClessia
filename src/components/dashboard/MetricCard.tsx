import React from 'react';
import { Card, CardContent, Box, Typography, Chip, Skeleton } from '@mui/material';

interface MetricCardProps {
  title: string;
  value: string | number | undefined;
  icon: React.ReactNode;
  color: string;
  change?: string;
  loading?: boolean;
}

const MetricCard: React.FC<MetricCardProps> = ({ title, value, icon, color, change, loading }) => (
  <Card sx={{ border: (theme) => `1px solid ${theme.palette.divider}`, boxShadow: 'none', height: '100%' }}>
    <CardContent sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
        <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: `${color}15`, color: color }}>
          {icon}
        </Box>
        {change && !loading && (
          <Chip 
            label={change} 
            size="small" 
            sx={{ 
              height: 20, 
              fontSize: '0.7rem', 
              fontWeight: 700,
              bgcolor: change.startsWith('+') ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
              color: change.startsWith('+') ? '#10b981' : '#ef4444'
            }} 
          />
        )}
      </Box>
      <Typography variant="h4" fontWeight={800} sx={{ mb: 0.5 }}>
        {loading ? <Skeleton width="60%" /> : value}
      </Typography>
      <Typography variant="body2" color="text.secondary" fontWeight={500}>
        {title}
      </Typography>
    </CardContent>
  </Card>
);

export default MetricCard;
