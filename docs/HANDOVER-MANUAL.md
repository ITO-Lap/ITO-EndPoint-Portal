> Word version for download: [ITO-Endpoint-Handover-Manual.docx](ITO-Endpoint-Handover-Manual.docx). Keep both files in sync (edit the content, regenerate the .docx).

# EndPoint+: project handover manual

_Everything a new owner needs to understand, run, deploy, maintain and troubleshoot the application. Prepared at the outgoing developer's departure. Version 1.0, October 2026._


## 1. Read this first: state of the project at handover

These items affect whether the team can actually take over the work. They were verified against the repository on the day this manual was written.

| Finding | Detail | Action for new owner |
|---|---|---|
| Large amount of work is not committed | About 170 files are modified, deleted or untracked in the working copy (App Intelligence, Stale Devices, Patch Operations, dashboard panels, schedulers, tests and more). | Review and commit this work to the shared repository before anything else. Until then it exists only on the previous developer's laptop. |
| Remote is far behind | Local main is 28 commits ahead of origin/main. The last push to origin/main was 6 June 2026. | Push after the commit review. Confirm the pushed branch builds in CI or on a clean clone. |
| Repository owner is a personal account | The remote is github.com/AKVERMA87/Automation-Dashboard, a personal account, not a Verma organization. | Transfer or mirror the repository into the approved Verma shared repository and update the remote. Add at least two maintainers. |
| Front-end tests failing | npm test: 25 of 129 tests fail across 2 files (securityPosturePage and a component test that renders without ToastProvider). Server tests pass: 472 passed, 7 skipped. | Fix or update these tests before enabling a CI gate. Back end and front end both build successfully. |
| Hard-coded admin identity | server/src/routes/auth.ts and the PROFILE_USER_UPN default use avinash.verma@zinnia.com. The front end always runs as Global Admin. | Replace with the new owner or a group. See section 8 for the authentication model. |
| Stray value in root .env | The root .env file (git-ignored) contains one line that is not a KEY=value pair and looks like a credential. | Delete the line and rotate that credential in its source system. |
| Documentation drift | CLAUDE.md, AGENTS.md and .github/copilot-instructions.md still mention Kandji and OpenAI-only AI. docs/06-development/SETUP.md describes a sign-in screen that no longer exists. | This manual is the current reference. Correct the older files (see section 14). |


## 2. What the application is

EndPoint+ is an internal dashboard for IT Operations. It connects to Microsoft Intune, Microsoft Entra ID and ManageEngine (Endpoint Central and MDM), shows device, patch, application and security posture, runs scheduled reports and rule-based automations, and provides an AI chat assistant (the Endpoint Operations Copilot). It can raise Jira tickets, create Confluence articles and post to Slack.

With no credentials configured, the application starts and shows empty states; each integration lights up when its credentials are supplied in server/.env or in Settings, Integrations.

| Layer | Technology |
|---|---|
| Front end | React 19, TypeScript, Tailwind CSS 4, Vite 8, lucide-react, MSAL browser library |
| Back end | Node.js, Express 5, TypeScript (ES modules, imports must end in .js), zod, express-rate-limit |
| AI | Google Gemini (default gemini-2.5-flash) for the Copilot chat with tool calling; OpenAI (gpt-4o-mini) for device analysis, risk scoring and intelligence summaries |
| Data | PostgreSQL (optional, used for audit log, scheduled reports, security policy snapshots, Copilot conversations); in-memory and local JSON files for everything else |
| Exports | exceljs (Excel), pdfkit (PDF), pptxgenjs (PowerPoint), CSV |
| Hosting | Windows Server with IIS as reverse proxy, Node.js running as a Windows service through NSSM; packaged and uploaded through DeployHub |
| Testing | Vitest (front end with jsdom and Testing Library; back end with Node environment) |


## 3. Architecture

