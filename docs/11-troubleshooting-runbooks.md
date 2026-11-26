# 11 — Troubleshooting and Runbooks

> Each runbook lists **symptom → likely cause (traceable to code) → checks → fix → escalation**. Causes marked *Inferred* are common failure modes consistent with the code but not reproduced. Related: [06 auth](06-authentication-rbac-security.md), [05 integrations](05-api-integrations.md), [08 operations](08-deployment-and-operations.md), [13 permissions](13-api-permission-matrix.md), [14 variables](14-environment-variable-reference.md).

## 0. Collect safe diagnostics first

| What | How | Safe to share? |
|---|---|---|
| Service state | `nssm status ITOEndpointCopilot` | Yes |
| Health | `curl http://127.0.0.1:4000/health` | Yes |
| Startup block | First ~20 lines of `logs\service.out.log` after a restart (connector ✓/— lines, `Migrated …`, warnings) | Yes |
| Errors | Search the service logs (command below) | Mostly; **review before sharing** |
| Integration state | Settings → integration status (UI) | Yes |
| Browser | DevTools → Network: failing request URL, status, and the JSON `error` text | Yes — **do not copy `Authorization` headers or the `#session_token` URL fragment** |
| Environment | List variable **names** only: `(Get-Content server\.env) -replace '=.*','=<set>'` | Yes (values removed) |
| Data folder | Names and sizes in `DATA_DIR` (not contents) | Yes |

Error search (PowerShell):

```powershell
Select-String -Path logs\service.*.log -Pattern '\[Error\]|\[auth\]|\[app-intel\]|\[data\]' | Select-Object -Last 50
```

Never paste `.env`, tokens, client secrets, `session-secret`, `integration-credentials.json` or full HAR files into tickets or chats. If a secret may have been exposed, rotate it ([06 §8](06-authentication-rbac-security.md)).

---

## 1. Login failure

