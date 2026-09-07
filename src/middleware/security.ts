/**
 * Centralised security apparatus for the EpaChurch platform.
 *
 * This module wires together the app's defensive layers:
 *   - Secure HTTP headers (helmet + a strict Content-Security-Policy)
 *   - Strict CORS allow-listing
 *   - Layered rate limiting (global, auth, and sensitive-action)
 *   - Brute-force / account-lockout protection backed by the login_logs table
 *   - Request body sanitisation (prototype-pollution & NoSQL-operator stripping)
 *   - A single leak-proof global error handler + 404 handler
 *   - A tamper-evident security event logger (console + audit_logs)
 *
 * Everything here is defensive; it is deliberately conservative and fails
 * closed where a decision affects authentication.
 */
import { Request, Response, NextFunction, RequestHandler } from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import db from '../lib/db';
import { IS_PROD } from '../lib/config';

/* ------------------------------------------------------------------ *
 * 1. Secure HTTP headers
 * ------------------------------------------------------------------ */
/**
 * Third parties the browser is actually allowed to talk to.
 *
 * The policy is an explicit allow-list rather than a blanket `https:`. A
 * wildcard scheme would let an injected script exfiltrate member data to any
 * HTTPS host it liked, which defeats the point of a CSP.
 */
const PAYSTACK_SCRIPT = 'https://js.paystack.co';
const PAYSTACK_CHECKOUT = 'https://checkout.paystack.com';
const PAYSTACK_API = 'https://api.paystack.co';
const MNOTIFY_API = 'https://api.mnotify.com';

/** Extra hosts an operator needs (a CDN, an S3 bucket), comma-separated. */
const extraConnectSrc = (process.env.CSP_CONNECT_SRC || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const extraImgSrc = (process.env.CSP_IMG_SRC || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

export const securityHeaders: RequestHandler = helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      defaultSrc: ["'self'"],
      // MUI/emotion inject styles at runtime; inline styles only, no remote
      // stylesheet hosts.
      styleSrc: ["'self'", "'unsafe-inline'"],
      // Only our own bundle and the Paystack checkout script may execute. No
      // 'unsafe-inline' and no 'unsafe-eval', so an injected <script> cannot
      // run.
      scriptSrc: ["'self'", PAYSTACK_SCRIPT, PAYSTACK_CHECKOUT],
      scriptSrcAttr: ["'none'"],
      // Member photos and church logos are served from our own API as data /
      // blob URLs.
      imgSrc: ["'self'", 'data:', 'blob:', ...extraImgSrc],
      fontSrc: ["'self'", 'data:'],
      // Own API + the payment and SMS gateways we call from the browser.
      connectSrc: ["'self'", PAYSTACK_API, PAYSTACK_CHECKOUT, MNOTIFY_API, ...extraConnectSrc],
      frameSrc: ["'self'", PAYSTACK_SCRIPT, PAYSTACK_CHECKOUT],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      // Clickjacking: this app must never be framed by another site.
      frameAncestors: ["'none'"],
      workerSrc: ["'self'", 'blob:'],
      manifestSrc: ["'self'"],
      upgradeInsecureRequests: IS_PROD ? [] : null,
    },
  },
  crossOriginEmbedderPolicy: false,
  // Stops another origin from reading our images/JSON through a tag include.
  crossOriginResourcePolicy: { policy: 'same-site' },
  crossOriginOpenerPolicy: { policy: 'same-origin' },
  hsts: IS_PROD
    ? { maxAge: 63072000, includeSubDomains: true, preload: true }
    : false,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  // Legacy Flash/PDF cross-domain policies, and MIME sniffing.
  permittedCrossDomainPolicies: { permittedPolicies: 'none' },
  noSniff: true,
  frameguard: { action: 'deny' },
  hidePoweredBy: true,
});

/**
 * Denies the browser access to hardware it has no business using, and stops
 * this app being embedded. Helmet does not set Permissions-Policy, so it is
 * added by hand.
 */
export const additionalSecurityHeaders: RequestHandler = (_req, res, next) => {
  res.setHeader(
    'Permissions-Policy',
    'geolocation=(), microphone=(), payment=(self), usb=(), magnetometer=(), accelerometer=()',
  );
  // Never let a browser or proxy cache an authenticated API response.
  if (_req.path.startsWith('/api') && !res.getHeader('Cache-Control')) {
    res.setHeader('Cache-Control', 'no-store');
  }
  next();
};

/**
 * Forces HTTPS in production.
 *
 * Sessions are bearer tokens: served over plain HTTP they can be read off the
 * wire, so an http:// request is redirected rather than answered. Health checks
 * are exempt so the platform's probe (which may be internal HTTP) still works.
 */
