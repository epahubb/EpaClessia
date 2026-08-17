import api from './api';
import { 
  PrayerRequest, VisitationRecord, CounselingRecord, 
  Member 
} from '../types';

export const pastorService = {
  getDashboardStats: async () => {
    const response = await api.get('/pastor/dashboard/stats');
    return response.data;
  },

  // Member Care
  searchMembers: async (query: string) => {
    const response = await api.get('/pastor/members/search', { params: { q: query } });
    return response.data;
  },
  getMemberProfile: async (id: string) => {
    const response = await api.get(`/pastor/members/${id}/profile`);
    return response.data;
  },
  addPastoralNote: async (memberId: string, note: string) => {
    const response = await api.post(`/pastor/members/${memberId}/notes`, { note });
    return response.data;
  },

  // Prayer Requests
  getPrayerRequests: async (params?: any) => {
    const response = await api.get('/pastor/prayers', { params });
    return response.data;
  },
  createPrayerRequest: async (data: any) => {
    const response = await api.post('/pastor/prayers', data);
    return response.data;
  },
  updatePrayerRequest: async (id: string, data: Partial<PrayerRequest>) => {
    const response = await api.put(`/pastor/prayers/${id}`, data);
    return response.data;
  },

  // Visitations
  getVisitations: async (params?: any) => {
    const response = await api.get('/pastor/visitations', { params });
    return response.data;
  },
  recordVisitation: async (data: Partial<VisitationRecord>) => {
    const response = await api.post('/pastor/visitations', data);
    return response.data;
  },
  updateVisitation: async (id: string, data: any) => {
    const response = await api.put(`/pastor/visitations/${id}`, data);
    return response.data;
  },

  // Counseling
  getCounselingSessions: async (params?: any) => {
    const response = await api.get('/pastor/counseling', { params });
    return response.data;
  },
  recordCounseling: async (data: Partial<CounselingRecord>) => {
    const response = await api.post('/pastor/counseling', data);
    return response.data;
  },
  updateCounseling: async (id: string, data: any) => {
    const response = await api.put(`/pastor/counseling/${id}`, data);
    return response.data;
  },
  getReports: async () => {
    const response = await api.get('/pastor/reports/overview');
    return response.data;
  }
};
