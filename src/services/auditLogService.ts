import api from './api';
import { AuditLog } from '../types';

export const auditLogService = {
  getAll: async (params?: any): Promise<AuditLog[]> => {
    const response = await api.get('/superadmin/audit-logs/', { params });
    return response.data;
  }
};
