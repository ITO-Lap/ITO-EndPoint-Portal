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

```ts
export const navItems: NavItem[] = [
  { title: 'Dashboard',          icon: Home,       active: true },
  { title: 'Device Lookup',      icon: Search },
  { title: 'Users',              icon: Users },
  { title: 'Runbooks',           icon: BookOpen },
  { title: 'Diagnostics',        icon: Activity },
  { title: 'Reports & Analytics',icon: BarChart3 },
  { title: 'Activity Log',       icon: Clock3 },
  { title: 'Settings',           icon: Settings },
  { title: 'Documentation',      icon: BookMarked },
]
```

**2. Page router** — `src/App.tsx`  
The JSX `if/else` that maps page title → component:

```tsx
{activePage === 'Dashboard'     ? <DashboardContent ... />
: activePage === 'Device Lookup'? <DeviceLookupPage ... />
: activePage === 'Users'        ? <UsersPage ... />
: activePage === 'Profile'      ? <ProfilePage />
: activePage === 'Settings'     ? <SettingsPage />
: activePage === 'Documentation'? <DocsPage />
:                                 <PlaceholderPage title={activePage} />}
```

Pages not explicitly handled fall through to `<PlaceholderPage>`.

---

## Page descriptions

`PAGE_META` in `App.tsx` provides description text for placeholder pages:

```ts
const PAGE_META: Record<string, { description: string }> = {
  'Device Lookup':      { description: '...' },
  'Runbooks':           { description: '...' },
  'Diagnostics':        { description: '...' },
  'Reports & Analytics':{ description: '...' },
  'Activity Log':       { description: '...' },
  'Settings':           { description: '...' },
}
```

---

## Role-based navigation

Some pages are hidden from the sidebar based on role. The `Sidebar` component filters `navItems` depending on `viewerRole`. Helpdesk users do not see Settings; IT Admins do not see user management. See [ROLES.md](../ROLES.md) for the full matrix.

---

## Programmatic navigation

Any component can navigate by calling `setActivePage` — which is passed down as `onNavSelect` / `onProfileNav` / etc.:

```tsx
// Navigate to profile from header
onProfileNav('Profile')

// Navigate to dashboard after device search
setActivePage('Dashboard')

// Navigate to device lookup with a pre-filled search
setActivePage('Device Lookup')
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
