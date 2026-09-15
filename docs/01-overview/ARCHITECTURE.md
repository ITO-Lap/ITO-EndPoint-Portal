# Architecture

---

## System diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Browser (React SPA)                          │
│                                                                       │
│  ┌──────────┐  ┌────────────────────────────────────────────────┐   │
│  │ Sidebar  │  │                  Main Content                   │   │
│  │ (nav)    │  │  Dashboard · Device Lookup · Users · Settings   │   │
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
                    │  /api/runbooks                 │
                    │  /api/notifications            │
                    │  /api/activity                 │
                    │  /api/ai                       │
                    └───────────┬───────────────────┘
                                │
          ┌─────────────────────┐
          ▼                     ▼
  ┌───────────────┐   ┌──────────────────────────┐
  │ Microsoft     │   │  ManageEngine             │
  │ Intune        │   │  (API key; Windows,       │
  │ (Graph API)   │   │  cross-platform, macOS)   │
  └───────────────┘   └──────────────────────────┘
          ▼ (any route: POST /api/ai/*)
  ┌───────────────┐
  │ OpenAI API    │
  │ gpt-4o-mini   │
  └───────────────┘
```

---

## Request flow — page load

```
1. Browser loads React SPA (Vite dev server or built dist/)
2. AuthGate checks localStorage for 'ito_auth' key
3. If not authenticated → renders SignInPage
4. On sign-in → stores role in localStorage, renders AppContent
5. AppContent mounts:
   - useStats()        → GET /api/devices/stats      (live counts)
   - useActivity()     → GET /api/activity            (recent events)
   - useNotifications()→ GET /api/notifications       (badge count)
6. Stats arrive → stat cards update from mock → live values
```

---

## Request flow — device search

```
User types device name → Header search input
→ handleSearch() in App.tsx
→ api.fetchDevices(query) → GET /api/devices?q=<query>
  [server] → tries real MDM sources first (if configured)
           → falls back to mock data if all sources fail
→ apiDeviceToDeviceData() maps server shape → frontend DeviceData
→ setSelectedDevice() updates Dashboard view
→ activePage switches to 'Dashboard' automatically
```

---

## Request flow — AI analysis

```
Dashboard renders device with open issue
→ User clicks "Analyze with AI" (Settings page enables OpenAI)
→ POST /api/ai/analyze { deviceId }
  [server] → requireOpenAI() guard — 503 if no OPENAI_API_KEY
           → analyzeDevice(device) → OpenAI gpt-4o-mini
           → structured JSON response { summary, rootCause, recommendation, steps... }
→ Frontend renders AI analysis card
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
| `useLocalStorage` | Persistent state (active page, auth, role) |
| `useStats` / `useActivity` / `useNotifications` | Remote data with polling |
| Props drilling | Parent → child data passing |
| Server `integrationStore` | Runtime credential and fetch result cache |

---

## Mock data fallback

Every route on the server falls back gracefully:

```
GET /api/devices/stats
  if (any MDM source configured) → aggregate real data
  else                           → return mock stats (mockDevices count)

GET /api/devices?q=query
  if (Intune configured) → getIntuneDevices()
  if (ManageEngine configured) → getManageEngineDevices()
  ...
  if (nothing configured) → filter mockDevices
  → response includes `mock: true` flag
```

The frontend shows a "Mock Data" badge on the LiveDataBar when `stats.mock === true`.

---

## File dependency map

```
App.tsx
 ├── api/index.ts          (HTTP client)
 ├── data/dashboardData.ts (mock data + search helpers)
 ├── hooks/useStats.ts     → api.fetchStats()
 ├── hooks/useActivity.ts  → api.fetchActivity()
 ├── hooks/useNotifications.ts → api.fetchNotifications()
 └── components/
     ├── layout/Header.tsx      (search, notifications, profile)
     ├── layout/Sidebar.tsx     (navigation)
     ├── dashboard/DashboardContent.tsx
     │    ├── dashboard/StatCard.tsx
     │    ├── dashboard/ComplianceDonut.tsx
     │    ├── dashboard/IssueCategories.tsx
     │    ├── dashboard/RecentActivity.tsx
     │    ├── dashboard/LiveDataBar.tsx
     │    └── devices/DeviceSummary.tsx
     │         └── devices/ComplianceDetails.tsx
     ├── devices/DeviceLookupPage.tsx
     ├── runbooks/RunbookCard.tsx + RunbookModal.tsx
     ├── settings/SettingsPage.tsx
     └── auth/SignInPage.tsx
```
