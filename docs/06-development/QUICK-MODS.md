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

Also add to the **server mock** at `server/src/data/mockDevices.ts` to make it appear via the API.

---

### Add a new issue category

**`src/data/dashboardData.ts`** → add to `issueCategories`:
```ts
{ label: 'Endpoint Detection', value: 45, color: '#6366f1' }
```

---

### Add a runbook

**`server/src/data/mockRunbooks.ts`** → add a new runbook object.

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

1. **`src/types.ts`** → add to `UserToolRole`:
   ```ts
   export type UserToolRole = 'Global Admin' | 'IT Admin' | 'Helpdesk' | 'End User' | 'Read Only'
   ```

2. **`src/components/auth/SignInPage.tsx`** → add the role to the demo selector

3. **`src/components/layout/Sidebar.tsx`** → add role-based nav filtering if needed

4. **`docs/ROLES.md`** → update the permissions matrix

---

### Replace the demo sign-in with SSO

**`src/components/auth/SignInPage.tsx`** — replace the form with an OAuth redirect:
```tsx
const handleSSO = () => {
  window.location.href = 'https://login.microsoftonline.com/.../oauth2/v2.0/authorize?...'
}
```

After redirect callback, call `onSignIn(role)` with the role from the JWT claim.

---

## Notifications

### Add a new default notification

**`src/App.tsx`** → add to `DEFAULT_NOTIFICATIONS`:
```ts
{ id: '4', message: 'Your new notification message', read: false }
```

### Change notification polling interval

**`src/hooks/useNotifications.ts`** → modify the `setInterval` delay.

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
4. Update mock data in both `src/data/dashboardData.ts` and `server/src/data/mockDevices.ts`
