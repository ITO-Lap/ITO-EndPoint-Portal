# Security Policies

Captures live Intune device-management policies and Entra ID identity/security policies from
Microsoft Graph, normalizes them into one common shape, and stores dated snapshots so the latest two
syncs can be diffed into added/modified/removed changes — browsable in a **Security Policies** page
under Security & Compliance, with Intune/Entra tabs, source/category/platform/status filters, search,
a details drawer (settings + assignments), a Sync Now button, and a change-history drawer.

There is **no write/update/delete action against Graph anywhere in this feature** — every route is a
`GET` or a read-only `POST /sync` (which only reads from Graph and writes to this app's own database).

---

## Required Microsoft Graph permissions (Application)

| Permission | Why |
|---|---|
| `DeviceManagementConfiguration.Read.All` | Settings Catalog (`configurationPolicies`), Device Configuration, Compliance Policy, and legacy security baselines (`intents`). Already required for other features in this app. |
| `DeviceManagementEndpointSecurity.Read.All` | Some endpoint-security intents are only authorized under this permission rather than `DeviceManagementConfiguration.Read.All`. |
| `Policy.Read.All` | Conditional Access policies/named locations, Authorization Policy, Authentication Strength Policies, Security Defaults. |
| `Policy.Read.AuthenticationMethod` | Authentication Methods Policy — a separate, narrower permission Microsoft requires specifically for this singleton resource. |
| `Group.Read.All` | Resolves an assignment's target group id (a GUID) to a human-readable display name. |

No new environment variables — this feature reuses `INTUNE_TENANT_ID`/`INTUNE_CLIENT_ID`/
`INTUNE_CLIENT_SECRET` and/or `ENTRA_TENANT_ID`/`ENTRA_CLIENT_ID`/`ENTRA_CLIENT_SECRET` (either one
alone is enough to sync that side's categories — Intune and Entra credentials are independent) and
`DATABASE_URL` for snapshot storage. Add any missing API permissions to the existing Azure App
Registration and grant admin consent — no new app registration needed.

---

## Categories, Graph endpoint, and API version

| Source | Category | Graph endpoint | Version |
|---|---|---|---|
| Intune | Settings Catalog / Configuration Policy | `/deviceManagement/configurationPolicies` (+ `/settings`, `/assignments`) | **beta** |
| Intune | Device Configuration | `/deviceManagement/deviceConfigurations` (+ `/assignments`) | v1.0 |
| Intune | Compliance Policy | `/deviceManagement/deviceCompliancePolicies` (+ `/assignments`) | v1.0 |
| Intune | Security Baseline (legacy) | `/deviceManagement/intents` (+ `/settings`, `/assignments`) | **beta** |
| Entra | Conditional Access Policy | `/identity/conditionalAccess/policies` | v1.0 |
| Entra | Named Location | `/identity/conditionalAccess/namedLocations` | v1.0 |
| Entra | Authentication Methods Policy (singleton) | `/policies/authenticationMethodsPolicy` | v1.0 |
| Entra | Authentication Strength Policy | `/policies/authenticationStrengthPolicies` | v1.0 |
| Entra | Authorization Policy (singleton) | `/policies/authorizationPolicy` | v1.0 |
| Entra | Security Defaults (singleton) | `/policies/identitySecurityDefaultsEnforcementPolicy` | v1.0 |

Pagination (`@odata.nextLink`) and 429/5xx retry with `Retry-After` honoring are handled by the shared
`graphGetAllV`/`graphGetV` helpers in `server/src/services/graphApi.ts` — the same helpers used by
Intune Scripts & Configurations. All `/beta` calls are isolated behind
`server/src/services/securityPoliciesGraph.ts`; nothing else in the app calls these endpoints directly.

Each category is fetched independently via `Promise.allSettled` — one category failing (e.g. a missing
permission) doesn't blank the whole sync; it's reported per-category in the sync run's `sourceErrors`
and the run is marked `partial` rather than `failed` as long as at least one category succeeded.

---

## Snapshots, diffing, and change history

Every sync writes one `security_policy_sync_runs` row and one `security_policy_snapshots` row per
normalized policy (full point-in-time snapshot, not an incremental delta). The sync then diffs the new
snapshot against the immediately preceding successful/partial run and writes one
`security_policy_changes` row per added/modified/removed policy, keyed by `(source, category,
policyId)`. A "modified" change also stores the specific top-level fields that changed (name,
description, platform, technology, enabled, settings, assignments, scope tags) with old/new values.
The very first sync has no prior run to compare against, so it produces zero changes by design.

Assignment target group ids are resolved to display names via `Group.Read.All` and cached in
`security_policy_group_cache` for 24 hours (see `GROUP_CACHE_TTL_MS` in `securityPoliciesStore.ts`) so
a re-sync doesn't re-resolve every group on every run.

Requires PostgreSQL (`DATABASE_URL`) — without it, `/sync` returns 503 and list/detail endpoints report
`configured: false` rather than fabricating data. Run `psql $DATABASE_URL -f server/src/db/schema.sql`
after setting `DATABASE_URL` (tables: `security_policy_sync_runs`, `_snapshots`, `_changes`,
`_group_cache`).

---

## Mock/live data separation

There is no fabricated mock dataset for this feature (policy content is real tenant data). Behavior:

- **Neither Intune nor Entra configured**: list/status routes return
  `{ success: true, data: [], configured: false }` — no Graph call is made.
- **Configured but `DATABASE_URL` unset**: `/sync` returns 503; list/detail routes still respond
  successfully with `configured: false` (there's nowhere to read a snapshot from).
- **Configured and a live Graph call fails during sync**: the failing category is recorded in
  `sourceErrors` on that sync run; policies from categories that succeeded are still snapshotted.
  Nothing is ever silently replaced with fake data.

---

## Authorization

Read endpoints (`GET /policies`, `/policies/:source/:category/:policyId`, `/sync/status`, `/changes`,
`/export`) are gated to `Global Admin` / `IT Admin` / `Helpdesk`. `POST /sync` is gated to `Global
Admin` / `IT Admin` only, since it triggers a live multi-category Graph pull. Both use
`requireAppRole()` in `server/src/middleware/requireRole.ts` — the same `x-user-role` header
convention already used by every other feature in this app (header-trust, not verified per-user
authentication — the frontend has no real login today).

---

## Testing

```bash
cd server
npm test
```

Relevant test files:
- `src/services/__tests__/securityPoliciesGraph.test.ts` — normalization of settings/assignments per
  category, include-vs-exclude assignment classification, singleton-policy handling (plain-object
  Graph responses, not a `{value: []}` collection), and per-category error isolation.
- `src/services/__tests__/securityPoliciesStore.test.ts` — snapshot diffing (added/modified/removed
  across two runs, no changes on the first run, no changes when nothing differs), partial-vs-failed
  run status, and group-name resolution/caching.
- `src/routes/__tests__/securityPolicies.test.ts` — mock/live separation (unconfigured integrations
  make zero Graph calls), authorization (Helpdesk can read but not sync, missing role header is
  rejected), and input validation on the policy-detail route.
- `src/services/__tests__/graphApiRetry.test.ts` — the shared pagination/retry/throttling/group-name
  helpers this feature depends on.

---

## Known limitations

- **Six of the ten categories are `/beta` only today** (Settings Catalog, legacy Security Baselines —
  see the table above). Microsoft has not moved them to v1.0; recheck Microsoft Learn periodically.
- **Diffing is whole-field, not deep-path.** A "modified" change reports which top-level normalized
  fields changed (e.g. `settings`, `assignments`) with their full old/new values, not a minimal nested
  JSON patch — sufficient to show *that* and *roughly what* changed, not a line-level diff within a
  large settings object.
- **Legacy Security Baselines (`deviceManagement/intents`) are being deprecated by Microsoft** in favor
  of Settings Catalog-based baselines; this category is included for tenants still using them, but new
  baselines should be authored via Settings Catalog.
- **Header-based role enforcement**, same caveat as every other feature in this app — see
  Authorization above.
- **Not yet validated against a live tenant** — normalization logic is unit-tested against fabricated
  Graph responses shaped per Microsoft Learn's documented schemas, but hasn't been confirmed against a
  real tenant's exact field population (e.g. which optional fields Graph actually omits vs. returns
  null for). Re-verify `sourceErrors` is empty on a first live sync before relying on full coverage.
