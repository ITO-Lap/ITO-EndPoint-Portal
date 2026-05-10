# API Reference

Base URL: `http://localhost:4000`  
All responses wrap data in `{ success: boolean, data: T }` or `{ success: false, error: string }`.

---

## Health

### `GET /health`
Server liveness check.

**Response:**
```json
{ "status": "healthy", "timestamp": "2026-05-10T12:00:00.000Z" }
```

---

## Devices

### `GET /api/devices`
Search and list managed devices across all connected sources.

**Query params:**
| Param | Type | Description |
|---|---|---|
| `q` | string | Search query (device name, user email, serial) |
| `source` | `intune \| kandji \| manageengine \| all` | Filter by MDM source |
| `compliance` | `Compliant \| Non-Compliant \| Warning` | Filter by compliance state |
| `platform` | `Windows \| macOS \| Linux` | Filter by OS platform |
| `limit` | number | Max results (default: 200) |

**Response:**
```json
{
  "success": true,
  "data": {
    "devices": [ ApiDevice ],
    "total": 42,
    "mock": false
  }
}
```

`mock: true` when all MDM sources are unconfigured and mock data is returned.

**ApiDevice shape:** See [Types Reference](../05-data-models/TYPES-REFERENCE.md#ApiDevice).

---

### `GET /api/devices/stats`
Aggregated compliance counts for the stat cards and donut chart.

**Response:**
```json
{
  "success": true,
  "data": {
    "total": 250,
    "compliant": 200,
    "nonCompliant": 35,
    "warning": 15,
    "windows": 180,
    "mac": 70,
    "sources": { "intune": 180, "kandji": 70, "manageEngine": 0 },
    "mock": false
  }
}
```

---

## Integrations

### `GET /api/integrations/status`
Per-source health snapshot.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "intune",
      "name": "Microsoft Intune",
      "configured": true,
      "deviceCount": 180,
      "lastSyncAt": "2026-05-10T11:58:00.000Z",
      "latencyMs": 342,
      "error": null,
      "healthy": true
    }
  ]
}
```

---

### `POST /api/integrations/:id/credentials`
Push runtime credentials from the Settings UI.

**Path param:** `id` = `intune | kandji | manageengine | openai`

**Request body:**
```json
// Intune
{ "fields": { "tenantId": "...", "clientId": "...", "clientSecret": "..." } }

// Kandji
{ "fields": { "apiToken": "...", "subdomain": "myorg" } }

// ManageEngine
{ "fields": { "apiKey": "...", "serverUrl": "https://me.myorg.com", "port": "8443" } }

// OpenAI
{ "fields": { "apiKey": "sk-...", "orgId": "...", "model": "gpt-4o" } }
```

**Response:**
```json
{ "success": true, "data": { "id": "intune", "configured": true } }
```

Credentials are stored in memory only. They reset on server restart. For permanent credentials, set env vars in `server/.env`.

---

### `POST /api/integrations/:id/sync`
Force an immediate fresh data fetch from a single source.

**Path param:** `id` = `intune | kandji | manageengine`

**Response:**
```json
{
  "success": true,
  "data": { "id": "intune", "deviceCount": 180, "latencyMs": 387, "error": null }
}
```

Returns `error` string if the fetch failed (e.g., token expired, network unreachable).

---

## Runbooks

### `GET /api/runbooks`
List all runbooks in the library.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "bitlocker-enable",
      "name": "Enable BitLocker and Sync Device",
      "platform": "Windows",
      "category": "Encryption",
      "steps": ["Step 1...", "Step 2..."],
      "automation": "Yes (Intune)",
      "escalation": "No"
    }
  ]
}
```

---

### `GET /api/runbooks/:id`
Get a single runbook by ID.

---

## Notifications

### `GET /api/notifications`
List all notifications for the current session.

**Response:**
```json
{
  "success": true,
  "data": [
    { "id": "1", "message": "...", "type": "info", "read": false, "createdAt": "..." }
  ]
}
```

---

### `PATCH /api/notifications/read-all`
Mark all notifications as read.

---

### `PATCH /api/notifications/:id/read`
Mark a single notification as read.

---

## Activity

### `GET /api/activity`
Recent device events.

**Query params:** `limit` (default: 20)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "abc",
      "deviceName": "LAPTOP-8F7G2Q1",
      "message": "BitLocker issue detected",
      "status": "Non-Compliant",
      "timestamp": "2026-05-10T09:15:00.000Z"
    }
  ]
}
```

---

## AI

### `GET /api/ai/status`
Check whether OpenAI is configured.

**Response:**
```json
{ "success": true, "data": { "openai": true } }
```

---

### `POST /api/ai/analyze`
AI-powered compliance analysis for a specific device.

**Request:**
```json
{ "deviceId": "device-uuid-string" }
```

**Response:**
```json
{
  "success": true,
  "data": {
    "summary": "Device is non-compliant due to disabled BitLocker encryption.",
    "rootCause": "BitLocker was never enabled during device enrollment.",
    "recommendation": "Enable BitLocker via Intune compliance policy and force a sync.",
    "suggestedRunbook": "Enable BitLocker and Sync Device",
    "riskLevel": "High",
    "steps": ["Step 1", "Step 2", "Step 3", "Step 4", "Step 5"]
  }
}
```

Returns `503` if `OPENAI_API_KEY` is not set.

---

### `POST /api/ai/chat`
Freeform chat with the IT assistant. Optional device context focuses the response.

**Request:**
```json
{
  "message": "How do I fix a BitLocker compliance issue on Windows?",
  "deviceId": "optional-device-uuid"
}
```

**Response:**
```json
{
  "success": true,
  "data": { "reply": "Here's how to fix BitLocker compliance..." }
}
```

`message` max length: 1000 characters. Returns `503` if OpenAI is not configured.

---

## Error responses

All errors follow this shape:
```json
{ "success": false, "error": "Human-readable message", "details": "..." }
```

| Status | Meaning |
|---|---|
| 400 | Bad request / validation failure |
| 404 | Resource not found |
| 503 | External service not configured |
| 500 | Unexpected server error |
