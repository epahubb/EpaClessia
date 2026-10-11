# Ministry and portal integration update

## Deploy without deleting your church
1. Back up PostgreSQL before deployment. Replace the app source with this full archive and deploy both the frontend and server (`npm ci`, `npm run build`, `npm start`). Do not deploy only the React frontend.
2. Wait for database initialization and feature migrations to finish. Startup adds nullable `ministryId` associations to donations, expenses and events, with indexes. No member or church records are deleted.
3. Test with your existing church: assign a member to a ministry; open Ministries & Groups and confirm its derived count; click the ministry name for the right-hand detail panel.
4. Use Ministries & Groups → Groups (or Settings → Groups) to choose an active member/Group Leader **account** as group leader. Saving the assignment promotes that member account to GROUP_LEADER. A typed leader name or descriptive position does not grant permissions. Existing explicit active leader-account assignments are repaired at startup. The session refresh updates role and portal navigation; sign in again if an older browser session remains on its former portal.
5. Configure SMS/email and fund church SMS credits as needed. Messages report actual provider success/failure; missing configuration is not represented as successful delivery. Group SMS reserves credits atomically and refunds failed sends.

## Ministry details
- Counts are derived from registered member profiles and multi-ministry links, with legacy single-ministry assignments included and deduplicated. Deleted profiles and stale links do not inflate counts. Count is not a manually editable field.
- Selecting a ministry opens a responsive right-hand panel: roster, ministry meeting attendance, explicitly assigned finances and events, schedule, leader, contacts, and printable member attendance report.
- Add Ministry wording is corrected. Groups now use actual pastoral-care group records and leader accounts; older cell-ministry records remain accessible on a separate legacy tab.
- Select the ministry when recording offline giving/expenses or creating an event. Old unassigned transactions are not guessed from donor membership; a person can serve in multiple ministries. Completed income and paid expenses determine net cash, separately per currency.
- Attendance uses recorded marks at events explicitly assigned to that ministry. Unmarked/cancelled registrations are not absences. Current roster is used; historical membership changes are not reconstructed.

## Group leader portal
- Register members only in the assigned active group; caller-supplied tenant/group/role/ministry/medical fields are not trusted.
- Read own-group contacts and attendance; print attendance reports; review group statistics and record practical follow-up care.
- Send SMS/email only to selected members of the current group, respecting contact opt-outs and deduplicating addresses. Up to 100 recipients; bounded provider concurrency; rate-limited sends; SMS credit checks. No other group's contact lists or church finance records become accessible.
- Links to the member portal and own profile remain available.

## Member portal and sermons
- Missing groups, join/leave, prayer, directory, published-sermon and branding APIs are implemented behind the authenticated member context. Tenant query/header values cannot change that context.
- Pastoral groups are assigned by the administrator. Ministries support join/leave for linked profiles; join is idempotent and updates derived counts.
- Private prayer requests are excluded from the public wall; anonymous requests hide display names; staff notes/identity fields are not exposed on the wall.
- Directory is opt-in. Phone and email each need explicit consent; suspended/inactive member profiles are excluded.
- Member and group-leader portal headers show the church name and saved logo. Responsive member navigation no longer reserves a desktop-width sidebar on mobile.
- Administrator Sermons menu publishes HTTPS/HTTP sermon/audio/notes links. Only published messages in the authenticated church appear in member Sermons/dashboard. Unsafe link schemes are rejected.
- Attendance history qualifies table columns and tenant joins to prevent ambiguous SQL and cross-tenant event joins.
- Added refresh/retry controls and a bounded API timeout; route-level lazy loading reduces initial download. Performance still depends on hosting, database size, connectivity and providers; zero latency is not promised.

## Validation
- TypeScript and production build checked.
- Real PostgreSQL-engine regression tests exercise derived counts, duplicate joins, tenant privacy, ministry attendance/finances, published sermons, directory/prayer privacy, branding, attendance SQL, group registration, foreign-recipient rejection, SMS credit refunds and role promotion.
- Synthetic local UI tests cover desktop/mobile ministry panels, group registration/statistics/messaging, church branding, member groups and sermons; dark mode also checked.
- Existing full-suite Excel serial-date test is a known unrelated failure (expected 1990-04-03, actual 1990-04-01). It is not silently removed or changed.
- Prior registration commit verification, credential logging safeguards, profile tools, finance reports and bundled portrait-model assets retained.

## Limitations / follow-up
- This source archive has not been deployed to your Railway service by the assistant. The new church you created was not modified during implementation.
- Real provider delivery/payment completion must be verified in the configured deployment. Failed provider messages should not be blindly resent to all recipients because successfully delivered recipients could receive duplicates.
- Existing manually entered leader names without a linked account need an administrator to choose the correct account; permissions are never inferred by matching names.
- This is a targeted integration update, not a claim that every screen in every staff portal has received exhaustive live acceptance testing.
