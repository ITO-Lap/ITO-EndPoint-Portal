# Stale Devices

Read-only page (**Endpoint Management → Stale Devices**) that lists devices with **no verified management check-in for
more than 21 days**, correlating Intune and ManageEngine Endpoint Central (MDM). It measures management check-in
inactivity, not user sign-in activity. It has no retire / wipe / delete / unmanage / restart / remediation action.

## Scope (enforced before caching, counting, rendering and export)
| Source | In scope | Dropped at ingestion |
|---|---|---|
| Intune | Windows clients | Android, iOS, iPadOS, macOS, Linux, Windows Phone, Windows Server |
| Endpoint Central (MDM) | Windows clients, macOS | Android, iOS/iPadOS (unless the model is a Mac), unknown platform, Windows Server |

Out-of-scope records never reach the cache, the API, the CSV or any count. Windows Server is recognised from explicit
text (`operatingSystem`, `os_version`, `model`, `product_name`) and from server-only builds (20348, 25398). Builds shared by
a Windows 10 LTSC client and a Server release (14393, 17763), an Endpoint Central Windows record with no OS/model fields,
and Intune `managementAgent = eas` records cannot be classified, so they go to **Needs review** and stay out of stale totals.

## Stale rule (UTC)
`cutoff = now − 21 × 24 h`; `isStale = effectiveLastCheckIn < cutoff`.
- **Windows:** effective = latest valid check-in across Intune and Endpoint Central. Stale only when *every* source is older than the cutoff. One source recent and one older → **Source drift** (not stale).
- **macOS:** Endpoint Central only.
- A missing, sentinel (`0001-01-01`, epoch 0), unparsable or > 24 h future timestamp → **No check-in data**, never stale.
- If a source that the verdict depends on failed its last refresh, a would-be-stale device becomes **Needs review** instead (a more recent check-in there cannot be ruled out). An unconfigured source is not an error.

## Correlation
Matched by normalised serial number (placeholders such as "Default string" / "To Be Filled By O.E.M." are ignored). Intune
records that share an Entra device ID are collapsed. Endpoint Central's MDM payload carries no Entra ID, so serial is the
only cross-system key. **Device name never merges devices**: a same-name pair without a strong ID is shown as two
*Needs review* rows (`correlationConfidence: unresolved`) and excluded from stale totals. No manual-match store exists in
the project, so none was added.

User / email: Intune `userDisplayName` / `userPrincipalName` / `emailAddress` first; Endpoint Central `user` as a fallback and for macOS. Never inferred from the host name.

## Verified source fields
- **Intune** (`GET /v1.0/deviceManagement/managedDevices?$top=999&$select=…`, `@odata.nextLink` followed, no server-side filter relied on): `id, deviceName, operatingSystem, osVersion, serialNumber, userDisplayName, userPrincipalName, emailAddress, lastSyncDateTime, azureADDeviceId, managementAgent, managementState, enrolledDateTime`. Freshness = `lastSyncDateTime`.
- **Endpoint Central MDM** (`GET /api/v1/mdm/devices`, paginated list already used by the Managed Devices module; no per-device calls): `device_id, device_name, serial_number, platform_type, model, product_name, os_version, managed_status, is_removed, last_contact_time, user.user_email, user.user_name`. Freshness = `last_contact_time`.

## Remaining limitations (explicitly unavailable)
- `GET /api/v1/mdm/devices/{id}/polltime` is **not used**: its response shape is not verified anywhere in this project or in documentation found, and calling it per device would breach the cached-sync rule. Freshness is `last_contact_time` from the list.
- The MDM payload has no OS edition field, so Windows Server can only be excluded from explicit text / server-only builds (Windows Server 2025 shares build 26100 with Windows 11 24H2 and cannot be told apart).
- The Endpoint Central agent inventory (`DesktopCentralCloud.*` scopes, `allsystems` scan time) is not used; the current connection is MDM-only.
- No Entra ID in Endpoint Central → serial number is the only strong cross-system key.

## API (`/api/stale-devices`, roles Global Admin / IT Admin / Helpdesk; export: Global Admin / IT Admin)
`GET /status` · `POST /sync` (refreshes the cache in the background) · `GET /devices?view=stale|windows|macos|drift|review&platform=&managedBy=&bucket=21-30|31-60|61-90|90+&status=&q=&sortKey=&sortDir=&page=&pageSize=` · `GET /devices/detail?id=` · `GET /export?…&tz=` (same filters, CSV of the filtered rows only; formula-injection safe; export is logged with actor and row count).
Page loads read the cached snapshot (in memory + `server/.cache/stale-devices.v1.json`); a background refresh runs when it is older than 30 minutes. The cache holds names, serials and emails of in-scope devices.

## Time zones
All calculations are UTC. The page and CSV display times in the viewer's chosen zone (default **Asia/Kolkata**, stored in `localStorage`); the CSV also carries a UTC column.

## Tests
`server/src/services/staleDevices/__tests__/staleDevices.test.ts`, `server/src/routes/__tests__/staleDevices.test.ts`, `src/pages/__tests__/staleDevicesPage.test.tsx`.
