import type { Knex } from 'knex';
import db from './db';
import { toDataUrl } from './images';

/** Safe, authoritative account context. Never return a password or 2FA secret. */
export async function sessionUser(account: any, connection: Knex = db) {
  const tenant = account.tenantId ? await connection('tenants').where({ id: account.tenantId }).first() : null;
  const logo = tenant ? (toDataUrl(tenant.logoImage, tenant.logoMimeType) || tenant.logo || null) : null;
  const roles = tenant ? [{ id: `account-${account.uid}-${tenant.id}`, userId: account.uid, userName: account.name, tenantId: tenant.id, tenantName: tenant.name, role: account.role, logo }] : [];
  return { id: account.uid, email: account.email, username: account.username, role: account.role, name: account.name, status: account.status, tenantId: account.tenantId, tenant: tenant ? { id: tenant.id, name: tenant.name, logo } : null, roles };
}
