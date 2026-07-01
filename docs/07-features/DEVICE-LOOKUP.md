# Device Lookup Feature

The Device Lookup page lets users search, filter, and inspect any managed device across all connected MDM sources.

---

## What it does

- **Search** — by device name, user email, or serial number
- **Filter** — by MDM source, compliance state, and platform
- **Browse** — paginated results table with compliance badges
- **Inspect** — click any device to open the full detail panel
- **Act** — "View in Dashboard" button to set a device as the dashboard focus

---

## Components

| Component | File |
|---|---|
| Page wrapper | `src/components/devices/DeviceLookupPage.tsx` |
| Device detail panel | `src/components/devices/DeviceDetailPanel.tsx` |
| All devices drawer | `src/components/devices/AllDevicesDrawer.tsx` |

---

## Search flow

```
User types query + presses Enter (or clicks search button)
  → POST /api/devices?q=<query>&source=<source>&compliance=<state>&platform=<platform>&limit=200
  → Results rendered in table
  → Click row → opens DeviceDetailPanel
  → "View in Dashboard" → calls onViewInDashboard(deviceName)
    → App.tsx handleDeviceSelect() → switches to Dashboard page
```

---

## Device detail panel tabs

The side panel that opens on device click has multiple tabs:

| Tab | Content |
|---|---|
| **Overview** | Identity, compliance state, management source, last check-in |
| **Hardware** | Manufacturer, model, storage, memory, architecture |
| **Network** | IP address, MAC address, WiFi MAC |
| **Security** | Firewall, antivirus, secure boot, TPM version |
| **Apps** | Installed application list with status and error codes |
| **Compliance** | Applied policies, last compliance check |
| **LAPS** | LAPS enabled/disabled, account name, password rotation |

---

## API used

```
GET /api/devices?q=query&source=intune&compliance=Non-Compliant&platform=Windows&limit=200
```

Response includes `mock: true` when no MDM sources are configured.

---

## Filter options

| Filter | Values |
|---|---|
| Source | All Sources · Microsoft Intune · Kandji · ManageEngine |
| Compliance | All States · Compliant · Warning · Non-Compliant |
| Platform | All Platforms · Windows · macOS · Linux |

Filters are applied server-side. Changing a filter re-fetches immediately.

---

## Extending device details

To add new fields to the device detail panel:

1. Add the field to `ApiDevice` in `src/api/index.ts`
2. Add to server `Device` type in `server/src/types.ts`
3. Populate it in the MDM service mappings (`services/intune.ts`, etc.)
4. Render it in the appropriate tab in `DeviceDetailPanel.tsx`

---

## Key files

| File | Role |
|---|---|
| `src/components/devices/DeviceLookupPage.tsx` | Page root, filter state, search |
| `src/components/devices/DeviceDetailPanel.tsx` | Side panel with tabbed detail |
| `src/components/devices/AllDevicesDrawer.tsx` | Drawer listing all devices |
| `src/api/index.ts` → `fetchAllDevicesRaw()` | API call with all filter params |
| `server/src/routes/devices.ts` | Server route handling the request |
