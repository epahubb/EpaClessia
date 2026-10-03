# Member registration username/password fix

This archive includes the attendance section, recoverable superadmin church deletion, and group meeting-day multiselect from the earlier update.

## Intended flow

1. Open Member Management → Add Member.
2. Enter the member details, chosen Username and Password (at least 8 characters).
3. Leave “Allow sign-in immediately” enabled (the default).
4. Save. The member and its login account are saved together; credential failures are reported rather than hidden behind a successful registration.
5. At /login, enter the same username and exact password. Username matching is case-insensitive; password matching is exact. A successful member sign-in leads to the member dashboard.

Email is optional when both username and password are entered and immediate sign-in is enabled. With an email address, generated credentials and optional email activation remain available. Explicit credentials cannot silently reuse a staff account with a different password. Duplicate usernames are rejected.

## Changes

- Registration persists the entered password as a bcrypt hash and links the MEMBER account to the member record and church.
- Registration, family/ministry links and login creation use a database transaction. Explicit credential creation failures roll back rather than creating a misleadingly successful profile.
- The login page now uses the same configured API client as registration. Both honor VITE_API_URL instead of login always calling the frontend host's /api/v1.
- The production login handler is shared with SQL-backed HTTP integration tests.
- users.email is nullable for username-only member accounts. Existing email uniqueness is retained.
- Registration displays the login-creation outcome; errors retain the typed form values.

## Deployment (required)

Back up your database, install dependencies with `npm ci`, then build with `npm run build`. Deploy both the frontend and backend from this archive and restart the backend; updating only frontend files is insufficient. Retain the correct production DATABASE_URL (or PG* / MySQL settings), JWT_SECRET and notification configuration.

If using a separate API host, set VITE_API_URL to the correct API root (including /api/v1) before building the frontend. Confirm production CORS permits the frontend origin.

Backend startup applies the additive member-portal migration, including allowing a NULL users.email. The database account must have ALTER TABLE permission. Check backend startup logs for migration errors. Do not use the insecure development JWT secret in production.

No live deployment or production database was accessed during this work.

## Previously registered members

An earlier successful profile registration may not have saved any login account, or the account may still be pending activation. This update does not invent or recover the original plaintext password.

For an affected member, use the key icon in Member Management to set their intended username and password once and enable “Allow sign-in immediately”. If their credentials are already correct but the account is pending, activate the portal account. Do not reset working accounts unnecessarily. Members then use those credentials at /login.

## Validation

- Production registration route, production login handler and member profile authorization exercised over HTTP against an in-memory PostgreSQL-compatible SQL emulator (pg-mem), with real bcrypt hashes and JWTs; login responses were not mocked in these tests.
- Tested registration and exact-password login with email and without email, default immediate activation, wrong-password rejection, invalid-password rejection, duplicate usernames, staff-email conflict, no-email activation guard, suspended accounts and deleted churches.
- Desktop (1280px) and mobile (390px) browser checks confirmed credential form payloads, visible errors, retained password values, configured API-root use and member-dashboard redirect. UI browser checks use fixture API responses; they are not live deployment tests.
- Type checking and production build pass.
- Full suite: 256 tests, 255 passed and one pre-existing unrelated failure: `parseImportDate converts Excel serial numbers` in tests/memberImport.test.ts (1990-04-01 vs 1990-04-03). It is documented here rather than changed as part of authentication work.

pg-mem is a development-only test dependency. Its transaction emulation is not a substitute for testing rollback on your production database engine.
