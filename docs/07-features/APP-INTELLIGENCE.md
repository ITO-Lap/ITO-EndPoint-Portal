# App Intelligence

Read-only module (**Endpoint Management → ManageEngine App Inventory → Verified updates** tab; there is no separate nav entry) that correlates Intune and ManageEngine
app data with **verified** latest versions and says what needs packaging. It does not install,
publish, approve, deploy or modify anything in Intune or Endpoint Central. The one outward action is the
confirmed Jira request / Slack message described under *Raise a mismatch* below.

## Relationship to the other App Inventory tabs
The Endpoint Central and Intune Self Service tabs show what is installed. Their "Newest Installed" column and
"Fleet-aligned / Version drift" badge compare versions only against the newest version seen in the fleet — **not**
a vendor release — so they never claim an app is "up to date". Verified vendor versions, the deployed Intune
package version and packaging decisions live only in the Verified updates tab.

## What it answers
Installed apps and device counts per platform, detected versions, the version currently packaged in
Intune, the latest verified version, and whether a new package, an updated package, or nothing is needed.

## Data sources (provenance is always shown)

| Source | Used for | Notes |
|---|---|---|
| Intune detected apps (Graph v1.0 `deviceManagement/detectedApps`) | Windows installed apps + versions + device counts | No stable app identifier; macOS rows are not reported in this tenant. Needs `DeviceManagementManagedDevices.Read.All`. |
| Intune app catalog (Graph v1.0 `deviceAppManagement/mobileApps`, `…/assignments`) | Deployed package versions | macOS: `primaryBundleId`/`primaryBundleVersion`. Win32: only `msiInformation.productVersion` (no `displayVersion` is exposed). Needs `DeviceManagementApps.Read.All`. |
| ManageEngine **MDM** inventory (`mdm/devices/:id/apps`) | macOS installed apps (bundle ids) | The current connection is MDM-only. |
| Endpoint Central agent inventory | — | **Disabled** until the token has `DesktopCentralCloud.Inventory.READ`, `ENDPOINT_CENTRAL_BASE_URL` is set, and an inventory endpoint is verified. No inventory calls are made today. |
| Homebrew cask API (`formulae.brew.sh/api/cask/<token>.json`) | macOS latest version + `auto_updates` | Queried per token. |
| Microsoft winget-pkgs manifests (GitHub API + raw manifest) | Windows latest version | The manifest's `PackageVersion` is read and must match its directory. 60 requests/h unauthenticated — set `GITHUB_TOKEN` to raise. |

Only Graph **v1.0** is used; no beta adapter is needed.

## Scope: what is scanned and shown
OS-native apps are **excluded from the scan** (counted and reported as "N native apps excluded"):
Microsoft Store / MSIX apps (AppX `CN=` publisher), Windows built-in components (`Microsoft Windows …`,
`Windows Driver Package …`, etc. from Microsoft), and Apple system apps (`com.apple.*`). What remains is
classified by **install source**, derived from Intune packages and their assignments:

| Install source | Meaning |
|---|---|
| Custom | IT packaged it in Intune (Win32 / MSI / pkg / dmg / LOB / winget app) and it is not offered for self-service |
| Self-service | A matching Intune package has an `available` / `availableWithoutEnrollment` assignment (Company Portal) |
| Manual | No matching package — installed by a user or vendor installer outside managed deployment |

This describes how the app is *made available*, not how a given device received it. A name-only package
match is shown as "· name match" (low confidence); a strong identifier (bundle id, winget id) outranks it.
The **Endpoint Central self-service portal cannot be read** with the current MDM-only connection, so only the
Intune Company Portal is recognised as self-service (the data-sources panel says so). Vendor
auto-updating third-party apps (e.g. Chrome, Slack) are *not* native and stay in scope; their status is
"Native update" (the vendor updater handles them).

## Rules the engine enforces
- `latest` never comes from inventory. It comes only from a catalog-mapped adapter result.
- An app is tied to a latest-version source only through the curated catalog
  (`server/src/services/appIntel/catalog.ts`): macOS by exact bundle id, Windows by exact name **and**
  publisher. Anything else is **Data unavailable**. Add catalog entries only after checking that the
  winget manifest / Homebrew cask exists.
- Only strong identifiers (bundle id, winget id, MSI product code) auto-match a package. A name-only
  package candidate yields **Review required**, never "Package required".
- Versions are compared with a vendor-aware comparator (`version.ts`); unparsable versions → Review required.
- Native update: Store/MSIX apps (AppX `CN=` publisher), `com.apple.*` apps, catalog apps with a vendor
  auto-updater, and any cask that reports `auto_updates`.
- Strict live-only: provider failures are reported per source; nothing falls back to mock or stale-as-fresh data.

## Statuses
Up to date · Update available — existing package · Package required · Repackage required · Native update · Review required · Data unavailable.
Each row has a "Why this status?" explanation and an evidence table (value, source, as-of).

## Application lifecycle (per app, in the table and the drawer)
Every field comes from data a connected system actually reports. When a source reports nothing, the UI says
"Not recorded" / "Not identified" / "Not checked" — it never substitutes a guess.

