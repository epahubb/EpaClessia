export * from './church';

export type UserRole = 'SUPER_ADMIN' | 'CHURCH_ADMIN' | 'PASTOR' | 'MINISTRY_LEADER' | 'MEMBER';

export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  role: UserRole;
  roles: TenantRole[];
  tenantId?: string;
  tenant?: {
    id: string;
    name: string;
  };
  status: 'active' | 'locked';
  lastLogin?: string;
  isLocked?: boolean;
}

export interface TenantRole {
  id: string;
  userId: string;
  userName: string;
  tenantId: string;
  tenantName: string;
  role: UserRole;
}

export interface LoginLog {
  id: string;
  userId?: string;
  userName?: string;
  email: string;
  timestamp: string;
  ipAddress: string;
  success: boolean;
}

export interface AuditLog {
  id: string;
  userId: string;
  userName: string;
  action: string;
  targetUserId?: string;
  targetUserName?: string;
  timestamp: string;
  ipAddress: string;
  details: string;
}

export interface Permission {
  id: string;
  name: string;
  code: string;
  description: string;
}

export interface RolePermission {
  role: UserRole;
  permissions: Permission[];
}

export interface Tenant {
  id: string;
  name: string;
  status: 'active' | 'suspended' | 'pending';
  planId: string;
  createdAt: string;
  adminEmail: string;
  phone: string;
  country: string;
  city: string;
  street: string;
  logo?: string;
}

export interface SubscriptionPlan {
  id: string;
  name: string;
  price: number;
  billingCycle: 'monthly' | 'yearly';
  features: Record<string, any>;
  maxMembers: number;
}

export interface Subscription {
  id: string;
  tenantId: string;
  tenantName: string;
  planId: string;
  planName: string;
  startDate: string;
  endDate: string;
  status: 'active' | 'expired';
  autoRenew: boolean;
}

export interface Transaction {
  id: string;
  tenantId: string;
  tenantName: string;
  amount: number;
  date: string;
  planName: string;
  status: 'success' | 'failed' | 'refunded';
  invoiceUrl: string;
}

export interface DashboardStats {
  totalChurches: number;
  totalMembers: number;
  activeUsers30d: number;
  platformRevenue: number;
  activeSubscriptions: number;
  expiringSubscriptions: number;
  recentRegistrations: Tenant[];
  systemHealth: {
    db: 'green' | 'yellow' | 'red';
    storage: 'green' | 'yellow' | 'red';
    api: 'green' | 'yellow' | 'red';
  };
  recentActivities: Activity[];
}

export interface Activity {
  id: string;
  userId: string;
  userName: string;
  action: string;
  timestamp: string;
  tenantId?: string;
}

export interface SupportTicket {
  id: string;
  tenantId: string;
  tenantName: string;
  subject: string;
  status: 'open' | 'resolved';
  createdAt: string;
}