| Symptom (UI text) | Cause (code) | Checks / fix |
|---|---|---|
| "Invalid or expired auth state. Please try again." | `state` JWT older than 10 minutes, or `SESSION_SECRET` changed between login and callback (`routes/auth.ts`) | Retry once; if repeating, check that `SESSION_SECRET` is stable and that a load balancer is not alternating instances |
| Microsoft shows `AADSTS50011` / "redirect URI does not match" | The redirect URI used is not registered as **Web** on the app | Compare the URI in the browser with `AUTH_REDIRECT_URI`; behind IIS set `AUTH_REDIRECT_URI` + `FRONTEND_URL`; register it in Entra → Authentication → Web |
| "Access denied. <email> is not assigned a role and is not a member of '…'" | User not on `AUTH_ALLOWED_EMAILS`, no role assignment, not in the IT Admin / Helpdesk group | Add to the group (or assign a role in Settings → Roles), wait for group replication, sign in again. Confirm the configured group names/IDs ([14 §2](14-environment-variable-reference.md)) |
| "group membership could not be checked … GroupMember.Read.All" | Graph group lookup failed (permission missing/unconsented, or Graph outage) | [Runbook 2](#2-entra-id-permission-or-consent-failure) |
| "Microsoft took too long to respond" | 15 s upstream timeout | Retry; check Microsoft service health |
| Login page loops back / blank | Stored session invalid (expired or secret changed) | Clear site data (localStorage) and sign in again |
| `401 Authentication required` on every call | No/expired token, or the server restarted with a new random secret (no `SESSION_SECRET` and `DATA_DIR/session-secret` not persisted) | Sign in again; set `SESSION_SECRET` or make `DATA_DIR` persistent |
| Password prompt appears unexpectedly | `AUTH_PASSWORD` set | Production should use Microsoft sign-in only; unset it |

## 2. Entra ID permission or consent failure

1. In Entra → App registrations → the portal app → **API permissions**: confirm each application permission in [13 §1.2](13-api-permission-matrix.md) shows **Granted for <tenant>**.
2. A new permission needs **admin consent** by a tenant admin; token caching can delay effect — restart the service to force new app tokens (cached up to expiry).
3. Symptom → permission map: group role failure → `GroupMember.Read.All`; Intune devices empty → `DeviceManagementManagedDevices.Read.All`; app inventory banner "Microsoft Graph denied access" → `DeviceManagementApps.Read.All` / `Directory.Read.All`; group names missing → `Group.Read.All`; Entra pages empty → `AuditLog.Read.All`, `IdentityRiskyUser.Read.All`, `Reports.Read.All`; duplicate devices → `Device.Read.All`.
4. HTTP 403 from the portal's own API ("This action requires…") is a **portal role** issue, not Entra: check the user's role and capability keys ([13 §5](13-api-permission-matrix.md)).
5. Escalate to the Entra tenant admin with the **permission name and the failing endpoint path** only.

## 3. API token failure

| Provider | Symptom | Checks / fix |
|---|---|---|
| Graph (app-only) | Every Intune/Entra call fails with a sanitised 401/AADSTS error; startup shows `— not configured` | Verify `INTUNE_*`/`ENTRA_*` names are present (`.env` location!), the client secret has not **expired** (Entra → Certificates & secrets), tenant/client IDs match. Create a new secret, update `server\.env`, restart |
| Zoho / ManageEngine | Device list shows `failedSources: manageengine`; logs show an OAuth error | Refresh token revoked or scopes missing; regenerate the self-client refresh token with the scopes in [13 §2](13-api-permission-matrix.md); update `MANAGEENGINE_REFRESH_TOKEN`; restart. If the tenant is not in the US data centre, `accounts.zoho.com` is wrong (Risk R-18) |
| Slack | Slack health red; `invalid_auth`, `token_revoked`, `missing_scope` | Reinstall the app to the workspace, add missing scopes, update `SLACK_BOT_TOKEN`; Settings → Slack test |
| Jira | `GET /api/jira/status` fails | API token revoked/expired or wrong e-mail; create a new token |
| OpenAI / Gemini | Copilot or rule builder returns a fallback/error | Check key, quota, model name (`GEMINI_MODEL`) |

## 4. Intune Graph API failure

| Symptom | Cause | Action |
|---|---|---|
| Amber banner "`intune-detected-apps` — Graph API rate-limited (429) and retries exhausted" | Throttling on `detectedApps` | The read is resumable and retried with cool-downs; wait for the sync to finish (can take several minutes). Check logs for `[app-intel] detectedApps throttled …`. If it persists, avoid running other Graph-heavy tools at the same time, and start the sync off-peak. Last good data is shown meanwhile if a previous sync succeeded |
| "Some Intune device lists could not be read" | Per-device failures | Re-run sync; check the permission list |
| Devices list shows Intune in `failedSources`, data marked stale | 30 s timeout or Graph outage | The last-good Intune list (`cache/devices-intune.json`) is served; check Microsoft 365 service health, retry |
| 403 on a specific page | Missing application permission | [Runbook 2](#2-entra-id-permission-or-consent-failure) |
| Empty Intune list with no error | Wrong tenant IDs | Compare `INTUNE_TENANT_ID` with the tenant that holds the devices |

## 5. ManageEngine / Endpoint Central failure

1. Settings → integration status (and the startup log line `ManageEngine: ✓ configured`).
2. `MANAGEENGINE_API_DOMAIN` must be the tenant's MDM API base; the Patch Manager host is `ENDPOINT_CENTRAL_BASE_URL` (default `https://endpointcentral.manageengine.com`).
3. Patch pages empty but MDM devices present: the refresh token lacks `DesktopCentralCloud.PatchMgmt.READ`, or the endpoints are MDM-only (no agent) — expected "not reported".
4. Software inventory scan stuck: Endpoint Central limits API calls; the Application page shows scan progress; wait or reduce `MANAGEENGINE_FETCH_CONCURRENCY`.
5. HTTP 429/slow: lower concurrency; avoid simultaneous full syncs.
6. After rotating the token, restart the service so the cached access token is discarded.

## 6. Slack notification failure

| Symptom | Check |
|---|---|
| Report/digest not posted | Scheduled Reports → run history for the error; bot must be a member of the channel; `files:write` and `chat:write` scopes; correct channel **ID** (not name) |
| `channel_not_found` / `not_in_channel` | Invite the bot to the channel |
| `missing_scope` | Add scope, reinstall the app |
| Only text alerts, no files | Using `SLACK_WEBHOOK_URL` instead of a bot token — files need `SLACK_BOT_TOKEN` |
| Digest posted without the Excel | The workbook build failed; the run is flagged "Digest posted without the Excel report"; check logs for the underlying error |
| Schedule fires at the wrong time | Check the schedule's timezone and cron; the runner ticks every 60 s |
| Duplicate posts | Two service instances running (in-process schedulers) — [Risk R-14](10-risks-limitations-technical-debt.md) |

## 7. Missing dashboard data

1. Open Network tab: does `GET /api/devices` return `success:true`? Look at `failedSources` / `staleSources` in the JSON.
2. Both sources empty and no error → connectors not configured (startup log) or `.env` in the wrong place.
3. Card shows N/A or "unavailable" → by design when a source did not report ([10 R-02](10-risks-limitations-technical-debt.md)).
4. Data old after an outage → last-good cache in use; fix the source and refresh (cache TTL is 5 minutes).
5. After restart the first load is fast but old → warm start; a background refresh follows.
6. A page shows an access-denied panel → role/permissions, not data.

## 8. Deployment failure

| Symptom | Cause | Action |
|---|---|---|
| Service will not start | `server\dist\index.js` missing (build not run), Node not on PATH for the service account, port in use | Run `npm run build`; check `logs\service.err.log`; `nssm get ITOEndpointCopilot Application` |
| Site returns 502/404 via IIS | Service stopped, ARR proxy disabled, URL Rewrite missing | Start the service; enable ARR proxy; confirm `web.config` points to `127.0.0.1:4000` |
| Login redirects to `localhost` | `AUTH_REDIRECT_URI`/`FRONTEND_URL` unset behind IIS | Set both, restart |
| Schedules/roles reset after deploy | `DATA_DIR` unset or inside the deploy folder; startup log `[data] DATA_DIR … not writable` | Set an absolute `DATA_DIR`; grant the service account Modify |
| `.env.example` missing on the server | Zip pattern removed it ([08 §3.2](08-deployment-and-operations.md)) | Copy the template from source control |
| Blank page after deploy | `dist/` missing or stale | Rebuild; confirm `dist/index.html` next to `server/` |
| Rollback needed | — | Follow [08 §6](08-deployment-and-operations.md) |

## 9. Database connection or migration failure

1. If `DATABASE_URL` is unset the app deliberately uses files — no DB errors expected.
2. `[DB] Unexpected pool error` or timeouts (2 s connect timeout): wrong host/firewall/credentials; test with `psql "$DATABASE_URL" -c "select 1"`.
3. TLS errors: production uses TLS without certificate validation; the server must offer TLS.
4. `relation "…" does not exist`: schema not applied → `psql "$DATABASE_URL" -f server/src/db/schema.sql` (idempotent `IF NOT EXISTS`). `function uuid_generate_v4() does not exist` → create the `uuid-ossp` extension (*Not verified whether `schema.sql` creates it*).
5. Switching from files to PostgreSQL does not copy existing schedules/roles (*Verified: no migration code*): re-create them or script an import.
6. There is no migration history table; record applied SQL in your change log.

## 10. Slow application or API calls

| Where | Likely cause | Action |
|---|---|---|
| First load after restart | Warm start + background refresh of two sources | Wait; check `staleSources` |
| Device pages | Large lists; ManageEngine per-device detail calls | Reduce concurrency only if throttled; use cached views |
| Application page sync | Throttled `detectedApps` (minutes) | Expected; see Runbook 4 |
| Everything slow | Upstream throttling or service host CPU/memory | Check Task Manager, service log timestamps, Graph health |
| `429 Too many requests` from the portal itself | Per-IP limit 200 / 15 min (production) | Look for polling loops; behind a proxy ensure `trust proxy` sees real client IPs, otherwise users share one bucket |

## 11. Incorrect device, app or report data

1. Identify the **source** of the record (Intune vs ManageEngine) in the UI and compare against the source console for the same serial.
2. Check `failedSources` / `staleSources` and the report's "Report info / data quality" notes — the figure may be partial.
3. Duplicates: same serial in two sources is expected (two records); Entra duplicate objects: Entra Intelligence → duplicate devices.
4. Application version looks wrong: versions that cannot be compared are "Review required"; latest versions come from winget/Homebrew and may lag vendors.
5. Compliance state differences: ManageEngine security-derived state is not the same as Intune native compliance (`macKpi` tests encode this).
6. Reproduce with the filters shown in the export "Report info" sheet; file a bug with source, serial and screenshot (no secrets).
7. If a number is changed in code, add a test in the relevant `__tests__/` folder.

## 12. Escalation matrix

| Area | First contact | Escalate to |
|---|---|---|
| Portal code / bug | Developer on call (`.github/CODEOWNERS`: project owner) | Engineering lead |
| Entra consent, app registration | Identity/Entra admin | Security |
| Intune / Graph | Endpoint admin | Microsoft support |
| ManageEngine / Zoho | Endpoint admin | ManageEngine support |
| Slack / Jira workspace | Workspace admins | — |
| Host, IIS, service, backups | Infrastructure | — |

*Names and on-call details are Not verified; fill in your organisation's contacts.*

## ManageEngine shows "Error" / "auth failed: 400"

Zoho throttles token requests and reports it as HTTP 400 ("You have made too many requests continuously"). The app now shows that explanation, and keeps the access token in `manageengine-token.json` in the data folder so server restarts reuse it. Cause: frequent restarts or repeated manual runs each request a new token. Fix: wait a few minutes (Zoho decides when it clears), avoid restart loops, then refresh the dashboard. If it persists, re-generate the refresh token in the Zoho API console.

## Intune shows "Error" but credentials are fine

Each source gets 60 s per device fetch (`SOURCE_FETCH_TIMEOUT_MS` in `server/src/routes/devices.ts`); under load (several heavy jobs at once) a ~5,000-device pull can exceed a shorter limit and the badge keeps the last error until the next successful refresh. Refresh the dashboard; Graph 429 responses clear on their own.

## Ocean says "I could not find a verified answer" or only shows excerpts

Ocean answers only from indexed, enabled documentation. Check Settings → Ocean Knowledge: the document must be **Indexed** and **Use as source** on; administrator-only documents are hidden from standard roles; re-index after a documentation change; set `GEMINI_API_KEY` for written answers (without it Ocean shows excerpts). Full guide: [07-features/OCEAN.md](07-features/OCEAN.md#troubleshooting).
