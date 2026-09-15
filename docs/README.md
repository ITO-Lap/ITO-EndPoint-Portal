# ITO Endpoint AI Copilot — Documentation Master Index

> **Version:** 3.0 | **Last updated:** Jun 2026 | **Stack:** React 19 · Express · TypeScript · Tailwind 4  
> **Product:** ITO Endpoint — Built on the Zinnia Platform

Welcome to the complete documentation for ITO Endpoint AI Copilot. Navigate directly to what you need.

---

## Documentation Map

```
docs/
├── 01-overview/           What the project is, how it works, tech choices
├── 02-frontend/           React components, hooks, routing, UI patterns
├── 03-backend/            API endpoints, services, middleware
├── 04-integrations/       Setup guides for every integration
├── 05-data-models/        TypeScript types & data shapes
├── 06-development/        Local setup, environment vars, quick-mod cookbook
├── 07-features/           Feature-by-feature deep dives (all current features)
├── 08-design/             Design system, UI guidelines, brand tokens
├── EDR-User-Guide.md      EDR UX design guide (wireframes + IA decision)
├── Mac-Fleet-Reports-Design-Guide.md  Fleet reporting design guide (wireframes + KPI spec)
└── ROLES.md               Roles & permissions matrix
```

---

## Quick Navigation

### Understand the project
- [Project Overview](01-overview/README.md) — what it does, who uses it, feature map
- [Architecture](01-overview/ARCHITECTURE.md) — system diagram, data flow
- [Tech Stack](01-overview/TECH-STACK.md) — why each technology was chosen
- [Roles & Permissions](ROLES.md) — access control matrix

### Set up your dev environment
- [Local Setup](06-development/SETUP.md) — install, run, mock data mode
- [Environment Variables](06-development/README.md) — all env vars explained
- [Quick Modifications Cookbook](06-development/QUICK-MODS.md) — common change recipes
- [IIS Deployment Guide](06-development/IIS-DEPLOYMENT.md) — step-by-step, no prior IIS experience needed ← **New**

### Build or modify something
- [Frontend Components](02-frontend/COMPONENTS.md) — every component, props, location
- [Custom Hooks](02-frontend/HOOKS.md) — all hooks with examples
- [API Reference](03-backend/API-REFERENCE.md) — every endpoint with request/response

### Connect a real data source
- [Microsoft Intune](04-integrations/INTUNE.md)
- [Intune Audit Logs](04-integrations/INTUNE-AUDIT-LOGS.md)
- [Intune Scripts & Configurations](04-integrations/INTUNE-SCRIPTS-CONFIGURATIONS.md)
- [Security Policies](04-integrations/SECURITY-POLICIES.md) ← **New**
- [ManageEngine (macOS + cross-platform MDM)](04-integrations/MANAGEENGINE.md)
- [Microsoft Entra ID](04-integrations/ENTRA.md)
- [Slack](04-integrations/SLACK.md)
- [Jira & Confluence](04-integrations/JIRA.md)

### Feature deep dives
- [Dashboard](07-features/DASHBOARD.md)
- [Device Lookup](07-features/DEVICE-LOOKUP.md)
- [Mac Devices (ManageEngine)](07-features/MAC-DEVICES.md)
- [Mac Fleet Reports](07-features/MAC-FLEET-REPORTS.md) ← **New**
- [Intune / Windows / ManageEngine Pages](07-features/ENDPOINT-PAGES.md) ← **New**
- [Automation Engine](07-features/AUTOMATION-ENGINE.md) ← **New**
- [Entra Intelligence Dashboard](07-features/ENTRA-INTELLIGENCE.md) ← **New**
- [EDR — Endpoint Detection & Response](07-features/EDR.md) ← **New (design spec)**
- [Users Management](07-features/USERS.md)
- [Runbooks](07-features/RUNBOOKS.md)

### Design & UI guidelines
- [Design System](08-design/DESIGN-SYSTEM.md) ← **New**

---

## Project at a Glance

| What | Detail |
|---|---|
| **Type** | Enterprise IT endpoint management dashboard |
| **Users** | Global Admin · IT Admin · Helpdesk |
| **MDM Sources** | Microsoft Intune · ManageEngine |
| **Identity** | Microsoft Entra ID (Azure AD) |
| **Comms** | Slack (audit logs + notifications) |
| **ITSM** | Jira · Confluence |
| **Frontend** | React 19 · TypeScript · Tailwind CSS v4 · Vite |
| **Backend** | Express.js · TypeScript · Node.js |
| **Auth** | Role-based local auth gate (Global Admin / IT Admin / Helpdesk) |
| **Default mode** | All data is mocked when no credentials are configured |

---

## Complete Page Map

### Endpoint Management

| Page | Route key | Description |
|---|---|---|
| Device Lookup | `Device Lookup` | Cross-MDM device search + drill-down |
| Mac Devices | `Mac Devices` | ManageEngine macOS fleet — devices, apps, security, automation, reports, IRU patch, fleet reports |
| Intune Devices | `Intune Devices` | Microsoft Intune Windows/cross-platform device dashboard |
| Windows Devices | `Windows Devices` | All Windows devices across Intune + ManageEngine |
| ManageEngine Devices | `ManageEngine Devices` | ManageEngine endpoint + patch management |
| Open Issues | `Open Issues` | Non-compliant + warning devices requiring action |

