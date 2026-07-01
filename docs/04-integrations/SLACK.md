# Slack Integration — Setup Guide

> **Type:** Communication & Compliance  
> **Use:** Workspace audit logs · Compliance alert notifications  
> **Auth:** Bot Token (xoxb-...) + optional Signing Secret

---

## Required Scopes

Create a Slack App at [api.slack.com/apps](https://api.slack.com/apps):

| Scope | Purpose |
|---|---|
| `auditlogs:read` | Fetch workspace audit logs (Enterprise Grid only) |
| `channels:read` | List channels |
| `users:read` | List users |
| `chat:write` | Post compliance alerts to channels |

---

## Configuration

In **Settings → Integrations → Slack**, push:

| Field | Where to find |
|---|---|
| Bot Token | Slack App → OAuth & Permissions → Bot User OAuth Token |
| Signing Secret | Slack App → Basic Information → App Credentials |
| Workspace ID | Slack App → Basic Information → App ID area |

---

## Environment Variables (alternative)

```env
SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=...   # optional
SLACK_WORKSPACE_ID=...     # optional
```

---

## Health Monitor

The Slack integration includes an **automatic health monitor** that:
- Polls every **5 minutes** (extends to 15 min after 3+ consecutive failures)
- Retries up to **3 times** with exponential backoff (10s → 30s → 90s)
- Resets to 5-minute polling on recovery
- Runs an **immediate check at server startup**

**"Reconnect Now" button** appears in the Slack settings panel when the connection is down.

### API Endpoints
| Endpoint | Purpose |
|---|---|
| `GET /api/slack/status` | Cached health state (no live call) |
| `GET /api/slack/health` | Detailed health snapshot |
| `POST /api/slack/test` | User-triggered connection test |
| `POST /api/slack/reconnect` | Force immediate health re-check |
| `GET /api/slack/audit-logs` | Paginated audit log retrieval |

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| "Slack is not configured" | Bot Token not pushed | Settings → Integrations → Slack → Push to Server |
| `auth.test returned ok=false` | Invalid or revoked token | Regenerate Bot Token in Slack App |
| `not_in_channel` error | Bot not invited | `/invite @YourBot` in the target channel |
| Audit logs empty | Enterprise Grid plan required | `auditlogs:read` is an Enterprise-only scope |
| 15-minute polling | 3+ consecutive failures | Connection issue — click "Reconnect Now" |
