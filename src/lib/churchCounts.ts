import type { Knex } from 'knex';
/** Counts all member records, including members without portal access. Users/staff are never the count source. */
export function churchesWithMemberCounts(db: Knex) {
  const counts = db('members').select('tenantId').count({ memberCount: 'id' }).groupBy('tenantId').as('roster_counts');
  return db('tenants').leftJoin(counts, 'tenants.id', 'roster_counts.tenantId').select('tenants.*', db.raw('COALESCE(??, 0) as ??', ['roster_counts.memberCount', 'memberCount']));
}
