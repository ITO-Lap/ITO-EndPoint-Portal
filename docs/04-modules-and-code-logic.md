# 04 — Modules and Code Logic

> Labels: **Verified** (read in code), **Inferred**, **Not verified**. For each module the "Depth" line says how much of the logic was read for this document. Cross-references: [02 — Architecture](02-architecture.md), [03 — Repository](03-repository-structure.md), [05 — Integrations](05-api-integrations.md), [06 — Auth & RBAC](06-authentication-rbac-security.md).
> Older per-feature write-ups exist in [`docs/07-features/`](07-features/README.md); treat them as supplementary (last updated before several recent changes).

## 1. Shared building blocks

| Block | Behaviour | Code |
|---|---|---|
| `Device` model | Unified record: id, name, user, serial, platform, OS version, source (`Microsoft Intune` / `ManageEngine`), last check-in, compliance state, encryption status, primary issue, severity, plus optional hardware/network/enrolment fields | `server/src/types.ts` |
| Device fetch | Parallel fetch of both sources, 30 s timeout each, 5-min cache, last-good fallback, `failedSources` / `staleSources` flags | `server/src/routes/devices.ts` (`fetchAllDevices`) |
| Data-quality checks | Source completeness, freshness, reconciliation with Graph counts, patch data availability; attached to reports/digest | `services/dataQuality.ts`, `fleetDataQuality.ts` |
| Report export | Excel (exceljs), CSV, PDF (pdfkit), PPTX (pptxgenjs); common overview block and "Report info" metadata | `services/reportExporter.ts`, `reportOverview.ts` |
| Slack delivery | Block Kit message with the report attached through Slack's external-upload flow | `services/slack.ts` |
| Persistence | `DATA_DIR` JSON files (atomic write + `.bak`) or PostgreSQL | [09](09-database-and-data-handling.md) |

---

## 2. Module catalogue

### 2.1 Dashboard

| Item | Detail |
|---|---|
| Purpose / workflow | Landing page after sign-in (always opens on Dashboard). Shows KPI cards (devices, compliance, non-compliant, stale, patch status), compliance donut, issue categories, action centre, operational queue, patch priority, application-updates panel, security watch row and quick Slack schedules |
| UI | `src/components/dashboard/*` (`DashboardContent`, `StatCard`, `ComplianceDonut`, `ActionCenter`, `OperationalQueueTable`, `PatchPriorityPanel`, `ApplicationUpdatesPanel`, `QuickSlackSchedules`, …), `src/hooks/useStats.ts` |
| API | `GET /api/devices`, `GET /api/devices/stats`, `GET /api/dashboard/operational-queue`, `GET /api/patch/systems`, `GET /api/patch/priority-summary`, `GET /api/app-intel/*`, `GET /api/notification-schedules` |
| Logic | Cards derive from the merged device list. Missing patch data is shown as unavailable, not as zero (*Verified for the digest; dashboard card behaviour* **Inferred**) |
| Errors | Offline banner with retry (`OfflineBanner` in `App.tsx`); per-card loading states |
| Dependencies | Intune, ManageEngine, Patch Manager, App Intelligence |
| Modify safely | Add a card in `components/dashboard/`, feed it from `useStats` or a new endpoint; keep card values `null` when the source did not report |
| Gaps / risks | Card definitions are spread across components; no single card registry (*Inferred*) |
| Depth | Structure verified; individual card formulas not all read |

### 2.2 Managed Devices (Windows and Mac inventory)

| Item | Detail |
|---|---|
| Purpose | Browse devices by platform, open a device panel (hardware, network, security, compliance, apps, profiles), look up a device |
| UI | `pages/ManagedDevicesPage.tsx` (62 lines, delegates), `pages/IntuneDevicesPage.tsx` (~1,800 lines), `pages/MacDevicesPage.tsx` (~1,800 lines), `components/devices/*` |
| API | `GET /api/devices`, `/api/devices/:id`, `/:id/apps`, `/:id/policies`, `/:id/profile-results`, `/manageengine/profile-results`; `/api/integrations/intune/*` |
| Logic | Filtering/sorting/pagination client-side over the merged list; ManageEngine detail/app/profile calls are per device and cached |
| Errors | Source failure → partial list with a stale/failed-source notice |
| Dependencies | `services/intune.ts`, `services/manageEngine.ts` |
| Modify safely | The two page files are very large; extract before adding features. Keep `Device` field additions optional |
| Gaps | Large files, hard to review (technical debt, see [10](10-risks-limitations-technical-debt.md)) |
| Depth | Routes and files verified; page internals not read line by line |

