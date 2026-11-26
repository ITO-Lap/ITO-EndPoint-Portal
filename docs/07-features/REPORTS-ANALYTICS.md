# Reports & Analytics

## What the Reports & Analytics page is and who can use it

Reports & Analytics is the Reports-group page (nav id `reports_analytics`, page title "Reports & Analytics", permission key `pages.Reports & Analytics`) where an admin runs one of 18 built-in on-screen reports against live device and identity data, sorts and pages through the rows, and downloads a report as CSV. The page component is `src/components/reports/ReportsPage.tsx`; the backend is `server/src/routes/reports.ts` with report definitions in `server/src/reporting/definitions.ts` and the engine in `server/src/reporting/engine.ts`.

Default access: Global Admin and IT Admin have the page; Helpdesk does not (it is in Helpdesk's excluded-pages list in `server/src/services/rolePermissions.ts`). Custom roles get it only if "Reports & Analytics" is ticked in Settings -> Roles & Permissions. To email or post reports on a schedule instead, see [SCHEDULED-REPORTS.md](SCHEDULED-REPORTS.md).

## What the Reports & Analytics page shows

The page has a row of source tabs, and below it a report catalog and a results table.

- **Source tabs**: All Sources, Intune, ManageEngine, and Microsoft Graph (marked "API"). Each tab shows a count of reports. Intune and ManageEngine tabs also show a green dot when that integration is configured and not reporting errors, and a grey dot otherwise (from `GET /api/integrations/status`).
- **All Sources / Intune / ManageEngine layout**: a left sidebar lists reports (filterable by category: Inventory, Compliance, Security, Software, Health, Users) and a runner panel on the right. Clicking a report runs it immediately.
- **Microsoft Graph tab layout**: four domain cards, "Endpoint Management" (Microsoft Intune), "Security & Threat" (Microsoft Defender), "Identity & Users" (Microsoft Entra ID) and "Compliance & Audit" (Microsoft Purview). Clicking a card lists its reports; clicking a report card ("Run Report") loads it below. In the current code no registered report has the `endpoint` category, so the Endpoint Management card lists zero reports.
- **Runner panel**: report name and description, summary KPI cards, the result table with sortable column headers, a "Cached" badge when the result came from the server cache, a Refresh button, an Export CSV button, and pagination at 100 rows per page ("Showing 1-100 of N rows").
- Empty states: "No data for this report - Connect an MDM source or check configuration", "No reports - Try a different source or category", "Select a report".

## Built-in reports and what each covers

The registry in `definitions.ts` holds these reports (id, category, sources, server cache lifetime):

| Report | id | Category | Sources | Cache |
|---|---|---|---|---|
| Full Device Inventory | `device-inventory` | inventory | Intune, ManageEngine | 300 s |
| Non-Compliant Devices | `non-compliant-devices` | compliance | Intune, ManageEngine | 180 s |
| Compliance Summary by Source | `compliance-by-source` | compliance | Intune, ManageEngine | 300 s |
| Stale Devices (30+ Days) | `stale-devices` | health | Intune, ManageEngine | 600 s |
| Encryption Status (BitLocker / FileVault) | `encryption-status` | security | Intune, ManageEngine | 300 s |
| OS Version Distribution | `os-distribution` | inventory | Intune, ManageEngine | 600 s |
| Top Policy Failures | `policy-failures` | compliance | Intune, ManageEngine | 300 s |
| Hardware Inventory | `hardware-inventory` | inventory | Intune, ManageEngine | 600 s |
| User & Device Assignment | `user-device-assignment` | users | Intune, ManageEngine | 300 s |
| Issue Severity Distribution | `severity-distribution` | security | Intune, ManageEngine | 300 s |
| Management Source Distribution | `source-distribution` | inventory | Intune, ManageEngine | 300 s |
| VIP Device Health | `vip-device-health` | health | Intune, ManageEngine | 180 s |
| Risky Sign-ins | `graph-risky-signins` | threat | Intune (Graph) | 180 s |
| Sign-in Activity | `graph-signin-activity` | identity | Intune (Graph) | 300 s |
| MFA Registration Status | `graph-mfa-registration-status` | identity | Intune (Graph) | 300 s |
| Inactive Users | `graph-inactive-users` | identity | Intune (Graph) | 600 s |
| Directory Audit Log | `graph-directory-audit-log` | audit | Intune (Graph) | 300 s |
| Device Cleanup Recommendations | `device-cleanup` | inventory | Intune, ManageEngine | 600 s |

The Graph identity and audit reports read Microsoft Entra data (users, sign-ins, directory audits), which the server loads only when Entra is configured (`isEntraConfigured()` in `server/src/services/entra.ts`).

## How Reports & Analytics works

1. Opening the page calls `GET /api/reports` (catalog) and `GET /api/integrations/status` (tab dots).
2. Selecting a report calls `POST /api/reports/:id/run` with `limit` (100 from the UI), `offset`, `sortBy` and `sortDir`.
3. The server loads the current device list through `fetchAllDevices()` (the same unified Intune plus ManageEngine list the Managed Devices page uses) and, when configured, Entra data, then runs the report and returns columns, summary cards and one page of rows. Mock data is served when no integration credentials exist, so the page works on a fresh install.
4. Results are cached in server memory per **request**: the key is the report id plus the parameters (page, sort, filters), so page 2 or a new sort is a different answer from page 1. An identical repeat request within the cache lifetime is returned with `cached: true` (the "Cached" badge). At most 200 variants are kept (oldest dropped first). The Refresh button first calls `POST /api/reports/:id/invalidate`, which clears every cached variant of that report, then runs it again.
5. Sorting: clicking a column header toggles ascending/descending and re-runs the report from offset 0. Null values sort last.
6. Export CSV downloads `GET /api/reports/:id/export/csv` as `<report-id>-<YYYY-MM-DD>.csv`. The export returns up to 5,000 rows (`limit` is forced to 5000, `offset` to 0), using the report's column labels.

Formats: this page exports CSV only. Excel, PDF and PowerPoint output exists only for compliance and inventory scheduled reports (see [SCHEDULED-REPORTS.md](SCHEDULED-REPORTS.md)).

## Reports & Analytics API endpoints

Mounted under `/api/reports` behind the session gate and the general API rate limit (200 requests per 15 minutes per client in production, 2,000 in development). None of these routes applies a per-capability check on the server; access control is the page permission in the UI plus the session.

| Method | Path | Purpose | Permission |
|---|---|---|---|
| GET | `/api/reports` | List report metadata (id, name, category, description, sources) | Signed-in session |
| POST | `/api/reports/:id/run` | Run a report; body `limit` (1-5000, default 500), `offset`, `sortBy`, `sortDir` | Signed-in session |
| GET | `/api/reports/:id/export/csv` | Download the report as CSV (max 5,000 rows) | Signed-in session |
| POST | `/api/reports/:id/invalidate` | Clear the server cache for one report | Signed-in session |
| GET | `/api/integrations/status` | Integration health used for the tab dots | Signed-in session |

An unknown report id throws "Report not found: <id>" through the error handler.

## Reports & Analytics settings and environment variables

There are no page-specific settings. Data comes from what is connected in Settings -> Integrations (Intune, ManageEngine, Entra) or the matching variables in `server/.env`; see `docs/14-environment-variable-reference.md`. No `DATABASE_URL` is needed: reports are computed and cached in memory (the cache is lost on restart).

## Reports & Analytics troubleshooting

- "Failed to load report catalog": the `/api/reports` call failed; check the server is running and you are signed in.
- Empty table, "Connect an MDM source or check configuration": no devices were returned. Check Settings -> Integrations, then press Refresh.
- Sample-looking data: no credentials are configured, so mock data is served.
- Graph identity reports are empty: configure Microsoft Entra ID in Settings -> Integrations and Sync it.
- Sorting, paging or Refresh seems to do nothing: the result is cached for 3 to 10 minutes (see the table). Wait for expiry or restart the server.
- CSV export is truncated: the cap is 5,000 rows.

## Reports & Analytics limitations

- CSV only from this page; no Excel, PDF or PowerPoint.
- No saved or custom reports, filters or date ranges; report content is fixed in `definitions.ts`.
- The cache is per report id (not per sort or page) and in memory only.
- `src/pages/ReportBuilderPage.tsx` (compliance or inventory download as CSV, Excel, PDF or PPTX through `/api/intelligence/export`) exists in the code but is not imported by `App.tsx` or reachable from the navigation.
