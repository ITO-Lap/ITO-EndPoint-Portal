# Intune Scripts & Configurations

Read-only inventory and export of Intune PowerShell/shell scripts, proactive remediations, and
configuration/compliance/endpoint-security/administrative-template policies — list, search, filter,
view details/assignments, download one item, or bulk-export a selection (or everything matching the
current filters) as a ZIP.

> This is **not** the Intune administrative audit log of who-changed-what (see
> [Intune Audit Logs](INTUNE-AUDIT-LOGS.md)). This feature reads the *current state* of scripts and
> configuration objects themselves — names, content, assignments — not a history of changes to them.

There is **no upload, import, assignment, update, or delete action anywhere in this feature** — every
route is a `GET` or a read-only `POST /export`.

---

## Required Microsoft Graph permissions (Application)

| Permission | Why |
|---|---|
| `DeviceManagementScripts.Read.All` | Reads PowerShell scripts and remediations. Microsoft split these off `DeviceManagementConfiguration.Read.All` onto this dedicated permission in 2025 — the old permission alone no longer authorizes these endpoints. |
| `DeviceManagementConfiguration.Read.All` | Reads Settings Catalog, Device Configuration, Compliance, Endpoint Security, Administrative Template, and Windows Update Configuration policies. Already required for other features in this app (see `server/src/services/graphApi.ts` header comment). |
| `DeviceManagementServiceConfig.Read.All` | Reads Windows Autopilot Deployment Profiles — a **different** permission from every other scope above; Autopilot is not covered by `DeviceManagementConfiguration.Read.All`. |
| `Group.Read.All` | Resolves an assignment's target group id (a GUID) to a human-readable display name for the UI and the configuration JSON export. |

