# Seven role-based workspaces

This is the complete source update built on the prior finance-workspace release. It is not a live deployment. Existing registration, member IDs, portrait assets, dues, finance reports, ministry drawers, group tools and security work are retained.

## Shared experience
- Church name and saved logo in the header; role-specific workspace titles and accents.
- Grouped desktop navigation and a mobile drawer that closes after navigation.
- Ctrl/Command K page finder searches only current workspace page descriptions. It does not search private records.
- Workspace switcher follows existing route-role permissions; it does not grant a new role.
- Light/dark appearance, keyboard skip link, responsive cards, useful task shortcuts and a workspace guide.
- Refresh/retry states. Independent member-home sources show explicit unavailable warnings instead of implying zero records after failed requests.

## Role-specific improvements
- **Church admin:** membership, visitor, approval and event overview; recorded attendance pulse; upcoming events, dates and activity. Links to currency-separated finance rather than presenting the legacy mixed-currency giving aggregate as GHS.
- **Pastor:** prayer priorities, visits, follow-up dates and a working Mark answered action. Confidential care stays in the protected counseling module.
- **Ministry leader:** managed-ministry selector, team/session metrics, events and working Complete task action. Dashboard shortcuts carry the selected ministry into roster, tasks, events and reports. Metrics describe the existing ministry roster/session API, not an invented whole-church count. Direct access to an unassigned ministry is now denied to ministry leaders.
- **Group leader:** redesigned header and direct navigation to registration/contacts, attendance reports, care, statistics and scoped SMS/email. Existing group assignment and recipient protections remain.
- **Finance officer:** the complete prior finance dashboard, ledger, dues, giving, expenses, pledges, budgets, inventory, purposes, reports/receipts and invoices are retained in the unified shell.
- **Secretary:** new records-and-calendar overview; dedicated Attendance route plus members, visitors and events.
- **Member:** upcoming gatherings, published sermons with HTTP(S)-only links, recent giving with each record's own currency, profile/privacy, directory, prayer and community shortcuts. No mixed-currency cash total.

## Server changes
GET `/api/v1/workspace/identity` resolves the authenticated persisted account's church name/logo. GET `/api/v1/workspace/secretary-summary` returns only that church's summary and next six events, for SECRETARY/CHURCH_ADMIN/PASTOR. Query-string tenant overrides are ignored. No private care notes or finance records are returned by these endpoints. Existing schema is used; no destructive reset or new migration is required for this redesign.

## Deploy
1. Back up the existing database and repository. Do not delete/recreate a church.
2. Merge/upload this full source using the normal deployment process and retain the existing production environment values.
3. Run `npm ci`, `npm run typecheck`, `npm run build`; start with `npm start`.
4. Deploy frontend and server together: the shell and secretary summary use the new workspace API.
5. Verify saved church branding, role assignment, and one real account for each role in staging before release. Keep authentication/provider secrets out of source and chat.

## Boundaries
This is a navigation/dashboard redesign with preserved operational modules, not a claim that every module form was rebuilt or every possible church feature added. Existing permission policies still apply (a pastor's finance access does not imply accountant write permissions). Email/SMS/online payments require working provider credentials; hardware attendance methods require supported devices. Finance is recorded cash movement with separate currencies, not bank reconciliation or audited double-entry accounting. Ministry budgets/attendance reflect the existing recording models. Performance depends on server/database/network and cannot be promised delay-free.

## Verification
See the release handoff for the final typecheck, build, automated-test and local responsive-preview results. Browser previews use synthetic fixtures, not production church data; live provider delivery and production deployment are not exercised.

### Release validation results
- TypeScript and the production build passed; the build retains an existing large-chunk warning.
- 22 focused navigation / real-PostgreSQL integration tests passed, including workspace role/tenant isolation and denial of unassigned ministry access.
- Full regression suite: 314 tests, 313 passed, one unchanged Excel serial-date import test failed (`1990-04-03` expected, `1990-04-01` returned). That test and parser were not modified by this update. Investigate separately before treating the full suite as green.
- All seven dashboards passed local synthetic-data previews at desktop 1440px (light/dark) and mobile 390px (light): 21 role/layout combinations. Checks included page finder, theme switch, mobile navigation, dashboard retry/partial-failure handling and relevant prayer/task/group-report actions.
- Retained finance workflows additionally passed desktop light/dark and mobile checks: dues dialog, ledger search/filter/CSV/print, operational modules, dues reports/receipts and retry behavior.
- Existing portrait/model assets are retained byte-for-byte. No production database or provider was used for preview testing.
