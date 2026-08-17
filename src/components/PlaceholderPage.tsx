import React from 'react';
import { Box, Typography, Paper } from '@mui/material';

interface PlaceholderPageProps {
  title: string;
}

const PlaceholderPage: React.FC<PlaceholderPageProps> = ({ title }) => {
  return (
    <Box>
      <Typography variant="h4" fontWeight={800} sx={{ mb: 2, letterSpacing: '-1px' }}>{title}</Typography>
      <Paper sx={{ p: 4, borderRadius: 4, textAlign: 'center', bgcolor: 'action.hover' }}>
        <Typography color="text.secondary">This page is currently under development.</Typography>
      </Paper>
    </Box>
  );
};

export default PlaceholderPage;
