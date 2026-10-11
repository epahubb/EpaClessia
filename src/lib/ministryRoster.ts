import type { Knex } from 'knex';
export function ministryRoster(database: Knex, tenantId: string, ministryId: string) {
  return database('members as m').where('m.tenantId', tenantId).where(function () {
    this.where('m.ministryId', ministryId).orWhereExists(database('ministry_members as mm').select(database.raw('1')).where('mm.tenantId', tenantId).where('mm.ministryId', ministryId).whereRaw('mm."memberId" = m.id'));
  });
}
export async function ministryCounts(database: Knex, tenantId: string) {
  const members = await database('members').where({ tenantId }).select('id', 'ministryId');
  const links = await database('ministry_members').where({ tenantId }).select('memberId', 'ministryId');
  const ids = new Set(members.map(m => m.id)); const sets = new Map<string, Set<string>>();
  for (const link of [...links, ...members.map(m => ({ memberId: m.id, ministryId: m.ministryId }))]) {
    if (!link.ministryId || !ids.has(link.memberId)) continue;
    if (!sets.has(link.ministryId)) sets.set(link.ministryId, new Set());
    sets.get(link.ministryId)!.add(link.memberId);
  }
  return Object.fromEntries([...sets].map(([id, set]) => [id, set.size]));
}
