import api from './api';

export const settingsService = {
  getSettings: async (type: string) => {
    const response = await api.get(`/superadmin/settings/${type}`);
    return response.data;
  },

  updateSettings: async (type: string, data: any) => {
    const response = await api.put(`/superadmin/settings/${type}`, data);
    return response.data;
  },

  testEmail: async () => {
    const response = await api.post('/superadmin/settings/test-email');
    return response.data;
  },

  testSms: async () => {
    const response = await api.post('/superadmin/settings/test-sms');
    return response.data;
  }
};