No new environment variables are required — this feature reuses the same `INTUNE_TENANT_ID` /
`INTUNE_CLIENT_ID` / `INTUNE_CLIENT_SECRET` (or the Settings UI-configured equivalent) already used
everywhere else Intune is called. Add any missing API permissions to the existing Azure App
Registration and grant admin consent — no new app registration needed. (All four permissions above
are already granted on this org's tenant — verified live, see Known limitations.)

---

## Supported resources, Graph endpoint, and API version

Verified against Microsoft Learn — Graph beta/v1.0 availability changes over time, recheck before
relying on this table elsewhere.

| Category | Graph endpoint | Version | Notes |
|---|---|---|---|
| PowerShell Script | `/deviceManagement/deviceManagementScripts` | **beta** | Windows only |
| Remediation | `/deviceManagement/deviceHealthScripts` | **beta** | Detection + remediation script content, both exported as one `.ps1` |
| Settings Catalog | `/deviceManagement/configurationPolicies` | **beta** | Also requires `/{id}/settings` for full setting values |
| Device Configuration | `/deviceManagement/deviceConfigurations` | v1.0 | |
| Compliance Policy | `/deviceManagement/deviceCompliancePolicies` | v1.0 | |
| Endpoint Security | same `configurationPolicies` collection as Settings Catalog | **beta** | Split out by `templateReference.templateFamily` starting with `endpointSecurity` — see Known limitations |
| Administrative Template | `/deviceManagement/groupPolicyConfigurations` | **beta** | Top-level object + assignments only — see Known limitations |
| Windows Update Configuration | same `deviceConfigurations` collection as Device Configuration | v1.0 | Split out by `@odata.type === '#microsoft.graph.windowsUpdateForBusinessConfiguration'` |
| Autopilot Deployment Profile | `/deviceManagement/windowsAutopilotDeploymentProfiles` | **beta** | Requires `DeviceManagementServiceConfig.Read.All`, not `DeviceManagementConfiguration.Read.All` |

Every resource's assignments are read via `GET .../{id}/assignments` at the same API version as the
parent resource. There is no separate macOS shell script category — it was removed from this feature.

Two Graph collections are each shared by two categories (Settings Catalog/Endpoint Security share
`configurationPolicies`; Device Configuration/Windows Update Configuration share
`deviceConfigurations`) — each shared collection is fetched exactly once per page load and split
client-side by a classifier field, never fetched twice. See `COLLECTION_CLASSIFIERS` in
`server/src/services/intuneScriptsConfigGraph.ts`.

---

## Downloads

- PowerShell scripts and remediations: `scriptContent` / `detectionScriptContent` /
  `remediationScriptContent` are base64-decoded server-side and downloaded as `.ps1`. These
  are the *only* fields ever decoded — no other field is ever treated as script content.
- Everything else: the full preserved Graph object (`@odata.type`, id, name, settings, assignments
  with resolved group names, included/excluded groups, assignment filters, scope tags, export
  timestamp, and the Graph API version used) is downloaded as `.json`.
- Filenames are sanitized from the display name (path-traversal and filesystem-unsafe characters
  stripped) with a fallback to the resource id when the name is empty or only unsafe characters, and
  de-duplicated with `(1)`, `(2)`, … suffixes within a single export batch.
- Downloaded scripts are never executed by this app.

### Bulk ZIP structure

```
intune-export/
├── manifest.json
├── scripts/
│   ├── powershell/
│   └── remediations/
└── configurations/
    ├── settings-catalog/
    ├── device-configuration/
    ├── compliance/
    ├── endpoint-security/
    ├── administrative-templates/
    ├── windows-update/
    └── autopilot/
```

`manifest.json` records every requested item's resource id, filename, resource type, last-modified
date, and success/failure — a partial failure (one item's Graph call errors) still produces a valid
ZIP with the rest, recorded as a `failed` entry in the manifest, never a thrown error for the whole
batch.

Bulk exports fan out per-item Graph calls with bounded concurrency (5 at a time) — see
`EXPORT_CONCURRENCY` in `server/src/routes/intuneScriptsConfig.ts`.

### Assignment status in the list view

Microsoft Graph does not reliably return an `isAssigned` field on any of these 9 resource types' list
responses — confirmed against a live tenant, including `configurationPolicy` (beta), whose own schema
documents `isAssigned` as a property but omits it in practice. Real assignment status is therefore
resolved with one `/{id}/assignments` call per item, bounded-concurrency (8 at a time —
`LIST_ASSIGNMENT_CONCURRENCY`), but **only for the current page** of results, not the full inventory —
this keeps list-page cost proportional to page size (default 25) rather than total item count. A
single item's assignment-status lookup failing doesn't fail the page; it just shows unknown (`—`) for
that row.

---

## Mock/live data separation

There is no fabricated mock dataset for this feature (script/policy content is real tenant data, and
no similar recent feature in this app invents mock data for this kind of object either). Behavior:

- **Intune not configured** (`getIntuneConfig()` returns nothing): every route returns
  `{ success: true, data: [], configured: false }` — no Graph call is made.
- **Intune configured but a live Graph call fails**: the real error is surfaced (a specific category's
  failure is reported per-category in `categoryErrors` without blanking the rest of the page; a
  single-item detail/download/export failure returns a real error status). Nothing is ever silently
  replaced with fake data.

---

## Authorization

Gated to `Global Admin` / `IT Admin` via `requireAppRole()` in
`server/src/middleware/requireRole.ts` — the same `x-user-role` header convention already used by
every other feature in this app. As documented there and in
[Intune Audit Logs](INTUNE-AUDIT-LOGS.md), this is header-trust, not verified per-user
authentication — the frontend has no real login today.

---

## Testing

```bash
cd server
npm test
```

Relevant test files:
- `src/services/__tests__/graphApiRetry.test.ts` — pagination, 429/Retry-After, 5xx backoff,
  401/403/404 fatal-vs-transient handling, group-id-to-name resolution/chunking, and concurrent
  token-request de-duplication (see Known limitations).
- `src/services/__tests__/intuneScriptsConfigGraph.test.ts` — collection grouping (each distinct
  Graph collection fetched exactly once), the Settings Catalog/Endpoint Security and Device
  Configuration/Windows Update Configuration classifier splits, Autopilot's dedicated collection,
  and per-category error isolation when a shared or unrelated collection fails.
- `src/services/__tests__/intuneScriptsConfigExport.test.ts` — script content decoding, filename
  sanitization/de-duplication, configuration JSON shape, ZIP/manifest structure, partial-failure
  handling, bounded concurrency, and remediations exporting as `.ps1` (not `.json`).
- `src/middleware/__tests__/requireRole.test.ts` — authorization (admin roles allowed, others 403).
- `src/routes/__tests__/intuneScriptsConfig.test.ts` — mock/live separation (unconfigured Intune
  makes zero Graph calls).

---

## Known limitations

- **Endpoint Security is not a distinct Graph collection.** Microsoft folded it into the Settings
  Catalog (`configurationPolicies`), distinguished only by `templateReference.templateFamily`
  starting with `endpointSecurity`. If Microsoft changes that naming convention, or an older tenant
  still serves some Endpoint Security profiles from the legacy `deviceManagement/intents` endpoint
  (not called by this feature), those profiles won't appear under Endpoint Security here.
- **Administrative Template export is top-level + assignments only.** Per-setting values
  (`groupPolicyConfigurations/{id}/definitionValues`) are not fetched or exported — a materially
  different, nested call shape not in this feature's original endpoint list. The JSON export for
  this category preserves the policy object and its assignments, not individual GPO setting values.
- **Beta endpoints can change without notice.** Six of the nine resource types are beta-only today
  (see the table above) — Microsoft has not moved them to v1.0. Recheck Microsoft Learn periodically.
- **`isAssigned` is not returned by Graph's list responses** for any of these resource types — see
  "Assignment status in the list view" above for how this is worked around.
- **Concurrent token requests were previously de-duplicated incorrectly.** `listAllItems` fans out
  to 7 distinct Graph collections in parallel; before this was fixed, each one raced the (empty)
  token cache and fired its own OAuth request instead of sharing one, meaning every page load hit
  Microsoft's login endpoint up to 7 times. Fixed in `graphApi.ts`'s `getToken()` by tracking one
  in-flight token promise per tenant and having concurrent callers await it instead of each starting
  their own request — regression-tested in `graphApiRetry.test.ts`.
- **Validated against a live tenant** (this org's Verma Intune tenant, using the already-configured
  `INTUNE_TENANT_ID`/`INTUNE_CLIENT_ID`/`INTUNE_CLIENT_SECRET`): all 9 categories fetched successfully
  with zero `categoryErrors`, confirming the app registration already has all four required
  permissions granted — including `DeviceManagementServiceConfig.Read.All` for Autopilot, which
  wasn't previously in use anywhere else in this app. The Device Configuration / Windows Update
  Configuration split was verified arithmetically correct against real data (9 + 8 = 17, matching the
  pre-split total exactly). Single-item downloads and bulk ZIP exports were verified for PowerShell
  scripts, remediations (confirming the `.ps1`-not-`.json` fix above), Compliance Policy, Autopilot,
  and Windows Update Configuration.
- **Header-based role enforcement**, same caveat as every other feature in this app — see
  Authorization above.
