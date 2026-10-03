import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import db from '../src/lib/db';
import { JWT_SECRET } from '../src/lib/config';
import { authenticate, authorizeSuperAdmin } from '../src/middleware/auth';
import { loginSchema } from '../src/lib/security';

test('existing tokens stop working for a deleted church and suspended accounts', async t => {
  let account: any = { uid: 'member', role: 'MEMBER', tenantId: 'church', status: 'active' };
  let tenant: any = { status: 'active' };
  t.mock.method(db.client, 'runner', (builder: any) => ({ run: async () => builder._single.table === 'users' ? account : tenant }));
  const token = jwt.sign({ uid: 'member', role: 'SUPER_ADMIN' }, JWT_SECRET, { algorithm: 'HS256' });
  const probe = async () => {
    let status = 200, body: any, proceeded = false;
    const req: any = { headers: { authorization: `Bearer ${token}` } };
    const res: any = { status(value: number) { status = value; return this; }, json(value: any) { body = value; return this; } };
    await authenticate(req, res, () => { proceeded = true; });
    return { status, body, proceeded, req };
  };
  let result = await probe();
  assert.equal(result.proceeded, true); assert.equal(result.req.user.role, 'MEMBER');
  tenant = { status: 'deleted' }; result = await probe(); assert.equal(result.status, 403); assert.equal(result.proceeded, false);
  tenant = { status: 'suspended' }; assert.equal((await probe()).status, 403);
  tenant = { status: 'active' }; account.status = 'suspended'; assert.equal((await probe()).status, 403);
  account = null; assert.equal((await probe()).status, 401);
  account = { uid: 'member', role: 'SUPER_ADMIN', status: 'active', tenantId: 'church' }; tenant = { status: 'deleted' };
  assert.equal((await probe()).proceeded, true, 'Superadmin can still manage and restore deleted churches');
});

test('non-superadmin persisted accounts cannot delete churches even with a superadmin token claim', async t => {
  t.mock.method(db.client, 'runner', () => ({ run: async () => ({ uid: 'member', role: 'MEMBER', status: 'active' }) }));
  let status = 200, proceeded = false;
  const res: any = { status(v: number) { status = v; return this; }, json() { return this; } };
  await authorizeSuperAdmin({ user: { uid: 'member', role: 'SUPER_ADMIN' } } as any, res, () => { proceeded = true; });
  assert.equal(status, 403); assert.equal(proceeded, false);
});

test('username credentials validate and compare against a stored bcrypt hash', async () => {
  const parsed = loginSchema.safeParse({ identifier: 'ama.mensah', password: 'MemberWelcome26' });
  assert.equal(parsed.success, true);
  assert.equal(loginSchema.safeParse({ username: 'ama.mensah', password: 'MemberWelcome26' }).success, true);
  const hash = await bcrypt.hash('MemberWelcome26', 4);
  assert.equal(await bcrypt.compare('MemberWelcome26', hash), true);
  assert.equal(await bcrypt.compare('WrongPassword26', hash), false);
  assert.notEqual(hash, 'MemberWelcome26');
});
