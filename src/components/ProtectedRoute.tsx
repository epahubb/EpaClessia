import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth, UserRole } from '../contexts/AuthContext';
import { pathForRole } from './RoleLanding';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: UserRole[];
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, allowedRoles }) => {
  const { isAuthenticated, currentContext, isLoading, user } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-900">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // `currentContext` is null for any role without an explicit roles array, so
  // fall back to the user's own role. Relying on currentContext alone silently
  // skipped this check and let, for example, a church admin render the
  // super-admin shell -- which then failed with a server 403 and no way back.
  const effectiveRole = (currentContext?.role || (user as any)?.role || null) as UserRole | null;

  if (allowedRoles && effectiveRole && !allowedRoles.includes(effectiveRole)) {
    // Send them to their own dashboard instead of a screen they cannot load.
    return <Navigate to={pathForRole(effectiveRole)} replace />;
  }

  // A signed-in session with no recognisable role is broken, not privileged.
  if (allowedRoles && !effectiveRole) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
