# Feature Documentation

Each feature in the dashboard has its own deep-dive doc.

---

## Features

| Feature | Page | Status | Doc |
|---|---|---|---|
| Dashboard | `Dashboard` | Live | [DASHBOARD.md](DASHBOARD.md) |
| Mac Devices (ManageEngine) | `Mac Devices` | Live | [mac-devices.md](mac-devices.md) |
| Mac Fleet Reports | `Mac Fleet Reports` | Live | [MAC-FLEET-REPORTS.md](MAC-FLEET-REPORTS.md) |
| Intune Devices | `Intune Devices` | Live | [ENDPOINT-PAGES.md](ENDPOINT-PAGES.md) |
| Stale Devices | `Stale Devices` | Live | [STALE-DEVICES.md](STALE-DEVICES.md) |
| App Intelligence | `ManageEngine App Inventory` → **Verified updates** tab | Live | [APP-INTELLIGENCE.md](APP-INTELLIGENCE.md) |
| Automation Engine | `Automation` | Live | [AUTOMATION-ENGINE.md](AUTOMATION-ENGINE.md) |
| Entra Intelligence | `Entra Intelligence` | Live | [ENTRA-INTELLIGENCE.md](ENTRA-INTELLIGENCE.md) |
| Endpoint Operations Copilot | (cross-cutting) | Live | [AI-COPILOT.md](AI-COPILOT.md) |
| Settings | `Settings` | Live | — |
| Documentation | `Documentation` | Live | — |

---

## Feature overview

### Dashboard
The main command centre. Shows compliance stats, a donut chart, issue breakdown, selected device detail, and an AI-recommended runbook. Stats refresh every 30 seconds from the live API.

### Mac Devices / Mac Fleet Reports
ManageEngine-backed macOS fleet management — device inventory, apps, security, automation rules, and a KPI-card fleet report with drill-down device tables and Excel export.

### Intune Devices
Windows/cross-platform device dashboard sourced from Microsoft Intune, with KPI cards, a device table, compliance/security breakdowns, platform-scoped automation rules, and reports.

### Users
Browse all user accounts with risk scoring. View each user's assigned devices, recent security activity, Jira tickets, and data sources.

### Automation Engine
Rule-based automation: triggers → conditions → actions (Jira ticket creation, Slack alerts, runbook/script execution, notifications). Rules can be manually test-run.

### Entra Intelligence
Microsoft Graph-backed dashboard showing device platform distribution and stale check-in devices for the Entra/Intune-managed fleet.

### Endpoint Operations Copilot
Cross-cutting AI feature — a global chat panel (GPT-4o-mini via tool/function calling) with real data lookups and confirmed write actions (e.g. creating a Jira ticket, running an automation rule).

### Settings
Full configuration hub: integration credentials, notification preferences, compliance policy settings, automation rules, security settings, data privacy, and danger zone actions.
