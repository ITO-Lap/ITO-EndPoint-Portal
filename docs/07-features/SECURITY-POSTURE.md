# Security Posture

> **Where:** sidebar → **Security** → **Security Posture** · **Page permission:** `pages.Security Posture` (Global Admin, IT Admin, Helpdesk by default)
> **Data:** Microsoft Intune (Windows) + Endpoint Central MDM (macOS) + Endpoint Central agent and Patch Manager (Windows and macOS) · **Needs no database**
> **Ocean assistant tools:** `get_security_posture`, `list_posture_devices`, `get_device_missing_patches`, `get_posture_diagnostics`

## What the Security Posture page is
The Security Posture page answers "how secure is the whole fleet right now?". It scores Windows and macOS devices on four checks (called pillars), shows which devices pass, fail or are not reported for each pillar, and lets you open any device to see exactly why. It is the team's source of truth: a device or a signal is never silently dropped. When a source is throttled, unmatched or stale, the page says so and shows the gap instead of hiding it.

## Which devices are where (hybrid model)
- **Windows devices are in BOTH Microsoft Intune and Endpoint Central.** Intune supplies compliance, BitLocker and Intune check-in. The Endpoint Central agent and Patch Manager supply missing-patch data and agent contact time. Security Posture uses both for Windows ("Microsoft Intune + Endpoint Central (hybrid)").
- **macOS devices are ONLY in Endpoint Central.** The Endpoint Central MDM row supplies FileVault, compliance and check-in. Patch Manager supplies missing patches once the Mac has an agent.
- Agent-only machines (an Endpoint Central agent row with no Intune or MDM device) are not scored, but they are counted and listed in diagnostics so nothing is lost.

## The four pillars and the overall score
| Pillar | Weight | Applies to | Passes when |
|---|---|---|---|
| Disk Encryption | 35% | Windows and macOS | BitLocker or FileVault is reported on |
| Critical Patching | 30% | Windows and macOS with a Patch Manager scan | No critical patches missing |
| MDM Compliance | 20% | Intune Windows and Endpoint Central macOS | The compliance policy result is compliant |
| MDM Check-in | 15% | All managed devices | The device checked in within the check-in window (7 days by default) |

- Each pillar's score is passing ÷ assessed devices, as a percentage. A device that is **not reported** is never counted as passing or failing.
- The **overall score** is the weighted average of the pillars that could be assessed. A pillar whose data source is unavailable is left out rather than dragging the score to zero. The page shows how many of the four pillars were assessed.
- **Grade:** 90 and above is A, 80–89 B, 70–79 C, below 70 D.

### Verdict rules per pillar
- **Disk Encryption:** "encrypted/on/enabled/true" passes; "off/disabled/not encrypted/false" fails; unknown, empty, "N/A" or "not reported" is not reported. Windows uses Intune's BitLocker value. macOS uses the Endpoint Central MDM FileVault value.
- **Critical Patching:** matched to a Patch Manager system, fail if it has one or more missing critical patches, pass if none. No scan, or no agent, is not reported. A Windows device in Intune with no Endpoint Central agent shows "No Endpoint Central agent found for this device (not patch-assessed)".
- **MDM Compliance:** Windows uses Intune's native compliance state. macOS uses the Endpoint Central MDM verdict. If the Mac's MDM details could not be read, the result is "Compliance details unavailable" and is not reported, never a failure. Agent-only rows are not reported.
- **MDM Check-in:** judged with the freshest signal. See the check-in rule below.

## How devices from different sources are matched
Security Posture reconciles Intune, Endpoint Central MDM, Endpoint Central agent rows and Patch Manager systems in `server/src/services/deviceReconciler.ts`. A device is matched in this order: Endpoint Central resource id, then serial number, then MAC address, then a **unique** host name. A host name that appears more than once inside one source is ambiguous and is never used for matching, so two different machines with the same name are not merged by mistake. Ambiguous names are counted and listed in diagnostics.

