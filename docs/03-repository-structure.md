# 03 — Repository Structure

> Labels: **Verified** (observed in the repository listing/code), **Inferred**, **Not verified**. Related: [02 — Architecture](02-architecture.md), [04 — Modules](04-modules-and-code-logic.md).

## 1. Top level

| Path | Purpose |
|---|---|
| `package.json`, `package-lock.json` | Frontend manifest. `postinstall` also runs `npm --prefix server install`, so one `npm install` installs both tiers |
| `index.html`, `vite.config.ts`, `tsconfig*.json`, `eslint.config.js`, `vitest.config.ts` | Vite/TypeScript/ESLint/Vitest configuration for the frontend |
| `src/` | **Frontend** (React SPA) |
| `server/` | **Backend** (Express API + background jobs), its own `package.json`, `tsconfig.json`, `vitest.config.ts` |
| `public/` | Static assets (favicon, icons, `public/docs`) |
| `dist/` | Frontend build output (generated, not committed). Served by the server when present |
| `deploy/iis/` | `web.config` (IIS reverse proxy) and `install-service.ps1` (NSSM Windows Service installer) |
| `docs/` | Documentation: this numbered set plus older folders `01-overview` … `08-design`, `HANDOVER-MANUAL.md`, `ROLES.md`, `.docx/.pdf` exports and generator scripts |
| `.github/` | `CODEOWNERS` (default reviewer for everything) and `copilot-instructions.md`. **No `workflows/` directory — there is no CI pipeline in the repo** |
| `.claude/` | Claude Code settings (`launch.json`, `settings*.json`); developer tooling only |
| `CLAUDE.md`, `AGENTS.md` | Contributor/agent orientation notes |
| `.env` (top level) | Present locally; the server reads **`server/.env`**, not this file (`server/src/index.ts`). Not verified what the top-level file is used for |
| `ITO_Copilot_Talk_Plan.docx`, `Mac_Devices_Dashboard_Showcase.doc(x)` | Presentation/showcase documents, not part of the build |
| `README.md` | Entry point to this documentation set |

## 2. Frontend (`src/`)

| Path | Contents |
|---|---|
| `main.tsx`, `App.tsx` | Entry point; `App.tsx` holds the providers (`ToastProvider`, `NavVisibilityProvider`, `AuthGate`, `PermissionsProvider`), the active-page state and the page switch |
| `pages/` | Full pages: `ManagedDevicesPage`, `IntuneDevicesPage`, `MacDevicesPage`, `MacFleetReportsPage`, `StaleDevicesPage`, `AppIntelligencePage`, `ManageEngineAppInventoryPage` (wrapper for the Application Security & Compliance view), `AppGuardianPage`, `PatchOperationsPage`, `SecurityPosturePage`, `SecurityPoliciesPage`, `PolicyConflictPage`, `RiskScoringPage`, `RoleActivityAuditPage`, `ScheduledReportsPage`, `ReportBuilderPage`, `IntuneScriptsConfigPage`, `DocsPage`, `LoginPage` |
| `components/` | Feature components grouped by area: `appIntel`, `auth` (`AuthGate`), `automation`, `copilot`, `dashboard`, `devices`, `entra`, `layout` (`Header`, `Sidebar`), `notifications`, `reports`, `role-activity`, `runbooks`, `security`, `settings`, `ui` (shared widgets: toast, pagination, sortable header, logo) |
| `api/` | Typed API clients: `index.ts` (devices, integrations, automations, Slack, Entra, reports…), `appIntel.ts`, `copilot.ts`, `intelligence.ts`, `intuneScriptsConfig.ts`, `notificationSchedule.ts`, `roleActivity.ts`, `roles.ts`, `securityPolicies.ts`, `session.ts`, `staleDevices.ts` |
| `context/` | `PermissionsContext`, `NavVisibilityContext`, `CopilotContextProvider` |
| `hooks/` | `useStats`, `useNotifications`, `useAutomations`, `useIntegrationStatus`, `useDashboardState`, `usePagination`, `useColumnResize`, `useLocalStorage`, `useClickOutside` |
| `lib/` | `permissions.ts` (page access), `kpiConfig.ts`, `kpiExport.ts`, `securityPosture.ts`, `macPostureScore.ts`, `tableSorting.ts`, `timezone.ts`, `msalConfig.ts`, `packagingHandoff.ts` |
| `data/` | Static UI data, e.g. `dashboardData.ts` (sidebar items) |
| `test/` | Test setup |
| `types.ts` | Shared client types |

## 3. Backend (`server/`)

