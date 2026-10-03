# Member details: attendance update

## What changed

Open **Members → View member details** (the eye icon). An Attendance section now appears after Personal and membership details.

- Date presets: last 30 days, last 90 days (default), and this year.
- Custom From / To dates with an Apply button and validation.
- Present, absent, attendance rate, and not-marked/registration totals.
- Monthly stacked attendance-count chart and attendance-rate graph.
- Paginated event history with event date, title, attendance status, and recording method.
- Responsive layout, theme-aware charts and date inputs, loading/empty/error states, and retry.

## Data rules

- Uses existing `event_attendance` and `events` records. No database migration or new dependency is required.
- Filters by **event start date**, not check-in time. Dates are inclusive **UTC** days.
- Rate = present / (present + explicitly absent), expressed as a percentage. It is unavailable when there are no marked events.
- Registrations/cancellations are not attendance, even if they inherited a true `present` database default. Events with no attendance record are not automatically classified as absent.
- One record is counted per event; the highest attendance row ID is used for legacy duplicates.
- Months without any records between observed months remain gaps, not invented zero attendance.
- History pagination does not limit the records used for summaries and charts.

## API

`GET /api/v1/church/members/:id/attendance?from=YYYY-MM-DD&to=YYYY-MM-DD`

Returns `{ records, from, to }`. Uses the existing authenticated church router and tenant context. Both member lookup and the event/attendance join are tenant-scoped. Invalid date ranges return HTTP 400; a member outside the current tenant returns HTTP 404.

## Changed files

- `src/components/church/MemberDetailsDialog.tsx`
- `src/components/church/MemberAttendanceSection.tsx` (new)
- `src/services/churchApi.ts`
- `src/routes/church.ts`
- `src/lib/memberAttendance.ts` (new)
- `tests/memberAttendance.test.ts` (new)

## Validation

- TypeScript typecheck passed.
- Production build passed (existing large-bundle warning remains).
- All eight new attendance tests passed.
- Local browser checks used mocked API responses: desktop, mobile, dark mode, charts, date filtering, invalid ranges, empty state, server errors, and retry passed. Visual captures were inspected.
- Full suite: 234 passed, 1 failed. The same unrelated failure occurs in the unmodified upload: `parseImportDate converts Excel serial numbers` in `tests/memberImport.test.ts` (expected 1990-04-03; actual 1990-04-01). It was not modified as part of this attendance update.
- A live database-backed end-to-end check was not run because no database configuration was supplied.

## Run / deploy

Use the existing project instructions and database configuration. For this Node/Express + React implementation:

```sh
npm ci
npm run typecheck
npx tsx --test tests/memberAttendance.test.ts
npm run build
npm start
```

Redeploy both frontend and Node backend together so the new attendance endpoint is available. Generated builds, dependencies, and temporary browser fixtures are intentionally excluded from the source archive.
