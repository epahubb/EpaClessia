import React, { useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, Card, CardContent, Chip, LinearProgress, Stack, Typography, useTheme } from '@mui/material';
import { ArrowRight, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
export function useWorkspaceData<T = any>(load: () => Promise<T>, dependencies: any[] = []) { const loader = useRef(load); loader.current = load; const [data, setData] = useState<T | null>(null), [error, setError] = useState(''), [loading, setLoading] = useState(true), [revision, setRevision] = useState(0); useEffect(() => { let active = true; setLoading(true); setError(''); loader.current().then(result => { if (active)
    setData(result); }).catch(e => { if (active)
    setError(e?.response?.data?.error || 'This overview could not be loaded. Please retry.'); }).finally(() => { if (active)
    setLoading(false); }); return () => { active = false; }; }, [revision, ...dependencies]); return { data, error, loading, refresh: () => setRevision(v => v + 1) }; }
export function WorkspaceHero({ eyebrow, title, description, action }: {
    eyebrow: string;
    title: string;
    description: string;
    action?: React.ReactNode;
}) { const theme = useTheme(); return <Box sx={{ p: { xs: 2.5, md: 3.5 }, borderRadius: 3, background: theme.palette.mode === 'light' ? 'linear-gradient(115deg,#e4f3ec,#eef3fb)' : 'linear-gradient(115deg,#14372e,#19283e)' }}><Stack direction={{ xs: 'column', sm: 'row' }} gap={2} justifyContent="space-between" alignItems={{ sm: 'center' }}><Box><Chip label={eyebrow.toUpperCase()} size="small" sx={{ mb: 2, fontSize: 10, fontWeight: 750, letterSpacing: .8, bgcolor: 'action.selected' }}/><Typography variant="h4" fontWeight={800} sx={{ letterSpacing: -1, lineHeight: 1.2, overflowWrap: 'anywhere' }}>{title}</Typography><Typography color="text.secondary" sx={{ mt: 1.2, maxWidth: 720 }}>{description}</Typography></Box>{action}</Stack></Box>; }
export function WorkspaceStatus({ state }: {
    state: any;
}) { return <Box><Stack direction="row" justifyContent="space-between" alignItems="center"><Typography variant="caption" color="text.secondary">Recorded data · Use Refresh for the latest update</Typography><Button startIcon={<RefreshCw size={15}/>} onClick={state.refresh} disabled={state.loading}>Refresh</Button></Stack>{state.loading && <LinearProgress sx={{ mt: 1, borderRadius: 2 }}/>}{state.error && <Alert severity="error" action={<Button onClick={state.refresh}>Retry</Button>} sx={{ mt: 2 }}>{state.error}</Alert>}</Box>; }
export function WorkspaceMetrics({ items }: {
    items: {
        label: string;
        value: React.ReactNode;
        hint: string;
        icon: React.ReactNode;
    }[];
}) { return <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2,minmax(0,1fr))', md: `repeat(${Math.min(4, items.length)},minmax(0,1fr))` }, gap: 2 }}>{items.map(item => <Card key={item.label} variant="outlined"><CardContent sx={{ p: 2.3 }}><Stack direction="row" justifyContent="space-between" gap={1}><Typography fontSize={12} color="text.secondary">{item.label}</Typography><Box sx={{ display: 'flex', color: 'text.secondary' }}>{item.icon}</Box></Stack><Typography variant="h5" fontWeight={800} sx={{ mt: 1.5, overflowWrap: 'anywhere' }}>{item.value}</Typography><Typography fontSize={11} color="text.secondary" sx={{ mt: .7 }}>{item.hint}</Typography></CardContent></Card>)}</Box>; }
export function WorkspaceActions({ items }: {
    items: {
        label: string;
        path: string;
        description: string;
    }[];
}) { const navigate = useNavigate(); return <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2,minmax(0,1fr))', lg: 'repeat(4,minmax(0,1fr))' }, gap: 1.5 }}>{items.map(a => <Button key={a.path} onClick={() => navigate(a.path)} variant="outlined" color="inherit" sx={{ p: 2, bgcolor: 'background.paper', borderColor: 'divider', justifyContent: 'space-between', textAlign: 'left' }}><Box><Typography fontSize={13} fontWeight={750}>{a.label}</Typography><Typography fontSize={11} color="text.secondary" sx={{ mt: .5 }}>{a.description}</Typography></Box><ArrowRight size={17}/></Button>)}</Box>; }
export function WorkspacePanel({ title, action, children }: {
    title: string;
    action?: React.ReactNode;
    children: React.ReactNode;
}) { return <Card variant="outlined"><CardContent sx={{ p: 2.5 }}><Stack direction="row" justifyContent="space-between" alignItems="center" gap={1} sx={{ mb: 2 }}><Typography fontWeight={750}>{title}</Typography>{action}</Stack>{children}</CardContent></Card>; }
