import api from './api';
import { RolePermission } from '../types';

export const roleService = {
  getRolePermissions: async () => {
    const response = await api.get<RolePermission[]>('/superadmin/roles-permissions/');
    return response.data;
  },
  getPermissionsCatalog: async () => {
    const response = await api.get('/superadmin/permissions-catalog');
    return response.data;
  },
  // Persist a role's permission set (array of permission codes)
  updateRolePermissions: async (role: string, permissions: string[]) => {
    const response = await api.put(`/superadmin/roles-permissions/${role}`, { permissions });
    return response.data;
  },
  // Update a specific user-in-church role + permission overrides
  updateUserRole: async (id: string, data: { role?: string; permissions?: string[] }) => {
    const response = await api.put(`/superadmin/user-tenant-roles/${id}/permissions`, data);
    return response.data;
  }
};
