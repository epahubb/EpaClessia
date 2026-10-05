import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';
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

  const applyAccount = (account: User) => {
    const context = buildDefaultContext(account);
    localStorage.setItem('user', JSON.stringify(account));
    if (context) localStorage.setItem('currentContext', JSON.stringify(context));
    else localStorage.removeItem('currentContext');
    setUser(account); setCurrentContext(context);
  };

  useEffect(() => {
    let stopped = false;
    const restore = async () => {
      const stored = localStorage.getItem('user');
      const storedToken = localStorage.getItem('token');
      if (stored && storedToken) {
        try {
          const cached = JSON.parse(stored);
          if (localStorage.getItem('original_sa_token')) {
            if (!stopped) applyAccount(cached);
          } else {
            try {
              const { data } = await api.get('/auth/me');
              if (!stopped && localStorage.getItem('token') === storedToken) applyAccount(data.user);
            } catch (error: any) {
              if (!stopped && ![401, 403].includes(error?.response?.status)) applyAccount(cached);
              else if (!stopped) { localStorage.removeItem('user'); localStorage.removeItem('token'); localStorage.removeItem('currentContext'); }
            }
          }
        } catch { localStorage.removeItem('user'); localStorage.removeItem('token'); }
      }
      if (!stopped) setIsLoading(false);
    };
    void restore();
    return () => { stopped = true; };
  }, []);

  // A role changed by an admin is reflected without making the user sign out.
  // Backend permissions use persisted state on every request; this refreshes UI.
  useEffect(() => {
    if (!user?.id || localStorage.getItem('original_sa_token')) return;
    let stopped = false, running = false;
    const refresh = async () => {
      if (stopped || running || document.visibilityState === 'hidden') return;
      running = true;
      try {
        const { data } = await api.get('/auth/me');
        if (!stopped && localStorage.getItem('token')) applyAccount(data.user);
      } catch (error: any) {
        if (!stopped && [401, 403].includes(error?.response?.status)) {
          localStorage.removeItem('user'); localStorage.removeItem('token'); localStorage.removeItem('currentContext'); localStorage.removeItem('refresh_token');
          setUser(null); setCurrentContext(null);
        }
      } finally { running = false; }
    };
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh(); };
    const interval = window.setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    window.addEventListener('epaclessia:account-changed', refresh);
    document.addEventListener('visibilitychange', onVisible);
    return () => { stopped = true; window.clearInterval(interval); window.removeEventListener('focus', refresh); window.removeEventListener('epaclessia:account-changed', refresh); document.removeEventListener('visibilitychange', onVisible); };
  }, [user?.id]);

  const login = async (accessToken: string, user: User, refreshToken?: string) => {
    localStorage.setItem('token', accessToken);
    if (refreshToken) {
      localStorage.setItem('refresh_token', refreshToken);
    }
    applyAccount(user);
  };

  const logout = () => {
    // Ask the server to clear the httpOnly `token` / `refreshToken` cookies,
    // which this code cannot touch itself. Fire-and-forget with a bare fetch:
    // it must not go through the axios interceptor (which reacts to 401s by
    // forcing a redirect), and local state must be cleared even if the request
    // fails. `keepalive` lets it survive the navigation that follows.
    try {
      const base = import.meta.env.VITE_API_URL || '/api/v1';
      void fetch(`${base}/auth/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token') || localStorage.getItem('access_token') || ''}` },
        body: JSON.stringify({ refreshToken: localStorage.getItem('refresh_token') }),
        credentials: 'include',
        keepalive: true,
      }).catch(() => {});
    } catch (e) {
      // Never block signing out on a network failure.
    }

    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    // These two were left behind before: the active tenant context, and the
    // super admin's own token stashed while impersonating a church.
    localStorage.removeItem('currentContext');
    localStorage.removeItem('original_sa_token');
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
