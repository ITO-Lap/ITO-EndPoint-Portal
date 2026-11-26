# Role Activity Audit

The **Role Activity Audit** page (Security group, nav id `role_activity_audit`) is a live browser of admin role-management, RBAC, and permission-change activity across Microsoft Entra ID, Intune, and SharePoint. Nothing is stored by the app: each refresh queries all three sources directly.

## What it is and who can use it

Role Activity Audit answers "who changed admin roles or permissions, where, and when" in one merged table.

- Page permission key: `pages.Role Activity Audit`.
- Export permission key: `roleActivity.export` (shows the Save CSV / Save JSON buttons).
- Default roles: Global Admin (everything), IT Admin (page + export), Helpdesk (page only, no export). Helpdesk is not in the excluded-pages list, so it can open this page.
- Server-side gate on the API: `requireCapability('pages.Role Activity Audit')`, the same permission the sidebar uses, so built-in and custom roles behave alike (Global Admin, IT Admin and Helpdesk have the page by default; HTTP 403 otherwise).
- Source files: `src/pages/RoleActivityAuditPage.tsx`, `src/components/role-activity/*`, `src/api/roleActivity.ts`, `server/src/routes/roleActivity.ts`, pullers `entraRoleAuditPuller.ts`, `intuneRoleAuditPuller.ts`, `sharepointRoleActivityPuller.ts`.

## How it works: what counts as an event and the time window

Each request fans out to three pullers for the requested range and merges the results. Entra and Intune run one after the other (they share one Graph app registration and throttling budget); SharePoint runs concurrently with that pair.

| Source (label) | `source` value | What is counted | Upstream |
|---|---|---|---|
| Entra ID | `entra_role_mgmt` | Every directory audit record with `category eq 'RoleManagement'` (e.g. Add member to role, Add eligible member to role, Update role definition). Actor = initiating user UPN, else app name; target = first target's UPN or display name. | Graph v1.0 `/auditLogs/directoryAudits`, page size 200 |
| Intune | `intune_rbac` | Intune audit events with `category = 'Role'`, plus any event whose operation type, activity, or display name contains "role" (case-insensitive). | Graph `/deviceManagement/auditEvents`, split into chunks of `INTUNE_AUDIT_CHUNK_DAYS` (default 7) |
| SharePoint | `sharepoint_admin` | `Audit.SharePoint` records whose Operation is in a fixed list: AddSiteCollectionAdmin, RemoveSiteCollectionAdmin, SiteCollectionAdminAdded, SiteCollectionAdminRemoved, SitePermissionsModified, SiteCollectionPermissionsModified, PermissionLevelModified, PermissionLevelAdded, PermissionLevelRemoved, AddedToGroup, RemovedFromGroup, GroupAdded, GroupRemoved, SharingPermissionsModified. | O365 Management Activity API, queried in 24-hour windows |

Time window and limits:
- Default window when no range is sent: trailing **24 hours**. The page also starts at the last 24 hours.
- Maximum span per request: `ROLE_ACTIVITY_LIVE_BROWSE_MAX_DAYS`, default **31** days. A longer range returns HTTP 400 ("Requested range spans X days, exceeding the server-configured maximum of N days."). `endUtc` must be after `startUtc`.
- The UI hardcodes 31 as its limit and hides presets that exceed it (presets: Last 24 hours, Last 7 days, Last 30 days, This month, Previous month, This year, Previous year). If an admin changes the env var, the UI cap does not follow; the server error is shown.
- Entra retention floor: if Graph rejects the start time as older than the tenant's audit retention, the puller retries once with the start clamped to that floor, and the page shows an info note instead of an error.
- Partial failure: if one source fails, the other sources' events still appear, and the page shows a per-source warning banner.
- Each view is recorded in the app audit trail (`VIEW_EVENTS` with range, filters, actor, success, correlation id).

## What the page shows

