# Integrations — Setup Guide Index

> All integrations are optional. The platform runs on demo data when no credentials are configured.
> Push credentials via **Settings → Integrations** or set environment variables in `server/.env`.

---

## Available Integrations

| Integration | Type | Guide | Required Env Vars |
|---|---|---|---|
| **Microsoft Intune** | MDM (Windows) | [INTUNE.md](INTUNE.md) | `INTUNE_TENANT_ID`, `INTUNE_CLIENT_ID`, `INTUNE_CLIENT_SECRET` |
| **ManageEngine** | MDM (macOS + cross-platform) | [MANAGEENGINE.md](MANAGEENGINE.md) | `MANAGEENGINE_URL`, `MANAGEENGINE_API_KEY` |
| **Microsoft Entra ID** | Identity / Directory | [ENTRA.md](ENTRA.md) | `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID`, `ENTRA_CLIENT_SECRET` |
| **Slack** | Communication | [SLACK.md](SLACK.md) | `SLACK_BOT_TOKEN` |
| **Jira** | ITSM | [JIRA.md](JIRA.md) | `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN` |
| **Confluence** | Knowledge Base | (uses Jira credentials) | `CONFLUENCE_BASE_URL` |

> **Note:** OpenAI integration has been removed. Runbook guidance uses a built-in rule-based engine that works without any API key.

---

## Integration Status

Check live status: **Settings → Integrations** or `GET /api/integrations/status`.

Each integration shows: Configured · Healthy/Error · Device Count · Last Sync timestamp.

---

## Credential Storage

Credentials pushed via Settings UI are stored in `server/.integration-credentials.json` (gitignored). Environment variables are the fallback.

**Priority:** Settings UI push > Environment variable

---

## Quick Start — Minimum Setup for Live Data

**macOS fleet (ManageEngine):**
```env
MANAGEENGINE_URL=https://yourorg.manageengine.com
MANAGEENGINE_API_KEY=your-api-key
```

**Windows fleet (Intune):**
```env
INTUNE_TENANT_ID=your-tenant-id
INTUNE_CLIENT_ID=your-client-id
INTUNE_CLIENT_SECRET=your-secret
```
