# Settings, Data, and Admin-Gap Closure Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make settings and administrative controls genuinely operational, expose the remaining reachable product workflows, and persist application/patch snapshots and findings history safely.

**Architecture:** Keep policy decisions in a small server-side settings-policy service, enforced at authentication, request authorization, and scheduled cleanup boundaries—not in the browser. Add narrowly scoped endpoints for export and destructive actions, protected by existing capability checks and explicit confirmation. Persist integration snapshots with the existing sync-store/database pattern so the UI and scheduled jobs read the same last-known-good records.

**Tech Stack:** React 19, TypeScript, Express, Zod, PostgreSQL/file fallback, Vitest.

---

### Task 1: Agree and document enforcement semantics

**Files:**
- Modify: `docs/07-features/SETTINGS.md`
- Modify: `docs/06-authentication-rbac-security.md`
- Test: `server/src/routes/__tests__/settings.test.ts`

**Step 1: Confirm policy choices before enabling them.**

Obtain decisions for: CIDR request matching and trusted-proxy handling; whether the current admin is exempt from a newly enabled allowlist; lockout duration/reset rules and account identity; which records each retention control permanently deletes; and whether deletion runs continuously or on a daily schedule.

**Step 2: Add the approved behavior to the feature and security docs.**

Document default values, failure behavior (deny vs. allow), recovery procedure, audit events, and how an administrator can turn each control off.

**Step 3: Add tests proving the documented defaults.**

Cover an invalid CIDR, a proxied client IP, an allowlisted request, a rejected request, lockout threshold, expiry/reset, and a retention cleanup boundary.

### Task 2: Implement security settings enforcement

**Files:**
- Create: `server/src/services/settingsPolicy.ts`
- Create: `server/src/middleware/ipAllowlist.ts`
- Create: `server/src/store/loginAttemptStore.ts`
- Modify: `server/src/index.ts`
- Modify: `server/src/routes/auth.ts`
- Modify: `server/src/middleware/requireSession.ts`
- Modify: `server/src/services/settingsSchemas.ts`
- Modify: `server/src/routes/__tests__/authGate.test.ts`
- Modify: `server/src/routes/__tests__/settings.test.ts`

**Step 1: Write failing middleware and auth-route tests for the approved rules.**

Use a saved `security` section, a request IP supplied through the trusted-proxy configuration, and failed sign-ins for one email address. Assert HTTP 403 for an IP policy denial and HTTP 429 (with a safe generic message) during an active lockout.

**Step 2: Implement `settingsPolicy.ts`.**

Read the validated saved security values, normalize an allowlist into parsed CIDR ranges, and expose pure `isIpAllowed()` and `lockoutPolicy()` functions. Do not trust `X-Forwarded-For` unless Express is configured with the approved proxy setting.

**Step 3: Implement durable login-attempt recording.**

Use PostgreSQL when ready and the project data-file fallback otherwise. Record only the minimum identity, failure count, first/last failure, and locked-until timestamp. Clear the record on a successful sign-in.

**Step 4: Wire the middleware and auth failure/success hooks.**

Apply IP policy after health and login callback routes required for recovery are considered, and before protected portal APIs. Apply lockout before credential/token validation and audit each policy lockout without exposing sensitive reasons to an unauthenticated caller.

**Step 5: Run focused tests.**

Run: `npm --prefix server test -- --run src/routes/__tests__/authGate.test.ts src/routes/__tests__/settings.test.ts`

Expected: PASS.

### Task 3: Enforce retention and automation log retention

**Files:**
- Create: `server/src/services/retentionCleanup.ts`
- Modify: `server/src/index.ts`
- Modify: `server/src/services/automationEngine.ts`
- Modify: relevant stores under `server/src/store/`
- Modify: `server/src/services/settingsSchemas.ts`
- Test: `server/src/services/__tests__/retentionCleanup.test.ts`

**Step 1: Inventory each table/file owned by device history, activity/audit history, and automation executions.**

Do not delete current device records or source credentials as a side effect of historical-retention cleanup.

**Step 2: Write failing cutoff tests with a fixed clock.**

Assert a record exactly older than the selected threshold is removed, newer data remains, and non-targeted tables are untouched.

**Step 3: Implement idempotent cleanup per confirmed retention mapping.**

