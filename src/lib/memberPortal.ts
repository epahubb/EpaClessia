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
};

/** Subject line for the invitation email. */
export function portalInviteSubject(churchName: string): string {
  return `Your ${churchName || 'church'} member portal login`;
}

/** Body of the invitation email, as HTML fragment content. */
export function portalInviteBody(invite: PortalInvite): string {
  const { memberName, churchName, email, password } = invite;
  return `
    <p>Hello ${escapeHtml(memberName || 'there')},</p>
    <p>
      A member portal account has been created for you at
      <strong>${escapeHtml(churchName || 'your church')}</strong>. You can use it to
      see your giving history, your attendance, upcoming events and to keep your
      own details up to date.
    </p>
    <p style="margin:24px 0;padding:16px;background:#f9fafb;border-radius:8px;">
      <strong>Email:</strong> ${escapeHtml(email)}<br />
      <strong>Temporary password:</strong>
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
  const { churchName, email, password, loginUrl } = invite;
  return [
    `${churchName || 'Your church'} member portal is ready.`,
    `Login: ${email}`,
    `Password: ${password}`,
    loginUrl,
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
