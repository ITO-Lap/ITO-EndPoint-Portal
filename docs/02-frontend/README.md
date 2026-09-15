# Frontend Guide

The frontend is a React 19 + TypeScript single-page application built with Vite and Tailwind CSS v4.

---

## Entry points

| File | Role |
|---|---|
| `index.html` | HTML shell — mounts `#root` |
| `src/main.tsx` | React root — renders `<App />` |
| `src/App.tsx` | Auth gate + page router + top-level state |
| `src/index.css` | Global styles + Tailwind imports |

---

## Folder structure

```
src/
├── App.tsx                   Root component
├── main.tsx                  React DOM entry
├── index.css                 Global CSS + Tailwind
├── types.ts                  All TypeScript interfaces
│
├── api/
│   └── index.ts              HTTP client — all fetch calls
│
├── data/
│   ├── dashboardData.ts      Mock data, nav items, stat cards, search helpers
│   └── usersData.ts          Mock user records
│
├── assets/
│   └── hero.png              Orphaned image asset (left over from the removed sign-in page; not imported anywhere)
│
├── hooks/
│   ├── useClickOutside.ts    Click-outside detection for dropdowns
│   ├── useDashboardState.ts  Dashboard UI state helper (runbook modal)
│   ├── useIntegrationStatus.ts  Polls /api/integrations/status every 10s
│   ├── useLocalStorage.ts    Persistent key-value store
│   ├── useNotifications.ts   Fetches /api/notifications once on mount
│   └── useStats.ts           Polls /api/devices/stats with countdown
│
├── components/
│   ├── ui/                   Reusable primitives
│   │   ├── Badge.tsx
│   │   ├── Button.tsx
│   │   ├── DashboardCard.tsx
│   │   ├── Modal.tsx
│   │   ├── Toast.tsx
│   │   └── ToastProvider.tsx
│   │
│   ├── layout/               App shell
│   │   ├── Header.tsx
│   │   ├── Sidebar.tsx
│   │   └── PlaceholderPage.tsx
│   │
│   ├── dashboard/            Dashboard widgets
│   │   ├── DashboardContent.tsx
│   │   ├── StatCard.tsx
│   │   ├── ComplianceDonut.tsx
│   │   ├── IssueCategories.tsx
│   │   ├── LiveDataBar.tsx
│   │   └── PolicyDetailsModal.tsx
│   │
│   ├── devices/              Device management
│   │   ├── DeviceSummary.tsx
│   │   ├── DeviceDetailPanel.tsx
│   │   ├── ComplianceDetails.tsx
│   │   ├── AllDevicesDrawer.tsx
│   │   └── SourceModal.tsx
│   │
│   ├── runbooks/             Runbook + Jira/Confluence display
│   │   ├── RunbookCard.tsx
│   │   ├── RunbookModal.tsx
│   │   ├── JiraModal.tsx
│   │   └── ConfluenceModal.tsx
│   │
│   ├── settings/             Settings page
│   │   ├── SettingsPage.tsx
│   │   └── QuietHoursModal.tsx
│   │
│   ├── automation/           Automation rules engine UI
│   ├── copilot/              Endpoint Operations Copilot chat panel
│   └── entra/                Entra Intelligence dashboard
│
└── pages/                    Full-page components (see src/pages/ for the current, full list)
    ├── UsersPage.tsx
    ├── IntuneDevicesPage.tsx
    ├── MacDevicesPage.tsx
    └── DocsPage.tsx
```

There is no `src/components/auth/` folder — the sign-in screen was deliberately removed; the app
always runs as Global Admin with no auth gate.

---

## Key patterns

### Page routing

There is no URL router. Navigation is a string stored in localStorage:

```tsx
const [activePage, setActivePage] = useLocalStorage('activePage', 'Dashboard')

// In App.tsx JSX:
{activePage === 'Dashboard' ? <DashboardContent ... />
  : activePage === 'Users' ? <UsersPage ... />
  : <PlaceholderPage title={activePage} />}
```

To add a new page: add its title to `navItems` in `dashboardData.ts`, then add a branch in `App.tsx`.

### Toast notifications

Use the `useToast` hook anywhere inside `<ToastProvider>`:

```tsx
const { notify } = useToast()
notify('success', 'Title', 'Message body')
notify('error', 'Error', 'Something went wrong')
notify('info', 'Info', 'FYI message')
```

### Component sections

- **`ui/`** — no business logic, pure presentational primitives
- **`layout/`** — structural app-shell components
- **`dashboard/`** — widgets specific to the main dashboard view
- **`devices/`** — device search, lookup, and detail display
- **`runbooks/`** — runbook card and step modal
- **`settings/`** — settings form sections
- **`auth/`** — sign-in form

---

## Further reading

- [Components](COMPONENTS.md) — every component with props
- [Hooks](HOOKS.md) — all hooks with usage examples
- [Routing](ROUTING.md) — navigation and page routing in detail
