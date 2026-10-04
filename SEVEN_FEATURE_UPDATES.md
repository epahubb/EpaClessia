# Role portals, camera portraits, church branding and six-digit IDs

This source archive includes all preceding attendance, recoverable church deletion, multi-day groups and member-login fixes.

## 1. Role changes switch the portal

Change a linked account's role under Church → Users & Permissions, or the superadmin User Management / user-tenant-role editor. Role changes update the authoritative account role and the matching tenant-role row. Church admins cannot grant SUPER_ADMIN.

Login and GET /auth/me return the persisted role and church context, including the uploaded church logo. Active sessions refresh on window focus, account-change events and every 30 seconds while visible; a role change redirects to that role's portal. Backend authorization already uses current database account state on every request, not stale token role claims. Accounts do not need their password changed to switch roles.

## 2–3. Camera and white-background portraits

Member Management → Add/Edit Member → Profile picture has Upload and Open camera. The member's own My Profile page has the same controls. Camera access is requested only on clicking Open camera. Operators can capture, preview, retake, switch camera and cancel. Streams stop on capture/close/unmount. A device-camera/file fallback is provided.

Uploaded/captured member portraits undergo actual foreground segmentation, white-background compositing and JPEG compression. Photos are processed locally on the user's device; only the finished image goes to the application backend. The application self-hosts the model/runtime files in public/portrait-model; no third-party photo-processing service receives the image. First use downloads roughly 54 MB of model/runtime assets, then browser caching speeds subsequent use. A clear single-person portrait is recommended; segmentation can make mistakes around hair or complex scenes, so review the preview.

Background removal runs in a standalone worker. The application-page CSP stays strict (no JavaScript unsafe-eval). Only the named portrait-worker script response permits tensor-runtime code generation, with same-origin/blob networking. This keeps the runtime isolated from the DOM and localStorage. Deploy the backend policy changes together with the frontend worker.

If processing fails, the original image is not silently uploaded with an unchanged background. Existing stored photos are not bulk-edited: their background changes when they are replaced through the new workflow.

Camera capture requires HTTPS (or localhost for testing), browser camera permission and a supported device. Older browsers without OffscreenCanvas/modern WASM may need a current browser. Microphone access is not requested.

## 4. Church title and favicon

Once a signed-in church context is known, the browser title is the church name and favicon is the uploaded church logo, falling back to the legacy logo URL when present. Uploaded binary logos are included safely in account context. When there is no church logo, or on public login/sign-out, the configured application favicon/logo is used; the bundled /favicon.svg is the final default. The favicon is explicitly reset, so a previous church's icon does not linger. Public login cannot identify a church until a church context is known.

## 5. Superadmin login background

Superadmin → System Settings → General & Branding → Login screen background image → Upload → Save changes. JPEG/PNG/WebP inputs are resized/compressed, previewed, and persisted. Saving refreshes branding; the public login screen loads this image. Logos keep their transparency; branding images do not undergo portrait segmentation.

## 6. Profile pictures below 1 MB

The browser produces a white-background JPEG at no more than 999,999 bytes. All backend member-photo writes independently decode, resize to a maximum 512px edge, flatten alpha to white and compress JPEG below 1,000,000 bytes, even for clients bypassing browser compression. Inputs over 25 MiB or invalid images are rejected. Server flattening alone does not remove an opaque background; raw API clients must submit the segmented portrait to get that effect.

Save is disabled during photo processing. Other typed form values are preserved when the asynchronous photo finishes. Binary pictures are omitted from member-profile JSON and served from authenticated photo endpoints.

## 7. Six-digit member IDs

Member IDs are display identifiers such as 000001, never MEM-000001. They are strings so leading zeros remain visible. New registrations, imports, visitor conversions and new self-service profiles use a transactionally locked per-church allocator. IDs are unique within a church; different churches may have the same display ID.

Startup migration strips MEM- from valid legacy six-digit values, preserves already-valid unique IDs and assigns unused six-digit IDs to missing/invalid/duplicate legacy display IDs. Previous changed values are retained in members.previousMembershipId. A per-church unique database constraint prevents duplicate display IDs. Internal member primary keys, attendance and family relationships are unchanged. Back up the database before deploying; reprint member cards when display IDs change.

Import templates use six digits. Invalid explicit IDs and duplicate requested IDs are rejected instead of saving a non-six-digit value.

## Profile-save clarification

Registration-only username/password/activation controls are no longer displayed in ordinary Edit Member forms. Use the key icon for login credentials. This prevents the known unsupported-portal-field save error without mixing password updates into profile edits.

## Deployment

1. Back up the production database (the display-ID migration changes existing display IDs).
2. Install with npm ci, then npm run build. Redeploy BOTH frontend and backend on Railway, and restart the backend.
3. Keep public/portrait-model in the build context. Vite copies it into dist, and Docker includes it. Do not upload only src or omit model assets. Dependency/model versions are pinned together.
4. Retain production database/JWT settings. The database account needs DDL permission for the ID sequence, previousMembershipId field and unique constraint, plus prior portal migrations. Review startup logs for failures.
5. Use HTTPS, allow camera permission and clear stale cached frontend assets after deployment. External hosting/proxies must preserve the named worker's scoped CSP; overwriting it with the application-page policy will block segmentation.
6. Test one real member role change, camera upload, favicon, login background and ID in the deployed environment before broad rollout. No live Railway deployment or production database was accessed during development.

## Licensing — review before production

@imgly/background-removal 1.7.0 is supplied under the AGPL license. The source/package license and third-party notices are included under public/portrait-model. If this application is deployed as proprietary software, review AGPL obligations and obtain an appropriate commercial license from IMG.LY if required. No commercial license was purchased or inferred by this update. ONNX Runtime and Sharp have their own included dependency licenses.

## Validation scope

- Type checking and production build passed. Full test suite: 263 tests, 262 passed, one pre-existing unrelated Excel serial-date test failure.
- SQL-backed HTTP tests of registration/login, role changes, current-account context, tenant/account access blocks and profile-photo response boundaries, using pg-mem.
- Real Sharp tests of large-image compression, white alpha flattening, invalid-image rejection and strict byte/dimension limits.
- Member-ID normalization, migration repeatability, collision repair, retained old display IDs and allocation tests.
- Real browser portrait segmentation/compression (not mocked), plus camera capture/retake/cancel and stream cleanup, desktop/mobile/dark UI checks.
- Production-built portrait processing tested under the actual application and isolated-worker security headers.
- Live UI role redirect, church title/favicon fallback and login-background upload/save/render checked with fixture APIs.

pg-mem does not emulate transaction rollback or arbitrary binary bytea round-trips exactly; tests do not claim lossless binary PostgreSQL persistence or live production verification. The existing unrelated Excel serial-date import test failure remains documented in MEMBER_LOGIN_FIX.md.
