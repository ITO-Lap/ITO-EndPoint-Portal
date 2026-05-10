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
├── routes/
│   ├── devices.ts              GET /api/devices, /api/devices/stats
│   ├── integrations.ts         GET/POST /api/integrations/*
│   ├── runbooks.ts             GET /api/runbooks, /api/runbooks/:id
│   ├── notifications.ts        GET/PATCH /api/notifications
│   ├── activity.ts             GET /api/activity
│   └── ai.ts                   GET/POST /api/ai/*
│
├── services/
│   ├── intune.ts               Microsoft Graph API client
│   ├── kandji.ts               Kandji REST API client
│   ├── manageEngine.ts         ManageEngine REST API client
│   └── openai.ts               OpenAI client (device analysis + chat)
│
├── middleware/
│   ├── errorHandler.ts         Global error handler + asyncHandler wrapper
│   └── requestLogger.ts        HTTP request logging
│
├── data/
│   ├── mockDevices.ts          Mock device records (used when no MDM configured)
│   ├── mockRunbooks.ts         Mock runbook library
│   ├── mockActivity.ts         Mock activity feed
│   └── mockNotifications.ts   Mock notifications
│
└── store/
    └── integrationStore.ts     Runtime credential + fetch result cache
```

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
| GET | `/api/runbooks` | List all runbooks |
| GET | `/api/runbooks/:id` | Get single runbook |
| GET | `/api/notifications` | List notifications |
| PATCH | `/api/notifications/read-all` | Mark all read |
| PATCH | `/api/notifications/:id/read` | Mark one read |
| GET | `/api/activity` | Recent activity events |
| GET | `/api/ai/status` | Check if OpenAI is configured |
| POST | `/api/ai/analyze` | AI compliance analysis for a device |
| POST | `/api/ai/chat` | Freeform AI assistant chat |

Full request/response details in [API-REFERENCE.md](API-REFERENCE.md).

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
