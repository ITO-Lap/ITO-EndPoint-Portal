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

### Handing over the project
- [**Handover Manual**](HANDOVER-MANUAL.md) — state of the project, setup, deployment, operations, troubleshooting, checklist ([Word version](ITO-Endpoint-Handover-Manual.docx)) ← **Start here if you are the new owner**

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
- [Jira](04-integrations/JIRA.md) · [Confluence](04-integrations/CONFLUENCE.md)

### Feature deep dives
- [Endpoint Operations Copilot](07-features/AI-COPILOT.md) — global chat-based AI assistant with tool-calling over real data + confirmed write actions ← **New**
- [Dashboard](07-features/DASHBOARD.md)
- [Mac Devices (ManageEngine)](07-features/mac-devices.md)
- [Mac Fleet Reports](07-features/MAC-FLEET-REPORTS.md) ← **New**
- [Intune Devices Page](07-features/ENDPOINT-PAGES.md) ← **New**
- [Automation Engine](07-features/AUTOMATION-ENGINE.md) ← **New**
- [Entra Intelligence Dashboard](07-features/ENTRA-INTELLIGENCE.md) ← **New**
- [Users Management](07-features/USERS.md)

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
| **Auth** | None — the sign-in screen was removed; the app always runs as Global Admin (see `App.tsx`) |
| **Default mode** | All data is mocked when no credentials are configured |

---

## Complete Page Map

Sidebar navigation groups and pages, from `navItems` in `src/data/dashboardData.ts` and the page
router in `src/App.tsx`. A few pages (Entra Intelligence, Mac Fleet Reports, User Intelligence,
Documentation, Scheduled Reports) are reached by drill-down from another page rather than a direct
sidebar entry, and are noted as such below.

### Overview

| Page | Route key | Description |
|---|---|---|
| Dashboard | `Dashboard` | Compliance stats, donut chart, issue breakdown, selected device detail, AI runbook |

### Endpoint Management

| Page | Route key | Description |
|---|---|---|
| Mac Devices | `Mac Devices` | ManageEngine macOS fleet — devices, apps, security, automation, reports |
| Intune Devices | `Intune Devices` | Microsoft Intune Windows/cross-platform device dashboard |
| ManageEngine App Inventory | `ManageEngine App Inventory` | Cross-platform app catalog + install counts |
| Mac Fleet Reports | `Mac Fleet Reports` | KPI-card fleet report, reached from Mac Devices — see [MAC-FLEET-REPORTS.md](07-features/MAC-FLEET-REPORTS.md) |

### Security & Compliance

| Page | Route key | Description |
|---|---|---|
| Security Posture | `Security Posture` | Fleet-wide security scoring |
| Role Activity Audit | `Role Activity Audit` | Admin/role action audit trail |
| Security Policies | `Security Policies` | Compliance policy configuration |

### Users & Identity

| Page | Route key | Description |
|---|---|---|
| Users | `Users` | User management with risk scoring and device associations |
| User Intelligence | `User Intelligence` | Per-user drill-down, reached from Users |

### Automation

| Page | Route key | Description |
|---|---|---|
| Automation | `Automation` | Rule-based automation engine (triggers → conditions → actions), can create Jira tickets/Slack alerts |

### Analytics & Reports

| Page | Route key | Description |
|---|---|---|
| Reports & Analytics | `Reports & Analytics` | Report hub |
| Report Builder | `Report Builder` | Custom report builder |
| Scheduled Reports | `Scheduled Reports` | Scheduled report delivery, reached from Reports & Analytics |

### Intelligence Platform

| Page | Route key | Description |
|---|---|---|
| Intelligence Hub | `Intelligence Hub` | Cross-cutting intelligence dashboard |
| Compliance Intelligence | `Compliance Intelligence` | AI-generated executive compliance summary |
| Policy Conflicts | `Policy Conflicts` | Conflicting/overlapping policy detection |
| Risk Scoring | `Risk Scoring` | Per-device risk scores, AI narrative, Jira ticket + Confluence article actions |
| Report Builder | `Report Builder` | (see Analytics & Reports) |
| Audit Log | `Audit Log` | Intune audit log export/schedule |
| Entra Intelligence | `Entra Intelligence` | Microsoft Entra/Intune device platform distribution + stale check-in — see [ENTRA-INTELLIGENCE.md](07-features/ENTRA-INTELLIGENCE.md) |

### Platform

| Page | Route key | Description |
|---|---|---|
| Settings | `Settings` | Integrations · Compliance · Automation · Security · Notifications · Data |
| Documentation | `Documentation` | In-app docs viewer, reached from the header |

### Cross-cutting

| Feature | Description |
|---|---|
| Endpoint Operations Copilot | Global AI chat panel with tool-calling over real data + confirmed write actions (Jira tickets, automation rule test-runs) — see [AI-COPILOT.md](07-features/AI-COPILOT.md) |

---

## Recent Changes

A "differentiation refactor" (mid-2026) removed every simulated/fabricated/plain-portal-duplicate
feature from the app — including Runbooks-as-a-page, Remote Scripts, Diagnostics, Vulnerabilities,
EDR, Device Lookup, Windows Devices, the standalone App Deployment breakdown, the Activity Log page,
the Recent Activity feed, Open Issues/Filtered Devices pages, the Profile page, Smart Diagnostics,
Relationship Explorer, IRU Patch Report, App Fragmentation, Multi-Tenant management, several Entra
dashboard widgets/tables, and several report templates. Kandji was removed entirely in favor of
ManageEngine for Mac devices. The Endpoint Operations Copilot (AI chat panel with Jira/Confluence
escalation) was added in its place. See `git log` for commits `41ea0d6`, `e56fa9e`, `cf6bd45`,
`9fb48df` for the authoritative record.

### Mac Fleet Reports (inside Mac Devices → Fleet Reports)
- KPI cards across Fleet Overview, Patch Health, Device Lifecycle, and OS Health groups
- Click any card → modal with searchable, sortable, paginated device table
- Excel export per KPI
- AI Insights panel — fleet health summary + actionable recommendations
- See: [Mac Fleet Reports Feature Guide](07-features/MAC-FLEET-REPORTS.md)

### Entra Intelligence Dashboard
- Microsoft Graph API integration (real data when Entra ID/Intune configured)
- Devices-by-platform breakdown + stale check-in table
- See: [Entra Intelligence Feature Guide](07-features/ENTRA-INTELLIGENCE.md)

### Endpoint Operations Copilot
- Global chat panel with tool-calling over real device/user/automation data
- Write actions (Jira ticket creation, automation rule test-runs) require explicit user confirmation
- See: [AI Copilot Feature Guide](07-features/AI-COPILOT.md)

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