| Field | Source | When it is empty |
|---|---|---|
| **Owner** | Intune `mobileApp.owner` of the matched package (strong-identifier match preferred) | "Not recorded". The publisher is the vendor, never shown as the owner. |
| **Packaging status** | Deployed package version vs the verified latest: Package current / behind / No package / Vendor updates / Unknown | Unknown when Intune reports no version or the catalog is unreadable. |
| **Deployment ring** | Intune assignments of the matched package. `All devices` / `All users` are read directly; group names (resolved via `Group.Read.All`) are matched to conventions — *Pilot*, *Ring N*, *Test*, *Broad* — and shown as **inferred**. Exclusion groups are ignored. | "Not identified", with the reason (no assignments, no naming convention, or group names unreadable). |
| **Estimated impacted devices** | Devices on versions older than the latest verified one, as a count and % of detected installs, plus how many sit on a version with known CVEs. It is an **estimate**: a device can appear under several versions or providers. | 0 / no % when there is no verified latest. |
| **Known CVEs** | NVD CVE API 2.0 `cpeName` query per installed version (NVD evaluates version ranges: VLC 3.0.16 → 4 CVEs, 3.0.21 → 0). `cisaExploitAdd` marks CISA Known-Exploited. Only the 3 most-installed outdated versions are checked. Runs in the background after each sync, rate limited, cached 24 h (`server/.cache/app-cve.v1.json`). | **Only catalog apps with a verified CPE are checked** (`cpe` in `catalog.ts`). Others show "Not checked" — never "None found". Slack has no NVD product and Zoom's naming is ambiguous, so both are unmapped. A failed or rate-limited lookup shows "Unavailable". |
| **Latest release notes** | winget-pkgs locale manifest `ReleaseNotes` / `ReleaseNotesUrl` (Windows). | Not every manifest has notes ("The manifest publishes no release notes for this version"). Homebrew publishes none, so macOS shows only the vendor site. |

NVD analysis can lag disclosure, and a vendor can fix a CVE without NVD updating ranges, so "None found" means "none in NVD
for the checked versions", not "safe". Add a `cpe` only after confirming the product in the NVD CPE dictionary — an unknown CPE
returns zero results, which would read as a false "clean".

## Raise a mismatch: packaging request or Slack notification
From a row (**Request** / **Slack** buttons) or the drawer (**Raise this mismatch**), IT Admins and Global Admins can:
- **Create packaging request** — creates a Jira Task (existing `JIRA_*` settings) for *Package required*, *Repackage required* and *Update available — existing package*.
- **Notify in Slack** — posts a summary to `SLACK_APP_UPDATE_CHANNEL_ID` (bot token) or the incoming-webhook channel, for any confirmed mismatch.

Safeguards: a **preview** shows the exact title/body/priority and destination, and nothing is sent until the user confirms. The server
builds the content from the latest sync — the client only names the app and destination — and strips control characters and escapes
Slack markup (`<!channel>` etc.) in device-reported names. Helpdesk can view but not create (`403`). A request is recorded
(`server/.cache/app-requests.v1.json`: who, when, app, target version, Jira key) **only after delivery succeeds**; a duplicate
Jira request for the same app + version is refused (`409`, with the existing key), and Slack repeats are limited to one per hour.
Priority is *Critical* when a known-exploited CVE affects an installed version, *High* for critical/high CVEs, otherwise *Medium*.
Requests only record intent: nothing is packaged, published or deployed. Creations are logged with actor and role.

## Packaging hand-off
For *Package required* / *Repackage required* the drawer offers **Create package**, which calls the
packager registered through `src/lib/packagingHandoff.ts` with a build-only intent (winget id or cask
token, target version, reason). **No WinGet or Homebrew packaging workflow exists in this codebase yet**,
so the button is disabled with an explanation and a "Copy package request" fallback is provided. When a
packager is added, call `registerPackager('windows' | 'macOS', handler)` and set `packagers()` in
`server/src/services/appIntel/service.ts`.

## API (`/api/app-intel`, roles: Global Admin, IT Admin, Helpdesk)
`GET /status` · `POST /sync` (starts a background sync) · `GET /summary?platform=` ·
`GET /apps?platform=&status=&provider=&publisher=&syncState=&confidence=&installSource=custom|self-service|manual&q=&sortKey=&sortDir=&page=&pageSize=` ·
`GET /apps/detail?key=` (adds `lifecycle`, `cve`, `requests`) · `GET /requests/preview?key=&kind=jira|slack` · `POST /requests {key, kind}` (Global Admin / IT Admin). Results are cached in memory with a visible `syncedAt`; the first request (and a
snapshot older than 30 minutes) triggers a background sync.

## Tests
`server/src/services/appIntel/__tests__/lifecycle.test.ts` (owner, ring, packaging, impact, CVE, release notes), `server/src/routes/__tests__/appIntelRequests.test.ts`, `src/pages/__tests__/appLifecycle.test.tsx`.
`server/src/services/appIntel/__tests__/` (version, normalize, latestVersion, decision, service/capabilities/query),
`server/src/services/appIntel/__tests__/installSource.test.ts`, `server/src/routes/__tests__/appIntel.test.ts`, `src/pages/__tests__/appIntelligencePage.test.tsx`.
