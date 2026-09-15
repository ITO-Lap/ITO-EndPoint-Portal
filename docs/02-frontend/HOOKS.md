# Custom Hooks Reference

All custom hooks live in `src/hooks/`. Each is a focused, single-responsibility hook.

---

## `useLocalStorage<T>(key, defaultValue)`

**File:** `src/hooks/useLocalStorage.ts`

Persists state to `localStorage`. Works exactly like `useState` but survives page refresh.

```tsx
const [activePage, setActivePage] = useLocalStorage('activePage', 'Dashboard')
const [copilotOpen, setCopilotOpen] = useLocalStorage('copilot-panel-open', false)
```

**Keys in use:**
| Key | Default | Used for |
|---|---|---|
| `activePage` | `'Dashboard'` | Currently displayed page |
| `copilot-panel-open` | `false` | Whether the Endpoint Operations Copilot panel is open |

There are no `ito_auth` / `ito_role` keys — the app has no sign-in gate and always runs as Global Admin.

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
  sources: { intune, manageEngine }, mock: boolean }
```

**To change the refresh interval:** modify `REFRESH_INTERVAL_MS` in `useStats.ts`.

---

There is no `useActivity` hook — the Recent Activity feed and `/api/activity` route were removed in the differentiation refactor.

## `useNotifications()`

**File:** `src/hooks/useNotifications.ts`

Fetches notifications from `/api/notifications` once on mount (no default/seed list, no polling).

```tsx
const { notifications, markAllRead } = useNotifications()

await markAllRead()  // PATCH /api/notifications/read-all
```

---

## `useIntegrationStatus()`

**File:** `src/hooks/useIntegrationStatus.ts`

Polls `/api/integrations/status` every 10 seconds to show live integration health in the Settings page.

```tsx
const { status, loading, refresh } = useIntegrationStatus()
```

**Returns:** `status` — array of `IntegrationStatusItem`, one per source (intune, manageengine, openai, ...).

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

Manages the local UI state needed by the Dashboard page (currently just the runbook modal open/close state). Extracted from `DashboardContent` to keep the component clean.

```tsx
const { runbookModalOpen, setRunbookModalOpen } = useDashboardState()
```

---

## Adding a new hook

1. Create `src/hooks/useYourHook.ts`
2. Export a named function starting with `use`
3. If it fetches data, pattern-match `useIntegrationStatus.ts` (loading state, cleanup on unmount)
4. Import from `'./hooks/useYourHook'` in the consuming component
