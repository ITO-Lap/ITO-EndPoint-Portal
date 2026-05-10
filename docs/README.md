# ITO Endpoint AI Copilot — Documentation

> **Version:** 2.0 | **Last updated:** May 2026 | **Stack:** React 19 · Express · TypeScript · Tailwind 4

Welcome to the complete documentation for the ITO Endpoint AI Copilot. Every topic is organized into its own folder so you can navigate directly to what you need.

---

## Documentation Map

```
docs/
├── 01-overview/        What the project is, how it works, tech choices
├── 02-frontend/        React components, hooks, routing, UI patterns
├── 03-backend/         API endpoints, services, middleware
├── 04-integrations/    Setup guides for Intune, Kandji, ManageEngine, OpenAI
├── 05-data-models/     TypeScript types & data shapes
├── 06-development/     Local setup, environment vars, quick-mod cookbook
├── 07-features/        Feature-by-feature deep dives
└── ROLES.md            Roles & permissions matrix
```

---

## Quick Navigation

### I want to understand the project
- [Project Overview](01-overview/README.md) — what it does, who uses it, feature map
- [Architecture](01-overview/ARCHITECTURE.md) — system diagram, data flow
- [Tech Stack](01-overview/TECH-STACK.md) — why each technology was chosen

### I want to set up my dev environment
- [Local Setup](06-development/SETUP.md) — install, run, mock data mode
- [Environment Variables](06-development/README.md#environment-variables) — all env vars explained

### I want to build or modify something
- [Quick Modifications Cookbook](06-development/QUICK-MODS.md) — recipes for the most common changes
- [Frontend Components](02-frontend/COMPONENTS.md) — every component, its props, where it lives
- [Custom Hooks](02-frontend/HOOKS.md) — all hooks with usage examples
- [API Reference](03-backend/API-REFERENCE.md) — every endpoint, request/response shape

### I want to connect a real data source
- [Microsoft Intune](04-integrations/INTUNE.md)
- [Kandji](04-integrations/KANDJI.md)
- [ManageEngine](04-integrations/MANAGEENGINE.md)
- [OpenAI (AI Copilot)](04-integrations/OPENAI.md)

### I want to understand a specific feature
- [Dashboard](07-features/DASHBOARD.md)
- [Device Lookup](07-features/DEVICE-LOOKUP.md)
- [Users Management](07-features/USERS.md)
- [Runbooks](07-features/RUNBOOKS.md)
- [AI Copilot](07-features/AI-COPILOT.md)

### I want to understand roles & access control
- [Roles & Permissions](ROLES.md)

---

## Project at a Glance

| What | Detail |
|---|---|
| **Type** | Enterprise IT endpoint management dashboard |
| **Users** | Global Admin, IT Admin, Helpdesk |
| **MDM Sources** | Microsoft Intune, Kandji, ManageEngine |
| **AI** | OpenAI GPT-4o-mini for device analysis + chat |
| **Frontend** | React 19, TypeScript, Tailwind CSS v4, Vite |
| **Backend** | Express.js, TypeScript, Node.js |
| **Auth** | Local auth gate with role-based access (localStorage) |
| **Default mode** | All data is mocked when no credentials are set |

---

## Page Map

| Page | Route key | Description |
|---|---|---|
| Dashboard | `Dashboard` | Compliance overview, stat cards, device summary, activity |
| Device Lookup | `Device Lookup` | Search + drill into any device |
| Users | `Users` | User management with risk scoring |
| Runbooks | `Runbooks` | Automated remediation playbooks |
| Diagnostics | `Diagnostics` | Device health telemetry (placeholder) |
| Reports & Analytics | `Reports & Analytics` | Compliance trend reports (placeholder) |
| Activity Log | `Activity Log` | Full audit trail (placeholder) |
| Settings | `Settings` | Integrations, notifications, security, danger zone |
| Documentation | `Documentation` | In-app docs viewer |
| Profile | `Profile` | User profile page |

---

*For questions: it-support@zinnia.com*
