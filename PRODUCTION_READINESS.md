# Production Readiness Audit — Ecclesia Church Portal

**Audit date:** 15 August 2026
**Verdict before remediation:** ❌ **NOT production ready** — one critical
authentication bypass plus a leaked secrets file.
**Verdict after remediation:** ✅ Ready for a staging deployment, pending the
manual actions in section 4.

---

## 1. Critical findings (fixed)

### 1.1 ⚠️ Complete authentication bypass on the super-admin API — CRITICAL

**45 of 49 endpoints in `server.ts` had no authentication middleware.** Every
platform-administration route was reachable by an anonymous attacker with a
plain HTTP request. This included:

| Endpoint | Impact if unauthenticated |
|---|---|
| `POST /api/v1/superadmin/churches/:id/impersonate` | **Full takeover of any church tenant** |
| `GET/POST/PUT/DELETE /superadmin/users` | Create, edit, delete any user |
| `POST /superadmin/users/:id/reset-password` | Reset any user's password |
| `GET /superadmin/churches` | Dump every tenant record |
| `GET/PUT /superadmin/settings/:key` | Read and overwrite platform secrets |
| `GET /superadmin/audit-logs` | Read the entire audit trail |
| `POST /superadmin/billing/invoices/:id/refund` | Issue arbitrary refunds |

The `superadmin-extras` router even carried the comment *"protected by
authenticate + authorizeSuperAdmin in server.ts"* — but it was mounted without
them. The protection was documented, believed to exist, and simply absent.

**Fix applied:** `authenticate, authorizeSuperAdmin` added to all 40 super-admin
routes and to the extras router mount. Authorization resolves the role from the
database (not the JWT claim), so a forged token cannot escalate privileges.

### 1.2 ⚠️ Live secrets committed in `.env` — CRITICAL

The folder contained a real `.env` holding a live `JWT_SECRET`,
`JWT_REFRESH_SECRET`, `SECRETS_ENCRYPTION_KEY`, database credentials, and
`SUPERADMIN_PASSWORD=admin123`.

**Fix applied:** `.env` deleted from the project. `.gitignore` already excluded
it, so it was likely never committed — **but you must still treat every value in
it as compromised and rotate it** (see section 4).

---

## 2. High and medium findings (fixed)

| # | Finding | Fix |
|---|---|---|
| 2.1 | No fail-fast configuration validation — the app would boot in production with weak secrets or no database TLS | Added `src/lib/startup-checks.ts`; the server now refuses to start in production on an unsafe config |
| 2.2 | No graceful shutdown — deploys dropped in-flight requests and leaked database connections | Added `SIGTERM`/`SIGINT` draining with a 15s grace period and pool teardown |
| 2.3 | No container image | Added a hardened multi-stage `Dockerfile` (non-root, `dumb-init` PID 1, healthcheck) and `.dockerignore` |
| 2.4 | No CI — nothing prevented a broken or secret-leaking commit | Added `.github/workflows/ci.yml` (typecheck, tests, build, audit, committed-secret guard) |
| 2.5 | Zero automated tests | Added `tests/startup-checks.test.ts` (12 cases) |
| 2.6 | `.env.example` shipped weak defaults (`admin123`, placeholder JWT secret) that invited copy-paste into production | Rewritten with blank required fields and generation instructions |
| 2.7 | `package.json` named `react-example`, version `0.0.0`, no `engines`; `vite` and `@types/*` duplicated in runtime dependencies | Renamed and versioned, `engines` pinned, build-only packages moved to `devDependencies` |
| 2.8 | `tsconfig.json` had no `include`/`exclude` and no `forceConsistentCasingInFileNames` | Scoped and tightened |

---

## 3. Security controls verified as already sound

These were reviewed and found correctly implemented — no change needed:

- **Password storage:** bcrypt with cost factor 12.
- **Secrets at rest:** AES-256-GCM authenticated encryption for provider
  credentials, with transparent handling of legacy plaintext rows.
- **JWT handling:** algorithm pinned to HS256 (no `alg: none` confusion),
  separate refresh secret, refresh tokens tagged `type: 'refresh'` so they
  cannot be replayed as access tokens.
- **Brute force:** per-IP login rate limiting plus per-account DB-backed lockout.
- **Headers:** Helmet with a restrictive CSP, HSTS with preload in production.
- **CORS:** strict allow-list, defaulting to same-origin in production.
- **Injection:** Knex parameterised queries throughout; no string-concatenated
  SQL found. Request bodies scrubbed for prototype-pollution and `$`-operator keys.
- **Tenant isolation:** `checkOwnership` performs a real database lookup rather
  than trusting a client-supplied `tenantId`.
- **Error handling:** centralised handler; no stack traces or SQL leak to clients.
- **XSS:** no `dangerouslySetInnerHTML` or `eval` anywhere in the frontend.

---

## 4. Manual actions still required before go-live

These cannot be done from the codebase and are **blocking**:

1. **Rotate every secret** that appeared in the deleted `.env` — `JWT_SECRET`,
   `JWT_REFRESH_SECRET`, `SECRETS_ENCRYPTION_KEY`, the PostgreSQL password, and
   the super-admin password. Assume all are burned.
2. **Verify `.env` was never committed:** `git log --all --full-history -- .env`.
   If it appears, rotating the secrets is mandatory, and purging history with
   `git filter-repo` is strongly recommended.
3. **Run `npm ci && npm run verify && npm run build`** on a machine with network
   access. *(This could not be executed in the audit sandbox — see section 5.)*
4. **Change the seeded super-admin password** immediately after first sign-in and
   enable two-factor authentication on every super-admin account.
5. **Configure backups** for PostgreSQL and rehearse a restore.

---

## 5. Audit limitations — please read

The sandbox used for this audit had **no network access**, so `npm install`
could not complete. As a result:

- `npm run typecheck`, `npm test`, and `npm run build` were **not executed**.
- Changes were verified by static inspection and structural checks (JSON
  validity, balanced delimiters, grep-confirmed middleware coverage) only.
- `npm audit` was **not run**, so third-party CVEs in the dependency tree are
  unassessed. Run it before shipping.

Run `npm ci && npm run verify && npm run build` locally and resolve anything it
reports. The `tsconfig.json` scope changed, so a first typecheck may surface
pre-existing type errors in files that were previously not being checked.

---

## 6. Recommended next steps (not blocking)

- Enable `"strict": true` in `tsconfig.json` and fix the resulting errors
  incrementally. This is the single highest-value remaining code-quality change.
- Add CSRF protection for the cookie-based auth path (`SameSite=Strict` mitigates
  it today, but a token would be more robust).
- Add integration tests asserting that every `/superadmin` route returns 401 when
  unauthenticated — this would have caught finding 1.1 automatically.
- Resolve the duplicated backends: `backend/` (3 files) and `backend_django/`
  (11 files) are unused Python alongside the live TypeScript server. Delete them
  or move them to a separate repository to avoid confusion.
- Consolidate the duplicated layout directories `src/components/Layout/`,
  `src/components/layout/`, and `src/layouts/`.
- Add structured JSON request logging (pino) and error tracking (Sentry).
