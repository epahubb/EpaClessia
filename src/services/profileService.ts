import api from './api';

export interface CommPreferences {
  email?: boolean;
  sms?: boolean;
  whatsapp?: boolean;
  announcements?: boolean;
  events?: boolean;
  giving?: boolean;
}

export interface MemberProfileData {
  id: string;
  tenantId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  gender: string | null;
  dateOfBirth: string | null;
  maritalStatus: string | null;
  anniversaryDate: string | null;
  address: string | null;
  occupation: string | null;
  photoUrl: string | null;
  membershipId: string | null;
  membershipStatus: string | null;
  approvalStatus: string | null;
  joinDate: string | null;
  familyId: string | null;
  commPreferences: CommPreferences;
}

export interface FamilyMember {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  gender: string | null;
  dateOfBirth: string | null;
}

export interface ProfileResponse {
  profile: MemberProfileData | null;
  account: { uid: string; name: string; email: string; role: string };
  church: { id: string; name: string; logo: string | null } | null;
  family: { id: string; name: string; address: string | null; phone: string | null } | null;
  familyMembers: FamilyMember[];
  hasMemberRecord: boolean;
}

export interface ProfileUpdatePayload {
  firstName?: string;
  lastName?: string;
  phone?: string | null;
  gender?: string | null;
  dateOfBirth?: string | null;
  maritalStatus?: string | null;
  anniversaryDate?: string | null;
  address?: string | null;
  occupation?: string | null;
  photoUrl?: string | null;
  commPreferences?: CommPreferences;
}

export const profileService = {
  async getProfile(): Promise<ProfileResponse> {
    const { data } = await api.get('/member/profile');
    return data;
  },
  async updateProfile(
    payload: ProfileUpdatePayload
  ): Promise<{ success: boolean; created?: boolean; profile: MemberProfileData }> {
    const { data } = await api.put('/member/profile', payload);
    return data;
  },
};

export default profileService;