The production deployment is a single Node.js process. Express serves the compiled React app from the dist folder and answers API calls under /api. IIS only forwards traffic to 127.0.0.1:4000. In development, Vite serves the front end on port 5173 and Express serves the API on port 4000.


### Request path

1. Browser requests the page or an /api call from IIS (HTTPS).
2. IIS with URL Rewrite and Application Request Routing proxies the request to http://127.0.0.1:4000.
3. Express applies CORS, JSON parsing, request logging and a rate limiter (200 requests per 15 minutes per client in production, 2000 in development).
4. A route handler in server/src/routes calls a service in server/src/services, which calls Microsoft Graph, ManageEngine, Slack, Jira, Gemini or OpenAI, or PostgreSQL.
5. Responses return as JSON. Any non-API GET falls through to index.html so client-side routing works.


### Background jobs started by the server

| Job | File | Cadence | Purpose |
|---|---|---|---|
| Slack health monitor | services/slackHealth.ts | Every 5 minutes, with retry at 10, 30 and 90 seconds | Detects Slack disconnects and supports Reconnect Now in Settings |
| Scheduled report runner | services/scheduledReportRunner.ts | Every 60 seconds | Runs due reports from cron expressions and emails or posts output |
| Automation scheduler | services/automationScheduler.ts | Every 60 seconds | Evaluates automation rules with a schedule trigger |
| Verified app release monitor | services/appIntel/releaseMonitor.ts | Every 6 hours (APP_INTEL_RELEASE_POLL_INTERVAL_MS) | Checks approved version sources; Slack digest at most weekly. First run sets a baseline and does not alert |
| Notification scheduler | services/notificationScheduler.ts | Continuous tick | Delivers scheduled Slack notifications |

The old Intune Audit Logs export scheduler exists in code but is not started from index.ts and its routes are removed. Its tables remain in schema.sql. The active audit feature is Role Activity Audit.


## 4. Repository layout

| Path | Contents |
|---|---|
| src/ | React front end: App.tsx (page router), pages/, components/, api/ (HTTP client), hooks/, lib/, data/dashboardData.ts (navigation and static data), types.ts |
| server/src/index.ts | Express entry point, route mounting, scheduler start and stop |
| server/src/routes/ | One router per area: devices, integrations, copilot, patch, appIntel, staleDevices, securityPosture, roleActivity, scheduledReports, automations, reports, jira, slack, entra and others |
| server/src/services/ | Integration clients and business logic: intune.ts, manageEngine.ts, endpointCentral*.ts, entra*.ts, copilotEngine.ts, copilotTools.ts, openai.ts, riskScoring.ts, patchOperations.ts, appIntel/, staleDevices/ |
| server/src/store/ | integrationStore.ts (runtime credentials and fetch cache), scheduledReportsStore.ts |
| server/src/db/ | index.ts (pg pool) and schema.sql (all tables, idempotent) |
| server/src/middleware/ | errorHandler, requestLogger, requireRole |
| deploy/iis/ | web.config (reverse proxy rule) and install-service.ps1 (NSSM service installer) |
| docs/ | Feature, integration, API and deployment documentation; start at docs/README.md |
| dist/ and server/dist/ | Build output. Git-ignored; regenerated by npm run build |


## 5. Application pages

Navigation is defined in src/data/dashboardData.ts (navItems) and routed in src/App.tsx.

| Group | Pages |
|---|---|
| Overview | Dashboard (action center, patch priority, application updates, security watch, operational queue, Slack quick schedules) |
| Devices | Managed Devices, Stale Devices (no verified check-in for 21 days or more) |
| Applications | ManageEngine App Inventory (with Verified updates tab), App Guardian (Mac) |
| Patches | Patch Operations |
| Security | Security Posture, Role Activity Audit, Policy Conflicts, Risk Scoring |
| Automations | Automation (triggers, conditions, actions) |
| Reports | Reports and Analytics, Scheduled Reports, Mac Fleet Reports (opened from Managed Devices) |
| Settings | Integrations, compliance, automation, security, notifications, data |
| Cross-cutting | Endpoint Operations Copilot (floating chat widget); Entra Intelligence (drill-down) |

