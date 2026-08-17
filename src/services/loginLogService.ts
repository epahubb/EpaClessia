import api from './api';
import { LoginLog } from '../types';

export const loginLogService = {
  getAll: async (params?: any) => {
    const response = await api.get<LoginLog[]>('/superadmin/login-logs/', { params });
    return response.data;
  }
};