### 2.3 Stale Devices

| Item | Detail |
|---|---|
| Purpose | List devices that have not checked in for 30+ days (`STALE_DAYS = 30`); export; weekly retire/re-enrol report |
| UI | `pages/StaleDevicesPage.tsx`, `api/staleDevices.ts` |
| API | `GET /api/stale-devices/status`, `POST /sync`, `GET /devices`, `GET /devices/detail`, `GET /export` (needs `staleDevices.export`); whole router needs `staleDevices.read` |
| Logic | Background sync of Intune (Windows) and Endpoint Central MDM (Windows + macOS) into a normalised in-scope snapshot, cached in memory and on disk. **Page loads never call the sources** (comment in `services/staleDevices/service.ts`) |
| Report | Excel with overview (bands 30–59, 60–89, 90+ days), data-quality notes; Slack upload |
| Errors | Last snapshot served while a sync fails |
| Dependencies | Intune, ManageEngine |
| Modify safely | Change thresholds in `services/staleDevicesReport.ts` (`STALE_DAYS`); the digest imports the same constant |
| Depth | Header comments, routes and report builder read |

### 2.4 Application Security & Compliance (App Intelligence)

Sidebar title is still **"ManageEngine App Inventory"** (the RBAC page key), page heading is "Application Security & Compliance".

| Item | Detail |
|---|---|
| Purpose | One table for Windows and macOS applications: installed vs latest verified version, device counts, status, CVEs, packaging need |
| UI | `pages/ManageEngineAppInventoryPage.tsx` (wrapper) → `pages/AppIntelligencePage.tsx`; `components/appIntel/` (`AppDetailDrawer`, `RequestDialog`, badges) |
| API | `GET /api/app-intel/status`, `POST /sync`, `GET /summary`, `GET /apps`, `GET /apps/detail`, `GET /export` (csv/xlsx), `POST /report/slack`, `GET /requests/preview`, `POST /requests`. Router-wide guard `appIntel.read`; `report/slack` and `requests` need `appIntel.write` |
| Logic | `providers.ts` reads Intune `detectedApps`, `mobileApps` (+ assignments, group names) and ManageEngine / Endpoint Central inventory → `normalize.ts` → `installSource.ts` (custom / self-service / manual) → `latestVersion.ts` (winget, Homebrew) → `version.ts` (semantic comparison; unparseable = Review) → `cve.ts` (NVD, 24 h cache) → `decision.ts` (status such as *Update available*, *Package required*, *Repackage required*, *Update available — existing package*, *Native update*, *Review required*, *Data unavailable*) → `query.ts` (filter/sort/summary) |
| Throttling | `detectedApps` is read in 500-row pages with 400 ms spacing, 6 retries per page, up to 3 cool-down rounds (1/2/3 min), resuming from the failed page; a successful read is saved to `DATA_DIR/cache/intune-detected-apps.v1.json` and served if a later read fails |
| Export | `exportReport.ts`: CSV (BOM, formula-injection protection), XLSX with "Report info" sheet; same filters as the screen |
| Errors | Amber banner lists sources that could not be read; affected rows are marked Review required / Data unavailable; nothing falls back to sample data |
| Dependencies | Graph (`DeviceManagementManagedDevices.Read.All`, `DeviceManagementApps.Read.All`, `Group.Read.All`), ManageEngine, Endpoint Central (`DesktopCentralCloud.Inventory.READ`), Jira (packaging requests), Slack, NVD, GitHub, Homebrew |
| Modify safely | Add a status in `types.ts` + `decision.ts` + `query.ts` ordering + the UI tile; add tests in `services/appIntel/__tests__/` |
| Gaps | No deployment action; no persisted installation history; user-level drill-down not built; the sidebar rename is pending |
| Depth | Engine files read earlier in this project's history; decision rules not re-read for this document |

### 2.5 App Guardian

| Item | Detail |
|---|---|
| Purpose | Mac application inventory and fleet version visibility (inventory only, not vendor update availability) |
| UI | `pages/AppGuardianPage.tsx` (own sidebar entry, standalone) |
| API | `GET /api/integrations/manageengine/apps` and related |
| Logic | Classification of apps as Apple system / managed / manual / review via `services/macAppClassification.ts` |
| Gaps | Planned to be developed independently; currently overlaps the macOS view of Application Security & Compliance |
| Depth | Page structure only |

### 2.6 Mac Fleet Reports and Mac admin access

