/** Shared access policy for sign-in, refresh, and requests using existing tokens. */
export const CHURCH_UNAVAILABLE_MESSAGE = 'This church is deleted or suspended. Please contact your church administrator.';
export function churchBlocksAccess(tenant: { status?: string | null } | null | undefined): boolean {
  return !tenant || ['deleted', 'suspended'].includes(String(tenant.status || '').toLowerCase());
}
/** Missing activation preference means ready-to-use access; false remains an explicit opt-in to verification. */
export function portalActivationPreference(value: unknown): boolean {
  return value === undefined || value === null || value === true || value === 'true';
}