Use parameterized SQL and atomic file writes; record one summary audit event per cleanup run, not an event per deleted row.

**Step 4: Schedule cleanup and report failure safely.**

Run at the agreed daily time on server start and thereafter, without blocking requests. Expose the last run/result to administrators.

**Step 5: Run the focused retention tests.**

Run: `npm --prefix server test -- --run src/services/__tests__/retentionCleanup.test.ts`

Expected: PASS.

### Task 4: Make Danger Zone actions real and auditable

**Files:**
- Modify: `server/src/routes/settings.ts`
- Modify: `server/src/store/appSettings.ts`
- Modify: `server/src/services/session.ts`
- Modify: `src/api/settings.ts`
- Modify: `src/components/settings/SettingsPage.tsx`
- Test: `server/src/routes/__tests__/settings.test.ts`

**Step 1: Write failing API tests for reset, activity purge, and session revocation.**

Require `pages.Settings`, Global Admin role where applicable, and a server-validated confirmation phrase. Assert rejected requests do not mutate data.

**Step 2: Add explicit action endpoints.**

Implement `POST /api/settings/actions/reset`, `POST /api/settings/actions/purge-activity`, and `POST /api/settings/actions/revoke-sessions`. Each returns a count/result and writes an audit record.

**Step 3: Ensure reset preserves bootstrap/recovery configuration.**

Reset portal preferences only; never erase environment credentials, role bootstrap, or the actor’s ability to sign back in without the confirmed policy.

**Step 4: Replace simulated UI waits with API calls and an additional confirmation for purge/revoke.**

Show server-returned counts and failures, refresh settings after reset, and disable buttons only while requests are in flight.

**Step 5: Run focused tests and frontend typecheck.**

Run: `npm --prefix server test -- --run src/routes/__tests__/settings.test.ts && npm run build`

Expected: PASS.

### Task 5: Deliver Data & Privacy export

**Files:**
- Create: `server/src/services/privacyExport.ts`
- Modify: `server/src/routes/settings.ts`
- Modify: `src/api/settings.ts`
- Modify: `src/components/settings/SettingsPage.tsx`
- Test: `server/src/routes/__tests__/settings.test.ts`

**Step 1: Define export contents and redaction rules.**

Export data controlled by the portal (settings, activity/audit records, device snapshots, automation records) while excluding encrypted secrets, access tokens, API keys, and other users’ session tokens.

**Step 2: Write a failing authenticated-download test.**

Assert a ZIP response with a manifest, JSON records, correct content disposition, and no secret fields.

**Step 3: Stream the ZIP from a protected endpoint.**

Use the existing file/database backends and avoid assembling unbounded data in memory; include a generated-at time and schema version in `manifest.json`.

**Step 4: Connect the existing button to download the response.**

Report genuine failure/success and retain the busy state until the browser receives the file.

**Step 5: Run the focused export test.**

Run: `npm --prefix server test -- --run src/routes/__tests__/settings.test.ts`

Expected: PASS.

### Task 6: Make integration catalog state truthful

**Files:**
- Modify: `src/components/settings/SettingsPage.tsx`
- Modify: `docs/07-features/SETTINGS.md`
- Test: `src/components/settings/__tests__/SettingsPage.test.tsx` (create if absent)

**Step 1: Decide whether each catalog entry has a supported server connector.**

Keep Intune, ManageEngine, Slack, Jira, Confluence, and supported connectors wired to existing APIs. Mark Jamf, CrowdStrike, and all unimplemented entries as unavailable—do not provide a Connect control that implies a connection.

**Step 2: Write a failing UI test.**

Assert an unsupported connector has a non-actionable “Coming soon” label and no credentials dialog or saved connection attempt.

**Step 3: Render catalog state from an explicit supported/preview field.**

Add copy explaining that a preview item is not connected and link to a supported alternative only if one exists.

**Step 4: Run frontend tests.**

Run: `npm test -- --run src/components/settings/__tests__/SettingsPage.test.tsx`

Expected: PASS.

