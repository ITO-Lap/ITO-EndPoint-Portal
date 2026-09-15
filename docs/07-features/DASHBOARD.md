# Dashboard Feature

The Dashboard is the landing page after sign-in. It provides a real-time compliance overview of the entire device fleet.

---

## Layout

```
┌─────────────────────────────────────────────────────────────┐
│ LiveDataBar — refresh countdown, last updated, source counts │
├──────────┬──────────┬──────────┬──────────┬─────────────────┤
│ Total    │ Compliant│Non-Comp. │Mac       │ Open Issues     │
│ Devices  │ Devices  │          │(MgE)     │                 │
├──────────┴──────────┴──────────┴──────────┴─────────────────┤
│                                                              │
│  ┌────────────────────┐  ┌──────────────────────────────┐  │
│  │ Compliance Donut   │  │ Issue Categories (bar chart) │  │
│  │ chart + legend     │  │                              │  │
│  └────────────────────┘  └──────────────────────────────┘  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ Device Summary                                         │ │
│  │ (identity, compliance, issue, next steps, security)    │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌────────────────────┐  ┌──────────────────────────────┐  │
│  │ Runbook Card       │  │ Recent Activity              │  │
│  │ (recommended for   │  │ (last 6 events, View All)    │  │
│  │  selected device)  │  │                              │  │
│  └────────────────────┘  └──────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## Data sources

| Widget | Source | Refresh |
|---|---|---|
| Stat cards | `GET /api/devices/stats` | Every 30s |
| Compliance donut | Same as stats | Every 30s |
| Issue categories | Static (`dashboardData.ts`) | On load |
| Device summary | Selected device state | On search/select |
| Runbook card | Derived from selected device | On device change |
| Recent activity | `GET /api/activity` | Every 60s |
| LiveDataBar | Stats response + countdown | Every 1s (countdown) |

---

## Live data vs mock data

When no MDM is configured, stats come from counting `mockDevices`. The `mock: true` flag in the API response triggers a "Mock Data" badge on the LiveDataBar. Everything still works — the badge simply communicates that data isn't live.

---

## Stat cards

Five stat cards, updated from live `ApiStats`:

| Card | Stat field |
|---|---|
| Total Devices | `stats.total` |
| Compliant Devices | `stats.compliant` |
| Non-Compliant | `stats.nonCompliant` |
| Mac Devices (ManageEngine) | `stats.mac` |
| Open Issues | `stats.nonCompliant + stats.warning` |

**To add a stat card:** see [Quick Mods](../06-development/QUICK-MODS.md#add-a-new-stat-card).

---

## Compliance donut chart

SVG-rendered donut with three segments: Compliant (green), Warning (amber), Non-Compliant (red).

Values come from `liveComplianceSegments` in `App.tsx`, derived from `stats` when live or from `complianceSegments` in `dashboardData.ts` as fallback.

---

## Device summary panel

Shows the **currently selected device**. The default device on first load is `LAPTOP-8F7G2Q1` from mock data.

To change the selected device:
- Use the **header search bar** — searches by name, email, or serial
- Use the **Device Lookup page** → "View in Dashboard"
- Click any device name in the **Recent Activity** feed

The panel shows:
- Identity (name, user, serial, platform, management source)
- Last check-in time
- Compliance state badge
- Primary issue + policy failed
- Severity + confidence
- Issue category
- Next steps
- Compliance detail rows (see `ComplianceDetails.tsx`)
- Security profile (if available) — risk score, EDR, firewall, vulnerabilities, unauthorized apps, recent security events

---

## Runbook card

Displayed below the device summary. Shows the AI-recommended runbook for the selected device's issue. Logic in `getRunbookForDevice()` in `dashboardData.ts`:

- Compliant device → "No Action Required"
- macOS device → FileVault runbook
- Windows with OS update issue → "Force OS Update via Intune"
- All others → BitLocker runbook

Clicking "View Steps" opens `RunbookModal`.

---

## Recent activity

Last 6 activity events from `GET /api/activity`. Each row shows device name, status badge, message, and time. "View All" opens `ActivityListModal` with the full list.

---

## LiveDataBar

Thin bar at the top of the dashboard showing:
- Countdown in seconds to next auto-refresh
- "Refresh now" button
- Last updated timestamp
- Per-source device counts (Intune · ManageEngine)
- "Mock Data" badge when no live sources are connected

---

## Key files

| File | Role |
|---|---|
| `src/components/dashboard/DashboardContent.tsx` | Root composer |
| `src/components/dashboard/StatCard.tsx` | Individual stat card |
| `src/components/dashboard/ComplianceDonut.tsx` | Donut chart |
| `src/components/dashboard/IssueCategories.tsx` | Bar chart |
| `src/components/dashboard/LiveDataBar.tsx` | Data freshness bar |
| `src/components/dashboard/RecentActivity.tsx` | Activity feed |
| `src/components/dashboard/ActivityListModal.tsx` | Full activity modal |
| `src/components/devices/DeviceSummary.tsx` | Device detail panel |
| `src/components/devices/ComplianceDetails.tsx` | Compliance rows |
| `src/components/runbooks/RunbookCard.tsx` | Runbook card |
| `src/components/runbooks/RunbookModal.tsx` | Runbook steps modal |
| `src/hooks/useStats.ts` | Stats polling hook |
| `src/hooks/useActivity.ts` | Activity polling hook |
| `src/data/dashboardData.ts` | Static data + helpers |
