# Church deletion, multiple meeting days, and member username sign-in

This source archive includes the earlier member-attendance update and these three additional changes.

## 1. Superadmin: delete a church

In **Churches Management**, use the red trash icon or **Actions → Delete Church**. Type the church name to confirm.

Deletion is **recoverable**, not a permanent data purge:

- The church is hidden from the normal church list and included only in the **Deleted** status filter.
- Its members and staff cannot sign in, refresh tokens, or use existing access tokens. Device-key attendance access is also blocked.
- Records remain intact. In the Deleted view, choose **Actions → Restore Church** to allow access again.
- Only a persisted, active SUPER_ADMIN account can delete or restore churches; a JWT role claim alone cannot grant this permission.
- Payment callbacks cannot silently reactivate a deleted church.
- The old permanent-delete option has been removed: deleting only the tenant row did not safely purge related records and could fail on database relationships.

The delete API requires `{ "mode": "soft", "confirmationName": "Exact Church Name" }`. Unsupported deletion modes return HTTP 400.

## 2. Groups: select multiple meeting days

In **Church Settings → Groups → Add Group / Edit**, use **Meeting days** to select any combination of weekdays. Selected days appear as chips and can be removed individually.

- Existing single-day settings remain selectable when edited.
- API requests accept `meetingDays` arrays. The server validates, deduplicates, and orders them by weekday.
- The existing `meetingDay` column stores a readable comma-separated value, so no new database column or migration is needed.
- List responses include both the legacy display string `meetingDay` and the editable array `meetingDays`.
- An empty selection clears the schedule; omitted meeting-day fields on updates leave it unchanged.

## 3. Member portal: username and password

In **Member Management**, use the key icon (**Manage member portal access**) to create or reset a member's username and password. The member still needs an email address on their record.

- The dialog lets the church choose a username and a masked password.
- **Allow sign-in immediately** is enabled by default for newly provisioned access.
- Turning it off explicitly retains email verification for churches that want it.
- Registration also defaults to immediate sign-in, while blank credentials still generate a username/password invitation.
- Existing usernames are retained when an invitation is reset without a replacement username.
- Passwords are stored as bcrypt hashes, not plaintext; they cannot be read back.
- The login screen now says **Username or email** and sends a single identifier to the existing username-aware backend.
- A successful member login goes to **/member/dashboard**, rather than starting in the superadmin area.
- Username collisions with staff accounts are detected, long-name collision suffixes are retained, and provisioning cannot take over an account from another church.
- Dark-mode focused labels, field outlines, and text-only controls have improved visibility.

Existing pending accounts are **not bulk-activated** by this update. For an existing member, use the key dialog with immediate sign-in enabled, or the existing activation action.

## Deployment

Redeploy the React frontend and Node/Express backend together using the existing project configuration. No new runtime dependency or database migration was added.

```sh
npm ci
npm run typecheck
npx tsx --test tests/accountAccess.test.ts tests/authAccess.test.ts tests/groupMeetingDays.test.ts tests/memberAttendance.test.ts
npm run build
npm start
```

## Validation and remaining limits

- TypeScript check and production build passed.
- All 21 focused tests passed: 13 new tests for these changes plus the eight attendance tests.
- Full suite: 247 passed, one unrelated pre-existing failure remains (`parseImportDate converts Excel serial numbers` in `tests/memberImport.test.ts`, also present in the original upload).
- Local browser checks used mocked API responses to verify delete confirmation, hiding/restoring deleted churches, multi-day group creation/editing, portal credential submission, and username login routing on desktop, mobile, and dark mode. Visual renders were inspected.
- Access-revocation and superadmin-authorization tests exercised the real middleware with stubbed database reads; credential tests validated identifier inputs and bcrypt comparison.
- No live database or delivery provider was supplied, so live database-backed end-to-end login, email/SMS delivery, and deletion were not tested.
- The existing large-client-bundle build warning remains.

Build output, dependencies, temporary preview pages, and test-only screenshots are excluded from the archive.
