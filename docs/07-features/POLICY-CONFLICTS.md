# Policy Conflicts

The **Policy Conflicts** page (Security group in the sidebar, nav id `policy_conflicts`) scans your Intune tenant's compliance policies and device configuration profiles and flags duplicates, stale items, and name collisions. It is read-only: it never changes anything in Intune.

## What it is and who can use it

Policy Conflicts shows a list of detected policy hygiene problems across Intune compliance policies and configuration profiles, each with the affected policies and a recommended fix.

- Page permission key: `pages.Policy Conflicts` (Settings > Roles & permissions, group "Page access").
- Default access: Global Admin (always every permission) and IT Admin. **Helpdesk does not have this page by default** (it is in the Helpdesk excluded-pages list in `server/src/services/rolePermissions.ts` and `src/lib/permissions.ts`). A Global Admin can grant it to a custom role.
- The sidebar entry and page router are in `src/data/dashboardData.ts` (`navItems`) and `src/App.tsx` (`activePage === 'Policy Conflicts'`).
- Source files: `src/pages/PolicyConflictPage.tsx`, `server/src/services/policyConflict.ts`, `server/src/routes/intelligence.ts`.

Note on the `securityPolicies.read` / `securityPolicies.sync` capabilities: their labels in the role editor say "View Policy Conflicts data" / "Trigger a Policy Conflicts sync", but they gate the separate snapshot-based Security Policies API (see `docs/04-integrations/SECURITY-POLICIES.md`), not this page's `/api/intelligence/policies` call. IT Admin has both by default, Helpdesk has `securityPolicies.read` only.

## How it works: how conflicts are detected

Detection is rule-based and runs in `detectConflicts()` (`server/src/services/policyConflict.ts`) over two Graph lists: compliance policies (`/deviceManagement/deviceCompliancePolicies`) and configuration profiles. Names are normalized before comparison: lower-cased and every non-alphanumeric character removed, so "Win-11 Baseline" and "win11baseline" are treated as the same name.

| Type (label on page) | Severity | Rule |
|---|---|---|
| `duplicate_name` (Duplicate Name) | medium | Two or more compliance policies share a normalized name; same check separately across configuration profiles. One conflict is created per name group. |
| `stale_policy` (Stale Policy) | low | A compliance policy or configuration profile whose `lastModifiedDateTime` is more than **180 days** old. One conflict per stale item; the description shows the age in days. |
| `scope_conflict` (Scope Conflict) | medium | A compliance policy and a configuration profile have the same normalized name (shown as "Name collision"). |
| `version_drift` (Version Drift) | medium | Copies of a configuration profile with the same normalized name on the same platform are at different `version` numbers, so the settings a device gets depend on which copy is assigned. Reported alongside the duplicate-name conflict. |

Severity bands: `high` is used for duplicate names where at least two policies target the **same platform** (they can be assigned to the same devices); the same name across different platforms stays `medium`. Version drift, scope conflict and cross-platform duplicates are `medium`; stale policies are `low`. Conflict IDs are generated per run (`conflict-1`, `conflict-2`, ...) and are not stable between runs.

Important: detection is name- and age-based only. It does not compare actual setting values or assignments, so it will not find two differently-named profiles that configure the same setting in contradictory ways.

## What the page shows

- Header with a Refresh button (forces a reload from the API; the server may still answer from its 5 minute cache).
- Four KPI cards: Total Conflicts, High, Medium, Low.
- Two count cards: number of Compliance Policies and Config Profiles scanned.
- Filter chips: All, High, Medium, Low, Duplicate Name, Stale Policy, Scope Conflict, Version Drift, each with a count (filters match severity or type).
- Conflict cards: title, severity badge, type badge, description. Expanding a card shows Affected Policies (tagged `[C]` compliance or `[P]` configuration profile) and a Recommendation box.
- Empty state: "No conflicts detected" with the number of policies scanned.
- There is no export on this page.
- The page tells the Ocean assistant which conflict is expanded (page context `Policy Conflicts` plus `findingId`), so "explain this one" works without retyping.

## Data sources and freshness/caching

- Live Microsoft Graph via `getCompliancePolicies` and `getConfigurationProfiles` in `server/src/services/graphApi.ts`, using `INTUNE_TENANT_ID` / `INTUNE_CLIENT_ID` / `INTUNE_CLIENT_SECRET` (falls back to `ENTRA_*`). Graph permission: `DeviceManagementConfiguration.Read.All`.
- The `GET /api/intelligence/policies` response is cached in memory for **5 minutes** (single key, per server process). A cached reply includes `cached: true`. The cache is not shared across server instances and is cleared on restart.
- No database is used. Nothing is stored or diffed over time (for change history use Security Policies snapshots instead).

## API endpoints

| Method | Path | Purpose | Permission |
|---|---|---|---|
| GET | `/api/intelligence/policies` | Returns `compliance`, `config`, `conflicts`, and `summary` (`total`, `high`, `medium`, `low`, `byType`) | Signed-in session (`requireSessionExceptAuth`); no per-capability check on the route. Page access is enforced in the UI via `pages.Policy Conflicts`. |

If you need the page's data to be restricted server-side, that is not done today (unclear whether intended; the route has no `requireCapability`).

## Ocean assistant tool

Ocean's tool **`get_policy_conflicts`** (`server/src/services/copilotTools.ts`) runs the same `detectConflicts()` against live Graph data (it does not use the 5 minute cache) and returns the summary plus every conflict, with Intune citations. It takes no parameters. Example questions: "Which compliance policies are duplicated?", "Are there stale Intune policies?". Use of Ocean needs `copilot.access` and `copilot.read`. A related tool, `get_security_policy_status`, reports the latest Security Policies sync and recent policy changes (needs `DATABASE_URL`).

## Troubleshooting

- "Failed to load policy data." or "Network error loading policies.": the server call failed. Most often Intune credentials are missing (the server throws "Intune/Entra credentials not configured") or the app registration lacks `DeviceManagementConfiguration.Read.All` with admin consent. Check `server/.env` and server logs.
- Page missing from the sidebar: your role lacks `pages.Policy Conflicts` (Helpdesk by default). Ask a Global Admin.
- Counts look stale after you fixed a policy: wait up to 5 minutes or restart the server; Refresh may hit the cache.
- Zero High conflicts: expected, no rule emits high.
- Same pair appears twice (duplicate and name collision): different rules can both match the same policies.

## Limitations

- Only name-collision and age rules; no setting-level or assignment-level conflict analysis.
- 180 day stale threshold is hard-coded.
- `high` severity and `version_drift` are never produced.
- Intune only; Entra policies (Conditional Access etc.) are not scanned here.
- No export, no history, no per-policy deep link to the Intune portal.
- Without Intune credentials the page shows an error rather than mock data (unlike some other pages).
- Unverified: the `securityPolicies` router (`server/src/routes/securityPolicies.ts`) was not found mounted in `server/src/index.ts` in this working tree, so its endpoints may not be reachable; this page does not depend on it.
