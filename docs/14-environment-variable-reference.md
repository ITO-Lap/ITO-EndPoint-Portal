# 14 — Environment Variable Reference

> Source: `server/.env.example` plus a search of every `process.env` / `import.meta.env` use in the code. The server loads **`server/.env`** (`dotenv.config({ path: server/.env })` in `server/src/index.ts`), never the working-directory `.env`. **No values appear here** — values come from the owners listed in "How to obtain". Related: [06 §8 secrets](06-authentication-rbac-security.md), [07 setup](07-installation-and-developer-onboarding.md), [08 production](08-deployment-and-operations.md).
> Legend — **Req**: **Y** required for the feature, **O** optional, **P** required in production. **S** = secret (never log, commit or paste).

## 1. Core server

| Variable | Req | S | Purpose / format | How to obtain | Used in |
|---|---|---|---|---|---|
| `PORT` | O | | HTTP port, default `4000` | Choose; IIS `web.config` expects 4000 | `index.ts` |
| `NODE_ENV` | P | | `production` enables 200 req/15 min limit, hides error stacks, enforces TLS flag on the DB pool, disables local audit storage fallback | Set by the service installer / host | `index.ts`, `errorHandler.ts`, `db/index.ts` |
| `DATA_DIR` | P | | Folder for runtime data (schedules, roles, notifications, caches, session key). Absolute path outside the deployed folder, writable by the service account. Default: `%ProgramData%\ito-endpoint` on Windows, `server/data` otherwise | Create the folder, grant the service account modify rights | `store/dataDir.ts` |
| `DATABASE_URL` | O | S | PostgreSQL connection string (scheme, user, password, host, port, db). Without it the DB-backed features fall back to files or degrade | From the database provider | `db/index.ts` |

## 2. Portal sign-in and sessions

| Variable | Req | S | Purpose / format | Notes | Used in |
|---|---|---|---|---|---|
| `AUTH_ALLOWED_EMAILS` | P | | Comma-separated e-mails that are Global Admin once Microsoft verifies them (default is the project owner) | Keep the list short | `services/session.ts`, `routes/auth.ts` |
| `SESSION_SECRET` | P | S | Signing key for session JWTs. If unset, a random key is created in `DATA_DIR/session-secret` | Set explicitly for multi-instance or predictable rotation | `services/session.ts` |
| `AUTH_REDIRECT_URI` | P (behind proxy) | | Full callback URL registered as a Web redirect URI on the Entra app, e.g. `https://<host>/api/auth/callback` | Defaults to localhost in dev or is derived from the request host | `routes/auth.ts` |
| `FRONTEND_URL` | P (behind proxy) | | Site origin the browser returns to after sign-in | Same host as above | `routes/auth.ts` |
| `AUTH_IT_ADMIN_GROUP` / `AUTH_IT_ADMIN_GROUP_ID` | O | | Entra group name (case-insensitive) / Object ID for IT Admin | ID survives renames | `routes/auth.ts` |
| `AUTH_HELPDESK_GROUP` / `AUTH_HELPDESK_GROUP_ID` | O | | Same for Helpdesk (Desktop team) | | `routes/auth.ts` |
| `AUTH_PASSWORD` | O | S | Enables e-mail + password sign-in | Development only | `services/session.ts` |
| `AUTH_PASSWORDLESS` | O | | `true` = e-mail-only sign-in | **Never in production** | `services/session.ts`, `index.ts` |
| `AUTH_ENFORCED` | O | | `false` disables the API gate | **Never in production** | `services/session.ts`, `requireSession.ts` |

## 3. Microsoft Entra / Intune (Graph)

