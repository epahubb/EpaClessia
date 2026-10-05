import type { Knex } from 'knex';
export async function migrateOperations(db: Knex) {
  if (!(await db.schema.hasColumn('users', 'tokenVersion'))) await db.schema.alterTable('users', t => t.integer('tokenVersion').notNullable().defaultTo(0));
  if (!(await db.schema.hasColumn('donations', 'receivedAt'))) {
    await db.schema.alterTable('donations', t => t.timestamp('receivedAt'));
    await db('donations').whereNull('receivedAt').update({ receivedAt: db.ref('createdAt') });
  }
  if (!(await db.schema.hasTable('group_followups'))) await db.schema.createTable('group_followups', t => {
    t.string('id').primary(); t.string('tenantId').notNullable(); t.string('groupId').notNullable(); t.string('memberId').notNullable();
    t.string('createdBy').notNullable(); t.string('type').notNullable(); t.text('note').notNullable(); t.string('status').notNullable().defaultTo('open');
    t.timestamp('dueAt'); t.timestamp('createdAt').notNullable(); t.timestamp('updatedAt').notNullable(); t.index(['tenantId', 'groupId']);
  });
  if (!(await db.schema.hasTable('church_finance_invoices'))) await db.schema.createTable('church_finance_invoices', t => {
    t.string('id').primary(); t.string('tenantId').notNullable(); t.string('recipient').notNullable(); t.text('description').notNullable();
    t.decimal('amount', 14, 2).notNullable(); t.string('currency').notNullable().defaultTo('GHS'); t.string('status').notNullable().defaultTo('issued');
    t.timestamp('issueAt').notNullable(); t.timestamp('dueAt'); t.timestamp('createdAt').notNullable(); t.string('recordedBy'); t.index(['tenantId', 'issueAt']);
  });
  const found = await db('role_permissions').where({ role: 'GROUP_LEADER' }).first();
  if (!found) await db('role_permissions').insert({ role: 'GROUP_LEADER', permissions: '[]', updatedAt: new Date() });
}
