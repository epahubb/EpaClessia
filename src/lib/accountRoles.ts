export const CHURCH_ACCOUNT_ROLES = ['CHURCH_ADMIN', 'PASTOR', 'MINISTRY_LEADER', 'FINANCE', 'SECRETARY', 'MEMBER'] as const;
export function canonicalRole(role: unknown): string {
  const value = String(role || '').toUpperCase();
  return value === 'ADMIN' ? 'CHURCH_ADMIN' : value;
}
export function isChurchRole(role: unknown): boolean { return (CHURCH_ACCOUNT_ROLES as readonly string[]).includes(canonicalRole(role)); }
