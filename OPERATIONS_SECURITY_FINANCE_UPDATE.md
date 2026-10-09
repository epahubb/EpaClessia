# Church operations, group care and finance update

This archive includes the earlier attendance, church deletion, member login, photo, branding and six-digit member-ID updates. It adds the changes below. It is source code, not a deployment to the live Railway service.

## Church member counts

The superadmin church list now aggregates the **members table**, per church. It no longer counts staff or portal accounts. Members without login credentials count; an empty church displays zero. The detail drawer uses the same membership source. These are all records in Member Management, independent of the current search/status filter; the separate visitors register is not counted. The list and an open detail drawer refresh every 30 seconds and on window focus.

## Group-leader portal

1. Under **Users & Permissions**, create an active account with role **Group Leader**, or change an existing member's login account to that role.
2. Under **Settings → Groups**, select that account in **Group leader account** and save. The display name alone does not grant access. A leader may be assigned to more than one group.
3. The account lands at `/group-leader/dashboard` on login. Existing sessions reflect role changes on focus or within 30 seconds.

Features:
- Group selection, meeting days/time/location, roster and contact details.
- Inclusive UTC attendance date range and per-member present/absent/rate summary.
- Individual attendance history and existing monthly charts, from the dedicated scoped API.
- Printable attendance report; text filtering is reflected in the printed report.
- Care actions (call, visit, check-in, prayer or other), due time, notes, completion and reopening.
- Own member profile, theme switch and sign-out.

Every group, member, attendance and care request verifies the persisted role, current church, active group and current leader assignment on the server. A crafted group ID, member ID or tenant parameter cannot bypass that check. Reassigning a group immediately removes the previous leader's API access. A member moved to a different group no longer appears in the old group's care notes. Church admins/pastors may review their church's active groups using the same API; cross-church access is denied. Care notes are shared group-care records, not private counseling records. Do not enter medical, counseling or financial secrets there.

Group leaders cannot edit core member records, mark attendance, grant roles, read bank information or use the church administration API. This deliberately does not duplicate the full administrator portal. Up to 2,000 members/10,000 attendance marks are allowed per overview; oversize results fail explicitly rather than quietly displaying partial totals. Care history currently shows the latest 1,000 actions.

## Multiple meeting days

Groups already supported multi-selection; that support is retained, with a real leader-account assignment. Service schedules now also accept several meeting days, preserving old single-day values. All selected days share the configured time/location. Existing events are not automatically regenerated from schedule changes.

## Collection timestamps and tithe date ranges

Manual giving has **Collection date & time** plus the separate server **Recorded at** timestamp. New date/time inputs are interpreted in the user's local timezone and sent as UTC instants. Existing donations initialize their collection time from their recorded time; older entries cannot reconstruct a time that was never recorded. Online giving without a separate collection timestamp uses its existing recorded time. Expense date/time is also preserved, with recorded time as fallback.

