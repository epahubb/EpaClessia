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
