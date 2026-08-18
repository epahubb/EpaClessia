import React from 'react';
import { Users, UserPlus, Calendar, QrCode } from 'lucide-react';
import PortalLayout, { PortalNavItem } from './PortalLayout';

/**
 * Church secretary portal.
 *
 * Records and attendance: marking attendance, the member roll, visitors and the
 * service calendar. Finance and user administration are intentionally absent.
 *
 * Every entry points at a route registered in App.tsx -- an unregistered path
 * would fall through to the `*` catch-all and bounce the user to /login.
 */
const secretaryNav: PortalNavItem[] = [
  { text: 'Attendance', icon: <QrCode size={20} />, path: '/secretary/dashboard' },
  { text: 'Members', icon: <Users size={20} />, path: '/secretary/members' },
  { text: 'Visitors', icon: <UserPlus size={20} />, path: '/secretary/visitors' },
  { text: 'Events', icon: <Calendar size={20} />, path: '/secretary/events' },
];

const SecretaryLayout: React.FC = () => (
  <PortalLayout roleLabel="SECRETARY" menuItems={secretaryNav} accent="info" />
);

export default SecretaryLayout;
