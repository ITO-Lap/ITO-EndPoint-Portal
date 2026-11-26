# Risk Scoring

The **Risk Scoring** page (title "AI Risk Scoring", Security group, nav id `risk_scoring`) gives every Intune-managed device a 0-100 risk score based on compliance state, sync recency, encryption, OS version, and free disk space, ranked highest risk first.

## What it is and who can use it

Risk Scoring helps IT admins decide which devices to fix first. The score is deterministic and rule-based; an optional OpenAI step adds a short narrative and action items.

- Page permission key: `pages.Risk Scoring`.
- Default access: Global Admin and IT Admin. **Helpdesk does not have this page by default** (listed in the Helpdesk excluded pages in `server/src/services/rolePermissions.ts` and `src/lib/permissions.ts`). A Global Admin can grant the page to a custom role.
- Source files: `src/pages/RiskScoringPage.tsx`, `server/src/services/riskScoring.ts`, `server/src/routes/intelligence.ts`, client `src/api/intelligence.ts`.

## How it works: factors, weights, and risk levels

`ruleBasedScore()` in `server/src/services/riskScoring.ts` adds points per factor and caps the total at 100. The maximum from all categories is exactly 100 (30+25+20+15+10).

| Category | Condition | Points | Factor severity |
|---|---|---|---|
| Compliance (max 30) | `noncompliant` | 30 | critical |
| | `error` | 20 | high |
| | `conflict` | 18 | high |
| | `inGracePeriod` | 10 | medium |
| | `unknown` | 5 | low |
| Connectivity (max 25) | last sync more than 30 days ago | 25 | critical |
| | more than 14 days | 15 | high |
| | more than 7 days | 6 | medium |
| Encryption (20) | `isEncrypted` is false | 20 | critical |
| OS Version (max 15) | Windows version below 10 | 15 | critical |
| | macOS below 13 (Ventura) | 10 | high |
| | iOS below 16 | 5 | medium |
| | Android below 11 | 5 | medium |
| Storage (max 10) | under 5% free | 10 | high |
| | under 15% free | 4 | medium |

Only one tier per category applies (the highest matching). Compliant devices add 0 for compliance. Storage is skipped if total storage is 0 or unreported.

Risk level bands from the total score: **critical 70-100, high 40-69, medium 20-39, low 0-19**.

AI enrichment (`computeRiskScore`): if `OPENAI_API_KEY` is set, the request does not pass `ai=false`, and the device has at least one factor, the server calls `gpt-4o-mini` (JSON output, `max_tokens` 350) with the device facts and factors to produce a 2-sentence summary and up to 3 action items. The model does not change the score. If OpenAI is not configured, errors, or the device has no factors, the fallback is: summary `Risk score N/100: <factor descriptions>.` (or "No significant risk factors detected - device appears healthy."), and action items "Remediate: <factor>" for the first 3 factors.

## What the page shows

- Header with a "Top N" selector (25, 50, 100, 200; default 50) and Refresh.
- Five KPI cards: Avg Score, Critical, High, Medium, Low (computed over the returned devices, not the whole fleet).
- Filter chips: all, critical, high, medium, low, with counts.
- Device list, 25 per page (client pagination): score and gauge bar, device name and user email (click to copy), level badge, factor count.
- Expanded row: AI Assessment text, Risk Factors with `+Npts`, Action Items.
- Escalation buttons (only if the Jira/Confluence integrations report configured via `api.jiraStatus()`): **Create Jira Ticket** (only for critical or high devices; loads the device then opens the Jira modal prefilled with factors and action items) and **Attach to Confluence** (links pages in-session; attachments are held in browser state only).
- No file export on this page.
- The page tells Ocean which device is expanded (page context `Risk Scoring` plus `deviceId`).

## Data sources and freshness/caching

- Devices come live from Microsoft Graph `/deviceManagement/managedDevices` (`getManagedDevices`), so only Intune-managed devices are scored. Credentials: `INTUNE_TENANT_ID` / `INTUNE_CLIENT_ID` / `INTUNE_CLIENT_SECRET` (falls back to `ENTRA_*`); Graph permission `DeviceManagementManagedDevices.Read.All`.
- `GET /api/intelligence/risk-scores` is cached in memory for **5 minutes per `limit` and `ai` combination** (key `intel:risk:<limit>:<ai>`), so a different AI choice is a different answer. It needs the `pages.Risk Scoring` permission on the server.
- No database; scores are not stored or trended over time.

## API endpoints

| Method | Path | Purpose | Permission |
|---|---|---|---|
| GET | `/api/intelligence/risk-scores?limit=N&ai=true\|false` | Scored devices (sorted by score desc), `summary` (`critical`, `high`, `medium`, `low`, `avgScore`), `count`. `limit` default 50, max 200 | Signed-in session; no per-capability check on the route. Page access enforced in the UI via `pages.Risk Scoring`. |
| POST | `/api/intelligence/explain` | Plain-English explanation of an issue (needs OpenAI) | Signed-in session |
| POST | `/api/intelligence/summary` | Executive summary of fleet snapshot (needs OpenAI) | Signed-in session |

## Ocean assistant tool

Ocean's tool **`get_risk_scores`** (`server/src/services/copilotTools.ts`, read-only) runs the same scoring engine on live Graph data (bypassing the 5 minute cache). Parameter `limit` (default 20, max 200). It deliberately skips the OpenAI step (`useAi: false`) because Ocean writes its own narrative from the returned factors. It returns device id, name, user email, score, level, factor descriptions, and action items, with Intune citations. Example questions: "Which devices are the highest risk?", "Why is this device critical?". Needs `copilot.access` and `copilot.read`.

## Troubleshooting

- "Failed to compute risk scores - ensure Intune is configured." or "Network error computing risk scores.": Intune credentials are missing or the Graph permission lacks admin consent. Check `server/.env` and logs.
- No AI Assessment box, only a plain sentence: `OPENAI_API_KEY` unset, OpenAI call failed, `ai=false`, or the device has no factors. The score is unaffected.
- Scores did not change after fixing a device: Intune must sync first, and results can be cached up to 5 minutes.
- Page missing: your role lacks `pages.Risk Scoring` (Helpdesk by default).
- Create Jira Ticket missing: Jira not configured, or the device is medium or low.

## Limitations

- **"Top N" is the N riskiest devices of the whole fleet.** Every device gets the cheap rule-based score first, the list is cut to the top N, and only those N get the optional AI summary. The headline counts (critical, high, medium, low, average) cover **every** device, not just the list (`totalDevices` is returned too). Ocean's `get_risk_scores` behaves the same and returns the fleet-wide counts as `fleet`.
- OS version check is a simple numeric parse of `osVersion`; only Windows, macOS, iOS, and Android are checked. A Windows device with no version value may be treated as version 0 (unclear in code whether Graph ever returns it empty).
- Does not use vulnerability, patch, threat, or EDR (CrowdStrike/Zscaler) data; for those see Security Posture.
- Thresholds and weights are hard-coded, not configurable.
- ManageEngine-only and Mac devices from ManageEngine are not scored (Intune managed devices only).
