# Database-first sync architecture

## What it does

The portal keeps a stored copy of the Intune and Endpoint Central device data. Screens read that copy at once after sign-in. Background jobs then refresh it from the two APIs, so nobody waits for Graph or Endpoint Central and an outage never empties a screen.

**It works with or without PostgreSQL (hybrid).** The same sync engine, the same rules and the same screens run on either of two storage backends:

| Backend | When | Where the data lives |
|---|---|---|
| **Local files** (default) | No PostgreSQL configured | `DATA_DIR/sync-state.json` (schedules, status, recent jobs and logs) and `DATA_DIR/cache/sync-devices-<source>.json` (device records) |
| **PostgreSQL** | A connection is saved in Settings -> Integrations -> PostgreSQL (or `DATABASE_URL` is set) and the server has been restarted | The tables below |

Nothing about the tool's behaviour depends on PostgreSQL: incremental updates, retirement instead of deletion, locking, failure retention, the dashboard card and the schedules all work on local files. PostgreSQL adds durability across servers, SQL access, and room for the later modules.

## Scope today, and what is next

| Area | Status |
|---|---|
| Migrations, sync tables, job locking, logs (PostgreSQL) and the equivalent file store | Done |
| Devices from Intune and ManageEngine/Endpoint Central (incl. check-in, compliance, encryption, security posture inputs) | Done: stored, incremental, retired not deleted, stale history |
| Dashboard sync card, Settings -> Data Sync schedules, admin "Sync now" | Done |
| Slack schedules | Already in PostgreSQL (`notification_schedules`), saved immediately |
| Audit trail | Already in PostgreSQL (`audit_logs`); sync runs and schedule changes are written to it |
| Application inventory | **Scheduled refresh and status** (every 8 hours by default). The data stays in the existing on-disk scan cache (`endpoint-central-app-inventory.v2.json`), which already survives a restart and resumes an interrupted scan. The `applications`, `application_versions` and `device_applications` tables are **not built**; moving the data into them is a later step |
| Patch data | **Scheduled refresh and status** (daily by default): the patch-system list (now also saved to `cache/patch-systems.json`, so a restart still has a last-known copy) and the fleet's missing critical patches. Readers keep their existing last-known fallback. Where the token cannot read missing-patch detail the row says "not available through the current API connection" instead of showing numbers |
| Security findings history | **Done** (hourly by default): one record per failing check per device with first seen, last seen, resolved and reopened, in the `security_findings` table or `cache/sync-findings.json`. API: `GET /api/security-posture/findings` |
| Users | **No separate store.** The Users page is now derived from the stored Intune device list (Entra supplies display names), so it no longer downloads the whole fleet from Graph a second time |
| `device_management_sources` | Not created: a device appearing in both Intune and Endpoint Central is two rows, one per source, matched by the existing posture reconciler |

The spec names `slack_notification_schedules` and `audit_logs`; the existing `notification_schedules` and `audit_logs` tables already do those jobs and were reused rather than duplicated.

## Where does the Users page get its data?

From the stored Intune device list, not from a second Graph download. Devices are grouped by the signed-in user's address; the worst compliance state and the latest check-in of that user's devices are shown, and Microsoft Entra supplies display names, MFA status and sign-in history when it is connected (without Entra the name is derived from the address). The page therefore opens at once from stored data and refreshes whenever the device sync does.

## Scheduled modules

Each row of `sync_sources` is one scheduled module with its own interval, switch and status. They share the engine, the lock, the job and log records, the failure rules and the dashboard card.

| Module (source) | What a run does | Default | Allowed |
|---|---|---|---|
| `devices` (`intune`, `manageengine`) | Reads the provider's devices and updates the store incrementally (below) | 45 min | 15 to 1440 min |
| `applications` (`manageengine`) | Starts (or joins) the Endpoint Central inventory scan and waits for it, keeping a heartbeat. Only devices not scanned in the last 6 hours are re-read | 8 h | 1 to 24 h |
| `patches` (`manageengine`) | Re-reads the patch-system list and the fleet's missing critical patches | 24 h | 1 to 24 h |
| `findings` (`portal`) | Records which Security Posture checks fail for which devices, and resolves the ones that stopped failing | 60 min | 15 to 1440 min |

**Order and rate limits.** A source's due modules run one after another (devices, patches, applications, then findings), never in parallel, because they share the Endpoint Central rate limit; the long inventory scan goes last.

**Outcomes.** `applications`: failed when the scan throws or reads no device, partial when more than 10% of devices could not be read (their last known inventory is kept). `patches`: failed on an empty list, partial when the token lacks the missing-patch scope. `findings`: failed when nothing could be assessed, partial when a check was skipped.

**Findings are resolved only when it is safe.** A check that could not be assessed this run (for example Patch Manager data unavailable) is skipped and its open findings are left alone. If a check that had 20 or more open findings suddenly shows fewer than half of them, it is treated as a partial read and nothing is resolved for it. So a data outage never appears as a wave of fixed findings.

