import dotenv from 'dotenv';
import crypto from 'crypto';
dotenv.config();

export const IS_PROD = process.env.NODE_ENV === 'production';

// The placeholder value shipped in .env.example. Treated as "not set".
const INSECURE_DEFAULT_SECRET =
  'your-super-secret-jwt-key-change-this-in-production';

/**
 * Resolve a single, authoritative JWT secret for the whole app.
 * In production we refuse to start with a missing/weak secret so tokens can
 * never be forged with a well-known default.
 */
function resolveJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  const isWeak =
    !secret || secret === INSECURE_DEFAULT_SECRET || secret.length < 32;

  if (isWeak) {
    if (IS_PROD) {
      throw new Error(
        'FATAL: JWT_SECRET is missing or insecure. Set a strong (32+ character) ' +
          'JWT_SECRET environment variable before starting the server in production.',
      );
    }
    console.warn(
      '[config] Using an insecure development JWT secret. Set a strong JWT_SECRET before deploying to production.',
    );
    return secret || 'dev-only-insecure-secret-change-me';
  }

  return secret;
}

export const JWT_SECRET = resolveJwtSecret();

// --- Token lifetimes ---
// Access token is short/medium-lived; the refresh token keeps the session
// alive so users are not abruptly logged out (which surfaced as
// "TokenExpiredError: jwt expired"). Both are overridable via env.
export const ACCESS_TOKEN_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';
export const REFRESH_TOKEN_EXPIRES_IN =
  process.env.JWT_REFRESH_EXPIRES_IN || '30d';

// Dedicated secret for refresh tokens so the access-token secret and the
// refresh-token secret are never interchangeable. Falls back to a value
// derived from JWT_SECRET so the app keeps working if only JWT_SECRET is set.
export const JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET ||
  crypto.createHash('sha256').update(`refresh:${JWT_SECRET}`).digest('hex');
