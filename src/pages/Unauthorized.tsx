import React from 'react';
import { Box, Typography, Button } from '@mui/material';
import { useNavigate } from 'react-router-dom';

const Unauthorized: React.FC = () => {
  const navigate = useNavigate();

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        textAlign: 'center',
        p: 3
      }}
    >
      <Typography variant="h1" sx={{ fontWeight: 800, color: 'error.main', mb: 2 }}>
        403
      </Typography>
      <Typography variant="h4" sx={{ mb: 2 }}>
        Access Denied
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
        You do not have permission to access this page.
      </Typography>
      <Button variant="contained" onClick={() => navigate('/login')}>
        Back to Login
      </Button>
    </Box>
  );
};

export default Unauthorized;