## Schema (migration `001_sync_architecture`)

| Table | Purpose |
|---|---|
| `schema_migrations` | Which migrations have been applied |
| `sync_sources` | One row per (source, module): schedule (`enabled`, `interval_minutes`) and latest status (`last_attempt_at`, `last_success_at`, `last_status`, `last_error`, `last_record_count`) |
| `sync_jobs` | One row per run: trigger, status, counts (fetched, created, updated, unchanged, deactivated), heartbeat. A partial unique index allows only one `running` job per source and module: this is the lock |
| `sync_logs` | Log lines per job, secrets removed |
| `devices` | One row per management record: `UNIQUE (source, external_id)`; indexed columns (name, serial, platform, source, last check-in, last seen) plus the full record in `payload` (JSONB) and its `payload_hash`; `is_active`, `first_seen_at`, `last_seen_at`, `retired_at`, `updated_at` |
| `device_sync_state` | Per device: last job that saw it, last job that changed it, consecutive missed syncs |
| `stale_device_status` | One history row each time a device crosses the stale threshold (21 days, `STALE_DAYS`) in either direction |

No credentials, tokens or client secrets are stored in any table; they stay in environment variables.

## Choosing the storage (Settings -> Integrations -> PostgreSQL)

PostgreSQL is an optional integration card. Enter a connection string (a `postgresql://` URL containing the user, password, host, port and database name) and an optional TLS choice (`auto` = TLS in production, `require`, `disable`), save the field, then press **Push to Server**. The server tests the connection first and saves it only if it works (an unreachable or wrong string is refused with the reason, never echoing the password). **Test Connection** re-checks it later. **Disconnect** removes the saved connection.

The saved setting is kept in an owner-only file (`DATA_DIR/postgres-config.json`) and is read **once at server start**, so it takes effect after a restart. This is deliberate: no module can change storage halfway through a session and leave data in two places. Until the restart the card says "Saved. Restart the server to start using PostgreSQL." The saved setting wins over `DATABASE_URL`.

**Switching from files to PostgreSQL** (at the first start with a connection): migrations run, the schedule choices made on files are carried over, and the device records already in the file store are imported (so screens are not empty), then a live sync refreshes them. The file store is left in place. **Switching back:** disconnect, restart; the app returns to the file store, which still holds its last copy.

Later migrations: `002_sync_modules` adds the application and patch schedule rows; `003_security_findings` adds the `security_findings` table (unique on check and device) and the findings schedule row; `004_app_settings` adds `app_settings` (saved Settings sections, one row each).

## Sync workflow

1. **Startup.** With PostgreSQL configured, the server applies pending migrations under a database lock (safe with several instances), then uses PostgreSQL. If migrations fail it logs the error and keeps working on local files. In both cases the scheduler starts.
2. **First request on an empty store.** Devices are imported from the last on-disk snapshot so screens fill at once (this is not counted as a live sync), and a live sync starts. If there is no snapshot either, that single request waits for the first live pull, as before.
3. **Reading.** `fetchAllDevices()` (used by every device, posture, stale-device and report screen) returns the active records from the store (files or PostgreSQL), with a 30-second in-memory copy. It never calls the APIs.
4. **Background refresh.** Every minute the scheduler starts each enabled, connected source whose interval has elapsed. A dashboard load also calls `POST /api/sync/kick` once, which starts whatever is due and returns at once. Syncs run in the server process and never block a request.
5. **A sync run** (per source): acquire the lock (insert a `running` job; a second one is refused by the database), fetch with the existing pagination, retry and rate-limit handling, compare each record's hash with the stored one, write only new or changed records, mark what was seen, retire what is missing, record stale transitions, record the job and the source status, log it, and invalidate the read cache.
6. **Schedules.** Defaults: devices every 45 minutes for both sources (configurable 15 to 1440 minutes in Settings -> Data Sync). A failed source is retried after 10 minutes instead of waiting the full interval.

## Incremental update rules

- Identity is the provider's own ID (Intune managed device ID; Endpoint Central resource ID). Records are never deleted and recreated.
- New ID: inserted. Existing ID: updated only if the content hash changed. Unchanged records are not rewritten.
- Repeated IDs inside one response collapse to one row (last wins). The same ID from two sources is two rows by design.
- Missing record: retired (`is_active = false`, `retired_at` set) after `SYNC_RETIRE_AFTER_MISSES` (default 2) consecutive complete syncs without it. Never deleted. If it returns it is reactivated.
- Retired devices are not shown in lists, but their rows and history remain.

## Failure handling

