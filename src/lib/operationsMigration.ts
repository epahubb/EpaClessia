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
  for (const table of ['donations','expenses','events']) {
    if (!await db.schema.hasColumn(table, 'ministryId')) await db.schema.alterTable(table, t => { t.string('ministryId'); t.index(['tenantId','ministryId']); });
  }
  if (await db.schema.hasTable('member_dues_payments')) {
    for (const field of ['collectionPeriod', 'externalReference', 'recordedBy']) if (!await db.schema.hasColumn('member_dues_payments', field)) await db.schema.alterTable('member_dues_payments', t => t.string(field));
    if (!await db.schema.hasColumn('member_dues_payments', 'notes')) await db.schema.alterTable('member_dues_payments', t => t.text('notes'));
  }
  // Repair only explicit leader-account assignments, never infer permissions from a name.
  const leaders = await db('church_groups as g').join('users as u', function () { this.on('u.uid','=','g.leaderId').andOn('u.tenantId','=','g.tenantId'); }).where({ 'g.active': true, 'u.status': 'active', 'u.role': 'MEMBER' }).select('u.uid','u.tenantId');
  for (const leader of leaders) await db.transaction(async trx => { await trx('users').where({ uid: leader.uid, tenantId: leader.tenantId, role: 'MEMBER' }).update({ role: 'GROUP_LEADER' }); await trx('user_tenant_roles').where({ userId: leader.uid, tenantId: leader.tenantId }).update({ role: 'GROUP_LEADER' }); });
  const found = await db('role_permissions').where({ role: 'GROUP_LEADER' }).first();
  if (!found) await db('role_permissions').insert({ role: 'GROUP_LEADER', permissions: '[]', updatedAt: new Date() });
}
