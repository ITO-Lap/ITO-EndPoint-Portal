# Device Logs (Managed Devices)

> **Location:** Managed Devices → open a Windows or macOS device → **Logs** tab
> **Permission:** `devices.logs` (Global Admin, IT Admin and Helpdesk by default; toggle for custom roles in Settings → Roles & Permissions)

## Activity log

A read-only timeline for one device, newest first, assembled from what the connected sources already return. Each source is pulled independently, so a failure in one is shown as an amber note and never hides the rest.

| Category | Source |
|---|---|
| Device, Compliance | Device record: enrollment, last check-in, compliance state, issue first/last detected, encryption, passcode |
| Policy | Intune compliance/configuration policy states; ManageEngine applied policies |
| Profile | ManageEngine profile results with applied time and remarks |
| Action, Remote action | Intune device actions and the remote-action audit (sync, restart, wipe, …). The audit uses the beta Graph `remoteActionAudits` collection; if Graph refuses the server-side filter the app reads recent audits and matches the device locally. |
| App | Intune detected apps; ManageEngine installed apps |

The tab has category chips, search, **Pull again**, **Export Excel** and **Export CSV** (all entries; the table view shows the first 500). Exports neutralise spreadsheet formulas (cells starting with `=`, `+`, `-`, `@`) because device and app names are user-controlled. Each export is logged server-side with the requesting user.

## Collect diagnostics (Windows on Intune)

Asks Intune to collect the device's own diagnostic logs (beta Graph API: `createDeviceLogCollectionRequest`). The device must be online. The UI confirms first, polls every 15 s and offers a zip download when Intune finishes.

Requires the Graph **application** permission `DeviceManagementManagedDevices.PrivilegedOperations.All` with admin consent; without it the panel shows the Graph error. macOS devices show the activity log only: the ManageEngine API used here exposes no on-device log collection.

## API

Under `/api/devices` (session + `devices.logs`): `GET /:id/logs`, `GET /:id/logs/export?format=csv|excel`, `POST /:id/diagnostics`, `GET /:id/diagnostics/:requestId`. Code: `server/src/services/deviceLogs.ts`, `src/components/devices/DeviceLogsTab.tsx`.

## Known limits

- Graph can answer 429 (too many requests) on large tenants; the affected section is reported as failed and a later *Pull again* fills it.
- The action-history sections need `DeviceManagementManagedDevices.Read.All`.
- The diagnostics request body follows Microsoft's beta documentation and should be confirmed on one test device before wider use.
