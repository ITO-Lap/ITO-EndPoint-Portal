# ManageEngine Integration

Connects to **ManageEngine MDM On-Demand** (Endpoint Central Cloud) to fetch cross-platform device
inventory, per-device security posture, installed applications, and applied configuration profiles.

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

Device-list rows only include devices with `managed_status: "2"` (actively enrolled) — the API also
returns unenrolled/removed devices with just an id and status, which are filtered out rather than
shown as broken rows. Security detail is fetched per-device (batched, 8 concurrent) since MDM
On-Demand tenants are typically small (tens–hundreds of devices), unlike Intune's often 1000s.

Policy/app data is lazy-fetched per device (via `GET /api/devices/:id/apps` and
`GET /api/devices/:id/policies`) the same way Intune and Kandji already work — opening a device's
detail panel surfaces its real Applications and Compliance/Policy tabs.

---

## Compliance state mapping

| Condition | Mapped state |
|---|---|
| Rooted/jailbroken device | Non-Compliant |
| Storage encryption disabled | Non-Compliant |
| No passcode set | Warning |
| Otherwise | Compliant |

---

## Troubleshooting

| Error | Cause | Fix |
|---|---|---|
| `ManageEngine credentials not configured` | No env vars or UI config | Add all four credential values to `server/.env` |
| `ManageEngine auth failed` | Wrong client ID/secret, or refresh token expired/revoked | Regenerate the refresh token in the Zoho API Console |
| `ManageEngine API 401` on `/apps` or similar | The granted OAuth scope doesn't cover that endpoint | Re-generate the refresh token with the required scope |
| `ManageEngine API 404 ... invalid URL` | Endpoint path not valid for this tenant/API version | Confirm the API domain matches your tenant's actual MDM data center |
