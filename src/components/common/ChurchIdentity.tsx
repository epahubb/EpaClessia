import React from 'react';
import { Avatar, Box, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
export default function ChurchIdentity({ compact = false }: { compact?: boolean }) {
  const { user, currentContext } = useAuth();
  const { data } = useQuery({ queryKey: ['church-identity', user?.tenantId], queryFn: async () => (await api.get('/member/branding')).data, enabled: Boolean(user?.tenantId), staleTime: 60000 });
  const name = data?.name || currentContext?.tenantName || user?.tenant?.name || 'Your church';
  return <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}><Avatar variant="rounded" src={data?.logo || undefined} alt={`${name} logo`} sx={{ width: compact ? 32 : 40, height: compact ? 32 : 40 }}>{name[0]}</Avatar><Typography variant={compact ? 'body2' : 'h6'} fontWeight={800} sx={{ overflowWrap: 'anywhere', lineHeight: 1.3 }}>{name}</Typography></Box>;
}
