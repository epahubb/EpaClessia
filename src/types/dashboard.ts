export interface DashboardStats {
  totalRevenue: number;
  revenueChangePercent: number;
  totalChurches: number;
  activeSubscriptions: number;
}

export interface SubscriptionPlan {
  id: string;
  name: string;
  churchCount: number;
  revenue: number;
  status: 'Active' | 'Suspended';
}

export interface SystemUsage {
  storageUsedGB: number;
  storageTotalGB: number;
  apiCallsUsed: number;
  apiCallsTotal: number;
}

export interface RecentActivity {
  id: string;
  tenant: string;
  activity: string;
  amount?: number;
  status: 'Success' | 'Pending' | 'Failed';
  timestamp: string;
}

export interface IncomeTrendData {
  month: string;
  income: number;
  expenses: number;
}

export interface SuperAdminDashboardData {
  stats: DashboardStats;
  subscriptionPlans: SubscriptionPlan[];
  systemUsage: SystemUsage;
  recentActivities: RecentActivity[];
  incomeTrend: IncomeTrendData[];
}
