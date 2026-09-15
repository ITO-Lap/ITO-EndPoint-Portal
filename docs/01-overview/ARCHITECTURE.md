# Architecture

---

## System diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Browser (React SPA)                          │
│                                                                       │
│  ┌──────────┐  ┌────────────────────────────────────────────────┐   │
│  │ Sidebar  │  │                  Main Content                   │   │
│  │ (nav)    │  │  Dashboard · Mac/Intune Devices · Users · ...   │   │
│  └──────────┘  └──────────────────┬─────────────────────────────┘   │
│                                   │  src/api/index.ts                │
└───────────────────────────────────┼─────────────────────────────────┘
                                    │ HTTP (fetch, port 4000)
                    ┌───────────────▼───────────────┐
                    │      Express API Server        │
                    │      server/src/index.ts       │
                    │                                │
                    │  /api/devices                  │
                    │  /api/integrations             │
                    │  /api/intelligence             │
                    │  /api/copilot                  │
                    │  /api/notifications            │
                    │  /api/entra, /api/jira, ...    │
                    └───────────┬───────────────────┘
                                │
          ┌─────────────────────┐
          ▼                     ▼
  ┌───────────────┐   ┌──────────────────────────┐
  │ Microsoft     │   │  ManageEngine             │
  │ Intune        │   │  (API key; Windows,       │
  │ (Graph API)   │   │  cross-platform, macOS)   │
  └───────────────┘   └──────────────────────────┘
          ▼ (server/src/services/openai.ts — used from /api/intelligence and /api/copilot)
  ┌───────────────┐
  │ OpenAI API    │
  │ gpt-4o-mini   │
  └───────────────┘
```

There is no login screen — the app always renders as Global Admin with no auth gate (`src/App.tsx`
mounts the dashboard directly). The sign-in screen was deliberately removed; don't re-add it as a
"fix."

---

## Request flow — page load

```
1. Browser loads React SPA (Vite dev server or built dist/)
2. AppContent mounts directly (no auth gate):
   - useStats()             → GET /api/devices/stats        (live counts)
   - useNotifications()     → GET /api/notifications        (badge count)
   - useIntegrationStatus() → GET /api/integrations/status  (source health)
3. Stats arrive → stat cards update from mock → live values
```

---

## Request flow — device stats/search

```
Header search / Dashboard load
→ api.fetchDevices(query) / api.fetchStats() → GET /api/devices?q=<query> / GET /api/devices/stats
  [server] → tries real MDM sources first (if configured)
           → falls back to mock data if all sources fail
→ apiDeviceToDeviceData() maps server shape → frontend DeviceData
→ setSelectedDevice() updates Dashboard view
```

---

## Request flow — AI-generated content

```
Risk Scoring / Compliance Intelligence page loads
→ POST /api/intelligence/summary (or /explain, /risk-scores)
  [server] → falls back to a non-AI summary if OpenAI isn't configured
           → otherwise calls server/src/services/openai.ts → OpenAI gpt-4o-mini
           → structured JSON response
→ Frontend renders the AI narrative/summary card

Endpoint Operations Copilot chat turn
→ POST /api/copilot/... → tool-calling loop against gpt-4o-mini (server/src/services/copilotTools.ts)
→ Write tools (e.g. create_jira_ticket) return a pending action, only executed after the user
  confirms via POST /api/copilot/actions/:id/confirm
```

---

## Integration credential flow

```
Settings page → user fills in Intune/ManageEngine credentials
→ POST /api/integrations/:id/credentials { fields: {...} }
  [server] → setIntuneConfig() / setManageEngineConfig()
           → stored in integrationStore (in-memory, resets on server restart)
→ POST /api/integrations/:id/sync
  [server] → calls getIntuneDevices() / getManageEngineDevices()
           → records fetch result with deviceCount + latencyMs
→ GET /api/integrations/status
  [server] → returns per-source health snapshot
```

---

## State management

There is **no global state library** (no Redux, Zustand, etc.). State is managed through:

| Mechanism | Used for |
|---|---|
| `useState` | Local component state (modals, search input) |
| `useLocalStorage` | Persistent state (active page, copilot panel open/closed) |
| `useStats` / `useNotifications` / `useIntegrationStatus` | Remote data with polling |
| Props drilling | Parent → child data passing |
| Server `integrationStore` | Runtime credential and fetch result cache |

---

## Empty-state behavior — `/api/devices`

`fetchAllDevices()` in `server/src/routes/devices.ts` no longer falls back to a static mock device
list — that fallback (`mockDevices.ts`) was removed:

```
GET /api/devices/stats, GET /api/devices?q=query
  if (Intune configured)       → getIntuneDevices()
  if (ManageEngine configured) → getManageEngineDevices()
  if (nothing configured)      → devices: [] (empty, not synthetic)
  → response always includes `mock: false`
```

The frontend's LiveDataBar "Mock Data" badge (gated on `stats.mock === true`) is effectively dead
for this endpoint since `mock` is now always `false`. Other, unrelated dashboards in the app (e.g.
Entra Intelligence) still have their own independent demo/mock datasets that are unaffected by this
— see the individual feature docs in `07-features/` for what's demo-backed elsewhere.

---

## File dependency map

```
App.tsx
 ├── api/index.ts          (HTTP client)
 ├── data/dashboardData.ts (mock data + search helpers)
 ├── hooks/useStats.ts             → api.fetchStats()
 ├── hooks/useNotifications.ts     → api.fetchNotifications()
 ├── hooks/useIntegrationStatus.ts → api.fetchIntegrationStatus()
 └── components/
     ├── layout/Header.tsx      (search, notifications, profile menu, copilot toggle)
     ├── layout/Sidebar.tsx     (navigation)
     ├── dashboard/DashboardContent.tsx
     │    ├── dashboard/StatCard.tsx
     │    ├── dashboard/ComplianceDonut.tsx
     │    ├── dashboard/IssueCategories.tsx
     │    ├── dashboard/LiveDataBar.tsx
     │    └── devices/DeviceSummary.tsx
     │         └── devices/ComplianceDetails.tsx
     ├── runbooks/RunbookCard.tsx + RunbookModal.tsx
     ├── copilot/CopilotPanel.tsx   (Endpoint Operations Copilot)
     ├── settings/SettingsPage.tsx
     └── pages/*.tsx  (Mac/Intune Devices, Users, Automation, Entra Intelligence, etc.)
```
