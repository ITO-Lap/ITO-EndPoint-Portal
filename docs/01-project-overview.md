# 01 — Project Overview

> Part of the [documentation set](../README.md). Verification labels used throughout: **Verified** (read in code/config), **Inferred** (reasonable reading of code, not proven), **Not verified** (cannot be confirmed from the repository; see [15 — Known gaps](15-known-gaps-and-verification-checklist.md)).

## 1. What the project is

**ITO Endpoint AI Copilot** (package name `endpoint-ai-copilot`, branded "ITO Endpoint", built on the Zinnia platform) is an internal web portal for Zinnia's IT Operations team. It gives one place to see and act on the state of the company's managed endpoints (Windows and macOS) by combining data from several management systems that otherwise have separate consoles. *(Verified: `package.json`, `docs/README.md`, `src/App.tsx`.)*

### Business problem

| Problem | How the portal addresses it | Where |
|---|---|---|
| Device data is split between **Microsoft Intune** and **ManageEngine Endpoint Central** | Both sources are fetched, normalised to one `Device` shape and shown together | [`server/src/routes/devices.ts`](../server/src/routes/devices.ts), [`src/api/index.ts`](../src/api/index.ts) |
| Stale, non-compliant, unencrypted or unpatched devices are found late | Dashboard cards, Stale Devices, Security Posture, Patch Operations, Risk Scoring | [04 — Modules](04-modules-and-code-logic.md) |
| Application versions are not tracked against vendor releases | Application Security & Compliance (App Intelligence) compares installed vs. latest verified versions and CVEs | [`server/src/services/appIntel/`](../server/src/services/appIntel/) |
| Reporting is manual | Scheduled reports and a weekly fleet digest are posted to Slack, with Excel/CSV/PDF/PPTX exports | `scheduledReports`, `fleetDigest` |
| Admin-role changes and policy drift are hard to audit | Role Activity Audit, Policy Conflicts | `roleActivity`, `securityPolicies` |
| Repetitive triage | Automation rules (alert/ticket/report) and an AI Copilot | `automationEngine`, `copilotEngine` |

## 2. Users and use cases

| User | Typical use | App role |
|---|---|---|
| IT Operations lead / platform owner | Whole-fleet health, roles, integrations, schedules | **Global Admin** |
| Endpoint engineer | Patch operations, automation rules, reports, app updates | **IT Admin** (same page access as Global Admin; see [06](06-authentication-rbac-security.md)) |
| Service desk / Desktop team | Device lookup, stale devices, patching of critical items | **Helpdesk** (reduced page set) |
| Custom roles | Any mix of page and capability keys | Custom roles (Settings → Roles & Permissions) |

Roles are described in [`docs/ROLES.md`](ROLES.md) (older, written May 2026) and **re-derived from code** in [06](06-authentication-rbac-security.md). Where the two differ, the code-based document wins.

## 3. Scope and supported platforms

| Area | Supported | Evidence |
|---|---|---|
| Device platforms | Windows and macOS are first-class. The `Device` type also allows Linux, Android, iOS | `server/src/types.ts` (`Device.platform`) |
| Device sources | Microsoft Intune (Graph v1.0), ManageEngine MDM On-Demand and Endpoint Central (Zoho OAuth) | `services/intune.ts`, `services/manageEngine.ts`, `services/endpointCentral*.ts` |
| Identity | Microsoft Entra ID sign-in (OAuth2 authorization code), optional email/password sign-in for development | `routes/auth.ts`, `services/session.ts` |
| Notifications | Slack (bot token or incoming webhook), Microsoft Teams webhook, Jira issue creation | `services/slack.ts`, `services/teams.ts`, `services/jira.ts` |
| AI | OpenAI (automation rule builder) and Google Gemini (Copilot) | `services/openai.ts`, `services/copilotEngine.ts` |
| Hosting | Single Node process serving API + built SPA, behind IIS reverse proxy as a Windows Service | `deploy/iis/*`, `server/src/index.ts` |
| Kandji | **No code references found.** Not supported | `grep -ri kandji` over `src/` and `server/src/` returned nothing |
| Coolify / Docker / CI pipelines | **No Dockerfile, Coolify file or `.github/workflows` found** | repository listing |

### Known limitations (summary — full list in [10](10-risks-limitations-technical-debt.md))