Feature-level detail is in docs/07-features. The Copilot may only run write actions (Jira ticket creation, automation test-runs) after the user confirms them through POST /api/copilot/actions/:id/confirm.


## 6. Integrations and required access

| Integration | Variables | Access required | Detail doc |
|---|---|---|---|
| Microsoft Intune (Graph) | INTUNE_TENANT_ID, INTUNE_CLIENT_ID, INTUNE_CLIENT_SECRET | Application permissions: DeviceManagementManagedDevices.Read.All, DeviceManagementConfiguration.Read.All, DeviceManagementApps.Read.All, DeviceManagementEndpointSecurity.Read.All | docs/04-integrations/INTUNE.md |
| Microsoft Entra ID | ENTRA_TENANT_ID, ENTRA_CLIENT_ID, ENTRA_CLIENT_SECRET (falls back to Intune values) | AuditLog.Read.All, Directory.Read.All, IdentityRiskyUser.Read.All, Reports.Read.All, Policy.Read.All, Group.Read.All; Office 365 Management APIs ActivityFeed.Read for SharePoint role activity | docs/04-integrations/ENTRA.md |
| ManageEngine MDM and Endpoint Central (Zoho OAuth) | MANAGEENGINE_CLIENT_ID, MANAGEENGINE_CLIENT_SECRET, MANAGEENGINE_REFRESH_TOKEN, MANAGEENGINE_API_DOMAIN, ENDPOINT_CENTRAL_BASE_URL | Self-client with scope MDMOnDemand.MDMInventory.READ and DesktopCentralCloud.PatchMgmt.READ | docs/04-integrations/MANAGEENGINE.md |
| Slack | SLACK_BOT_TOKEN, SLACK_WEBHOOK_URL, SLACK_SIGNING_SECRET, SLACK_WORKSPACE_ID, SLACK_CRITICAL_PATCH_CHANNEL_ID, SLACK_APP_UPDATE_CHANNEL_ID | Bot scopes auditlogs:read, channels:read, users:read plus posting | docs/04-integrations/SLACK.md |
| Jira and Confluence | JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN, JIRA_PROJECT_KEY, CONFLUENCE_BASE_URL | API token for a service or named account that can create issues | docs/04-integrations/JIRA.md, CONFLUENCE.md |
| Google Gemini (Copilot) | GEMINI_API_KEY, GEMINI_MODEL, GEMINI_ENABLE_GOOGLE_SEARCH | Google AI Studio key. Set GEMINI_ENABLE_GOOGLE_SEARCH=false to stop public web grounding | server/src/services/copilotEngine.ts |
| OpenAI | OPENAI_API_KEY | API key with gpt-4o-mini access | docs/04-integrations/OPENAI.md |
| PostgreSQL | DATABASE_URL | Database and user able to create tables | server/src/db/schema.sql |
| Optional | GITHUB_TOKEN (winget manifest lookups, 5000 requests per hour), NVD_API_KEY (CVE lookups), SESSION_SECRET, FRONTEND_URL | Read-only tokens | server/.env.example |

server/.env.example documents every variable with comments and is the master list. Never commit a real .env file. The Intune and Entra integrations may share one Azure app registration; the combined permission set above must be granted with admin consent.


## 7. Data stores and persistence

