/**
 * Fail-fast production startup validation.
 *
 * The application must refuse to boot in production with an insecure or
 * incomplete configuration. Silently starting with a default secret, a missing
 * database target, or a well-known seed password is how production incidents
 * begin. Every check below is evaluated up-front and reported together so an
 * operator can fix the whole configuration in a single pass.
 */

const INSECURE_JWT_DEFAULT = 'your-super-secret-jwt-key-change-this-in-production';

/** Passwords that must never survive into a real deployment. */
const BANNED_PASSWORDS = new Set([
  'admin123',
  'password',
  'ChangeMe123!',
  'changeme',
  'admin',
  'secret',
]);

const isBlank = (v?: string) => !v || !v.trim();

export interface StartupCheckResult {
  errors: string[];
  warnings: string[];
}

/** Evaluate the runtime configuration. Pure, so it can be unit-tested. */
export function evaluateConfig(env: NodeJS.ProcessEnv = process.env): StartupCheckResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const isProd = env.NODE_ENV === 'production';

  // --- Secrets -------------------------------------------------------------
  const jwt = env.JWT_SECRET;
  if (isBlank(jwt) || jwt === INSECURE_JWT_DEFAULT || (jwt as string).length < 32) {
    errors.push(
      'JWT_SECRET is missing, default, or shorter than 32 characters. Generate one with: openssl rand -hex 32',
    );
  }

  if (isBlank(env.JWT_REFRESH_SECRET)) {
    warnings.push(
      'JWT_REFRESH_SECRET is not set; it will be derived from JWT_SECRET. Set a dedicated value so access and refresh tokens are cryptographically independent.',
    );
  } else if ((env.JWT_REFRESH_SECRET as string).length < 32) {
    errors.push('JWT_REFRESH_SECRET must be at least 32 characters.');
  } else if (env.JWT_REFRESH_SECRET === jwt) {
    errors.push('JWT_REFRESH_SECRET must not be identical to JWT_SECRET.');
  }

  if (isBlank(env.SECRETS_ENCRYPTION_KEY)) {
    (isProd ? errors : warnings).push(
      'SECRETS_ENCRYPTION_KEY is not set. Provider credentials at rest would be encrypted with a key derived from JWT_SECRET, so rotating JWT_SECRET would make them unreadable. Generate one with: openssl rand -hex 32',
    );
  }

  // --- Database ------------------------------------------------------------
  const hasPgTarget = Boolean(
    env.DATABASE_URL || env.POSTGRES_URL || env.PGHOST || env.DB_HOST,
  );
  if (!hasPgTarget) {
    (isProd ? errors : warnings).push(
      'No database target configured. Set DATABASE_URL (or PGHOST/PGUSER/PGPASSWORD/PGDATABASE).',
    );
  }

  if (isProd) {
    const usingTls =
      env.PGSSL === 'true' || Boolean(env.DATABASE_URL || env.POSTGRES_URL);
    if (!usingTls) {
      errors.push('Database TLS is disabled in production. Set PGSSL=true.');
    }
    if (env.PGSSL_NO_VERIFY === 'true') {
      warnings.push(
        'PGSSL_NO_VERIFY=true disables database certificate verification. Provide PGSSL_CA or PGSSL_CA_PATH instead.',
      );
    }
  }

  // --- Seed credentials ----------------------------------------------------
  for (const key of ['SUPERADMIN_PASSWORD', 'SEED_DEFAULT_PASSWORD'] as const) {
    const value = env[key];
    if (isProd) {
      if (isBlank(value)) {
        errors.push(`${key} must be set to a strong value in production.`);
      } else if (BANNED_PASSWORDS.has(value as string)) {
        errors.push(`${key} is a well-known default password and must be changed.`);
      } else if ((value as string).length < 12) {
        errors.push(`${key} must be at least 12 characters.`);
      }
    }
  }

  // --- HTTP surface --------------------------------------------------------
  if (isProd) {
    if (isBlank(env.ALLOWED_ORIGINS)) {
      warnings.push(
        'ALLOWED_ORIGINS is empty. Only same-origin browser requests will be accepted. Set it if a separate frontend origin calls this API.',
      );
    }
    const appUrl = env.APP_URL || '';
    if (appUrl.startsWith('http://')) {
      warnings.push('APP_URL uses plain HTTP. Production should be served over HTTPS.');
    }
  }

  return { errors, warnings };
}

/**
 * Run the checks and abort the process when the configuration is unsafe for
 * production. In development, problems are printed but the server still starts.
 */
export function runStartupChecks(env: NodeJS.ProcessEnv = process.env): void {
  const { errors, warnings } = evaluateConfig(env);
  const isProd = env.NODE_ENV === 'production';

  for (const w of warnings) console.warn(`[startup] WARNING: ${w}`);

  if (errors.length === 0) {
    console.log(
      `[startup] Configuration validated (${isProd ? 'production' : 'development'} mode).`,
    );
    return;
  }

  for (const e of errors) console.error(`[startup] ERROR: ${e}`);

  if (isProd) {
    console.error(
      `\n[startup] Refusing to start: ${errors.length} fatal configuration problem(s). ` +
        'Fix the items above and redeploy.\n',
    );
    process.exit(1);
  }

  console.warn(
    '[startup] Continuing in development despite the problems above. These WILL block a production start.',
  );
}