Use **Finance → Reports & Documents** (or the finance portal's **Reports** page). Select From/To UTC dates and apply. The final day includes its full 24 hours; received gifts use collection time, not when the data-entry operator keyed them in. A report can cover at most 366 days and 10,000 rows per record category. Requests over these bounds return a clear error.

Totals separate each currency. Only completed giving is income and only paid expenses reduce cash. Purposes exactly `Tithe` or `Tithes`, case-insensitively, contribute to tithe totals. Custom purpose names that merely contain the word are not silently classified as tithes. Pending/failed transactions are not cash collected. Monetary totals use integer cents.

## Printable documents

Use **Print / Save PDF** to open a document preview, then your browser's print dialog. Printing is client-side and uses React-escaped text, not raw HTML construction. The print stylesheet hides portal navigation and controls.

Included: income/expenditure statement, tithe collection report, completed-giving receipts, church invoices, expense register, financial forecast, budget snapshot and pledge snapshot. Receipts cannot be issued for pending/failed gifts. Each receipt shows amount/currency, giver, purpose, collection/entry time, method and reference. Financial documents omit wallet/bank/card account details.

Church invoices can be created, marked paid or voided. They have unique identifiers, recipient, description, amount/currency, issue/due time and status. These are separate from platform subscription invoices. They are not linked to online invoice settlement. **Marking an invoice paid does not create a donation or income entry**: record its collection once through the giving workflow to include it in cash reports. Invoice status changes are manual and do not create an audited accounting ledger or tax invoice certification.

The forecast projects the selected period's daily average of completed income and paid expenses over 1/3/6/12 months (30.4375 days per month). It is prominently labeled an estimate, not guaranteed income; it is not seasonal modeling or professional financial advice. Budget/pledge views are all-current-record snapshots, not filtered historical balance sheets. The existing budget module is GHS-based. Reports do not assert a reconciled bank balance, audited accounts or tax compliance.

## Security hardening performed

No software is unhackable. These changes strengthen the existing protections; they do not constitute a full independent security assessment.

- Patched dependency advisories, including replacing the vulnerable npm SheetJS version with the official SheetJS 0.20.3 distribution. Latest `npm audit --omit=dev` reported **0 known advisories** for the resolved production dependency tree. Audit results change over time.
- Persisted-role/tenant checks and new least-privilege group/finance boundaries. Regular members and group leaders cannot read arbitrary church-admin APIs; finance officers use a minimal member-options endpoint rather than full profiles.
- Signed access and refresh tokens are bound to the account's current password hash through a server-side HMAC (the password/hash is not included in token claims). Password changes/resets invalidate old tokens automatically. Refresh tokens cannot be used as access tokens.
- Server-side logout increments the account's token version, revoking that account's existing access/refresh tokens on **all devices** once the logout request succeeds. Offline/network-failed logout cannot guarantee server revocation. Cached browser state is still cleared.
- The default access lifetime is 15 minutes with the existing refresh workflow. An explicitly configured `JWT_EXPIRES_IN` overrides the default. Existing pre-upgrade tokens must sign in again.
- Rejected browser origins receive 403 before handlers run; exact same-origin requests are supported without a cross-origin allowlist. Existing strict same-site cookies/CSP/HSTS/HTTPS controls remain.
- Account lockout counters use a canonical username/email key to prevent bypass by switching identifiers. Unknown users receive dummy bcrypt work and generic credentials errors. Existing DB lockout and per-IP rate limits remain.
- Removed the predictable shared staff password fallback. New staff accounts require an explicit password; member passwords reject bcrypt inputs longer than 72 UTF-8 bytes. Users should choose long, unique passwords.
- Optional enforced privileged MFA: set `REQUIRE_ADMIN_2FA=true` **only after** all superadmins/church admins have enrolled in the existing authenticator setup. Unenrolled privileged accounts are then denied login. This setting is off by default to avoid locking operators out during rollout.
- Safer record IDs, pagination/date/number checks, protected role assignment, reduced raw SQL/internal-error disclosures, and audit logging for successful group/financial API access.
- API rate limiting runs before large body decoding; form parameter counts are bounded; HTTP header/request timeouts are reduced.
- Removed password/hash fields from church-detail administrator output; superadmin user updates accept only explicitly listed fields.

Remaining operator responsibilities:
- Back up the database, stage the update and restore-test backups before deployment. Deploy frontend and backend together and verify `/api/ready` before allowing traffic.
- Use strong independent JWT/refresh/encryption keys, protect Railway/operator access with MFA, and keep secrets out of repositories and screenshots. Changing the encryption key without a migration can make stored provider credentials unreadable.
- Enroll privileged accounts in authenticator MFA, then enable enforcement. Existing non-MFA sessions should be logged out/revoked during rollout if enforcing immediate enrollment.
- Prefer verified database TLS for externally reachable databases; use the provider CA. Remove `PGSSL_NO_VERIFY=true` when the provider supports verified TLS. Private-network database connectivity still follows the existing provider-specific configuration.
- Restrict network/database access and DB user privileges; enforce proxy/WAF limits, monitoring, alerting and account access reviews. Correctly configure `ALLOWED_ORIGINS` for separately hosted frontends and the trusted proxy hop in server.ts.
- In-memory rate limits are per process; multiple replicas need shared edge/WAF throttling or a distributed rate-limit store. DB account lockout remains shared.
- Bearer tokens remain in localStorage for compatibility. A successful same-origin XSS attack could steal them; a fully cookie-only/CSRF-hardened session architecture is a separate migration, not claimed here. Token rotation/replay detection per device is not implemented.
- Logs are audit trails, not immutable/tamper-proof evidence. Apply retention/privacy controls and restrict log access.
- Request an independent penetration test, patch dependencies regularly, validate real PostgreSQL migrations in staging, and test operational incident response. Camera/model licensing requirements in SEVEN_FEATURE_UPDATES.md still apply.

## Validation

Type checks and production build pass. The test suite currently has 281 tests: **280 pass**, with the same pre-existing Excel serial-date expectation failure in `memberImport.test.ts` (`1990-04-03` expected versus `1990-04-01` produced). It was not changed as part of this feature update.

15 new checks cover currency/cent calculations, token revocation logic, repeated additive migrations, live member counts, current leader assignment, cross-group/tenant/role denial, scoped care writes, collection-date boundaries, invoices and credential-bound access using production handlers and a pg-mem SQL adapter. The emulator does not replace staging checks on real PostgreSQL (including precision, binary image storage, concurrency and transactional behavior).

Desktop/mobile/dark-mode UI checks cover the group roster, attendance report/print, follow-up save, finance statement/tithes/forecast, receipt preview/print and invoice forms. Browser fixtures isolate interface behavior; SQL integration tests separately exercise real authorization and financial handlers. No live Railway tenant, camera device or production data was accessed.

## Registration transaction follow-up
See MEMBER_REGISTRATION_COMMIT_FIX.md for the subsequent production-schema invitation-log mismatch and after-commit registration fix. Earlier validation totals above describe that release, not the final cumulative suite.
