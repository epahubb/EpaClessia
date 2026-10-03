import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMeetingDays, groupWithMeetingDays } from '../src/lib/groupMeetingDays';
test('multiple days are deduplicated and ordered by weekday', () => {
  assert.deepEqual(normalizeMeetingDays(['Friday', 'Monday', 'Friday', 'Sunday']), ['Sunday', 'Monday', 'Friday']);
});
test('single-day records and comma-separated legacy records stay editable', () => {
  assert.deepEqual(normalizeMeetingDays('Wednesday'), ['Wednesday']);
  assert.deepEqual(normalizeMeetingDays('Friday, Monday'), ['Monday', 'Friday']);
  assert.deepEqual(groupWithMeetingDays({ id: 'g', meetingDay: 'Sunday' }), { id: 'g', meetingDay: 'Sunday', meetingDays: ['Sunday'] });
});
test('empty selections clear meeting days', () => {
  for (const value of [null, undefined, '', []]) assert.deepEqual(normalizeMeetingDays(value), []);
});
test('JSON arrays from old exports are accepted', () => {
  assert.deepEqual(normalizeMeetingDays('["Monday","Thursday"]'), ['Monday', 'Thursday']);
});
test('unknown days, malformed values, and oversized arrays are rejected', () => {
  for (const value of [['Funday'], ['monday'], {}, 1, '[bad]', 'Monday,', Array(8).fill('Sunday')]) {
    assert.throws(() => normalizeMeetingDays(value));
  }
});
test('all days fit in the existing column and unusual legacy display text is preserved', () => {
  const days = normalizeMeetingDays(['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']);
  assert.ok(days.join(', ').length < 255);
  assert.deepEqual(groupWithMeetingDays({ meetingDay: 'Every other Sunday' }), { meetingDay: 'Every other Sunday', meetingDays: [] });
});
