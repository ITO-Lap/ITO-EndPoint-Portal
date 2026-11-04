# 07 — Installation and Developer Onboarding

> Labels: **Verified** (commands/files exist and were run or read), **Not verified** (not executed for this document). Related: [14 — Environment variables](14-environment-variable-reference.md), [13 — Permissions](13-api-permission-matrix.md), [11 — Troubleshooting](11-troubleshooting-runbooks.md), [12 — Change management](12-change-management.md). Older guide: [`06-development/SETUP.md`](06-development/SETUP.md).

## 1. Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Git | any recent | Clone and branch |
| Node.js | **LTS or newer; development used 24.x.** The repo does not pin `engines` — *required minimum is Not verified*. The toolchain (Vite 8, TypeScript 6, Vitest 4, ESLint 10) needs a current Node | Install from nodejs.org or a version manager |
| npm | bundled with Node | The repo uses `package-lock.json` (npm) |
| OS | macOS (developed here), Windows (production host: IIS + Windows Service), Linux should work (*Not verified*) | |
| PostgreSQL | **Optional.** Only for the DB-backed features | `psql` to apply the schema |
| IDE | VS Code or similar with ESLint and TypeScript support | Any |
| Docker | **Not used** — no Dockerfile in the repo | |

You do **not** need Entra, Intune, ManageEngine or Slack credentials to start the app; features that need a source simply report "not configured" (see the startup log lines). With no source configured and sign-in enforced, you also need a way to sign in (§4).

## 2. Get the code and install

```bash
git clone <repository-url> endpoint-ai-copilot
cd endpoint-ai-copilot
npm install
```

`npm install` at the root also installs `server/` (the root `postinstall` runs `npm --prefix server install`). *(Verified in `package.json`.)*

## 3. Configure the environment

```bash
cp server/.env.example server/.env
```

Edit `server/.env`. The server reads **only `server/.env`** (`server/src/index.ts`). A root `.env` is only for `VITE_*` client variables.

Minimum for local development:

```text
PORT=4000
AUTH_PASSWORDLESS=true          # local development only
AUTH_ALLOWED_EMAILS=<your e-mail>
```

This lets you sign in with just an allow-listed e-mail (Global Admin). The server prints a warning for passwordless mode — never use it on a shared or production host.

Full reference (purpose, format, how to obtain): [14](14-environment-variable-reference.md). Data written by the app goes to `server/data/` in development (override with `DATA_DIR`); it is git-ignored.

### 3.1 Connect real integrations (optional, as needed)

| Integration | What to set | Where to get it | Verify |
|---|---|---|---|
| Intune / Entra | `INTUNE_TENANT_ID`, `INTUNE_CLIENT_ID`, `INTUNE_CLIENT_SECRET` (and `ENTRA_*` if separate) | Entra admin centre → App registrations; grant the application permissions in [13 §1.2](13-api-permission-matrix.md) and click **Grant admin consent** | Start log shows `Intune: ✓ configured`; Settings → integration status |
| Microsoft sign-in | Web redirect URI `http://localhost:4000/api/auth/callback` on the app; `AUTH_REDIRECT_URI`/`FRONTEND_URL` for non-default hosts | Entra → Authentication → Web | Sign in via the Microsoft button |
| ManageEngine | `MANAGEENGINE_CLIENT_ID/SECRET/REFRESH_TOKEN/API_DOMAIN` | Zoho API console self-client with the scopes in [13 §2](13-api-permission-matrix.md) | `ManageEngine: ✓ configured` |
| Slack | `SLACK_BOT_TOKEN` (+ channel IDs) | api.slack.com/apps → install the app to the workspace | Settings → Slack test; `GET /api/slack/health` |
| Jira | `JIRA_*` | Atlassian → Security → API tokens | `GET /api/jira/status` |
| AI | `OPENAI_API_KEY`, `GEMINI_API_KEY` | Provider consoles | Copilot responds |
| PostgreSQL | `DATABASE_URL`, then `psql "$DATABASE_URL" -f server/src/db/schema.sql` | Database provider | Server logs no DB errors |

