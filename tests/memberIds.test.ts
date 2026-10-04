import test from 'node:test';
import assert from 'node:assert/strict';
import { newDb } from 'pg-mem';
import { normalizeMemberId, allocateMemberId, migrateMemberIds } from '../src/lib/memberIds';
test('member IDs are six digits, preserve leading zeros and strip only a valid legacy prefix', () => {
  assert.equal(normalizeMemberId('MEM-001234'), '001234'); assert.equal(normalizeMemberId('000001'), '000001');
  for (const value of ['MEM-123-1', 'abc123', '12345', '1234567', null]) assert.equal(normalizeMemberId(value), null);
});
test('ID migration preserves valid IDs, repairs legacy collisions and is repeatable', async () => {
  const sql = newDb().adapters.createKnex();
  try {
    await sql.schema.createTable('members', t => { t.string('id').primary(); t.string('tenantId'); t.string('membershipId'); });
    await sql('members').insert([
      { id: 'a', tenantId: 'church-a', membershipId: '001234' },
      { id: 'b', tenantId: 'church-a', membershipId: 'MEM-001234' },
      { id: 'c', tenantId: 'church-a', membershipId: 'MEM-123456-1' },
      { id: 'd', tenantId: 'church-a', membershipId: null },
      { id: 'e', tenantId: 'church-b', membershipId: 'MEM-001234' },
    ]);
    await migrateMemberIds(sql);
    const first = await sql('members').orderBy('id');
    assert.equal(first[1].previousMembershipId, 'MEM-001234');
    assert.equal(first[0].membershipId, '001234'); assert.equal(first[4].membershipId, '001234');
    for (const member of first) assert.match(member.membershipId, /^\d{6}$/);
    assert.equal(new Set(first.filter(m => m.tenantId === 'church-a').map(m => m.membershipId)).size, 4);
    await migrateMemberIds(sql); assert.deepEqual(await sql('members').orderBy('id'), first);
    const id = await sql.transaction(async trx => { const id = await allocateMemberId(trx, 'church-a'); await trx('members').insert({ id: 'f', tenantId: 'church-a', membershipId: id }); return id; });
    assert.match(id, /^\d{6}$/); assert.equal(first.some(m => m.tenantId === 'church-a' && m.membershipId === id), false);
    await assert.rejects(sql.transaction(trx => allocateMemberId(trx, 'church-a', '001234')), /already in use/);
    await assert.rejects(sql.transaction(trx => allocateMemberId(trx, 'church-a', 'ABC123')), /exactly six/);
  } finally { await sql.destroy(); }
});
