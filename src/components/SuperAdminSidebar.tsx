import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Church, 
  Users, 
  CreditCard, 
  Settings, 
  BarChart3, 
  ChevronLeft, 
  ChevronRight, 
  LogOut,
  Bell,
  Menu,
  X,
  Ticket
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { superAdminService } from '../services/superAdminService';
import { useColorMode } from '../contexts/ThemeContext';
import { ThemeToggle } from './ThemeToggle';

interface NavItem {
  id: string;
  label: string;
  icon: React.ElementType;
  path: string;
  badge?: number;
}

const SuperAdminSidebar: React.FC = () => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [stats, setStats] = useState<any>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const { mode } = useColorMode();

  useEffect(() => {
    const fetchBadges = async () => {
      const token = localStorage.getItem('token');
      if (!token) return;
      try {
        const data = await superAdminService.getStats();
        setStats(data);
      } catch (err) {
        console.warn('Sidebar badges fetch skipped or unauthenticated:', err);
      }
    };
    fetchBadges();
  }, []);

  const menuItems: NavItem[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, path: '/super-admin' },
    { id: 'churches', label: 'Churches', icon: Church, path: '/super-admin/churches', badge: stats?.totalChurches },
    { id: 'users', label: 'Users', icon: Users, path: '/super-admin/users' },
    { id: 'billing', label: 'Billing', icon: CreditCard, path: '/super-admin/billing' },
    { id: 'tickets', label: 'Support Tickets', icon: Ticket, path: '/super-admin/tickets', badge: stats?.pendingTickets },
    { id: 'reports', label: 'Reports', icon: BarChart3, path: '/super-admin/reports' },
    { id: 'church-settings', label: 'Church Configuration', icon: Settings, path: '/super-admin/church-settings' },
    { id: 'settings', label: 'System Settings', icon: Settings, path: '/super-admin/settings' },
  ];

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('currentContext');
    navigate('/login');
  };

  const isActive = (path: string) => location.pathname === path;

  const sidebarVariants = {
    expanded: { width: 260 },
    collapsed: { width: 80 }
  };

  const NavLink: React.FC<{ item: NavItem }> = ({ item }) => (
    <Link
      to={item.path}
      className={`
        flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 group
        ${isActive(item.path) 
          ? 'bg-primary/10 text-primary font-medium' 
          : `${mode === 'light' ? 'text-gray-500 hover:bg-gray-100 hover:text-gray-900' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'}`}
      `}
      onClick={() => setIsMobileOpen(false)}
    >
      <item.icon size={20} className={isActive(item.path) ? 'text-primary' : `${mode === 'light' ? 'text-gray-400 group-hover:text-gray-600' : 'text-slate-500 group-hover:text-slate-300'}`} />
      {(!isCollapsed || isMobileOpen) && (
        <span className="flex-1 truncate">{item.label}</span>
      )}
      {item.badge !== undefined && item.badge > 0 && (!isCollapsed || isMobileOpen) && (
        <span className="bg-primary/20 text-primary text-[10px] font-bold px-1.5 py-0.5 rounded-full">
          {item.badge}
        </span>
      )}
      {isCollapsed && !isMobileOpen && item.badge !== undefined && item.badge > 0 && (
        <div className={`absolute top-1 right-1 w-2 h-2 bg-primary rounded-full border-2 ${mode === 'light' ? 'border-white' : 'border-slate-900'}`} />
      )}
    </Link>
  );

  return (
    <>
      {/* Mobile Toggle */}
      <button 
        className={`lg:hidden fixed top-4 left-4 z-50 p-2 rounded-lg border shadow-sm ${mode === 'light' ? 'bg-white border-gray-200 text-gray-900' : 'bg-slate-900 border-slate-700 text-slate-100'}`}
        onClick={() => setIsMobileOpen(!isMobileOpen)}
      >
        {isMobileOpen ? <X size={24} /> : <Menu size={24} />}
      </button>

      {/* Backdrop */}
      <AnimatePresence>
        {isMobileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
            onClick={() => setIsMobileOpen(false)}
          />
        )}
      </AnimatePresence>

      <motion.aside
        variants={sidebarVariants}
        animate={isCollapsed ? 'collapsed' : 'expanded'}
        className={`
          fixed top-0 left-0 h-full border-r z-40
          hidden lg:flex flex-col transition-colors duration-300
          ${mode === 'light' ? 'bg-white border-gray-200' : 'bg-slate-950 border-slate-800'}
        `}
      >
        <div className={`p-6 flex items-center justify-between border-b ${mode === 'light' ? 'border-gray-100' : 'border-slate-800'}`}>
          {(!isCollapsed) && (
            <div className="flex items-center gap-2 font-bold text-xl text-primary font-sans italic">
              <Church className="text-primary fill-primary/10" />
              <span>ECCLESIA</span>
            </div>
          )}
          {isCollapsed && (
             <Church className="mx-auto text-primary" />
          )}
        </div>

        <div className="flex-1 overflow-y-auto py-6 px-3 space-y-1">
          {menuItems.map((item) => (
            <NavLink key={item.id} item={item} />
          ))}
        </div>

        <div className={`p-4 border-t space-y-1 ${mode === 'light' ? 'border-gray-100' : 'border-slate-800'}`}>
          <div className="flex items-center gap-2 px-1 mb-2">
             <ThemeToggle />
             {!isCollapsed && <span className={`text-sm font-medium ${mode === 'light' ? 'text-gray-500' : 'text-slate-400'}`}>{mode === 'light' ? 'Light Mode' : 'Dark Mode'}</span>}
          </div>

          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all ${mode === 'light' ? 'text-gray-500 hover:bg-gray-100' : 'text-slate-400 hover:bg-slate-800'}`}
          >
            {isCollapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
            {!isCollapsed && <span>Collapse</span>}
          </button>
          
          <button
            onClick={handleLogout}
            className={`w-full flex items-center gap-3 px-3 py-2 text-red-500 rounded-lg transition-all ${mode === 'light' ? 'hover:bg-red-50' : 'hover:bg-red-900/10'}`}
          >
            <LogOut size={20} />
            {!isCollapsed && <span>Logout</span>}
          </button>
        </div>
      </motion.aside>

      {/* Mobile Drawer */}
      <AnimatePresence>
        {isMobileOpen && (
          <motion.aside
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            className={`fixed top-0 left-0 h-full w-full max-w-[280px] z-50 flex flex-col lg:hidden ${mode === 'light' ? 'bg-white' : 'bg-slate-950'}`}
          >
            <div className={`p-6 flex items-center justify-between border-b ${mode === 'light' ? 'border-gray-100' : 'border-slate-800'}`}>
              <div className="flex items-center gap-2 font-bold text-xl text-primary font-sans italic">
                <Church className="text-primary fill-primary/10" />
                <span>ECCLESIA</span>
              </div>
              <button 
                onClick={() => setIsMobileOpen(false)}
                className={mode === 'light' ? 'text-gray-500' : 'text-slate-400'}
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-6 px-3 space-y-1">
              {menuItems.map((item) => (
                <NavLink key={item.id} item={item} />
              ))}
            </div>

            <div className={`p-4 border-t ${mode === 'light' ? 'border-gray-100' : 'border-slate-800'}`}>
              <div className="flex items-center gap-2 px-1 mb-4">
                 <ThemeToggle />
                 <span className={`text-sm font-medium ${mode === 'light' ? 'text-gray-500' : 'text-slate-400'}`}>{mode === 'light' ? 'Light Mode' : 'Dark Mode'}</span>
              </div>

              <button
                onClick={handleLogout}
                className={`w-full flex items-center gap-3 px-3 py-2 text-red-500 rounded-lg transition-all ${mode === 'light' ? 'hover:bg-red-50' : 'hover:bg-red-900/10'}`}
              >
                <LogOut size={20} />
                <span>Logout</span>
              </button>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
};

export default SuperAdminSidebar;
