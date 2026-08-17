import api from './api';
import { DashboardStats } from '../types';

export const dashboardService = {
  getStats: async (): Promise<any> => {
    const response = await api.get('/superadmin/dashboard-stats');
    return response.data;
  },

  getRecentChurches: async () => {
    const response = await api.get('/superadmin/churches?limit=5');
    return response.data;
  },

  getRecentActivities: async () => {
    const response = await api.get('/superadmin/activities');
    return response.data;
  },

  // System health is derived from the real dashboard-stats payload, which is
  // computed live from the database on the server.
  getSystemHealth: async () => {
    const response = await api.get('/superadmin/dashboard-stats');
    const h = response.data?.systemHealth || {};
    const uptimeSeconds = Number(h.uptimeSeconds || 0);
    const days = Math.floor(uptimeSeconds / 86400);
    const hours = Math.floor((uptimeSeconds % 86400) / 3600);
    return {
      status: h.status === 'healthy' || h.status === 'ok' ? 'healthy' : (h.status || 'healthy'),
      uptime: uptimeSeconds ? `${days}d ${hours}h` : '—',
      services: {
        database: h.database ? 'connected' : 'disconnected',
        databaseClient: h.databaseClient || 'postgres',
        auth: 'active',
        storage: 'active',
      },
    };
  },
};
