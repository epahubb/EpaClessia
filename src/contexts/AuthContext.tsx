import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, TenantRole, UserRole } from '../types';

export type { UserRole, TenantRole };

interface AuthContextType {
  user: User | null;
  currentContext: TenantRole | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (accessToken: string, user: User, refreshToken?: string) => Promise<void>;
  logout: () => void;
  switchContext: (context: TenantRole) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const buildDefaultContext = (u: User): TenantRole | null => {
  if (u.roles && u.roles.length > 0) return u.roles[0];
  if (u.role === 'SUPER_ADMIN') {
    return {
      id: 'sa-role',
      userId: u.id || (u as any).uid || 'superadmin',
      userName: u.name || 'Platform Admin',
      tenantId: 'platform',
      tenantName: 'Ecclesia Platform',
      role: 'SUPER_ADMIN',
    };
  }
  return null;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [currentContext, setCurrentContext] = useState<TenantRole | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Restore an existing session from localStorage only. No auto-login.
    const localUser = localStorage.getItem('user');
    const localToken = localStorage.getItem('token');

    if (localUser && localToken) {
      try {
        const parsedUser = JSON.parse(localUser);
        setUser(parsedUser);
        setCurrentContext(buildDefaultContext(parsedUser));
      } catch (e) {
        console.error('Local user parse failed', e);
        localStorage.removeItem('user');
        localStorage.removeItem('token');
      }
    }
    setIsLoading(false);
  }, []);

  const login = async (accessToken: string, user: User, refreshToken?: string) => {
    localStorage.setItem('token', accessToken);
    if (refreshToken) {
      localStorage.setItem('refresh_token', refreshToken);
    }
    localStorage.setItem('user', JSON.stringify(user));
    setUser(user);
    setCurrentContext(buildDefaultContext(user));
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    setUser(null);
    setCurrentContext(null);
  };

  const switchContext = (context: TenantRole) => {
    setCurrentContext(context);
  };

  return (
    <AuthContext.Provider value={{
      user,
      currentContext,
      isAuthenticated: !!user,
      isLoading,
      login,
      logout,
      switchContext,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
