# Kandji Integration

Connects to Kandji MDM to fetch macOS and iOS device records, blueprint compliance, and FileVault status.

---

## Prerequisites

- A Kandji account with API access enabled
- An API token with **Device List** read permissions

---

## Kandji API token setup

1. Log in to **Kandji Admin Console**
2. Go to **Settings → Access → API Token**
3. Click **Add API Token**
4. Name it (e.g., `ITO Endpoint Copilot`)
5. Set permissions: **Devices → Read**
6. Copy the token — it will not be shown again

Your **subdomain** is the first part of your Kandji URL: `https://myorg.kandji.io` → subdomain is `myorg`.

---

## Configuration

### Via environment variables (`server/.env`)

```env
KANDJI_API_URL=https://myorg.api.kandji.io
KANDJI_API_TOKEN=your-api-token-here
```

The subdomain is automatically extracted from `KANDJI_API_URL`.

### Via Settings UI

Settings → Integrations → Kandji → fill in API Token and Subdomain.

---

## What data is fetched

Each device returns:

| Field | Kandji API field |
|---|---|
| Device name | `device_name` |
| Serial number | `serial_number` |
| Platform | `platform` (mapped to macOS / iOS) |
| OS version | `os_version` |
| Last sync | `last_check_in` |
| MDM enabled | `mdm_enabled` (used for compliance inference) |
| FileVault | `filevault_enabled` |
| Blueprint | `blueprint_name` |
| User | `assigned_user.email` |

---

## Compliance state mapping

Kandji does not have a direct compliance concept. ITO Endpoint infers compliance:

| Condition | Mapped state |
|---|---|
| `mdm_enabled: true` + all checks passing | Compliant |
| `filevault_enabled: false` | Warning |
| `mdm_enabled: false` | Non-Compliant |

---

## Troubleshooting

| Error | Cause | Fix |
|---|---|---|
| `Kandji credentials not configured` | No env vars or UI config | Add token to `server/.env` |
| `401 Unauthorized` | Invalid or expired token | Regenerate token in Kandji Admin Console |
| `404 Not Found` | Wrong subdomain | Check your Kandji URL |
| Empty device list | No devices enrolled | Check Kandji → Devices |
