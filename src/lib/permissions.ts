/**
 * Role permission resolution.
 *
 * Permissions are stored in two layers:
 *
 *  1. `role_permissions`        -- platform-wide defaults, edited by the super
 *                                 admin. One row per role.
 *  2. `church_role_permissions` -- per-church overrides, edited by a church
 *                                 admin. Composite key (tenantId, role).
 *
 * A church that has never customised a role inherits the platform default, so
 * adding this layer changed no existing behaviour. The alternative -- widening
 * the primary key of `role_permissions` to (tenantId, role) -- would have meant
 * dropping and rebuilding a live table, which SQLite cannot do in place and
 * which risks the permission matrix of every church on the platform.
 */

/** Sentinel tenant used for rows that are platform-wide rather than per-church. */
export const PLATFORM_TENANT = '__platform__';

/** Every permission code the product understands. */
export const PERMISSION_CODES = [
  'churches.manage',
  'billing.manage',
  'users.manage',
  'members.manage',
  'events.manage',
  'giving.manage',
  'comms.send',
  'reports.view',
  'settings.manage',
  'finance.manage',
  'attendance.manage',
] as const;

export type PermissionCode = (typeof PERMISSION_CODES)[number];

/** Roles that exist inside a church and may have their permissions customised. */
export const CHURCH_EDITABLE_ROLES = [
  'CHURCH_ADMIN',
  'PASTOR',
  'MINISTRY_LEADER',
  'FINANCE',
  'SECRETARY',
  'MEMBER',
] as const;

/**
 * Permissions that govern the platform itself. A church admin must never be able
 * to grant these to anyone in their own church -- doing so would let a tenant
 * award itself control of other tenants or of platform billing.
 */
export const PLATFORM_ONLY_PERMISSIONS: string[] = ['churches.manage', 'billing.manage'];

export const isKnownPermission = (code: unknown): boolean =>
  typeof code === 'string' && (PERMISSION_CODES as readonly string[]).includes(code);

export const isChurchEditableRole = (role: unknown): boolean =>
  typeof role === 'string' && (CHURCH_EDITABLE_ROLES as readonly string[]).includes(role);

/**
 * Read a stored permissions value. Rows may hold a JSON string (normal), an
 * already-parsed array (some drivers), or null/garbage (older rows).
 */
export function parsePermissions(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter((c): c is string => typeof c === 'string');
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((c): c is string => typeof c === 'string') : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function serializePermissions(codes: string[]): string {
  return JSON.stringify(codes);
}

/**
 * Clean a permission list arriving from a client: drop unknown codes, remove
 * duplicates, and (unless this is a platform-level edit) strip platform-only
 * permissions. Order follows PERMISSION_CODES so stored rows are stable.
 */
export function sanitizePermissions(
  requested: unknown,
  opts: { allowPlatformOnly?: boolean } = {},
): string[] {
  const list = Array.isArray(requested) ? requested : [];
  const seen = new Set<string>();
  for (const code of list) {
    if (!isKnownPermission(code)) continue;
    if (!opts.allowPlatformOnly && PLATFORM_ONLY_PERMISSIONS.includes(code as string)) continue;
    seen.add(code as string);
  }
  return (PERMISSION_CODES as readonly string[]).filter((c) => seen.has(c));
}

export interface RolePermissionRow {
  role: string;
  permissions?: unknown;
}

export interface ResolvedRolePermission {
  role: string;
  permissions: string[];
  /** True when this church has customised the role away from the platform default. */
  customised: boolean;
}

/**
 * Combine platform defaults with a church's overrides.
 *
 * An override replaces the default outright rather than merging code-by-code: a
 * church admin who unticks a permission expects it gone, not restored from the
 * default on the next read. An empty override is therefore meaningful and is
 * preserved.
 */
export function resolveRolePermissions(
  defaults: RolePermissionRow[],
  overrides: RolePermissionRow[],
  roles: readonly string[] = CHURCH_EDITABLE_ROLES,
): ResolvedRolePermission[] {
  const defaultMap = new Map<string, string[]>();
  for (const row of defaults || []) {
    if (row && typeof row.role === 'string') defaultMap.set(row.role, parsePermissions(row.permissions));
  }

  const overrideMap = new Map<string, string[]>();
  for (const row of overrides || []) {
    if (row && typeof row.role === 'string') overrideMap.set(row.role, parsePermissions(row.permissions));
  }

  return roles.map((role) => {
    const customised = overrideMap.has(role);
    const permissions = customised ? overrideMap.get(role)! : defaultMap.get(role) || [];
    return {
      role,
      // A church can never hold platform-only permissions, whatever is stored.
      permissions: sanitizePermissions(permissions),
      customised,
    };
  });
}

/** Does a resolved matrix grant `code` to `role`? */
export function roleHasPermission(
  resolved: ResolvedRolePermission[],
  role: string,
  code: string,
): boolean {
  const entry = (resolved || []).find((r) => r.role === role);
  return !!entry && entry.permissions.includes(code);
}
