import React from 'react';
import { Alert, Button } from '@mui/material';
import WorkspaceShell from '../components/workspace/WorkspaceShell';
import { usePortalProfile } from '../hooks/usePortalProfile';
import { portalDefinitions } from '../lib/portalNavigation';
import type { PortalFeature } from '../lib/denominations';
export function ChurchAdminLayout() {
    const { has, label } = usePortalProfile();
    const links = portalDefinitions.church.links.filter(l => !l.feature || has(l.feature as PortalFeature)).map(l => ({ ...l, label: ['/church/members', '/church/ministries'].includes(l.path) ? label(l.feature as PortalFeature, l.label) : l.label }));
    const impersonating = localStorage.getItem('is_impersonating') === 'true';
    const exit = () => { const token = localStorage.getItem('original_sa_token'), user = localStorage.getItem('original_sa_user'); if (token && user) {
        localStorage.setItem('token', token);
        localStorage.setItem('user', user);
        localStorage.removeItem('original_sa_token');
        localStorage.removeItem('original_sa_user');
        localStorage.removeItem('is_impersonating');
        window.location.href = '/super-admin/churches';
    }
    else {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/login';
    } };
    return <WorkspaceShell portal="church" links={links} banner={impersonating ? <Alert severity="warning" sx={{ borderRadius: 0 }} action={<Button onClick={exit}>Exit impersonation</Button>}>You are managing this church in administrator impersonation mode.</Alert> : undefined}/>;
}
export default ChurchAdminLayout;
