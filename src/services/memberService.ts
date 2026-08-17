import api from './api';
import { Member } from '../types/church';

/**
 * Church member administration service.
 *
 * NOTE: This now delegates to the shared authenticated axios client (`api.ts`),
 * which targets `/api/v1`, attaches the Bearer token from `token`, and sends the
 * active `X-Tenant-ID` / `X-User-Role` headers from `currentContext`. The older
 * standalone axios instance here used the wrong base URL and localStorage keys,
 * which produced 401s. Do not reintroduce a separate axios client.
 */
export const memberService = {
  getMembers: async (params?: any) => {
    const response = await api.get<Member[]>('/church/members', { params });
    return response.data;
  },

  getMember: async (id: string) => {
    const response = await api.get<Member>(`/church/members/${id}`);
    return response.data;
  },

  createMember: async (data: Partial<Member>) => {
    const response = await api.post<Member>('/church/members', data);
    return response.data;
  },

  updateMember: async (id: string, data: Partial<Member>) => {
    const response = await api.put<Member>(`/church/members/${id}`, data);
    return response.data;
  },

  deleteMember: async (id: string) => {
    await api.delete(`/church/members/${id}`);
  },

  getDashboardStats: async () => {
    const response = await api.get('/church/dashboard/stats');
    return response.data;
  },

  getProfile: async () => {
    const response = await api.get('/member/profile');
    return response.data;
  },

  getGivingHistory: async () => {
    const response = await api.get('/member/giving');
    return response.data;
  },

  getEvents: async () => {
    const response = await api.get('/member/events');
    return response.data;
  },

  getPrayerRequests: async () => {
    const response = await api.get('/member/prayers');
    return response.data;
  },
};

export default memberService;
