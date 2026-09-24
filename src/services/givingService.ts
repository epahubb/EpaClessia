import api from './api';

export interface GivingRecord {
  id: number;
  amount: number;
  currency: string;
  purpose: string;
  paymentMethod: string;
  status: string;
  reference?: string | null;
  donorName?: string;
  createdAt: string;
}

export interface GivingSummary {
  thisYear: number;
  allTime: number;
  count: number;
  lastGiftAmount: number | null;
  lastGiftDate: string | null;
  currency: string;
}

export interface GivingResponse {
  data: GivingRecord[];
  summary: GivingSummary;
  byPurpose: Record<string, number>;
}

export interface StatementGift {
  date: string;
  amount: number;
  purpose: string;
  method: string;
  reference: string | null;
}

export interface StatementResponse {
  year: number;
  currency: string;
  total: number;
  count: number;
  generatedAt: string;
  donor: { name: string; email: string | null };
  church: { name: string };
  gifts: StatementGift[];
}

export interface InitializeResponse {
  authorizationUrl?: string;
  reference: string;
  accessCode?: string;
  amount?: number;
  serviceCharge?: number;
  totalPayable?: number;
}

export interface VerifyResponse {
  status: 'completed' | 'failed';
  reference: string;
  amount: number;
  purpose: string;
}

export const givingService = {
  getGiving: async (): Promise<GivingResponse> => {
    const res = await api.get<GivingResponse>('/member/giving');
    return res.data;
  },

  getPledges: async (): Promise<any[]> => {
    const res = await api.get('/member/pledges');
    return res.data?.data || [];
  },

  createPledge: async (payload: { amountPledged: number; purpose?: string; dueDate?: string | null }): Promise<any> => {
    const res = await api.post('/member/pledges', payload);
    return res.data;
  },

  getDues: async (): Promise<{ schedules: any[]; payments: any[]; serviceCharge: { enabled: boolean; percent: number; flat: number; cap: number } }> => {
    const res = await api.get('/member/dues');
    return res.data;
  },

  initializeDuesPayment: async (duesId: string, callbackUrl: string): Promise<InitializeResponse> => {
    const res = await api.post(`/member/dues/${duesId}/initialize`, { callbackUrl });
    return res.data;
  },

  verifyDuesPayment: async (reference: string): Promise<any> => {
    const res = await api.get(`/member/dues/verify/${encodeURIComponent(reference)}`);
    return res.data;
  },

  initialize: async (payload: {
    amount: number;
    purpose?: string;
    callbackUrl?: string;
  }): Promise<InitializeResponse> => {
    const res = await api.post<InitializeResponse>('/member/giving/initialize', payload);
    return res.data;
  },

  verify: async (reference: string): Promise<VerifyResponse> => {
    const res = await api.get<VerifyResponse>(
      `/member/giving/verify/${encodeURIComponent(reference)}`,
    );
    return res.data;
  },

  getStatement: async (year: number): Promise<StatementResponse> => {
    const res = await api.get<StatementResponse>('/member/giving/statement', {
      params: { year },
    });
    return res.data;
  },
};

export default givingService;
