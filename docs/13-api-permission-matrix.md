# 13 — API Permission Matrix

> Source: permission names found in code, comments and `.env.example` (see [05](05-api-integrations.md)). Whether each permission is **granted and consented in your tenant is Not verified** — tick the right-hand column during the checks in [15](15-known-gaps-and-verification-checklist.md).
> Never paste secrets into tickets when verifying; only the permission names matter.

## 1. Microsoft Entra app registration

### 1.1 Delegated (portal sign-in)

| Permission | Type | Used for | Code |
|---|---|---|---|
| `openid`, `profile`, `email`, `User.Read` | Delegated | Identify the signed-in user (`/me`) | `routes/auth.ts` |

Also required on the same registration: **Web** redirect URI(s) equal to `AUTH_REDIRECT_URI` (for example `https://<host>/api/auth/callback`, and `http://localhost:4000/api/auth/callback` for development). A **Single-page application** redirect type will not work (server-side code exchange with a client secret).

### 1.2 Application (app-only, admin consent required)

| Permission | Used for | Module | Granted? |
|---|---|---|---|
| `GroupMember.Read.All` | Resolve the user's groups at sign-in (role from group) | Login | ☐ |
| `DeviceManagementManagedDevices.Read.All` | Intune device list, detail, detected apps' devices | Devices, App Intelligence, Entra | ☐ |
| `DeviceManagementApps.Read.All` | `mobileApps`, assignments, `detectedApps` | App Intelligence, Intune audit | ☐ |
| `DeviceManagementConfiguration.Read.All` | Policies, configuration profiles, scripts, audit events | Policy Conflicts, Scripts & Config, Role Activity | ☐ |
| `DeviceManagementScripts.Read.All` | Script bodies | Scripts & Configurations | ☐ |
| `DeviceManagementServiceConfig.Read.All` | Autopilot profiles | Scripts & Configurations | ☐ |
| `DeviceManagementRBAC.Read.All` | RBAC data | Role-related reads (`graphApi.ts`) | ☐ |
| `DeviceManagementEndpointSecurity.Read.All` | Endpoint security intents | Security policy snapshots (router unmounted) | ☐ |
| `Directory.Read.All` | Directory objects | Entra, App Intelligence | ☐ |
| `Group.Read.All` | Group names for assignments / group report | App Intelligence, Entra groups | ☐ |
| `Device.Read.All` | Entra device objects (duplicate detection) | Entra Intelligence | ☐ |
| `AuditLog.Read.All` | Directory audits, sign-ins | Entra Intelligence, Role Activity | ☐ |
| `IdentityRiskyUser.Read.All` | Risky users/sign-ins | Entra Intelligence | ☐ |
| `Reports.Read.All` | Authentication-method registration report | Entra Intelligence | ☐ |
| `Policy.Read.All`, `Policy.Read.AuthenticationMethod` | Conditional access and auth-method policies | Security policy snapshots (router unmounted) | ☐ |
| `Mail.Send` (scoped by application access policy) | Export e-mail | Legacy Intune audit module | ☐ (only if re-enabled) |
| Office 365 Management APIs → `ActivityFeed.Read` | SharePoint permission changes | Role Activity (SharePoint puller, unvalidated) | ☐ |
| `DeviceManagementManagedDevices.PrivilegedOperations.All` | `syncDevice` action | Entra Intelligence device sync | ☐ **Inferred** (code POSTs `managedDevices/{id}/syncDevice`; the permission is not named in the repo) |

Least-privilege note: all but the `syncDevice` row are read-only. Remove permissions for features you do not use (for example the unmounted security-policy snapshots).

## 2. ManageEngine / Zoho

| Scope | Purpose | Granted? |
|---|---|---|
| `MDMOnDemand.MDMInventory.READ` | MDM device, app and profile reads | ☐ |
| `DesktopCentralCloud.PatchMgmt.READ` | `GET /api/1.4/patch/allsystems` | ☐ |
| `DesktopCentralCloud.Inventory.READ` (or `.ALL`) | Installed software inventory | ☐ |
| Patch scan/install scope | `POST patch/computers/scan`, `patch/installpatch` | ☐ **Not verified** — not named in the repository |

## 3. Slack

| Scope | Purpose | Evidence |
|---|---|---|
| `chat:write` | Post messages | Required by `chat.postMessage` (**Inferred**) |
| `files:write` | Upload report files | Required by external upload flow (**Inferred**) |
| `channels:read`, `users:read`, `auditlogs:read` | Listed in `.env.example` | Verified (comment) |

## 4. Atlassian, AI, public sources

| Provider | Permission needed |
|---|---|
| Jira / Confluence | API token user with create-issue on `JIRA_PROJECT_KEY` and read on Confluence spaces searched |
| OpenAI / Gemini | API key with model access |
| GitHub | Optional read-only token (no scopes) for rate limit |
| NVD | Optional API key |

## 5. Portal roles → capability keys (server-side)

Keys come from `server/src/services/rolePermissions.ts`. Built-in defaults for IT Admin and Helpdesk are set in the same file; Global Admin always has every key.

| Capability key | Enforced on |
|---|---|
| `appIntel.read` / `appIntel.write` | `/api/app-intel` (router-wide / Slack report + packaging request) |
| `staleDevices.read` / `staleDevices.export` | `/api/stale-devices` |
| `patchOps.scanRemediate` | `/api/endpoint-central/remediation/*` |
| `copilot.access`, `copilot.read`, `copilot.write` | `/api/copilot` (`read`, `write`) |
| `intuneScriptsConfig.access` | `/api/intune-scripts-config` |
| `notificationSchedules.edit` | `PATCH /api/notification-schedules/...` |
| `scheduledReports.editSlackSchedule` | Defined; enforcement point **Not verified** |
| `roleActivity.export` | Defined; export is client-side |
| `securityPolicies.read` / `.sync` | `/api/security-policies` (router not mounted) |
| `settings.navigationEdit` | Defined; UI-level |
| `sync.manage` | `POST /api/sync/run`, `PUT /api/sync/schedule`, `GET /api/sync/logs` |
| `roles.manage` | `/api/roles` |
| `pages.<Title>` | Client-side page access (`canAccess`) **and**, since 2026-11-20, the server-side check on the routes listed in [06 §6](06-authentication-rbac-security.md) (`requireCapability('pages.<Title>')`) |

Routes that still need only a session are listed at the end of [06 §6](06-authentication-rbac-security.md).
