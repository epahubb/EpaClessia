import api from './api';

export const reportService = {
  getOverview: async () => {
    const response = await api.get('/superadmin/reports/overview');
    return response.data;
  }
};
