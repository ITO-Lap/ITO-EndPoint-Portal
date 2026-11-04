# 06 — Authentication, RBAC and Security

> Labels: **Verified** (read in code), **Inferred**, **Not verified**. Related: [02 §3 login diagram](02-architecture.md), [13 — Permission matrix](13-api-permission-matrix.md), [14 — Environment variables](14-environment-variable-reference.md), [10 — Risks](10-risks-limitations-technical-debt.md). **No secret values appear in this document.**

## 1. Sign-in methods

| Method | When active | Code |
|---|---|---|
| **Microsoft Entra sign-in** (primary) | `ENTRA_*` (or `INTUNE_*`) credentials configured; login page offers it (`GET /api/auth/config` → `microsoft: true`) | `routes/auth.ts` |
| Email + shared password | `AUTH_PASSWORD` set | `services/session.ts` `authenticate()` |
| Email-only (passwordless) | `AUTH_PASSWORDLESS=true` — **local development only**; the server prints a warning when enabled | `services/session.ts`, `index.ts` |
| API gate off | `AUTH_ENFORCED=false` — local debugging only; the server prints a warning | `middleware/requireSession.ts` |

Email/password and passwordless sign-in always yield **Global Admin** for addresses in `AUTH_ALLOWED_EMAILS` (default: the project owner). They must stay off in production.

## 2. Microsoft login flow (Verified)

1. Browser calls `GET /api/auth/login` → the server returns the Microsoft authorize URL (scope `openid profile email User.Read`) and a **signed `state`** (JWT, purpose `oauth-state`, 10-minute expiry).
2. Microsoft redirects to `GET /api/auth/callback?code&state`. The server verifies `state` (CSRF protection that survives restarts because it is signed), exchanges `code` with the client secret, and reads `/me`.
3. **Role resolution** (`services/roleResolution.ts`, order matters):
   1. Email on `AUTH_ALLOWED_EMAILS` → **Global Admin** (unconditional bootstrap; cannot be overridden).
   2. Per-user role assignment (Settings → Roles & Permissions) → that role (built-in or custom).
   3. Legacy Entra group membership via `transitiveMemberOf` (nested groups count): group **"ITO EndPoint Portal"** (or `AUTH_IT_ADMIN_GROUP[_ID]`) → **IT Admin**; **"Desktop Support"** (or `AUTH_HELPDESK_GROUP[_ID]`) → **Helpdesk**. *The default names come from code/`.env.example`; the production `.env` may override them — use the Object ID variables for rename-proof matching.*
   4. Otherwise denied. If the group lookup itself failed, the message says so and asks an admin to grant `GroupMember.Read.All` instead of claiming the user lacks access.
4. The server issues a JWT `{ role, displayName, email }` signed with `SESSION_SECRET` (HS256 by default in `jsonwebtoken`; algorithm not set explicitly — *Verified absence of an explicit option*), valid **8 hours**, and redirects to `FRONTEND_URL/#session_token=…`. The token is in the URL **fragment**, so it is not sent to servers, logged or leaked through `Referer`.
5. The SPA stores the session in **`localStorage`** (`src/api/session.ts`, key in `SESSION_KEY`), adds `Authorization: Bearer` to every `/api` call, and clears the session on HTTP 401. `AuthGate` loads permissions from `GET /api/auth/me`.

### Token lifecycle

| Event | Behaviour |
|---|---|
| Issue | Login callback or `POST /api/auth/session` (email/password) |
| Lifetime | 8 hours (`SESSION_TTL_SECS`, `TOKEN_TTL_SECS`); **no refresh token** — the user signs in again |
| Validation | `requireSession` verifies signature + expiry on every `/api` call; `POST /api/auth/verify` and `GET /api/auth/me` validate on load |
| Logout | Client deletes the stored token. There is **no server-side revocation list**; a copied token stays valid until it expires (*Verified: none found*) |
| Secret rotation | Changing `SESSION_SECRET` (or deleting `DATA_DIR/session-secret` when no env value is set) invalidates every session. If `SESSION_SECRET` is unset, a random key is generated once and stored in `DATA_DIR/session-secret` |