### Security & Compliance

| Page | Route key | Description |
|---|---|---|
| Security Posture | `Security Posture` | Fleet-wide security scoring + EDR/Defender/FileVault status |
| Vulnerabilities | `Vulnerabilities` | CVE tracking and remediation |

### Detection & Response *(design-ready, pending implementation)*

| Page | Route key | Description |
|---|---|---|
| EDR Overview | — | Active incidents, detections, MTTR dashboard |
| Detections | — | Real-time detection stream (SOC triage queue) |
| Incidents | — | Security incident case management |
| Response Center | — | Containment and remediation action execution |

### Users & Identity

| Page | Route key | Description |
|---|---|---|
| Users | `Users` | User management with risk scoring and device associations |

### Automation

| Page | Route key | Description |
|---|---|---|
| Automation | `Automation` | Rule-based automation engine (triggers → conditions → actions) |
| Runbooks | `Runbooks` | Remediation runbooks + static library |
| Remote Scripts | `Remote Scripts` | Script library + remote execution + history |

### Analytics & Reports

| Page | Route key | Description |
|---|---|---|
| Reports & Analytics | `Reports & Analytics` | Compliance trend reports |
| Activity Log | `Activity Log` | Full device activity audit trail |
| Diagnostics | `Diagnostics` | Integration health + infrastructure status |

### Platform

| Page | Route key | Description |
|---|---|---|
| Settings | `Settings` | Integrations · Roles · Compliance · Automation · Security · Notifications · Data |
| Documentation | `Documentation` | In-app docs viewer |
| Profile | `Profile` | User profile and preferences |

### New Intelligence Dashboards

| Page | Route key | Description |
|---|---|---|
| Entra Intelligence | `Entra Intelligence` | Microsoft Entra/Intune resource intelligence (devices, users, relationships, helpdesk, AI copilot) |

---

## New Features Added (v3.0)

### Mac Devices — New Tabs
- **Automation** tab — 5 mac-specific automation rules (FileVault, CrowdStrike, EOL nudge, etc.)
- **Fleet Reports** tab — 18 clickable KPI cards with drill-down data tables + Excel export

### Mac Fleet Reports (inside Mac Devices → Fleet Reports)
- 18 KPI cards across 4 groups: Fleet Overview, Patch Health, Device Lifecycle, OS Health
- Click any card → modal with searchable, sortable, paginated device table
- Excel export per KPI with 3 sheets: Summary, Device Details, Recommendations
- AI Insights panel — always visible; fleet health summary + actionable recommendations
- See: [Mac Fleet Reports Feature Guide](07-features/MAC-FLEET-REPORTS.md)

### Entra Intelligence Dashboard
- Microsoft Graph API integration (real data when Entra ID configured)
- 13 KPI cards, compliance trend chart, platform distribution, risky users table
- Relationship Explorer — User → Device → Policy → App visual chain
- Helpdesk Quick Lookup — search device/user, see compliance, run Sync/Diagnose/Ticket
- AI Copilot panel — ask questions about your Entra/Intune environment
- See: [Entra Intelligence Feature Guide](07-features/ENTRA-INTELLIGENCE.md)

### Platform-Specific Endpoint Pages
- **Intune Devices** — Windows device inventory, BitLocker, Defender, compliance, 5 automation rules
- **Windows Devices** — Cross-source Windows fleet, patch age distribution, 5 automation rules
- **ManageEngine Devices** — Cross-platform inventory, patch distribution, 5 automation rules
- See: [Endpoint Pages Feature Guide](07-features/ENDPOINT-PAGES.md)

### Navigation Architecture
- Grouped sidebar: Overview · Endpoint Management · Security & Compliance · Users & Identity · **Automation** · Analytics & Reports · Platform
- Automation group has distinct orange accent and collapses independently
- Badge counts on active incident nav items

### Design System — Apple Glass / Zinnia Brand
- Water-glow hover effect on all interactive elements (`water-glow`, `water-glow-card`)
- Zinnia brand logo (3-petal teardrop) — `ZinniaIcon`, `ZinniaHorizontal`, `ZinniaVertical`, `ZinniaBadge`
- Pearl gradient animated background
- See: [Design System](08-design/DESIGN-SYSTEM.md)

### Slack Health Monitor
- Background health polling every 5 minutes
- Exponential backoff retry (10s → 30s → 90s)
- "Reconnect Now" button in Settings when connection drops
- `POST /api/slack/reconnect` endpoint

### OpenAI Integration Status
- OpenAI (GPT-4o-mini) is **still live** — configured via `OPENAI_API_KEY` in Settings → Integrations, used by `server/src/services/openai.ts`, `riskScoring.ts`, and the `intelligence`/`macLogs`/`automations` routes for device analysis, chat, risk scoring, and root-cause summaries
- Runbooks fall back to the rule-based engine when OpenAI isn't configured, but do **not** replace it — both paths coexist
- The now-removed `useAiAnalysis` hook (a dead no-op stub) and the unmounted `server/src/routes/ai.ts` route were cleaned up as unused leftovers, not evidence of OpenAI removal

---

*Last updated: Jun 2026 | ITO Endpoint v3.0 | Zinnia Technologies*
