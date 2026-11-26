# Patch Operations

## What Patch Operations is and who can use it

Patch Operations is a page in the Patches group of the sidebar (page title `Patch Operations`, marked "New"). It shows Endpoint Central Patch Manager patch health for Windows client and macOS endpoints, a connector trust indicator, an explainable per-device health score, a critical remediation queue, and approval-gated scan and deploy actions.

Permission keys (defined in `server/src/services/rolePermissions.ts`):

| Key | Meaning |
|---|---|
| `pages.Patch Operations` | See and open the page. |
| `patchOps.scanRemediate` | Prepare and confirm Scan and Remediate (deploy) actions. |

Default roles: Global Admin always has every permission. IT Admin and Helpdesk both have `pages.Patch Operations` and `patchOps.scanRemediate` by default (Helpdesk is deliberately allowed to scan and remediate; every action still needs explicit confirmation, see `docs/ROLES.md`). Custom roles get whatever an administrator grants. Without `patchOps.scanRemediate` the page is read-only: the Scan, Remediate and Prepare deployment buttons are disabled in the UI and the server returns 403 for the write routes.

Note: the read endpoints (`/api/endpoint-central/operations` and the missing-patches endpoint) do not check a capability on the server; page access is enforced by the UI and navigation.

## Data sources

Patch Operations reads from Endpoint Central Patch Manager (cloud host default `https://endpointcentral.manageengine.com`, overridable with `ENDPOINT_CENTRAL_BASE_URL` or `ENDPOINT_CENTRAL_PATCH_URL`). It authenticates through the same Zoho OAuth client as ManageEngine MDM (`MANAGEENGINE_*` settings), so no separate credentials exist.

- Fleet list: `GET /api/1.4/patch/allsystems` (paged, 1000 per page, up to 10 pages). Provides per-device severity counts, last scan, last successful scan and OS name.
- Per-device missing patches: `GET /dcapi/threats/systemreport/patches` filtered by the device's detail resource id and `patch_status=Missing` (100 per page, up to 10 pages).
- Scan: `POST /api/1.4/patch/computers/scan`. Deploy: `POST /api/1.4/patch/installpatch?api2`.

Rate limit: Zoho rate-limits per OAuth client, and this client is shared with the ManageEngine MDM reads, so heavy MDM syncs can cause 429s on patch calls and the reverse. Patch calls are retried up to 4 attempts on HTTP 429 and 5xx, waiting for the `Retry-After` header when present (otherwise exponential backoff with jitter), capped at 20 seconds per wait. If every attempt fails and a previous result exists, the last-known data is served (a warning is logged with its age) instead of failing. Results are cached in memory for 5 minutes; "Refresh data" bypasses the cache.

Only agent-managed endpoints appear in Patch Manager. MDM-only Macs (no Endpoint Central agent) have no patch data and are simply absent ("not reported").

## What the page shows

The page loads the dashboard on open (`GET /api/endpoint-central/operations`). A "Refresh data" button reloads with `refresh=1`. A "Dashboard" back link returns to the main dashboard. Errors appear in a red banner.

Scope: only Windows client and macOS endpoints are assessed. Windows Server (any OS name matching "windows server") and Linux/other platforms are excluded. A Windows system with no reported OS name is treated as client.

Top row of three cards:

1. Connector trust. Green when the Patch Manager read succeeded ("data is current for this refresh"), red otherwise, with the error message, the request latency in ms (or "Not connected") and the last refresh time. When ManageEngine is not configured it shows "ManageEngine is not configured."
2. Data coverage. "assessed / client endpoints" (assessed means the device has a last successful scan time), plus the count unscanned (no successful scan) and stale scans (last successful scan older than 7 days, or never). An Export button downloads all scored endpoints (assessed or not) as CSV (`patch-operations-YYYY-MM-DD.csv`) with columns Device Name, Platform, OS, Health Score, Health Level, Last Successful Scan, Scan Status (Not scanned / Stale (>7 days) / Current), Critical Missing Patches, Other Missing Patches.
3. Endpoint health score. Fleet score out of 100 (average of device scores, or a dash when nothing has been assessed), with counts of critical, high risk and healthy devices. It has the same CSV export.

Health score per endpoint: starts at 100 and subtracts points: scan never succeeded 30; last successful scan older than 14 days 25 (older than 7 days 12); critical patches 20 each, capped at 45; important patches 6 each, capped at 20; non-critical patches (OS + third-party + driver + BIOS missing counts) 2 each capped at 15, applied only when the device has no critical or important patches. Levels: below 45 Critical, below 65 High risk, below 85 Attention, otherwise Healthy. Each device carries its list of scoring factors. Devices are sorted lowest score first.

Critical remediation queue: a table of devices with at least one critical patch, with columns Endpoint (name, platform, OS), Health (score and level badge), Missing patches ("N critical, M total"; clicking opens the missing-patches modal), Last successful scan, and Action (Scan, Remediate). When none: "No missing critical patches were reported by Endpoint Central in the latest scan." There are no tabs or search filters on the page itself; the only filter controls are the view tabs inside the missing-patches modal.

