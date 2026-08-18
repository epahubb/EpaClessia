import api from './api';

/**
 * Member-side attendance. Identity comes from the session on the server -- the
 * QR payload identifies only the EVENT, never the person, so a photographed or
 * forwarded code cannot be used to check in somebody else.
 */

export interface ScanResult {
  ok?: boolean;
  /** True on a repeat scan. This is a success, not an error. */
  alreadyRecorded?: boolean;
  eventId?: string;
  eventName?: string;
  recordedAt?: string;
  message?: string;
}

export interface AttendanceHistoryRow {
  eventId?: string;
  eventName?: string;
  date?: string;
  checkInAt?: string;
  method?: string;
  status?: string;
  present?: boolean;
}

const unwrap = (r: any): any[] =>
  Array.isArray(r) ? r : r?.data ?? r?.history ?? r?.attendance ?? [];

export const memberAttendanceApi = {
  /**
   * Redeem a scanned payload. Three outcomes must be handled by callers:
   * success, HTTP 410 with reason 'expired', and alreadyRecorded.
   */
  scan: async (payload: string): Promise<ScanResult> =>
    (await api.post('/member/attendance/scan', { payload })).data,

  getHistory: async (params?: { limit?: number }): Promise<AttendanceHistoryRow[]> =>
    unwrap((await api.get('/member/attendance/history', { params })).data),
};

export default memberAttendanceApi;
