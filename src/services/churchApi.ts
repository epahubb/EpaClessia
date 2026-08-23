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

/** One line of a roll call sheet. */
export type RollCallRow = {
  memberId: string;
  name: string;
  present: boolean | null;
  method?: string | null;
  recordedAt?: string | null;
};

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
  /**
   * Read the current token, if one is still valid.
   *
   * `active` is false outside the event's own start/end window, with `reason`
   * saying whether the service has not started yet or has already ended.
   */
  getEventQr: async (
    eventId: string,
  ): Promise<{
    payload?: string;
    expiresAt?: string;
    active?: boolean;
    reason?: 'not_started' | 'ended' | 'no_schedule';
    message?: string;
    startsAt?: string | null;
    endsAt?: string | null;
    ttlMinutes?: number;
  }> => (await api.get(`/church/events/${eventId}/qr`)).data,

  /** Roll call sheet. `present` is true, false, or null when unmarked. */
  getRollCall: async (
    eventId: string,
  ): Promise<{
    entries?: RollCallRow[];
    /** The same list under the generic key used by other endpoints. */
    data?: RollCallRow[];
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

  // ---- Giving purposes defined by the church ----
  /** Purpose names for the finance forms (church's own + common defaults). */
  getPurposeOptions: async (category?: string): Promise<string[]> =>
    (await api.get('/church/finance-purposes/options', { params: category ? { category } : undefined })).data?.data || [],
  /** Saves a purpose typed straight into a form so it is offered next time. */
  rememberPurpose: async (name: string, category = 'giving') =>
    (await api.post('/church/finance-purposes/remember', { name, category })).data,
  getPurposes: async () => unwrap((await api.get('/church/finance-purposes')).data),
  createPurpose: async (data: any) => (await api.post('/church/finance-purposes', data)).data,
  updatePurpose: async (id: string, data: any) => (await api.put(`/church/finance-purposes/${id}`, data)).data,
  deletePurpose: async (id: string) => (await api.delete(`/church/finance-purposes/${id}`)).data,

  // ---- Inventory categories typed by the church ----
  getInventoryCategories: async (): Promise<string[]> =>
    (await api.get('/church/inventory-categories')).data?.data || [],
  rememberInventoryCategory: async (name: string) =>
    (await api.post('/church/inventory-categories', { name })).data,

  // ---- Member engagement (active / inactive / backslider) ----
  getMemberEngagement: async (status?: string) =>
    (await api.get('/church/members/engagement', { params: status && status !== 'all' ? { status } : undefined })).data,
  recalculateEngagement: async () => (await api.post('/church/members/engagement/recalculate', {})).data,
  setMemberEngagement: async (memberId: string, engagementStatus: string, reason?: string, lock = true) =>
    (await api.put(`/church/members/${memberId}/engagement`, { engagementStatus, reason, lock })).data,

  // ---- Absence follow-up questionnaires ----
  getAbsenceSurveys: async (status?: string) =>
    (await api.get('/church/absence/surveys', { params: status && status !== 'all' ? { status } : undefined })).data,
  sendAbsenceSurveys: async (body: { eventId?: string; memberIds?: string[] }) =>
    (await api.post('/church/absence/surveys/send', body)).data,

  /**
   * Send or re-send a member's portal invitation. Each call issues a new
   * temporary password, so this doubles as "reset their portal password".
   */
  sendPortalInvite: async (
    memberId: string,
    opts?: string | { email?: string; username?: string; password?: string; activateNow?: boolean },
  ) =>
    (await api.post(
      `/church/members/${memberId}/portal-access`,
      // Kept backwards compatible with the callers that pass just an email.
      typeof opts === 'string' ? { email: opts } : (opts || {}),
    )).data,

  /**
   * Activate (or suspend) a member's portal login on the church's behalf, for
   * a member who cannot use the emailed activation link.
   */
  setMemberPortalActive: async (memberId: string, active = true) =>
    (await api.post(`/church/members/${memberId}/portal-activate`, { active })).data,

  // ---- Groups (one per member: a cell, zone or house fellowship) ----
  getGroups: async () => unwrap((await api.get('/church/groups')).data),
  getGroupOptions: async () => unwrap((await api.get('/church/groups/options')).data),
  createGroup: async (data: any) => (await api.post('/church/groups', data)).data,
  updateGroup: async (id: string, data: any) => (await api.put(`/church/groups/${id}`, data)).data,
  deleteGroup: async (id: string) => (await api.delete(`/church/groups/${id}`)).data,

  // ---- Offices the church recognises (Settings > Offices) ----
  getOffices: async () => unwrap((await api.get('/church/offices')).data),
  getOfficeOptions: async () => unwrap((await api.get('/church/offices/options')).data),
  createOffice: async (data: any) => (await api.post('/church/offices', data)).data,
  updateOffice: async (id: string, data: any) => (await api.put(`/church/offices/${id}`, data)).data,
  deleteOffice: async (id: string) => (await api.delete(`/church/offices/${id}`)).data,

  /* ---- Statistical returns for ministries, departments and groups ----
   *
   * A "unit" is any of the three. They are addressed by type and id together,
   * because ministries and departments share a table and an id alone would be
   * ambiguous.
   */
  getUnits: async () => unwrap((await api.get('/church/units')).data),

  getStatMetrics: async () => unwrap((await api.get('/church/statistics/metrics')).data),

  /** The return itself: current period, previous period and the variance. */
  getUnitStatistics: async (
    unitType: string,
    unitId: string,
    params?: { from?: string; to?: string; q?: string },
  ) =>
    (await api.get(`/church/units/${unitType}/${unitId}/statistics`, { params })).data,

  /**
   * The records behind one figure -- the actual people, services, visits or
   * payments that were counted.
   *
   * There is no method here for entering a figure, and that is deliberate: every
   * number on the return is counted from records kept elsewhere in the system,
   * so the only way to change one is to correct the record it came from.
   */
  getUnitStatRecords: async (
    unitType: string,
    unitId: string,
    metric: string,
    params?: { from?: string; to?: string; q?: string },
  ) =>
    (await api.get(`/church/units/${unitType}/${unitId}/statistics/records/${metric}`, { params }))
      .data,

  // ---- Visitation log ----
  // Visits by the presiding elder and by ministers, kept as a pastoral record
  // and counted onto the returns from there.
  getVisits: async (params?: {
    from?: string;
    to?: string;
    visitorRole?: string;
    unitId?: string;
    q?: string;
  }) => unwrap((await api.get('/church/visits', { params })).data),

  logVisit: async (data: any) => (await api.post('/church/visits', data)).data,

  updateVisit: async (id: string, data: any) => (await api.put(`/church/visits/${id}`, data)).data,

  deleteVisit: async (id: string) => (await api.delete(`/church/visits/${id}`)).data,

  // ---- Registers ----
  // The registers write to the member records the returns already count from,
  // so there is no separate figure to keep in step.
  getRegisters: async () => unwrap((await api.get('/church/registers')).data),

  getRegisterSummary: async (params?: { from?: string; to?: string }) =>
    (await api.get('/church/registers/summary', { params })).data?.data ?? {},

  getRegisterEntries: async (
    key: string,
    params?: { from?: string; to?: string; q?: string },
  ) => (await api.get(`/church/registers/${key}/entries`, { params })).data,

  fileRegisterEntry: async (key: string, data: any) =>
    (await api.post(`/church/registers/${key}/entries`, data)).data,

  withdrawRegisterEntry: async (key: string, id: string) =>
    (await api.delete(`/church/registers/${key}/entries/${id}`)).data,

  // ---- Portal shape for this church's denomination ----
  getPortalProfile: async () => (await api.get('/church/portal-profile')).data,

  // Audit & security
  getActivityLog: async () => unwrap((await api.get('/church/activity-log')).data),
};

export default churchApi;
