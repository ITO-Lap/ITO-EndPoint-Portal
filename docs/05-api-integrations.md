# 05 — API and Integration Documentation

> Labels: **Verified** (read in code/config), **Assumption** (not provable from the repository), **Not verified** (needs a live check — see [15](15-known-gaps-and-verification-checklist.md)). Permission summary: [13 — API permission matrix](13-api-permission-matrix.md). Variables: [14](14-environment-variable-reference.md). Auth of the portal itself: [06](06-authentication-rbac-security.md).

## 1. Integration overview

| # | Provider | Used for | Auth | Main code |
|---|---|---|---|---|
| 1 | Microsoft Graph v1.0 (Intune, Entra) | Devices, apps, policies, audit, users, groups | OAuth2 client credentials (app-only) | `services/graphApi.ts`, `intune.ts`, `entra*.ts`, `intuneScriptsConfigGraph.ts`, `securityPoliciesGraph.ts`, `appIntel/providers.ts` |
| 2 | Microsoft Graph beta | A few Intune endpoints | same token | `graphApi.ts` (`GRAPH_BETA`), `securityPoliciesGraph.ts`, `intuneScriptsConfigGraph.ts` |
| 3 | Microsoft Entra sign-in | Portal login | OAuth2 authorization code (client secret) | `routes/auth.ts` |
| 4 | Office 365 Management Activity API | SharePoint permission changes | app-only on `manage.office.com` | `services/sharepointRoleActivityPuller.ts` |
| 5 | ManageEngine MDM On-Demand | Device inventory, apps, profiles | Zoho OAuth2 refresh token | `services/manageEngine.ts` |
| 6 | ManageEngine Endpoint Central (Patch / Inventory) | Patch status, software inventory, patch actions | same Zoho OAuth client | `endpointCentralPatch.ts`, `endpointCentralSoftware.ts`, `patchOperations.ts` |
| 7 | Slack Web API / incoming webhook | Reports, alerts, health | Bot token (`xoxb-`) or webhook URL | `services/slack.ts`, `slackHealth.ts` |
| 8 | Microsoft Teams webhook | Automation alerts | Webhook URL | `services/teams.ts` |
| 9 | Jira / Confluence (Atlassian Cloud) | Tickets and search | Basic (email + API token) | `services/jira.ts`, `confluence.ts` |
| 10 | OpenAI | Rule builder, risk narrative | API key | `services/openai.ts` (model `gpt-4o-mini`) |
| 11 | Google Gemini | AI Copilot | API key | `services/copilotEngine.ts` |
| 12 | winget-pkgs (GitHub), Homebrew cask API, NVD | Latest versions and CVEs | Public (optional `GITHUB_TOKEN`, `NVD_API_KEY`) | `services/appIntel/latestVersion.ts`, `cve.ts` |
| 13 | Kandji | — | **No code found** | — |

---

## 2. Microsoft Graph (Intune / Entra)

### 2.1 Authentication (Verified)

- Token endpoint: `https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token`, `grant_type=client_credentials`, scope `https://graph.microsoft.com/.default`.
- Credentials: `INTUNE_TENANT_ID/CLIENT_ID/CLIENT_SECRET`; Entra features use `ENTRA_*` and fall back to the Intune values (`store/integrationStore.ts`).
- Tokens are cached per tenant at module level and refreshed 60 s before expiry; concurrent token requests are de-duplicated (`graphApi.ts`, tested in `graphApiRetry.test.ts`).
- Alternative modes (`INTUNE_AUDIT_AUTH_MODE=certificate|managed_identity`) exist for the legacy audit module only.

### 2.2 Shared client behaviour (Verified, `services/graphApi.ts`)

| Behaviour | Detail |
|---|---|
| Base URLs | `https://graph.microsoft.com/v1.0` (default), `…/beta` where required |
| Pagination | `graphGetAllV` follows `@odata.nextLink`; `graphGetAllResumable` keeps pages already read so a throttled read can resume |
| Retries | Up to 5 by default (6–8 for specific large reads). HTTP 429 honours `Retry-After` (capped at 120 s) else jittered exponential back-off; HTTP ≥ 500 and timeouts are retried; 30 s request timeout |
| Errors | `TransientGraphError` (retries exhausted) vs `FatalGraphError` (4xx, message sanitised, bearer tokens redacted) |
| Throttling mitigation | `detectedApps`: 500 rows/page, 400 ms between pages, resumable, up to 3 cool-down rounds, last-good cache |

### 2.3 Endpoints called (Verified by path search; per-module usage in [04](04-modules-and-code-logic.md))

