# 15 — Known Gaps and Verification Checklist

> Everything here could **not** be confirmed from the repository. Each item says what to check and who can check it. Tick the box and record the date/evidence (never paste secrets). Related: [10 risks](10-risks-limitations-technical-debt.md), [13 permissions](13-api-permission-matrix.md).

## 1. Findings from reading the code (confirmed, action needed)

| # | Finding | Evidence | Action |
|---|---|---|---|
| F-1 | Many routes have no capability check beyond a valid session ([06 §6](06-authentication-rbac-security.md)) | `server/src/routes/*.ts` (guards listed in [04 §3](04-modules-and-code-logic.md)) | Add guards + tests |
| F-2 | `securityPolicies` router is not mounted; its client and page are unused | `server/src/index.ts`, `src/pages/SecurityPoliciesPage.tsx` | Mount+test or remove |
| F-3 | Documented zip command drops `.env.example` | Tested with `zip` ([08 §3.2](08-deployment-and-operations.md)) | Fix SOP |
| F-4 | `integration-credentials.json` stores credentials as plain JSON | `store/integrationStore.ts` | Prefer env vars; restrict ACL |
| F-5 | PostgreSQL TLS certificate not validated in production | `db/index.ts` | Provide CA, validate |
| F-6 | No CI, no dependency scanning, no e2e tests, no monitoring config in the repo | repository listing | Add (see [08 §9](08-deployment-and-operations.md)) |
| F-7 | `PROFILE_USER_UPN`, `INTUNE_AUDIT_DEFAULT_TIMEZONE` in `.env.example` are never read | source search | Remove or implement |
| F-8 | Kandji is not referenced anywhere in the code | source search | If Kandji is expected, it is a new integration ([12 §2](12-change-management.md)) |
| F-9 | Coolify / Docker files are absent although mentioned in the documentation brief | repository listing | Confirm the real hosting platform |

## 2. Verification checklist (needs a live environment or an owner's answer)

### Identity and access (owner: Entra admin / Security)

- [ ] Web redirect URI(s) registered on the app registration equal `AUTH_REDIRECT_URI` for each environment.
- [ ] Users and groups assigned to the enterprise application (if "assignment required").
- [ ] Every application permission in [13 §1.2](13-api-permission-matrix.md) is **Granted** (screenshot, date).
- [ ] `GroupMember.Read.All` consented; groups "ITO EndPoint Portal"/"Desktop Support" (or the configured names/IDs) exist and contain the right people.
- [ ] Client secret expiry date recorded; renewal owner named.
- [ ] Production has `AUTH_PASSWORDLESS`, `AUTH_PASSWORD` unset and `AUTH_ENFORCED` not `false`.
- [ ] `AUTH_ALLOWED_EMAILS` reviewed (each entry is a Global Admin).
- [ ] Which permission allows `syncDevice` (`managedDevices/{id}/syncDevice`) and whether it is granted.

### ManageEngine / Zoho (owner: Endpoint admin)

- [ ] Data centre of the tenant and whether `accounts.zoho.com` is correct.
- [ ] Refresh token scopes include MDM inventory, Patch Management READ and Inventory READ.
- [ ] The scope/permission for patch **scan and install**; test `POST /api/endpoint-central/remediation/*` against a non-production device.
- [ ] Expected Endpoint Central API limits for the fleet size; tune `MANAGEENGINE_FETCH_CONCURRENCY`.

### Slack and other integrations (owner: workspace admins)

- [ ] Slack app scopes actually granted (`chat:write`, `files:write`, others) and bot is in each target channel.
- [ ] Any consumer of `SLACK_SIGNING_SECRET` (none found).
- [ ] Jira project key/permissions; Confluence spaces searched.
- [ ] Privacy/Security approval for sending device/user context to Google Gemini and OpenAI.

### Behaviour under load (owner: Developer + Endpoint admin)

- [ ] A full Application Security sync completes against production after the throttling changes; record duration and whether the amber 429 banner still appears.
- [ ] Device list refresh time with both sources; cache/warm-start behaviour after a service restart.
- [ ] Notification and report schedules fire at the correct time across the timezone in use.

### Deployment and operations (owner: Infrastructure)

