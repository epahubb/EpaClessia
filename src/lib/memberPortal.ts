import { randomBytes, randomInt } from 'crypto';

/**
 * Member portal access.
 *
 * Registering a member now also gives that person a way in: an account on the
 * member portal where they can see their own giving, attendance, events and
 * profile. This module holds the parts that are pure logic - generating a
 * first-time password and wording the invitation - so they can be tested
 * without a database or a mail provider.
 */

/** Roles that mean "this account is a member of a church", not staff. */
export const MEMBER_PORTAL_ROLE = 'MEMBER';

/**
 * Characters used for a first-time password.
 *
 * Deliberately excludes the pairs people misread when a password is dictated
 * over the phone or copied off a printed slip: O/0, I/l/1. A member who cannot
 * type the password we sent them has no portal access, so legibility matters
 * more here than squeezing in four more symbols.
 */
const PASSWORD_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

/**
 * Generate a first-time portal password.
 *
 * Uses `randomInt` (rejection sampling) rather than `% alphabet.length`, which
 * would bias the early characters of the alphabet.
 */
export function generateTempPassword(length = 10): string {
  const size = Math.max(8, length);
  let out = '';
  for (let i = 0; i < size; i += 1) {
    out += PASSWORD_ALPHABET[randomInt(PASSWORD_ALPHABET.length)];
  }
  return out;
}

/** A unique id for a newly provisioned portal user. */
export function generatePortalUid(): string {
  return `user_${Date.now()}_${randomBytes(4).toString('hex')}`;
}

/** Whether an address is usable as a portal login. */
export function isUsableLoginEmail(email: unknown): boolean {
  const value = String(email ?? '').trim();
  if (!value) return false;
  // Deliberately loose: the goal is to reject blanks and obvious rubbish, not
  // to adjudicate RFC 5322. Anything that survives here still has to receive
  // the invitation before it is any use.
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}

/** Normalised form used for the login and for matching existing accounts. */
export function normalizeLoginEmail(email: unknown): string {
  return String(email ?? '').trim().toLowerCase();
}

export type PortalInvite = {
  memberName: string;
  churchName: string;
  email: string;
  password: string;
  loginUrl: string;
  /** Present when the church admin chose a username for the member. */
  username?: string;
  /**
   * One-click activation link. Present while the account is still pending, so
   * the member can activate it themselves instead of waiting for the church.
   */
  activationUrl?: string;
};

/** Subject line for the invitation email. */
export function portalInviteSubject(churchName: string): string {
  return `Your ${churchName || 'church'} member portal login`;
}

/** Body of the invitation email, as HTML fragment content. */
export function portalInviteBody(invite: PortalInvite): string {
  const { memberName, churchName, email, password, username, activationUrl } = invite;

  // A username is shown only when the church set one. Members sign in with
  // either their username or their email address, and saying so here prevents
  // the support call from anyone who was given one and assumed it replaced the
  // other.
  const signInLine = username
    ? `<strong>Username:</strong> ${escapeHtml(username)}<br />
      <strong>Or email:</strong> ${escapeHtml(email)}<br />`
    : `<strong>Email:</strong> ${escapeHtml(email)}<br />`;

  // The activation step is stated as a requirement, not an invitation: the
  // account genuinely cannot sign in until it happens, so burying it below the
  // password would produce members who think their credentials are wrong.
  const activation = activationUrl
    ? `<p>
        <strong>First, activate your account.</strong> Click the button below (or
        open the link) to confirm this is your email address. Your church can
        also activate it for you if you cannot use the link.
      </p>
      <p style="word-break:break-all;font-size:12px;color:#6b7280;">${escapeHtml(activationUrl)}</p>`
    : '';

  return `
    <p>Hello ${escapeHtml(memberName || 'there')},</p>
    <p>
      A member portal account has been created for you at
      <strong>${escapeHtml(churchName || 'your church')}</strong>. You can use it to
      see your giving history, your attendance, upcoming events and to keep your
      own details up to date.
    </p>
    ${activation}
    <p style="margin:24px 0;padding:16px;background:#f9fafb;border-radius:8px;">
      ${signInLine}
      <strong>Password:</strong>
      <code style="font-size:16px;letter-spacing:1px;">${escapeHtml(password)}</code>
    </p>
    <p>Please change this password after you sign in for the first time.</p>
  `.trim();
}

/**
 * The invitation as an SMS.
 *
 * Kept short enough for a single message segment where possible, because a
 * member on a pay-as-you-go plan should not receive three fragments to read one
 * password. The password is on its own line so it is easy to copy.
 */
export function portalInviteSms(invite: PortalInvite): string {
  const { churchName, email, password, loginUrl, username, activationUrl } = invite;
  return [
    `${churchName || 'Your church'} member portal is ready.`,
    `Login: ${username || email}`,
    `Password: ${password}`,
    // The activation link replaces the sign-in link while activation is
    // outstanding: sending both would offer a door that is still locked.
    activationUrl ? `Activate: ${activationUrl}` : loginUrl,
    'Please change your password after signing in.',
  ].join('\n');
}