| Area | Paths | Code |
|---|---|---|
| Intune devices | `/deviceManagement/managedDevices` (list, per-device detail/apps/compliance) | `intune.ts`, `graphApi.ts` |
| Intune apps | `/deviceManagement/detectedApps`, `/deviceAppManagement/mobileApps` (+ assignments) | `appIntel/providers.ts` |
| Intune policies/config | `/deviceManagement/configurationPolicies`, `deviceConfigurations`, `deviceCompliancePolicies`, `groupPolicyConfigurations`, `intents`, `templates`, `deviceManagementScripts`, `deviceHealthScripts`, `windowsAutopilotDeploymentProfiles` | `intuneScriptsConfigGraph.ts`, `securityPoliciesGraph.ts` |
| Intune audit | `/deviceManagement/auditEvents` | `intuneAuditGraph.ts`, `intuneRoleAuditPuller.ts` |
| Entra | `/users`, `/groups`, `/devices`, `/auditLogs/directoryAudits`, `/auditLogs/signIns`, `/identityProtection/riskyUsers`, `/identityProtection/riskySignIns`, `/reports/authenticationMethods/userRegistrationDetails` | `entra.ts`, `entraIntelligence.ts`, `entraRoleAuditPuller.ts` |
| Policies | `/identity/conditionalAccess/policies`, `namedLocations`, `/policies/authorizationPolicy`, `authenticationMethodsPolicy`, `authenticationStrengthPolicies`, `identitySecurityDefaultsEnforcementPolicy` | `securityPoliciesGraph.ts` (**router unmounted**, see [03](03-repository-structure.md)) |
| Sign-in groups | `/users/{id}/transitiveMemberOf/microsoft.graph.group` | `routes/auth.ts` |
| Write action | `POST /deviceManagement/managedDevices/{id}/syncDevice` | `entraIntelligence.ts` (`syncDevice`) |
| Mail | `sendMail` via `INTUNE_AUDIT_EMAIL_SENDER_UPN` | `auditExportEmail.ts` (legacy module) |

### 2.4 Data mapping (Intune → `Device`)

Mapped in `services/intune.ts` (Intune `managedDevices` fields → `deviceName`, `user`, `serialNumber`, `platform`, `osVersion`, `lastCheckIn`, `complianceState`, `encryptionStatus`, …). The exact field-by-field mapping table was **not** reproduced here; read `intune.ts` before changing it. *(Not verified field by field.)*

### 2.5 Known limitations

- `detectedApps` is heavily throttled by Graph; a full read of 20,000+ rows can take minutes and may still 429.
- Per-user app inventory is not collected; user drill-down is therefore not possible today.
- Entra holds no serial number; matching Entra objects to devices uses Intune.
- Required admin consent must be granted by a tenant admin; code cannot detect a missing permission except through a 403 (`appIntel/service.ts` maps a 403 to "grant the … application permission").

---

## 3. Microsoft Entra sign-in (portal login)

See the sequence diagram in [02 §3](02-architecture.md). Summary (Verified, `routes/auth.ts`):

| Item | Value |
|---|---|
| Authorize scope | `openid profile email User.Read` (delegated) |
| Redirect URI | `AUTH_REDIRECT_URI`, else derived from the request host; must be registered as **Web** redirect URI on the app registration |
| State | Signed JWT, 10-minute expiry (CSRF protection), verified on callback |
| Group lookup | App-only token → `transitiveMemberOf` (needs `GroupMember.Read.All`), up to 20 pages |
| Result | JWT `{role, displayName, email}`, 8 h, delivered in the URL **fragment** (`/#session_token=`) |
| Timeouts | 15 s on every upstream call |

---

## 4. ManageEngine (MDM On-Demand and Endpoint Central)

### 4.1 Authentication (Verified, `services/manageEngine.ts`)

