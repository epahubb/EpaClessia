import api from './api';

/**
 * Member-facing engagement APIs: prayer wall, ministry groups, sermon library,
 * and the opt-in church directory. All are tenant-scoped on the server and
 * built on the shared axios client (Bearer token + X-Tenant-ID headers).
 */

export interface PrayerRequest {
  id: string;
  requesterName: string;
  request: string;
  category: string;
  status: string;
  isPrivate?: boolean;
  createdAt: string;
}

export interface PrayerFeed {
  mine: PrayerRequest[];
  wall: PrayerRequest[];
}

export interface MemberGroup {
  id: string;
  name: string;
  type?: string;
  description?: string;
  leaderName?: string;
  meetingDay?: string;
  meetingTime?: string;
  location?: string;
  memberCount: number;
  joined: boolean;
}

export interface Sermon {
  id: string;
  title: string;
  speaker?: string;
  seriesName?: string;
  description?: string;
  scripture?: string;
  videoUrl?: string;
  audioUrl?: string;
  notesUrl?: string;
  thumbnailUrl?: string;
  date?: string;
  durationMinutes?: number;
  tags?: string;
}

export interface DirectoryEntry {
  id: string;
  name: string;
  photoUrl?: string | null;
  occupation?: string | null;
  phone?: string | null;
  email?: string | null;
}

export interface DirectoryPreferences {
  hasProfile: boolean;
  directoryOptIn: boolean;
  directoryShowPhone: boolean;
  directoryShowEmail: boolean;
}

export const memberEngagementService = {
  // Prayer
  getPrayers: async (): Promise<PrayerFeed> => {
    const res = await api.get<PrayerFeed>('/member/prayers');
    return res.data;
  },
  submitPrayer: async (payload: {
    request: string;
    category?: string;
    isPrivate?: boolean;
    anonymous?: boolean;
  }): Promise<PrayerRequest> => {
    const res = await api.post<PrayerRequest>('/member/prayers', payload);
    return res.data;
  },

  // Groups
  getGroups: async (): Promise<MemberGroup[]> => {
    const res = await api.get<MemberGroup[]>('/member/groups');
    return res.data;
  },
  joinGroup: async (id: string) => {
    const res = await api.post(`/member/groups/${id}/join`);
    return res.data;
  },
  leaveGroup: async (id: string) => {
    const res = await api.post(`/member/groups/${id}/leave`);
    return res.data;
  },

  // Sermons
  getSermons: async (): Promise<Sermon[]> => {
    const res = await api.get<{ data: Sermon[] }>('/member/sermons');
    return res.data.data || [];
  },

  // Directory
  getDirectory: async (): Promise<DirectoryEntry[]> => {
    const res = await api.get<{ data: DirectoryEntry[] }>('/member/directory');
    return res.data.data || [];
  },
  getDirectoryPreferences: async (): Promise<DirectoryPreferences> => {
    const res = await api.get<DirectoryPreferences>('/member/directory/preferences');
    return res.data;
  },
  updateDirectoryPreferences: async (payload: {
    directoryOptIn?: boolean;
    directoryShowPhone?: boolean;
    directoryShowEmail?: boolean;
  }) => {
    const res = await api.put('/member/directory/preferences', payload);
    return res.data;
  },
};

export default memberEngagementService;
