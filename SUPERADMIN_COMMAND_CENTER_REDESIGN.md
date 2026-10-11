# Superadmin command center

Complete source update built on the seven-portal redesign. This package retains those seven workspaces and all earlier registration, dues, finance, portrait-model and security updates. It is not a live deployment.

## Experience
- Platform branding in the header; consistent light/dark styling, responsive mobile drawer, keyboard page finder (Ctrl/Command K), skip link and shared AuthContext sign-out.
- Twelve grouped navigation destinations: command center, churches, church configuration, users/access, billing, subscriptions, support, communication, analytics, reports, audit/security and system settings. Previously hidden routes are now discoverable.
- A new platform dashboard showing registered churches, member records, unresolved support and paid invoice values in a selected currency.
- Actionable priorities: pending churches, overdue unpaid invoices, urgent unresolved tickets and upcoming renewals.
- Direct links open the existing church registration dialog, church details drawer, invoice search/filter or support conversation. They do not submit, suspend, delete, impersonate, renew, pay, refund or message automatically.
- Next renewal conversations, oldest unresolved support, overdue invoice follow-up, recent registrations, plan assignments and audit activity.
- CSV, genuine Excel `.xlsx` and React-based print/PDF snapshot exports. Text is escaped; CSV spreadsheet formulas are neutralized.
- A new read-only audit/security screen with search/export of the latest 100 loaded audit records and the existing login-record viewer, now with retry handling.
- Billing summaries/exports display invoice currencies correctly and clearly describe loaded records rather than implying platform-wide all-time totals. Billing print preview excludes the application chrome.

## Data semantics
`GET /api/v1/superadmin/workspace-overview` is protected by persisted SUPER_ADMIN authorization (not the role claimed in a token). It uses existing database tables and returns a combined recorded overview; failures return an error instead of a successful zero/healthy dashboard.

Church/member counts exclude deleted churches. “Active church accounts” means tenant status `active`, not verified paid subscriptions. User accounts include registered accounts. Support priorities include `open` and `in_progress`; resolved urgent tickets do not count as unresolved. Overdue invoices must be pending/overdue and past their due date. Renewals are active/pending/trial church records expiring in the next 30 days, with subscriptionEndDate taking precedence over trialEndDate. Queues show bounded previews, with links to management screens.

Billing records are platform invoices, never church donations/dues. Values are separated by currency without conversion. Paid invoice dates use paidAt when present and issueDate/createdAt for legacy rows, disclosed in the dashboard. Future/invalid paid records are excluded from the overview. Trends cover the trailing 12 UTC calendar months; registration trends are new registrations per month, not an invented cumulative activity metric. The database check and process uptime are measured snapshots, not a provider availability/SLA monitor. No synthetic MRR, automatic revenue target or church donations are presented as platform receipts.

Legacy subscriptions, analytics and reports remain existing modules with their existing recording models and limitations. This is not a certification of every legacy financial report, an accounting system, a full security audit, or a promise of delay-free networks.

## Deploy
Back up the repository/database. Deploy the full frontend and server together; the new command center requires the new overview route. Retain existing production environment values. Run `npm ci`, `npm run typecheck`, `npm run build`, then `npm start` using the normal hosting process. No church deletion/reset or new destructive migration is needed. Verify one real SUPER_ADMIN account, saved platform branding and management workflows in staging before release. Provider delivery, payment gateways and production deployment are not tested by local previews.

## Validation
- TypeScript checks and production frontend/server build passed. Vite still reports the existing large-chunk warning; this is not a guarantee of instantaneous production loading.
- Full automated suite: 318 tests, 317 passed, one unchanged baseline failure in `tests/memberImport.test.ts:43` (Excel serial-date expectation: expected 1990-04-03, actual 1990-04-01). The parser/test are unchanged by this release; the suite is not fully green.
- New tests cover currency-separated billing/UTC date rules, safe CSV, role-aware navigation, and a real PostgreSQL overview/queue integration case including denied church/member access.
- Isolated Playwright checks with synthetic records passed at desktop 1440px (light/dark), mobile 390px and tablet 768px: overview/currency changes, CSV and real XLSX downloads, print preview, keyboard page finder, theme toggle, mobile navigation, church registration and review drawers, urgent unresolved support/deep conversations, overdue invoice filtering, audit search/login records, overview retry/empty states, and document-width containment. No record writes were made during these navigation checks.
- Additional desktop failure/retry scenarios passed for church details, billing, support, audit and login records. Church review uses a separate ID while details load, so a shortcut never creates a partial editable/deletable church object.
- All seven existing portal interface regression scenarios passed: 21 combinations (each role at desktop light/dark and mobile light), including branding, page finder, theme/navigation and role actions. These are local checks, not live provider/production verification.

Snapshot exports and queue previews are bounded recorded views; review staging with real data before production release. All existing source files and public portrait-model/license assets are retained.
