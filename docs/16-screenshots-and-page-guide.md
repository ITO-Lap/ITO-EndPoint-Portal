# 16 — Screenshots and Page Guide

> One screenshot per sidebar page, captured from a local run (`1440 px` wide, signed in as a Global Admin, with the Intune, Entra, ManageEngine and Slack connectors configured; Jira not connected). Pages longer than 2400 px are cropped at the top. Module logic, endpoints and extension points are in [04](04-modules-and-code-logic.md); permission keys in [06](06-authentication-rbac-security.md).
>
> **Data note:** the captures show live tenant data (device names, owners, counts). Review before sharing outside IT Operations. Re-capture steps are in §3.

## 1. Layout common to every page

Left sidebar (grouped: Overview, Devices, Applications, Patches, Security, Automations, Reports, Settings), top bar (global device/user/serial search, notifications, signed-in user and role), integration-status panel at the bottom of the sidebar (green = configured and reachable), and a floating Ocean/Copilot button at the lower right. Which sidebar items appear depends on the user's role (`pages.<Sidebar Title>` keys, see [06](06-authentication-rbac-security.md)).

## 2. Pages

### 2.0 Sign-in
![Sign-in](screenshots/pages/00-login.png)

Microsoft sign-in, plus an e-mail field when `AUTH_PASSWORDLESS` is on (local development only). Server side: `server/src/routes/auth.ts`.

### 2.1 Dashboard
![Dashboard](screenshots/pages/01-dashboard.png)

Fleet overview across Intune and Endpoint Central: live-source bar, Action Center tiles (critical actions, stale devices, missing critical patches, application updates), quick Slack schedules, patch priority (Windows / macOS), operational queue of exceptions, KPI tiles (total, compliant, non-compliant, warning, open issues, Windows, Mac), device summary, compliance status and top issue categories. Code: `src/components/dashboard/`.

### 2.2 Managed Devices
![Managed Devices](screenshots/pages/02-managed-devices.png)

Unified device list from both sources with search, filters and a per-device panel (overview, hardware, network, security, apps). Code: `src/pages/` device pages, `server/src/routes/devices*`.

### 2.3 Stale Devices
![Stale Devices](screenshots/pages/03-stale-devices.png)

Devices not seen for a configurable number of days, with export. Backed by the stale-devices service and the scheduled stale-devices report.

### 2.4 Application Security (sidebar title "ManageEngine App Inventory")
![Application Security, Windows](screenshots/pages/04-application-security.png)

![Application Security, macOS](screenshots/pages/04b-application-security-macos.png)

One view for Windows and macOS apps: installed vs latest verified version, tiles (apps discovered, update available, package required, packaged — ready to deploy), filters, CSV/Excel export and Send to Slack. Intune detected-apps reads are paced and resumable to avoid Graph 429s; a first sync can take minutes. Code: `src/pages/AppIntelligencePage.tsx`, `server/src/services/appIntel/`.

### 2.5 App Guardian
![App Guardian](screenshots/pages/05-app-guardian.png)

Standalone Mac application-version view kept as a separate copy (it is intended to be built independently). Code: `src/pages/AppGuardianPage.tsx`.

### 2.6 Patch Operations
![Patch Operations](screenshots/pages/06-patch-operations.png)

Endpoint Central patch status per system, missing-patch detail, and scan/remediate actions (capability `patchOps.scanRemediate`, available to Helpdesk). Code: `server/src/services/endpointCentralPatch.ts`, `patchOperations.ts`.

### 2.7 Security Posture
![Security Posture](screenshots/pages/07-security-posture.png)

Encryption, protection and risk pillars derived from device data.

### 2.8 Role Activity Audit
![Role Activity Audit](screenshots/pages/08-role-activity-audit.png)

Privileged-role activity pulled from Microsoft sources.

### 2.9 Policy Conflicts
![Policy Conflicts](screenshots/pages/09-policy-conflicts.png)

Conflicting Intune policy assignments. Not available to Helpdesk by default.

### 2.10 Risk Scoring
![Risk Scoring](screenshots/pages/10-risk-scoring.png)

Per-device risk score from combined signals. Not available to Helpdesk by default.

### 2.11 Automation
![Automation](screenshots/pages/11-automation.png)

Rule builder: triggers (including `agent_missing` / `agent_stale`), actions (Slack, Jira, runbook, script, report, notification, Teams) and execution history. Rules and the last 500 executions persist in `DATA_DIR/automations.json`. Code: `server/src/services/automationEngine.ts`.

### 2.12 Reports & Analytics
![Reports and Analytics](screenshots/pages/12-reports-analytics.png)

On-demand reports and exports.

### 2.13 Scheduled Reports
![Scheduled Reports](screenshots/pages/13-scheduled-reports.png)

Cron + timezone schedules that post reports to Slack channels; run history. Runner interval 60 s.

### 2.14 Settings
![Settings](screenshots/pages/14-settings.png)

Integrations, roles and permissions, notification schedules (global-admin and `roles.manage` gated).

### 2.15 Documentation
![Documentation](screenshots/pages/15-documentation.png)

In-app user guide (overview, quick start, onboarding, feature guides, configuration, troubleshooting, FAQ).

## 3. Re-capturing the screenshots

1. Build and run a throwaway instance (do not touch production data):
   `npx vite build`, then from `server/`: `PORT=4100 AUTH_PASSWORDLESS=true AUTH_ALLOWED_EMAILS=<your e-mail> DATA_DIR=/tmp/ito-shot-data npx tsx src/index.ts`.
2. Sign in by `POST /api/auth/session {"email": …}`, store `{token, user}` in `localStorage['ito.session']`, then click each sidebar item and screenshot with Playwright (already in `node_modules`).
3. Wait for "Syncing…" to clear on Application Security before capturing; crop very long tables.