- Zoho OAuth2 self-client: `POST https://accounts.zoho.com/oauth/v2/token` (refresh-token grant) with `MANAGEENGINE_CLIENT_ID/SECRET/REFRESH_TOKEN`. **The accounts host is hard-coded to `accounts.zoho.com`** — tenants in other Zoho data centres (for example `.eu`, `.in`) would need a code change. *(Assumption about the tenant's data centre; see [15](15-known-gaps-and-verification-checklist.md).)*
- API base: `MANAGEENGINE_API_DOMAIN` (MDM, path prefix `/api/v1/`). Patch/inventory host: `ENDPOINT_CENTRAL_BASE_URL` (default `https://endpointcentral.manageengine.com`), prefix `/api/1.4/`.

### 4.2 Endpoints (Verified)

| Purpose | Request | Code |
|---|---|---|
| Device list | `GET {api}/api/v1/mdm/devices?limit=…&offset=…` (paged; default page is 50 and never returns more than one page unless paged) | `manageEngine.ts` |
| Device detail / apps / profiles | `GET mdm/devices/{id}`, `/apps`, `/profiles` (batched with `Promise.allSettled`; concurrency `MANAGEENGINE_FETCH_CONCURRENCY`) | `manageEngine.ts` |
| Patch systems | `GET /api/1.4/patch/allsystems?pagelimit&page` | `endpointCentralPatch.ts` |
| Installed software | `GET /api/1.4/inventory/installedsoftware?resid=…` | `endpointCentralSoftware.ts` |
| Patch scan | `POST /api/1.4/patch/computers/scan` body `{ resourceids }` | `patchOperations.ts` |
| Patch install | `POST /api/1.4/patch/installpatch?api2` | `patchOperations.ts` |

### 4.3 Scopes (Verified in code/comments)

`MDMOnDemand.MDMInventory.READ`, `DesktopCentralCloud.PatchMgmt.READ`, `DesktopCentralCloud.Inventory.READ` (also `.ALL` accepted). The scope required for **scan/install** is **Not verified**; the code and `.env.example` reference only READ scopes.

### 4.4 Limitations

- MDM-only Macs have no Patch Manager data; they appear as "not reported".
- Endpoint Central does not expose local admin membership; a script reports it instead ([04 §2.6](04-modules-and-code-logic.md)).
- API call limits require slow, scheduled scans for large fleets (Endpoint Central software scan runs in the background).

---

## 5. Slack

| Item | Detail (Verified) |
|---|---|
| Methods | `chat.postMessage`, `files.getUploadURLExternal` + upload + `files.completeUploadExternal`, `auth.test` (health), optional audit logs endpoint (`api.slack.com/audit/v1/logs`) |
| Auth | `SLACK_BOT_TOKEN` (needs a bot token for files/blocks) or `SLACK_WEBHOOK_URL` (text alerts only, channel fixed by the webhook) |
| Scopes | `.env.example` lists `auditlogs:read`, `channels:read`, `users:read`. The code also needs permission to post and upload (`chat:write`, `files:write`). **Which scopes are actually granted is Not verified** |
| Timeouts | 10 s per request (`fetchWithTimeout`) |
| Health | `slackHealth.ts` polls `auth.test` every 5 min with retry back-off |
| Channels | `SLACK_CRITICAL_PATCH_CHANNEL_ID`, `SLACK_APP_UPDATE_CHANNEL_ID`, per-schedule `slackChannelId` |
| `SLACK_SIGNING_SECRET` | Read by `integrationStore.ts`; no inbound Slack request verification endpoint was found. *(Not verified whether any consumer exists.)* |

## 6. Jira and Confluence

Atlassian Cloud REST with Basic auth built from `JIRA_EMAIL` + `JIRA_API_TOKEN` (`services/jira.ts`). Endpoints exposed by the portal: `GET /api/jira/status`, `POST /api/jira/issues`, `GET /api/jira/issues/search`, `GET /api/jira/confluence/search`. Project key `JIRA_PROJECT_KEY`. Confluence uses `CONFLUENCE_BASE_URL` (defaults to the Jira base URL). Packaging requests from the application module also create Jira issues.

## 7. AI providers

| Provider | Use | Notes |
|---|---|---|
| OpenAI `gpt-4o-mini` | Automation rule builder, Risk Scoring narrative | Optional; rule-based fallback exists for both |
| Google Gemini (`GEMINI_MODEL`) | Copilot tool-calling; optional Google Search grounding (`GEMINI_ENABLE_GOOGLE_SEARCH`) | Device/user context can be sent to the provider; review data policy before enabling (see [10](10-risks-limitations-technical-debt.md)) |

## 8. Public data sources (App Intelligence)

| Source | Use | Limits |
|---|---|---|
| winget-pkgs manifests (`api.github.com`, `raw.githubusercontent.com`) | Windows latest versions | 60 requests/h unauthenticated; 5,000/h with `GITHUB_TOKEN` |
| Homebrew cask API (`formulae.brew.sh`) | macOS latest versions | none documented in code |
| NVD (`services.nvd.nist.gov`) | CVE lookups, cached 24 h | 5 requests/30 s without `NVD_API_KEY`; 50 with |

## 9. Internal API

The portal's own API (all under `/api`, JSON envelope `{success,data,error}`) is listed per module in [04 §2](04-modules-and-code-logic.md) and as a route index in [04 §3](04-modules-and-code-logic.md). An older reference is [`docs/03-backend/API-REFERENCE.md`](03-backend/API-REFERENCE.md) — verify against code before relying on it.

## 10. Verified vs assumed

| Statement | Status |
|---|---|
| Graph retry/pagination behaviour | Verified (code + tests) |
| Endpoint paths listed above | Verified (present in code); response shapes per endpoint not re-validated |
| Permissions actually granted in the tenant | **Not verified** (needs Entra/Zoho/Slack admin check) |
| Behaviour under live throttling after the resumable-read change | **Not verified** (needs a live sync) |
| ManageEngine data centre / accounts host | **Assumption** (`accounts.zoho.com`) |
