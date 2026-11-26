import type { Knex } from 'knex';

/**
 * The members whose records feed one ministry's roster.
 *
 * Two sources are honoured: the member's own `ministryId` (used by older data
 * and by the member form's single-ministry field) and the `ministry_members`
 * join table (used when a member serves in more than one ministry). Reading
 * both is what keeps a newly added member visible immediately, whichever door
 * the assignment came through.
 */
export function ministryRoster(database: Knex, tenantId: string, ministryId: string) {
  return database('members as m').where('m.tenantId', tenantId).where(function () {
    const link = database('ministry_members as mm')
      .select(database.raw('1'))
      .where('mm.tenantId', tenantId)
      .where('mm.ministryId', ministryId) as any;
    // `whereColumn` is a runtime knex method but is missing from the older
    // bundled type definitions, so it is called through a narrow cast.
    link.whereColumn('mm.memberId', 'm.id');
    this.where('m.ministryId', ministryId).orWhereExists(link);
  });
}

/** The set of member ids in each ministry, from both assignment sources. */
async function ministrySets(database: Knex, tenantId: string) {
  const members = await database('members').where({ tenantId }).select('id', 'ministryId');
  const links = await database('ministry_members').where({ tenantId }).select('memberId', 'ministryId');
  const ids = new Set(members.map((m: any) => m.id));
  const sets = new Map<string, Set<string>>();
  for (const link of [...links, ...members.map((m: any) => ({ memberId: m.id, ministryId: m.ministryId }))] as any[]) {
    if (!link.ministryId || !ids.has(link.memberId)) continue;
    if (!sets.has(link.ministryId)) sets.set(link.ministryId, new Set());
    sets.get(link.ministryId)!.add(link.memberId);
  }
  return sets;
}

export async function ministryCounts(database: Knex, tenantId: string) {
  return Object.fromEntries([...await ministrySets(database, tenantId)].map(([id, set]) => [id, set.size]));
}

/**
 * Member display names per ministry. Bounded per ministry so a table cell is
 * readable; the full roster is still available from the ministry roster
 * endpoint.
 */
export async function ministryMemberNames(database: Knex, tenantId: string, limit = 20) {
  const sets = await ministrySets(database, tenantId);
  const ids = [...new Set([...sets.values()].flatMap(set => [...set]))];
  if (!ids.length) return {} as Record<string, string[]>;
  const rows = await database('members')
    .where({ tenantId })
    .whereIn('id', ids)
    .select('id', 'firstName', 'lastName', 'membershipId');
  const byId = new Map<string, string>(
    rows.map((m: any) => [m.id, `${m.firstName || ''} ${m.lastName || ''}`.trim() || m.membershipId || 'Unnamed member']),
  );
  return Object.fromEntries(
    [...sets].map(([id, set]) => [
      id,
      [...set].map(memberId => byId.get(memberId)).filter(Boolean).slice(0, limit) as string[],
    ]),
  );
}
