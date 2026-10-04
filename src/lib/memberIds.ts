import type { Knex } from 'knex';

export const SIX_DIGIT_MEMBER_ID = /^\d{6}$/;
/** Strip the legacy prefix only when the remaining value is exactly six digits. */
export function normalizeMemberId(value: unknown): string | null {
  const raw = String(value ?? '').trim().replace(/^MEM-/i, '');
  return SIX_DIGIT_MEMBER_ID.test(raw) ? raw : null;
}
/** Must be called in the same transaction as the member insert. Row-lock serializes allocation per church. */
export async function allocateMemberId(trx: Knex.Transaction, tenantId: string, requested?: unknown): Promise<string> {
  await trx('member_id_sequences').insert({ tenantId, nextValue: 1 }).onConflict('tenantId').ignore();
  const sequence = await trx('member_id_sequences').where({ tenantId }).forUpdate().first();
  if (requested !== undefined && requested !== null && String(requested).trim() !== '') {
    const id = normalizeMemberId(requested);
    if (!id) throw Object.assign(new Error('Member ID must contain exactly six digits.'), { status: 400 });
    if (await trx('members').where({ tenantId, membershipId: id }).first()) throw Object.assign(new Error(`Member ID ${id} is already in use in this church.`), { status: 409 });
    return id;
  }
  let value = Math.max(1, Number(sequence?.nextValue || 1));
  while (value <= 999999) {
    const id = String(value++).padStart(6, '0');
    if (!await trx('members').where({ tenantId, membershipId: id }).first()) {
      await trx('member_id_sequences').where({ tenantId }).update({ nextValue: value });
      return id;
    }
  }
  throw Object.assign(new Error('All six-digit member IDs are in use in this church.'), { status: 409 });
}
/** One-time normalization; internal member primary keys and linked records are unchanged. */
export async function migrateMemberIds(db: Knex): Promise<void> {
  if (!await db.schema.hasTable('members') || !await db.schema.hasColumn('members', 'membershipId')) return;
  if (!await db.schema.hasColumn('members', 'previousMembershipId')) {
    await db.schema.alterTable('members', table => table.string('previousMembershipId'));
  }
  if (!await db.schema.hasTable('member_id_sequences')) {
    await db.schema.createTable('member_id_sequences', t => { t.string('tenantId').primary(); t.integer('nextValue').notNullable().defaultTo(1); });
  }
  const tenants = await db('members').distinct('tenantId');
  for (const { tenantId } of tenants) {
    if (!tenantId) continue;
    await db.transaction(async trx => {
      await trx('member_id_sequences').insert({ tenantId, nextValue: 1 }).onConflict('tenantId').ignore();
      await trx('member_id_sequences').where({ tenantId }).forUpdate().first();
      const members = await trx('members').where({ tenantId }).orderBy('id').select('id', 'membershipId', 'previousMembershipId');
      // Reserve already-valid IDs first so a prefixed legacy ID cannot steal one.
      const used = new Set<string>();
      const pending: any[] = [];
      for (const member of members) {
        const raw = String(member.membershipId || '');
        if (SIX_DIGIT_MEMBER_ID.test(raw) && !used.has(raw)) used.add(raw);
        else pending.push(member);
      }
      let cursor = 1;
      for (const member of pending) {
        let normalized = normalizeMemberId(member.membershipId);
        if (!normalized || used.has(normalized)) {
          while (cursor <= 999999 && used.has(String(cursor).padStart(6, '0'))) cursor++;
          if (cursor > 999999) throw new Error('Cannot migrate member IDs: six-digit namespace exhausted.');
          normalized = String(cursor++).padStart(6, '0');
        }
        used.add(normalized);
        await trx('members').where({ id: member.id, tenantId }).update({ membershipId: normalized, previousMembershipId: member.previousMembershipId || member.membershipId || null });
      }
      // Keep a low cursor instead of skipping to the largest legacy number.
      while (cursor <= 999999 && used.has(String(cursor).padStart(6, '0'))) cursor++;
      await trx('member_id_sequences').where({ tenantId }).update({ nextValue: cursor });
    });
  }
  try {
    await db.schema.alterTable('members', table => table.unique(['tenantId', 'membershipId'], { indexName: 'members_tenant_six_digit_id_unique' }));
  } catch (error: any) {
    // Idempotent on PostgreSQL / MySQL; do not hide duplicate data or other DDL errors.
    if (!['42P07', '42710', 'ER_DUP_KEYNAME'].includes(error?.code) && !String(error?.message).includes('relation "members_tenant_six_digit_id_unique" already exists')) throw error;
  }

}