## 3. Entra app registration checklist

| Setting | Value |
|---|---|
| Platform | **Web** redirect URI = the value of `AUTH_REDIRECT_URI`, e.g. `https://<host>/api/auth/callback` (and the localhost one for development) |
| Client secret | Stored only in `server/.env` (`ENTRA_CLIENT_SECRET` or `INTUNE_CLIENT_SECRET`) |
| Delegated permissions | `openid`, `profile`, `email`, `User.Read` |
| Application permissions | See [13 §1.2](13-api-permission-matrix.md); `GroupMember.Read.All` is required for group-based roles |
| Admin consent | Required for all application permissions |
| Enterprise application | If "User assignment required" is on, assign users/groups to the enterprise app *(not verifiable from code; check in Entra)* |
| Behind a reverse proxy | Set `AUTH_REDIRECT_URI` and `FRONTEND_URL` explicitly (IIS hides the host) |

## 4. Roles

| Role | Source | Page access | Capability keys |
|---|---|---|---|
| **Global Admin** | Allow-listed e-mail or assignment | Every page | Every key, hard-coded (never read from storage, so it cannot be locked out) |
| **IT Admin** | Entra group or assignment | Every page | `appIntel.read/write`, `securityPolicies.read/sync`, `staleDevices.read/export`, `patchOps.scanRemediate`, `copilot.access/read/write`, `intuneScriptsConfig.access`, `notificationSchedules.edit`, `scheduledReports.editSlackSchedule`, `roleActivity.export`, `settings.navigationEdit` |
| **Helpdesk** | Entra group or assignment | All pages **except** Policy Conflicts, Risk Scoring, Automation, Reports & Analytics, Scheduled Reports, Settings | `appIntel.read`, `securityPolicies.read`, `staleDevices.read`, `patchOps.scanRemediate`, `copilot.access`, `copilot.read` |
| **Custom roles** | Settings → Roles & Permissions, stored in `rbac.json` or PostgreSQL (`custom_roles`, `user_role_assignments`, `rbac_audit_log`) | Per `pages.<Title>` keys | Per capability keys |

Source of truth: `BUILTIN_ROLE_DEFAULTS` in `server/src/services/rolePermissions.ts`. The older [`docs/ROLES.md`](ROLES.md) describes three roles in prose and should be treated as secondary. The "Desktop team has critical patching" requirement is met by `patchOps.scanRemediate` on Helpdesk.

Capability **keys not currently tied to an enforcement point**: `scheduledReports.editSlackSchedule`, `roleActivity.export`, `settings.navigationEdit` (UI-level), and `securityPolicies.*` (router unmounted).

## 5. How authorization is checked

| Layer | Mechanism | File |
|---|---|---|
| Frontend | `canAccess(role, permissions, pageTitle)` hides sidebar items and shows `AccessDenied` | `src/lib/permissions.ts`, `src/App.tsx` |
| Backend session | `requireSessionExceptAuth` on `/api` → 401 if missing/invalid; **overwrites** `x-user-email` and `x-user-role` with verified values | `middleware/requireSession.ts` |
| Backend capability | `requireCapability(key)` looks up the caller's role in the permission store; Global Admin short-circuits | `middleware/requireRole.ts` |
| Audit roles | `requireAuditRole('Audit Reader')` maps app roles to audit roles (Global/IT Admin: reader+exporter+administrator; Helpdesk: reader) | `middleware/requireRole.ts` |
| Two-person style confirm | Patch remediation must be confirmed by the same admin who created the preview | `routes/endpointCentral.ts` |

## 6. Authorization gaps (Verified by reading every router)

These routes require only a valid session — any signed-in role, including Helpdesk or a custom role without the matching page, can call them if they craft the request:

| Route | Effect |
|---|---|
| `POST/PUT/DELETE /api/automations…`, `/scan`, `/ai-build` | Create/modify/delete automation rules; run rules (sends Slack/Jira/Teams) |
| `POST /api/scheduled-reports`, `PUT/DELETE /:id`, `POST /:id/run` | Manage report schedules; trigger Slack posts |
| `POST /api/integrations/:id/credentials`, `/sync` | Integration credential/sync endpoints |
| `POST /api/slack/test`, `/reconnect` | Slack health actions |
| `POST /api/jira/issues` | Create Jira issues |
| `POST /api/entra/devices/:id/sync`, `/diagnose` | Device actions through Graph |
| `GET /api/devices…`, `/users`, `/entra/*`, `/intelligence/*`, `/reports/*`, `/security-*`, `/patch/*` | Read access to fleet and identity data (page hiding is client-side only) |

Recommended fix: wrap these with `requireCapability(...)` using new or existing keys ([12](12-change-management.md), [10](10-risks-limitations-technical-debt.md) R-03).

## 7. Other security controls and weaknesses

| Control | Status |
|---|---|
| Rate limiting | Global limiter 200 req / 15 min per IP in production (2000 in dev); sign-in endpoint 20 / 15 min. `strictLimiter` is defined but unused |
| CORS | `cors()` with no options → **all origins allowed** (Verified). Token is a Bearer header, not a cookie, which limits CSRF exposure |
| Security headers | **No `helmet`/CSP/X-Frame-Options found** in the server (Verified by search) |
| Input validation | Zod on automation, schedule and similar bodies; error handler returns the first issue as HTTP 400 |
| Error responses | `errorHandler` returns `err.message` for 5xx; stack only in development. Messages may reveal upstream details |
| XSS | React escapes by default; no `dangerouslySetInnerHTML` audit was performed (*Not verified*) |
| Export safety | CSV/XLSX exports neutralise spreadsheet formulas (`appIntel/exportReport.ts`); Graph error text is sanitised and bearer tokens redacted |
| Token storage | `localStorage` (readable by any script running on the origin — an XSS would expose it) |
| Audit logging | `requestLogger` logs requests; `rbac_audit_log` (DB) and `schedule_audit_log` exist; patch actions are recorded. There is **no central immutable audit of all admin actions** (*Inferred*) |
| Mac admin ingest | Shared secret (`MAC_ADMIN_REPORT_KEY`, 16+ chars) compared with `timingSafeEqual`; disabled when unset |
| PostgreSQL TLS | Production pool uses `ssl: { rejectUnauthorized: false }` — encrypts but does **not** validate the server certificate (Verified in `db/index.ts`) |

## 8. Secrets management

- All secrets live in `server/.env` (git-ignored) or the host's environment. `server/.env.example` contained no token-, key-, GUID- or credential-in-URL-shaped values when this set was generated (pattern search; Verified), so it is safe to share.
- Never commit `.env`, `DATA_DIR/session-secret` or exports. The DeployHub zip procedure excludes `.env`, `node_modules` and `dist` ([`06-development/ZIP-FOR-DEPLOYHUB.md`](06-development/ZIP-FOR-DEPLOYHUB.md)).
- There are two env files: `server/.env` (all server secrets; the only file the server reads) and a root `.env` that contains only `VITE_AZURE_CLIENT_ID` and `VITE_AZURE_TENANT_ID` (public identifiers read by `src/lib/msalConfig.ts`, which the current sign-in flow does not use). Both are git-ignored and untracked (Verified with `git ls-files` / `git check-ignore`).
- Rotate: Entra client secret, Zoho refresh token/client secret, Slack bot token, Jira token, AI keys — on staff change or suspected exposure; then restart the service. Rotating `SESSION_SECRET` signs everyone out.
- The variable list with sensitivity and consumers: [14](14-environment-variable-reference.md).

## 9. Hardening backlog (priority order)

1. Add capability checks to the routes in §6.
2. Add `helmet` (CSP, frame-ancestors, HSTS at IIS) and restrict CORS to the portal origin.
3. Make the JWT algorithm explicit (`HS256`) and consider short-lived tokens with refresh.
4. Validate the PostgreSQL certificate (`rejectUnauthorized: true` with the CA).
5. Move the session token out of `localStorage` (httpOnly cookie) if the threat model requires it.
6. Return generic messages for 5xx errors; keep details in logs.
