# ManageEngine Integration

Connects to **ManageEngine Endpoint Central** (formerly Desktop Central) to fetch cross-platform device records, patch status, and inventory data.

---

## Prerequisites

- ManageEngine Endpoint Central with API access
- An API key with read access to device/computer data

---

## ManageEngine API key setup

1. Log in to your ManageEngine Endpoint Central console
2. Go to **Admin → API Key Management** (or Technician API key)
3. Generate a new API key for a read-only technician account
4. Note the **Server URL** (e.g., `https://endpointcentral.yourcompany.com`) and port if non-standard

---

## Configuration

### Via environment variables (`server/.env`)

```env
MANAGEENGINE_URL=https://endpointcentral.yourcompany.com
MANAGEENGINE_API_KEY=your-api-key-here
# Optional — only if non-standard port
# MANAGEENGINE_PORT=8443
```

### Via Settings UI

Settings → Integrations → ManageEngine → fill in Server URL, API Key, and optionally Port.

---

## What data is fetched

ManageEngine provides broader cross-platform inventory:

| Field | Description |
|---|---|
| Device name | Computer name |
| Platform | Windows / macOS / Linux |
| OS version | Full OS version string |
| User | Last logged-in user |
| Serial number | Hardware serial |
| Last sync | Last agent check-in time |
| Patch status | Missing patches count |
| Antivirus | AV product and status |
| Department | AD/LDAP organizational unit |

---

## Compliance state mapping

| Condition | Mapped state |
|---|---|
| Agent active + patches current | Compliant |
| Missing patches (1–5) | Warning |
| Agent offline OR missing critical patches | Non-Compliant |

---

## Network requirements

Your ManageEngine server must be network-accessible from the machine running the ITO Endpoint backend. For cloud deployments, ensure the server is exposed or a VPN/tunnel is configured.

---

## Troubleshooting

| Error | Cause | Fix |
|---|---|---|
| `ManageEngine credentials not configured` | No env vars or UI config | Add credentials to `server/.env` |
| `ECONNREFUSED` | Server URL wrong or unreachable | Check `MANAGEENGINE_URL` and network connectivity |
| `401 Unauthorized` | Invalid API key | Regenerate key in ManageEngine Admin |
| `SSL certificate error` | Self-signed cert on ManageEngine | Add the cert to Node's trusted certs, or set `NODE_TLS_REJECT_UNAUTHORIZED=0` (dev only) |
