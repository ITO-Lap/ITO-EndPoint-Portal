# Dashboard Feature

The Dashboard is the app's landing page (there is no sign-in step). It provides a real-time compliance overview of the entire device fleet.

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
│  ┌────────────────────────────────────────────────────────┐ │
│  │ Runbook Card (recommended for selected device)          │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

(The Recent Activity feed shown here in earlier versions was removed in the differentiation refactor
— there is no `RecentActivity`/`ActivityListModal` component or `/api/activity` route anymore.)

---

## Data sources

| Widget | Source | Refresh |
|---|---|---|
| Stat cards | `GET /api/devices/stats` | Every 30s |
| Compliance donut | Same as stats | Every 30s |
| Issue categories | Static (`dashboardData.ts`) | On load |
| Device summary | Selected device state | On search/select |
| Runbook card | Derived from selected device | On device change |
| LiveDataBar | Stats response + countdown | Every 1s (countdown) |

---

## Live data vs empty state

`GET /api/devices/stats` no longer falls back to synthetic mock devices — when no MDM source is
configured, stats reflect zero devices (`mock` is always `false` in the response now). The
LiveDataBar's "Mock Data" badge logic still exists but is effectively unused for this endpoint;
connect Intune or ManageEngine in Settings → Integrations to see real data.

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

Shows the **currently selected device**. There is no device selected on first load (`selectedDevice` starts as `null` in `App.tsx`) — the panel appears once a device is searched or picked from the All Devices drawer.

To change the selected device:
- Use the **header search bar** — searches by name, email, or serial
- Use the **All Devices** drawer (opened from the dashboard) to pick a device directly

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
| `src/components/devices/DeviceSummary.tsx` | Device detail panel |
| `src/components/devices/ComplianceDetails.tsx` | Compliance rows |
| `src/components/devices/AllDevicesDrawer.tsx` | All-devices picker drawer |
| `src/components/runbooks/RunbookCard.tsx` | Runbook card |
| `src/components/runbooks/RunbookModal.tsx` | Runbook steps modal |
| `src/hooks/useStats.ts` | Stats polling hook |
| `src/data/dashboardData.ts` | Static data + helpers |
