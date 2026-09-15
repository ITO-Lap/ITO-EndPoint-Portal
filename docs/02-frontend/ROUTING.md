# Routing & Navigation

The app uses **string-based page routing** via `localStorage` instead of a URL router. This gives it a desktop-app feel where the URL never changes.

---

## How navigation works

```
User clicks nav item
  → Sidebar calls onNavSelect(page.title)
    → App.tsx: setActivePage(page.title)
      → localStorage 'activePage' = 'Dashboard'
        → JSX conditional renders the correct page component
```

The `activePage` value persists across browser refreshes.

---

## Page registry

Defined in two places:

**1. Nav items** — `src/data/dashboardData.ts` → `navItems`  
Controls what appears in the sidebar.

Nav items are grouped by section (`Overview`, `Endpoint Management`, `Security & Compliance`, `Users & Identity`, `Automation`, `Analytics & Reports`, `Intelligence Platform`, `Platform`) via the `group` field:

```ts
export const navItems: NavItem[] = [
  { id: 'dashboard', title: 'Dashboard', icon: Home, group: 'Overview', active: true },
  { id: 'mac_devices', title: 'Mac Devices', icon: Monitor, group: 'Endpoint Management' },
  { id: 'intune_devices', title: 'Intune Devices', icon: Server, group: 'Endpoint Management' },
  { id: 'users', title: 'Users', icon: Users, group: 'Users & Identity' },
  { id: 'automation', title: 'Automation', icon: Zap, group: 'Automation' },
  { id: 'settings', title: 'Settings', icon: Settings, group: 'Platform' },
  // ...see src/data/dashboardData.ts for the full, current list
]
```

Some pages (e.g. Entra Intelligence, Mac Fleet Reports, User Intelligence, Documentation, Scheduled Reports) are reached by drill-down from another page rather than a direct sidebar entry, so they aren't in `navItems` at all.

**2. Page router** — `src/App.tsx`  
The JSX `if/else` that maps page title → component:

```tsx
{activePage === 'Dashboard'          ? <DashboardContent ... />
: activePage === 'Mac Devices'       ? <MacDevicesPage ... />
: activePage === 'Intune Devices'    ? <IntuneDevicesPage ... />
: activePage === 'Users'             ? <UsersPage ... />
: activePage === 'Settings'          ? <SettingsPage />
: activePage === 'Documentation'     ? <DocsPage />
:                                       <PlaceholderPage title={activePage} />}
```

Pages not explicitly handled fall through to `<PlaceholderPage>` — see `src/App.tsx` for the full, current list of handled `activePage` branches.

---

## Page descriptions

`PAGE_META` in `App.tsx` provides description text used above placeholder/drill-down pages:

```ts
const PAGE_META: Record<string, { description: string }> = {
  'Users':               { description: '...' },
  'Reports & Analytics': { description: '...' },
  'Settings':            { description: '...' },
}
```

---

## Role-based navigation

Some pages are hidden from the sidebar based on role. The `Sidebar` component filters `navItems` depending on `viewerRole`. Helpdesk users do not see Settings; IT Admins do not see user management. See [ROLES.md](../ROLES.md) for the full matrix.

---

## Programmatic navigation

Any component can navigate by calling `setActivePage` — which is passed down as `onNavSelect` / `onProfileNav` / etc.:

```tsx
// Navigate to Documentation from the header's profile menu
onProfileNav('Documentation')

// Navigate to dashboard after device search
setActivePage('Dashboard')
```

---

## Adding a new page

1. Add to `navItems` in `src/data/dashboardData.ts`:
   ```ts
   { title: 'My New Page', icon: SomeIcon }
   ```

2. Create `src/pages/MyNewPage.tsx` (or `src/components/mynewpage/MyNewPage.tsx`)

3. Add a branch in `App.tsx`:
   ```tsx
   : activePage === 'My New Page' ? <MyNewPage />
   ```

4. (Optional) Add description to `PAGE_META` in `App.tsx`.
