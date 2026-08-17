# EpaChurch — Security Protocols & Apparatus

This document describes the cybersecurity controls built into the EpaChurch
platform and the operational steps required to run it securely.

## 1. Threat model (summary)

EpaChurch is a **multi-tenant SaaS** holding sensitive congregational data
(members, giving/finance, communications) plus payment and SMS provider
credentials. The primary risks addressed here are:

- Account takeover (credential stuffing / brute force)
- Cross-tenant data access (IDOR / broken authorization)
- Token/secret theft (XSS, database exfiltration)
- Injection & prototype pollution
- Transport & configuration weaknesses

## 2. Authentication & session security

- **Password hashing:** `bcrypt` with cost factor 12 (`src/lib/security.ts`).
- **Strong password policy:** `strongPasswordSchema` requires 12+ chars with
  upper, lower, number and symbol. Default `minPasswordLength` is 12.
- **JWT:** signed HS256, explicit algorithm allow-list on verify (prevents
  `alg=none` / algorithm-confusion). The signing secret is centrally resolved
  in `src/lib/config.ts` and the server **refuses to boot in production** with a
  missing/weak/default `JWT_SECRET`.
- **httpOnly cookies:** on login the token is also set as a
  `httpOnly; Secure; SameSite=Strict` cookie so it is not reachable from
  JavaScript (defence-in-depth against XSS token theft). A Bearer token is still
  returned for API clients.
- **Two-factor authentication (TOTP):** available for all users and
  **required for admins by default** (`require2FAForAdmins: true`).
- **Inactive accounts** (suspended/disabled) are blocked at login.

## 3. Brute-force & rate limiting

- **Per-account lockout** (`getLockoutState`): after `maxLoginAttempts` failed
  sign-ins within `lockoutDurationMinutes` the account is locked and the API
  returns `429` with a `Retry-After` header. Counters reset on a successful
  login. Backed by the `login_logs` table.
- **Per-IP login limiter:** 10 attempts / 15 minutes on `/auth/login`.
- **Global API limiter:** 300 requests / minute across `/api`.
- **Sensitive-action limiter:** applied to 2FA setup/enable endpoints.

## 4. Authorization & tenant isolation

- **RBAC:** `authorize([...roles])` and `authorizeSuperAdmin` enforce roles
  using the **persisted** role from the database, never an unverified JWT claim
  (prevents privilege escalation via a forged token).
- **IDOR prevention:** `checkOwnership(table, ...)` performs a **real database
  lookup** and compares the resource's `tenantId` with the caller's tenant. The
  previous version trusted a client-supplied `tenantId`; that trust was removed.
  It **fails closed** on errors.
- All tenant-scoped church APIs are locked to the caller's own tenant.

## 5. Secrets at rest (AES-256-GCM)

- `src/lib/crypto.ts` provides authenticated encryption for provider
  credentials (Paystack secret key, SMS/email passwords, webhook secrets, etc.).
- System settings are **encrypted before being written** to the database and
  **masked on read** (`••••••••`) so secrets never leave the server in clear
  text. Re-saving a masked form preserves the stored secret.
- Key source: `SECRETS_ENCRYPTION_KEY` (32-byte hex/base64). Falls back to a
  key derived from `JWT_SECRET` with a production warning if unset.

## 6. Transport & network

- **Secure headers (helmet):** Content-Security-Policy, `X-Content-Type-Options`,
  `Referrer-Policy`, frameguard, and **HSTS** (2 years, preload) in production.
- **CORS allow-listing:** requests are restricted to origins in
  `ALLOWED_ORIGINS`; credentials are only echoed back to approved origins.
- **PostgreSQL TLS:** connections verify the server certificate by default; pin
  your provider CA with `PGSSL_CA` / `PGSSL_CA_PATH`. Verification can only be
  disabled with the explicit `PGSSL_NO_VERIFY=true` escape hatch.
- `x-powered-by` is disabled.

## 7. Input handling & error safety

- **Request sanitisation:** `sanitizeRequest` strips `__proto__` /
  `constructor` / `prototype` (prototype pollution) and `$`-prefixed operator
  keys (NoSQL-style injection) from body, params and query.
- **Schema validation:** zod schemas (`loginSchema`, `validateBody`, etc.)
  validate and normalise input.
- **Parameterised queries:** all database access goes through Knex query
  builders (no string-concatenated SQL).
- **Leak-proof errors:** a single `globalErrorHandler` returns generic messages
  with a correlation id and never exposes stack traces or SQL to clients. API
  404s return JSON, not the SPA shell.

## 8. Auditing & monitoring

- **Audit log:** administrative actions are recorded via `auditLog(...)` into
  `audit_logs`.
- **Security events:** `securityEvent(...)` records auth failures, lockouts,
  IDOR attempts and settings changes to the console and `audit_logs`.
- **Login logs:** every success/failure is written to `login_logs` (also powers
  lockout).

## 9. Secure-by-default configuration

Seeded `security` settings ship hardened:

| Setting | Default |
| --- | --- |
| `require2FAForAdmins` | `true` |
| `allowPublicRegistration` | `false` |
| `minPasswordLength` | `12` |
| `passwordRequireComplexity` | `true` |
| `maxLoginAttempts` | `5` |
| `lockoutDurationMinutes` | `15` |
| `sessionTimeoutMinutes` | `60` |
| `forcePasswordResetOnFirstLogin` | `true` |

In production the app **fails fast** if seed passwords are missing/weak or if
database initialization errors occur.

## 10. Operator checklist (before going live)

1. `openssl rand -hex 32` → set `JWT_SECRET`.
2. `openssl rand -hex 32` → set `SECRETS_ENCRYPTION_KEY`.
3. Set strong, unique `SUPERADMIN_PASSWORD` and `SEED_DEFAULT_PASSWORD` (12+).
4. Set `NODE_ENV=production`.
5. Set `ALLOWED_ORIGINS` to your real frontend origin(s).
6. Use PostgreSQL with `PGSSL=true` and pin `PGSSL_CA` / `PGSSL_CA_PATH`.
7. Terminate TLS (HTTPS) at your proxy/load balancer.
8. Rotate the seeded super-admin credentials after first login and enable 2FA.
9. Review `audit_logs` / `login_logs` regularly.
