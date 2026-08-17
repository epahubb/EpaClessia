import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateConfig } from '../src/lib/startup-checks';

const STRONG = 'a'.repeat(64);
const OTHER = 'b'.repeat(64);

/** A fully valid production configuration used as the baseline for each case. */
function validProdEnv(overrides: Record<string, string | undefined> = {}) {
  return {
    NODE_ENV: 'production',
    JWT_SECRET: STRONG,
    JWT_REFRESH_SECRET: OTHER,
    SECRETS_ENCRYPTION_KEY: 'c'.repeat(64),
    DATABASE_URL: 'postgres://user:pass@db.example.com:5432/ecclesia',
    PGSSL: 'true',
    SUPERADMIN_PASSWORD: 'a-very-strong-admin-passphrase',
    SEED_DEFAULT_PASSWORD: 'another-strong-seed-passphrase',
    ALLOWED_ORIGINS: 'https://app.example.com',
    APP_URL: 'https://app.example.com',
    ...overrides,
  } as NodeJS.ProcessEnv;
}

test('a complete production config produces no errors', () => {
  const { errors } = evaluateConfig(validProdEnv());
  assert.deepEqual(errors, []);
});

test('rejects a missing JWT secret', () => {
  const { errors } = evaluateConfig(validProdEnv({ JWT_SECRET: undefined }));
  assert.ok(errors.some((e) => e.includes('JWT_SECRET')));
});

test('rejects the shipped placeholder JWT secret', () => {
  const { errors } = evaluateConfig(
    validProdEnv({ JWT_SECRET: 'your-super-secret-jwt-key-change-this-in-production' }),
  );
  assert.ok(errors.some((e) => e.includes('JWT_SECRET')));
});

test('rejects a short JWT secret', () => {
  const { errors } = evaluateConfig(validProdEnv({ JWT_SECRET: 'tooshort' }));
  assert.ok(errors.some((e) => e.includes('JWT_SECRET')));
});

test('rejects a refresh secret identical to the access secret', () => {
  const { errors } = evaluateConfig(validProdEnv({ JWT_REFRESH_SECRET: STRONG }));
  assert.ok(errors.some((e) => e.includes('must not be identical')));
});

test('rejects well-known default seed passwords', () => {
  const { errors } = evaluateConfig(validProdEnv({ SUPERADMIN_PASSWORD: 'admin123' }));
  assert.ok(errors.some((e) => e.includes('SUPERADMIN_PASSWORD')));
});

test('rejects short seed passwords', () => {
  const { errors } = evaluateConfig(validProdEnv({ SEED_DEFAULT_PASSWORD: 'short1!' }));
  assert.ok(errors.some((e) => e.includes('SEED_DEFAULT_PASSWORD')));
});

test('requires database TLS in production', () => {
  const { errors } = evaluateConfig(
    validProdEnv({ PGSSL: 'false', DATABASE_URL: undefined, PGHOST: 'db.example.com' }),
  );
  assert.ok(errors.some((e) => e.includes('TLS')));
});

test('requires a database target in production', () => {
  const { errors } = evaluateConfig(
    validProdEnv({ DATABASE_URL: undefined, POSTGRES_URL: undefined, PGHOST: undefined, DB_HOST: undefined }),
  );
  assert.ok(errors.some((e) => e.includes('database target')));
});

test('requires a secrets encryption key in production', () => {
  const { errors } = evaluateConfig(validProdEnv({ SECRETS_ENCRYPTION_KEY: undefined }));
  assert.ok(errors.some((e) => e.includes('SECRETS_ENCRYPTION_KEY')));
});

test('warns, but does not fail, on a plain-HTTP APP_URL', () => {
  const { errors, warnings } = evaluateConfig(
    validProdEnv({ APP_URL: 'http://app.example.com' }),
  );
  assert.deepEqual(errors, []);
  assert.ok(warnings.some((w) => w.includes('HTTP')));
});

test('development mode is lenient about seed passwords', () => {
  const { errors } = evaluateConfig({
    NODE_ENV: 'development',
    JWT_SECRET: STRONG,
    JWT_REFRESH_SECRET: OTHER,
    SECRETS_ENCRYPTION_KEY: 'c'.repeat(64),
    PGHOST: 'localhost',
    SUPERADMIN_PASSWORD: 'admin123',
  } as NodeJS.ProcessEnv);
  assert.deepEqual(errors, []);
});
