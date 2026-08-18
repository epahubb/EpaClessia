import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PLATFORM_TENANT,
  PERMISSION_CODES,
  CHURCH_EDITABLE_ROLES,
  PLATFORM_ONLY_PERMISSIONS,
  isKnownPermission,
  isChurchEditableRole,
  parsePermissions,
  serializePermissions,
  sanitizePermissions,
  resolveRolePermissions,
  roleHasPermission,
} from '../src/lib/permissions';

test('platform tenant sentinel is stable', () => {
  assert.equal(PLATFORM_TENANT, '__platform__');
});

test('permission catalogue includes the newer codes', () => {
  assert.ok(PERMISSION_CODES.includes('finance.manage'));
  assert.ok(PERMISSION_CODES.includes('attendance.manage'));
});

test('SUPER_ADMIN is not a church-editable role', () => {
  assert.equal(isChurchEditableRole('SUPER_ADMIN'), false);
  assert.equal(isChurchEditableRole('SECRETARY'), true);
  assert.equal(isChurchEditableRole('NOPE'), false);
  assert.equal(isChurchEditableRole(undefined), false);
});

test('isKnownPermission rejects junk', () => {
  assert.equal(isKnownPermission('members.manage'), true);
  assert.equal(isKnownPermission('members.destroy'), false);
  assert.equal(isKnownPermission(null), false);
});

test('parsePermissions handles json strings, arrays, null and garbage', () => {
  assert.deepEqual(parsePermissions('["a","b"]'), ['a', 'b']);
  assert.deepEqual(parsePermissions(['a']), ['a']);
  assert.deepEqual(parsePermissions(null), []);
  assert.deepEqual(parsePermissions('not json'), []);
  assert.deepEqual(parsePermissions('{"a":1}'), []);
  assert.deepEqual(parsePermissions([1, 'a', null]), ['a']);
});

test('serialize round-trips', () => {
  assert.deepEqual(parsePermissions(serializePermissions(['members.manage'])), ['members.manage']);
});

test('sanitize drops unknown codes and duplicates', () => {
  assert.deepEqual(
    sanitizePermissions(['members.manage', 'members.manage', 'bogus']),
    ['members.manage'],
  );
});

test('sanitize strips platform-only permissions for churches', () => {
  const out = sanitizePermissions(['churches.manage', 'billing.manage', 'reports.view']);
  assert.deepEqual(out, ['reports.view']);
  for (const code of PLATFORM_ONLY_PERMISSIONS) assert.equal(out.includes(code), false);
});

test('sanitize keeps platform-only permissions when explicitly allowed', () => {
  const out = sanitizePermissions(['billing.manage'], { allowPlatformOnly: true });
  assert.deepEqual(out, ['billing.manage']);
});

test('sanitize output order follows the catalogue, not the input', () => {
  const out = sanitizePermissions(['reports.view', 'members.manage']);
  assert.deepEqual(out, ['members.manage', 'reports.view']);
});

test('sanitize tolerates non-array input', () => {
  assert.deepEqual(sanitizePermissions('members.manage'), []);
  assert.deepEqual(sanitizePermissions(undefined), []);
});

test('a church with no overrides inherits platform defaults', () => {
  const resolved = resolveRolePermissions(
    [{ role: 'PASTOR', permissions: '["members.manage","reports.view"]' }],
    [],
  );
  const pastor = resolved.find((r) => r.role === 'PASTOR')!;
  assert.deepEqual(pastor.permissions, ['members.manage', 'reports.view']);
  assert.equal(pastor.customised, false);
});

test('an override replaces the default outright', () => {
  const resolved = resolveRolePermissions(
    [{ role: 'PASTOR', permissions: '["members.manage","reports.view"]' }],
    [{ role: 'PASTOR', permissions: '["comms.send"]' }],
  );
  const pastor = resolved.find((r) => r.role === 'PASTOR')!;
  assert.deepEqual(pastor.permissions, ['comms.send']);
  assert.equal(pastor.customised, true);
});

test('an empty override is meaningful and is not refilled from the default', () => {
  const resolved = resolveRolePermissions(
    [{ role: 'MEMBER', permissions: '["reports.view"]' }],
    [{ role: 'MEMBER', permissions: '[]' }],
  );
  const member = resolved.find((r) => r.role === 'MEMBER')!;
  assert.deepEqual(member.permissions, []);
  assert.equal(member.customised, true);
});

test('one church customising a role does not affect the resolution for another', () => {
  const defaults = [{ role: 'SECRETARY', permissions: '["members.manage"]' }];
  const churchA = resolveRolePermissions(defaults, [{ role: 'SECRETARY', permissions: '["attendance.manage"]' }]);
  const churchB = resolveRolePermissions(defaults, []);
  assert.deepEqual(churchA.find((r) => r.role === 'SECRETARY')!.permissions, ['attendance.manage']);
  assert.deepEqual(churchB.find((r) => r.role === 'SECRETARY')!.permissions, ['members.manage']);
});

test('resolution never leaks platform-only permissions even if stored', () => {
  const resolved = resolveRolePermissions(
    [{ role: 'CHURCH_ADMIN', permissions: '["churches.manage","billing.manage","users.manage"]' }],
    [],
  );
  assert.deepEqual(resolved.find((r) => r.role === 'CHURCH_ADMIN')!.permissions, ['users.manage']);
});

test('resolution returns every church-editable role, even with no rows at all', () => {
  const resolved = resolveRolePermissions([], []);
  assert.equal(resolved.length, CHURCH_EDITABLE_ROLES.length);
  for (const r of resolved) assert.deepEqual(r.permissions, []);
});

test('resolution ignores malformed rows', () => {
  const resolved = resolveRolePermissions([null as any, { role: 42 as any }], []);
  assert.equal(resolved.length, CHURCH_EDITABLE_ROLES.length);
});

test('SUPER_ADMIN is absent from a church-scoped resolution', () => {
  const resolved = resolveRolePermissions([{ role: 'SUPER_ADMIN', permissions: '["churches.manage"]' }], []);
  assert.equal(resolved.some((r) => r.role === 'SUPER_ADMIN'), false);
});

test('roleHasPermission reads a resolved matrix', () => {
  const resolved = resolveRolePermissions([{ role: 'FINANCE', permissions: '["giving.manage"]' }], []);
  assert.equal(roleHasPermission(resolved, 'FINANCE', 'giving.manage'), true);
  assert.equal(roleHasPermission(resolved, 'FINANCE', 'users.manage'), false);
  assert.equal(roleHasPermission(resolved, 'GHOST', 'giving.manage'), false);
});
