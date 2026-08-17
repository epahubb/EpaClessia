import api from './api';
import { DashboardStats, Tenant, User, Activity, SupportTicket } from '../types';

export const superAdminService = {
  getStats: async (): Promise<DashboardStats> => {
    const response = await api.get('/superadmin/dashboard-stats');
    return response.data;
  },

  getTenants: async (page = 1, limit = 10): Promise<{ data: Tenant[], pagination: any }> => {
    const response = await api.get('/superadmin/churches', { params: { page, limit } });
    return response.data;
  },

  getUsers: async (page = 1, limit = 10): Promise<{ data: User[], pagination: any }> => {
    const response = await api.get('/superadmin/users', { params: { page, limit } });
    return response.data;
  },

  getActivities: async (): Promise<Activity[]> => {
    const response = await api.get('/superadmin/activities');
    return response.data;
  },

  getAuditLogs: async (): Promise<any[]> => {
    const response = await api.get('/superadmin/audit-logs');
    return response.data;
  },

  getSupportTickets: async (): Promise<SupportTicket[]> => {
    const response = await api.get('/superadmin/support-tickets');
    return response.data;
  }
};
