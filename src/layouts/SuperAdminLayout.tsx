import React, { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import SuperAdminSidebar from '../components/SuperAdminSidebar';
import { User } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useColorMode } from '../contexts/ThemeContext';

const SuperAdminLayout: React.FC = () => {
  const { user, isLoading } = useAuth();
  const location = useLocation();
  const { mode } = useColorMode();

  if (isLoading) {
    return (
      <div className={`flex items-center justify-center h-screen ${mode === 'light' ? 'bg-gray-50' : 'bg-slate-900'}`}>
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (user.role !== 'SUPER_ADMIN') {
    return <Navigate to="/unauthorized" replace />;
  }

  return (
    <div className={`flex min-h-screen ${mode === 'light' ? 'bg-gray-50' : 'bg-slate-950 text-slate-100'}`}>
      <SuperAdminSidebar />
      <main className="flex-1 lg:ml-[260px] transition-all duration-300">
        <div className="p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default SuperAdminLayout;
