import test from 'node:test';
import assert from 'node:assert/strict';
import {
  checkEventQrWindow,
  eventAttendanceWindow,
  DEFAULT_EVENT_DURATION_MINUTES,
} from '../src/lib/attendance';
import {
  generateTempPassword,
  isUsableLoginEmail,
  normalizeLoginEmail,
  portalInviteSms,
  portalInviteBody,
} from '../src/lib/memberPortal';

const iso = (s: string) => new Date(s);

/* --- The scanning window -------------------------------------------- */

test('a code is refused before the event starts', () => {
  const event = { startTime: '2026-08-23T09:00:00Z', endTime: '2026-08-23T11:00:00Z' };
  const result = checkEventQrWindow(event, iso('2026-08-23T08:59:59Z'));
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.reason, 'not_started');
});

test('a code works from the moment the event starts', () => {
  const event = { startTime: '2026-08-23T09:00:00Z', endTime: '2026-08-23T11:00:00Z' };
  assert.equal(checkEventQrWindow(event, iso('2026-08-23T09:00:00Z')).ok, true);
  assert.equal(checkEventQrWindow(event, iso('2026-08-23T10:30:00Z')).ok, true);
});

test('a code stops working once the event ends', () => {
  const event = { startTime: '2026-08-23T09:00:00Z', endTime: '2026-08-23T11:00:00Z' };
  assert.equal(checkEventQrWindow(event, iso('2026-08-23T11:00:00Z')).ok, true);
  const after = checkEventQrWindow(event, iso('2026-08-23T11:00:01Z'));
  assert.equal(after.ok, false);
  assert.equal(after.ok === false && after.reason, 'ended');
});

test('an event with no end time closes after the default duration', () => {
  const event = { startTime: '2026-08-23T09:00:00Z', endTime: null };
  const window = eventAttendanceWindow(event);
  assert.ok(window);
  assert.equal(
    window!.endsAt.getTime() - window!.startsAt.getTime(),
    DEFAULT_EVENT_DURATION_MINUTES * 60 * 1000,
  );
  // Still open inside the assumed duration, closed after it.
  assert.equal(checkEventQrWindow(event, iso('2026-08-23T10:30:00Z')).ok, true);
  assert.equal(checkEventQrWindow(event, iso('2026-08-23T12:30:00Z')).ok, false);
});

test('an end time before the start time is ignored rather than closing instantly', () => {
  // Bad data should not make attendance impossible for the whole service.
  const event = { startTime: '2026-08-23T09:00:00Z', endTime: '2026-08-23T08:00:00Z' };
  assert.equal(checkEventQrWindow(event, iso('2026-08-23T09:30:00Z')).ok, true);
});

test('an event with no usable start time never opens', () => {
  for (const startTime of [null, undefined, '', 'not a date']) {
    const result = checkEventQrWindow({ startTime: startTime as any });
    assert.equal(result.ok, false, String(startTime));
    assert.equal(result.ok === false && result.reason, 'no_schedule');
  }
  assert.equal(eventAttendanceWindow({ startTime: null }), null);
});

/* --- Member portal credentials -------------------------------------- */

test('a temporary password avoids characters people misread', () => {
  for (let i = 0; i < 200; i += 1) {
    const password = generateTempPassword();
    assert.equal(password.length, 10);
    assert.ok(!/[0OIl1]/.test(password), `ambiguous character in ${password}`);
  }
});

test('temporary passwords are not repeated', () => {
  const seen = new Set(Array.from({ length: 200 }, () => generateTempPassword()));
  assert.equal(seen.size, 200);
});

test('a minimum password length is enforced', () => {
  assert.ok(generateTempPassword(4).length >= 8);
});

test('only a usable address gets a portal login', () => {
  assert.equal(isUsableLoginEmail('ama@example.com'), true);
  assert.equal(isUsableLoginEmail('  Ama@Example.COM '), true);
  assert.equal(isUsableLoginEmail(''), false);
  assert.equal(isUsableLoginEmail(null), false);
  assert.equal(isUsableLoginEmail('not-an-email'), false);
  assert.equal(isUsableLoginEmail('missing@domain'), false);
});

test('login emails are matched case-insensitively', () => {
  assert.equal(normalizeLoginEmail('  Ama@Example.COM '), 'ama@example.com');
  assert.equal(normalizeLoginEmail(undefined), '');
});

test('the invitation carries the credentials and the sign-in link', () => {
  const invite = {
    memberName: 'Ama Mensah',
    churchName: 'Grace Chapel',
    email: 'ama@example.com',
    password: 'Abcd23xyz',
    loginUrl: 'https://church.example/login',
  };
  const sms = portalInviteSms(invite);
  assert.ok(sms.includes('ama@example.com'));
  assert.ok(sms.includes('Abcd23xyz'));
  assert.ok(sms.includes('https://church.example/login'));

  const body = portalInviteBody(invite);
  assert.ok(body.includes('Ama Mensah'));
  assert.ok(body.includes('Grace Chapel'));
  assert.ok(body.includes('Abcd23xyz'));
});

test('a name containing markup cannot break out into the email HTML', () => {
  const body = portalInviteBody({
    memberName: '<script>alert(1)</script>',
    churchName: 'Grace & Peace',
    email: 'a@b.com',
    password: 'Abcd23xyz',
    loginUrl: 'https://x/login',
  });
  assert.ok(!body.includes('<script>'));
  assert.ok(body.includes('&lt;script&gt;'));
  assert.ok(body.includes('Grace &amp; Peace'));
});
