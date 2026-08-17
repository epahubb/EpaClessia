import api from './api';
import { Tenant } from '../types';

// Normalizes list responses that may be a raw array or { data, pagination }.
const unwrapList = (payload: any): any[] => {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.data)) return payload.data;
  return [];
};

export const churchService = {
  // Reads the selected image and returns a base64 data URL that can be stored
  // directly on the tenant record (works without external object storage).
  uploadLogo: async (file: File, _tenantId: string): Promise<string> => {
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Failed to read image file'));
      reader.readAsDataURL(file);
    });
  },
  getAll: async (params?: any) => {
    const response = await api.get('/superadmin/churches', { params });
    return unwrapList(response.data);
  },
  getAllPaged: async (params?: any) => {
    const response = await api.get('/superadmin/churches', { params });
    return response.data;
  },
  getById: async (id: string) => {
    const response = await api.get(`/superadmin/churches/${id}`);
    return response.data;
  },
  create: async (data: Partial<Tenant>) => {
    const response = await api.post('/superadmin/churches', data);
    return response.data;
  },
  update: async (id: string, data: Partial<Tenant>) => {
    const response = await api.put(`/superadmin/churches/${id}`, data);
    return response.data;
  },
  delete: async (id: string) => {
    const response = await api.delete(`/superadmin/churches/${id}`);
    return response.data;
  },
  subscribeToChurches: (callback: (churches: Tenant[]) => void) => {
    // Lightweight near-real-time updates via polling.
    const interval = setInterval(async () => {
      try {
        const churches = await churchService.getAll();
        callback(churches as Tenant[]);
      } catch (e) {
        console.error('Polling error', e);
      }
    }, 5000);
    return () => clearInterval(interval);
  }
};