| Variable | Req | S | Purpose | How to obtain | Used in |
|---|---|---|---|---|---|
| `INTUNE_TENANT_ID` | Y | | Directory (tenant) ID (GUID) | Entra → Overview | `store/integrationStore.ts` |
| `INTUNE_CLIENT_ID` | Y | | App registration (client) ID | Entra → App registrations | same |
| `INTUNE_CLIENT_SECRET` | Y | S | Client secret value | Entra → Certificates & secrets (record the expiry date) | same |
| `ENTRA_TENANT_ID` / `ENTRA_CLIENT_ID` / `ENTRA_CLIENT_SECRET` | O | S (secret) | Entra features and portal sign-in; fall back to the `INTUNE_*` values | Same app registration | `integrationStore.ts` |
| `INTUNE_ENDPOINT` | O | | Intune endpoint setting (read into connector config) | | `store/integrationStore.ts` |

## 4. ManageEngine / Endpoint Central

| Variable | Req | S | Purpose | How to obtain | Used in |
|---|---|---|---|---|---|
| `MANAGEENGINE_CLIENT_ID` | Y | | Zoho self-client ID | Zoho API console | `integrationStore.ts` |
| `MANAGEENGINE_CLIENT_SECRET` | Y | S | Zoho client secret | Zoho API console | same |
| `MANAGEENGINE_REFRESH_TOKEN` | Y | S | Long-lived refresh token with the scopes in [13 §2](13-api-permission-matrix.md) | Generated from the self-client | same |
| `MANAGEENGINE_API_DOMAIN` | Y | | MDM API base URL | From the ManageEngine tenant | same, `services/manageEngine.ts` |
| `MANAGEENGINE_FETCH_CONCURRENCY` | O | | Parallel per-device detail calls | Tune if rate-limited | `services/manageEngine.ts` |
| `ENDPOINT_CENTRAL_BASE_URL` / `ENDPOINT_CENTRAL_PATCH_URL` | O | | Patch Manager host (default `https://endpointcentral.manageengine.com`) | | `endpointCentralPatch.ts`, `endpointCentralSoftware.ts`, `patchOperations.ts` |
| `MAC_ADMIN_REPORT_KEY` | O | S | Shared secret (16+ chars) the Mac script sends as `x-report-key`; unset = ingest disabled | Generate randomly | `services/macAdminAccess.ts` |

## 5. Slack, Teams, Jira, Confluence

| Variable | Req | S | Purpose | Used in |
|---|---|---|---|---|
| `SLACK_BOT_TOKEN` | Y for files/blocks | S | Bot token (`xoxb-…`) | `integrationStore.ts` |
| `SLACK_WEBHOOK_URL` | O | S | Incoming webhook for text alerts | same |
| `SLACK_SIGNING_SECRET`, `SLACK_WORKSPACE_ID` | O | S / | Read into config; no inbound-request consumer found | same |
| `SLACK_CRITICAL_PATCH_CHANNEL_ID` | O | | Channel for application update reports and packaging requests (also the fallback for app-release alerts) | `appIntel/requests.ts`, `appIntel/updateReport.ts` |
| `SLACK_APP_UPDATE_CHANNEL_ID` | O | | Channel for app-release alerts (falls back to the patch channel) | `appIntel/*` |
| `APP_INTEL_RELEASE_POLL_INTERVAL_MS` | O | | Release polling interval; default 6 h; minimum 15 min | `appIntel/releaseMonitor.ts` |
| `APP_INTEL_RELEASE_ALERT_INTERVAL_MS` | O | | Weekly digest cadence | `appIntel/releaseAlerts.ts` |
| `NOTIFICATION_SCHEDULER_POLL_SECONDS` | O | | Poll interval for notification schedules | `notificationScheduler.ts` |
| `TEAMS_WEBHOOK_URL` | O | S | Teams incoming webhook | `services/teams.ts`, `automationEngine.ts`, `copilotTools.ts` |
| `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`, `JIRA_PROJECT_KEY` | O | token = S | Atlassian Cloud access (Settings → Security → API tokens) | `services/jira.ts` |
| `CONFLUENCE_BASE_URL` | O | | Defaults to `JIRA_BASE_URL` | `services/confluence.ts` |

## 6. AI and public sources

