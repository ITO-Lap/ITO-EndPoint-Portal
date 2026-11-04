# 15 — Known Gaps and Verification Checklist

> Everything here could **not** be confirmed from the repository. Each item says what to check and who can check it. Tick the box and record the date/evidence (never paste secrets). Related: [10 risks](10-risks-limitations-technical-debt.md), [13 permissions](13-api-permission-matrix.md).

## 1. Findings from reading the code (confirmed, action needed)

| # | Finding | Evidence | Action |
|---|---|---|---|
| F-1 | Many routes have no capability check beyond a valid session ([06 §6](06-authentication-rbac-security.md)) | `server/src/routes/*.ts` (guards listed in [04 §3](04-modules-and-code-logic.md)) | Add guards + tests |
| F-2 | `securityPolicies` router is not mounted; its client and page are unused | `server/src/index.ts`, `src/pages/SecurityPoliciesPage.tsx` | Mount+test or remove |
| F-3 | Documented zip command drops `.env.example` | Tested with `zip` ([08 §3.2](08-deployment-and-operations.md)) | Fix SOP |
| F-4 | `integration-credentials.json` stores credentials as plain JSON | `store/integrationStore.ts` | Prefer env vars; restrict ACL |
| F-5 | PostgreSQL TLS certificate not validated in production | `db/index.ts` | Provide CA, validate |
| F-6 | No CI, no dependency scanning, no e2e tests, no monitoring config in the repo | repository listing | Add (see [08 §9](08-deployment-and-operations.md)) |
| F-7 | `PROFILE_USER_UPN`, `INTUNE_AUDIT_DEFAULT_TIMEZONE` in `.env.example` are never read | source search | Remove or implement |
| F-8 | Kandji is not referenced anywhere in the code | source search | If Kandji is expected, it is a new integration ([12 §2](12-change-management.md)) |
| F-9 | Coolify / Docker files are absent although mentioned in the documentation brief | repository listing | Confirm the real hosting platform |

## 2. Verification checklist (needs a live environment or an owner's answer)

### Identity and access (owner: Entra admin / Security)

- [ ] Web redirect URI(s) registered on the app registration equal `AUTH_REDIRECT_URI` for each environment.
- [ ] Users and groups assigned to the enterprise application (if "assignment required").
- [ ] Every application permission in [13 §1.2](13-api-permission-matrix.md) is **Granted** (screenshot, date).
- [ ] `GroupMember.Read.All` consented; groups "ITO EndPoint Portal"/"Desktop Support" (or the configured names/IDs) exist and contain the right people.
- [ ] Client secret expiry date recorded; renewal owner named.
- [ ] Production has `AUTH_PASSWORDLESS`, `AUTH_PASSWORD` unset and `AUTH_ENFORCED` not `false`.
- [ ] `AUTH_ALLOWED_EMAILS` reviewed (each entry is a Global Admin).
- [ ] Which permission allows `syncDevice` (`managedDevices/{id}/syncDevice`) and whether it is granted.

### ManageEngine / Zoho (owner: Endpoint admin)

- [ ] Data centre of the tenant and whether `accounts.zoho.com` is correct.
- [ ] Refresh token scopes include MDM inventory, Patch Management READ and Inventory READ.
- [ ] The scope/permission for patch **scan and install**; test `POST /api/endpoint-central/remediation/*` against a non-production device.
- [ ] Expected Endpoint Central API limits for the fleet size; tune `MANAGEENGINE_FETCH_CONCURRENCY`.

### Slack and other integrations (owner: workspace admins)

- [ ] Slack app scopes actually granted (`chat:write`, `files:write`, others) and bot is in each target channel.
- [ ] Any consumer of `SLACK_SIGNING_SECRET` (none found).
- [ ] Jira project key/permissions; Confluence spaces searched.
- [ ] Privacy/Security approval for sending device/user context to Google Gemini and OpenAI.

