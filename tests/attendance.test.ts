import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateQrToken,
  buildQrPayload,
  parseQrPayload,
  safeEquals,
  checkQrToken,
  generateDeviceApiKey,
  hashDeviceApiKey,
  verifyDeviceApiKey,
  normalizePresent,
  normalizeMethod,
  resolvePunchEvent,
  isDuplicatePunch,
  buildRollCall,
  summarizeRollCall,
  QR_TOKEN_TTL_MINUTES,
} from '../src/lib/attendance';

const MIN = 60_000;

/* ---- QR tokens ---- */

test('generateQrToken issues a token that expires in the future', () => {
  const now = new Date('2026-08-17T10:00:00Z');
  const { token, expiresAt } = generateQrToken(now);
  assert.ok(token.length > 20);
  assert.equal(expiresAt.getTime(), now.getTime() + QR_TOKEN_TTL_MINUTES * MIN);
});

test('generateQrToken does not repeat tokens', () => {
  assert.notEqual(generateQrToken().token, generateQrToken().token);
});

test('QR payload round-trips', () => {
  const payload = buildQrPayload('evt-1', 'abc123');
  assert.deepEqual(parseQrPayload(payload), { eventId: 'evt-1', token: 'abc123' });
});

test('parseQrPayload ignores codes that are not ours', () => {
  assert.equal(parseQrPayload('https://example.com'), null);
  assert.equal(parseQrPayload('4006381333931'), null);
  assert.equal(parseQrPayload(''), null);
});

test('parseQrPayload rejects a malformed attendance code', () => {
  // Extra segment must not be silently read as the token.
  assert.equal(parseQrPayload('ecclesia:attend:evt-1:tok:extra'), null);
  assert.equal(parseQrPayload('ecclesia:attend:evt-1'), null);
  assert.equal(parseQrPayload('ecclesia:attend::tok'), null);
});

test('parseQrPayload tolerates surrounding whitespace from a scanner', () => {
  assert.deepEqual(parseQrPayload('  ecclesia:attend:e1:t1\n'), { eventId: 'e1', token: 't1' });
});

test('safeEquals compares by value and rejects differing lengths', () => {
  assert.equal(safeEquals('abc', 'abc'), true);
  assert.equal(safeEquals('abc', 'abd'), false);
  assert.equal(safeEquals('abc', 'abcd'), false);
  assert.equal(safeEquals('', ''), true);
});

test('checkQrToken accepts a current token', () => {
  const now = new Date('2026-08-17T10:00:00Z');
  const result = checkQrToken(
    { qrToken: 'tok', qrTokenExpiresAt: new Date(now.getTime() + 5 * MIN) },
    'tok',
    now,
  );
  assert.deepEqual(result, { ok: true });
});

test('checkQrToken rejects a wrong token', () => {
  const now = new Date('2026-08-17T10:00:00Z');
  const result = checkQrToken(
    { qrToken: 'tok', qrTokenExpiresAt: new Date(now.getTime() + 5 * MIN) },
    'other',
    now,
  );
  assert.deepEqual(result, { ok: false, reason: 'mismatch' });
});

test('checkQrToken rejects an expired token', () => {
  const now = new Date('2026-08-17T10:00:00Z');
  const result = checkQrToken(
    { qrToken: 'tok', qrTokenExpiresAt: new Date(now.getTime() - 1 * MIN) },
    'tok',
    now,
  );
  assert.deepEqual(result, { ok: false, reason: 'expired' });
});

test('checkQrToken reports an event with no token issued', () => {
  assert.deepEqual(checkQrToken({ qrToken: null, qrTokenExpiresAt: null }, 'tok'), {
    ok: false,
    reason: 'no_token',
  });
});

test('checkQrToken fails closed when the expiry is missing or unparseable', () => {
  assert.deepEqual(checkQrToken({ qrToken: 'tok', qrTokenExpiresAt: null }, 'tok'), {
    ok: false,
    reason: 'expired',
  });
  assert.deepEqual(checkQrToken({ qrToken: 'tok', qrTokenExpiresAt: 'not-a-date' }, 'tok'), {
    ok: false,
    reason: 'expired',
  });
});

