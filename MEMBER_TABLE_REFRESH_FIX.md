# Member management listing and refresh fix

This is a full updated source archive, including all previous updates. It is not a live Railway deployment.

## Cause found in the source
The member API defaulted to 50 rows and alphabetical last-name order. Member Management discarded pagination metadata and rendered that first page without navigation. Once a church exceeded 50 members, a correctly saved registration could be outside the visible page. The table did already attempt to reload after saving, but failed list requests were silently converted to an empty table. Overlapping requests could also overwrite a newer list with an older result.

These are verified source-code problems. Without access to the live deployment/database/logs, this does not establish which one caused a particular live registration to disappear.

## Fix
- Member Management now uses server pagination (25, 50 or 100 rows per page), with total count and previous/next page controls. It no longer silently shows only the first 50 records.
- Name/email/phone/member-ID search runs across the church's full membership list, not just the loaded page. PostgreSQL name/email search is case-insensitive.
- Management lists newest registrations first. Other consumers keep the previous alphabetical default.
- After a successful registration, clear the current search, return to page one and refresh. Insert the confirmed server response immediately, so the member stays visible if the follow-up list request fails.
- Show refresh failures with Retry instead of throwing away existing records or reporting an empty church. Retry fetches the list; it does not submit registration again.
- Ignore older responses once a newer list request has started. Refresh on focus/visibility and provide a manual Refresh button.
- Validate API page/limit/sort and return numeric totals with Cache-Control: no-store. Tenant authorization and credentials remain unchanged.
- Make the church-admin sidebar/header responsive so mobile users can access the table and page controls. Horizontal table scrolling preserves all member columns on narrow screens.

If the Add Member save itself fails, the form stays open with the error; no member is inserted into the UI as a successful registration. If a member was already registered, search their name or six-digit ID rather than registering a duplicate.

## Deployment
Back up the database. Deploy frontend and backend together from this archive and hard-refresh the browser so it loads the new JavaScript. No new database migration is required specifically for this listing fix; earlier additive migrations in the full archive still apply when upgrading from older versions. There is no need to re-register members already saved in the database.

## Verification
Production registration/list handlers tested through a pg-mem SQL adapter: immediate visibility after POST, newest-first behavior, more than 50 members across pages, tenant-scoped totals/search, case-insensitive and member-ID search, pagination validation, no binary photo output and no-store headers. All 13 registration/login integration checks pass.

Desktop, 390px mobile and dark-mode browser checks with UI fixtures cover next page, full-list search, registration from a filtered view, late stale responses, a simulated failed post-save refresh that retains the saved member, and retry without a duplicate POST. These fixtures do not claim live Railway validation. Mobile table controls and desktop/mobile/dark screenshots were inspected.

Type checking and production build pass. Full regression suite: 281 tests, 280 pass, one unchanged pre-existing Excel serial-date expectation failure (1990-04-03 expected, 1990-04-01 produced) in memberImport.test.ts. Independent security/real PostgreSQL staging requirements in OPERATIONS_SECURITY_FINANCE_UPDATE.md still apply.

## Follow-up: PostgreSQL registration rollback
The listing fix remains included, but a separate registration transaction bug was subsequently found and corrected. See MEMBER_REGISTRATION_COMMIT_FIX.md for the root cause, PostgreSQL-engine regression checks and handling previously rolled-back registrations.
