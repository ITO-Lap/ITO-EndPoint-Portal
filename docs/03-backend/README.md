# Backend Guide

The backend is an Express.js + TypeScript server that runs on port 4000 and serves as the data layer between the React frontend and the external MDM APIs.

---

## Entry point

`server/src/index.ts` — mounts all routers, configures middleware, starts the server.

```
Port: 4000 (default, override with PORT env var)
CORS: open (all origins — restrict in production)
Body parser: express.json()
```

---

## Folder structure

```
server/src/
├── index.ts                    Entry point — Express app + route mounting
├── types.ts                    Shared type definitions (Device, etc.)
│
├── routes/                     One router per mount point — see the list below
│   ├── devices.ts              GET /api/devices, /api/devices/stats
│   ├── integrations.ts         GET/POST /api/integrations/*
│   ├── notifications.ts        GET/PATCH /api/notifications
│   ├── intelligence.ts         POST /api/intelligence/* — risk scores, AI summary/explain, exports
│   ├── copilot.ts              /api/copilot/* — Endpoint Operations Copilot chat + pending actions
│   ├── entra.ts, jira.ts, slack.ts, auth.ts, users.ts, automations.ts,
│   │   auditLog.ts, scheduledReports.ts, securityInventory.ts, securityPolicies.ts,
│   │   roleActivity.ts, intuneScriptsConfig.ts, reports.ts
│
├── services/
│   ├── intune.ts               Microsoft Graph API client
│   ├── manageEngine.ts         ManageEngine REST API client (Windows, cross-platform, and macOS devices)
│   ├── openai.ts                OpenAI client (device analysis, chat, summaries)
│   ├── jira.ts / confluence.ts  Jira + Confluence REST clients
│   ├── copilotTools.ts          Copilot tool definitions (read + confirm-before-write actions)
│   └── automationEngine.ts      Automation rule trigger/condition/action execution
│
├── middleware/
│   ├── errorHandler.ts         Global error handler + asyncHandler wrapper
│   ├── requestLogger.ts        HTTP request logging
│   └── requireRole.ts          RBAC guard for role-gated routes
│
└── store/
    └── integrationStore.ts     Runtime credential + fetch result cache
```

There is no `server/src/data/mock*.ts` set anymore — `/api/devices` has no static mock fallback (see
[Architecture](../01-overview/ARCHITECTURE.md#empty-state-behavior--apidevices)); it returns an empty
list when no MDM source is configured, rather than synthetic devices.

---

## Route summary

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Server health check |
| GET | `/api/devices` | List/search devices |
| GET | `/api/devices/stats` | Compliance counts summary |
| GET | `/api/integrations/status` | Per-integration health |
| POST | `/api/integrations/:id/credentials` | Push credentials from UI |
| POST | `/api/integrations/:id/sync` | Force a fresh data fetch |
| GET | `/api/notifications` | List notifications |
| PATCH | `/api/notifications/read-all` | Mark all read |
| PATCH | `/api/notifications/:id/read` | Mark one read |
| POST | `/api/intelligence/summary` | AI executive compliance summary |
| POST | `/api/copilot/...` | Copilot chat turn / pending action confirm-reject |
| POST | `/api/jira/*` | Jira ticket create/search |

This is a representative subset, not exhaustive — see `server/src/index.ts` for the full list of
mounted routers and [API-REFERENCE.md](API-REFERENCE.md) for endpoint details (note: some entries in
that reference may also be stale from the same refactor that removed `/api/activity`, `/api/ai/*`,
and `/api/runbooks`).

---

## Error handling

All route handlers are wrapped in `asyncHandler()` from `middleware/errorHandler.ts`:

```ts
router.get('/path', asyncHandler(async (req, res) => {
  // throw anything — asyncHandler catches it and passes to errorHandler
  const data = await riskyCall()
  res.json({ success: true, data })
}))
```

The global error handler returns:
```json
{ "success": false, "error": "message", "details": "..." }
```

Zod validation errors become `400`. Unknown errors become `500`.

---

## Adding a new route

1. Create `server/src/routes/myroute.ts`:
   ```ts
   import { Router } from 'express'
   import { asyncHandler } from '../middleware/errorHandler.js'
   const router = Router()
   router.get('/', asyncHandler(async (_req, res) => {
     res.json({ success: true, data: { hello: 'world' } })
   }))
   export default router
   ```

2. Mount in `server/src/index.ts`:
   ```ts
   import myRouter from './routes/myroute.js'
   app.use('/api/myroute', myRouter)
   ```

---

## Further reading

- [API Reference](API-REFERENCE.md) — complete endpoint documentation
- [Services](SERVICES.md) — external service integration details