Use a non-production tenant or a read-only test registration while developing.

## 4. Run locally

```bash
npm run dev        # Vite on http://localhost:5173 and the API on http://localhost:4000
```

- Open `http://localhost:5173`. Vite proxies `/api` to port 4000 (`vite.config.ts`).
- Run the pieces separately if you prefer: `npm run dev:client` and `npm run dev:server` (`tsx watch`, port 4000).
- Health check: `curl http://localhost:4000/health` → `{"status":"healthy",…}`.
- Background jobs (Slack health, schedulers, app-release monitor, security warm-up) start with the server. There is no separate worker process.
- Production-style single process: `npm start` (builds both tiers, then `node server/dist/index.js`, serving the SPA from `dist/`).

## 5. Tests, lint, type-check, build

| Task | Command | Notes |
|---|---|---|
| Client tests | `npm test` (root, `vitest run`) | jsdom + Testing Library |
| Server tests | `cd server && npm test` | node environment |
| Lint | `npm run lint` | ESLint flat config (`eslint.config.js`) |
| Type-check client | `npx tsc -p . --noEmit` | Existing warnings (unused imports) may be reported; they do not block the Vite build |
| Type-check server | `cd server && npx tsc --noEmit` | |
| Build | `npm run build` | `vite build` then `tsc` for the server |

When this document was prepared the suites passed on the working tree: client 157 tests (11 files), server 656 passed and 7 skipped (62 files, 1 skipped file). Re-run to confirm on your checkout. *(Observed counts; not guaranteed for other trees.)*

## 6. Making a safe change

1. Create a branch from `main` (naming: [12 §7](12-change-management.md)).
2. Find the owning files with [03 §5](03-repository-structure.md).
3. Change code; keep new fields optional and new data **nullable/“not reported”** rather than guessing.
4. Add or update a test next to the code (`__tests__/`).
5. Run: server tests, client tests, both type-checks, lint.
6. Run `npm run dev` and exercise the page; test with the source unavailable (unset its variables) to confirm the error/fallback behaviour.
7. For anything that persists data, confirm it survives a server restart (it must use `DATA_DIR` via `dataFile()`).
8. Open a pull request using the checklist in [12 §7](12-change-management.md). `.github/CODEOWNERS` requests review from the project owner.

## 7. Common installation errors

| Symptom | Cause | Fix |
|---|---|---|
| `npm install` fails in `server` during `postinstall` | Network/registry or Node too old | Retry, use a current Node, run `npm --prefix server install` to see the error |
| Server starts but every connector says "not configured" | Wrong `.env` location | Put values in `server/.env`, restart |
| `401 Authentication required` on every API call | No session | Sign in; for local only set `AUTH_PASSWORDLESS=true` (or `AUTH_ENFORCED=false` for debugging) |
| Microsoft sign-in loops or "redirect_uri mismatch" | Redirect URI not registered as **Web**, or differs by host/scheme | Register the exact `AUTH_REDIRECT_URI`; see [11 §1](11-troubleshooting-runbooks.md) |
| "group membership could not be checked" after sign-in | `GroupMember.Read.All` not consented | Grant and consent ([13](13-api-permission-matrix.md)) |
| Port 4000 already in use | Another server instance | Stop it or set `PORT` (and the Vite proxy target) |
| Vite page reloads when data changes | Server writes inside the watched tree | `vite.config.ts` already ignores `server/`; keep runtime data in `DATA_DIR` |
| TypeScript errors in files you did not touch | Pre-existing client warnings | Compare against `main`; only fix what you introduced |
| Data disappears after redeploy | `DATA_DIR` unset or inside the deploy folder | Set it to an absolute path outside the deploy folder ([08](08-deployment-and-operations.md)) |
| `ECONNREFUSED` to PostgreSQL | `DATABASE_URL` wrong or DB down | Check the string and network; unset `DATABASE_URL` to fall back to files |
