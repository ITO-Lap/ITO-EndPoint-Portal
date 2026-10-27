# ManageEngine Integration

Connects to **ManageEngine MDM On-Demand** (Endpoint Central Cloud) to fetch cross-platform device
inventory, per-device security posture, installed applications, and applied configuration profiles.
`mapPlatform()` detects macOS from the device's model/`product_name`, so ManageEngine is also the
Mac Devices module's device source — there is no separate macOS-only MDM integration.

> This is the **cloud** MDM product (Zoho OAuth2), not on-prem Endpoint Central's static-API-key
> scheme — the two have completely different auth and endpoint shapes. If your org runs on-prem
> Endpoint Central instead, this integration will not work as-is.

---

## Prerequisites

- A ManageEngine MDM On-Demand tenant
- A Zoho API Console **Self Client** with the `MDMOnDemand.MDMInventory.READ` scope

---

## Credential setup

1. Go to the [Zoho API Console](https://api-console.zoho.com) → **Self Client**
2. Generate a Client ID / Client Secret
3. Generate a refresh token for scope `MDMOnDemand.MDMInventory.READ`
4. Note your tenant's MDM API domain (typically `https://mdm.manageengine.com`)

---

## Configuration

### Via environment variables (`server/.env`)

```env
MANAGEENGINE_CLIENT_ID=1000.XXXXXXXXXX
MANAGEENGINE_CLIENT_SECRET=your-client-secret
MANAGEENGINE_REFRESH_TOKEN=1000.XXXXXXXXXX.XXXXXXXXXX
MANAGEENGINE_API_DOMAIN=https://mdm.manageengine.com
```

### Via Settings UI

Settings → Integrations → ManageEngine → fill in Client ID, Client Secret, Refresh Token, API Domain.

---

## What data is fetched

| Endpoint | Data |
|---|---|
| `GET /api/v1/mdm/devices` | Device list — name, serial, platform, OS version, last check-in, user |
| `GET /api/v1/mdm/devices/:id` | Per-device detail — `security` block (storage encryption, passcode, rooted status), storage, OS build, network MACs |
| `GET /api/v1/mdm/devices/:id/apps` | Installed application inventory |
| `GET /api/v1/mdm/devices/:id/profiles` | Applied configuration/compliance profiles (policy status) |

The [official Devices API reference](https://www.manageengine.com/mobile-device-management/api/devices/)
documents the per-device profiles endpoint, which returns association results such as `profile_id`,
profile_name`, `status`, `remarks`, `localized_remarks`, and `applied_time` (scope:
`MDMOnDemand.MDMInventory.READ`). The Mac inventory now fetches these results for active
ManageEngine Macs in batches of eight and displays each device's returned profile status in the
MDM Status / Profiles column. Device details show all fields. Status values are passed through and
are not translated into a pass/fail or overall device-compliance verdict.

The backend coalesces concurrent requests for the same tenant/device and caches successful
responses in memory for five minutes. If a refresh fails after cached data expires, the last
successful response is returned marked stale; an individual API failure does not prevent other
devices in the fleet batch from returning results. This cache is process-local and is cleared on
server restart. `GET /api/devices/manageengine/profile-results` returns the fleet result envelope;
`GET /api/devices/:id/profile-results` returns one device's cached/refreshed snapshot.

The published API's `/api/v1/mdm/compliance` resource is for geofencing compliance policy
management, not an overall device-compliance verdict. The documented device detail and profile
resources do not provide a native aggregate MDM compliance status or a timestamp for an overall
compliance synchronization. The Mac inventory therefore reports overall MDM compliance as
Unavailable; profile `applied_time` is the vendor's profile timestamp, not a sync timestamp. No
compliance database fields or migration are added.

Device-list rows only include devices with `managed_status: "2"` (actively enrolled) — the API also
returns unenrolled/removed devices with just an id and status, which are filtered out rather than
shown as broken rows. Security detail is fetched per-device (batched, 8 concurrent) since MDM
On-Demand tenants are typically small (tens–hundreds of devices), unlike Intune's often 1000s.

Policy/app data is lazy-fetched per device (via `GET /api/devices/:id/apps` and
`GET /api/devices/:id/policies`) the same way Intune already works — opening a device's
detail panel surfaces its real Applications and Compliance/Policy tabs.

---

The existing normalized device model still contains security-derived fields used by other
application areas. They are not presented as Endpoint Central's native MDM compliance verdict in
the Mac inventory or device Compliance tab.

---

## Troubleshooting

| Error | Cause | Fix |
|---|---|---|
| `ManageEngine credentials not configured` | No env vars or UI config | Add all four credential values to `server/.env` |
| `ManageEngine auth failed` | Wrong client ID/secret, or refresh token expired/revoked | Regenerate the refresh token in the Zoho API Console |
| `ManageEngine API 401` on `/apps` or similar | The granted OAuth scope doesn't cover that endpoint | Re-generate the refresh token with the required scope |
| `ManageEngine API 404 ... invalid URL` | Endpoint path not valid for this tenant/API version | Confirm the API domain matches your tenant's actual MDM data center |
