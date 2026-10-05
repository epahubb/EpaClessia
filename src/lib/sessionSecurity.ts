import { createHmac, timingSafeEqual } from 'node:crypto';
import { JWT_SECRET } from './config';
export function sessionClaims(user: any) {
  return { tokenVersion: Number(user.tokenVersion || 0), credentialTag: createHmac('sha256', JWT_SECRET).update(`${user.uid}:${user.password || ''}`).digest('hex') };
}
export function sessionIsCurrent(claims: any, user: any) {
  if (Number(claims.tokenVersion || 0) !== Number(user.tokenVersion || 0)) return false;
  // Accounts with passwords require the new credential binding. Old sessions must sign in again.
  if (!claims.credentialTag) return !user.password;
  const expected = Buffer.from(sessionClaims(user).credentialTag);
  const actual = Buffer.from(String(claims.credentialTag));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
