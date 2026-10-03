/** Member-detail attendance reporting. Dates are inclusive UTC calendar days. */
export type MemberAttendanceRecord = {
  id: number | string;
  eventId: string;
  eventTitle: string;
  eventStartTime: string;
  present?: unknown;
  status?: string | null;
  method?: string | null;
  checkInAt?: string | null;
};
export type AttendanceOutcome = 'Present' | 'Absent' | 'Not marked';

export function attendanceOutcome(row: Pick<MemberAttendanceRecord, 'present' | 'status'>): AttendanceOutcome {
  const status = String(row.status || '').toLowerCase();
  // Registrations inherit the DB's present=true default, but are not attendance.
  if (['registered', 'cancelled', 'canceled', 'waitlisted'].includes(status)) return 'Not marked';
  if (status === 'absent') return 'Absent';
  if (row.present !== null && row.present !== undefined) {
    const value = String(row.present).trim().toLowerCase();
    if (['true', '1', 'yes', 'present'].includes(value)) return 'Present';
    if (['false', '0', 'no', 'absent'].includes(value)) return 'Absent';
  }
  if (['checked_in', 'checked_out'].includes(status)) return 'Present';
  return 'Not marked';
}

function validDay(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function attendanceDateRange(from: unknown, to: unknown) {
  if (!validDay(from) || !validDay(to)) throw new Error('Choose valid start and end dates.');
  if (from > to) throw new Error('The start date must be on or before the end date.');
  return {
    from,
    to,
    start: new Date(`${from}T00:00:00.000Z`),
    endExclusive: new Date(new Date(`${to}T00:00:00.000Z`).getTime() + 86400000),
  };
}

export function defaultAttendanceRange(now = new Date()) {
  return { from: new Date(now.getTime() - 89 * 86400000).toISOString().slice(0, 10), to: now.toISOString().slice(0, 10) };
}

export function summarizeMemberAttendance(rows: MemberAttendanceRecord[]) {
  // Legacy duplicates must not count the same event twice. Highest row id wins.
  const byEvent = new Map<string, MemberAttendanceRecord>();
  for (const row of rows) {
    if (!row.eventId || !Number.isFinite(new Date(row.eventStartTime).getTime())) continue;
    const previous = byEvent.get(row.eventId);
    if (!previous || Number(row.id) > Number(previous.id)) byEvent.set(row.eventId, row);
  }
  const records = [...byEvent.values()].sort((a, b) => new Date(b.eventStartTime).getTime() - new Date(a.eventStartTime).getTime());
  const monthly = new Map<string, { month: string; present: number | null; absent: number | null; unmarked: number; marked: number; rate: number | null }>();
  let present = 0, absent = 0, unmarked = 0;
  for (const row of records) {
    const month = new Date(row.eventStartTime).toISOString().slice(0, 7);
    const bucket = monthly.get(month) || { month, present: 0, absent: 0, unmarked: 0, marked: 0, rate: null };
    const outcome = attendanceOutcome(row);
    if (outcome === 'Present') { present++; bucket.present++; }
    else if (outcome === 'Absent') { absent++; bucket.absent++; }
    else { unmarked++; bucket.unmarked++; }
    bucket.marked = bucket.present + bucket.absent;
    bucket.rate = bucket.marked ? Math.round(bucket.present / bucket.marked * 1000) / 10 : null;
    monthly.set(month, bucket);
  }
  // Keep months without any records as gaps, rather than inventing zero marks.
  const keys = [...monthly.keys()].sort();
  if (keys.length > 1) {
    const cursor = new Date(`${keys[0]}-01T00:00:00Z`);
    const last = keys[keys.length - 1];
    while (cursor.toISOString().slice(0, 7) <= last) {
      const month = cursor.toISOString().slice(0, 7);
      if (!monthly.has(month)) monthly.set(month, { month, present: null, absent: null, unmarked: 0, marked: 0, rate: null });
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
  }
  const marked = present + absent;
  return {
    records, present, absent, unmarked, marked,
    rate: marked ? Math.round(present / marked * 1000) / 10 : null,
    monthly: [...monthly.values()].sort((a, b) => a.month.localeCompare(b.month)),
  };
}
