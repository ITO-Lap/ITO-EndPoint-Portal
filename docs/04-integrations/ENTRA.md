# Microsoft Entra ID Integration — Setup Guide

> **Type:** Identity & Directory  
> **Use:** User sync · Sign-in logs · Risky user detection · Intune device inventory  
> **Auth:** OAuth 2.0 Client Credentials (app registration)

---

## What Data Is Fetched

| Data | Graph Endpoint | Requires |
|---|---|---|
| Users | `GET /users` | `User.Read.All` |
| Sign-in logs | `GET /auditLogs/signIns` | `AuditLog.Read.All` |
| Directory audits | `GET /auditLogs/directoryAudits` | `AuditLog.Read.All` |
| Risky users | `GET /identityProtection/riskyUsers` | `IdentityRiskyUser.Read.All` |
| MFA registrations | `GET /reports/authenticationMethods/userRegistrationDetails` | `UserAuthenticationMethod.Read.All` |
| **Intune devices** | `GET /deviceManagement/managedDevices` | **`DeviceManagementManagedDevices.Read.All`** |

---

## App Registration Setup

1. Go to **Azure Portal → App registrations → New registration**
2. Name: `EndPoint+` (or similar)
3. Supported account types: **Accounts in this organizational directory only**
4. No redirect URI needed (client credentials flow)

### Add API Permissions
Go to **API permissions → Add a permission → Microsoft Graph → Application permissions**:

| Permission | Required for |
|---|---|
| `User.Read.All` | User directory |
| `AuditLog.Read.All` | Sign-in + audit logs |
| `IdentityRiskyUser.Read.All` | Risky user detection |
| `UserAuthenticationMethod.Read.All` | MFA registration status |
| `DeviceManagementManagedDevices.Read.All` | **Entra Intelligence device inventory** |
| `DeviceManagementConfiguration.Read.All` | Compliance policies (optional) |

Click **Grant admin consent** after adding permissions.

### Create Client Secret
**Certificates & secrets → New client secret** → copy the Value immediately (shown once).

---

## Configuration

In **Settings → Integrations → Microsoft Entra ID**, push:

| Field | Where to find |
|---|---|
| Tenant ID | Azure Active Directory → Overview → Tenant ID |
| Client ID | App registration → Overview → Application (client) ID |
| Client Secret | App registration → Certificates & secrets → Value |

### Environment Variables (alternative)

```env
ENTRA_TENANT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
ENTRA_CLIENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
ENTRA_CLIENT_SECRET=your-secret-value

# Falls back to Intune credentials if Entra-specific vars not set:
# INTUNE_TENANT_ID, INTUNE_CLIENT_ID, INTUNE_CLIENT_SECRET
```

---

## Token Refresh

The service uses the OAuth 2.0 client credentials flow. Tokens are cached in-memory and automatically refreshed 60 seconds before expiry. No user interaction required.

---

## Entra Intelligence Dashboard

Once configured, the **Entra Intelligence** page (Endpoint Management → Entra Intelligence) shows:
- Live Intune device inventory (requires `DeviceManagementManagedDevices.Read.All`)
- Live user directory with risk levels
- Real compliance metrics computed from device data
- Risky user detection from Identity Protection

Status indicator: 🟢 **Live · Microsoft Graph** when active.

---

## Credential Fallback

If `ENTRA_TENANT_ID` is not set, the service falls back to `INTUNE_TENANT_ID` automatically — the same Azure AD app registration often covers both Intune and Entra access.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Users not loading | Check `User.Read.All` is granted with admin consent |
| Risky users empty | Check `IdentityRiskyUser.Read.All` granted; requires Azure AD P2 |
| Device count = 0 | Add `DeviceManagementManagedDevices.Read.All` permission |
| `AADSTS700016` | Check Client ID is correct for the tenant |
| `AADSTS70011` | Scope mismatch — re-check app permissions |
| Token fetch failed HTTP 401 | Client secret expired — regenerate in Azure Portal |

---

## Related Features
- [Entra Intelligence Dashboard](../07-features/ENTRA-INTELLIGENCE.md)
- [Intune Integration](INTUNE.md) — shares the same app registration
