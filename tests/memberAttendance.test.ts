import test from 'node:test';
import assert from 'node:assert/strict';
import { attendanceDateRange, attendanceOutcome, defaultAttendanceRange, summarizeMemberAttendance, type MemberAttendanceRecord } from '../src/lib/memberAttendance';
const record = (id: number, eventId: string, eventStartTime: string, present: unknown, status = 'checked_in'): MemberAttendanceRecord => ({ id, eventId, eventStartTime, eventTitle: eventId, present, status });

test('date ranges include the whole end day, including leap days', () => {
  const r = attendanceDateRange('2024-02-29', '2024-02-29');
  assert.equal(r.start.toISOString(), '2024-02-29T00:00:00.000Z');
  assert.equal(r.endExclusive.toISOString(), '2024-03-01T00:00:00.000Z');
});
test('invalid, impossible and reversed ranges are rejected', () => {
  for (const dates of [['2025-02-29', '2025-03-01'], ['2026-01-02', '2026-01-01'], ['', '2026-01-01'], ['2026-13-01', '2026-13-01'], ['2026-1-1', '2026-01-01']]) {
    assert.throws(() => attendanceDateRange(...dates as [string, string]));
  }
  assert.throws(() => attendanceDateRange(['2026-01-01'], '2026-01-02'));
});
test('default covers 90 inclusive UTC calendar days', () => {
  const r = defaultAttendanceRange(new Date('2026-10-03T10:45:00Z'));
  const parsed = attendanceDateRange(r.from, r.to);
  assert.equal((parsed.endExclusive.getTime() - parsed.start.getTime()) / 86400000, 90);
});
test('registration defaults and cancellations are never counted as attendance', () => {
  for (const status of ['registered', 'cancelled', 'canceled', 'waitlisted']) {
    assert.equal(attendanceOutcome({ present: true, status }), 'Not marked');
  }
});
test('boolean encodings, explicit absences, and legacy checkouts are handled', () => {
  for (const present of [true, 1, '1', 'true', 'yes']) assert.equal(attendanceOutcome({ present }), 'Present');
  for (const present of [false, 0, '0', 'false', 'no']) assert.equal(attendanceOutcome({ present }), 'Absent');
  assert.equal(attendanceOutcome({ present: true, status: 'absent' }), 'Absent');
  assert.equal(attendanceOutcome({ present: null, status: 'checked_out' }), 'Present');
  assert.equal(attendanceOutcome({ present: null }), 'Not marked');
});
test('summaries reconcile, deduplicate events, and use marked-event denominators', () => {
  const s = summarizeMemberAttendance([
    record(1, 'a', '2026-01-03T10:00:00Z', true),
    record(2, 'a', '2026-01-03T10:00:00Z', false, 'absent'),
    record(3, 'b', '2026-01-04T10:00:00Z', true),
    record(4, 'c', '2026-01-05T10:00:00Z', true, 'registered'),
    record(5, 'd', '2026-03-05T10:00:00Z', true),
  ]);
  assert.equal(s.records.length, 4);
  assert.equal(s.present, 2); assert.equal(s.absent, 1); assert.equal(s.unmarked, 1);
  assert.equal(s.marked, 3); assert.equal(s.rate, 66.7);
  assert.deepEqual(s.monthly.map(m => m.month), ['2026-01', '2026-02', '2026-03']);
  assert.equal(s.monthly[0].rate, 50); assert.equal(s.monthly[1].rate, null);
  assert.equal(s.monthly[1].present, null); assert.equal(s.monthly[2].rate, 100);
  assert.equal(s.monthly.reduce((n, m) => n + (m.present || 0), 0), s.present);
  assert.equal(s.monthly.reduce((n, m) => n + (m.absent || 0), 0), s.absent);
});
test('empty and registration-only results have unavailable rather than zero rates', () => {
  assert.equal(summarizeMemberAttendance([]).rate, null);
  const s = summarizeMemberAttendance([record(1, 'a', '2026-01-03T00:00:00Z', true, 'registered')]);
  assert.equal(s.rate, null); assert.equal(s.marked, 0); assert.equal(s.unmarked, 1);
});
test('invalid event dates are not plotted or counted', () => {
  assert.equal(summarizeMemberAttendance([record(1, 'a', 'bad-date', true)]).records.length, 0);
});
