import React, { useState, useMemo } from 'react';
import { 
  Box, Typography, Paper, Table, TableBody, TableCell, 
  TableContainer, TableHead, TableRow, IconButton, 
  Button, Chip, TextField, InputAdornment, Menu, 
  MenuItem, Skeleton, alpha, useTheme, useMediaQuery,
  TablePagination, TableSortLabel, Avatar
} from '@mui/material';
import { 
  Search, Plus, MoreVertical, Eye, Edit, 
  UserX, Trash2, Filter, Download, FileText, 
  FileSpreadsheet, FileCode, ChevronDown, Settings, 
  UserCheck, ShieldAlert
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import { Church } from '../types/church';

// Components
import RegisterChurchModal from '../components/superadmin/RegisterChurchModal';
import EditChurchModal from '../components/superadmin/EditChurchModal';
import DeleteConfirmModal from '../components/superadmin/DeleteConfirmModal';
import ChurchDetailsDrawer from '../components/superadmin/ChurchDetailsDrawer';
import { denominationLabel } from '../lib/denominations';

const Churches: React.FC = () => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  
  // States for Modals & Menus
  const [openAdd, setOpenAdd] = useState(false);
  const [openEdit, setOpenEdit] = useState(false);
  const [openDelete, setOpenDelete] = useState(false);
  const [openDetails, setOpenDetails] = useState(false);
  const [selectedChurch, setSelectedChurch] = useState<Church | null>(null);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [exportAnchorEl, setExportAnchorEl] = useState<null | HTMLElement>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Filter States from URL
  const [searchInput, setSearchInput] = useState(searchParams.get('search') || '');
  const search = searchParams.get('search') || '';
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '20');
  const plan = searchParams.get('plan') || 'all';
  const status = searchParams.get('status') || 'all';
  const sortBy = searchParams.get('sortBy') || 'createdAt';
  const sortOrder = (searchParams.get('sortOrder') || 'desc') as 'asc' | 'desc';

  // Debounce search
  React.useEffect(() => {
    const handler = setTimeout(() => {
      setSearchParams(prev => {
        if (searchInput) prev.set('search', searchInput);
        else prev.delete('search');
        prev.set('page', '1');
        return prev;
      });
    }, 500);
    return () => clearTimeout(handler);
  }, [searchInput, setSearchParams]);

  // Fetch Churches Data
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['churches', { search, page, limit, plan, status, sortBy, sortOrder }],
    queryKeyHashFn: (key) => JSON.stringify(key),
    queryFn: async () => {
      const response = await api.get('/superadmin/churches', {
        params: { page, limit, search, plan, status, sortBy, sortOrder }
      });
      return response.data;
    }
  });

  // Fetch Church Details (for drawer)
  const { data: churchDetails, isLoading: isLoadingDetails } = useQuery({
    queryKey: ['church-details', selectedChurch?.id],
    queryFn: async () => {
      if (!selectedChurch?.id) return null;
      const response = await api.get(`/superadmin/churches/${selectedChurch.id}`);
      return response.data;
    },
    enabled: !!selectedChurch?.id && openDetails
  });

  // Mutations
  const createMutation = useMutation({
    mutationFn: (newChurch: any) => api.post('/superadmin/churches', newChurch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['churches'] });
      setOpenAdd(false);
    },
    onError: (err: any) => setActionError(err.response?.data?.error || 'Failed to create church')
  });

  const updateMutation = useMutation({
    mutationFn: (update: any) => api.put(`/superadmin/churches/${selectedChurch?.id}`, update),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['churches'] });
      queryClient.invalidateQueries({ queryKey: ['church-details', selectedChurch?.id] });
      setOpenEdit(false);
    },
    onError: (err: any) => setActionError(err.response?.data?.error || 'Failed to update church')
  });

  const deleteMutation = useMutation({
    mutationFn: (mode: string) => api.delete(`/superadmin/churches/${selectedChurch?.id}`, { data: { mode } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['churches'] });
      setOpenDelete(false);
    },
    onError: (err: any) => setActionError(err.response?.data?.error || 'Failed to delete church')
  });

  // Activate / deactivate a church (super admin control over tenant access).
  const setActiveMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      api.post(`/superadmin/churches/${id}/${active ? 'restore' : 'suspend'}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['churches'] });
      setAnchorEl(null);
    },
    onError: (err: any) => setActionError(err.response?.data?.error || 'Failed to update church status'),
  });

  const impersonateMutation = useMutation({
    mutationFn: (id: string) => api.post(`/superadmin/churches/${id}/impersonate`),
    onSuccess: (res) => {
      const { token, user } = res.data;
      const currentToken = localStorage.getItem('token');
      const currentUser = localStorage.getItem('user');
      if (currentToken) localStorage.setItem('original_sa_token', currentToken);
      if (currentUser) localStorage.setItem('original_sa_user', currentUser);

      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
      localStorage.setItem('is_impersonating', 'true');
      window.location.href = '/church/dashboard';
    },
    onError: (err: any) => {
      setActionError(err.response?.data?.error || 'Failed to impersonate church admin');
    }
  });

  // Handlers
  const handlePageChange = (_: any, newPage: number) => {
    setSearchParams(prev => {
      prev.set('page', (newPage + 1).toString());
      return prev;
    });
  };

  const handleSort = (property: string) => {
    const isAsc = sortBy === property && sortOrder === 'asc';
    setSearchParams(prev => {
      prev.set('sortBy', property);
      prev.set('sortOrder', isAsc ? 'desc' : 'asc');
      return prev;
    });
  };

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>, church: Church) => {
    event.stopPropagation();
    setAnchorEl(event.currentTarget);
    setSelectedChurch(church);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleExport = (type: 'csv' | 'excel' | 'pdf') => {
    setExportAnchorEl(null);
    const churchesList: Church[] = data?.data || [];
    if (churchesList.length === 0) return;

    if (type === 'csv' || type === 'excel') {
      const headers = ['ID', 'Church Name', 'Website', 'Denomination', 'Plan', 'Status', 'Members', 'Contact Email', 'Phone', 'City', 'Created At', 'Plan Expiry'];
      const rows = churchesList.map(c => {
        const expiry = c.subscriptionEndDate || c.trialEndDate;
        return [
          c.id,
          `"${c.name.replace(/"/g, '""')}"`,
          c.websiteUrl || '',
          c.planId,
          c.status,
          c.memberCount || 0,
          c.contactEmail || c.adminEmail || '',
          c.phone || '',
          c.city || '',
          new Date(c.createdAt).toLocaleDateString(),
          expiry ? new Date(expiry).toLocaleDateString() : ''
        ];
      });

      const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      const blob = new Blob([type === 'excel' ? '\uFEFF' + csvContent : csvContent], { 
        type: type === 'excel' ? 'application/vnd.ms-excel;charset=utf-8' : 'text/csv;charset=utf-8;' 
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `churches_export_${new Date().toISOString().split('T')[0]}.${type === 'excel' ? 'xls' : 'csv'}`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else if (type === 'pdf') {
      const printWindow = window.open('', '_blank');
      if (!printWindow) return;
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Churches Management Export</title>
          <style>
            body { font-family: system-ui, -apple-system, sans-serif; padding: 24px; color: #0f172a; }
            h1 { font-size: 22px; margin-bottom: 4px; }
            p { color: #64748b; margin-top: 0; margin-bottom: 20px; font-size: 13px; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th, td { border: 1px solid #e2e8f0; padding: 8px 12px; text-align: left; font-size: 12px; }
            th { background-color: #f8fafc; font-weight: 700; text-transform: uppercase; font-size: 11px; }
            tr:nth-child(even) { background-color: #f8fafc; }
            .badge { padding: 3px 8px; border-radius: 4px; font-weight: bold; font-size: 10px; display: inline-block; }
            .active { background: #dcfce7; color: #166534; }
            .trial { background: #dbeafe; color: #1e40af; }
            .suspended { background: #fee2e2; color: #991b1b; }
          </style>
        </head>
        <body>
          <h1>Ecclesia Platform - Churches Overview</h1>
          <p>Export Date: ${new Date().toLocaleString()} • Total Records: ${churchesList.length}</p>
          <table>
            <thead>
              <tr>
                <th>Church Name</th>
                <th>Website</th>
                <th>Plan</th>
                <th>Status</th>
                <th>Members</th>
                <th>Contact Email</th>
                <th>Created At</th>
              </tr>
            </thead>
            <tbody>
              ${churchesList.map(c => `
                <tr>
                  <td><strong>${c.name}</strong></td>
                  <td>${c.websiteUrl || '—'}</td>
                  <td>${c.planId.replace('_', ' ').toUpperCase()}</td>
                  <td><span class="badge ${c.status}">${c.status.toUpperCase()}</span></td>
                  <td>${c.memberCount || 0}</td>
                  <td>${c.contactEmail || c.adminEmail || ''}</td>
                  <td>${new Date(c.createdAt).toLocaleDateString()}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <script>
            window.onload = function() { window.print(); }
          </script>
        </body>
        </html>
      `;
      printWindow.document.write(html);
      printWindow.document.close();
    }
  };

  const getStatusColor = (s: string) => {
    switch (s) {
      case 'active': return '#10b981';
      case 'suspended': return '#ef4444';
      case 'trial': return '#3b82f6';
      case 'deleted': return '#64748b';
      default: return '#94a3b8';
    }
  };

  return (
    <Box sx={{ p: { xs: 0, md: 4 } }}>
      {/* Page Header */}
      <Box sx={{ 
        mb: 4, 
        display: 'flex', 
        flexDirection: { xs: 'column', sm: 'row' },
        justifyContent: 'space-between', 
        alignItems: { xs: 'flex-start', sm: 'center' },
        gap: 2
      }}>
        <Box>
          <Typography variant="h4" fontWeight={900} color="text.primary" sx={{ letterSpacing: '-1.5px', fontSize: { xs: '2rem', md: '2.5rem' } }}>
            Churches Management
          </Typography>
          <Typography variant="body1" color="text.secondary" fontWeight={500}>
            A comprehensive overview of all church tenants on the platform.
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1.5, width: { xs: '100%', sm: 'auto' } }}>
          {/* Export Dropdown */}
          <Button 
            variant="outlined" 
            onClick={(e) => setExportAnchorEl(e.currentTarget)}
            startIcon={<Download size={18} />}
            endIcon={<ChevronDown size={16} />}
            sx={{ 
              borderRadius: 3, 
              px: 3, 
              fontWeight: 700, 
              borderColor: 'divider', 
              color: 'text.primary', 
              bgcolor: 'background.paper',
              '&:hover': { bgcolor: 'action.hover' }
            }}
          >
            Export
          </Button>

          <Menu
            anchorEl={exportAnchorEl}
            open={Boolean(exportAnchorEl)}
            onClose={() => setExportAnchorEl(null)}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            PaperProps={{ 
              sx: { 
                width: 190, 
                borderRadius: 3, 
                mt: 1, 
                boxShadow: theme.shadows[6],
                bgcolor: 'background.paper',
                border: '1px solid',
                borderColor: 'divider'
              } 
            }}
          >
            <MenuItem onClick={() => handleExport('csv')} sx={{ gap: 1.5, fontWeight: 600, py: 1.2 }}>
              <FileText size={18} color="#3b82f6" /> CSV Format
            </MenuItem>
            <MenuItem onClick={() => handleExport('excel')} sx={{ gap: 1.5, fontWeight: 600, py: 1.2 }}>
              <FileSpreadsheet size={18} color="#10b981" /> Excel (.xlsx)
            </MenuItem>
            <MenuItem onClick={() => handleExport('pdf')} sx={{ gap: 1.5, fontWeight: 600, py: 1.2 }}>
              <FileCode size={18} color="#ef4444" /> Print / PDF
            </MenuItem>
          </Menu>

          <Button 
            variant="contained" 
            onClick={() => setOpenAdd(true)}
            startIcon={<Plus size={18} />}
            sx={{ 
              borderRadius: 3, 
              px: 3, 
              fontWeight: 800, 
              bgcolor: isDark ? '#2563eb' : '#1b4332', 
              '&:hover': { bgcolor: isDark ? '#1d4ed8' : '#2d6a4f' } 
            }}
          >
            Add Church
          </Button>
        </Box>
      </Box>

      {/* Main Table Container */}
      <Paper sx={{ 
        borderRadius: 4, 
        overflow: 'hidden', 
        boxShadow: isDark ? '0 4px 20px rgba(0,0,0,0.4)' : '0 4px 6px -1px rgb(0 0 0 / 0.1)', 
        border: '1px solid', 
        borderColor: 'divider',
        bgcolor: 'background.paper'
      }}>
        {/* Filters and Search Bar */}
        <Box sx={{ p: 3, display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center', borderBottom: '1px solid', borderColor: 'divider' }}>
          <TextField 
            placeholder="Search by church or website..." 
            size="small"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            sx={{ flexGrow: 1, minWidth: 250, '& .MuiOutlinedInput-root': { borderRadius: 3, bgcolor: 'background.default' } }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Search size={18} color="text.secondary" />
                </InputAdornment>
              ),
            }}
          />
          
          <Box sx={{ display: 'flex', gap: 1.5 }}>
            <TextField
              select
              size="small"
              label="Plan"
              value={plan}
              onChange={(e) => setSearchParams(prev => { prev.set('plan', e.target.value); return prev; })}
              sx={{ minWidth: 120, '& .MuiOutlinedInput-root': { borderRadius: 3 } }}
            >
              <MenuItem value="all">All Plans</MenuItem>
              <MenuItem value="free_trial">Free Trial</MenuItem>
              <MenuItem value="basic">Basic</MenuItem>
              <MenuItem value="pro">Pro</MenuItem>
              <MenuItem value="enterprise">Enterprise</MenuItem>
            </TextField>

            <TextField
              select
              size="small"
              label="Status"
              value={status}
              onChange={(e) => setSearchParams(prev => { prev.set('status', e.target.value); return prev; })}
              sx={{ minWidth: 120, '& .MuiOutlinedInput-root': { borderRadius: 3 } }}
            >
              <MenuItem value="all">All Status</MenuItem>
              <MenuItem value="active">Active</MenuItem>
              <MenuItem value="trial">Trial</MenuItem>
              <MenuItem value="suspended">Suspended</MenuItem>
              <MenuItem value="deleted">Deleted</MenuItem>
            </TextField>
          </Box>
        </Box>

        {/* Data Table */}
        <TableContainer sx={{ position: 'relative', overflowX: 'auto' }}>
          <Table sx={{ minWidth: 800 }}>
            <TableHead>
              <TableRow sx={{ bgcolor: isDark ? 'rgba(255, 255, 255, 0.03)' : '#f8fafc' }}>
                <TableCell>
                  <TableSortLabel
                    active={sortBy === 'name'}
                    direction={sortOrder}
                    onClick={() => handleSort('name')}
                    sx={{ fontWeight: 800, textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '0.05em' }}
                  >
                    Church Name
                  </TableSortLabel>
                </TableCell>
                <TableCell sx={{ fontWeight: 800, textTransform: 'uppercase', fontSize: '0.75rem' }}>Website</TableCell>
                <TableCell sx={{ fontWeight: 800, textTransform: 'uppercase', fontSize: '0.75rem' }}>Denomination</TableCell>
                <TableCell sx={{ fontWeight: 800, textTransform: 'uppercase', fontSize: '0.75rem' }}>Plan</TableCell>
                <TableCell sx={{ fontWeight: 800, textTransform: 'uppercase', fontSize: '0.75rem' }}>Status</TableCell>
                <TableCell>
                  <TableSortLabel
                    active={sortBy === 'memberCount'}
                    direction={sortOrder}
                    onClick={() => handleSort('memberCount')}
                    sx={{ fontWeight: 800, textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '0.05em' }}
                  >
                    Members
                  </TableSortLabel>
                </TableCell>
                <TableCell>
                  <TableSortLabel
                    active={sortBy === 'createdAt'}
                    direction={sortOrder}
                    onClick={() => handleSort('createdAt')}
                    sx={{ fontWeight: 800, textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '0.05em' }}
                  >
                    Created At
                  </TableSortLabel>
                </TableCell>
                <TableCell sx={{ fontWeight: 800, textTransform: 'uppercase', fontSize: '0.75rem' }}>Expiry</TableCell>
                <TableCell align="right" sx={{ fontWeight: 800, textTransform: 'uppercase', fontSize: '0.75rem' }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={9}><Skeleton variant="text" height={40} /></TableCell>
                  </TableRow>
                ))
              ) : data?.data?.map((church: Church) => (
                <TableRow 
                  key={church.id} 
                  hover 
                  sx={{ cursor: 'pointer' }}
                  onClick={() => { setSelectedChurch(church); setOpenDetails(true); }}
                >
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <Avatar 
                        src={church.logo} 
                        variant="rounded" 
                        sx={{ width: 36, height: 36, bgcolor: alpha(getStatusColor(church.status), 0.15), color: getStatusColor(church.status), fontWeight: 800 }}
                      >
                        {church.name.charAt(0)}
                      </Avatar>
                      <Typography variant="body2" fontWeight={700} color="text.primary">{church.name}</Typography>
                    </Box>
                  </TableCell>
                  <TableCell>
                    {church.websiteUrl ? (
                      <Typography
                        variant="body2"
                        color="primary"
                        fontWeight={600}
                        component="a"
                        href={church.websiteUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        sx={{ textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
                      >
                        {church.websiteUrl.replace(/^https?:\/\//, '')}
                      </Typography>
                    ) : (
                      <Typography variant="body2" color="text.secondary" fontWeight={600}>{'—'}</Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" fontWeight={600} color="text.secondary">
                      {denominationLabel(church.denomination)}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip 
                      label={church.planId.replace('_', ' ').toUpperCase()} 
                      size="small"
                      sx={{ 
                        fontWeight: 800, 
                        fontSize: '0.65rem', 
                        bgcolor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#f1f5f9', 
                        color: theme.palette.text.primary,
                        border: '1px solid',
                        borderColor: isDark ? 'rgba(255, 255, 255, 0.15)' : '#e2e8f0'
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: getStatusColor(church.status) }} />
                      <Typography variant="body2" fontWeight={700} sx={{ color: getStatusColor(church.status) }}>
                        {church.status.charAt(0).toUpperCase() + church.status.slice(1)}
                      </Typography>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" fontWeight={700} color="text.primary">{church.memberCount || 0}</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary">
                      {new Date(church.createdAt).toLocaleDateString()}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    {(() => {
                      const expiry = church.subscriptionEndDate || church.trialEndDate;
                      if (!expiry) return <Typography variant="body2" color="text.secondary">{'—'}</Typography>;
                      const d = new Date(expiry);
                      const daysLeft = Math.ceil((d.getTime() - Date.now()) / 86400000);
                      const col = daysLeft < 0 ? '#ef4444' : daysLeft <= 30 ? '#f59e0b' : '#10b981';
                      return (
                        <Box>
                          <Typography variant="body2" fontWeight={700} sx={{ color: col }}>{d.toLocaleDateString()}</Typography>
                          <Typography variant="caption" color="text.secondary">{daysLeft < 0 ? 'Expired' : `${daysLeft} days left`}</Typography>
                        </Box>
                      );
                    })()}
                  </TableCell>
                  <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                    <IconButton size="small" onClick={(e) => handleMenuOpen(e, church)}>
                      <MoreVertical size={18} />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        {/* Pagination */}
        <TablePagination
          component="div"
          count={data?.pagination.total || 0}
          page={page - 1}
          onPageChange={handlePageChange}
          rowsPerPage={limit}
          onRowsPerPageChange={(e) => setSearchParams(prev => { prev.set('limit', e.target.value); prev.set('page', '1'); return prev; })}
          rowsPerPageOptions={[10, 20, 50]}
        />
      </Paper>

      {/* Action Menu (Properly positioned) */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        PaperProps={{ 
          sx: { 
            width: 200, 
            borderRadius: 3, 
            boxShadow: theme.shadows[8],
            zIndex: 1400,
            bgcolor: 'background.paper',
            border: '1px solid',
            borderColor: 'divider'
          } 
        }}
      >
        <MenuItem onClick={() => { setOpenDetails(true); handleMenuClose(); }} sx={{ gap: 1.5, fontWeight: 600 }}>
          <Eye size={16} /> View Details
        </MenuItem>
        <MenuItem onClick={() => { setOpenEdit(true); handleMenuClose(); }} sx={{ gap: 1.5, fontWeight: 600 }}>
          <Edit size={16} /> Edit Church
        </MenuItem>
        <MenuItem onClick={() => { setOpenEdit(true); handleMenuClose(); }} sx={{ gap: 1.5, fontWeight: 600 }}>
          <Settings size={16} /> Church Settings
        </MenuItem>
        {selectedChurch && (
          <MenuItem 
            onClick={() => { 
              handleMenuClose(); 
              impersonateMutation.mutate(selectedChurch.id); 
            }} 
            sx={{ gap: 1.5, fontWeight: 600, color: 'primary.main' }}
          >
            <UserCheck size={16} /> Impersonate Admin
          </MenuItem>
        )}
        {selectedChurch && selectedChurch.status === 'active' ? (
          <MenuItem
            onClick={() => selectedChurch && setActiveMutation.mutate({ id: selectedChurch.id, active: false })}
            sx={{ gap: 1.5, fontWeight: 600, color: 'warning.main' }}
          >
            <UserX size={16} /> Deactivate Church
          </MenuItem>
        ) : selectedChurch ? (
          <MenuItem
            onClick={() => selectedChurch && setActiveMutation.mutate({ id: selectedChurch.id, active: true })}
            sx={{ gap: 1.5, fontWeight: 600, color: 'success.main' }}
          >
            <ShieldAlert size={16} /> Activate Church
          </MenuItem>
        ) : null}
        <MenuItem 
          onClick={() => { setOpenDelete(true); handleMenuClose(); }} 
          sx={{ gap: 1.5, fontWeight: 600, color: 'error.main' }}
        >
          <Trash2 size={16} /> Delete / Suspend
        </MenuItem>
      </Menu>

      {/* Modals */}
      <RegisterChurchModal 
        open={openAdd} 
        onClose={() => setOpenAdd(false)} 
      />

      <EditChurchModal 
        open={openEdit} 
        onClose={() => setOpenEdit(false)} 
        church={selectedChurch}
        onSubmit={(data) => updateMutation.mutate(data)}
        isLoading={updateMutation.isPending}
        error={actionError}
      />

      <DeleteConfirmModal 
        open={openDelete} 
        onClose={() => setOpenDelete(false)} 
        church={selectedChurch}
        onConfirm={(mode) => deleteMutation.mutate(mode)}
        isLoading={deleteMutation.isPending}
        error={actionError}
      />

      <ChurchDetailsDrawer 
        open={openDetails} 
        onClose={() => setOpenDetails(false)} 
        churchId={selectedChurch?.id || null}
        churchDetails={churchDetails}
        isLoading={isLoadingDetails}
        onImpersonate={(id) => impersonateMutation.mutate(id)}
        onOpenSettings={(church) => {
          setSelectedChurch(church);
          setOpenEdit(true);
        }}
      />
    </Box>
  );
};

export default Churches;