- PostgreSQL is optional. Without DATABASE_URL, features that need it (audit trail, scheduled reports, security policy snapshots and sync, Copilot history) degrade or return 503; the rest of the app works.
- Initialize or update the schema with: psql $DATABASE_URL -f server/src/db/schema.sql (idempotent, uses CREATE TABLE IF NOT EXISTS). Tables: tenants, audit_logs, device_risk_scores, scheduled_reports, report_runs, intune_audit_* (legacy), security_policy_* (4 tables), copilot_conversations, copilot_messages, copilot_pending_actions.
- server/.integration-credentials.json stores credentials saved through Settings, Integrations, in plain text on the server disk. It is git-ignored. Restrict file permissions to the service account and prefer environment variables in server/.env. Back this file up or re-enter credentials after a rebuild.
- Other local state files (git-ignored): server/.app-release-alerts.json, server/.patch-remediation-actions.json, server/.scheduled-reports.json, server/.cache.
- In-memory caches reset on every restart: integration fetch results, OAuth tokens, CSRF states.


## 8. Authentication, roles and security model

- There is no login screen. src/App.tsx always renders the application as Global Admin. Do not assume users are authenticated.
- The server has no general authorization. The only enforcement is server/src/middleware/requireRole.ts, which trusts an x-user-role header sent by the front end. A header is not a verified credential.
- server/src/routes/auth.ts contains an unused Entra OAuth authorization code flow with role mapping: avinash.verma@zinnia.com is Global Admin, group ITO EndPoint Portal is IT Admin, group Desktop Support is Helpdesk. Its redirect URI is hard-coded to localhost:4000 and must be parameterized before reuse.
- Because the app has broad read access to device and identity data and can create Jira tickets and Slack posts, restrict network access (internal network or VPN, IIS authentication) until real authentication is implemented. This is the highest-priority engineering follow-up.
- Roles are documented in docs/ROLES.md (Global Admin, IT Admin, Helpdesk, End User). That document describes some user management features that were removed; treat it as design intent.
- Compliance: the application reads corporate device and identity metadata and audit events. Confirm with Security and Compliance that data retention, access control and the use of external AI providers (Google Gemini, OpenAI) with that data are approved. Do not send PHI or customer data to either provider.


## 9. Local setup for a new developer


### Prerequisites

- Node.js 22 LTS (Vite 8 needs 20.19 or newer) and npm
- Git, and access to the shared repository
- Optional: PostgreSQL 14 or newer, and credentials for the integrations you want live


### Steps

1. Clone the repository: git clone <shared repository URL> endpoint-ai-copilot, then cd endpoint-ai-copilot
2. Install dependencies: npm install (the postinstall hook also installs server dependencies)
3. Create the environment file: cp server/.env.example server/.env and fill in only what you need
4. Optional database: createdb ito_endpoint, set DATABASE_URL in server/.env, then run psql $DATABASE_URL -f server/src/db/schema.sql
5. Start both servers: npm run dev. The client runs at http://localhost:5173 and the API at http://localhost:4000
6. Verify: open http://localhost:4000/health and expect {"status":"healthy"}; the server console lists which integrations are configured
7. Run tests: npx vitest run (front end) and npm --prefix server test (back end)
8. Lint: npm run lint


### Commands

| Command | Purpose |
|---|---|
| npm run dev | Client and server together |
| npm run dev:client / dev:server | One side only |
| npm run build | Build client (Vite) and server (tsc) |
| npm start | Build, then run node server/dist/index.js (serves client and API on port 4000) |
| npm test | Front-end tests (currently 25 failing, see section 1) |
| npm --prefix server test | Back-end tests (472 passing) |
| npm run lint | ESLint |

Coding rules to keep: back-end relative imports must end in .js; add a new API endpoint as a router in server/src/routes mounted in server/src/index.ts; every front-end call goes through src/api; add new pages to navItems and the router in src/App.tsx. docs/06-development/QUICK-MODS.md has recipes.


## 10. Deployment


### Production topology

Windows Server, IIS site with URL Rewrite and ARR (rule in deploy/iis/web.config forwards all traffic to 127.0.0.1:4000), and the Node process installed as a Windows service named ITOEndpointCopilot (default in deploy/iis/install-service.ps1) using NSSM. The full, beginner-level procedure is in docs/06-development/IIS-DEPLOYMENT.md and should be followed for a new server.


