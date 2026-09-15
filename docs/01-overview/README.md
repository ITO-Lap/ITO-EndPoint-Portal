# Project Overview

**ITO Endpoint AI Copilot** is a unified enterprise IT endpoint management dashboard. It aggregates device data from multiple MDM platforms, surfaces compliance issues, and delivers AI-powered remediation guidance — all through a single, role-aware UI.

---

## Problem it solves

IT teams managing hundreds or thousands of devices across multiple platforms (Windows via Intune, Macs and cross-platform via ManageEngine) traditionally had to:
- Log into 2+ separate admin portals
- Manually correlate compliance data across sources
- Write remediation instructions from scratch for each incident

ITO Endpoint replaces that with one dashboard that shows everything, flags problems automatically, and suggests runbooks backed by AI.

---

## Who uses it

| Role | What they use it for |
|---|---|
| **Global Admin** | Configure integrations, manage users, set org-wide policies |
| **IT Admin** | Daily compliance monitoring, device investigations, running remediation runbooks |
| **Helpdesk** | Looking up device status to answer user support tickets |

See [ROLES.md](../ROLES.md) for the full permissions matrix.

---

## Feature map

```
ITO Endpoint AI Copilot
│
├── Dashboard
│   ├── Stat cards (total, compliant, non-compliant, Mac, open issues)
│   ├── Compliance donut chart
│   ├── Issue category breakdown
│   ├── Device summary panel (selected device)
│   ├── Compliance detail rows
│   ├── AI runbook recommendation (card)
│   └── Security profile panel
│
├── Mac Devices / Intune Devices / ManageEngine App Inventory
│   └── Per-source device inventory, compliance, security, automation, reports
│
├── Users
│   ├── User list with risk scoring
│   ├── User detail drawer (devices, activity, Jira tickets)
│   └── User Intelligence drill-down
│
├── Risk Scoring / Compliance Intelligence / Policy Conflicts
│   └── AI-generated narrative, executive summary, and conflict detection over live devices/policies
│
├── Automation
│   └── Rule-based engine: triggers → conditions → actions (Jira, Slack, runbooks, scripts)
│
├── Entra Intelligence
│   └── Platform distribution + stale check-in from Microsoft Graph
│
├── Settings
│   ├── Integration configuration (push credentials, sync)
│   ├── Notification preferences (quiet hours)
│   ├── Security settings
│   ├── Data & Privacy
│   └── Danger Zone
│
└── Endpoint Operations Copilot (global chat panel)
    └── POST /api/copilot/* — tool-calling AI assistant with confirmed write actions
```

There is no dedicated Device Lookup page, standalone Runbooks library page, or `/api/ai/*` route
anymore — see `docs/README.md` → "Recent Changes" for the full list of what was removed in the
differentiation refactor, and [OPENAI.md](../04-integrations/OPENAI.md) for where OpenAI is actually
called from today.

---

## Data sources

| Source | Protocol | Auth method |
|---|---|---|
| Microsoft Intune | Microsoft Graph REST API | OAuth2 client credentials |
| ManageEngine | REST API | API key |
| OpenAI | OpenAI Chat Completions | API key |
| Jira / Confluence | REST API | Basic auth (email + API token) |

When no MDM credentials are set, `/api/devices` returns an empty device list rather than falling
back to mock devices (see [Architecture](ARCHITECTURE.md)). Some other dashboards (e.g. Entra
Intelligence) still have their own independent demo/mock datasets.

---

## Further reading

- [Architecture](ARCHITECTURE.md) — system diagram and request flow
- [Tech Stack](TECH-STACK.md) — technology decisions and rationale
