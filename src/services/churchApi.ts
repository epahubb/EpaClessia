import api from './api';

/**
 * Tenant-scoped church application API. Every call is automatically locked to
 * the signed-in church (server-side) via the auth token. Backed by
 * /api/v1/church/* (src/routes/church.ts).
 */

export interface ChurchSettings {
  general: {
    churchName?: string;
    phone?: string;
    email?: string;
    address?: string;
    website?: string;
    currency?: string;
    timezone?: string;
    logo?: string;
  };
  paystack: { enabled?: boolean; publicKey?: string; secretKey?: string };
  sms: { enabled?: boolean; provider?: string; senderId?: string; apiKey?: string };
  email?: { provider?: string; host?: string; port?: string; username?: string; password?: string; fromName?: string; fromEmail?: string };
  payment?: { provider?: string; currency?: string; enableOnlineGiving?: boolean };
  integration?: { zoomApiKey?: string; googleCalendarId?: string; mailchimpKey?: string; webhookUrl?: string };
  financial?: { fiscalYearStart?: string; fiscalYearEnd?: string; currency?: string };
}

const unwrap = (r: any) =>
  Array.isArray(r) ? r : r?.data ?? r?.items ?? r?.members ?? r?.events ?? [];

export const churchApi = {
  // Settings
  getSettings: async (): Promise<ChurchSettings> => (await api.get('/church/settings')).data,
  updateSettings: async (key: string, data: any) =>
    (await api.put(`/church/settings/${key}`, data)).data,

  // Dashboard
  getDashboard: async () => (await api.get('/church/dashboard/stats')).data,

  // SMS bundles (purchase platform SMS packages)
  getSmsPackages: async () => unwrap((await api.get('/church/sms/packages')).data),
  getSmsBalance: async (): Promise<{ credits: number }> => (await api.get('/church/sms/balance')).data,
  getSmsPurchases: async () => unwrap((await api.get('/church/sms/purchases')).data),
  /**
   * Step 1 of an SMS purchase: ask Paystack for a checkout URL.
   * Send the user to `authorizationUrl`, then call `purchaseSms` with the
   * returned `reference` once they come back.
   */
  initializeSmsPurchase: async (
    packageId: string,
    callbackUrl?: string,
  ): Promise<{
    authorizationUrl: string;
    reference: string;
    accessCode?: string;
    amount?: number;
    credits?: number;
  }> =>
    (await api.post('/church/sms/purchase/initialize', { packageId, callbackUrl })).data,
  /**
   * Step 2: redeem a completed payment for credits. The `reference` is now
   * REQUIRED for any priced package -- the server verifies it with Paystack and
   * refuses to grant credits without it.
   */
  purchaseSms: async (packageId: string, reference?: string) =>
    (await api.post('/church/sms/purchase', { packageId, reference })).data,

  // Members
  getMembers: async (params?: any) => unwrap((await api.get('/church/members', { params })).data),
  createMember: async (data: any) => (await api.post('/church/members', data)).data,
  updateMember: async (id: string, data: any) => (await api.put(`/church/members/${id}`, data)).data,
  deleteMember: async (id: string) => (await api.delete(`/church/members/${id}`)).data,

  // Member photos. Images are stored in the database and streamed from a
  // dedicated endpoint, so member lists stay small and fast.
  uploadMemberPhoto: async (id: string, photo: string) =>
    (await api.post(`/church/members/${id}/photo`, { photo })).data,
  deleteMemberPhoto: async (id: string) => (await api.delete(`/church/members/${id}/photo`)).data,

  /**
   * Bulk import members from a spreadsheet.
   *
   * Pass `dryRun: true` first to get an authoritative server-side preview
   * (including duplicates already in the register) before writing anything.
   */
  importMembers: async (
    rows: Record<string, unknown>[],
    mapping: Record<string, string>,
    options?: { skipExistingEmails?: boolean; dryRun?: boolean },
  ) =>
    (
      await api.post('/church/members/import', {
        rows,
        mapping,
        skipExistingEmails: options?.skipExistingEmails ?? true,
        dryRun: options?.dryRun ?? false,
      })
    ).data,

  // Church logo (per-church branding, stored in the database)
  uploadChurchLogo: async (logo: string) =>
    (await api.post('/church/branding/logo', { logo })).data,
  deleteChurchLogo: async () => (await api.delete('/church/branding/logo')).data,

  // Families
  getFamilies: async () => unwrap((await api.get('/church/families')).data),
  createFamily: async (data: any) => (await api.post('/church/families', data)).data,

  // Visitors
  getVisitors: async (params?: any) => unwrap((await api.get('/church/visitors', { params })).data),
  createVisitor: async (data: any) => (await api.post('/church/visitors', data)).data,
  updateVisitor: async (id: string, data: any) => (await api.put(`/church/visitors/${id}`, data)).data,
  deleteVisitor: async (id: string) => (await api.delete(`/church/visitors/${id}`)).data,
  convertVisitor: async (id: string) => (await api.post(`/church/visitors/${id}/convert`, {})).data,

  // Ministries / departments / cell groups
  getMinistries: async (params?: any) => unwrap((await api.get('/church/ministries', { params })).data),
  createMinistry: async (data: any) => (await api.post('/church/ministries', data)).data,
  updateMinistry: async (id: string, data: any) => (await api.put(`/church/ministries/${id}`, data)).data,
  deleteMinistry: async (id: string) => (await api.delete(`/church/ministries/${id}`)).data,

  // Events + attendance
  getEvents: async () => unwrap((await api.get('/church/events')).data),
  createEvent: async (data: any) => (await api.post('/church/events', data)).data,
  updateEvent: async (id: string, data: any) => (await api.put(`/church/events/${id}`, data)).data,
  deleteEvent: async (id: string) => (await api.delete(`/church/events/${id}`)).data,
  checkIn: async (id: string, data: any) => (await api.post(`/church/events/${id}/checkin`, data)).data,
  checkOut: async (id: string, data: any) => (await api.post(`/church/events/${id}/checkout`, data)).data,
  getAttendance: async (id: string) => unwrap((await api.get(`/church/events/${id}/attendance`)).data),

  // Giving
  getGiving: async (params?: any) => unwrap((await api.get('/church/giving', { params })).data),
  addGiving: async (data: any) => (await api.post('/church/giving', data)).data,
  initGiving: async (data: any) => (await api.post('/church/giving/initialize', data)).data,

  // Finance modules
  getFinanceSummary: async () => (await api.get('/church/finance/summary')).data,
  getExpenses: async (params?: any) => unwrap((await api.get('/church/expenses', { params })).data),
  createExpense: async (data: any) => (await api.post('/church/expenses', data)).data,
  updateExpense: async (id: string, data: any) => (await api.put(`/church/expenses/${id}`, data)).data,
  deleteExpense: async (id: string) => (await api.delete(`/church/expenses/${id}`)).data,
  getBudgets: async (params?: any) => unwrap((await api.get('/church/budgets', { params })).data),
  createBudget: async (data: any) => (await api.post('/church/budgets', data)).data,
  updateBudget: async (id: string, data: any) => (await api.put(`/church/budgets/${id}`, data)).data,
  deleteBudget: async (id: string) => (await api.delete(`/church/budgets/${id}`)).data,
  getPledges: async (params?: any) => unwrap((await api.get('/church/pledges', { params })).data),
  createPledge: async (data: any) => (await api.post('/church/pledges', data)).data,
  updatePledge: async (id: string, data: any) => (await api.put(`/church/pledges/${id}`, data)).data,
  deletePledge: async (id: string) => (await api.delete(`/church/pledges/${id}`)).data,
  getInventory: async (params?: any) => unwrap((await api.get('/church/inventory', { params })).data),
  createInventory: async (data: any) => (await api.post('/church/inventory', data)).data,
  updateInventory: async (id: string, data: any) => (await api.put(`/church/inventory/${id}`, data)).data,
  deleteInventory: async (id: string) => (await api.delete(`/church/inventory/${id}`)).data,

  // Branches & service schedules
  getBranches: async () => unwrap((await api.get('/church/branches')).data),
  createBranch: async (data: any) => (await api.post('/church/branches', data)).data,
  updateBranch: async (id: string, data: any) => (await api.put(`/church/branches/${id}`, data)).data,
  deleteBranch: async (id: string) => (await api.delete(`/church/branches/${id}`)).data,
  getSchedules: async () => unwrap((await api.get('/church/service-schedules')).data),
  createSchedule: async (data: any) => (await api.post('/church/service-schedules', data)).data,
  updateSchedule: async (id: string, data: any) => (await api.put(`/church/service-schedules/${id}`, data)).data,
  deleteSchedule: async (id: string) => (await api.delete(`/church/service-schedules/${id}`)).data,

  // Communications
  getCommunications: async () => unwrap((await api.get('/church/communications')).data),
  sendSms: async (data: any) => (await api.post('/church/communications/sms', data)).data,
  sendAnnouncement: async (data: any) => (await api.post('/church/communications/announcements', data)).data,

  // Users & permissions (church-scoped)
  getUsers: async () => unwrap((await api.get('/church/users')).data),
  createUser: async (data: any) => (await api.post('/church/users', data)).data,
  updateUser: async (uid: string, data: any) => (await api.put(`/church/users/${uid}`, data)).data,
  deleteUser: async (uid: string) => (await api.delete(`/church/users/${uid}`)).data,
  getRoles: async () => unwrap((await api.get('/church/roles')).data),

  /**
   * Read this church's role -> permission matrix. Roles the church has not
   * customised come back with the platform default and `customised: false`.
   */
  getRolePermissions: async (): Promise<{
    data: Array<{ role: string; permissions: string[]; customised: boolean }>;
    catalog: string[];
  }> => (await api.get('/church/roles-permissions')).data,
  /** Save an override for one role in this church only. */
  saveRolePermissions: async (role: string, permissions: string[]) =>
    (await api.put(`/church/roles-permissions/${role}`, { permissions })).data,
  /** Drop this church's override so the role falls back to the platform default. */
  resetRolePermissions: async (role: string) =>
    (await api.delete(`/church/roles-permissions/${role}`)).data,

  // ---------------------------------------------------------------------------
  // Positions (a member's place in the church: Usher, Treasurer, Choir Lead...)
  // Distinct from ROLE, which controls portal access.
  // ---------------------------------------------------------------------------

  getPositions: async (params?: any) => unwrap((await api.get('/church/positions', { params })).data),
  createPosition: async (data: any) => (await api.post('/church/positions', data)).data,
  updatePosition: async (id: string, data: any) => (await api.put(`/church/positions/${id}`, data)).data,
  deletePosition: async (id: string) => (await api.delete(`/church/positions/${id}`)).data,

  /** Every assignment in this church, with member and position names resolved. */
  getPositionAssignments: async () => unwrap((await api.get('/church/position-assignments')).data),
  /** Positions held by one member. */
  getMemberPositions: async (memberId: string) =>
    unwrap((await api.get(`/church/members/${memberId}/positions`)).data),
  /** Assign a position to a member. Rejects duplicates with 409. */
  assignPosition: async (data: {
    memberId: string;
    positionId: string;
    ministryId?: string;
    startDate?: string;
  }) => (await api.post('/church/position-assignments', data)).data,
  removePositionAssignment: async (id: number | string) =>
    (await api.delete(`/church/position-assignments/${id}`)).data,

  // ---------------------------------------------------------------------------
  // Attendance: QR codes, manual roll call, biometric devices
  // ---------------------------------------------------------------------------

  /** Issue a fresh QR token (server TTL is 10 minutes). */
  issueEventQr: async (
    eventId: string,
  ): Promise<{ payload: string; token: string; expiresAt: string; ttlMinutes: number }> =>
    (await api.post(`/church/events/${eventId}/qr`, {})).data,
  /** Read the current token, if one is still valid. */
  getEventQr: async (
    eventId: string,
  ): Promise<{ payload?: string; expiresAt?: string; active?: boolean; ttlMinutes?: number }> =>
    (await api.get(`/church/events/${eventId}/qr`)).data,

  /** Roll call sheet. `present` is true, false, or null when unmarked. */
  getRollCall: async (
    eventId: string,
  ): Promise<{
    entries: Array<{
      memberId: string;
      name: string;
      present: boolean | null;
      method?: string | null;
      recordedAt?: string | null;
    }>;
    summary?: { present: number; absent: number; unmarked: number; total: number };
  }> => (await api.get(`/church/events/${eventId}/rollcall`)).data,
  /** Save changed marks only. Unmarked members are left untouched. */
  saveRollCall: async (
    eventId: string,
    entries: Array<{ memberId: string; present: boolean }>,
  ) => (await api.post(`/church/events/${eventId}/rollcall`, { entries })).data,

  getBiometricDevices: async () => unwrap((await api.get('/church/biometric/devices')).data),
  /**
   * Register a device. `apiKey` comes back in plain text ONCE and is never
   * retrievable again -- the server keeps only a hash.
   */
  createBiometricDevice: async (data: {
    name: string;
    serialNumber?: string;
    location?: string;
  }): Promise<{ id: string; name: string; apiKey: string }> =>
    (await api.post('/church/biometric/devices', data)).data,
  updateBiometricDevice: async (id: string, data: any) =>
    (await api.put(`/church/biometric/devices/${id}`, data)).data,
  deleteBiometricDevice: async (id: string) =>
    (await api.delete(`/church/biometric/devices/${id}`)).data,
  /** New key, old key invalidated. Same one-time display rule. */
  rotateBiometricDeviceKey: async (id: string): Promise<{ apiKey: string }> =>
    (await api.post(`/church/biometric/devices/${id}/rotate-key`, {})).data,

  /** Device punches. Use status 'unmatched' to find unknown fingerprints. */
  getBiometricPunches: async (params?: { status?: string; limit?: number }) =>
    unwrap((await api.get('/church/biometric/punches', { params })).data),
  /** Link a member to the fingerprint ID enrolled on the device. */
  linkMemberBiometric: async (memberId: string, biometricId: string) =>
    (await api.post(`/church/members/${memberId}/biometric`, { biometricId })).data,

  // Audit & security
  getActivityLog: async () => unwrap((await api.get('/church/activity-log')).data),
};

export default churchApi;
