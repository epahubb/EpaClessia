import api from './api';
import { Transaction, Fund } from '../types/church';

/**
 * Church finance service.
 *
 * Delegates to the shared authenticated axios client (`api.ts`) which targets
 * `/api/v1` and attaches the Bearer token + tenant headers. The previous
 * standalone axios instance here used the wrong base URL and token key and
 * produced 401s. Do not reintroduce a separate axios client.
 */
export const financeService = {
  getTransactions: async (params?: any) => {
    const response = await api.get<Transaction[]>('/church/transactions', { params });
    return response.data;
  },

  getFunds: async () => {
    const response = await api.get<Fund[]>('/church/funds');
    return response.data;
  },

  recordTransaction: async (data: Partial<Transaction>) => {
    const response = await api.post<Transaction>('/church/transactions', data);
    return response.data;
  },

  getFinanceSummary: async () => {
    const response = await api.get('/church/finances/summary');
    return response.data;
  },
};

export default financeService;