- KPI cards: Total Events, Unique Actors, and a count per source (Entra ID, Intune, SharePoint). Counts reflect the active filters across the whole range, not just the visible page.
- Date range controls: quick presets, start/end date and time, year, and timezone (defaults to the browser's timezone; timezone is for display only and does not change filtering).
- Filters: free-text search (actor, operation, or target) and a Source dropdown. The API also accepts separate `actor`, `operation`, and `target` substring filters.
- Events table: Time (UTC), Time (local), Source, Operation, Actor, Target, Source Record ID (first 20 characters); sortable by time, source, operation, actor, target (default newest first); column chooser; rows per page (default 25, max 200); Refresh with last-refreshed time.
- Detail drawer (click a row): the event fields plus the full raw source record with a copy button.
- Export (needs `roleActivity.export`): **Save CSV** and **Save JSON** download every event matching the current range and filters (the browser pages through the API at 200 per page, up to 100 pages = 20,000 events). CSV columns: id, source, sourceRecordId, occurredAt, actor, operation, target, rawJson; cells starting with `=`, `+`, `-`, `@` are prefixed with an apostrophe to prevent spreadsheet formula injection. File names look like `role-activity-<start>_<end>.csv`. There is no server-side export route and no scheduled email export.

## Data sources and freshness/caching

- Always live: no database, no cache, no watermark, no dedup. Every refresh, sort change, page change, and filter change re-queries all three upstream APIs (filtering, sorting, and pagination happen on the server after the merge).
- Entra and Intune use the Graph app registration (`INTUNE_TENANT_ID` / `INTUNE_CLIENT_ID` / `INTUNE_CLIENT_SECRET`, and the `INTUNE_AUDIT_AUTH_MODE` options). Graph permissions: `AuditLog.Read.All` (Entra) and `DeviceManagementConfiguration.Read.All` (Intune).
- SharePoint uses `ENTRA_TENANT_ID` / `ENTRA_CLIENT_ID` / `ENTRA_CLIENT_SECRET` (falls back to `INTUNE_*`) against `manage.office.com`, which needs the Office 365 Management APIs application permission `ActivityFeed.Read` with admin consent. Each pull first starts the `Audit.SharePoint` subscription (already-subscribed is treated as success). Per Microsoft's Management Activity API behavior, content may appear with a delay and a new subscription may not return past content (general API behavior, not verified in this code).
- Event latency is whatever Microsoft provides; the app adds none.

## API endpoints

| Method | Path | Purpose | Permission |
|---|---|---|---|
| GET | `/api/role-activity/events` | Live merged events. Query: `startUtc`, `endUtc` (ISO-8601), `source`, `actor`, `operation`, `target`, `search`, `timezone`, `page`, `pageSize` (1-200, default 25), `sortField` (occurredAt, source, actor, operation, target), `sortDirection`. Returns `data`, `pagination`, `summary` (`totalEvents`, `uniqueActors`, `bySource`), `range`, optional `sourceErrors` / `sourceNotes`, `correlationId` | Audit Reader (Global Admin, IT Admin, Helpdesk) |
| GET | `/api/role-activity/filter-options` | Curated list of sources and sample operation names for the filter UI (not an enforced allowlist) | `pages.Role Activity Audit` |

## Ocean assistant tool

Ocean's tool **`get_role_activity`** (`server/src/services/copilotTools.ts`, read-only) calls the same `getRoleActivityEventsLive()` function as the page. Parameters: `startUtc`, `endUtc` (default: last 24 hours; maximum span is the same 31-day cap) and `search` (matches actor, operation, or target). It returns the first 50 events plus summary and source errors, with Entra/Intune/SharePoint citations, and the lookup is recorded in the audit trail under the asking user. Example questions: "Who was added to a Global Administrator role this week?", "Any SharePoint site collection admin changes yesterday?". Needs `copilot.access` and `copilot.read`. The tool calls the live function directly, so the `requireAuditRole` route check is not applied to it (the asking user's email and role are only recorded in the audit trail).

## Troubleshooting

- Banner "<Source> failed: ... showing results from the other sources only": read the technical details. Common causes: missing credentials; missing admin consent for `AuditLog.Read.All`, `DeviceManagementConfiguration.Read.All`, or `ActivityFeed.Read` (the SharePoint error text names `ActivityFeed.Read` explicitly on 401/403); Graph 429 after 5 retries.
- "Requested range spans ... exceeding the server-configured maximum": shorten the range or raise `ROLE_ACTIVITY_LIVE_BROWSE_MAX_DAYS`.
- Blue note "narrowed to start at ...": your tenant's Entra audit retention is shorter than the range; not an error.
- Slow first load on long ranges: three upstream APIs are queried live; use a shorter range.
- 403 "requires the pages.Role Activity Audit permission": the caller's role does not have the Role Activity Audit page (add it in Settings -> Roles & Permissions).
- No Save buttons: you lack `roleActivity.export` (Helpdesk by default).
- Zero SharePoint events: either no matching changes, or the SharePoint puller has never been validated against a live tenant (see Limitations).

## Limitations

- Live only: no history beyond what Microsoft retains, no persistence, no scheduled exports or email delivery (removed).
- Maximum 31 days per query (configurable on the server only).
- SharePoint operation filter is a best-effort list from Microsoft documentation; the code states the SharePoint integration is unvalidated against a live tenant, so names may be missing.
- Intune matching includes any event containing the word "role", which may include loosely related events.
- Only the first target resource of each Entra and Intune record is shown as Target; the full record is in the detail drawer.
- Sorting by time is a string comparison of ISO timestamps.
- Export holds up to 20,000 events and is assembled in the browser.
