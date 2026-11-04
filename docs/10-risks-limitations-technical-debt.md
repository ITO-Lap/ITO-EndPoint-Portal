# 10 — Risks, Limitations and Technical Debt

> Each row is traceable to code or configuration read for this documentation set; "Not verified" marks items that depend on the live environment. Likelihood/Impact: **H**igh, **M**edium, **L**ow (author's judgement from the code, to be reviewed by owners). Owner types: **Dev** (developer), **Endpoint** (endpoint admin), **Sec** (security), **Infra** (infrastructure). Related: [06](06-authentication-rbac-security.md), [08](08-deployment-and-operations.md), [09](09-database-and-data-handling.md), [11](11-troubleshooting-runbooks.md), [15](15-known-gaps-and-verification-checklist.md).

## 1. Risk register

| ID | Risk / issue | Impact | Likelihood | Affected module / integration | Current mitigation | Recommended next action | Owner |
|---|---|---|---|---|---|---|---|
| R-01 | **API scope limitations**: a missing or unconsented Graph / Zoho / Slack permission silently narrows data (403 → "source could not be read") | M | M | All integrations | 403 mapped to an explicit message in App Intelligence; amber banners list failed sources | Run the checklist in [13](13-api-permission-matrix.md) and tick each permission; record consent date | Endpoint, Sec |
| R-02 | **Missing/unreliable patch & compliance data**: MDM-only Macs have no Patch Manager rows; some ManageEngine states are derived, not native; posture signals can be "not reported" | M | H | Patch Operations, Security Posture, Mac Fleet Reports | Unknown values shown as "not reported"/N/A, never as pass or zero; data-quality notes in reports | Keep this rule in code reviews; add per-card "data coverage" text where missing | Dev |
| R-03 | **Write/administrative routes lack server-side authorization**: automations CRUD/run, scheduled-report CRUD/run, integration credentials/sync, Slack test/reconnect, Jira create, Entra device sync/diagnose, and all read routes are open to any valid session | H | M | Automation, Scheduled Reports, Settings, Entra | Page hiding in the UI; sign-in limited to allow-listed users/groups | Add `requireCapability` to each route ([06 §6](06-authentication-rbac-security.md)); add tests per route | Dev, Sec |
| R-04 | **Rate limiting by Graph / ManageEngine** (notably `detectedApps`): reads fail with 429 and retries exhaust | M | H | Application Security & Compliance | Resumable paged read, request spacing, `Retry-After` honoured (cap 120 s), cool-down rounds, last-good cache | Observe a live sync; tune page size/delay; schedule syncs off-peak | Dev, Endpoint |
| R-05 | **Token / credential expiry**: Entra client secret, Zoho refresh token, Slack/Jira/AI tokens expire or are revoked; sessions last 8 h with no refresh | M | M | Every integration; login | Health indicators (Slack monitor, integration status) | Keep an expiry calendar; alert 30 days ahead; document renewal ([11](11-troubleshooting-runbooks.md)) | Endpoint, Infra |
| R-06 | **Secrets exposure**: `integration-credentials.json` stores credentials as plain JSON in `DATA_DIR`; session secret is a file; session token is in `localStorage`; `.env` on disk | H | L | Settings, session, host | `.env` and data folders are git-ignored; zip SOP excludes `.env`; token passed in URL fragment | Restrict NTFS ACLs on `DATA_DIR` and `.env`; prefer env vars over the credentials file; consider encrypting the file or using a secret manager | Sec, Infra |
| R-07 | **Incorrect RBAC configuration**: allow-list e-mails are unconditional Global Admin; group matching by name is case-insensitive and rename-sensitive; custom roles can grant powerful keys; Helpdesk holds `patchOps.scanRemediate` | H | M | Auth, Settings → Roles | `roles.manage` guard; Global Admin hard-coded; `rbac_audit_log` table; group Object-ID variables | Set `AUTH_*_GROUP_ID`; review `AUTH_ALLOWED_EMAILS` quarterly; periodic role-matrix review | Sec |
| R-08 | **Stale or duplicate device records** (re-imaging, re-enrolment, two sources per device, devices with no serial) | M | H | Inventory, Stale Devices, Automation, Entra | Duplicate detection (Entra), serial-based cross-source triggers that skip serial-less records, data-quality warnings | Define the authoritative source per attribute; add a reconciliation view | Endpoint, Dev |
| R-09 | **External API outages** (Graph, Zoho, Slack, NVD, GitHub, AI providers) | M | M | All | Per-source timeout, last-good device cache with `staleSources`, warm start after restart, caching of CVE/latest versions | Add status page links to runbooks; alert on stale sources > 24 h | Dev, Endpoint |
| R-10 | **Dependency vulnerabilities / currency**: no `npm audit`, SCA or Dependabot configuration found; very recent major versions (Vite 8, TypeScript 6, ESLint 10, Express 5) | M | M | Whole project | Lock files committed | Add Dependabot/`npm audit` to CI; review quarterly | Dev, Sec |
| R-11 | **Deployment failure / rollback gaps**: no CI, no automated rollback, no version stamp; the zip SOP drops `.env.example`; DeployHub steps are undocumented in the repo | M | M | Release process | Manual SOP, NSSM auto-restart, `DATA_DIR` independent of the release | Add CI, a rollback script (keep N previous releases), correct the zip command, expose the build version in `/health` | Dev, Infra |
| R-12 | **Incomplete logging/monitoring**: `/health` does not check dependencies; no metrics, alerts or log shipping found; audit trail not centralised | M | H | Operations | NSSM log files with rotation, Slack health monitor | External uptime check, log shipping, alert on `[Error]`, extend `/health` | Infra, Dev |
| R-13 | **Data privacy / permission overreach**: broad `*.Read.All` application permissions; employee identity and device data exported to Slack and sent to AI providers (Gemini, OpenAI) when enabled | H | M | Copilot, Risk Scoring, Reports, Entra | AI keys optional; Google Search grounding switch; AI tool calls executed by the app, write actions need confirmation | Confirm with Security/Privacy that AI processing is approved; minimise fields sent; trim unused permissions (security-policy snapshots are unmounted) | Sec |
| R-14 | **Single-instance design**: in-process schedulers and in-memory/file caches | M | L | Operations | One service instance | Document "do not scale out"; if needed move jobs to a leader-elected worker and use PostgreSQL stores | Dev, Infra |
| R-15 | **Dead/unmounted code**: `routes/securityPolicies.ts` is not mounted (client `api/securityPolicies.ts` would 404); `SecurityPoliciesPage.tsx` unused; legacy Intune Audit module tables/vars | L | H | Policy snapshots, Intune audit | None | Decide: mount and test, or remove with its schema/permissions/variables | Dev |
| R-16 | **HTTP hardening gaps**: open CORS, no security headers (`helmet`/CSP), 5xx messages echoed to clients | M | M | API | Bearer-token auth; React escaping | Restrict CORS to the portal origin, add headers (also at IIS), generic 5xx messages | Dev, Sec |
| R-17 | **PostgreSQL TLS not validated** (`rejectUnauthorized: false`) when `NODE_ENV=production` | M | L | DB features | Encrypted channel | Provide the CA and validate the certificate | Dev, Infra |
| R-18 | **Hard-coded Zoho accounts host** (`accounts.zoho.com`) | M | L (if the tenant is in the US data centre; Not verified) | ManageEngine | None | Make the accounts host configurable | Dev |
| R-19 | **Unvalidated modules**: SharePoint role-activity puller is marked unvalidated against a live tenant; patch scan/install scope not confirmed; `syncDevice` permission not confirmed | M | M | Role Activity, Patch Operations, Entra | Marked in code comments; patch actions need preview + same-admin confirm | Test each in a non-production tenant before relying on it | Endpoint, Dev |
| R-20 | **Risky bypass flags** (`AUTH_PASSWORDLESS`, `AUTH_ENFORCED=false`, `AUTH_PASSWORD`) | H | L | Auth | Warnings printed at startup; off by default | Add a startup refusal when `NODE_ENV=production` and a bypass flag is set | Dev, Sec |
| R-21 | **Automation noise or duplication**: six starter rules are disabled, but enabling several against Slack/Jira can flood channels; rules have no rate-limit/dedup window | M | M | Automation | Disabled by default; execution history capped at 500 | Add per-rule cooldown/dedup; set real channel and Jira project before enabling | Endpoint, Dev |
| R-22 | **Documentation drift**: older documents (`docs/01`–`08` folders, `ROLES.md`, `HANDOVER-MANUAL.md`) predate several changes (for example the roles and persistence work); the root `README.md` was the unmodified Vite template before this set replaced it | L | H | Maintenance | This set marks items Verified/Not verified | Review the older documents against this set and retire duplicates | Dev |

## 2. Known functional limitations

- No per-user application inventory (Graph `detectedApps` is per app, not per user); no application deployment action; no persisted installation history ("Application Security & Compliance" is read-mostly).
- Mac local-admin data exists only for Macs that run the reporting script.
- Patch data is only for Endpoint Central agent-managed endpoints.
- Intune and ManageEngine records are not merged into a single golden record; cross-source logic keys on serial number.
- "Reports & Analytics" PowerPoint option is labelled as a sample deck (*content depth Not verified*).
- Kandji is not supported.

## 3. Technical debt

| Item | Where | Suggested action |
|---|---|---|
| Very large page files (`IntuneDevicesPage.tsx` ≈ 1,800 lines, `MacDevicesPage.tsx` ≈ 1,800, `DocsPage.tsx` ≈ 1,400, `SecurityPosturePage.tsx` ≈ 950) | `src/pages/` | Split by tab/section; add component tests |
| Misleading names | `server/src/data/mockAutomations.ts` is the real automation store; sidebar entry "ManageEngine App Inventory" opens "Application Security & Compliance"; `ManageEngineAppInventoryPage` is now a thin wrapper | Rename together with the RBAC page key (needs saved-role migration) |
| Unused/listed-but-unread env vars | `PROFILE_USER_UPN`, `INTUNE_AUDIT_DEFAULT_TIMEZONE`, `SLACK_SIGNING_SECRET` consumer | Remove or implement |
| `@azure/msal-browser` dependency and `msalConfig.ts` | Client | Remove if unused, or document its purpose |
| OpenAI model mismatch | `store/integrationStore.ts` returns model `gpt-4o`, `services/openai.ts` calls `gpt-4o-mini` | Decide one model setting |
| No migration framework for PostgreSQL | `db/schema.sql` | Adopt a migration tool before further schema changes |
| No CI, lint-in-CI, coverage reporting | Repository | Add pipeline ([08 §9](08-deployment-and-operations.md)) |
| No end-to-end tests (Playwright is a dev dependency only) | Repository | Add smoke e2e for login and one module |
| Pre-existing client type warnings | `src/` | Clean up so `tsc` is a useful gate |
| Duplicate `.env` handling (`VITE_*` in root, rest in `server/`) | Config | Document (done here) or consolidate |

## 4. Review cadence (suggested)

Monthly: secrets/consent expiry, dependency alerts, failed schedules. Quarterly: RBAC review, permission trimming, this register.