| Variable | Req | S | Purpose | Used in |
|---|---|---|---|---|
| `OPENAI_API_KEY` | O | S | Rule builder, risk narrative | `services/openai.ts` |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | O | key = S | Copilot | `copilotEngine.ts`, `integrationStore.ts` |
| `GEMINI_ENABLE_GOOGLE_SEARCH` | O | | `false` blocks web grounding | `store/integrationStore.ts` |
| `GITHUB_TOKEN` | O | S | Read-only token for winget lookups (5,000/h) | `appIntel/latestVersion.ts` |
| `NVD_API_KEY` | O | S | Faster CVE lookups | `appIntel/cve.ts` |

## 7. Role Activity and legacy Intune Audit module

| Variable | Notes |
|---|---|
| `ROLE_ACTIVITY_LIVE_BROWSE_MAX_DAYS` | Max span of one live browse request (Role Activity Audit) |
| `INTUNE_AUDIT_AUTH_MODE` (`client_secret` / `certificate` / `managed_identity`), `INTUNE_AUDIT_CERT_PEM` (S), `INTUNE_AUDIT_CERT_THUMBPRINT`, `INTUNE_AUDIT_MANAGED_IDENTITY_CLIENT_ID` | Alternative Graph auth modes |
| `INTUNE_AUDIT_CHUNK_DAYS`, `_MAX_RANGE_DAYS`, `_MAX_CONCURRENT_CHUNKS`, `_SCHEDULER_POLL_SECONDS` | Export chunking and scheduler (`intuneAuditScheduler.ts`, not started from `index.ts`) |
| `INTUNE_AUDIT_STORAGE_ACCOUNT_URL`, `INTUNE_AUDIT_STORAGE_CONNECTION_STRING` (S), `INTUNE_AUDIT_STORAGE_CONTAINER`, `INTUNE_AUDIT_LOCAL_STORAGE_DIR`, `INTUNE_AUDIT_SCRATCH_DIR` | Export storage |
| `INTUNE_AUDIT_EMAIL_SENDER_UPN`, `_ALLOWED_DOMAINS`, `_DEFAULT_RECIPIENT`, `_ATTACHMENT_MAX_MB`, `_LINK_TTL_MINUTES` | Export e-mail |
| `AZURE_SUBSCRIPTION_ID`, `AZURE_RESOURCE_GROUP`, `INTUNE_AUDIT_HOSTING_ENV` | Informational |

`.env.example` states the legacy Intune Audit Logs routes were **removed** and the scheduler is not started from `index.ts`, so the `INTUNE_AUDIT_*` variables matter only if that module is re-wired. The auth-mode variables are still used by the Role Activity pullers.

## 8. Client (Vite) variables

| Variable | File | Purpose |
|---|---|---|
| `VITE_API_URL` | `src/api/index.ts` | API base URL; empty = same origin (production and the dev proxy) |
| `VITE_AZURE_CLIENT_ID`, `VITE_AZURE_TENANT_ID` | `src/lib/msalConfig.ts` | Public IDs for MSAL; not used by the current server-side sign-in |

These are baked into the build; they must never hold secrets.

## 9. Listed but not used by code

| Variable | Finding |
|---|---|
| `PROFILE_USER_UPN` | In `.env.example` text, **no code reads it** (search returned no source file) |
| `INTUNE_AUDIT_DEFAULT_TIMEZONE` | In `.env.example`; no source file reads it |

Remove or implement these to avoid confusion.

## 10. Minimal production set

```text
NODE_ENV=production
PORT=4000
DATA_DIR=<absolute path outside the deploy folder>
AUTH_ALLOWED_EMAILS=<owner e-mails>
AUTH_REDIRECT_URI=https://<host>/api/auth/callback
FRONTEND_URL=https://<host>
AUTH_IT_ADMIN_GROUP_ID=<object id>      AUTH_HELPDESK_GROUP_ID=<object id>
INTUNE_TENANT_ID / INTUNE_CLIENT_ID / INTUNE_CLIENT_SECRET
MANAGEENGINE_* (4 variables)
SLACK_BOT_TOKEN + channel IDs
SESSION_SECRET (recommended)
```
