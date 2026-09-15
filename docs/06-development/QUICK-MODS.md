# Quick Modifications Cookbook

Common change recipes with exact files and steps. No guesswork needed.

---

## UI & Layout

### Add a new sidebar page

1. **`src/data/dashboardData.ts`** → add to `navItems`:
   ```ts
   { title: 'My New Page', icon: SomeIcon }
   ```

2. **`src/App.tsx`** → add branch in the page router:
   ```tsx
   : activePage === 'My New Page' ? <MyNewPage />
   ```

3. Create your page component at `src/pages/MyNewPage.tsx` or `src/components/mynewpage/MyNewPage.tsx`

4. (Optional) Add description to `PAGE_META` in `App.tsx`

---

### Add a new stat card

**`src/data/dashboardData.ts`** → add to `statCards`:
```ts
{
  title: 'Linux Devices',
  value: '0',           // overwritten by live data
  trend: '↑ 0%',
  trendChange: 'vs last 7 days',
  icon: Terminal,
  accent: 'text-lime-700',
  iconBg: 'bg-lime-100',
  iconText: 'text-lime-600',
}
```

Then in **`src/App.tsx`** → `liveStatCards` useMemo, add the live value to the `counts` array at the correct index.

---

### Change the dashboard refresh interval

**`src/hooks/useStats.ts`** → change `REFRESH_INTERVAL_MS`:
```ts
const REFRESH_INTERVAL_MS = 30_000  // 30 seconds → change to 60_000 for 1 minute
```

---

### Change a colour theme / brand colour

**`src/index.css`** → edit the Tailwind CSS variables or add custom colours.

For stat card colors, edit the `accent`, `iconBg`, `iconText` fields in `statCards` in `src/data/dashboardData.ts`.

---

## Data & Mock Data

### Add a new mock device

**`src/data/dashboardData.ts`** → add to the `mockDevices` array:
```ts
{
  deviceName: 'MY-NEW-DEVICE',
  user: 'user@company.com',
  serialNumber: 'ABCDE12',
  platform: 'Windows',
  osVersion: 'Windows 11 Pro 23H2',
  managementSource: 'Microsoft Intune',
  lastCheckIn: 'May 10, 2026 10:00 AM',
  complianceState: 'Compliant',
  encryptionStatus: 'BitLocker On',
  primaryIssue: 'None',
  policyFailed: 'None',
  severity: 'Low',
  confidence: '100%',
  firstDetected: 'N/A',
  lastDetected: 'N/A',
  issueSource: 'N/A',
  recommendedRunbook: 'None',
  nextSteps: [],
  issueCategory: 'None',
  hasOpenIssue: false,
}
```

There is no server-side mock device list anymore — `/api/devices` returns real MDM data only, or an
empty list if nothing is configured (no `server/src/data/mockDevices.ts` to update).

---

### Add a new issue category

**`src/data/dashboardData.ts`** → add to `issueCategories`:
```ts
{ label: 'Endpoint Detection', value: 45, color: '#6366f1' }
```

---

### Add a runbook

**`src/data/dashboardData.ts`** → add a new `RunbookData` object and reference it from `getRunbookForDevice()`. (There is no separate server-side runbook library/route anymore.)

---

## Backend

### Add a new API endpoint

1. Open (or create) the appropriate file in `server/src/routes/`
2. Add a route using `asyncHandler`:
   ```ts
   router.get('/my-endpoint', asyncHandler(async (_req, res) => {
     res.json({ success: true, data: { message: 'hello' } })
   }))
   ```
3. If creating a new file, mount it in `server/src/index.ts`:
   ```ts
   import myRouter from './routes/myroute.js'
   app.use('/api/myroute', myRouter)
   ```
4. Add the call to `src/api/index.ts` on the frontend:
   ```ts
   fetchMyThing: () => get<MyType>('/api/myroute/my-endpoint')
   ```

---

### Change the AI model

**`server/src/services/openai.ts`** → change `model` in the API calls:
```ts
model: 'gpt-4o'        // upgrade from gpt-4o-mini
model: 'gpt-3.5-turbo' // cheaper option
```

---

### Change the AI prompt

**`server/src/services/openai.ts`** → edit the `prompt` string inside `analyzeDevice()`:
```ts
const prompt = `You are an enterprise IT compliance analyst...`
```

Or edit the `system` string inside `chatWithAI()` for the assistant persona.

---

## Auth & Roles

### Add a new user role

1. **`src/types.ts`** → add to `UserToolRole` (currently `'Global Admin' | 'IT Admin' | 'Helpdesk' | 'End User'`)

2. **`src/components/layout/Sidebar.tsx`** → add role-based nav filtering if needed

3. **`docs/ROLES.md`** → update the permissions matrix

There is no sign-in screen to update a role selector on — the app has no auth gate and always runs
as Global Admin (`viewerRole` defaults in `Header.tsx`/`App.tsx`). Don't re-add a `SignInPage`.

---

## Notifications

### Add a notification

Notifications are fetched from the server (`GET /api/notifications`, `server/src/routes/notifications.ts`) — there's no client-side default list in `App.tsx` to edit. Add/trigger the notification on the server side instead.

### Notification fetch behavior

**`src/hooks/useNotifications.ts`** fetches once on mount (`api.fetchNotifications()`) — it does not currently poll on an interval.

---

## Settings

### Add a new settings section

1. **`src/components/settings/SettingsPage.tsx`** → add a tab entry:
   ```ts
   { id: 'mySection', label: 'My Section', icon: SomeIcon }
   ```

2. Add a panel component rendered when that tab is active.

---

## Types

### Add a new field to DeviceData

1. **`src/types.ts`** → add field to `DeviceData`
2. **`server/src/types.ts`** → add field to server `Device` type (keep in sync)
3. **`src/api/index.ts`** → add field to `ApiDevice` and to `apiDeviceToDeviceData()`
4. Update mock/demo data in `src/data/dashboardData.ts` (there is no server-side mock device list — see [Architecture](../01-overview/ARCHITECTURE.md))