## The "Verdict based on" label
Every device detail names the source that produced its verdict: "Intune compliance policy", "Endpoint Central MDM", "Endpoint Central Patch Manager", or for check-in "Both (Intune + Endpoint Central)". The detail also shows the operating system, IP addresses, patch counts by severity, last patch scan and the last agent contact, so a verdict is always explainable.

## Check-in rule and window
- **Window:** `POSTURE_CHECKIN_DAYS` (default 7, allowed 1–365).
- **Rule:** `POSTURE_CHECKIN_RULE`:
  - `either` (default): a device is fresh if EITHER its MDM/Intune sync OR its Endpoint Central agent contact is within the window.
  - `both`: BOTH signals must be fresh. One stale signal fails the device.
  - `mdm-only`: the agent is ignored and only the MDM or Intune sync counts.

## Stale MDM details (last-known values)
Endpoint Central MDM details for Macs (FileVault, passcode, compliance) are read one device at a time, and the API can throttle (HTTP 429). When a device's details cannot be read on a sync, the dashboard keeps its **last-known values** and marks them stale (with the age) instead of dropping them. The page shows an amber banner with the number of Macs using last-known values and the number never read. Last-known values stand in for up to `MDM_DETAIL_MAX_STALE_DAYS` (default 7, allowed 1–90). After that the device is shown as not reported. A warning is logged when more than 20% of MDM devices are unreadable.

### How the MDM detail reads avoid throttling
- Reads use an adaptive worker pool: a 429 halves the concurrency, pauses all workers for the server's Retry-After, and retries. Steady successes widen the pool again. Permanent errors such as 404 are not retried.
- A disk-backed detail cache (`cache/` folder) skips devices whose details are still fresh (`MANAGEENGINE_DETAIL_TTL_MIN`, default 360 minutes) and reads never-read and oldest devices first.
- Reads are serialised so overlapping syncs don't double the load, and bounded by `MANAGEENGINE_DETAIL_BUDGET_MS` (default 35,000 ms) so the sync deadline is never blown.
- The server log line `[manageEngine] MDM details: N devices · X fresh in cache · Y read now (…)` shows the health of each sync, including failure reasons.
- Endpoint Central Patch API calls retry on 429 and 5xx with Retry-After. If a refresh still fails, the last successful patch data is served and the server logs "serving last-known data".

## What the page shows
- **Score ring and pillar cards:** the overall score and one card per pillar with passing, failing and not-reported counts. Click a pillar to open its device table.
- **Breakdowns:** by platform (Windows, macOS) and by management source. Click a number to see exactly those devices.
- **Source tabs:** All, Microsoft Intune, ManageEngine / Endpoint Central.
- **Top findings:** the most common problems, for example the critical patches missing on the most devices.
- **Device table (per pillar):** server-side filtering by status (pass, fail, not reported), platform and source, text search, sorting, paging and CSV export.
- **Agent coverage card:** for Windows and macOS, how many devices have an Endpoint Central agent or Patch Manager row, as a percentage, with the change since earlier in the last 30 days. The trend is recorded once a day in `cache/posture-coverage-history.json` (180 days). As more agents roll out, the numbers update by themselves.
- **Notes and banners:** a sky-blue note for agents that matched no device, and an amber banner for partial data (Patch Manager unavailable, stale MDM details).
- **Endpoint Protection Coverage:** CrowdStrike Falcon and Zscaler coverage for physical devices. See below.

## Finding details (click a Finding)
Click any value in the **Finding** column to open its detail window. It shows the status, device, user, platform, source and serial number, the **Device details** facts, and recommended remediation steps.

