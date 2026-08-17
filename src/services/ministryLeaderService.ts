import api from './api';
import { Task, Event, MinistryMember } from '../types';

export const ministryLeaderService = {
  getManagedMinistries: async () => {
    const response = await api.get('/ministry-leader/ministries');
    return response.data;
  },
  getDashboardStats: async (ministryId: string) => {
    const response = await api.get(`/ministry-leader/ministries/${ministryId}/stats`);
    return response.data;
  },

  // Members
  getMinistryMembers: async (ministryId: string) => {
    const response = await api.get(`/ministry-leader/ministries/${ministryId}/members`);
    return response.data;
  },
  addMember: async (ministryId: string, data: Partial<MinistryMember>) => {
    const response = await api.post(`/ministry-leader/ministries/${ministryId}/members`, data);
    return response.data;
  },
  updateMember: async (memberId: string, data: Partial<MinistryMember>) => {
    const response = await api.put(`/ministry-leader/members/${memberId}`, data);
    return response.data;
  },

  // Tasks
  getTasks: async (ministryId: string) => {
    const response = await api.get(`/ministry-leader/ministries/${ministryId}/tasks`);
    return response.data;
  },
  createTask: async (ministryId: string, data: Partial<Task>) => {
    const response = await api.post(`/ministry-leader/ministries/${ministryId}/tasks`, data);
    return response.data;
  },
  updateTask: async (taskId: string, data: Partial<Task>) => {
    const response = await api.put(`/ministry-leader/tasks/${taskId}`, data);
    return response.data;
  },

  // Events
  getEvents: async (ministryId: string) => {
    const response = await api.get(`/ministry-leader/ministries/${ministryId}/events`);
    return response.data;
  },
  createEvent: async (ministryId: string, data: Partial<Event>) => {
    const response = await api.post(`/ministry-leader/ministries/${ministryId}/events`, data);
    return response.data;
  },

  // Attendance
  getAttendance: async (ministryId: string) => {
    const response = await api.get(`/ministry-leader/ministries/${ministryId}/attendance`);
    return response.data;
  },
  recordAttendance: async (ministryId: string, data: Record<string, unknown>) => {
    const response = await api.post(`/ministry-leader/ministries/${ministryId}/attendance`, data);
    return response.data;
  },

  // Reports
  getReports: async (ministryId?: string) => {
    const response = await api.get('/ministry-leader/reports/overview', {
      params: ministryId ? { ministryId } : {},
    });
    return response.data;
  }
};
