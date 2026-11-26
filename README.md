# EndPoint+

Internal web portal for Verma IT Operations: one place to see and act on Windows and macOS endpoints across **Microsoft Intune / Entra** and **ManageEngine Endpoint Central**, with application-version compliance, patch operations, stale-device reporting, scheduled Slack reports, automation rules and an AI Copilot.

- **Stack:** React 19 · Vite · TypeScript · Tailwind 4 (client) · Express 5 · TypeScript (server) · optional PostgreSQL · IIS reverse proxy + Windows Service in production.
- **Docs status:** the numbered documents below were written from the code (labels *Verified / Inferred / Not verified*). Start with the overview, and read [15](docs/15-known-gaps-and-verification-checklist.md) before relying on anything marked "Not verified".

## Bring your own API keys (read this first)

EndPoint+ ships **without any credentials**. With nothing configured it runs on built-in **mock data**, so the dashboards load but show sample devices only. To see your own fleet and use the AI features you must supply **your own** keys and tenant details; none are provided with the repository.

1. Copy the template: `cp server/.env.example server/.env` (the server reads `server/.env` only).
2. Fill in only the integrations you use, then restart the server:

| To enable | Set in `server/.env` | Where to get it |
|---|---|---|
| Ocean / AI Copilot | `GEMINI_API_KEY` (and/or `OPENAI_API_KEY`) | Your own Google AI Studio or OpenAI account |
| Microsoft Intune data | `INTUNE_TENANT_ID`, `INTUNE_CLIENT_ID`, `INTUNE_CLIENT_SECRET` | An app registration in **your** Entra tenant with the Graph permissions in [docs/13](docs/13-api-permission-matrix.md) |
| Microsoft sign-in | `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID`, `ENTRA_CLIENT_SECRET` | An Entra app registration for sign-in |
| ManageEngine Endpoint Central | `MANAGEENGINE_CLIENT_ID`, `MANAGEENGINE_CLIENT_SECRET`, `MANAGEENGINE_REFRESH_TOKEN`, `MANAGEENGINE_API_DOMAIN` | Your ManageEngine API console |
| Slack reports | `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET` (and channel IDs) | A Slack app in your workspace |
| Jira / Confluence | `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`, `JIRA_PROJECT_KEY` | Your Atlassian account |
| PostgreSQL (optional) | `DATABASE_URL` | Your own database |

Every variable is documented in [docs/14 — Environment variable reference](docs/14-environment-variable-reference.md). Some integrations can also be set from **Settings → Integrations** inside the app.

**Security:** never commit `server/.env` or paste keys into issues, pull requests or chat. Use your own least-privilege credentials and rotate any key that has been exposed.

## Quick start

```bash
npm install                          # installs root and server
cp server/.env.example server/.env   # then edit server/.env (see docs/14)
# local-only sign-in: set AUTH_PASSWORDLESS=true and AUTH_ALLOWED_EMAILS=<your e-mail> in server/.env
npm run dev                          # client http://localhost:5173, API http://localhost:4000
```

Checks: `npm test` (client) · `cd server && npm test` (server) · `npm run lint` · `npm run build`. Details: [07 — Installation and onboarding](docs/07-installation-and-developer-onboarding.md).

## Documentation index

| # | Document | What you will find |
|---|---|---|
| 01 | [Project overview](docs/01-project-overview.md) | Purpose, users, scope, platforms, architecture overview, technology stack |
| 02 | [Architecture](docs/02-architecture.md) | Request pipeline, login, data flow, caching/fallback, background jobs, deployment flow, module workflows (Mermaid) |
| 03 | [Repository structure](docs/03-repository-structure.md) | Every folder, module-to-code map, "where do I change X" |
| 04 | [Modules and code logic](docs/04-modules-and-code-logic.md) | Per-module workflow, endpoints, logic, errors, extension points, route index |
| 05 | [API and integrations](docs/05-api-integrations.md) | Graph, Entra sign-in, ManageEngine/Endpoint Central, Slack, Jira, AI, public sources |
| 06 | [Authentication, RBAC and security](docs/06-authentication-rbac-security.md) | Login/session lifecycle, roles, authorization gaps, secrets, hardening backlog |
| 07 | [Installation and developer onboarding](docs/07-installation-and-developer-onboarding.md) | Setup, running, tests, safe-change workflow, install errors |
| 08 | [Deployment and operations](docs/08-deployment-and-operations.md) | IIS + NSSM deployment, release/rollback, backups, monitoring, CI gaps |
| 09 | [Database and data handling](docs/09-database-and-data-handling.md) | `DATA_DIR` files, PostgreSQL schema, ER diagram, data classification, duplicate/stale handling |
| 10 | [Risks, limitations and technical debt](docs/10-risks-limitations-technical-debt.md) | Risk register (22 items) and debt list |
| 11 | [Troubleshooting runbooks](docs/11-troubleshooting-runbooks.md) | Login, consent, tokens, Graph, ManageEngine, Slack, data, deploy, DB, performance, safe diagnostics |
| 12 | [Change management](docs/12-change-management.md) | Add a module / integration / card / role / Slack schedule / DB field; standards; PR and release checklists |
| 13 | [API permission matrix](docs/13-api-permission-matrix.md) | Every permission and scope, what uses it, tick-list; capability keys per route |
| 14 | [Environment variable reference](docs/14-environment-variable-reference.md) | Every variable: purpose, format, required, secret, source, consumer |
| 15 | [Known gaps and verification checklist](docs/15-known-gaps-and-verification-checklist.md) | Findings, things to confirm live, documentation coverage summary |

### Older documentation (supplementary, not re-verified)

[`docs/README.md`](docs/README.md) is the earlier master index (folders `01-overview` … `08-design`). Also: [Handover manual](docs/HANDOVER-MANUAL.md), [Roles reference](docs/ROLES.md), [IIS deployment](docs/06-development/IIS-DEPLOYMENT.md), [DeployHub zip SOP](docs/06-development/ZIP-FOR-DEPLOYHUB.md), [feature write-ups](docs/07-features/README.md). Where an older document disagrees with the numbered set, the code is authoritative.

## Repository layout (short)

```text
src/            React SPA (pages, components, api clients, hooks, lib)
server/         Express API, services, stores, background jobs, db/schema.sql
deploy/iis/     web.config (reverse proxy) and install-service.ps1 (NSSM service)
docs/           documentation (this set + older material)
```

Full map: [03 — Repository structure](docs/03-repository-structure.md).

## Important operating notes

- Runtime data (schedules, roles, automations, caches, session key) is stored in **`DATA_DIR`** — set it to a folder outside the deploy folder in production ([09](docs/09-database-and-data-handling.md)).
- The server reads **`server/.env`** only; never commit it or put it in a zip ([14](docs/14-environment-variable-reference.md), [06 §8](docs/06-authentication-rbac-security.md)).
- The app is designed for a **single instance** ([08 §10](docs/08-deployment-and-operations.md)).
- Several write routes need server-side authorization added ([06 §6](docs/06-authentication-rbac-security.md), risk R-03).

## Ownership

Default reviewer: see `.github/CODEOWNERS`. Escalation paths: [11 §12](docs/11-troubleshooting-runbooks.md) (contacts to be filled in by the team).
