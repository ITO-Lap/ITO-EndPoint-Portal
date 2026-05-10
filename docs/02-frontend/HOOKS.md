# Custom Hooks Reference

All custom hooks live in `src/hooks/`. Each is a focused, single-responsibility hook.

---

## `useLocalStorage<T>(key, defaultValue)`

**File:** `src/hooks/useLocalStorage.ts`

Persists state to `localStorage`. Works exactly like `useState` but survives page refresh.

```tsx
const [activePage, setActivePage] = useLocalStorage('activePage', 'Dashboard')
const [isAuthenticated, setAuth] = useLocalStorage('ito_auth', false)
const [role, setRole] = useLocalStorage('ito_role', 'Global Admin')
```

**Keys in use:**
| Key | Default | Used for |
|---|---|---|
| `activePage` | `'Dashboard'` | Currently displayed page |
| `ito_auth` | `false` | Whether user is signed in |
| `ito_role` | `'Global Admin'` | Current user's role |

---

## `useStats()`

**File:** `src/hooks/useStats.ts`

Fetches `/api/devices/stats` on mount and refreshes every 30 seconds. Returns a countdown.

```tsx
const { stats, countdown, lastUpdated, refresh } = useStats()

// stats: ApiStats | null  (null until first load)
// countdown: number       (seconds until next refresh)
// lastUpdated: Date | null
// refresh: () => void     (force refresh now)
```

**ApiStats shape:**
```ts
{ total, compliant, nonCompliant, warning, windows, mac,
  sources: { intune, kandji, manageEngine }, mock: boolean }
```

**To change the refresh interval:** modify `REFRESH_INTERVAL_MS` in `useStats.ts`.

---

## `useActivity(limit?)`

**File:** `src/hooks/useActivity.ts`

Fetches recent activity events from `/api/activity`. Refreshes every 60 seconds.

```tsx
const { items, loading, error } = useActivity(20) // default limit: 20
```

**Item shape:** `{ id, deviceName, message, status, timestamp }`

---

## `useNotifications(defaults?)`

**File:** `src/hooks/useNotifications.ts`

Manages notification state. Fetches from `/api/notifications` and merges with optional default items (used for hardcoded notification seeds in `App.tsx`).

```tsx
const { notifications, markAllRead, markRead } = useNotifications(DEFAULT_NOTIFICATIONS)

await markAllRead()       // PATCH /api/notifications/read-all
await markRead('abc123')  // PATCH /api/notifications/abc123/read
```

---

## `useIntegrationStatus()`

**File:** `src/hooks/useIntegrationStatus.ts`

Polls `/api/integrations/status` to show live integration health in the Settings page.

```tsx
const { integrations, loading, error, refetch } = useIntegrationStatus()
```

**Returns:** array of `IntegrationStatusItem` — one per source (intune, kandji, manageengine, openai).

---

## `useClickOutside(ref, handler)`

**File:** `src/hooks/useClickOutside.ts`

Calls `handler` when the user clicks outside the given ref. Used for closing notification dropdowns.

```tsx
const dropdownRef = useRef<HTMLDivElement>(null)
useClickOutside(dropdownRef, () => setOpen(false))
```

---

## `useDashboardState()`

**File:** `src/hooks/useDashboardState.ts`

Manages the local UI state needed by the Dashboard page (runbook modal open/close, activity modal, etc.). Extracted from `DashboardContent` to keep the component clean.

```tsx
const {
  runbookModalOpen, setRunbookModalOpen,
  activityModalOpen, setActivityModalOpen,
  policyModalOpen, setPolicyModalOpen,
} = useDashboardState()
```

---

## Adding a new hook

1. Create `src/hooks/useYourHook.ts`
2. Export a named function starting with `use`
3. If it fetches data, pattern-match `useActivity.ts` (loading/error states, cleanup on unmount)
4. Import from `'./hooks/useYourHook'` in the consuming component