/* ---- Device keys ---- */

test('a generated device key verifies against its stored hash', () => {
  const { apiKey, apiKeyHash } = generateDeviceApiKey();
  assert.equal(verifyDeviceApiKey(apiKey, apiKeyHash), true);
  // The raw key must never be recoverable from what we store.
  assert.ok(!apiKeyHash.includes(apiKey));
});

test('a wrong or empty device key is rejected', () => {
  const { apiKeyHash } = generateDeviceApiKey();
  assert.equal(verifyDeviceApiKey('wrong-key', apiKeyHash), false);
  assert.equal(verifyDeviceApiKey('', apiKeyHash), false);
  assert.equal(verifyDeviceApiKey('anything', ''), false);
});

test('hashDeviceApiKey is deterministic', () => {
  assert.equal(hashDeviceApiKey('key'), hashDeviceApiKey('key'));
  assert.notEqual(hashDeviceApiKey('key'), hashDeviceApiKey('key2'));
});

/* ---- Stored value coercion ---- */

test("normalizePresent treats SQLite's 0 and the string '0' as absent", () => {
  assert.equal(normalizePresent(0), false);
  assert.equal(normalizePresent('0'), false);
  assert.equal(normalizePresent(false), false);
  assert.equal(normalizePresent('false'), false);
  assert.equal(normalizePresent('absent'), false);
  assert.equal(normalizePresent(''), false);
  assert.equal(normalizePresent(null), false);
  assert.equal(normalizePresent(undefined), false);
});

test('normalizePresent accepts the truthy spellings', () => {
  assert.equal(normalizePresent(1), true);
  assert.equal(normalizePresent('1'), true);
  assert.equal(normalizePresent(true), true);
  assert.equal(normalizePresent('true'), true);
  assert.equal(normalizePresent('YES'), true);
  assert.equal(normalizePresent('present'), true);
});

test('normalizeMethod falls back to manual for unknown values', () => {
  assert.equal(normalizeMethod('qr'), 'qr');
  assert.equal(normalizeMethod('BIOMETRIC'), 'biometric');
  assert.equal(normalizeMethod('telepathy'), 'manual');
  assert.equal(normalizeMethod(undefined), 'manual');
});

/* ---- Punch to event matching ---- */

const service = { id: 'first', startTime: '2026-08-17T09:00:00Z', endTime: '2026-08-17T11:00:00Z' };
const secondService = { id: 'second', startTime: '2026-08-17T14:00:00Z', endTime: '2026-08-17T16:00:00Z' };

test('a punch during a service matches that service', () => {
  assert.equal(resolvePunchEvent(new Date('2026-08-17T09:30:00Z'), [service, secondService]), 'first');
});

test('an early arrival still matches', () => {
  assert.equal(resolvePunchEvent(new Date('2026-08-17T08:15:00Z'), [service]), 'first');
});

test('a punch far from any event is unmatched', () => {
  assert.equal(resolvePunchEvent(new Date('2026-08-17T04:00:00Z'), [service, secondService]), null);
  assert.equal(resolvePunchEvent(new Date('2026-08-17T20:00:00Z'), [service, secondService]), null);
});

test('back-to-back events do not steal each other, the nearest start wins', () => {
  const morning = { id: 'morning', startTime: '2026-08-17T09:00:00Z', endTime: '2026-08-17T10:00:00Z' };
  const midday = { id: 'midday', startTime: '2026-08-17T10:30:00Z', endTime: '2026-08-17T12:00:00Z' };
  // 10:20 falls inside both windows once the late/early padding is applied.
  assert.equal(resolvePunchEvent(new Date('2026-08-17T10:20:00Z'), [morning, midday]), 'midday');
  assert.equal(resolvePunchEvent(new Date('2026-08-17T09:10:00Z'), [morning, midday]), 'morning');
});

test('an event with no end time uses the default duration', () => {
  const open = { id: 'open', startTime: '2026-08-17T09:00:00Z', endTime: null };
  assert.equal(resolvePunchEvent(new Date('2026-08-17T11:30:00Z'), [open]), 'open');
  assert.equal(resolvePunchEvent(new Date('2026-08-17T13:30:00Z'), [open]), null);
});

