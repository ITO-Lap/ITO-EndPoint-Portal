# Windows Updates

> **Location:** Sidebar → Patches → **Windows Updates** (page key `pages.Windows Updates`)
> **Audience:** Global Admin · IT Admin · Helpdesk (per the page permission in Settings → Roles & Permissions)
> **Data sources:** Endpoint Central Patch Manager (missing updates), Intune (Windows builds), Microsoft MSRC, CISA KEV, endoflife.date, NIST NVD, FIRST EPSS

## What it shows

Four tabs, every number and row is clickable:

| Tab | Purpose |
|---|---|
| **Fleet exposure** | Devices missing Feature/Security updates, the most widely missing updates, and the Windows versions in the fleet with Microsoft support status. |
| **Risk & deadlines** | Per-device exposure score (0–100), exposure bands, and the CISA KEV deadline clock. |
| **Security releases** | The latest Patch Tuesday (MSRC): CVEs, severity, exploited/KEV flags, fixed build per Windows version, recently added KEV entries. CVE rows open NVD + EPSS detail. |
| **Upcoming & lifecycle** | Next Patch Tuesday and optional preview, end-of-servicing dates, plan-ahead calendar (.ics). |
| **Devices** | Filterable, sortable, exportable (CSV) list of device × missing-update rows. |

In **Security releases → Fixed build per Windows version**, clicking a device count lists the devices on that build and marks each Patched / Missing against the fixed build (search + filter included).

## Exposure score

Computed in `server/src/services/windowsExposure.ts` (pure, unit-tested) from data the page already loads:

| Factor | Max points |
|---|---|
| A missing update fixes an actively exploited (MSRC "Exploited" or CISA KEV) CVE | 40 |
| A CISA KEV remediation deadline has passed | 10 |
| Severity of missing fixes (critical/important CVEs) | 20 |
| Highest EPSS exploitation probability among exposed CVEs | 15 |
| Age of the oldest missing update (days ÷ 3) | 15 |
| Windows version out of support (20) or ending within the window (8) / behind target feature release (5) | 20 |

Bands: **Critical** ≥ 70, **High** ≥ 45, **Medium** ≥ 20, **Low** below. Clicking a device shows the reasons and points behind its score.

**Limits.** CVE-level detail covers the top 100 CVEs of the latest two Patch Tuesdays; other updates are scored from per-KB totals and update age (the page states this). EPSS is best-effort with a 2.5 s cap; when unreachable the score omits it and the page says so. The tab needs the Microsoft/CISA data, which loads in the background (first load can take about a minute; cached 6 h, persisted to `windows-intel-cache.json`).

## KEV deadline clock

Each CISA Known Exploited Vulnerabilities entry that still affects at least one of your devices is listed with its federal due date, days left/overdue, ransomware flag and device count (**overdue**, **due soon** ≤ 7 days, **on track**). Click a row for the device list.

## Patch Tuesday briefing (Slack)

Scheduled Reports → report type **Windows Patch Tuesday briefing (Slack only)**. One Slack message with: next Patch Tuesday and optional preview, last release totals, Critical/High exposure counts, KEV CVEs touching the fleet, and recommended actions (overdue KEV CVEs, Critical-exposure devices, versions near end of support). Built in `server/src/services/windowsBriefing.ts`.

Recommended schedule: cron `0 9 7-13 * 1`, timezone Asia/Kolkata. The runner requires every cron field to match, so this fires once a month on the Monday before the second Tuesday. Do not reuse this expression with a standard (OR-semantics) cron.

## API

All under `/api/windows-updates` (session required): `GET /fleet`, `GET /intel`, `GET /cve/:id`, `GET /epss?cves=`. `?refresh=1` bypasses the caches.

## Configuration

| Variable | Effect |
|---|---|
| `WINDOWS_FEATURE_TARGET_BUILD` | Build treated as "current" for Feature updates (default 26200 = 25H2; the page shows when Microsoft has a newer release). |
| `NVD_API_KEY` | Optional; raises the NVD rate limit from 5 to 50 requests per 30 s. |

No key is needed for MSRC, CISA, endoflife.date or EPSS.

## Troubleshooting

- *"Endpoint Central not configured / auth failed 400"* — see [11-troubleshooting-runbooks.md](../11-troubleshooting-runbooks.md) (Zoho token throttling).
- *Risk & deadlines says data is still loading* — Microsoft/CISA data has not been fetched yet; refresh in a minute.
