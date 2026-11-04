# 08 — Deployment and Operations

> Labels: **Verified** (read in the repository), **Not verified** (outside the repository — platform, servers, monitoring). Related: [02 §8 deployment diagram](02-architecture.md), [09 data](09-database-and-data-handling.md), [14 env](14-environment-variable-reference.md), [11 runbooks](11-troubleshooting-runbooks.md). Older guides: [`06-development/IIS-DEPLOYMENT.md`](06-development/IIS-DEPLOYMENT.md), [`06-development/ZIP-FOR-DEPLOYHUB.md`](06-development/ZIP-FOR-DEPLOYHUB.md), [`HANDOVER-MANUAL.md`](HANDOVER-MANUAL.md).

## 1. What is (and is not) in the repository

| Artifact | Present? | Notes |
|---|---|---|
| IIS site config | Yes — `deploy/iis/web.config` | Reverse proxy to `http://127.0.0.1:4000` via URL Rewrite + ARR |
| Windows Service installer | Yes — `deploy/iis/install-service.ps1` | NSSM-based, service name `ITOEndpointCopilot`, logs in `<repo>\logs` |
| Packaging SOP | Yes — `docs/06-development/ZIP-FOR-DEPLOYHUB.md` | Source zip, uploaded to DeployHub |
| Coolify configuration | **No** | Not found; the task brief mentioned it "if present" |
| Dockerfile / compose | **No** | |
| CI/CD workflows | **No** — `.github/` holds only `CODEOWNERS` and `copilot-instructions.md` | Builds and tests are run by hand |
| Heroku-style hooks | Partially — `heroku-postbuild` in `package.json` runs `npm run build`; the server comment mentions Heroku router | Legacy; current target is IIS |

So the only deployment path verifiable from code is: **build on the server (or package source) → run `node server/dist/index.js` as a Windows Service → IIS reverse proxy**. How DeployHub receives and installs the zip is **Not verified**.

## 2. Environments

| Aspect | Development | Test / staging | Production |
|---|---|---|---|
| Frontend | Vite dev server `:5173` | **Not verified** whether a staging environment exists | Static `dist/` served by Express |
| API | `tsx watch` on `:4000` | — | `node server/dist/index.js` (NSSM service) |
| `NODE_ENV` | unset (non-production) | — | `production` (set by `install-service.ps1`) |
| Rate limit | 2000 / 15 min | — | 200 / 15 min per IP |
| Sign-in | Passwordless allowed | — | Microsoft sign-in only; passwordless **off** |
| Data | `server/data/` | — | `DATA_DIR` outside the deploy folder |
| Error output | Stack in responses when `NODE_ENV=development` | — | Message only |
| Audit local storage fallback | allowed | — | disabled |

## 3. Build and release commands

```bash
npm install            # installs root + server
npm run build          # vite build  -> dist/   and   tsc in server -> server/dist/
```

The server finds the SPA at `<repo>/dist` (relative to `server/dist/index.js`). Both folders must exist on the host.

### 3.1 First-time setup on Windows (IIS host)

1. Install Node.js LTS, IIS with **URL Rewrite** and **Application Request Routing** (enable proxy once: IIS Manager → server → ARR Cache → Server Proxy Settings → Enable proxy).
2. Copy the source to e.g. `C:\inetpub\ito-endpoint`, run `npm install` and `npm run build`.
3. Create `server\.env` from `.env.example` ([14 §10](14-environment-variable-reference.md)). Set `DATA_DIR` (e.g. `D:\ito-data`) and grant the service account **Modify** on it.
4. Register the service (elevated PowerShell): `.\deploy\iis\install-service.ps1 -RepoPath "C:\inetpub\ito-endpoint" -NssmPath "C:\nssm\nssm.exe"`. Re-running is safe (stops/removes the same-named service first).
5. Copy `deploy/iis/web.config` to the IIS site root. Allow `HTTP_X_FORWARDED_HOST` and `HTTP_X_FORWARDED_PROTO` in URL Rewrite server variables, **or** set `AUTH_REDIRECT_URI` and `FRONTEND_URL` in `.env` (recommended).
6. Register the `AUTH_REDIRECT_URI` as a Web redirect URI in Entra.

### 3.2 Routine release (zip-based)