| Item | Detail |
|---|---|
| Purpose | Mac KPIs (compliance score, OS versions, missing app updates, local-admin exposure) |
| UI | `pages/MacFleetReportsPage.tsx`, `lib/kpiConfig.ts`, `lib/macPostureScore.ts` |
| API | `POST /api/mac-admin-access/report` (shared-secret `x-report-key`, **outside** the session gate), `GET /api/mac-admin-access` (session) |
| Logic | A script deployed through Endpoint Central posts local-admin status per Mac; the latest report per serial is stored on disk; Macs that never reported are absent, nothing is inferred (`services/macAdminAccess.ts`) |
| Docs | [`07-features/MAC-ADMIN-ACCESS.md`](07-features/MAC-ADMIN-ACCESS.md), [`Mac-Fleet-Reports-Design-Guide.md`](Mac-Fleet-Reports-Design-Guide.md) |
| Depth | Header comments and route auth read; KPI formulas not re-read |

### 2.7 Patch Operations

| Item | Detail |
|---|---|
| Purpose | Systems missing patches, critical-patch devices, scan and install through Endpoint Central with a confirm step |
| UI | `pages/PatchOperationsPage.tsx`, `components/reports/MissingPatchDrawer.tsx` |
| API | `GET /api/patch/systems`, `/priority-summary`; `GET /api/endpoint-central/operations`, `/devices/:resourceId/missing-patches`; `POST /remediation/preview`, `POST /remediation/:id/confirm` (both `patchOps.scanRemediate`) |
| Logic | Patch Manager `GET /api/1.4/patch/allsystems` (paged); preview creates an action, the **same administrator** must confirm it (HTTP 403 otherwise); confirmed actions call `/api/1.4/patch/computers/scan` or `/api/1.4/patch/installpatch` and are recorded in `patchRemediationStore` |
| Errors | MDM-only Macs have no patch data → "not reported" |
| Dependencies | Endpoint Central OAuth client with `DesktopCentralCloud.PatchMgmt.READ` (read). The scope needed for scan/install is **Not verified** (code only references the READ scope) |
| Modify safely | Keep the preview→confirm pair; never call install from a preview |
| Depth | Header comments, routes, call paths read |

### 2.8 Security Posture

| Item | Detail |
|---|---|
| Purpose | Posture "pillars" computed from the device inventory and Patch Manager; devices that did not report a signal are counted as *not reported*, never pass/fail |
| UI | `pages/SecurityPosturePage.tsx`, `lib/securityPosture.ts`, `components/security/EndpointProtectionCoverage.tsx` |
| API | `GET /api/security-posture`, `/pillars/:id/devices`; `GET /api/security-inventory/coverage`, `POST /scan`, `GET /missing` |
| Logic | `services/securityPosture.ts`; coverage scanning via `security-agents/` collectors; warm-up job at start |
| Depth | Header comments only; pillar formulas **not verified** here |

### 2.9 Policy Conflicts and Risk Scoring

| Item | Detail |
|---|---|
| Policy Conflicts | Detects duplicate, stale and scope-conflicting compliance/configuration policies without Graph write permissions. UI `pages/PolicyConflictPage.tsx`; API `GET /api/intelligence/policies`; logic `services/policyConflict.ts` |
| Risk Scoring | Rule-based device risk scores; when `OPENAI_API_KEY` is set GPT-4o-mini adds narrative and remediation steps. UI `pages/RiskScoringPage.tsx`; API `GET /api/intelligence/risk-scores`, `POST /summary`, `/explain`, `/export`; logic `services/riskScoring.ts` |
| Gaps | Risk narrative depends on an external AI provider; data leaves the tenant when configured (see [10](10-risks-limitations-technical-debt.md)) |
| Depth | Header comments and route lists only |

### 2.10 Entra Intelligence

| Item | Detail |
|---|---|
| Purpose | Entra overview, users, groups (search/report/export), security signals, Mac OS version check, duplicate Entra device objects, device sync/diagnose actions |
| UI | `components/entra/EntraIntelligenceDashboard.tsx` |
| API | `GET /api/entra/overview`, `/status`, `/devices`, `/mac-version-check`, `/users`, `/groups`, `/groups/search`, `/groups/report`, `/groups/report/export`, `/security`, `/duplicate-devices`, `/duplicate-devices/export`; `POST /devices/:id/sync`, `/devices/:id/diagnose` |
| Logic | Duplicate detection links objects by shared Device ID (High), shared serial via Intune (High), same name + OS family (Medium) — `services/entraDuplicateDevices.ts` |
| Permissions | `AuditLog.Read.All`, `Directory.Read.All`, `IdentityRiskyUser.Read.All`, `Reports.Read.All`, `Device.Read.All` (see [13](13-api-permission-matrix.md)) |
| Gaps | `POST /devices/:id/sync` and `/diagnose` have **no capability check** beyond a valid session; whether they perform writes upstream is *Not verified* |
| Depth | Routes and one service header read |

