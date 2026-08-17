import api from './api';
import { 
  Member, Family, Fund, FinanceTransaction, 
  Event, Ministry, AttendanceRecord 
} from '../types';

export const churchAdminService = {
  // Dashboard
  getDashboardStats: async () => {
    const response = await api.get('/church/dashboard/stats');
    return response.data;
  },

  // Members
  getMembers: async (params?: any) => {
    const response = await api.get('/church/members', { params });
    return response.data;
  },
  getMember: async (id: string) => {
    const response = await api.get(`/church/members/${id}`);
    return response.data;
  },
  createMember: async (data: Partial<Member>) => {
    const response = await api.post('/church/members', data);
    return response.data;
  },
  updateMember: async (id: string, data: Partial<Member>) => {
    const response = await api.put(`/church/members/${id}`, data);
    return response.data;
  },

  // Families
  getFamilies: async () => {
    const response = await api.get('/church/families');
    return response.data;
  },
  createFamily: async (data: Partial<Family>) => {
    const response = await api.post('/church/families', data);
    return response.data;
  },

  // Finance
  getFunds: async () => {
    const response = await api.get('/church/finance/funds');
    return response.data;
  },
  getTransactions: async (params?: any) => {
    const response = await api.get('/church/finance/transactions', { params });
    return response.data;
  },
  recordTransaction: async (data: Partial<FinanceTransaction>) => {
    const response = await api.post('/church/finance/transactions', data);
    return response.data;
  },

  // Events
  getEvents: async () => {
    const response = await api.get('/church/events');
    return response.data;
  },
  createEvent: async (data: Partial<Event>) => {
    const response = await api.post('/church/events', data);
    return response.data;
  },

  // Ministries
  getMinistries: async () => {
    const response = await api.get('/church/ministries');
    return response.data;
  },

  // Attendance
  recordAttendance: async (data: Partial<AttendanceRecord>) => {
    const response = await api.post('/church/attendance', data);
    return response.data;
  },

  // Settings
  getSettings: async () => {
    const response = await api.get('/church/settings');
    return response.data;
  },
  updateSettings: async (data: any) => {
    const response = await api.put('/church/settings', data);
    return response.data;
  }
};
