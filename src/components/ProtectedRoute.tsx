import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth, UserRole } from '../contexts/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: UserRole[];
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, allowedRoles }) => {
  const { isAuthenticated, currentContext, isLoading } = useAuth();
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

  if (allowedRoles && currentContext && !allowedRoles.includes(currentContext.role)) {
    // Redirect to their appropriate dashboard if they try to access a route they don't have permission for
    const defaultPath = getDefaultPath(currentContext.role);
    return <Navigate to={defaultPath} replace />;
  }

  return <>{children}</>;
};

const getDefaultPath = (role: UserRole) => {
  switch (role) {
    case 'SUPER_ADMIN': return '/super-admin';
    case 'CHURCH_ADMIN': return '/church/dashboard';
    case 'PASTOR': return '/pastor/dashboard';
    case 'MINISTRY_LEADER': return '/ministry/dashboard';
    case 'MEMBER': return '/member/dashboard';
    default: return '/login';
  }
};

export default ProtectedRoute;
