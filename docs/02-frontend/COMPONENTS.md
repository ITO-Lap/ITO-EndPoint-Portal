# Component Reference

All components listed by folder. Each entry shows: file path, purpose, key props, and modification notes.

---

## UI Primitives (`src/components/ui/`)

### `Badge.tsx`
Coloured pill label for status values.

```tsx
<Badge variant="green">Compliant</Badge>
<Badge variant="red">Non-Compliant</Badge>
<Badge variant="yellow">Warning</Badge>
<Badge variant="orange">Medium</Badge>
<Badge variant="blue">Info</Badge>
<Badge variant="gray">Unknown</Badge>
```

**Variants:** `blue | red | green | orange | yellow | gray`  
**To add a variant:** add a new entry in the variant map inside `Badge.tsx`.

---

### `Button.tsx`
Styled button with variant and size options.

```tsx
<Button variant="primary" size="md" onClick={handler}>Save</Button>
<Button variant="secondary" size="sm">Cancel</Button>
<Button variant="danger" loading>Deleting...</Button>
```

**Variants:** `primary | secondary | danger | ghost`  
**Sizes:** `sm | md | lg`  
**Props:** `variant`, `size`, `loading`, `disabled`, `onClick`, `className`, all native button attrs.

---

### `Modal.tsx`
Accessible modal overlay with focus trap.

```tsx
<Modal open={isOpen} onClose={handleClose} title="Modal Title" size="lg">
  <p>Modal content here</p>
</Modal>
```

**Props:** `open: boolean`, `onClose: () => void`, `title: string`, `size?: 'sm' | 'md' | 'lg' | 'xl'`, `children`

---

### `DashboardCard.tsx`
White rounded card used as a section container throughout the dashboard.

```tsx
<DashboardCard title="Section Title" className="optional-extra-class">
  <p>Card content</p>
</DashboardCard>
```

---

### `Toast.tsx` + `ToastProvider.tsx`
Toast notification system. `ToastProvider` must wrap the app. Use `useToast()` to trigger toasts.

```tsx
// In App root:
<ToastProvider><App /></ToastProvider>

// Anywhere inside:
const { notify } = useToast()
notify('success', 'Saved', 'Changes saved successfully')
notify('error', 'Failed', 'Could not connect to server')
notify('info', 'Tip', 'You can search by serial number too')
```

Toasts auto-dismiss after 4 seconds. Max 3 visible at once (oldest is replaced).

---

## Layout (`src/components/layout/`)

### `Header.tsx`
Top navigation bar with search, notifications, and user menu.

**Key props:**
```tsx
<Header
  onMenuToggle={() => ...}          // mobile hamburger
  onSearch={(query) => ...}         // triggered on Enter / search button
  searchValue={string}
  onSearchChange={(val) => ...}
  searchLoading={boolean}
  notificationOpen={boolean}
  notifications={NotificationItem[]}
  onNotificationToggle={() => ...}
  onMarkAllNotificationsRead={() => ...}
  onProfileNav={(page) => ...}      // navigates to 'Profile' page
  onSignOut={() => ...}
  viewerRole={string}
/>
```

**To add a header action:** add to the right-side icon cluster in `Header.tsx`.

---

### `Sidebar.tsx`
Left navigation panel. Renders `navItems` from `dashboardData.ts`.

**Key props:**
```tsx
<Sidebar
  isOpen={boolean}          // controls mobile open/close
  onClose={() => ...}
  activePage={string}
  onNavSelect={(page) => ...}
  onSourceClick={(source) => ...}  // opens SourceModal
/>
```

**To add a nav item:** add an entry to `navItems` in `src/data/dashboardData.ts` and handle the page in `App.tsx`.

---

### `PlaceholderPage.tsx`
Used for pages not yet fully built. Shows a title, description, and "coming soon" illustration.

```tsx
<PlaceholderPage title="Diagnostics" description="Run diagnostic checks..." />
```

---

## Dashboard (`src/components/dashboard/`)

### `DashboardContent.tsx`
Root of the Dashboard page. Composes all dashboard sub-components.

**Key props:** `statCards`, `selectedDevice`, `onDeviceChange`, `runbookData`, `complianceSegments`, `issueCategories`, `recentActivityItems`, `isMockData`, `sourceCounts`, `countdown`, `lastUpdated`, `onRefresh`

---

### `StatCard.tsx`
Individual stat card (total devices, compliant, etc.).

