import type { DenominationId } from '../lib/denominations';

export type PlanId = 'free_trial' | 'basic' | 'pro' | 'enterprise';
export type ChurchStatus = 'active' | 'trial' | 'suspended' | 'deleted';

export interface FeatureFlags {
  giving: boolean;
  childCheckin: boolean;
  sms: boolean;
  api: boolean;
}

export interface Church {
  id: string;
  name: string;
  status: ChurchStatus;
  planId: PlanId;
  adminEmail: string;
  contactEmail?: string;
  phone?: string;
  timezone?: string;
  country?: string;
  city?: string;
  street?: string;
  address?: string;
  logo?: string;
  websiteUrl?: string;
  // Chosen by the superadmin at registration; decides the church admin portal.
  // Optional because churches registered before this field existed have none,
  // and those fall back to the default portal.
  denomination?: DenominationId;
  featureFlags: FeatureFlags | string; // Can be object or stringified JSON
  trialEndDate?: string;
  subscriptionEndDate?: string;
  createdAt: string;
  memberCount?: number;
}

export interface ChurchWithAdmin extends Church {
  adminName: string;
  adminPassword?: string;
  sendWelcomeEmail?: boolean;
}

// Added to fix breakage in other parts of the app
export type MemberStatus = 'ACTIVE' | 'VISITOR' | 'INACTIVE';

export interface Member {
  id: string;
  first_name: string;
  last_name: string;
  firstName?: string; // Compatibility
  lastName?: string; // Compatibility
  email: string;
  phone: string;
  address?: string;
  birth_date?: string;
  membership_date?: string;
  status: MemberStatus;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  spiritual_gifts?: string[];
  skills?: string[];
  occupation?: string;
  photoUrl?: string;
  ministries?: string[];
  createdAt?: string;
}

export interface Family {
  id: string;
  name: string;
  members: string[];
}

export interface Fund {
  id: string;
  name: string;
  description?: string;
  target?: number;
}

export interface FinanceTransaction {
  id: string;
  date: string;
  amount: number;
  type: 'INCOME' | 'EXPENSE';
  fundId?: string;
  category: string;
  description: string;
}

export type Transaction = FinanceTransaction; // Alias

export interface Event {
  id: string;
  title: string;
  description: string;
  date: string;
  location: string;
}

export interface Ministry {
  id: string;
  name: string;
  leaderId: string;
}

export interface AttendanceRecord {
  id: string;
  date: string;
  count: number;
}

export interface Task {
  id: string;
  title: string;
  status: string;
}

export interface MinistryMember {
  id: string;
  name: string;
}

export interface PrayerRequest {
  id: string;
  content: string;
}

export interface VisitationRecord {
  id: string;
}

export interface CounselingRecord {
  id: string;
}
