# App Guardian

## What the App Guardian page is and who can use it

App Guardian (nav id `app_guardian`, page title "App Guardian", permission key `pages.App Guardian`, Applications group, sidebar badge "Mac") is a read-only Mac application inventory and fleet version-visibility page. Its subtitle is "Mac application inventory and fleet version visibility". Component: `src/pages/AppGuardianPage.tsx`. It does not install, update, approve or block anything. Default access: Global Admin, IT Admin and Helpdesk (it is a Helpdesk default page). The related capabilities `appIntel.read` ("View App Guardian data") and `appIntel.write` ("Send App Guardian reports / submit requests") belong to the App Intelligence module ([APP-INTELLIGENCE.md](APP-INTELLIGENCE.md)), not to this page's own endpoint.

Do not confuse the portal page with the separate App Guardian product design in `apps/mac-package-builder/` (see "What App Guardian monitors and enforces" below).

## What the App Guardian page shows

- **Header**: title, a "ManageEngine API" live label, Refresh and Dashboard (back) buttons.
- **"Inventory only" notice**: "Fleet-observed versions are not vendor update availability. Installs require an approved source and signature-validation service, which are not connected to this API." with a "NO INSTALL ACTIONS" tag.
- **Data line**: "Live inventory" or "API unavailable", the last fetch time, and a refresh icon.
- **Summary tiles**: Mac applications (distinct apps reported), Reported installs (app-device records), Fleet version drift (apps with more than one observed version), Version unknown (apps whose version was not reported).
- **Two views** (switch): "Overview" (shows how many apps have a single observed version across reporting Macs) and "My Apps" (search and inspect). Both show the same table.
- **Search box**: "Search app name, bundle ID, or version", with a result count and a Clear button.
- **Applications table** (sortable): APPLICATION (name and bundle ID), OBSERVED VERSIONS (first three plus "+N more"), FLEET BASELINE, DEVICES, FLEET STATUS (Fleet-aligned, Version drift or Unknown) and a Details button.
- **Details dialog**: per-device table (DEVICE, INSTALLED VERSION, LAST CHECK-IN, sortable) with the note "These are installed versions observed across your fleet. No vendor release catalog or update action is connected here."
- **Footer cards**: "Recommendations and installs are not enabled from this inventory endpoint. Source: ManageEngine Endpoint Central", and "Verified updates are a separate workflow" with a "N FLEET-ALIGNED" tag.
- States: loading spinner, "No Mac applications reported - Connect ManageEngine and sync an enrolled Mac to populate this view", "No matching applications", and an error banner "ManageEngine inventory could not be loaded" with Retry and "Check the ManageEngine integration in Settings".

## What App Guardian monitors and enforces

Monitors: installed macOS applications on enrolled Macs as reported by ManageEngine Endpoint Central, grouped per application, with the versions seen across the fleet and which device has which version. Enforces: nothing. There is no approval, blocking, install or update action in the portal page.

How status is computed (`buildAppInventory` in `server/src/services/manageEngine.ts`): the "fleet baseline" is the newest version observed on any Mac, picked by `pickLatestVersion`. An app is "Fleet-aligned" (API value "Up to date") when every observed version equals that baseline, "Version drift" (API "Update Available") when versions differ, and "Unknown" if any device reports no version. The baseline is not a vendor release, so the page never claims an app is up to date against the vendor. Vendor-verified latest versions, packaged versions and packaging requests are in the Verified updates tab of ManageEngine App Inventory (App Intelligence).

Mac app classification (`server/src/services/macAppClassification.ts`) marks rows as Apple system or pre-installed, managed, manual or review; this page calls the inventory without `includeSystem`, so Apple system apps are hidden by default.

The separate App Guardian product design, mirrored under `apps/mac-package-builder/` (architecture in `apps/mac-package-builder/docs/APP-GUARDIAN-ARCHITECTURE.md`, a Swift menu-bar agent in `apps/mac-agent`, a TypeScript API and PostgreSQL), describes a future model: discovered apps start as `pending_review`, an Admin approves bundle ID, trusted source and expected Team ID, a privileged helper validates signatures, notarization and version before installing, and AI is recommendation-only. That architecture is not connected to this portal page. See [MAC-PACKAGE-BUILDER.md](MAC-PACKAGE-BUILDER.md) for the mirror and [MAC-ADMIN-ACCESS.md](MAC-ADMIN-ACCESS.md) for the separate Mac administrator-access report.

## How App Guardian works

1. On open and on Refresh the page calls `GET /api/integrations/manageengine/apps` and uses only the `macos` list.
2. The server returns `getEndpointCentralAppInventory(...)`, built from Endpoint Central's installed-software API (`/api/1.4/inventory/installedsoftware`), not the MDM per-device app list. Macs are scanned first and Windows devices after; servers are excluded. Scanning is a background job that respects Endpoint Central's rate limit (about 2.5 s between calls, up to 8 retries), saves results after each batch so a restart resumes, and re-scans after 6 hours. The endpoint returns whatever has been scanned so far plus `coverage` and `progress` (idle or running, scanned, total), so a freshly started server can show partial data.
3. The scan cache is stored under `DATA_DIR` in `cache/endpoint-central-app-inventory.v2.json`.
4. No `DATABASE_URL` is needed.

## App Guardian API endpoints

| Method | Path | Purpose | Permission |
|---|---|---|---|
| GET | `/api/integrations/manageengine/apps` | Windows and macOS installed-app inventory, coverage and scan progress; query `refresh=1`, `includeSystem=1` (the page sends neither) | Signed-in session (no capability check on the route) |

The related App Intelligence routes under `/api/app-intel` (status, sync, summary, apps, export, report to Slack, requests) require `appIntel.read`, and `report/slack` and `requests` also require `appIntel.write`; this page does not call them.

## App Guardian settings and environment variables

The page has no settings. Data requires ManageEngine configured in Settings -> Integrations (client ID, client secret, refresh token, API domain). Relevant variables: `ENDPOINT_CENTRAL_BASE_URL` (default `https://endpointcentral.manageengine.com`), `ENDPOINT_CENTRAL_PATCH_URL` (fallback host), `DATA_DIR`. Endpoint Central needs inventory read access (the scope `DesktopCentralCloud.Inventory.READ` is cited in the App Intelligence docs). See `docs/14-environment-variable-reference.md`.

## App Guardian troubleshooting

- "ManageEngine inventory could not be loaded": check the ManageEngine integration in Settings -> Integrations (Push, then Sync), then Retry.
- "No Mac applications reported": ManageEngine is not connected, or no enrolled Mac has been scanned yet. Wait for the background scan (coverage and progress come with the response) and press Refresh.
- Fewer apps than expected: Apple system apps are hidden, servers are excluded, and a Mac that has not been scanned is not listed.
- Counts change between refreshes: the scan is progressive and re-runs every 6 hours.
- Rate-limit errors (HTTP 429) from Endpoint Central slow the scan; it retries with backoff.

## App Guardian limitations

- Inventory only: no install, update, approval or enforcement actions.
- "Fleet baseline" and "Version drift" compare against the newest version seen in your own fleet, not vendor releases.
- Mac only; Windows apps are returned by the API but this page ignores them (see the ManageEngine App Inventory page).
- Search covers app name, bundle ID and versions only; no filter by device or user.
- The mirrored App Guardian agent, API and policy engine are a separate, not-yet-integrated design.
