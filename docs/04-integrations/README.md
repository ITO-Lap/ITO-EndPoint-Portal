# Integrations Overview

ITO Endpoint connects to four external services. All are optional — the dashboard runs fully on mock data when nothing is configured.

---

## Integration matrix

| Integration | Type | Data provided | Auth method |
|---|---|---|---|
| [Microsoft Intune](INTUNE.md) | MDM | Windows/macOS devices, compliance state, encryption, hardware details | OAuth2 client credentials |
| [Kandji](KANDJI.md) | MDM | macOS/iOS devices, blueprint compliance, FileVault status | Bearer API token |
| [ManageEngine](MANAGEENGINE.md) | ITSM/MDM | Cross-platform devices, patch status, inventory | API key |
| [OpenAI](OPENAI.md) | AI | Device analysis, remediation steps, IT assistant chat | API key |

---

## Two ways to configure

### Option 1 — Environment variables (recommended for production)

Set values in `server/.env`. They are read on server startup and cannot be overwritten by the UI.

```env
INTUNE_TENANT_ID=...
INTUNE_CLIENT_ID=...
INTUNE_CLIENT_SECRET=...
KANDJI_API_URL=https://myorg.api.kandji.io
KANDJI_API_TOKEN=...
MANAGEENGINE_URL=https://me.mycompany.com
MANAGEENGINE_API_KEY=...
OPENAI_API_KEY=sk-...
```

### Option 2 — Settings UI (runtime, in-memory)

Navigate to **Settings → Integrations** and fill in the credential fields. The server stores them in memory until restart. Good for testing.

---

## Mock data fallback

When **no credentials are set** for a source:
- `/api/devices` returns data from `server/src/data/mockDevices.ts`
- `/api/devices/stats` returns counts derived from mock devices
- The frontend shows a "Mock Data" badge on the LiveDataBar
- The `mock: true` flag is included in API responses

---

## Integration health

Check integration status at:
- **UI:** Settings → Integrations → per-card status
- **API:** `GET /api/integrations/status`

Each integration reports: `configured`, `deviceCount`, `lastSyncAt`, `latencyMs`, `error`, `healthy`.

---

## Forcing a sync

To immediately refresh data from a source:
- **UI:** Settings → Integrations → "Sync Now" button
- **API:** `POST /api/integrations/:id/sync`

This triggers a fresh API call to the MDM source and updates the fetch result cache.

---

## Individual guides

- [Microsoft Intune Setup](INTUNE.md)
- [Kandji Setup](KANDJI.md)
- [ManageEngine Setup](MANAGEENGINE.md)
- [OpenAI Setup](OPENAI.md)