For a failing **Critical Patching** finding, click the finding line (for example "6 critical, 10 important patches missing") to open **Missing patches**. It loads that device's full missing-patch list from Endpoint Central and shows it in tabs: **Critical, Important, Moderate, Low** (and Unrated if present). Each tab lists every patch with its KB number, description, category (OS, application, driver, BIOS), vendor, release date, reboot requirement and deployment status. The list is read on demand, so a throttled call can fail: the window then says so and shows the critical names it already has; reopen the window to retry. If the device has no Endpoint Central record, only the counts from the last scan are available.

## Endpoint Protection Coverage (CrowdStrike Falcon and Zscaler)
- Shows, for physical Windows and macOS devices (VDI excluded), the percentage with Falcon and with Zscaler, the number missing each, and a Healthy / Warning / Critical badge. Click "Missing Falcon" or "Missing Zscaler" to see the devices and export them to CSV.
- It is computed from each device's installed-app inventory (Intune and ManageEngine). The first scan of a large fleet takes several minutes. Until it finishes, the card shows live progress ("Scanning 1,200 of 4,800 devices (25%)") and updates by itself.
- After a scan, the result is cached for 5 minutes and refreshed in the background about every 4.5 minutes. An expired result is shown immediately labelled "Last scan … refreshing in the background".
- Only one scan runs at a time. Throttled app reads (429 or 5xx) are retried up to 3 times. Devices whose inventory still cannot be read are counted as "Inventory unavailable" and excluded from the percentages, never counted as protected.
- **Refresh Scan** forces a new scan.

## Diagnostics (how the sources were reconciled)
`GET /api/security-posture/diagnostics` (add `?format=csv` for a download) reports how devices were matched: devices by platform, hybrid matches by key (resource id, serial, MAC, host name), Patch Manager matches and devices without a patch row, ambiguous host names, Patch Manager systems and agent rows that matched no device, up to 200 sample names for each, and the latest MDM detail read statistics (`mdmDetailReads`: requested, first try, recovered, failed, reasons, concurrency, cached). It lists device names, so it requires the **Settings** page permission (`pages.Settings`). To read it from a browser, open the app, then run `fetch('/api/security-posture/diagnostics').then(r => r.json()).then(console.log)` in the developer console, which attaches your session automatically.

Reference values seen on the live tenant on 2026-11-19: Windows agent coverage about 84.9% (3,474 of 4,094; the rest are Intune-only with no Endpoint Central agent) and macOS patch coverage about 97% (402 of 414).

## API endpoints
| Method | Path | Purpose | Permission |
|---|---|---|---|
| GET | `/api/security-posture` | Overall score, pillars, breakdowns, coverage, enrichment (`?source=all\|intune\|manageengine`, `?refresh=1`) | Session |
| GET | `/api/security-posture/pillars/:id/devices` | Filtered, sorted, paged devices behind a pillar (`status`, `platform`, `sourceKey`, `q`, `sortKey`, `sortDir`, `page`, `pageSize`) | Session |
| GET | `/api/security-posture/diagnostics` | Reconciliation diagnostics (JSON or CSV) | `pages.Settings` |
| GET | `/api/endpoint-central/devices/:resourceId/missing-patches` | One device's missing patches (`view=critical\|all\|os\|app`) | Session |
| GET | `/api/security-inventory/coverage` | Falcon/Zscaler coverage, or live scan progress while the first scan runs | Session |
| POST | `/api/security-inventory/scan` | Force a fresh coverage scan | Session |
| GET | `/api/security-inventory/missing` | Devices missing Falcon or Zscaler (`platform`, `agent`) | Session |

Pillar ids are `encryption`, `patching`, `compliance` and `checkin`. The summary is cached for 2 minutes and always shares one snapshot with the device list behind it, so a pillar's headline number and its device table agree.

