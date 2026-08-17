import api from './api';

export interface MemberEvent {
  id: string;
  tenantId: string;
  title: string;
  description: string | null;
  location: string | null;
  startTime: string;
  endTime: string | null;
  category: string;
  capacity: number | null;
  requiresRegistration: boolean | number | null;
  imageUrl?: string | null;
  registeredCount: number;
  spotsLeft: number | null;
  myStatus: 'registered' | 'checked_in' | 'checked_out' | null;
  myAttendanceId: number | null;
  myCheckInCode: string | null;
}

export interface EventsResponse {
  data: MemberEvent[];
}

export interface RegisterResponse {
  success: boolean;
  alreadyRegistered?: boolean;
  attendanceId?: number;
}

export interface CheckInResponse {
  success: boolean;
  checkInCode: string;
  alreadyCheckedIn?: boolean;
  attendanceId?: number;
}

export const eventsService = {
  async getEvents(): Promise<EventsResponse> {
    const { data } = await api.get('/member/events');
    return data;
  },
  async register(eventId: string): Promise<RegisterResponse> {
    const { data } = await api.post(`/member/events/${eventId}/register`);
    return data;
  },
  async cancel(eventId: string): Promise<{ success: boolean }> {
    const { data } = await api.post(`/member/events/${eventId}/cancel`);
    return data;
  },
  async checkIn(eventId: string): Promise<CheckInResponse> {
    const { data } = await api.post(`/member/events/${eventId}/checkin`);
    return data;
  },
};

export default eventsService;