Note: the "total" in the queue is the sum of the non-critical counts (`missingPatchCount`), not critical plus other.

## Missing patches per device

Clicking the missing-patch count of a device in the queue opens a modal titled "Missing patches" with the device's platform, OS and last successful scan. It opens on the All missing view. Four tabs choose the view (`GET /api/endpoint-central/devices/:resourceId/missing-patches?view=...`):

| View | Tab label | What is returned |
|---|---|---|
| `critical` | Critical | Only patches with severity Critical (also filtered server-side with `severity=Critical`). |
| `all` | All missing | Every missing patch. |
| `os` | OS updates | Patches categorized as OS update. |
| `app` | App updates | Patches categorized as Application update. |

Category is derived from the patch `update_type`, not a verified server-side filter: update types containing "third party" map to Application update; types matching security, non-security, service pack, OS, rollup or feature map to OS update; anything else is Other (shown only in All missing). Severity is Critical, Important, Moderate, Low or Unrated. Results are sorted by severity, then newest release first.

Each patch row shows severity badge, patch name, description, and when available: KB number (extracted from the description), vendor, category, release date, approval status, deployment status, and CVEs (extracted from the description). Reboot requirement and bulletin id are returned by the API but are not displayed in the modal. States: loading skeleton, "No missing patches reported for this filter.", or an error message (see Troubleshooting). Patch detail is cached 5 minutes per device and view.

## Remediation actions

Two actions exist, both created from the queue and both require `patchOps.scanRemediate`. Nothing is sent to Endpoint Central until the same person confirms.

Scan: click Scan on a device. The page calls preview with `type: scan` and the device's resource id. A "Confirmation required" panel says "Run a Patch Manager scan on 1 endpoint(s)", shows the expiry time and an audit ID, and a Confirm action button.

Deploy (Remediate): click Remediate, enter an Endpoint Central deployment policy template ID (numeric; the policy must already exist in Endpoint Central), then click Prepare deployment. The page re-reads the device's currently missing critical patches (forced refresh) and uses all of their patch ids; if none are reported it stops with an error. Preview then creates a pending request, and the panel shows "Deploy N selected patch(es) to 1 endpoint(s) using policy ...". Only critical patches are deployable from this page. An optional `deadlineTime` (positive integer) is accepted by the API but the page does not set it.

Preview checks (server): the connector must be healthy (otherwise 503); every target must be a current assessed Windows client or macOS device (otherwise 400); for deploy, every patch id must currently be reported missing and Critical for that device (otherwise 400).

Confirmation: `POST /api/endpoint-central/remediation/:id/confirm`. Only the person who created the request can confirm it (matched by the `x-user-email` header; others get 403). The request must still be `pending` (409 if executed, failed or expired) and expires 10 minutes after creation. On success the status becomes `executed`; if Endpoint Central rejects the call the status becomes `failed` with the error and the API returns 502. The page then refreshes dashboard data.

Safety limits (Zod validation): ids must be numeric strings (up to 30 digits). Scan accepts 1 to 100 resource ids (the page sends one). Deploy accepts exactly 1 device and 1 to 50 patch ids. Deploy uses only explicitly selected patch ids through a pre-existing deployment policy; it never uses an "all patches" mode.

Audit: each request is stored with id (`patch-action-...`), type, status, actor email and role, created, expiry and executed times, target ids, patch ids, policy id and any error. Records persist in `patch-remediation-actions.json` in the server data directory (the most recent 250 are kept). Actor email defaults to `unknown@zinnia.com` and role to `End User` when the headers are absent. Whether these also feed the app-wide audit log is not verified in this code path.

## API endpoints

| Method | Path | Purpose | Permission |
|---|---|---|---|
| GET | `/api/endpoint-central/operations?refresh=1` | Dashboard: connector, coverage, health, scored devices. Read only. | None checked on server (page access via UI) |
| GET | `/api/endpoint-central/devices/:resourceId/missing-patches?view=critical\|all\|os\|app&refresh=1` | Missing patches for one device (`:resourceId` is the detail resource id, 6 to 30 digits). Always returns 200 with `status` of `ok`, `not_configured`, `scope_required` or `error`; bad id/view returns 400. | None checked on server |
| POST | `/api/endpoint-central/remediation/preview` | Create a pending scan or deploy request (10-minute expiry). | `patchOps.scanRemediate` |
| POST | `/api/endpoint-central/remediation/:id/confirm` | Execute a pending request (only creator). Only route that writes to Patch Manager. | `patchOps.scanRemediate` |
| GET | `/api/patch/systems?platform=Mac&refresh=1` | Raw per-system patch status for the fleet (used by other pages). | None checked on server |
| GET | `/api/patch/priority-summary?refresh=1` | Windows/macOS severity counts and top 3 missing Critical patches per platform for the main Dashboard "Patch priority" panel. | None checked on server |

The last two belong to the patch data layer shared with other pages, not the Patch Operations page itself.

## Settings and environment variables

