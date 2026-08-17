import api from './api';
import { User, TenantRole } from '../types';

export const userService = {
  getAll: async () => {
    const response = await api.get('/superadmin/users');
    return response.data;
  },
  
  createSuperAdmin: async (data: any) => {
    const response = await api.post('/superadmin/users', { ...data, role: 'SUPER_ADMIN' });
    return response.data;
  },
  
  update: async (id: string, data: any) => {
    const response = await api.put(`/superadmin/users/${id}`, data);
    return response.data;
  },
  
  lock: async (id: string) => {
    const response = await api.post(`/superadmin/users/${id}/lock`);
    return response.data;
  },
  
  unlock: async (id: string) => {
    const response = await api.post(`/superadmin/users/${id}/unlock`);
    return response.data;
  },
  
  delete: async (id: string) => {
    const response = await api.delete(`/superadmin/users/${id}`);
    return response.data;
  },
  
  getUserTenantRoles: async () => {
    const response = await api.get('/superadmin/user-tenant-roles');
    return response.data;
  },
  
  assignChurchAdmin: async (data: { userId: string; tenantId: string; role: string }) => {
    const response = await api.post('/superadmin/user-tenant-roles', data);
    return response.data;
  },
  
  removeChurchAdmin: async (id: string) => {
    const response = await api.delete(`/superadmin/user-tenant-roles/${id}`);
    return response.data;
  },
  
  resetPassword: async (id: string, data: any) => {
    const response = await api.post(`/superadmin/users/${id}/reset-password`, data);
    return response.data;
  },
  
  subscribeToUsers: (callback: (users: User[]) => void) => {
    const interval = setInterval(async () => {
      try {
        const users = await userService.getAll();
        callback(users);
      } catch (e) {
        console.error("Polling error", e);
      }
    }, 5000);
    return () => clearInterval(interval);
  }
};
