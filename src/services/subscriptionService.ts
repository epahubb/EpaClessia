import api from './api';

export const subscriptionService = {
  getPlans: async () => {
    const response = await api.get('/superadmin/subscription-plans/');
    return response.data;
  },
  createPlan: async (data: any) => {
    const response = await api.post('/superadmin/subscription-plans', data);
    return response.data;
  },
  updatePlan: async (id: string, data: any) => {
    const response = await api.put(`/superadmin/subscription-plans/${id}`, data);
    return response.data;
  },
  deletePlan: async (id: string) => {
    const response = await api.delete(`/superadmin/subscription-plans/${id}`);
    return response.data;
  },
  getChurchSubscriptions: async () => {
    const response = await api.get('/superadmin/church-subscriptions/');
    return response.data;
  },
  getTransactions: async () => {
    const response = await api.get('/superadmin/transactions/');
    return response.data;
  },
  getRevenueMonthly: async () => {
    const response = await api.get('/superadmin/revenue/monthly/');
    return response.data;
  },
  getGrowthMonthly: async () => {
    const response = await api.get('/superadmin/growth/monthly/');
    return response.data;
  }
};