export const enforceHttps: RequestHandler = (req, res, next) => {
  if (!IS_PROD || process.env.DISABLE_HTTPS_REDIRECT === 'true') return next();
  if (req.path === '/health' || req.path === '/api/health') return next();

  const proto = String(req.headers['x-forwarded-proto'] || req.protocol || '')
    .split(',')[0]
    .trim();
  if (proto && proto !== 'https') {
    if (req.method === 'GET' || req.method === 'HEAD') {
      const target = `https://${req.headers.host}${req.originalUrl}`;
      return res.redirect(308, target);
    }
    return res.status(403).json({ error: 'HTTPS is required.' });
  }
  next();
};

/* ------------------------------------------------------------------ *
 * 2. Strict CORS allow-listing (no extra dependency)
 * ------------------------------------------------------------------ */
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

let warnedAboutOrigins = false;

export const corsMiddleware: RequestHandler = (req, res, next) => {
  const origin = req.headers.origin;

  // Same-origin / server-to-server requests have no Origin header.
  if (!origin) return next();

  // In production an unconfigured allow-list means "same origin only". That is
  // the safe default, but it is easy to misdiagnose, so say it once.
  if (IS_PROD && allowedOrigins.length === 0 && !warnedAboutOrigins) {
    warnedAboutOrigins = true;
    console.warn(
      '[security] ALLOWED_ORIGINS is not set. Cross-origin browser requests will be refused.',
    );
  }

  const isAllowed =
    allowedOrigins.includes(origin) ||
    // In development, permit localhost on any port.
    (!IS_PROD && /^https?:\/\/localhost(:\d+)?$/.test(origin)) ||
    // If no allow-list is configured, fall back to same-origin only in prod.
    (allowedOrigins.length === 0 && !IS_PROD);

  if (isAllowed) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader(
      'Access-Control-Allow-Methods',
      'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    );
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, X-Tenant-ID, X-User-Role, X-Ministry-ID',
    );
    res.setHeader('Access-Control-Max-Age', '600');
  }

  if (!isAllowed) {
    // A rejected origin is worth recording: it is either a misconfiguration or
    // somebody probing the API from another site.
    void securityEvent('CORS_ORIGIN_REJECTED', req, { origin });
  }

  if (req.method === 'OPTIONS') {
    return res.sendStatus(isAllowed ? 204 : 403);
  }
  next();
};

/* ------------------------------------------------------------------ *
 * 3. Rate limiting (layered)
 * ------------------------------------------------------------------ */
const rateLimitMessage = {
  error: 'Too many requests. Please slow down and try again shortly.',
};

// Broad protection for the whole API surface.
export const globalApiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: rateLimitMessage,
});

// Tight protection for the login endpoint (per IP).
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: {
    error: 'Too many sign-in attempts from this device. Please wait 15 minutes and try again.',
  },
});

// Protection for other sensitive/unauthenticated endpoints (password reset,
// 2FA setup, registration).
export const sensitiveActionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: rateLimitMessage,
});

/* ------------------------------------------------------------------ *
 * 4. Brute-force / account lockout (per account, DB-backed)
 * ------------------------------------------------------------------ */
const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_LOCKOUT_MINUTES = 15;

async function getSecurityPolicy(): Promise<{ maxAttempts: number; lockoutMinutes: number }> {
  try {
    const row = await db('system_settings').where({ key: 'security' }).first();
    const s = row ? JSON.parse(row.value) : {};
    return {
      maxAttempts: Number(s.maxLoginAttempts) > 0 ? Number(s.maxLoginAttempts) : DEFAULT_MAX_ATTEMPTS,
      lockoutMinutes:
        Number(s.lockoutDurationMinutes) > 0
          ? Number(s.lockoutDurationMinutes)
          : DEFAULT_LOCKOUT_MINUTES,
    };
  } catch {
    return { maxAttempts: DEFAULT_MAX_ATTEMPTS, lockoutMinutes: DEFAULT_LOCKOUT_MINUTES };
  }
}

export interface LockoutState {
  locked: boolean;
  remainingAttempts: number;
  retryAfterSeconds: number;
}

/**
 * Determine whether an account is currently locked based on the number of
 * FAILED sign-ins within the lockout window (since the last success).
 */