/** Escape text that is interpolated into the HTML email. */
function escapeHtml(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Why a member has no portal account, in words the church admin can act on.
 */
export type PortalSkipReason = 'no_email' | 'email_taken';

export function portalSkipMessage(reason: PortalSkipReason): string {
  if (reason === 'email_taken') {
    return 'That email address already belongs to another account, so no portal login was created. Use a different address for this member.';
  }
  return 'No portal login was created because this member has no email address. Add one and use “Send portal invite”.';
}

/* --- Usernames -------------------------------------------------------- */

/**
 * What a username may contain.
 *
 * Deliberately narrow: letters, digits, dot, dash and underscore. Spaces and
 * accents are excluded because a username is typed by hand at a sign-in screen,
 * often on a phone keypad, and because "john smith" and "john  smith" would
 * otherwise be two different accounts nobody can tell apart.
 */
const USERNAME_PATTERN = /^[a-zA-Z0-9._-]{3,32}$/;

export const USERNAME_RULES =
  'A username must be 3-32 characters and use only letters, numbers, dots, dashes or underscores.';

/** Usernames are matched case-insensitively, so they are stored folded. */
export function normalizeUsername(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

export function isUsableUsername(value: unknown): boolean {
  return USERNAME_PATTERN.test(String(value ?? '').trim());
}

/**
 * Suggest a username from a member's name, e.g. "Ama Mensah" -> "ama.mensah".
 *
 * Only a suggestion: the church admin can overwrite it, and the caller must
 * still resolve collisions against accounts that already exist.
 */
export function suggestUsername(firstName?: string | null, lastName?: string | null): string {
  const parts = [firstName, lastName]
    .map((p) => String(p ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ''))
    .filter(Boolean);
  const base = parts.join('.').slice(0, 32);
  // Pad rather than return something too short to be accepted.
  return base.length >= 3 ? base : `member.${randomBytes(2).toString('hex')}`;
}

/* --- Passwords chosen by the church admin ----------------------------- */

export const PORTAL_PASSWORD_MIN_LENGTH = 8;

/**
 * Check a password typed by the church admin on the member's behalf.
 *
 * The platform's staff policy (12 characters, mixed case, symbol) is not
 * applied here. This password is a first-time credential the admin has to read
 * out to a member, and an unusable rule produces the thing it was meant to
 * prevent: one weak password reused for the whole congregation, or a written
 * list on a desk. A length floor and a rejection of the obvious guesses is the
 * honest trade-off, and the member is told to change it at first sign-in.
 */
export function validatePortalPassword(password: unknown): { ok: true } | { ok: false; error: string } {
  const value = String(password ?? '');
  if (value.length < PORTAL_PASSWORD_MIN_LENGTH) {
    return {
      ok: false,
      error: `The password must be at least ${PORTAL_PASSWORD_MIN_LENGTH} characters.`,
    };
  }
  if (value.length > 200) {
    return { ok: false, error: 'The password is too long.' };
  }
  if (/^\s|\s$/.test(value)) {
    // A leading or trailing space survives a copy-paste and then fails at the
    // sign-in screen, where nobody can see it.
    return { ok: false, error: 'The password cannot start or end with a space.' };
  }
  const WEAK = ['password', '12345678', 'password1', 'qwertyui', 'church123', 'iloveyou'];
  if (WEAK.includes(value.toLowerCase())) {
    return { ok: false, error: 'That password is too easy to guess. Please choose another.' };
  }
  return { ok: true };
}

/* --- Email verification ----------------------------------------------- */

/**
 * A verification token.
 *
 * 32 random bytes from the CSPRNG: this token alone activates an account, so it
 * has to be unguessable rather than merely unique.
 */
export function generateVerificationToken(): string {
  return randomBytes(32).toString('hex');
}

/** The link a member clicks to activate their own account. */
export function activationUrl(baseUrl: string, token: string): string {
  return `${String(baseUrl || '').replace(/\/+$/, '')}/activate/${encodeURIComponent(token)}`;
}

/**
 * How long an activation link stays valid.
 *
 * Long enough for a member who checks email weekly; short enough that a token
 * sitting in an old mailbox is not a permanent way in.
 */
export const ACTIVATION_TOKEN_TTL_DAYS = 14;

export function activationExpiry(from: Date = new Date()): Date {
  return new Date(from.getTime() + ACTIVATION_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
}

export type ActivationCheck =
  | { ok: true }
  | { ok: false; reason: 'unknown' | 'expired' | 'already_active'; message: string };

/**
 * Decide whether an activation token may be used.
 *
 * An already-active account reports success-shaped wording rather than an
 * error: a member who clicks the link twice, or whose church activated them in
 * the meantime, has done nothing wrong and should not be shown a failure.
 */
export function checkActivationToken(
  // The account row as loaded from the database. Only the three fields this
  // decision rests on are required; callers pass the whole row.
  account:
    | {
        status?: string | null;
        verificationToken?: string | null;
        verificationExpiresAt?: string | Date | null;
      }
    | null
    | undefined,
  now: Date = new Date(),
): ActivationCheck {
  if (!account) {
    return {
      ok: false,
      reason: 'unknown',
      message:
        'This activation link is not valid. It may already have been used, or a newer invitation may have replaced it. Ask your church to send a new one.',
    };
  }
  if (account.status && account.status !== 'pending') {
    return {
      ok: false,
      reason: 'already_active',
      message: 'This account is already active. You can sign in with your username or email address.',
    };
  }
  const expiry = account.verificationExpiresAt ? new Date(account.verificationExpiresAt) : null;
  if (expiry && !Number.isNaN(expiry.getTime()) && expiry.getTime() < now.getTime()) {
    return {
      ok: false,
      reason: 'expired',
      message:
        'This activation link has expired. Ask your church to send a new invitation, or ask them to activate your account for you.',
    };
  }
  return { ok: true };
}

/** Told to anyone who tries to sign in before activating. */
export const PORTAL_PENDING_MESSAGE =
  'Your account has not been activated yet. Open the activation link in your invitation email, or ask your church to activate it for you.';
