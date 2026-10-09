import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import bcrypt from 'bcryptjs';
import sharp from 'sharp';
import { newDb, DataType } from 'pg-mem';
import db from '../src/lib/db';
import churchRouter from '../src/routes/church';
import memberRouter from '../src/routes/member';
import { loginHandler } from '../src/routes/login';
import { authenticate } from '../src/middleware/auth';
import { sanitizeRequest } from '../src/middleware/security';
import { currentAccount } from '../src/routes/account';
import { signAccessToken } from '../src/lib/security';

// Exercise the production registration route, production login handler and
// member authorization against a SQL database, not mocked response payloads.
test('registration credentials log in to the member API, with or without email', async t => {
  const memory = newDb();
  memory.public.registerFunction({ name: 'current_database', returns: DataType.text, implementation: () => 'pgmem' });
  memory.public.registerFunction({ name: 'current_schema', returns: DataType.text, implementation: () => 'public' });
  const sql = memory.adapters.createKnex();
  const originalClient = db.client;
  (db as any).client = sql.client;
  await sql.schema.createTable('tenants', table => { table.string('id').primary(); table.string('name'); table.string('status'); });
  await sql.schema.createTable('users', table => {
    table.string('uid').primary(); table.string('email').unique().nullable(); table.string('username'); table.string('name');
    table.string('role'); table.string('status'); table.string('tenantId'); table.string('password'); table.string('phone');
    table.string('memberId'); table.boolean('mustChangePassword'); table.string('verificationToken');
    table.timestamp('verificationExpiresAt'); table.timestamp('verifiedAt'); table.string('verifiedBy');
    table.timestamp('createdAt'); table.timestamp('lastLogin'); table.boolean('twoFactorEnabled'); table.string('twoFactorSecret');
  });
  await sql.schema.createTable('member_id_sequences', table => { table.string('tenantId').primary(); table.integer('nextValue').notNullable(); });
  await sql.schema.createTable('members', table => {
    table.string('id').primary(); table.binary('photo'); table.string('photoMimeType'); table.timestamp('photoUpdatedAt'); table.text('commPreferences');
    for (const name of ['tenantId','familyId','firstName','lastName','email','phone','gender','membershipStatus','membershipId','maritalStatus','occupation','address','branchId','ministryId','photoUrl','approvalStatus','notes','parentMemberId','spouseMemberId','spouseName','portalUserUid','portalUsername','portalStatus']) table.string(name);
    for (const name of ['dateOfBirth','anniversaryDate','joinDate','createdAt','portalInvitedAt','portalPasswordSetAt']) table.timestamp(name);
  });
  await sql.schema.createTable('ministry_members', table => { table.string('id'); table.string('ministryId'); table.string('memberId'); table.string('tenantId'); });
  await sql.schema.createTable('system_settings', table => { table.string('key'); table.text('value'); });
  await sql.schema.createTable('communications_log', table => {
    table.increments('id'); for (const name of ['tenantId','recipient','subject','message','status']) table.string(name); table.string('channel').notNullable(); table.timestamp('createdAt');
  });
  await sql.schema.createTable('login_logs', table => {
    table.increments('id'); for (const name of ['userId','userName','email','ipAddress']) table.string(name); table.boolean('success'); table.timestamp('createdAt');
  });
  await sql.schema.createTable('audit_logs', table => {
    table.increments('id'); for (const name of ['adminUid','action','resource','resourceId','ipAddress','userAgent']) table.string(name); table.timestamp('createdAt');
  });
  await sql('tenants').insert({ id: 'church-fixture', name: 'Fixture Church', status: 'active' });
  await sql('users').insert({ uid: 'admin-fixture', email: 'admin@example.test', name: 'Church Admin', role: 'CHURCH_ADMIN', status: 'active', tenantId: 'church-fixture' });
  const app = express(); app.use(express.json()); app.use(sanitizeRequest);
  app.post('/api/v1/auth/login', loginHandler);
  app.get('/api/v1/auth/me', authenticate, currentAccount);
  app.use('/api/v1/church', authenticate, churchRouter);
  app.use('/api/v1/member', authenticate, memberRouter);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as any).port}/api/v1`;
  const token = signAccessToken({ uid: 'admin-fixture', email: 'admin@example.test', role: 'CHURCH_ADMIN', tenantId: 'church-fixture' });
  const request = async (path: string, body: any, bearer?: string) => {
    const response = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() as any };
  };
  try {
    for (const [index, email] of [[1, 'member1@example.test'], [2, null]] as const) {
      await t.test(email ? 'email member uses the exact registration password' : 'username-only member needs no email', async () => {
        const password = 'Exact<Register>&Pass2026!';
        const username = `Fixture.Member${index}`;
        const created = await request('/church/members', { firstName: 'Fixture', lastName: `Member${index}`, email, username, password }, token);
        assert.equal(created.status, 201, JSON.stringify(created.body));
        assert.match(created.body.membershipId, /^\d{6}$/);
        assert.equal(created.body.portalAccess.created, true);
        assert.equal(created.body.portalAccess.username, username.toLowerCase());
        assert.equal(created.body.portalAccess.status, 'active');
        assert.equal((await sql('members').where({ id: created.body.id }).first())?.id, created.body.id);
        assert.ok(await sql('communications_log').where({ recipient: email || username.toLowerCase() }).first());
        assert.equal(JSON.stringify(created.body).includes(password), false);
        const account = await sql('users').where({ memberId: created.body.id }).first();
        assert.equal(account.role, 'MEMBER'); assert.equal(account.email, email);
        assert.equal(await bcrypt.compare(password, account.password), true);
        assert.equal(await bcrypt.compare('DifferentPassword26', account.password), false);
        const signedIn = await request('/auth/login', { username: `  ${username.toUpperCase()}  `, password });
        assert.equal(signedIn.status, 200, JSON.stringify(signedIn.body));
        assert.equal(signedIn.body.user.role, 'MEMBER'); assert.ok(signedIn.body.token);
        const profile = await fetch(base + '/member/profile', { headers: { Authorization: `Bearer ${signedIn.body.token}` } });
        assert.equal(profile.status, 200, await profile.text());
        const wrong = await request('/auth/login', { identifier: username, password: 'WrongPassword26' });
        assert.equal(wrong.status, 401);
        const failedLogin = await sql('login_logs').where({ userId: account.uid, success: false }).first();
        assert.equal(failedLogin.email, username.toLowerCase(), 'username failures remain visible to the account lockout guard');
      });
    }
    const list = async (query: string) => {
      const response = await fetch(base + '/church/members?' + query, { headers: { Authorization: `Bearer ${token}` } });
      return { status: response.status, cache: response.headers.get('cache-control'), body: await response.json() as any };
    };
    await t.test('registered members are immediately available in an uncached newest-first list', async () => {
      const created = await request('/church/members', { firstName: 'Newest', lastName: 'Zulu', username: 'newest.zulu', password: 'ExactRegistrationPass26!' }, token);
      assert.equal(created.status, 201);
      const result = await list('page=1&limit=50&sort=newest');
      assert.equal(result.status, 200, JSON.stringify(result.body));
      assert.equal(result.cache, 'no-store');
      assert.equal(result.body.data[0].id, created.body.id);
      assert.equal(typeof result.body.pagination.total, 'number');
      assert.equal('photo' in result.body.data[0], false);
    });
    await t.test('members beyond fifty are reachable; totals and search remain tenant scoped', async () => {
      const fixtures = Array.from({length: 57}, (_, i) => ({ id: `paged-${i}`, tenantId: 'church-fixture', firstName: 'Earlier', lastName: `A${String(i).padStart(2, '0')}`, membershipId: String(100000+i), createdAt: new Date('2025-01-01T00:00:00Z') }));
      await sql('members').insert([...fixtures, { id: 'foreign-member', tenantId: 'other-church', firstName: 'Foreign', lastName: 'Zulu', membershipId: '999999', createdAt: new Date('2030-01-01') }]);
      try {
        const first = await list('page=1&limit=50&sort=newest');
        const second = await list('page=2&limit=50&sort=newest');
        assert.equal(first.status, 200); assert.equal(second.status, 200);
        assert.equal(first.body.data.length, 50);
        assert.equal(second.body.data.length, first.body.pagination.total-50);
        const all = [...first.body.data, ...second.body.data];
        assert.equal(new Set(all.map(m => m.id)).size, first.body.pagination.total);
        assert.equal(all.some(m => m.id==='foreign-member'), false);
        const found = await list('search=newest&sort=newest');
        assert.equal(found.body.pagination.total, 1); assert.equal(found.body.data[0].lastName, 'Zulu');
        const idSearch = await list('search=100056');
        assert.equal(idSearch.body.data[0].id, 'paged-56');
      } finally { await sql('members').whereIn('id', [...fixtures.map(m=>m.id),'foreign-member']).del(); }
    });
    await t.test('invalid member pagination is rejected rather than silently truncated', async () => {
      for(const q of ['page=0','page=-1','limit=501','limit=no','sort=bad']) assert.equal((await list(q)).status, 400, q);
    });
    await t.test('invitation audit failure cannot roll back registration or its login', async () => {
      await sql.schema.renameTable('communications_log', 'communications_log_unavailable');
      try {
        const created = await request('/church/members', { firstName: 'Audit', lastName: 'Unavailable', username: 'audit.unavailable', password: 'ExactRegistrationPass26!' }, token);
        assert.equal(created.status, 201, JSON.stringify(created.body));
        assert.ok(await sql('members').where({ id: created.body.id }).first());
        const login = await request('/auth/login', { username: 'audit.unavailable', password: 'ExactRegistrationPass26!' });
        assert.equal(login.status, 200);
        const result = await list('search=Unavailable');
        assert.equal(result.body.data[0].id, created.body.id);
      } finally { await sql.schema.renameTable('communications_log_unavailable', 'communications_log'); }
    });
    await t.test('weak entered password is rejected before registering a member', async () => {
      const before = (await sql('members')).length;
      const response = await request('/church/members', { firstName: 'Invalid', lastName: 'Credentials', username: 'invalid.member', password: 'short' }, token);
      assert.equal(response.status, 400); assert.match(response.body.error, /at least 8/);
      assert.equal((await sql('members')).length, before);
    });
    await t.test('duplicate username never reports successful credential creation', async () => {
      const response = await request('/church/members', { firstName: 'Another', lastName: 'Member', username: 'fixture.member1', password: 'AnotherValidPass26' }, token);
      assert.equal(response.status, 400); assert.equal(response.body.reason, 'username_taken');
    });
    await t.test('staff email cannot silently retain a different password', async () => {
      const response = await request('/church/members', { firstName: 'Staff', lastName: 'Conflict', email: 'admin@example.test', username: 'staff.conflict', password: 'AnotherValidPass26' }, token);
      assert.equal(response.status, 400); assert.equal(response.body.reason, 'email_taken');
      assert.equal((await sql('users').where({ uid: 'admin-fixture' }).first()).memberId, null);
    });
    await t.test('username-only account cannot be left waiting for email activation', async () => {
      const response = await request('/church/members', { firstName: 'Pending', lastName: 'Member', username: 'pending.member', password: 'AnotherValidPass26', activateNow: false }, token);
      assert.equal(response.status, 400); assert.equal(response.body.reason, 'activation_required');
    });
    await t.test('member profile photo endpoint serves image MIME and omits binary fields from profile JSON', async () => {
      const signedIn = await request('/auth/login', { username: 'fixture.member2', password: 'Exact<Register>&Pass2026!' });
      const source = await sharp({ create: { width: 1200, height: 1400, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
      const response = await fetch(base + '/member/profile', { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${signedIn.body.token}` }, body: JSON.stringify({ photo: `data:image/png;base64,${source.toString('base64')}` }) });
      assert.equal(response.status, 200);
      const data = await response.json() as any;
      assert.equal(data.profile.hasPhoto, true); assert.equal(data.profile.photo, undefined);
      const photo = await fetch(base + '/member/photo', { headers: { Authorization: `Bearer ${signedIn.body.token}` } });
      assert.equal(photo.status, 200); assert.equal(photo.headers.get('content-type'), 'image/jpeg');
      const bytes = Buffer.from(await photo.arrayBuffer()); assert.ok(bytes.length < 1_000_000);
      // pg-mem's bytea adapter converts arbitrary buffers through UTF-8, so it
      // cannot validate a lossless binary database round-trip. Actual JPEG pixels
      // and strict byte ceilings are tested with real sharp in profileImages.test.ts.
    });
    await t.test('role changes alter persisted permissions and return the matching church context', async () => {
      const signedIn = await request('/auth/login', { username: 'fixture.member2', password: 'Exact<Register>&Pass2026!' });
      const account = await sql('users').where({ username: 'fixture.member2' }).first();
      const update = await fetch(base + '/church/users/' + account.uid, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ role: 'SECRETARY' }) });
      assert.equal(update.status, 200, await update.text());
      const refreshed = await fetch(base + '/auth/me', { headers: { Authorization: `Bearer ${signedIn.body.token}` } });
      const data = await refreshed.json() as any;
      assert.equal(data.user.role, 'SECRETARY'); assert.equal(data.user.roles[0].role, 'SECRETARY'); assert.equal(data.user.roles[0].tenantName, 'Fixture Church');
      assert.equal(data.user.password, undefined); assert.equal(data.user.twoFactorSecret, undefined);
      const elevation = await fetch(base + '/church/users/' + account.uid, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ role: 'SUPER_ADMIN' }) });
      assert.equal(elevation.status, 400);
      await sql('users').where({ uid: account.uid }).update({ role: 'MEMBER' });
    });
    await t.test('suspended account and deleted church still cannot sign in', async () => {
      await sql('users').where({ username: 'fixture.member1' }).update({ status: 'suspended' });
      const body = { identifier: 'fixture.member1', password: 'Exact<Register>&Pass2026!' };
      assert.equal((await request('/auth/login', body)).status, 403);
      await sql('users').where({ username: 'fixture.member1' }).update({ status: 'active' });
      await sql('tenants').where({ id: 'church-fixture' }).update({ status: 'deleted' });
      assert.equal((await request('/auth/login', body)).status, 403);
    });
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    (db as any).client = originalClient;
    await sql.destroy();
    await db.destroy();
  }
});
