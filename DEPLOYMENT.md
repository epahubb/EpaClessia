# Deployment Guide — Ecclesia Church Portal

This document covers the required configuration, the deployment procedure, and
the go-live checklist.

---

## 1. Prerequisites

| Requirement | Version / Notes |
|---|---|
| Node.js | 20 or later (22 recommended) |
| PostgreSQL | 14 or later, TLS enabled |
| Reverse proxy | Nginx / Cloud Run / ALB terminating HTTPS |

---

## 2. Generate secrets

Every secret must be unique per environment. Generate them with:

```bash
openssl rand -hex 32   # JWT_SECRET
openssl rand -hex 32   # JWT_REFRESH_SECRET  (must differ from JWT_SECRET)
openssl rand -hex 32   # SECRETS_ENCRYPTION_KEY
```

Create strong seed passwords too (12+ characters, not a known default):

```bash
openssl rand -base64 24   # SUPERADMIN_PASSWORD
openssl rand -base64 24   # SEED_DEFAULT_PASSWORD
```

---

## 3. Configure the environment

```bash
cp .env.example .env
# then edit .env and fill in every required value
```

The server validates configuration at boot and **refuses to start in
production** if any of the following is wrong:

- `JWT_SECRET` missing, shorter than 32 chars, or still the placeholder
- `JWT_REFRESH_SECRET` identical to `JWT_SECRET` or too short
- `SECRETS_ENCRYPTION_KEY` missing
- No database target (`DATABASE_URL` or `PGHOST`)
- Database TLS disabled (`PGSSL` not `true`)
- `SUPERADMIN_PASSWORD` / `SEED_DEFAULT_PASSWORD` missing, weak, or a known default

Store these in your platform's secret manager (GitHub Actions secrets, Cloud Run
secrets, AWS Secrets Manager) — never in the repository.

---

## 4. Build and run

```bash
npm ci
npm run verify     # typecheck + unit tests
npm run build      # builds the SPA and bundles the server
NODE_ENV=production npm start
```

### With Docker

```bash
docker build -t ecclesia:latest .
docker run -p 3000:3000 --env-file .env ecclesia:latest
```

The image runs as the unprivileged `node` user, uses `dumb-init` as PID 1 so
`SIGTERM` reaches the app, and ships a `HEALTHCHECK` against `/api/health`.

---

## 5. Health and observability

- `GET /api/health` — returns process status and a live database probe. Use it
  for load-balancer and container health checks.
- The server drains in-flight requests and closes the database pool on
  `SIGTERM` / `SIGINT` (15-second grace period).

---

## 6. Go-live checklist

- [ ] All secrets generated fresh for production and stored in a secret manager
- [ ] `NODE_ENV=production`
- [ ] `ALLOWED_ORIGINS` set if the frontend is served from a different origin
- [ ] `PGSSL=true`, and `PGSSL_CA` / `PGSSL_CA_PATH` pinned to your provider's CA
- [ ] HTTPS enforced at the proxy; `APP_URL` uses `https://`
- [ ] Signed in as the seeded super admin and **changed the password immediately**
- [ ] Two-factor authentication enabled for every super admin account
- [ ] Automated database backups configured and a restore tested
- [ ] Log aggregation and alerting wired to `[SECURITY]` and `[ERROR]` log lines
- [ ] `npm audit` reviewed with no unresolved high/critical findings

---

## 7. Secret rotation

If a secret is ever exposed (for example, committed to git):

1. Generate a replacement immediately.
2. Update the secret manager and redeploy.
3. Note that rotating `JWT_SECRET` invalidates all active sessions — users
   must sign in again. This is expected and desirable after an exposure.
4. Rotate the database password and any provider API keys (Paystack, mNotify,
   SMTP) that shared the exposure.

---

## 8. Deploying to Railway

Railway is configured via `railway.json`, which pins the **Dockerfile builder**.
This is deliberate and important — see the two pitfalls below.

### 8.1 Why the Dockerfile builder, not Nixpacks

Build-only packages (`vite`, `esbuild`, `typescript`, `@vitejs/plugin-react`,
`@tailwindcss/vite`) live in `devDependencies`. If Railway builds with Nixpacks
while `NODE_ENV=production` is set as a service variable, `npm ci` omits dev
dependencies and the build fails with `vite: not found`.

The `Dockerfile` avoids this entirely: it installs the full dependency tree in
its build stage and only sets `NODE_ENV=production` in the final runtime stage.

If you ever switch to Nixpacks, you must set:

```
NIXPACKS_INSTALL_CMD=npm ci --include=dev
```

### 8.2 Database TLS on Railway

Use Railway's **private network** hostname, which the Postgres plugin exposes as
`${{Postgres.DATABASE_URL}}` (host `postgres.railway.internal`).

`src/lib/db.ts` and `src/lib/startup-checks.ts` detect `*.railway.internal` and
skip TLS, because that traffic never leaves Railway's private network and the
internal endpoint does not present a verifiable certificate. Forcing
`PGSSL=true` against it fails with a self-signed-certificate error.

Only if you must connect over Railway's **public TCP proxy** set:

```
PGSSL=true
PGSSL_NO_VERIFY=true
```

`PGSSL_NO_VERIFY` is a documented escape hatch and logs a warning. Prefer the
private network.

### 8.3 Setup steps

1. **New Project** → *Deploy from GitHub repo* → select `epahubb/EpaClessia`.
   Railway detects `railway.json` and builds from the `Dockerfile`.
2. **+ New** → *Database* → **Add PostgreSQL**.
3. Open the app service → **Variables** → add the values in 8.4.
4. **Settings → Networking → Generate Domain** to get a public HTTPS URL.
5. Set `APP_URL` to that domain and redeploy.

### 8.4 Required service variables

| Variable | Value |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (reference, not a literal) |
| `NODE_ENV` | `production` |
| `JWT_SECRET` | fresh `openssl rand -hex 32` |
| `JWT_REFRESH_SECRET` | a **different** `openssl rand -hex 32` |
| `SECRETS_ENCRYPTION_KEY` | a **third** `openssl rand -hex 32` |
| `SUPERADMIN_PASSWORD` | strong, 12+ chars, not a known default |
| `SEED_DEFAULT_PASSWORD` | strong, 12+ chars |
| `APP_URL` | your generated Railway HTTPS domain |
| `ALLOWED_ORIGINS` | same as `APP_URL` (or leave blank for same-origin only) |

Do **not** set `PORT` — Railway injects it and the server already reads it.
Do **not** set `PGSSL` when using the private network.

Optional, only if the feature is used: `PAYSTACK_PUBLIC_KEY`,
`PAYSTACK_SECRET_KEY`, `MNOTIFY_API_KEY`, `MNOTIFY_SENDER_ID`,
`MNOTIFY_CLIENT_ID`, `MNOTIFY_CLIENT_SECRET`, `EMAIL_HOST`, `EMAIL_PORT`,
`EMAIL_USER`, `EMAIL_PASSWORD`, `GEMINI_API_KEY`.

### 8.5 Verifying the deploy

The startup checks print their verdict in the deploy logs. Look for:

```
[startup] Configuration validated (production mode).
✓ Database: PostgreSQL (from connection URL)
Server running on http://localhost:8080
```

Then confirm the health endpoint returns `"database": "connected"`:

```bash
curl https://<your-app>.up.railway.app/api/health
```

If the container exits immediately, read the log lines beginning `[startup]
ERROR:` — each names the exact variable to fix.

**Immediately after the first successful deploy:** sign in as the super admin,
change that password, and enable two-factor authentication.