1. On the developer machine confirm a clean tree and passing checks ([07 §5](07-installation-and-developer-onboarding.md)).
2. Build the zip using the SOP command (excludes `node_modules`, `dist`, `.git`, `.env`, logs).
3. **Check the zip contents.** The SOP says `.env.example` files are included, but its command passes `-x ".env" ".env.*"`. **Verified by test (macOS `zip`): that pattern also removes `.env.example` and `server/.env.example`** from the archive. The server template is therefore missing on the target unless you add it back. Fix the SOP by excluding only the real files (`-x ".env" "server/.env"`) and keep `*.example`, then confirm with `unzip -l`. Never add the real `.env`.
4. Upload and install via DeployHub (*process Not verified*), then on the host: `npm install`, `npm run build`, restart the service (`nssm restart ITOEndpointCopilot`).
5. Smoke test ([§5](#5-post-deployment-smoke-test)).

## 4. Required production configuration

See [14 §10](14-environment-variable-reference.md). Non-negotiable:

- `NODE_ENV=production` (service installer sets it).
- `DATA_DIR` outside the deploy folder; writable; backed up.
- `AUTH_REDIRECT_URI` and `FRONTEND_URL` set when IIS hides the host.
- `AUTH_PASSWORDLESS` and `AUTH_PASSWORD` **unset**; `AUTH_ENFORCED` not `false`.
- Entra/Intune and ManageEngine secrets only in `server\.env` (restrict the file's NTFS ACL).
- Role groups: set `AUTH_IT_ADMIN_GROUP_ID` and `AUTH_HELPDESK_GROUP_ID` (Object IDs).

## 5. Post-deployment smoke test

| Check | How | Expect |
|---|---|---|
| Process up | `nssm status ITOEndpointCopilot`; `curl http://127.0.0.1:4000/health` | `SERVICE_RUNNING`; `healthy` |
| Startup log | `logs\service.out.log` | Connector lines (✓ configured), `Server listening`, any `Migrated …` lines on first start after upgrade |
| Site via IIS | Browse the public URL | Login page |
| Sign-in | Microsoft sign-in as Global Admin, then as IT Admin and Helpdesk users | Each lands with the expected pages |
| Data | Dashboard loads devices | No red banners; "last synced" values present |
| Persistence | Change a schedule time, restart the service | Change still present |
| Integrations | Settings → integration status; Slack test | Green / ok |

## 6. Rollback and hotfix

There is no automated rollback.

**Rollback (application only):** keep the previous release folder (or zip) before replacing; stop the service, restore the previous `server\dist` and `dist`, start the service. `DATA_DIR` is independent of the release, so schedules, roles and automations are unaffected.

**When a release changed persisted data shape** (new file fields): older code ignores unknown fields; but a new release that writes a changed shape may confuse the old one — take a copy of `DATA_DIR` before upgrading.

**Hotfix:** branch from `main`, minimal change, tests for the bug, same zip process, same smoke test, then merge back. Record the version/commit deployed (there is no version stamp in the app — *recommended improvement*).

**Database:** no migrations tool; before applying SQL take a dump (`pg_dump`), apply in a transaction, and keep the reverse SQL in the change ticket. See [09 §3](09-database-and-data-handling.md) and [12 §6](12-change-management.md).

## 7. Backups and disaster recovery

| Item | Method | Frequency (recommended) |
|---|---|---|
| `DATA_DIR` (excluding `cache/` if desired) | File backup / VM snapshot | Daily |
| `server\.env` | Store in the team's secret manager (never in git) | On change |
| PostgreSQL (if used) | `pg_dump` / provider backup | Daily + before any schema change |
| Source | Git remote | Continuous |

Recovery: reinstall Node/IIS, deploy the release, restore `.env` and `DATA_DIR`, start the service, smoke test. The device caches rebuild on the first sync. **Current backup/DR arrangements for the production host are Not verified.**

## 8. Logs, monitoring and alerts

| Capability | State |
|---|---|
| Application logs | `console` output captured by NSSM to `logs\service.out.log` / `service.err.log` (rotated at 10 MB). `requestLogger` logs each request |
| Health endpoint | `GET /health` (no dependency checks — it does not verify Graph, Slack or the database) |
| Integration health | Slack health monitor (5-minute `auth.test`); Settings → integration status |
| Metrics, tracing, uptime alerts, log shipping | **None found.** Monitoring outside the repo (for example IIS/Windows monitoring) is **Not verified** |
| Notification of failures | Failed scheduled runs are recorded in run history; Slack failures are visible in Slack health. No pager/alert integration |

Recommended: an external uptime check on `/health`, log shipping for the service logs, and an alert on repeated `[Error]` lines.

## 9. CI/CD

None in the repository. Recommended minimum pipeline (GitHub Actions): on pull request run `npm ci`, `npm test`, `npm --prefix server test`, `npm run lint`, both type-checks and `npm run build`; block merge on failure. Add dependency scanning (`npm audit`) — see [10](10-risks-limitations-technical-debt.md).

## 10. Scaling and multi-instance constraints

The app is designed for **one instance**. Background jobs are in-process and several stores use local files or in-memory caches; a second instance would duplicate scheduled runs and see different caches. Notification schedules claim work atomically only when PostgreSQL is used. Do not scale out without addressing this ([10](10-risks-limitations-technical-debt.md)).