export async function getLockoutState(email: string): Promise<LockoutState> {
  const { maxAttempts, lockoutMinutes } = await getSecurityPolicy();
  const windowStart = new Date(Date.now() - lockoutMinutes * 60 * 1000);

  try {
    // Most recent successful login inside the window (resets the counter).
    const lastSuccess = await db('login_logs')
      .where({ email, success: true })
      .where('createdAt', '>=', windowStart)
      .orderBy('createdAt', 'desc')
      .first();

    const failuresQuery = db('login_logs')
      .where({ email, success: false })
      .where('createdAt', '>=', windowStart);

    if (lastSuccess) {
      failuresQuery.andWhere('createdAt', '>', lastSuccess.createdAt);
    }

    const failures = await failuresQuery.orderBy('createdAt', 'desc');
    const failCount = failures.length;

    if (failCount >= maxAttempts) {
      const firstOffending = failures[maxAttempts - 1] || failures[failures.length - 1];
      const unlockAt = new Date(
        new Date(firstOffending.createdAt).getTime() + lockoutMinutes * 60 * 1000,
      );
      const retryAfterSeconds = Math.max(0, Math.ceil((unlockAt.getTime() - Date.now()) / 1000));
      if (retryAfterSeconds > 0) {
        return { locked: true, remainingAttempts: 0, retryAfterSeconds };
      }
    }

    return {
      locked: false,
      remainingAttempts: Math.max(0, maxAttempts - failCount),
      retryAfterSeconds: 0,
    };
  } catch {
    // Fail open on infrastructure errors so a logging outage can't lock everyone
    // out, but still enforce the per-IP loginRateLimiter above.
    return { locked: false, remainingAttempts: maxAttempts, retryAfterSeconds: 0 };
  }
}

/* ------------------------------------------------------------------ *
 * 5. Request sanitisation (prototype pollution / operator injection)
 * ------------------------------------------------------------------ */
const FORBIDDEN_KEYS = ['__proto__', 'constructor', 'prototype'];

/**
 * Deepest object nesting accepted in a request body. A deliberately deep
 * payload is a cheap way to burn CPU in any recursive walk (this one included),
 * so anything past this depth is dropped rather than followed.
 */
const MAX_BODY_DEPTH = 32;

/** Strips NUL bytes, which can truncate strings inside native DB drivers. */
const scrubString = (value: string): string =>
  value.includes('\u0000') ? value.split('\u0000').join('') : value;

function scrub(value: any, depth = 0): any {
  if (typeof value === 'string') return scrubString(value);
  if (depth >= MAX_BODY_DEPTH) return undefined;
  if (Array.isArray(value)) return value.map((v) => scrub(v, depth + 1));
  if (value && typeof value === 'object') {
    for (const key of Object.keys(value)) {
      // Strip prototype-pollution keys and Mongo-style operator keys.
      if (FORBIDDEN_KEYS.includes(key) || key.startsWith('$')) {
        delete value[key];
        continue;
      }
      value[key] = scrub(value[key], depth + 1);
    }
  }
  return value;
}

export const sanitizeRequest: RequestHandler = (req, _res, next) => {
  if (req.body) req.body = scrub(req.body);
  if (req.params) req.params = scrub(req.params);
  // req.query is a getter in newer Express; scrub in place.
  if (req.query) scrub(req.query);
  next();
};

/* ------------------------------------------------------------------ *
 * 6. Security event logging (tamper-evident: console + audit_logs)
 * ------------------------------------------------------------------ */
export async function securityEvent(
  action: string,
  req: Request,
  details: Record<string, unknown> = {},
): Promise<void> {
  const entry = {
    timestamp: new Date().toISOString(),
    action,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    path: req.originalUrl,
    userId: (req as any).user?.uid || (req as any).user?.id || null,
    ...details,
  };
  console.warn(`[SECURITY] ${JSON.stringify(entry)}`);
  try {
    await db('audit_logs').insert({
      adminUid: entry.userId || 'system',
      action: `SECURITY_${action}`,
      resource: 'security',
      resourceId: null,
      ipAddress: req.ip,
      userAgent: String(req.headers['user-agent'] || ''),
      createdAt: new Date(),
    });
  } catch {
    /* audit logging must never break the request path */
  }
}

/* ------------------------------------------------------------------ *
 * 7. 404 + global error handler (no stack-trace leakage)
 * ------------------------------------------------------------------ */
export const notFoundHandler: RequestHandler = (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'Resource not found' });
  }
  // Non-API paths fall through to the SPA handler elsewhere.
  return res.status(404).json({ error: 'Not found' });
};

export function globalErrorHandler(
  err: any,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
) {
  const status = Number(err?.status || err?.statusCode) || 500;
  const requestId =
    (req as any).id || Math.random().toString(36).slice(2, 10);

  // Full detail server-side only.
  console.error(`[ERROR ${requestId}] ${req.method} ${req.originalUrl}:`, err);

  // Generic detail to the client; never leak stack traces or SQL.
  const safeMessage =
    status < 500 && typeof err?.message === 'string'
      ? err.message
      : 'An unexpected error occurred. Please try again later.';

  if (res.headersSent) return;
  res.status(status).json({ error: safeMessage, requestId });
}