### Release procedure

1. Merge approved changes to main and tag the release (for example v3.1.0). Confirm tests and the build pass.
2. Package the source following docs/06-development/ZIP-FOR-DEPLOYHUB.md. Exclude node_modules, dist, .git and every .env file, then verify the zip contains no secrets.
3. Upload the package to DeployHub (https://itodash.zinnia.com/DeployHub/Apps/f97206a0-f0dc-4c2f-8a7f-eda3b1f98392) or copy it to the server.
4. On the server in the project folder: npm install, then npm run build.
5. Confirm server/.env is present and correct. Do not set PORT; the IIS rule expects 4000.
6. Restart the service: nssm restart ITOEndpointCopilot (or Restart-Service ITOEndpointCopilot).
7. If the schema changed, run psql against DATABASE_URL with server/src/db/schema.sql.
8. Verify: Invoke-WebRequest http://127.0.0.1:4000/health, then open the site through IIS and check Settings, Integrations shows the expected connections.


### Rollback

Keep the previous release folder or zip. To roll back, stop the service, restore the previous folder and server/.env, run npm install and npm run build if the build output was not kept, and start the service. Schema changes are additive, so the database normally needs no rollback.


### Other hosting notes

package.json contains a heroku-postbuild script and the server sets trust proxy to 1, so the same single-process build can run behind another reverse proxy. Logs for the Windows service are in the project logs folder (service.out.log and service.err.log).


## 11. Operations and maintenance

| Task | Frequency | How |
|---|---|---|
| Check health endpoint and service status | Daily or via monitoring | GET /health; confirm the Windows service is running; read service.err.log |
| Rotate Azure client secret | Before expiry (set a calendar reminder; maximum 24 months) | Create a new secret in the app registration, update server/.env or Settings, Integrations, restart, verify |
| Rotate ManageEngine refresh token, Slack, Jira, Gemini and OpenAI keys | Per security policy or on staff change | Replace in server/.env, restart the service, use Test connection in Settings |
| Review who has access | Quarterly | Repository, Azure app registration owners, DeployHub, server administrators, Slack app, Jira token owner |
| Update dependencies | Monthly | npm outdated, npm audit; update in a branch; run both test suites and a build |
| Review background jobs | Monthly | Scheduled reports and automation rules still valid; Slack channels exist; app release monitor baseline |
| Back up | Per policy | Database; server/.integration-credentials.json; server/.env stored in the secrets vault, not in Git |
| Add or change an integration | As needed | New service in server/src/services, credentials in integrationStore.ts, router in server/src/routes, setup guide in docs/04-integrations |


## 12. Troubleshooting

| Symptom | Likely cause | Resolution |
|---|---|---|
| Every integration shows as not configured in production | server/.env missing or in the wrong place | The server loads server/.env relative to its own build folder. Confirm the file exists at server/.env, then restart the service |
| Cannot find module error on server start | Import without the .js extension | Use .js in all back-end relative imports, then rebuild |
| Port 4000 already in use | Another process or a duplicate service | lsof -i :4000 (Mac) or netstat -ano \| findstr 4000 (Windows); stop the process or the extra service |
| IIS returns 502 or 503 | Node service stopped, or ARR proxy not enabled | Start the service; in IIS Manager enable proxy under Application Request Routing Cache, Server Proxy Settings |
| Large export or upload rejected by IIS | Request size limit | Raise maxAllowedContentLength in web.config (currently 30 MB) |
| Intune or Entra returns 401 or 403 | Expired client secret, or missing admin consent | Create a new secret; confirm the permissions in section 6 are granted and consented |
| ManageEngine returns invalid token | Refresh token revoked or wrong data center domain | Regenerate the Zoho self-client refresh token; check MANAGEENGINE_API_DOMAIN |
| Patch pages empty | Endpoint Central scope or base URL missing | Add DesktopCentralCloud.PatchMgmt.READ to the OAuth client and set ENDPOINT_CENTRAL_BASE_URL |
| Copilot answers with an error | Missing or invalid GEMINI_API_KEY, quota, or model name | Set a valid key and GEMINI_MODEL; check server console for the provider message |
| AI risk summaries are plain text only | OPENAI_API_KEY not set | Set the key; the rule-based fallback is used without it |
| Scheduled reports or Copilot history return 503 | DATABASE_URL not set or database unreachable | Set DATABASE_URL, run schema.sql, check network access to PostgreSQL |
| Too many requests message | Rate limiter (200 per 15 minutes in production) | Wait, or raise the limit in server/src/index.ts if the usage is legitimate |
| Slack stops posting | Token revoked or workspace change | Use Reconnect Now in Settings, or replace SLACK_BOT_TOKEN |
| Front-end test fails with useToast must be used within a ToastProvider | Test renders a component without the provider | Wrap the component in ToastProvider in the test setup (src/test) |
| Changes not visible after deploy | Old dist folder served | Run npm run build on the server, restart, hard-refresh the browser |


## 13. Handover checklist and open actions

| Action | Owner | Done |
|---|---|---|
| Commit all working-copy changes to a reviewed branch and push to the shared repository | [New owner] | [ ] |
| Move or mirror the repository from the personal GitHub account to the approved Verma organization; add maintainers | [New owner / Engineering lead] | [ ] |
| Clean clone test: clone, follow section 9, run build and tests, confirm the app starts | [Second engineer] | [ ] |
| Transfer ownership of the Azure app registration(s) and record the client secret expiry date | [Identity team] | [ ] |
| Rotate all credentials the previous developer held (Azure, ManageEngine, Slack, Jira, Gemini, OpenAI, database) | [New owner] | [ ] |
| Remove the stray credential line from the root .env and rotate it | [Outgoing developer] | [ ] |
| Grant new owners access to the server, DeployHub app, Slack app and Jira project | [IT / Platform] | [ ] |
| Replace hard-coded avinash.verma@zinnia.com references (auth.ts, PROFILE_USER_UPN) | [New owner] | [ ] |
| Fix the 25 failing front-end tests; add CI to run build and both test suites | [New owner] | [ ] |
| Decide and schedule real authentication and server-side authorization | [Engineering lead / Security] | [ ] |
| Update CLAUDE.md, AGENTS.md, copilot-instructions.md and SETUP.md to match this manual | [New owner] | [ ] |
| Walk-through session with outgoing developer (architecture, integrations, deployment) | [Both] | [ ] |

| Contact | Name | Email / channel |
|---|---|---|
| Product owner | [Name] | [Email] |
| Technical owner (new) | [Name] | [Email] |
| Outgoing developer | Avinash Verma | avinash.verma@zinnia.com |
| Azure / Entra administrator | [Name] | [Email] |
| ManageEngine administrator | [Name] | [Email] |
| Server and IIS administrator | [Name] | [Email] |
| Security and compliance reviewer | [Name] | [Email] |


## 14. Documentation index and known corrections

Start at docs/README.md. Key documents: docs/01-overview (architecture, tech stack), docs/03-backend (API reference, services), docs/04-integrations (one guide per integration), docs/06-development (setup, IIS deployment, DeployHub packaging, quick modifications), docs/07-features (feature guides), docs/08-design (design system and Verma brand tokens), docs/ROLES.md, and docs/plans/2026-10-20-patch-operations.md.

Corrections needed in existing files: CLAUDE.md, AGENTS.md and .github/copilot-instructions.md describe an OpenAI-only AI layer and mention Kandji; the Copilot now uses Gemini and Kandji was removed. docs/06-development/SETUP.md, step 4, describes a demo sign-in page that was removed. docs/01-overview/ARCHITECTURE.md shows the Copilot calling OpenAI. docs/README.md lists some pages (Intune Devices, Mac Devices) that are now combined as Managed Devices.
