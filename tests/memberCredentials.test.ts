import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeUsername,
  isUsableUsername,
  suggestUsername,
  validatePortalPassword,
  generateVerificationToken,
  activationUrl,
  activationExpiry,
  checkActivationToken,
  portalInviteBody,
  portalInviteSms,
} from '../src/lib/memberPortal';

/**
 * Usernames chosen by a church admin. The rules exist so that whatever the
 * admin types can be repeated over the phone and typed back by the member.
 */
test('usernames are normalised and validated', () => {
  assert.equal(normalizeUsername('  Ama.Mensah  '), 'ama.mensah');

  assert.ok(isUsableUsername('ama.mensah'));
  assert.ok(isUsableUsername('kofi_02'));
  assert.ok(isUsableUsername('abc'));

  // Too short to be worth having, and too long to type.
  assert.equal(isUsableUsername('ab'), false);
  assert.equal(isUsableUsername('a'.repeat(33)), false);

  // Characters that would be ambiguous or break a URL.
  assert.equal(isUsableUsername('ama mensah'), false);
  assert.equal(isUsableUsername('ama@church.org'), false);
  assert.equal(isUsableUsername(''), false);
  assert.equal(isUsableUsername(undefined as any), false);
});

test('a suggested username is derived from the name and is always usable', () => {
  assert.equal(suggestUsername('Ama', 'Mensah'), 'ama.mensah');

  // A one-letter name would fall below the minimum length, so the suggestion
  // has to be padded rather than handed back unusable.
  assert.ok(isUsableUsername(suggestUsername('A', '')));
  assert.ok(isUsableUsername(suggestUsername('', '')));
  assert.ok(isUsableUsername(suggestUsername(undefined, undefined)));

  // Punctuation and spacing in a real name must not leak through.
  assert.ok(isUsableUsername(suggestUsername("N'Guessan", 'Ako Bea')));
});

test('member passwords are held to a floor, not the staff policy', () => {
  assert.equal(validatePortalPassword('church2026pass').ok, true);

  // Too short to be worth setting.
  assert.equal(validatePortalPassword('short1').ok, false);

  // Guessable choices an admin might reach for when registering in bulk.
  assert.equal(validatePortalPassword('password').ok, false);
  assert.equal(validatePortalPassword('church123').ok, false);

  // Leading or trailing spaces are rejected: they survive a copy/paste but
  // never survive being read out to the member.
  assert.equal(validatePortalPassword(' goodpassword').ok, false);
  assert.equal(validatePortalPassword('goodpassword ').ok, false);

  // Every rejection has to carry a reason the admin can act on.
  const bad = validatePortalPassword('abc');
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.ok(bad.error.length > 0);
});

test('verification tokens are unguessable and unique', () => {
  const a = generateVerificationToken();
  const b = generateVerificationToken();
  assert.notEqual(a, b);
  // 32 bytes of hex. Short enough to survive an SMS, long enough not to be
  // enumerable.
  assert.equal(a.length, 64);
  assert.match(a, /^[0-9a-f]+$/);
});

test('the activation link is built safely', () => {
  assert.equal(
    activationUrl('https://church.example.com', 'abc123'),
    'https://church.example.com/activate/abc123',
  );
  // A trailing slash on the configured base URL must not double up.
  assert.equal(
    activationUrl('https://church.example.com/', 'abc123'),
    'https://church.example.com/activate/abc123',
  );
});

test('activation tokens are accepted once, while they are current', () => {
  const now = new Date('2026-03-01T12:00:00Z');

  const pending = {
    status: 'pending',
    verificationToken: 'tok',
    verificationExpiresAt: activationExpiry(now),
  };
  assert.equal(checkActivationToken(pending, now).ok, true);

  // A link that nobody recognises: no account, or a token already spent.
  const unknown = checkActivationToken(null, now);
  assert.equal(unknown.ok, false);
  if (!unknown.ok) assert.equal(unknown.reason, 'unknown');

  // An account already open is reported distinctly, so the member can be told
  // the good news rather than shown an error.
  const active = checkActivationToken(
    { status: 'active', verificationToken: 'tok' },
    now,
  );
  assert.equal(active.ok, false);
  if (!active.ok) assert.equal(active.reason, 'already_active');

  // Past its expiry the link is refused, so a forwarded old email cannot open
  // an account months later.
  const stale = checkActivationToken(
    {
      status: 'pending',
      verificationToken: 'tok',
      verificationExpiresAt: new Date('2026-02-01T12:00:00Z'),
    },
    now,
  );
  assert.equal(stale.ok, false);
  if (!stale.ok) assert.equal(stale.reason, 'expired');
});

test('the invitation tells the member how to sign in and activate', () => {
  const invite = {
    memberName: 'Ama Mensah',
    churchName: 'Grace Chapel',
    email: 'ama@example.com',
    password: 'TempPass123',
    loginUrl: 'https://church.example.com/login',
    username: 'ama.mensah',
    activationUrl: 'https://church.example.com/activate/tok',
  };

  const body = portalInviteBody(invite);
  assert.ok(body.includes('ama.mensah'), 'the username is shown');
  assert.ok(body.includes('TempPass123'), 'the password is shown');
  assert.ok(body.includes('/activate/tok'), 'the activation link is included');

  const sms = portalInviteSms(invite);
  assert.ok(sms.includes('ama.mensah'));
  assert.ok(sms.includes('/activate/tok'));
});

test('the invitation escapes anything a member typed into their name', () => {
  const body = portalInviteBody({
    memberName: '<script>alert(1)</script>',
    churchName: 'Grace & Peace',
    email: 'x@example.com',
    password: 'TempPass123',
    loginUrl: 'https://church.example.com/login',
  });
  assert.equal(body.includes('<script>'), false);
  assert.ok(body.includes('&amp;') || body.includes('Grace'));
});
