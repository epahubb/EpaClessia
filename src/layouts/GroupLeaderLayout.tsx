import React from 'react';
import { Box, Button, Stack, Typography } from '@mui/material';
import { Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useColorMode } from '../contexts/ThemeContext';
export default function GroupLeaderLayout() {
  const { user, logout, currentContext } = useAuth(); const navigate = useNavigate(); const { mode, toggleColorMode } = useColorMode();
  return <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
    <Box component="header" sx={{ bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider', p: { xs: 2, md: 3 } }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={2}>
        <Box><Typography fontWeight={800} variant="h6">{currentContext?.tenantName || user?.tenant?.name || 'Church'}</Typography><Typography variant="body2" color="text.secondary">Group Leader Portal · {user?.name}</Typography></Box>
        <Stack direction="row" gap={1} flexWrap="wrap"><Button onClick={() => navigate('/member/profile')}>My profile</Button><Button onClick={toggleColorMode}>{mode === 'dark' ? 'Light mode' : 'Dark mode'}</Button><Button variant="outlined" onClick={() => { logout(); navigate('/login'); }}>Sign out</Button></Stack>
      </Stack>
    </Box><Box component="main" sx={{ maxWidth: 1180, mx: 'auto', p: { xs: 2, md: 4 } }}><Outlet /></Box>
  </Box>;
}