### 2.11 Role Activity Audit

| Item | Detail |
|---|---|
| Purpose | Live browse of admin role / RBAC / permission-change activity from Entra directory audits, Intune audit events and SharePoint (O365 Management Activity API) |
| UI | `pages/RoleActivityAuditPage.tsx`, `components/role-activity/*`, `api/roleActivity.ts` |
| API | `GET /api/role-activity/filter-options`, `/events` (`requireAuditRole('Audit Reader')`) |
| Logic | Three puller services queried in parallel per request; range capped by `ROLE_ACTIVITY_LIVE_BROWSE_MAX_DAYS`; **nothing is persisted**; export is client-side |
| Caveat | The SharePoint puller is marked "UNVALIDATED against a live tenant" in `.env.example`. *Not verified* |

### 2.12 Automation

| Item | Detail |
|---|---|
| Purpose | Rules that match devices by trigger + conditions and fire actions |
| UI | `components/automation/AutomationPage.tsx`, `hooks/useAutomations.ts` |
| API | `GET/POST /api/automations`, `/stats`, `/executions`, `/:id` (GET/PUT/DELETE), `PATCH /:id/toggle`, `POST /:id/test`, `POST /scan`, `POST /ai-build` |
| Triggers | `device_non_compliant`, `compliance_threshold`, `device_offline`, `new_enrollment`, `scheduled`, `risky_signin`, `drift_detected`, `encryption_off`, `script_failure`, `enrollment_failed`, `sync_failure`, `app_deploy_failed`, `cert_expiring`, `stale_device`, `agent_missing`, `agent_stale` |
| Actions | `slack_notify`, `create_jira`, `execute_runbook`, `execute_script`, `generate_report`, `send_notification`, `teams_notify` |
| Logic | `automationEngine.findMatchingDevices` applies trigger then conditions (platform, source, severity, compliance state). `agent_missing` / `agent_stale` compare Intune and Endpoint Central records by serial; they match nothing when either source returned no devices or a record has no serial. `scheduled` rules run from a 60 s tick with cron matching |
| Storage | `DATA_DIR/automations.json` (rules + latest 500 executions). Six **disabled** starter rules are added once if the file does not exist |
| AI | `POST /ai-build` uses OpenAI to draft a rule, with a rule-based fallback |
| Gaps | Write routes have no role/capability check beyond session; file `data/mockAutomations.ts` is misnamed; no remediation action that changes a device |
| Depth | Engine, store and routes read |

### 2.13 Reports & Analytics, Scheduled Reports, Slack schedules

| Item | Detail |
|---|---|
| Purpose | Ad-hoc report catalogue and exports; recurring reports posted to Slack/email; weekly fleet digest |
| UI | `components/reports/ReportsPage.tsx`, `pages/ReportBuilderPage.tsx`, `pages/ScheduledReportsPage.tsx`, `components/notifications/*` |
| API | `GET /api/reports`, `POST /:id/run`, `GET /:id/export/csv`; `GET/POST/PUT/DELETE /api/scheduled-reports`, `POST /:id/run`, `GET /:id/runs`; `GET /api/notification-schedules`, `PATCH /:module/:sourceId` (`notificationSchedules.edit`) |
| Report types | `critical-patching`, `stale-devices`, `compliance`, `inventory`, `app-updates`, `fleet-digest`, `entra-duplicate-devices`, `windows-updates` (formats pdf, excel, csv, pptx) — `store/scheduledReportsStore.ts` |
| Logic | 60-second tick; cron expression + timezone match; Slack channel in `filters.slackChannelId`; schedules with an opened "Slack Notification Schedule" section are owned by the generic notification scheduler instead (comment in `scheduledReportRunner.ts`) |
| Digest | Daily snapshot saved per run; week-over-week deltas vs the snapshot closest to 7 days back (max 14 days) |
| Errors | If the workbook cannot be built the digest is posted without the file and the run is reported as failed; a snapshot is saved only after a successful post |
| Gaps | The PowerPoint option is described as a "sample" deck in `ReportBuilderPage.tsx` — content quality *Not verified* |

### 2.14 Settings (integrations, roles, navigation)

