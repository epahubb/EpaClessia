import React from 'react';
import { 
  Table, TableBody, TableCell, TableContainer, 
  TableHead, TableRow, Paper, Typography, 
  Chip, Box, Avatar, Skeleton, IconButton 
} from '@mui/material';
import { ArrowUpRight } from 'lucide-react';
import { Tenant } from '../../types';

interface RecentChurchesTableProps {
  churches: Tenant[] | undefined;
  loading: boolean;
}

const RecentChurchesTable: React.FC<RecentChurchesTableProps> = ({ churches, loading }) => {
  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6" fontWeight={700}>Recent Church Registrations</Typography>
        <IconButton size="small"><ArrowUpRight size={20} /></IconButton>
      </Box>
      <TableContainer component={Box} sx={{ boxShadow: 'none' }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 700, borderBottom: '2px solid', borderColor: 'divider', py: 1.5 }}>Church</TableCell>
              <TableCell sx={{ fontWeight: 700, borderBottom: '2px solid', borderColor: 'divider', py: 1.5 }}>Website</TableCell>
              <TableCell sx={{ fontWeight: 700, borderBottom: '2px solid', borderColor: 'divider', py: 1.5 }}>Date</TableCell>
              <TableCell sx={{ fontWeight: 700, borderBottom: '2px solid', borderColor: 'divider', py: 1.5 }}>Status</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              [1, 2, 3, 4, 5].map((i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <Skeleton variant="circular" width={32} height={32} />
                      <Skeleton variant="text" width={100} />
                    </Box>
                  </TableCell>
                  <TableCell><Skeleton variant="text" width={80} /></TableCell>
                  <TableCell><Skeleton variant="text" width={80} /></TableCell>
                  <TableCell><Skeleton variant="rectangular" width={60} height={20} sx={{ borderRadius: 1 }} /></TableCell>
                </TableRow>
              ))
            ) : (
              churches?.map((church) => (
                <TableRow key={church.id} hover sx={{ '&:last-child td, &:last-child th': { border: 0 } }}>
                  <TableCell sx={{ py: 1.5 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <Avatar sx={{ width: 32, height: 32, bgcolor: 'primary.light', color: 'primary.main', fontSize: '0.875rem', fontWeight: 700 }}>
                        {church.name[0]}
                      </Avatar>
                      <Typography variant="body2" fontWeight={600}>{church.name}</Typography>
                    </Box>
                  </TableCell>
                  <TableCell sx={{ py: 1.5 }}>
                    <Typography variant="body2" color="text.secondary">{church.websiteUrl || '\u2014'}</Typography>
                  </TableCell>
                  <TableCell sx={{ py: 1.5 }}>
                    <Typography variant="body2" color="text.secondary">
                      {new Date(church.createdAt).toLocaleDateString()}
                    </Typography>
                  </TableCell>
                  <TableCell sx={{ py: 1.5 }}>
                    <Chip 
                      label={(church.status || 'unknown').toUpperCase()} 
                      size="small" 
                      color={church.status === 'active' ? 'success' : church.status === 'pending' ? 'warning' : 'error'}
                      sx={{ fontWeight: 700, fontSize: '0.65rem', height: 20 }}
                    />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
};

export default RecentChurchesTable;