```tsx
<StatCard
  title="Total Devices"
  value="12,842"
  trend="↑ 5.6%"
  trendChange="vs last 7 days"
  icon={Laptop2}
  accent="text-sky-700"
  iconBg="bg-sky-100"
  iconText="text-sky-600"
/>
```

**To add a stat card:** add an entry to `statCards` in `src/data/dashboardData.ts`.

---

### `ComplianceDonut.tsx`
SVG donut chart showing compliant / warning / non-compliant percentages.

**Props:** `segments: ComplianceSegment[]`  
Each segment: `{ label, value, percent, color }`

---

### `IssueCategories.tsx`
Horizontal bar breakdown of issue categories (BitLocker, Compliance Policies, etc.).

**Props:** `categories: IssueCategory[]`  
Each category: `{ label, value, color }`

---

### `RecentActivity.tsx`
Feed of recent device events. Shows last N items with status badge.

**Props:** `items: ActivityItem[]`, `onViewAll: () => void`

---

### `ActivityListModal.tsx`
Modal that shows the full activity list when user clicks "View All".

---

### `LiveDataBar.tsx`
Bar above dashboard showing data freshness (countdown to next refresh, last updated time, source counts, mock badge).

**Props:** `countdown`, `lastUpdated`, `isMockData`, `sourceCounts`, `onRefresh`

---

### `PolicyDetailsModal.tsx`
Modal showing full policy detail for a compliance issue.

---

## Devices (`src/components/devices/`)

### `DeviceLookupPage.tsx`
Full Device Lookup page with search, filters, results table, and detail panel.

**Props:** `onViewInDashboard: (deviceName: string) => Promise<void>`

**To modify search filters:** edit the filter state and `<select>` dropdowns inside this component.

---

### `DeviceSummary.tsx`
Device summary panel displayed on the Dashboard. Shows the currently selected device's identity, issue, and quick stats.

**Props:** `device: DeviceData`, `onDeviceChange: (name: string) => void`

---

### `DeviceDetailPanel.tsx`
Detailed side panel shown in Device Lookup. Shows hardware, network, security, apps, and LAPS info.

**Props:** `device: ApiDevice`, `onViewInDashboard: (name: string) => void`

---

### `ComplianceDetails.tsx`
Table of compliance detail rows (overall state, primary issue, severity, confidence, etc.).

**Props:** `device: DeviceData`

---

### `AllDevicesDrawer.tsx`
Slide-in drawer listing all devices for quick selection from the Dashboard.

---

### `SourceModal.tsx`
Modal that shows connection status and details for a connected MDM source (Intune, Kandji, ManageEngine, OpenAI). Opened by clicking a source chip in the sidebar.

**Props:** `open: boolean`, `source: ConnectedSource | null`, `onClose: () => void`

---

## Runbooks (`src/components/runbooks/`)

### `RunbookCard.tsx`
Card displaying a runbook name, steps preview, and metadata (escalation, automation).

**Props:** `runbook: RunbookData`, `onOpen: () => void`

---

### `RunbookModal.tsx`
Full modal showing all runbook steps with checkboxes, escalation path, and automation status.

**Props:** `open: boolean`, `runbook: RunbookData`, `onClose: () => void`

---

## Settings (`src/components/settings/`)

### `SettingsPage.tsx`
Full settings page with tabs: General, Integrations, Notifications, Compliance, Automation, Security, Data & Privacy, Danger Zone.

**To add a settings section:** add a new tab entry in the `tabs` array and a corresponding panel component.

---

### `QuietHoursModal.tsx`
Modal for configuring notification quiet hours (start/end time, days of week).

---

## Auth (`src/components/auth/`)

### `SignInPage.tsx`
Sign-in page with demo role selector. In production, replace the form with your SSO provider (Microsoft Entra ID).

**Props:** `onSignIn: (role: string) => void`, `justSignedOut: boolean`

**To add SSO:** replace the form in `SignInPage.tsx` with an OAuth redirect. The `onSignIn` callback must still be called with the user's role string after auth completes.

---

## Pages (`src/pages/`)

### `UsersPage.tsx`
Users management page with list view, search, role filter, and user detail drawer.

**Props:** `viewerRole: UserToolRole`

### `ProfilePage.tsx`
Current user's profile page with account info, notification preferences, and MFA status.

### `DocsPage.tsx`
In-app documentation viewer. Renders the project documentation inside the dashboard.