- A failed fetch changes no device data. The source shows `failed`, `last_success_at` stays at the last good sync, and the dashboard warns: "Live sync failed. Displaying data from <time>."
- An empty response is never trusted over stored data: the sync is marked failed and the records kept.
- A response far smaller than what is stored (under half, when at least 20 records are stored) is marked `partial`: records are updated but nothing is retired, and `last_success_at` does not move.
- Errors are stored sanitised (bearer tokens, JWTs, `client_secret=`, `token=` values and long opaque strings are replaced with `[redacted]`) and shown to people with the sync permission only.
- A job whose server died is reclaimed after 10 minutes without a heartbeat (on files, a job left running by a stopped process is closed at the next start).
- ManageEngine keeps the last known MDM detail values for devices whose detail read failed (existing `carryOverMdmDetails`), now using the database copy as the previous list.

## API

| Method | Path | Who | Purpose |
|---|---|---|---|
| GET | `/api/sync/status` | any signed-in user | `storage` (`file`/`postgres`), `postgresConfigured`, `restartRequired`, and per source: schedule, last attempt, last success, status, record count, running, stale |
| POST | `/api/sync/kick` | any signed-in user | Start due syncs in the background (202) |
| POST | `/api/sync/run` | `sync.manage` | "Sync now" for `{ source, module }` (module defaults to `devices`); 409 if already running or not configured |
| PUT | `/api/sync/schedule` | `sync.manage` | `{ source, module?, enabled?, intervalMinutes? }`, limits per module (see Scheduled modules) |
| GET | `/api/security-posture/findings` | `pages.Security Posture` | Findings history: `status` (open or resolved), `pillar` (encryption, patching, compliance, checkin), `limit` (default 200, max 1000); returns `counts` and `findings` |
| GET | `/api/sync/logs` | `sync.manage` | Recent log lines |

| POST / DELETE | `/api/integrations/postgres/credentials` | session | Test and save the PostgreSQL connection / remove it (applies at next start) |

`sync.manage` ("Data sync: run a sync now & change sync schedules") is on for Global Admin and IT Admin by default and can be given to a custom role. Manual runs and schedule changes are written to `audit_logs` (`SYNC_RUN_MANUAL`, `SYNC_SCHEDULE_UPDATED`).

## API-to-database mapping

| Provider data | Source | Stored in |
|---|---|---|
| Intune managed devices (Graph `deviceManagement/managedDevices`, paged) | `intune` | `devices` (`external_id` = managed device ID) |
| ManageEngine MDM devices (iOS/macOS) and Endpoint Central agent devices (Windows) | `manageengine` | `devices` (`external_id` = MDM device ID or the Endpoint Central resource ID) |
| Device name, serial, platform, OS, user, compliance, last check-in | both | indexed columns on `devices` |
| Everything else the app shows (encryption, passcode, hardware, network, issue fields, MDM detail) | both | `devices.payload` |

If an API cannot provide a value, the stored record carries "Unknown" or leaves it out; the UI does not substitute fake values.

## Environment variables

| Variable | Meaning |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string. Optional; the saved setting in Settings -> Integrations -> PostgreSQL takes precedence |
| `SYNC_RETIRE_AFTER_MISSES` | Complete syncs a record may be missing from before it is retired (default 2) |
| `MANAGEENGINE_*`, `INTUNE_*` | Provider credentials: unchanged, never stored in the database |

## Setup and recovery

- **Enable PostgreSQL.** Settings -> Integrations -> PostgreSQL (or `DATABASE_URL`), then restart the server. Migrations apply by themselves (`schema_migrations` lists them). Nothing needs seeding: the two `sync_sources` rows are created by the migration.
- **Check.** Settings -> Data Sync shows which storage is in use, or `GET /api/sync/status` (`storage`: `file` or `postgres`, `restartRequired`).
- **A sync looks stuck.** Wait 10 minutes: the lock is reclaimed. Or `UPDATE sync_jobs SET status='failed', finished_at=NOW() WHERE status='running';`.
- **Rebuild the device table from the APIs.** `TRUNCATE devices CASCADE;` then restart or press Sync now. Do this only when you accept that history (`stale_device_status`) is cleared.
- **Go back to files.** Disconnect PostgreSQL in Integrations (and unset `DATABASE_URL`), then restart. The tables are left untouched.
- **Reset the file store.** Stop the server and delete `DATA_DIR/sync-state.json` and `DATA_DIR/cache/sync-devices-*.json`; the next start refills from the APIs.
- **Add a migration.** Create `server/src/db/migrations/00N_name.ts` exporting `id` and `sql`, and append it in `migrations/index.ts`. Never edit a released migration.
- **Tests.** `server/src/services/sync/__tests__`. The same behaviour suite runs on the file backend always, and on PostgreSQL via PGlite when installed (`npm i -D @electric-sql/pglite` in `server/`); the PostgreSQL runs are skipped without it.

## Limitations

- The file backend is for one server process (its lock is in memory). With several instances use PostgreSQL, whose lock is safe across instances. The 30-second read copy and the joiner for concurrent syncs are per process in both cases.
- Devices are stored as a JSON record plus indexed columns, not fully normalised.
- Application and patch data are not moved into database tables yet (their schedule and status are stored; the data stays in its own caches).
- The findings history has an API but no screen yet.
