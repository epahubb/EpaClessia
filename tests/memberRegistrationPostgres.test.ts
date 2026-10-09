import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import knex from 'knex';
import ClientPG from 'knex/lib/dialects/postgres/index.js';
import { PGlite } from '@electric-sql/pglite';
import db from '../src/lib/db';
import churchRouter from '../src/routes/church';
import { loginHandler } from '../src/routes/login';
import { authenticate } from '../src/middleware/auth';
import { signAccessToken } from '../src/lib/security';

// PGlite runs the PostgreSQL engine in WASM. Unlike pg-mem, it preserves
// PostgreSQL's aborted-transaction/COMMIT rollback behavior. The small adapter
// only bridges pg query results to Knex; production handlers are not mocked.
test('PostgreSQL registration survives failed notification logging after commit', async t => {
  const engine = new PGlite();
  await engine.waitReady;
  class EmbeddedPostgres extends ClientPG {
    async acquireRawConnection() {
      return { query(config: any, callback: any) {
        engine.query(config.text, config.values).then(result => callback(null, {
          rows: result.rows, fields: result.fields, rowCount: result.affectedRows ?? result.rows.length,
          command: /^\s*(select|with|show)/i.test(config.text) ? 'SELECT' : config.text.trim().split(/\s+/)[0].toUpperCase(),
        }), error => callback(error));
      } };
    }
    async destroyRawConnection() { /* engine belongs to the test, not the pool */ }
  }
  const sql = knex({ client: EmbeddedPostgres as any, connection: {}, pool: { min: 0, max: 1 } });
  const original = db.client; (db as any).client = sql.client;
  let server: ReturnType<typeof express.application.listen> | undefined;
  try {
    await sql.schema.createTable('tenants', table => { table.string('id').primary(); table.string('name'); table.string('status'); });
    await sql.schema.createTable('users', table => {
      table.string('uid').primary(); table.string('email').unique(); table.string('username'); table.string('name');
      for (const field of ['role','status','tenantId','password','phone','memberId','verificationToken','verifiedBy','twoFactorSecret']) table.string(field);
      for (const field of ['verificationExpiresAt','verifiedAt','createdAt','lastLogin']) table.timestamp(field);
      table.boolean('mustChangePassword'); table.boolean('twoFactorEnabled');
    });
    await sql.schema.createTable('member_id_sequences', table => { table.string('tenantId').primary(); table.integer('nextValue').notNullable(); });
    await sql.schema.createTable('members', table => {
      table.string('id').primary(); table.binary('photo'); table.string('photoMimeType'); table.timestamp('photoUpdatedAt');
      for (const field of ['tenantId','familyId','firstName','lastName','email','phone','gender','membershipStatus','membershipId','maritalStatus','occupation','address','branchId','ministryId','photoUrl','approvalStatus','notes','parentMemberId','spouseMemberId','spouseName','portalUserUid','portalUsername','portalStatus']) table.string(field);
      for (const field of ['dateOfBirth','anniversaryDate','joinDate','createdAt','portalInvitedAt','portalPasswordSetAt']) table.timestamp(field);
    });
    await sql.schema.createTable('ministry_members', table => { for (const field of ['id','ministryId','memberId','tenantId']) table.string(field); });
    await sql.schema.createTable('system_settings', table => { table.string('key'); table.text('value'); });
    await sql.schema.createTable('church_settings', table => { table.string('tenantId'); table.string('key'); table.text('value'); });
    await sql.schema.createTable('communications_log', table => {
      table.increments('id'); table.string('tenantId'); table.string('channel').notNullable();
      for (const field of ['recipient','subject','status','sentBy']) table.string(field);
      table.text('message'); table.timestamp('createdAt');
    });
    await sql.schema.createTable('login_logs', table => { table.increments('id'); for (const field of ['userId','userName','email','ipAddress']) table.string(field); table.boolean('success'); table.timestamp('createdAt'); });
    await sql.schema.createTable('audit_logs', table => { table.increments('id'); for (const field of ['adminUid','action','resource','resourceId','ipAddress','userAgent']) table.string(field); table.timestamp('createdAt'); });
    await sql('tenants').insert({ id: 'pg-church', name: 'Postgres Fixture Church', status: 'active' });
    await sql('users').insert({ uid: 'pg-admin', role: 'CHURCH_ADMIN', status: 'active', tenantId: 'pg-church' });
    await t.test('old wrong-column insert reproduces a silent rollback on COMMIT', async () => {
      await engine.query('BEGIN');
      await engine.query('INSERT INTO members (id, "tenantId") VALUES ($1,$2)', ['rollback-proof','pg-church']);
      await assert.rejects(engine.query('INSERT INTO communications_log (type) VALUES ($1)', ['sms']), (error: any) => error.code === '42703');
      // Merely catching the failed statement does not make the transaction healthy.
      await engine.query('COMMIT');
      assert.equal((await sql('members').where({ id: 'rollback-proof' })).length, 0);
    });
    const app = express(); app.use(express.json()); app.post('/auth/login', loginHandler); app.use('/church', authenticate, churchRouter);
    server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server!.once('listening', resolve));
    const base = `http://127.0.0.1:${(server.address() as any).port}`;
    const token = signAccessToken({ uid: 'pg-admin', role: 'CHURCH_ADMIN', tenantId: 'pg-church' });
    const create = async (username: string, extra: any = {}) => {
      const response = await fetch(base+'/church/members', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ firstName: 'Persisted', lastName: username, username, password: 'Synthetic<Pg>Pass2026!', ...extra }) });
      return { status: response.status, body: await response.json() as any };
    };
    await t.test('actual registration commits member, login and correct channel audit', async () => {
      const r = await create('pg.member', { email: 'pg@example.test', phone: '0000000000' });
      assert.equal(r.status, 201, JSON.stringify(r.body));
      assert.ok(await sql('members').where({ id: r.body.id }).first());
      assert.ok(await sql('users').where({ memberId: r.body.id }).first());
      assert.equal((await sql('communications_log').first()).channel, 'sms');
      assert.equal(r.body.portalAccess.emailSent, false); assert.equal(r.body.portalAccess.smsSent, false);
      const listing = await fetch(base+'/church/members?sort=newest', { headers: { Authorization: `Bearer ${token}` } });
      assert.equal(listing.status, 200); assert.equal((await listing.json() as any).data[0].id, r.body.id);
    });
    await t.test('missing audit table cannot undo member/login; login works after 201', async () => {
      await sql.schema.renameTable('communications_log','audit_unavailable');
      try {
        const r = await create('pg.audit.failure'); assert.equal(r.status, 201, JSON.stringify(r.body));
        assert.ok(await sql('members').where({ id: r.body.id }).first());
        const login = await fetch(base+'/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'pg.audit.failure', password: 'Synthetic<Pg>Pass2026!' }) });
        assert.equal(login.status, 200, await login.text());
      } finally { await sql.schema.renameTable('audit_unavailable','communications_log'); }
    });
    await t.test('credential conflict really rolls back member rather than returning false success', async () => {
      const before = Number((await sql('members').count('id as count').first())!.count);
      const r = await create('pg.member'); assert.equal(r.status, 400);
      assert.equal(Number((await sql('members').count('id as count').first())!.count), before);
    });
  } finally {
    if(server) { server.closeAllConnections(); await new Promise<void>(resolve => server!.close(() => resolve())); }
    (db as any).client = original; await sql.destroy(); await engine.close();
  }
});
