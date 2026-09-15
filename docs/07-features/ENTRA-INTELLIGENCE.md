# Entra Intelligence Dashboard — Feature Guide

> **Location:** Endpoint Management → Entra Intelligence
> **Audience:** Intune Admins · Helpdesk · Security Admins
> **Data source:** Microsoft Graph API via `/api/entra/devices` (live when Entra ID/Intune credentials are configured); demo data otherwise
> **Component:** `src/components/entra/EntraIntelligenceDashboard.tsx`

---

## What It Does

The Entra Intelligence Dashboard is a focused, dark-themed view of the managed device fleet pulled
from Microsoft Graph. It renders two collapsible widgets:

- **Devices by Platform** — a horizontal bar breakdown of device count/percentage per OS (Windows,
  macOS, iOS/iPadOS, Android, Linux)
- **Devices with Stale Check-in** — a table of every device that hasn't checked in for more than 7
  days, sorted oldest-first

Both widgets are driven by the same device list, fetched once on mount and again on **Refresh**.

---

## Accessing It

Navigate to **Endpoint Management → Entra Intelligence** in the sidebar.

The header shows a status indicator:
- 🟢 **Live · Microsoft Graph** — `fetchEntraDevices()` returned real devices
- 🟡 **Demo data** — no credentials configured, or the fetch failed/returned nothing; showing synthetic example data from `src/data/entraData.ts`

If a fetch fails outright, a red error banner is shown above the widgets (`Data fetch error: ... — Showing last known / demo data.`) in addition to — not instead of — the demo-mode banner.

---

## Live Data vs Demo Mode

| Data Type | When Live | When Demo |
|---|---|---|
| Device inventory | Real Intune/Entra managed devices from `GET /api/entra/devices?limit=100` | 8 synthetic devices (`ENTRA_DEVICES` in `src/data/entraData.ts`) |
| Platform distribution | Computed client-side from live device list | Computed client-side from mock device list |
| Stale check-in table | Computed client-side from live device list | Computed client-side from mock device list |

---

## Required Microsoft Graph Permissions

The following **Application** permission must be granted to your app registration for live data:

| Permission | Purpose |
|---|---|
| `DeviceManagementManagedDevices.Read.All` | Intune device inventory (device name, user, OS, compliance state, check-in time) |

**To add permissions:** Azure Portal → App registrations → your app → API permissions → Add a permission → Microsoft Graph → Application → search `DeviceManagement` → **Grant admin consent**.

---

## Components

### Integration status strip

A row of four chips (Microsoft Graph, Intune, Azure AD, Security Center) that all flip green/"Connected" together when the device fetch succeeds (`isLive`), or stay grey/"Not configured" otherwise. This is a single combined indicator, not four independently-checked integrations.

### Devices by Platform

Horizontal progress bars for Windows, macOS, iOS/iPadOS, Android, and Linux, each showing count and percentage of the total fetched device list, with a running total at the bottom.

### Devices with Stale Check-in

Table of devices with `daysSinceCheckIn > 7`, sorted by staleness descending. Columns: Device, User (name + UPN), Last Check-In (amber if 7–14 days, red if 14+), OS, Compliance (colored chip), Issues (open issue count or "None"). Shows a green "no stale devices" message when the fleet is fully current.

Both sections are collapsible via the header chevron and default to expanded.

---

## Files

| File | Purpose |
|---|---|
| `src/components/entra/EntraIntelligenceDashboard.tsx` | Dashboard component — fetch, header, both widgets |
| `src/data/entraData.ts` | `EntraDevice` type + demo/mock device list used as the fallback |
| `server/src/routes/entra.ts` | Express router, including `GET /api/entra/devices` |
| `server/src/services/entraIntelligence.ts` | Graph API device-fetch logic |

---

## Design

The dashboard uses a deliberately dark navy theme (`bg-[#0d1117]`) to visually distinguish it from the rest of the light-themed app — signalling "this is a Microsoft Entra/Intune section."

---

## Related Docs
- [Entra ID Integration Setup](../04-integrations/ENTRA.md) — credentials, permissions, Graph API