- [ ] How DeployHub receives and installs the zip; where the previous release is kept for rollback.
- [ ] Production Node.js version and the account the service runs as; NTFS ACLs on `DATA_DIR` and `server\.env`.
- [ ] Backup schedule and last successful restore test for `DATA_DIR` (and the database, if used).
- [ ] External monitoring/alerting of `/health` and the service logs.
- [ ] Existence of dev/test/staging environments and their URLs.
- [ ] Whether PostgreSQL is used in production; if yes, version, TLS, backup, and whether `uuid-ossp` exists.

### Data and code (owner: Developer)

- [ ] Intune → `Device` field mapping table (read `services/intune.ts`) added to [05](05-api-integrations.md).
- [ ] Security Posture pillar formulas, Risk Scoring rule weights, and Copilot tool list documented in [04](04-modules-and-code-logic.md) (only headers were read).
- [ ] Whether `POST /api/integrations/:id/credentials` persists or only validates, and who may call it.
- [ ] Retention for `notifications.json`, `patch-remediation-actions.json`, `fleet-snapshots.json`, `mac-admin-access.json`.
- [ ] Whether `schema.sql` creates the `uuid-ossp` extension; which tables the running app actually writes (`tenants`, `audit_logs`, `device_risk_scores`).
- [ ] Node `engines` requirement (add to `package.json`).
- [ ] Whether the SharePoint role-activity puller returns data in the live tenant.
- [ ] `dangerouslySetInnerHTML` / XSS review of the client.

## 3. Documentation coverage summary

| Area | Verified (read in code/config/run) | Inferred | Still needs confirmation |
|---|---|---|---|
| Stack and versions | Declared versions in both `package.json` files; scripts; Vite proxy; test configs | Rationale for technology choices | Required Node version; actual installed versions in production |
| Repository structure | Folder listing; router mounting; page switch; file responsibilities | Misnamed-file intent | Purpose of root `.env` beyond `VITE_*` |
| Architecture and flows | Middleware order, auth callback, caching/fallback, schedulers and intervals | Single-instance consequence | Production topology beyond IIS + service |
| Modules | All routes and their guards; trigger/action lists; automation, stale devices, app intelligence, patch flow (header comments + routes) | Dashboard card formulas | Internals of Security Posture, Risk Scoring, Copilot tools, large device pages |
| Integrations | Hosts, paths, auth modes, retry/pagination code, Zoho host, scopes named in code | Slack write scopes | Granted permissions/consent, API response shapes, live throttling behaviour |
| Auth/RBAC/security | Login flow, role resolution, token lifetime, storage, route guards, absent hardening | Threat consequences | Entra registration state, enterprise-app assignment |
| Setup and onboarding | Commands and scripts exist; suites run (client 157, server 656 passed / 7 skipped) | Linux support | Minimum Node version |
| Deployment/operations | `web.config`, `install-service.ps1`, zip SOP (tested), absence of Docker/Coolify/CI | Rollback procedure | DeployHub process, monitoring, backups, other environments |
| Database/data | Schema (23 tables, FKs), dual-backend design, `DATA_DIR` files and resolution | Data classification | Retention, which tables are written, extension setup |
| Risks/runbooks/change mgmt | Derived from verified facts above | Likelihood/impact ratings | Owner names and contacts |

Older documents in `docs/01-overview` … `docs/08-design`, `ROLES.md` and `HANDOVER-MANUAL.md` were **not re-verified** for this set; where they disagree with this set, the code is authoritative and this set reflects the code as read.

## Findings from the feature-documentation pass (2026-11-19)

Found while documenting every page from the code. Each is real behaviour at the time of writing; none has been changed except where noted. Fix or accept each, then tick it off.