| Path | Contents |
|---|---|
| `src/index.ts` | App bootstrap: middleware, router mounting, SPA serving, background jobs, graceful shutdown |
| `src/routes/` | One file per API area (26 routers). See the route table in [04 §3](04-modules-and-code-logic.md) |
| `src/services/` | Integration clients and business logic: `graphApi.ts` (shared Graph client), `intune.ts`, `manageEngine.ts`, `endpointCentralPatch.ts`, `endpointCentralSoftware.ts`, `patchOperations.ts`, `slack.ts`, `slackHealth.ts`, `teams.ts`, `jira.ts`, `confluence.ts`, `openai.ts`, `copilotEngine.ts`, `copilotTools.ts`, `automationEngine.ts`, `automationScheduler.ts`, `scheduledReportRunner.ts`, `notificationScheduler.ts`, `fleetDigest.ts`, `fleetDigestReport.ts`, `reportExporter.ts`, `staleDevicesReport.ts`, `criticalPatchReport.ts`, `riskScoring.ts`, `securityPosture.ts`, `policyConflict.ts`, `securityPoliciesGraph.ts`, `entra*.ts`, role-activity pullers, `session.ts`, `rolePermissions.ts`, `roleResolution.ts`, `macAdminAccess.ts` |
| `src/services/appIntel/` | Application intelligence engine: `providers`, `normalize`, `installSource`, `latestVersion`, `version`, `cve`, `decision`, `query`, `service`, `requests`, `exportReport`, `updateReport`, `releaseMonitor`, `releaseAlerts`, `lifecycle`, `capabilities`, `catalog` |
| `src/services/staleDevices/` | Stale-device normalisation, query, service |
| `src/store/` | Persistence helpers: `dataDir.ts` (DATA_DIR resolution, atomic writes), `deviceSnapshotStore.ts`, `fleetSnapshotStore.ts`, `integrationStore.ts` (reads env → connector config), `rolesStore.ts`, `scheduledReportsStore.ts` |
| `src/data/` | `mockAutomations.ts` (**misnamed**: it is the real, file-persisted automation store with starter rules), `notificationStore.ts`, `macosSystemApps.ts` |
| `src/db/` | `index.ts` (pg pool; absent `DATABASE_URL` disables DB features) and `schema.sql` |
| `src/middleware/` | `requireSession.ts`, `requireRole.ts` (`requireCapability`, `requireAppRole`, audit roles), `errorHandler.ts`, `requestLogger.ts` |
| `src/reporting/` | Report definitions and engine used by scheduled/ad-hoc reports |
| `src/security-agents/` | Registry/collectors/service for endpoint-protection coverage |
| `src/types.ts` | Shared server types (`Device`, `AutomationRule`, `ApiResponse`…) |
| `data/` | **Local runtime data** (`DATA_DIR` default in development); git-ignored |
| `.cache`, `.*.json` (hidden) | Legacy locations; migrated automatically into `DATA_DIR` on first start |
| `.env`, `.env.example` | Environment configuration. `.env` is git-ignored |

## 4. Tests

| Where | Count/notes |
|---|---|
| `src/**/__tests__` (frontend) | Vitest + Testing Library, jsdom |
| `server/src/**/__tests__` | Vitest, node environment (`include: src/**/*.test.ts`) |
| Skipped | `intuneAuditExport.e2e.test.ts` (requires external infrastructure — *Inferred*) |
| End-to-end | No Playwright specs found. *Not verified* whether any exist outside the repository |

Commands: [07 — Installation and onboarding](07-installation-and-developer-onboarding.md).

## 5. Module-to-code-location map

