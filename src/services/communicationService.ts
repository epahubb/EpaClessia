import api from './api';

export const communicationService = {
  getSupportTickets: async () => {
    const response = await api.get('/superadmin/support-tickets');
    return response.data;
  },
  getAnnouncements: async () => {
    const response = await api.get('/superadmin/announcements');
    return response.data;
  },
  createAnnouncement: async (data: any) => {
    const response = await api.post('/superadmin/announcements', data);
    return response.data;
  }
};
