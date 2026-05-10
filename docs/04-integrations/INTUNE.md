# Microsoft Intune Integration

Connects to Microsoft Intune via the **Microsoft Graph API** to fetch managed device records, compliance state, hardware details, and encryption status.

---

## Prerequisites

- An **Azure AD App Registration** with the correct Graph API permissions
- The app registration must be in the same tenant as your Intune environment

---

## Azure AD setup (one-time)

1. Go to **Azure portal → Azure Active Directory → App registrations → New registration**
2. Name it (e.g., `ITO Endpoint Copilot`)
3. Set **Supported account types:** Single tenant
4. Click **Register** — note the **Application (client) ID** and **Directory (tenant) ID**
5. Go to **Certificates & secrets → New client secret** — copy the **Value** immediately
6. Go to **API permissions → Add a permission → Microsoft Graph → Application permissions**
7. Add these permissions:
   - `DeviceManagementManagedDevices.Read.All`
   - `DeviceManagementConfiguration.Read.All`
8. Click **Grant admin consent for [your org]**

---

## Configuration

### Via environment variables (`server/.env`)

```env
INTUNE_TENANT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
INTUNE_CLIENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
INTUNE_CLIENT_SECRET=your-client-secret-value
# Optional — only needed for Government Cloud
# INTUNE_ENDPOINT=https://graph.microsoft.us/v1.0
```

### Via Settings UI

Settings → Integrations → Microsoft Intune → fill in Tenant ID, Client ID, Client Secret.

---

## What data is fetched

Each device returns:

| Field | Graph API field |
|---|---|
| Device name | `deviceName` |
| User (UPN) | `userPrincipalName` |
| Serial number | `serialNumber` |
| Platform | `operatingSystem` |
| OS version | `osVersion` |
| OS build | `osBuildNumber` |
| Compliance state | `complianceState` |
| Last sync time | `lastSyncDateTime` |
| Enrollment date | `enrolledDateTime` |
| Encryption status | `isEncrypted` |
| Manufacturer / Model | `manufacturer`, `model` |
| Storage (total/free) | `totalStorageSpaceInBytes`, `freeStorageSpaceInBytes` |
| Memory | `physicalMemoryInBytes` |
| Architecture | `processorArchitecture` |
| MAC / IP address | `wiFiMacAddress`, `ethernetMacAddress`, `ipAddressV4` |
| Join type | `joinType` |
| Azure AD registered | `azureADRegistered` |
| Ownership | `managedDeviceOwnerType` |

---

## Compliance state mapping

| Graph API value | ITO Endpoint |
|---|---|
| `compliant` | Compliant |
| `noncompliant` | Non-Compliant |
| `unknown` | Warning |
| `inGracePeriod` | Warning |
| `error` | Warning |

---

## Pagination

The current implementation fetches up to **100 devices** per call (`$top=100`). For tenants with more than 100 devices, implement `@odata.nextLink` pagination in `server/src/services/intune.ts`:

```ts
// After data.value.map(mapGraphDevice):
let nextLink = data['@odata.nextLink']
while (nextLink) {
  const page = await fetch(nextLink, { headers })
  const pageData = await page.json()
  devices.push(...pageData.value.map(mapGraphDevice))
  nextLink = pageData['@odata.nextLink']
}
```

---

## Troubleshooting

| Error | Cause | Fix |
|---|---|---|
| `Intune auth failed: 401` | Wrong tenant/client ID | Re-check your App Registration IDs |
| `Intune auth failed: 403` | Missing permissions | Grant admin consent for Graph API permissions |
| `Microsoft Graph error: 403` | App permissions not propagated | Wait 5 minutes and retry after granting consent |
| `Intune credentials not configured` | No env vars or UI config | Add credentials to `server/.env` or Settings UI |
| Empty device list | No devices enrolled in Intune | Check Intune → Devices in Azure portal |
