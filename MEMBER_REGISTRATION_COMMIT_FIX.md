# PostgreSQL member-registration commit fix

This is a full source release based on the latest delivered member-table refresh archive. All previous pagination/search, group-leader, finance, member-ID, camera, branding and security features remain. It is not a live Railway deployment.

## Root cause
The production initializer creates `communications_log.channel` as a required column. Portal invitations instead inserted `communications_log.type`, which does not exist in that schema. This optional audit insert ran inside the member/login transaction and swallowed its SQL error.

In PostgreSQL, catching a failed statement in application code does not recover an aborted transaction. A subsequent `COMMIT` rolls it back. Knex can resolve that commit command without an application exception, allowing an HTTP 201 registration response even though neither the member nor the login was saved. Email/SMS attempts occurred before commit, so notification warnings could misleadingly suggest an account existed.

This matches the missing-member/unknown-username behavior and was reproduced using PostgreSQL's engine in PGlite. The live Railway database was not accessed, so individual historical registrations are not independently audited.

The earlier first-50-members/pagination fix addressed a separate listing problem, not this rollback. The original registration test fixture incorrectly used a `type` column; it has now been corrected to match the actual `channel` schema.

## Fix
- Use `channel` for invitation audit writes, matching db-init.ts.
- Commit the member and login atomically before delivering invitations. The transaction cannot contain optional notification/audit writes.
- Queue notification callbacks without putting their passwords into API responses, then run them only after a successful commit.
- Verify both the member and expected login exist on a fresh database query before claiming registration success or sending credentials. If verification fails, return a clear 503 warning to refresh/search before retrying.
- A failed or unavailable invitation-log table is now outside the registration transaction and cannot remove the saved profile/account.
- Emit `[members] Registration committed.` with internal tenant/member IDs and a portal-created boolean, not names, passwords or message content. This log appears only after persistence verification.
- Remove plaintext message/recipient logging from SMS failures and full Axios/provider-response logging that could expose messages/passwords/API keys. Provider failures log safe status/code metadata only. Add a 15-second SMS timeout.
- Patch newly reported dependency advisories resolved by npm audit fix.

Missing email/mNotify configuration still means messages are not delivered. It no longer causes a registration rollback. A member with explicitly chosen valid credentials can sign in without successful invitation delivery when immediate access is enabled.

## Deployment and affected records
1. Back up the database and deploy frontend/backend together from this archive. No new database migration is needed specifically for this fix: the production schema already defines `channel`. Earlier migrations in the complete release still apply if upgrading older versions.
2. Hard-refresh the browser and sign in again if the session has expired.
3. Register a test member with a new, unique username and strong password. Check the table and login. Railway should show the new committed-registration log entry.
4. Search the existing register before re-entering historical members. A rolled-back registration did not leave a recoverable record; this patch does not reconstruct it. Re-register only people confirmed missing, once the corrected deployment is active.
5. Change/revoke any credentials exposed in previous logs or chat, and restrict/remove retained exposed logs. Use new passwords, not the previously exposed ones. Configure email/SMS separately if invitations should be delivered.

## Regression coverage
- The embedded PostgreSQL engine reproduces the old failed-column/COMMIT silent rollback.
- Actual production handlers commit the new member and login using the production-shaped channel schema; newest-first listing finds the member immediately.
- Deliberately unavailable communications logging does not undo registration, and the new username/password signs in after the 201 response.
- A real credential conflict rolls back the new member and is not reported as success.
- Additional SQL-adapter registration/list tests use the correct audit schema and exercise after-commit audit failure.
- Tests assert SMS/email provider error logs and return objects do not contain synthetic invitation passwords/API keys.

PGlite is a development/test-only dependency; it is not used to store production data. Tests run PostgreSQL's engine in WASM with a thin Knex query adapter, not a live Railway connection. Real deployment/network/provider/staging checks remain necessary.

Final cumulative validation: type checking and production build pass; 289 tests, 288 pass, one unchanged pre-existing Excel serial-date expectation failure in memberImport.test.ts. All PostgreSQL commit-regression and safe-logging checks pass. Production dependency audit reports zero known advisories at packaging time.
