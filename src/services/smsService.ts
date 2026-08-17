import api from './api';

export interface SmsPackage {
  id: string;
  name: string;
  credits: number;
  price: number;
  currency: string;
  description?: string;
  active?: boolean;
}

export interface SmsPurchase {
  id: number;
  packageId: string;
  packageName: string;
  credits: number;
  tenantId: string;
  tenantName: string;
  amount: number;
  currency: string;
  status: string;
  reference?: string;
  createdAt: string;
}

export const smsService = {
  // Super admin: manage SMS bundle catalogue
  getPackages: async (): Promise<SmsPackage[]> => {
    const response = await api.get('/superadmin/sms-packages');
    return response.data;
  },
  createPackage: async (data: Partial<SmsPackage>) => {
    const response = await api.post('/superadmin/sms-packages', data);
    return response.data;
  },
  updatePackage: async (id: string, data: Partial<SmsPackage>) => {
    const response = await api.put(`/superadmin/sms-packages/${id}`, data);
    return response.data;
  },
  deletePackage: async (id: string) => {
    const response = await api.delete(`/superadmin/sms-packages/${id}`);
    return response.data;
  },
  // Super admin: view all purchases across churches
  getPurchases: async (): Promise<SmsPurchase[]> => {
    const response = await api.get('/superadmin/sms-purchases');
    return response.data;
  },
  getStats: async () => {
    const response = await api.get('/superadmin/sms-stats');
    return response.data;
  },
  // Record a purchase (used by a church buying a bundle)
  purchase: async (data: { packageId: string; tenantId: string; reference?: string }) => {
    const response = await api.post('/superadmin/sms-purchases', data);
    return response.data;
  }
};