test('unparseable event and punch times are skipped, not thrown', () => {
  assert.equal(resolvePunchEvent(new Date('2026-08-17T09:30:00Z'), [{ id: 'bad', startTime: 'nope' }]), null);
  assert.equal(resolvePunchEvent(new Date('invalid'), [service]), null);
  assert.equal(resolvePunchEvent(new Date('2026-08-17T09:30:00Z'), []), null);
});

test('repeat punches from the same finger are duplicates', () => {
  const at = new Date('2026-08-17T09:30:00Z');
  assert.equal(isDuplicatePunch('2026-08-17T09:25:00Z', at), true);
  assert.equal(isDuplicatePunch('2026-08-17T08:00:00Z', at), false);
  assert.equal(isDuplicatePunch(null, at), false);
  assert.equal(isDuplicatePunch('not-a-date', at), false);
});

/* ---- Roll call ---- */

const members = [
  { id: 'm1', firstName: 'Ama', lastName: 'Mensah', membershipId: 'MEM-1' },
  { id: 'm2', firstName: 'Kofi', lastName: 'Boateng', membershipId: 'MEM-2' },
  { id: 'm3', firstName: 'Yaa', lastName: 'Asante', membershipId: 'MEM-3' },
];

test('roll call lists every member, including those nobody has marked', () => {
  const entries = buildRollCall(members, [
    { id: 1, memberId: 'm1', present: 1, method: 'qr', checkInAt: '2026-08-17T09:05:00Z' },
  ]);
  assert.equal(entries.length, 3);
  assert.equal(entries[0].present, true);
  assert.equal(entries[0].method, 'qr');
  // Unmarked must be null, not false: "not yet taken" is not "absent".
  assert.equal(entries[1].present, null);
  assert.equal(entries[1].method, null);
  assert.equal(entries[1].attendanceId, null);
});

test('roll call distinguishes an explicitly absent member from an unmarked one', () => {
  const entries = buildRollCall(members, [{ id: 9, memberId: 'm2', present: 0, method: 'manual' }]);
  assert.equal(entries[1].present, false);
  assert.equal(entries[1].attendanceId, 9);
  assert.equal(entries[2].present, null);
});

test('roll call keeps the most recent row when a member has duplicates', () => {
  const entries = buildRollCall(members, [
    { id: 1, memberId: 'm1', present: 0, method: 'manual', checkInAt: '2026-08-17T09:00:00Z' },
    { id: 2, memberId: 'm1', present: 1, method: 'qr', checkInAt: '2026-08-17T09:30:00Z' },
  ]);
  assert.equal(entries[0].attendanceId, 2);
  assert.equal(entries[0].present, true);
  assert.equal(entries[0].method, 'qr');
});

test('roll call ignores attendance rows with no member, such as child check-ins', () => {
  const entries = buildRollCall(members, [{ id: 5, memberId: null, present: 1 }]);
  assert.ok(entries.every((e) => e.present === null));
});

test('summary counts present, absent and unmarked separately', () => {
  const entries = buildRollCall(members, [
    { id: 1, memberId: 'm1', present: 1, method: 'qr' },
    { id: 2, memberId: 'm2', present: 0, method: 'manual' },
  ]);
  const summary = summarizeRollCall(entries);
  assert.deepEqual(summary, {
    totalMembers: 3,
    present: 1,
    absent: 1,
    unmarked: 1,
    byMethod: { manual: 0, qr: 1, biometric: 0 },
  });
});

test('summary attributes each present member to the method that marked them', () => {
  const entries = buildRollCall(members, [
    { id: 1, memberId: 'm1', present: 1, method: 'qr' },
    { id: 2, memberId: 'm2', present: 1, method: 'biometric' },
    { id: 3, memberId: 'm3', present: 1, method: 'manual' },
  ]);
  const summary = summarizeRollCall(entries);
  assert.equal(summary.present, 3);
  assert.deepEqual(summary.byMethod, { manual: 1, qr: 1, biometric: 1 });
});
