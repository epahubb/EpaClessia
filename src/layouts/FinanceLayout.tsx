import React from 'react';
import { Wallet, BarChart3 } from 'lucide-react';
import PortalLayout, { PortalNavItem } from './PortalLayout';

/**
 * Finance officer portal.
 *
 * Scoped deliberately: money in, money out, and reporting. No member
 * administration, no user management, no settings -- a finance officer has no
 * business editing those, and the server enforces the same boundary.
 *
 * Every entry below points at a route that exists in App.tsx. An entry for a
 * route that is not registered would fall through to the `*` catch-all and
 * redirect the user to /login, so this list and the router must stay in step.
 * Giving, expenses, budgets and pledges are tabs inside the Overview page
 * rather than separate routes.
 */
const financeNav: PortalNavItem[] = [
  { text: 'Overview', icon: <Wallet size={20} />, path: '/finance/dashboard' },
  { text: 'Reports', icon: <BarChart3 size={20} />, path: '/finance/reports' },
];

const FinanceLayout: React.FC = () => (
  <PortalLayout roleLabel="FINANCE" menuItems={financeNav} accent="success" />
);

export default FinanceLayout;