### Task 7: Surface existing but unreachable workflows

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/data/dashboardData.ts`
- Modify: `src/components/settings/SettingsPage.tsx`
- Modify: `src/components/notifications/SlackScheduleSection.tsx`
- Create: `src/pages/SecurityFindingsPage.tsx`
- Create: `src/api/securityFindings.ts`
- Modify: `src/lib/permissions.ts`
- Modify: `docs/07-features/SECURITY-POSTURE.md`
- Modify: `src/lib/docsPageIndex.ts`
- Modify: `src/components/docs/FeatureSections.tsx`
- Test: `src/pages/__tests__/securityFindingsPage.test.tsx`

**Step 1: Determine intended entry points.**

Expose Report Builder from Reports & Analytics, Quiet Hours from Notifications, and Findings History as a Security sidebar page. Add capability/page permission entries consistently with existing pages.

**Step 2: Write navigation and rendering tests.**

Assert every new page is listed, is routeable by hash, is permission-gated, and has matching in-app documentation.

**Step 3: Implement the Findings API client and page.**

Call `GET /api/security-posture/findings`; present open/resolved counts, status/pillar filters, accessible loading/empty/error states, and timestamp details without claiming live data it does not have.

**Step 4: Wire Report Builder and Quiet Hours to their intended visible controls.**

Avoid introducing duplicate pages; use an existing Reports action/modal and the Notifications schedule section as the launch locations.

**Step 5: Run targeted tests.**

Run: `npm test -- --run src/pages/__tests__/securityFindingsPage.test.tsx src/lib/__tests__/docsPageIndex.test.ts`

Expected: PASS.

### Task 8: Persist application and patch snapshots

**Files:**
- Create: database migrations in `server/src/db/migrations/`
- Create: `server/src/store/applicationInventoryStore.ts`
- Create: `server/src/store/patchInventoryStore.ts`
- Modify: `server/src/services/sync/` modules handling applications and patches
- Modify: `server/src/routes/sync.ts`
- Modify: relevant read routes in `server/src/routes/`
- Test: `server/src/store/__tests__/applicationInventoryStore.test.ts`
- Test: `server/src/store/__tests__/patchInventoryStore.test.ts`

**Step 1: Write migration and store tests.**

Prove upserts replace a source snapshot atomically, preserve the last successful snapshot after a failed/partial refresh, and scope records by source and collection timestamp.

**Step 2: Add PostgreSQL tables and file fallback.**

Store only needed normalized fields, source identifier, snapshot time, and row identity. Add indexes for device, application/patch identifier, and current snapshot reads.

**Step 3: Change sync jobs to persist only successful usable results.**

If an upstream scope lacks detail, retain old records and write the partial-status note already displayed by sync status.

**Step 4: Serve screens from stored snapshots.**

Ensure on-demand refresh remains explicit and visible; UI reads must not fan out to Endpoint Central for every page load.

**Step 5: Run store, sync, and build checks.**

Run: `npm --prefix server test -- --run src/store/__tests__/applicationInventoryStore.test.ts src/store/__tests__/patchInventoryStore.test.ts src/services/__tests__/patchFetch.test.ts && npm run build`

Expected: PASS.

### Task 9: Tenant verification and mirror lint disposition

**Files:**
- Modify: `docs/15-known-gaps-and-verification-checklist.md`
- Modify: `docs/04-integrations/` relevant Endpoint Central setup guide

**Step 1: Add live-tenant test scripts.**

Document how to verify macOS MDM detail after the six-hour cache window: record a known device, let/force the cache expiry, retrieve it again, and compare critical MDM fields with Endpoint Central.

**Step 2: Add Patch Management scope verification.**

Attempt read, scan, and deploy against a non-production test device; record the precise OAuth scope name/error returned by the tenant and update `server/.env.example` and integration documentation.

**Step 3: Keep mirror lint debt isolated.**

Run the repository lint, record the two `apps/mac-package-builder` mirrored-source errors verbatim, and avoid changing the mirror unless the source project is in scope.

### Task 10: Full validation and documentation index

**Files:**
- Modify: `docs/README.md`
- Modify: `docs/07-features/README.md`

**Step 1: Run all relevant server and client tests.**

Run: `npm run build && npm run lint`

Expected: build succeeds; document only the known external mirror lint errors if they remain.

**Step 2: Verify migrations against an empty local PostgreSQL database and the file fallback.**

Confirm that no deployment requires a database when `DATABASE_URL` is absent.

**Step 3: Update the known-gaps checklist.**

Mark completed work with test evidence; leave only the two live-tenant checks and mirror-source lint issue open.
