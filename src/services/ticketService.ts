import api from './api';

export interface Ticket {
  id: number;
  ticketNumber: string;
  subject: string;
  message: string;
  category: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  tenantId?: string;
  tenantName?: string;
  userUid?: string;
  userName?: string;
  userEmail?: string;
  assignedTo?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TicketReply {
  id?: number;
  ticketId: number;
  authorUid?: string;
  authorName: string;
  authorRole: string;
  message: string;
  isInternalNote: boolean;
  createdAt: string;
}

export const ticketService = {
  getStats: async () => {
    const response = await api.get('/superadmin/tickets/stats');
    return response.data;
  },

  getTickets: async (params?: { search?: string; status?: string; priority?: string; category?: string }) => {
    const response = await api.get('/superadmin/support-tickets', { params });
    return response.data;
  },

  getTicketDetail: async (id: number | string) => {
    const response = await api.get(`/superadmin/tickets/${id}`);
    return response.data as { ticket: Ticket; replies: TicketReply[] };
  },

  createTicket: async (data: any) => {
    const response = await api.post('/superadmin/tickets', data);
    return response.data;
  },

  addReply: async (id: number | string, data: { message: string; isInternalNote?: boolean }) => {
    const response = await api.post(`/superadmin/tickets/${id}/replies`, data);
    return response.data;
  },

  updateStatus: async (id: number | string, data: { status?: string; priority?: string; assignedTo?: string }) => {
    const response = await api.put(`/superadmin/tickets/${id}/status`, data);
    return response.data;
  }
};