### Behaviour under load (owner: Developer + Endpoint admin)

- [ ] A full Application Security sync completes against production after the throttling changes; record duration and whether the amber 429 banner still appears.
- [ ] Device list refresh time with both sources; cache/warm-start behaviour after a service restart.
- [ ] Notification and report schedules fire at the correct time across the timezone in use.

### Deployment and operations (owner: Infrastructure)

- [ ] How DeployHub receives and installs the zip; where the previous release is kept for rollback.
- [ ] Production Node.js version and the account the service runs as; NTFS ACLs on `DATA_DIR` and `server\.env`.
- [ ] Backup schedule and last successful restore test for `DATA_DIR` (and the database, if used).
- [ ] External monitoring/alerting of `/health` and the service logs.
- [ ] Existence of dev/test/staging environments and their URLs.
- [ ] Whether PostgreSQL is used in production; if yes, version, TLS, backup, and whether `uuid-ossp` exists.

### Data and code (owner: Developer)

- [ ] Intune → `Device` field mapping table (read `services/intune.ts`) added to [05](05-api-integrations.md).
- [ ] Security Posture pillar formulas, Risk Scoring rule weights, and Copilot tool list documented in [04](04-modules-and-code-logic.md) (only headers were read).
- [ ] Whether `POST /api/integrations/:id/credentials` persists or only validates, and who may call it.
- [ ] Retention for `notifications.json`, `patch-remediation-actions.json`, `fleet-snapshots.json`, `mac-admin-access.json`.
- [ ] Whether `schema.sql` creates the `uuid-ossp` extension; which tables the running app actually writes (`tenants`, `audit_logs`, `device_risk_scores`).
- [ ] Node `engines` requirement (add to `package.json`).
- [ ] Whether the SharePoint role-activity puller returns data in the live tenant.
- [ ] `dangerouslySetInnerHTML` / XSS review of the client.

## 3. Documentation coverage summary

| Area | Verified (read in code/config/run) | Inferred | Still needs confirmation |
|---|---|---|---|
| Stack and versions | Declared versions in both `package.json` files; scripts; Vite proxy; test configs | Rationale for technology choices | Required Node version; actual installed versions in production |
| Repository structure | Folder listing; router mounting; page switch; file responsibilities | Misnamed-file intent | Purpose of root `.env` beyond `VITE_*` |
| Architecture and flows | Middleware order, auth callback, caching/fallback, schedulers and intervals | Single-instance consequence | Production topology beyond IIS + service |
| Modules | All routes and their guards; trigger/action lists; automation, stale devices, app intelligence, patch flow (header comments + routes) | Dashboard card formulas | Internals of Security Posture, Risk Scoring, Copilot tools, large device pages |
| Integrations | Hosts, paths, auth modes, retry/pagination code, Zoho host, scopes named in code | Slack write scopes | Granted permissions/consent, API response shapes, live throttling behaviour |
| Auth/RBAC/security | Login flow, role resolution, token lifetime, storage, route guards, absent hardening | Threat consequences | Entra registration state, enterprise-app assignment |
| Setup and onboarding | Commands and scripts exist; suites run (client 157, server 656 passed / 7 skipped) | Linux support | Minimum Node version |
| Deployment/operations | `web.config`, `install-service.ps1`, zip SOP (tested), absence of Docker/Coolify/CI | Rollback procedure | DeployHub process, monitoring, backups, other environments |
| Database/data | Schema (23 tables, FKs), dual-backend design, `DATA_DIR` files and resolution | Data classification | Retention, which tables are written, extension setup |
| Risks/runbooks/change mgmt | Derived from verified facts above | Likelihood/impact ratings | Owner names and contacts |

Older documents in `docs/01-overview` … `docs/08-design`, `ROLES.md` and `HANDOVER-MANUAL.md` were **not re-verified** for this set; where they disagree with this set, the code is authoritative and this set reflects the code as read.
