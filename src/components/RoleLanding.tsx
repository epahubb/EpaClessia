import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

/**
 * Where a signed-in user belongs, by role.
 *
 * Exported so route guards and the landing redirect cannot drift apart: there
 * is one definition of "home" per role.
 */
export const pathForRole = (role?: string | null): string => {
  switch (role) {
    case 'SUPER_ADMIN':
      return '/super-admin';
    case 'CHURCH_ADMIN':
      return '/church/dashboard';
    case 'PASTOR':
      return '/pastor/dashboard';
    case 'MINISTRY_LEADER':
      return '/ministry/dashboard';
    case 'FINANCE':
      return '/finance/dashboard';
    case 'SECRETARY':
      return '/secretary/dashboard';
    case 'MEMBER':
      return '/member/dashboard';
    default:
      return '/login';
  }
};

/**
 * Landing redirect for `/`.
 *
 * The root URL previously pointed unconditionally at `/super-admin`, which sent
 * every visitor into the platform-admin area: signed-out users bounced around,
 * and signed-in church users hit a 403 wall from the server's super-admin guard
 * with no way back to the login screen. Routing by actual role fixes both.
 */
const RoleLanding: React.FC = () => {
  const { isAuthenticated, isLoading, currentContext, user } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-900">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // `currentContext` is null for every role that has no explicit roles array,
  // so fall back to the user's own role rather than assuming platform admin.
  const role = currentContext?.role || (user as any)?.role || null;
  return <Navigate to={pathForRole(role)} replace />;
};

export default RoleLanding;