| Module (UI title) | Frontend | Backend route | Backend service/store |
|---|---|---|---|
| Dashboard | `components/dashboard/*`, `hooks/useStats.ts` | `/api/devices`, `/api/dashboard`, `/api/patch`, `/api/app-intel` | `routes/devices.ts`, `routes/dashboard.ts` |
| Managed Devices | `pages/ManagedDevicesPage.tsx` → `IntuneDevicesPage`, `MacDevicesPage` | `/api/devices`, `/api/intelligence` | `services/intune.ts`, `services/manageEngine.ts` |
| Application Security & Compliance (sidebar title "ManageEngine App Inventory") | `pages/ManageEngineAppInventoryPage.tsx` → `AppIntelligencePage.tsx`, `components/appIntel/*` | `/api/app-intel` | `services/appIntel/*` |
| App Guardian | `pages/AppGuardianPage.tsx` | `/api/integrations/manageengine/apps` | `services/manageEngine.ts`, `macAppClassification.ts` |
| Stale Devices | `pages/StaleDevicesPage.tsx`, `api/staleDevices.ts` | `/api/stale-devices` | `services/staleDevices/*`, `staleDevicesReport.ts` |
| Mac Fleet Reports | `pages/MacFleetReportsPage.tsx`, `lib/kpiConfig.ts` | `/api/devices`, `/api/mac-admin-access` | `services/macAdminAccess.ts` |
| Entra Intelligence | `components/entra/EntraIntelligenceDashboard.tsx` | `/api/entra` | `services/entra*.ts` |
| Patch Operations | `pages/PatchOperationsPage.tsx` | `/api/endpoint-central`, `/api/patch` | `services/endpointCentralPatch.ts`, `patchOperations.ts`, `patchRemediationStore` |
| Security Posture | `pages/SecurityPosturePage.tsx`, `lib/securityPosture.ts` | `/api/security-posture`, `/api/security-inventory` | `services/securityPosture.ts`, `security-agents/*` |
| Policy Conflicts | `pages/PolicyConflictPage.tsx`, `api/intelligence.ts` | `/api/intelligence/policies` | `services/policyConflict.ts` |
| Security Policies snapshots (**unmounted**, see note) | `pages/SecurityPoliciesPage.tsx` (unused), `api/securityPolicies.ts` | `/api/security-policies` (router not mounted) | `services/securityPoliciesGraph.ts`, `securityPoliciesStore.ts` |
| Risk Scoring | `pages/RiskScoringPage.tsx` | `/api/intelligence/risk-scores` | `services/riskScoring.ts` |
| Role Activity Audit | `pages/RoleActivityAuditPage.tsx`, `components/role-activity/*` | `/api/role-activity` | `services/*RoleActivityPuller.ts`, `entraRoleAuditPuller.ts` |
| Automation | `components/automation/AutomationPage.tsx`, `hooks/useAutomations.ts` | `/api/automations` | `services/automationEngine.ts`, `automationScheduler.ts`, `data/mockAutomations.ts` |
| Reports & Analytics | `components/reports/ReportsPage.tsx`, `pages/ReportBuilderPage.tsx` | `/api/reports`, `/api/intelligence` | `services/reportExporter.ts`, `reporting/*` |
| Scheduled Reports (+ Slack schedules) | `pages/ScheduledReportsPage.tsx`, `components/notifications/*` | `/api/scheduled-reports`, `/api/notification-schedules` | `services/scheduledReportRunner.ts`, `notificationScheduler.ts`, `store/scheduledReportsStore.ts` |
| Settings (integrations, roles, navigation) | `components/settings/SettingsPage.tsx`, `api/roles.ts` | `/api/integrations`, `/api/roles`, `/api/slack`, `/api/jira` | `store/integrationStore.ts`, `store/rolesStore.ts`, `services/rolePermissions.ts` |
| AI Copilot | `components/copilot/*`, `api/copilot.ts` | `/api/copilot` | `services/copilotEngine.ts`, `copilotTools.ts` |
| Scripts & Configurations | `pages/IntuneScriptsConfigPage.tsx` | `/api/intune-scripts-config` | `services/intuneScriptsConfig*.ts` |
| Documentation | `pages/DocsPage.tsx` | — | — |

> Note (Verified): `server/src/routes/securityPolicies.ts` exists but is **not imported or mounted in `server/src/index.ts`** (also absent from the committed `HEAD` version), and `src/pages/SecurityPoliciesPage.tsx` is not referenced by any other file. The Policy Conflicts page uses `GET /api/intelligence/policies` via `src/api/intelligence.ts`. So the Graph-backed security-policy snapshot feature (`/api/security-policies`, `src/api/securityPolicies.ts`) is **currently unreachable**. See [15](15-known-gaps-and-verification-checklist.md).

## 6. Where to make a change

| Change | Edit |
|---|---|
| New sidebar page | `src/data/dashboardData.ts`, `src/App.tsx` switch, `src/lib/permissions.ts` `KNOWN_PAGES`, `server/src/services/rolePermissions.ts` `PAGE_TITLES` ([12](12-change-management.md)) |
| New API endpoint | New/extended file in `server/src/routes/`, mount in `index.ts`, client in `src/api/` |
| New integration credential | `server/src/store/integrationStore.ts`, `.env.example`, [14](14-environment-variable-reference.md) |
| Dashboard card | `src/components/dashboard/`, data from `src/hooks/useStats.ts` |
| Persisted data file | `server/src/store/dataDir.ts` (`dataFile()`) |
| Automation trigger | `server/src/types.ts`, `routes/automations.ts` zod enum, `services/automationEngine.ts`, `src/api/index.ts`, `AutomationPage.tsx` |
