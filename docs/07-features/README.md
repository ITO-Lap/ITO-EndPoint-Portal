# Feature Documentation

Each feature in the dashboard has its own deep-dive doc.

---

## Features

| Feature | Page | Status | Doc |
|---|---|---|---|
| Dashboard | `Dashboard` | Live | [DASHBOARD.md](DASHBOARD.md) |
| Device Lookup | `Device Lookup` | Live | [DEVICE-LOOKUP.md](DEVICE-LOOKUP.md) |
| Users | `Users` | Live | [USERS.md](USERS.md) |
| Runbooks | `Runbooks` | Placeholder | [RUNBOOKS.md](RUNBOOKS.md) |
| AI Copilot | (cross-cutting) | Live | [AI-COPILOT.md](AI-COPILOT.md) |
| Diagnostics | `Diagnostics` | Placeholder | — |
| Reports & Analytics | `Reports & Analytics` | Placeholder | — |
| Activity Log | `Activity Log` | Placeholder | — |
| Settings | `Settings` | Live | — |
| Profile | `Profile` | Live | — |
| Documentation | `Documentation` | Live | — |

"Placeholder" pages show a `<PlaceholderPage>` component with a coming-soon UI.

---

## Feature overview

### Dashboard
The main command centre. Shows compliance stats, a donut chart, issue breakdown, selected device detail, AI runbook, and a recent activity feed. Stats refresh every 30 seconds from the live API.

### Device Lookup
Search any managed device across all connected sources by name, email, or serial number. Filter by source, compliance state, or platform. Click a device to see the full detail panel — hardware, network, security profile, installed apps, and LAPS info.

### Users
Browse all user accounts with risk scoring. View each user's assigned devices, recent security activity, Jira tickets, and data sources. Role-aware: Helpdesk cannot access this page.

### Runbooks
Library of remediation playbooks for common compliance issues. Each runbook shows step-by-step instructions, automation capability, and escalation guidance.

### AI Copilot
Cross-cutting AI feature. Available as deep analysis per device (`/api/ai/analyze`) and as a freeform IT assistant chat (`/api/ai/chat`). Requires OpenAI API key.

### Settings
Full configuration hub: integration credentials, notification preferences, compliance policy settings, automation rules, security settings, data privacy, and danger zone actions.
