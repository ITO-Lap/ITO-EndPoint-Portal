# 12 — Change-Management Guide

> Recipes below name the exact files found in the repository ([03](03-repository-structure.md)). Every recipe ends with tests and a restart-persistence check where data is stored. Related: [07 onboarding](07-installation-and-developer-onboarding.md), [06 RBAC](06-authentication-rbac-security.md), [09 data](09-database-and-data-handling.md), [13 permissions](13-api-permission-matrix.md).

## 1. Add a new module (page)

1. **Component**: create `src/pages/<Name>Page.tsx` (or `src/components/<area>/…`). Fetch data through a typed client in `src/api/`.
2. **Sidebar item**: add an entry to `src/data/dashboardData.ts` (`id`, `title`, `icon`, `group`). The `title` is the **RBAC page key**; choose it carefully — renaming later breaks saved role permissions.
3. **Routing**: add a branch in the `activePage` switch in `src/App.tsx`.
4. **Page access keys (both lists must match)**: add the title to `KNOWN_PAGES` in `src/lib/permissions.ts` **and** `PAGE_TITLES` in `server/src/services/rolePermissions.ts`. Decide the defaults for IT Admin (`IT_ADMIN_PAGES`) and Helpdesk (`HELPDESK_EXCLUDED_PAGES`). Global Admin gets it automatically.
5. **API**: create `server/src/routes/<name>.ts`, mount it in `server/src/index.ts` (`app.use('/api/<name>', apiLimiter, router)`). Remember an unmounted router is silently dead (see `securityPolicies.ts`).
6. **Authorization**: guard every route with `requireCapability('<key>')`. Add new capability keys to `PERMISSION_GROUPS` in `rolePermissions.ts` and to the built-in defaults.
7. **Persistence** (if any): `dataFile('<name>.json')` from `store/dataDir.ts`, or a dual-backend store; never write inside the deploy folder.
8. **Tests**: route test (auth + validation), service test, component test.
9. **Docs**: add the module to [04](04-modules-and-code-logic.md) and the route to its index.

## 2. Add a new API integration

1. Add config reading to `server/src/store/integrationStore.ts` (env names), and to `server/.env.example` with a comment (no values) and to [14](14-environment-variable-reference.md).
2. Write a client in `server/src/services/<provider>.ts`: base URL, auth/token cache, timeout (use `AbortSignal.timeout`), retries for 429/5xx honouring `Retry-After`, sanitised errors. For Microsoft Graph reuse `graphGetAllV` / `graphGetAllResumable` in `services/graphApi.ts`.
3. Normalise responses into the existing models (`Device`, etc.); keep missing values `null`/"not reported".
4. Add a **last-good fallback** for list data (see `store/deviceSnapshotStore.ts`) so an outage never blanks a page.
5. Add status reporting (integration status and, if useful, a health monitor like `slackHealth.ts`).
6. Record permissions in [13](13-api-permission-matrix.md) and the endpoints in [05](05-api-integrations.md); grant least privilege, read-only first.
7. Tests with mocked `fetch` (see `services/__tests__/graphApiRetry.test.ts`).

## 3. Add a dashboard card

1. Compute the value in a service/endpoint (or `src/hooks/useStats.ts`); return `null` when the source did not report.
2. Add a `StatCard` (or similar) in `src/components/dashboard/` and place it in `DashboardContent.tsx`.
3. Make unavailable data visible ("Not reported"), not zero.
4. If clicking should filter a page, pass the page title as the navigation target (`ActionCenter.tsx` pattern; must be a valid page key).
5. Add a component test.

## 4. Add a new user role or access level

**No code change** is needed for a custom role: Settings → Roles & Permissions (needs `roles.manage`) creates a role from page and capability keys and assigns users by e-mail (stored in `rbac.json` or PostgreSQL).

Code changes are needed only for:

| Need | Change |
|---|---|
| A new capability | Add a key to `PERMISSION_GROUPS` (`rolePermissions.ts`), set built-in defaults in `BUILTIN_ROLE_DEFAULTS`, enforce with `requireCapability('<key>')` on the route(s), expose it in the UI matrix (the matrix reads keys from `/api/roles/permission-keys`) |
| A new built-in role | Extend `BUILTIN_ROLE_NAMES`, defaults, `roleResolution.ts`, and the sign-in group mapping in `routes/auth.ts`; update `docs/ROLES.md` and [06](06-authentication-rbac-security.md) |
| A new Entra group mapping | Environment only: `AUTH_*_GROUP_ID` |

Always add route tests asserting both the allowed role and a denied role, and review the matrix with Security.

## 5. Add a scheduled Slack notification

Two mechanisms exist:

**A. A new scheduled report** (simplest): add a report type in `store/scheduledReportsStore.ts` (`ReportType`), implement its generator in `services/scheduledReportRunner.ts` (follow `fleetDigest.ts` / `staleDevicesReport.ts`: build data → Excel → `uploadSlackFile` with a Block Kit summary), expose it in `ScheduledReportsPage.tsx`. Users then create schedules (cron + timezone + channel ID) in the UI.

**B. A generic notification module**: call `registerNotificationHandler('<module>', handler)` (see how `index.ts` registers `scheduled_report`) so rows in `notification_schedules` for that module are dispatched by `services/notificationScheduler.ts`; show/edit it with `components/notifications/SlackScheduleSection.tsx` (edits need `notificationSchedules.edit`).

Checklist: bot is in the channel; channel **ID** used; timezone tested across a DST boundary; failure is recorded in run history; no secret data in the message; the data-quality notes are included.

## 6. Add a database field or table (migration procedure)

There is **no migration tool**; treat schema changes as manual, reviewed SQL.

1. Decide whether PostgreSQL is needed at all; most features here use `DATA_DIR` files. For file stores, add the field as **optional** and default it on read so old files keep working.
2. For PostgreSQL: add an idempotent statement to `server/src/db/schema.sql` (`CREATE TABLE IF NOT EXISTS`, `ALTER TABLE … ADD COLUMN IF NOT EXISTS …` with a default). Keep changes additive (no drops/renames in the same release).
3. Write the **rollback SQL** next to the change in the pull request.
4. Back up first (`pg_dump`), apply to a copy, then production in a maintenance window: `psql "$DATABASE_URL" -f <change>.sql`.
5. Update the store code (`store/*.ts`) for **both** backends if dual-backend.
6. Update [09](09-database-and-data-handling.md) (table list) and add store tests.
7. Remember: switching a dual-backend store between file and PostgreSQL does not migrate data.

## 7. Engineering standards

### Coding standards (observed)

- TypeScript everywhere. Server `tsconfig` is strict with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` — pass optional props with conditional spreads (`{...(x ? { x } : {})}`) rather than `undefined`. Client `tsconfig.app.json` enables `noUnusedLocals`/`noUnusedParameters`.
- Validate request bodies with `zod`; return `{ success, data | error }`.
- Wrap async route handlers in `asyncHandler`.
- Never log secrets, tokens or full upstream bodies. Redact before logging.
- Unknown/unavailable data is represented explicitly ("not reported", `null`, "Data unavailable") — never invented or shown as a passing value.
- Comments explain **why** (constraints, API quirks), as in the existing services; keep file header comments current.
- Persisted data uses `dataFile()`, atomic writes, and a `.bak` fallback.

### Naming

Files: `camelCase.ts` for services/stores/routes, `PascalCase.tsx` for components/pages. Permission keys: `<area>.<action>` (`staleDevices.export`) and `pages.<Sidebar Title>`. Environment variables: `UPPER_SNAKE`, vendor-prefixed (`INTUNE_`, `MANAGEENGINE_`, `SLACK_`).

### Branching and commits

Create short-lived branches from `main`. Recent history uses Conventional-Commit-style prefixes (`feat:`, `fix:`, `chore:`) with an imperative summary. One logical change per commit; do not mix unrelated work (for example a role change and a report change).

### Pull request checklist

- [ ] Branch is up to date with `main`; scope is one change.
- [ ] Server and client tests pass; both type-checks and `npm run lint` are no worse than `main`.
- [ ] New routes have authorization (`requireCapability`) and zod validation, with tests for allowed **and** denied roles.
- [ ] No secrets, tokens or real device/user data in code, tests, fixtures or screenshots.
- [ ] Source-unavailable behaviour tested (last-good/“not reported”).
- [ ] Persisted data survives a restart; uses `DATA_DIR`.
- [ ] New env vars added to `.env.example` and [14](14-environment-variable-reference.md); permissions added to [13](13-api-permission-matrix.md).
- [ ] Docs updated ([04](04-modules-and-code-logic.md), [05](05-api-integrations.md), [10](10-risks-limitations-technical-debt.md) if a risk changed).
- [ ] Reviewer from `.github/CODEOWNERS` approved.

### Review focus

Authorization on every route, data shown as fact vs. "not reported", error/timeout behaviour, rate limits on upstream APIs, PII in logs/exports, backwards compatibility of stored files.

### Release checklist

- [ ] `main` green (tests, build).
- [ ] Release notes list env/permission/schema changes.
- [ ] Backup of `DATA_DIR` (and database) taken.
- [ ] Package (zip SOP, [08 §3.2](08-deployment-and-operations.md)), verify the zip has no `.env`.
- [ ] Deploy, restart the service, run the smoke test ([08 §5](08-deployment-and-operations.md)).
- [ ] Record commit/version deployed and the rollback artifact location.
- [ ] Watch logs and Slack health for 24 h.