| Item | Detail |
|---|---|
| UI | `components/settings/SettingsPage.tsx` (integration status, Roles & Permissions matrix, custom roles and assignments, sidebar navigation) |
| API | `GET /api/integrations/status`, `POST /:id/credentials`, `POST /:id/sync`, `/api/roles/*` (`roles.manage`), `/api/slack/*`, `/api/jira/*` |
| Logic | Connector configuration is read from environment variables by `store/integrationStore.ts`. `POST /api/integrations/:id/credentials` exists; whether it persists anything or only validates is *Not verified* |
| Gaps | `credentials`, Slack `test`/`reconnect`, Jira `issues` have no capability check beyond session |

### 2.15 AI Copilot

| Item | Detail |
|---|---|
| Purpose | Chat assistant with role-scoped tools and confirmed write actions |
| UI | `components/copilot/*`, `api/copilot.ts`, `context/CopilotContextProvider.tsx` |
| API | `POST /api/copilot/chat` (`copilot.read`), `POST /actions/:id/confirm` (`copilot.write`), `POST /actions/:id/reject`, `GET /conversations[/:id]` |
| Logic | Gemini tool-calling loop: Gemini picks tools, **the application executes them**; optional Google Search grounding (`GEMINI_ENABLE_GOOGLE_SEARCH`); conversations and pending actions stored in PostgreSQL tables `copilot_*` when a DB exists |
| Risk | Prompts/context are sent to Google; see [10](10-risks-limitations-technical-debt.md) |
| Depth | Header comments and routes read; tool list in `copilotTools.ts` not enumerated |

### 2.16 Intune Scripts & Configurations

| Item | Detail |
|---|---|
| UI / API | `pages/IntuneScriptsConfigPage.tsx`; `GET /api/intune-scripts-config/items`, `/items/:compositeId`, `/items/:compositeId/download`, `POST /export` (all `intuneScriptsConfig.access`) |
| Graph | `/deviceManagement/deviceManagementScripts`, `deviceHealthScripts`, `configurationPolicies`, `deviceConfigurations`, `groupPolicyConfigurations` |
| Depth | Route list and permission names only |

### 2.17 Notifications, Users, Jira/Confluence, Documentation

| Module | Notes |
|---|---|
| Notifications (bell) | `GET /api/notifications`, `PATCH /read-all`, `/:id/read`; store `data/notificationStore.ts` (file) |
| Users | `GET /api/users`, `/:id` from Entra sign-ins and Intune summaries, 5-min cache, risk level derived from sign-in risk |
| Jira / Confluence | `GET /api/jira/status`, `POST /issues`, `GET /issues/search`, `/confluence/search` — Atlassian Cloud basic auth (`JIRA_EMAIL` + `JIRA_API_TOKEN`) |
| Documentation page | `pages/DocsPage.tsx` (static in-app documentation, ~1,400 lines) |

---

## 3. Route index

| Mount | Router file | Guard |
|---|---|---|
| `/health` | `index.ts` | none |
| `/api/auth/*` | `routes/auth.ts` | none (sign-in); sign-in endpoint rate limited |
| `/api/mac-admin-access` (ingest) | `routes/macAdminAccess.ts` | shared secret |
| `/api/devices`, `/integrations`, `/notifications`, `/reports`, `/jira`, `/users`, `/automations`, `/slack`, `/entra`, `/intelligence`, `/scheduled-reports`, `/security-inventory`, `/patch`, `/security-posture`, `/dashboard`, `/mac-admin-access` (read) | respective files | session only |
| `/api/role-activity` | `roleActivity.ts` | `requireAuditRole('Audit Reader')` |
| `/api/intune-scripts-config` | `intuneScriptsConfig.ts` | `intuneScriptsConfig.access` |
| `/api/copilot` | `copilot.ts` | `copilot.read` / `copilot.write` |
| `/api/endpoint-central` | `endpointCentral.ts` | `patchOps.scanRemediate` on remediation |
| `/api/app-intel` | `appIntel.ts` | `appIntel.read` (+ `appIntel.write` on two routes) |
| `/api/stale-devices` | `staleDevices.ts` | `staleDevices.read` (+ `.export`) |
| `/api/notification-schedules` | `notificationSchedules.ts` | session; `notificationSchedules.edit` on PATCH |
| `/api/roles` | `roles.ts` | `roles.manage` |
| `/api/security-policies` | `securityPolicies.ts` | **not mounted** |

Permission keys are defined in `server/src/services/rolePermissions.ts`. Full matrix: [13](13-api-permission-matrix.md) and [06](06-authentication-rbac-security.md).
