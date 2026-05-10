# Project Overview

**ITO Endpoint AI Copilot** is a unified enterprise IT endpoint management dashboard. It aggregates device data from multiple MDM platforms, surfaces compliance issues, and delivers AI-powered remediation guidance — all through a single, role-aware UI.

---

## Problem it solves

IT teams managing hundreds or thousands of devices across multiple platforms (Windows via Intune, Macs via Kandji, cross-platform via ManageEngine) traditionally had to:
- Log into 3+ separate admin portals
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
│   ├── AI runbook recommendations
│   ├── Security profile panel
│   └── Recent activity feed
│
├── Device Lookup
│   ├── Search by name / email / serial
│   ├── Advanced filters (source, compliance state, platform)
│   ├── Device detail side panel
│   └── "View in Dashboard" action
│
├── Users
│   ├── User list with risk scoring
│   ├── User detail drawer (devices, activity, Jira tickets)
│   └── Role management
│
├── Runbooks
│   ├── Runbook library cards
│   └── Step-by-step execution modal
│
├── Settings
│   ├── Integration configuration (push credentials, sync)
│   ├── Notification preferences (quiet hours)
│   ├── Security settings
│   ├── Data & Privacy
│   └── Danger Zone
│
└── AI Copilot
    ├── POST /api/ai/analyze — deep compliance analysis per device
    └── POST /api/ai/chat   — freeform IT assistant chat
```

---

## Data sources

| Source | Protocol | Auth method |
|---|---|---|
| Microsoft Intune | Microsoft Graph REST API | OAuth2 client credentials |
| Kandji | Kandji REST API | Bearer token |
| ManageEngine | REST API | API key |
| OpenAI | OpenAI Chat Completions | API key |

When no credentials are set in `.env`, every data source falls back to built-in mock data automatically.

---

## Further reading

- [Architecture](ARCHITECTURE.md) — system diagram and request flow
- [Tech Stack](TECH-STACK.md) — technology decisions and rationale