| Variable | Purpose |
|---|---|
| `MANAGEENGINE_CLIENT_ID`, `MANAGEENGINE_CLIENT_SECRET`, `MANAGEENGINE_REFRESH_TOKEN`, `MANAGEENGINE_API_DOMAIN` | The Zoho OAuth client shared with ManageEngine MDM (secrets; set via `server/.env` or Settings, never commit values). Patch Operations needs this client configured. |
| `ENDPOINT_CENTRAL_BASE_URL` / `ENDPOINT_CENTRAL_PATCH_URL` | Patch Manager host; default `https://endpointcentral.manageengine.com`. |

OAuth scopes: reads need `DesktopCentralCloud.PatchMgmt.READ` (documented alongside `MDMOnDemand.MDMInventory.READ` and `DesktopCentralCloud.Inventory.READ`; `.ALL` variants are also accepted per `docs/05-api-integrations.md`). Scan and deploy need an update scope; the code's error message calls it `PatchMgmt.UPDATE` (the full scope name is likely `DesktopCentralCloud.PatchMgmt.UPDATE` but this is not verified; `docs/05-api-integrations.md` states the scan/install scope is not verified and `.env.example` references only READ scopes). The OAuth refresh token must be generated with the needed scopes.

Related shared-rate-limit tuning for the MDM side (`MANAGEENGINE_FETCH_CONCURRENCY`, `MANAGEENGINE_DETAIL_TTL_MIN`, `MANAGEENGINE_DETAIL_BUDGET_MS`) is described in `docs/14-environment-variable-reference.md`. Roles and capability grants are managed under Settings (see `docs/ROLES.md`).

## Troubleshooting

429 rate limiting: the Zoho client is shared with MDM, so a big MDM sync can throttle patch reads. The server retries with `Retry-After` and then serves last-known data, so the page usually still loads; look for `serving last-known data` warnings in the server log. If the data looks old, wait a few minutes and click Refresh data, or avoid running an MDM sync at the same time. With no earlier data in memory (for example right after a restart), a failed read shows the connector card in red with the error message.

Connector trust is red: the message is the upstream error (for example `Endpoint Central Patch API 401/403/429 ...`). Check the OAuth client, refresh token, base URL and scopes. While the connector is unhealthy, remediation preview returns 503 ("Refresh the connector before preparing remediation").

"Critical patch names unavailable": this is a server log line from the Security Posture route, not a Patch Operations message. It means the fleet-wide critical patch name fetch failed (and no earlier copy was cached), so that page shows counts without patch names. The Critical Patching report likewise notes "Per-patch names, ages and CVEs were unavailable". Patch Operations itself reads names per device on demand.

scope_required / 403: the missing-patches modal shows "Patch Management access is not configured — the Endpoint Central API client needs the PatchMgmt.READ scope." It appears when Patch Manager returns 401 or 403 for the patch report. Add `DesktopCentralCloud.PatchMgmt.READ` to the OAuth client and regenerate the refresh token. A 403 from the remediation routes ("This action requires the patchOps.scanRemediate permission") is a role problem, not a scope problem. A confirm failing with "update failed (...) Verify the PatchMgmt.UPDATE scope and deployment policy" means the update scope or the deployment policy template id is wrong. A 403 on confirm saying only the creator can confirm means a different user tried to confirm.

Empty lists: the queue is empty when no scanned Windows client or macOS device reports critical patches (the expected healthy state). Everything empty with coverage 0 / 0 usually means missing scope or base URL, or ManageEngine not configured. Devices missing from the page are often MDM-only Macs (no agent), Windows Servers (excluded by design) or devices not yet reported in Patch Manager. "No missing patches reported for this filter" in the modal can also be genuine for the OS or App tab. The modal can show "ManageEngine is not configured." when the integration is not set up.

Expired request: preview requests expire after 10 minutes; prepare the action again.

## Limitations

- Client scope only: Windows Servers, Linux and other platforms are excluded from the page and from remediation targets.
- Deploy handles one device at a time, critical patches only, and needs an existing Endpoint Central deployment policy template id typed in by the user; the page has no policy picker, no scheduling or deadline input, and no reporting of deployment progress beyond the request status (`executed` means Endpoint Central accepted the call, not that the patch installed).
- Scan from the page targets one device at a time (the API allows up to 100).
- Data is cached for 5 minutes and depends on the agent's last scan; scores reflect Patch Manager's last scan, not live device state. Fleet reads page up to 10,000 systems.
- Health score averages over all client devices, including unscanned ones, but is only shown once at least one device has been assessed.
- Patch category (OS vs app) is inferred from `update_type`, not a server-side filter.
- Pending and executed requests are stored in a local JSON file on the server, so they are per server instance.
- The server does not verify the actor headers beyond the permission check; the creator-only confirmation compares the `x-user-email` header.

## The Data Sync card says missing-patch detail is "not available through the current API connection"

The scheduled **Patch data** refresh reads the patch-system list and then the fleet's missing critical patches. If Endpoint Central rejects the second read because the token lacks the Patch Management scope, the row shows **Partial** with this message: the system counts were refreshed, but missing-patch detail cannot be read, so the portal shows no missing-patch numbers rather than invented ones. Grant the Patch Management read scope to the Zoho client in Settings -> Integrations -> ManageEngine, push the credentials again, then press **Sync now** on the Patch data row (Dashboard -> Data Sync).