- Write actions against devices are limited: Endpoint Central patch scan/install through a confirm flow, and Entra device sync/diagnose endpoints. Most of the portal is read-only. *(Verified in route list.)*
- Server-side role enforcement is **partial**: many write routes only require a valid session. See [06 §6](06-authentication-rbac-security.md) and [10](10-risks-limitations-technical-debt.md).
- There is no migration tool for PostgreSQL; the schema is applied by hand from `server/src/db/schema.sql`.
- Several integrations are marked in code as not validated against a live tenant (for example the SharePoint puller). See [05](05-api-integrations.md).

## 4. High-level architecture

```mermaid
flowchart LR
  user([Browser<br/>React SPA]) -->|HTTPS| iis[IIS reverse proxy<br/>URL Rewrite + ARR]
  iis -->|http 127.0.0.1:4000| node[Node.js Express process<br/>API + static SPA]
  node -->|OAuth2 + Graph v1.0| graph[(Microsoft Graph<br/>Intune / Entra)]
  node -->|Zoho OAuth + REST| me[(ManageEngine<br/>MDM + Endpoint Central)]
  node -->|Web API| slack[(Slack)]
  node --> jira[(Jira / Confluence)]
  node --> ai[(OpenAI / Gemini)]
  node --> ext[(winget, Homebrew, NVD, GitHub)]
  node -->|DATABASE_URL optional| pg[(PostgreSQL)]
  node -->|DATA_DIR files| disk[(JSON files and caches)]
```

More diagrams (login, request flow, deployment, module workflows) are in [02 — Architecture](02-architecture.md).

## 5. Technology stack

Versions are the ranges declared in `package.json` / `server/package.json`; the installed versions are in the lock files. *(Verified.)*

### Frontend (`/package.json`)

| Technology | Declared version | Purpose |
|---|---|---|
| React / React DOM | ^19.2.5 | UI framework (single-page app) |
| Vite + `@vitejs/plugin-react` | ^8.0.10 / ^6.0.1 | Dev server and production bundler |
| TypeScript | ~6.0.2 | Type checking (`tsc` via build) |
| Tailwind CSS + `@tailwindcss/vite` | ^4.2.4 | Styling |
| lucide-react | ^1.11.0 | Icons |
| `@azure/msal-browser` | ^5.12.0 | Present in dependencies; only `src/lib/msalConfig.ts` references it. **Sign-in is actually performed server-side**, see [06](06-authentication-rbac-security.md) |
| docx | ^9.7.1 | Word document generation in the browser (used by documentation/report features — *Inferred*) |
| Vitest, Testing Library, jsdom | ^4.1.11 / ^16.3.3 / ^30.1.2 | Client tests |
| ESLint (+ typescript-eslint, react-hooks, react-refresh) | ^10.2.1 | Linting |
| Playwright | ^1.60.0 (dev) | Browser automation; **no e2e suite was found in the repo** (*Not verified*) |

### Backend (`/server/package.json`)

| Technology | Declared version | Purpose |
|---|---|---|
| Node.js | not pinned (`engines` absent). Developed on Node 24.x | Runtime. **Required version: Not verified** |
| Express | ^5.2.1 | HTTP server and routing |
| TypeScript, tsx | ^6.0.3 / ^4.21.0 | Compile (`tsc`) and dev watch (`tsx watch`) |
| zod | ^4.3.6 | Request validation |
| jsonwebtoken | ^9.0.3 | Signed session tokens (JWT) |
| express-rate-limit | ^8.5.1 | Rate limiting |
| cors, dotenv | ^2.8.6 / ^17.4.2 | CORS, environment loading |
| pg | ^8.22.0 | Optional PostgreSQL |
| exceljs, pdfkit, pptxgenjs, archiver | ^4.4.0 / ^0.19.1 / ^4.0.1 / ^8.0.0 | Excel, PDF, PowerPoint, zip exports |
| openai | ^6.35.0 | OpenAI SDK |
| `@azure/identity`, `@azure/storage-blob` | ^4.13.1 / ^12.33.0 | Azure auth modes and blob export storage (legacy Intune Audit module) |
| vitest | ^4.1.10 | Server tests |

Why these were chosen is documented in [`docs/01-overview/TECH-STACK.md`](01-overview/TECH-STACK.md) (older). *Inferred* rationale: one language (TypeScript) on both tiers, a no-database default so the portal runs with zero infrastructure, and a single-process deployment that fits IIS.

## 6. Related documents

[Architecture](02-architecture.md) · [Repository structure](03-repository-structure.md) · [Modules](04-modules-and-code-logic.md) · [Integrations](05-api-integrations.md) · [Auth & RBAC](06-authentication-rbac-security.md) · [Onboarding](07-installation-and-developer-onboarding.md)