## Settings (environment variables)
| Variable | Default | Meaning |
|---|---|---|
| `POSTURE_CHECKIN_DAYS` | 7 | Check-in window in days (1–365) |
| `POSTURE_CHECKIN_RULE` | either | `either`, `both` or `mdm-only` |
| `MDM_DETAIL_MAX_STALE_DAYS` | 7 | How long last-known MDM details may stand in (1–90) |
| `MANAGEENGINE_FETCH_CONCURRENCY` | 8 | Maximum parallel MDM detail reads |
| `MANAGEENGINE_DETAIL_BUDGET_MS` | 35000 | Time budget for one sync's detail reads |
| `MANAGEENGINE_DETAIL_TTL_MIN` | 360 | Minutes before a cached device detail is read again |

The Endpoint Central API client (OAuth) needs the PatchMgmt read scope for Patch Manager data (`DesktopCentralCloud.PatchMgmt.READ`) and the MDM inventory scope (`MDMOnDemand.MDMInventory.READ`). See [14-environment-variable-reference.md](../14-environment-variable-reference.md).

## Why do some Macs show "not reported" for encryption or compliance on Security Posture?
A Mac shows not reported on the Security Posture page when its Endpoint Central MDM details (FileVault, passcode, compliance) could not be read on the latest sync, usually because the API throttled the request (HTTP 429), and no last-known value is available. It is never counted as passing or failing. The server keeps retrying, reads the oldest and never-read Macs first, and keeps last-known values for up to 7 days. The amber banner on the page shows how many Macs are using last-known values and how many were never read. Check the `[manageEngine] MDM details:` server log line and `mdmDetailReads` in diagnostics. See "Stale MDM details" above.

## Why does a Windows device say "No Endpoint Central agent found"?
The Windows device is in Intune but has no Endpoint Central agent, so Critical Patching cannot assess it. It is shown as not reported and counted in the Windows agent coverage card. Rolling out the agent fixes it automatically: the device is matched on the next refresh.

## Troubleshooting
| Symptom | Likely cause and fix |
|---|---|
| Macs show "not reported" for encryption or compliance | MDM details could not be read (429 rate limiting). Wait for a few syncs; the detail cache fills in oldest-first. Check the `[manageEngine] MDM details:` log line and `mdmDetailReads` in diagnostics. |
| Amber banner "last-known values" | Some Macs could not be re-read; their last-known values are used and marked stale. It clears when reads succeed. |
| Critical Patching shows "Patch Manager data could not be loaded" | The Endpoint Central Patch API is unavailable, throttled or missing the PatchMgmt.READ scope. Retries and last-known data are automatic; fix the scope if it persists. |
| A Windows device says "No Endpoint Central agent found" | The device is in Intune only. Roll out the Endpoint Central agent; it is then matched automatically. |
| A device is missing from Patch Manager matches | Its host name may be ambiguous or it was renamed or re-enrolled. Check the unmatched lists in diagnostics (serial or resource id matching is preferred). |
| Missing-patch window says it could not return the list | The per-device call was throttled. Reopen the window to retry. |
| Endpoint Protection Coverage shows scan progress for minutes | It is the first scan of the fleet. It updates automatically; later loads are instant. |
| "Inventory unavailable for N devices" on the coverage card | App inventory could not be read for those devices (throttled or unsupported). They are excluded from the percentage, not counted as protected. |

## Limitations
- Agent-only machines (Endpoint Central agent without an Intune or MDM device) are counted in diagnostics but not scored.
- Per-patch names for a device come from Endpoint Central only; Intune does not provide a per-patch list.
- A device with an ambiguous host name and no serial, MAC or resource-id match is not guessed; it stays not reported until it can be matched.
- Coverage history is recorded only when someone opens the page with the full-fleet view; days nobody opens it have no entry.

## Findings history

A scheduled sync (hourly by default, Settings -> Data Sync) records which checks fail for which devices: when each finding was first seen, last seen, resolved, and how many times it came back. `GET /api/security-posture/findings` returns it (needs the Security Posture page permission), filterable by `status` (open or resolved) and `pillar`. A check that could not be assessed in a run, such as patching when Patch Manager data is unavailable, never has its findings resolved, and a sudden near-total drop in a check's findings is treated as a partial read. There is no screen for the history yet.
