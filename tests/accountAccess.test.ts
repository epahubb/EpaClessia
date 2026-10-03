import test from 'node:test';
import assert from 'node:assert/strict';
import { churchBlocksAccess, portalActivationPreference } from '../src/lib/accountAccess';
test('deleted, suspended, and missing churches block access', () => {
  for (const tenant of [null, undefined, { status: 'deleted' }, { status: 'suspended' }, { status: 'DELETED' }]) assert.equal(churchBlocksAccess(tenant), true);
});
test('active and trial churches allow access', () => {
  for (const status of ['active', 'trial']) assert.equal(churchBlocksAccess({ status }), false);
});
test('admin-provisioned portal access is ready to use by default', () => {
  for (const preference of [undefined, null, true, 'true']) assert.equal(portalActivationPreference(preference), true);
});
test('email verification remains an explicit option', () => {
  for (const preference of [false, 'false']) assert.equal(portalActivationPreference(preference), false);
});
