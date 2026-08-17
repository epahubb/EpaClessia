import api from './api';

export interface Invoice {
  id: string;
  tenantId: string;
  tenantName: string;
  amount: number;
  currency: string;
  status: 'paid' | 'pending' | 'failed' | 'overdue';
  planId: string;
  billingCycle: 'monthly' | 'annually';
  paymentMethod: string;
  description: string;
  issueDate: string;
  dueDate: string;
  paidAt?: string;
}

export const billingService = {
  getStats: async () => {
    const response = await api.get('/superadmin/billing/stats');
    return response.data;
  },

  getInvoices: async (params?: { search?: string; status?: string; plan?: string; page?: number; limit?: number }) => {
    const response = await api.get('/superadmin/billing/invoices', { params });
    return response.data;
  },

  createInvoice: async (data: any) => {
    const response = await api.post('/superadmin/billing/invoices', data);
    return response.data;
  },

  payInvoice: async (id: string, data: { paymentMethod?: string; reference?: string }) => {
    const response = await api.post(`/superadmin/billing/invoices/${id}/pay`, data);
    return response.data;
  },

  refundInvoice: async (id: string) => {
    const response = await api.post(`/superadmin/billing/invoices/${id}/refund`);
    return response.data;
  },

  sendReminder: async (id: string) => {
    const response = await api.post(`/superadmin/billing/invoices/${id}/remind`);
    return response.data;
  }
};