- [x] **Reports & Analytics paging and sorting are cached.** `runReport()` in `server/src/reporting/engine.ts` caches one result per report id for 180–600 s and checks the cache before sort and offset, so page 2 or a new sort returns the same rows (`cached: true`). The Refresh button does not call `/invalidate`. **Fixed 2026-11-20: the cache is keyed by report id plus parameters, and Refresh invalidates first.**
- [x] **Policy Conflicts never emits `high` severity or `version_drift`.** Both exist in the types, so the High KPI is always 0 and there is no Scope Conflict filter chip. **Fixed 2026-11-20: same-platform duplicates are high; same-platform profile copies at different versions emit version_drift; the page has Scope Conflict and Version Drift chips.**
- [x] **Risk Scoring "Top N" is not the N riskiest devices.** `batchComputeRiskScores` scores the first N devices Graph returns, then sorts. Fleets larger than the limit are partly scored (Ocean's `get_risk_scores` behaves the same). The risk-scores cache is keyed by limit only, so the first call's AI setting applies for 5 minutes. **Fixed 2026-11-20: the whole fleet is ranked with the rule-based score, only the top N get AI text, headline counts are fleet-wide, and the cache key includes the AI flag.**
- [x] **Several read APIs have no server-side capability check**: `/api/intelligence/*` (Policy Conflicts, Risk Scoring), `/api/reports`, `/api/scheduled-reports`, `/api/integrations`, `/api/endpoint-central/operations` and missing-patches, `/api/patch/*`, `/api/integrations/manageengine/apps`. Access relies on the page permission in the UI plus the session. **Mostly fixed 2026-11-20 (see doc 06 section 6 for what is gated and what stays open to every signed-in role).**
- [x] **Role editor labels:** `securityPolicies.read` and `securityPolicies.sync` are labelled "Policy Conflicts" but only gate the separate Security Policies snapshot API (which is not mounted in `server/src/index.ts` in this tree). **Fixed 2026-11-20: the labels now say they belong to the Security Policies snapshots.**
- [x] **Role Activity Audit uses a hard-coded role map** (`requireAuditRole('Audit Reader')`), so a custom role with the page permission probably gets 403. Ocean's `get_role_activity` tool calls the live function directly and skips that route check (same built-in roles can use both). **Fixed 2026-11-20: gated by the pages.Role Activity Audit permission, so custom roles work.**
- [x] **Scheduled Reports:** `critical-patching`, `stale-devices`, `windows-updates` and `app-updates` always produce `.xlsx` regardless of the Format choice. The notification-schedule UI still says it requires PostgreSQL although a JSON-file fallback exists. The form pre-fills a default recipient and Slack channel; check them before saving. **Fixed 2026-11-20: Excel-only types show a fixed Excel format and are stored and delivered as Excel; the stale PostgreSQL message is replaced. The pre-filled default recipient and channel still need checking before saving.**
- [x] **Settings:** Fixed 2026-11-20: Jira and Confluence credentials can be pushed; General, Compliance, Automation, Security, Notifications and Data & Privacy now **save to the server** (validated, audit-logged, reloaded on open). **Still open:** the portal does not yet enforce those saved values (only Auto sign-out and the Data Sync schedules take effect), the Danger Zone actions and the Data & Privacy export buttons are not connected, and QuietHoursModal.tsx and ReportBuilderPage.tsx are still unused.
- [ ] **Patch Operations:** the full OAuth scope name for scan and deploy (`PatchMgmt.UPDATE`) is not verified; confirm in the Zoho API console. Whether remediation requests also reach the app-wide audit log is unconfirmed (they are stored in `patch-remediation-actions.json`).
- [ ] **Security Posture:** agent-only machines are counted in diagnostics but not scored; coverage history is recorded only when someone opens the page. Verify live that Mac MDM detail reads stay at "0 unreadable" after the 6-hour cache expiry.
- [x] **Ocean search:** the question "Can Ocean read the source code?" still ranks `04-modules-and-code-logic.md` above the Ocean capability section. Questions about "what Ocean can read" work; tune wording or add a synonym if this phrasing matters. **Fixed 2026-11-20: a synonym rule restores the Ocean subject for capability questions, and Ocean also re-indexes the docs on every start.**

## Database-first sync (added 2026-11-20)

- [x] Sync tests run on PGlite (real PostgreSQL in-process) since 2026-11-20: migrations, upsert, locking, retirement, stale history all pass on both file and PostgreSQL storage.
- [ ] Verify against a real PostgreSQL: migrate, first sync, second sync (no rewrites), kill the API (warning shows, data kept), restart.
- [x] Application inventory and patch data now have scheduled refresh, status and schedules; security findings history is stored; the Users page is derived from stored devices (2026-11-20). **Still open:** moving application and patch data into database tables (they stay in their own caches), and a screen for the findings history. See [17](17-database-sync-architecture.md).
- [ ] Connect a real PostgreSQL through Settings -> Integrations -> PostgreSQL, restart, confirm Data Sync shows "PostgreSQL" and the device records carried over from the file store.
- [ ] Existing modules with their own file fallbacks (scheduled reports, roles) do not move their data automatically when PostgreSQL is connected; only the device sync store does. Plan that migration separately.
