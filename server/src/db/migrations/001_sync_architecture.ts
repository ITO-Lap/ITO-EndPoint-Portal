// Database-first sync architecture (see docs/17-database-sync-architecture.md).
// Everything is IF NOT EXISTS, so applying it twice, or on a database that already has the older
// schema.sql tables, is safe. Secrets are never stored here: API credentials stay in environment variables.
//
// Spec tables already provided by earlier schema and reused as they are:
//   audit_logs                   -> audit_logs (schema.sql)
//   slack_notification_schedules -> notification_schedules (schema.sql, saved to the database immediately)

export const id = '001_sync_architecture'

export const sql = /* sql */ `
-- One row per (source, module): the schedule AND the latest status of that feed.
CREATE TABLE IF NOT EXISTS sync_sources (
  source              TEXT NOT NULL,                  -- intune | manageengine
  module              TEXT NOT NULL,                  -- devices | applications | patches
  display_name        TEXT NOT NULL,
  enabled             BOOLEAN NOT NULL DEFAULT true,
  interval_minutes    INTEGER NOT NULL CHECK (interval_minutes BETWEEN 5 AND 10080),
  last_attempt_at     TIMESTAMPTZ,
  last_success_at     TIMESTAMPTZ,
  last_status         TEXT NOT NULL DEFAULT 'never',  -- never | succeeded | partial | failed
  last_error          TEXT,                           -- sanitised: no tokens or secrets
  last_record_count   INTEGER,
  updated_by          TEXT,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (source, module)
);

CREATE TABLE IF NOT EXISTS sync_jobs (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source           TEXT NOT NULL,
  module           TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'running',   -- running | succeeded | partial | failed
  trigger          TEXT NOT NULL,                     -- schedule | manual | startup | dashboard | import
  triggered_by     TEXT,
  started_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  heartbeat_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at      TIMESTAMPTZ,
  fetched_count    INTEGER NOT NULL DEFAULT 0,
  created_count    INTEGER NOT NULL DEFAULT 0,
  updated_count    INTEGER NOT NULL DEFAULT 0,
  unchanged_count  INTEGER NOT NULL DEFAULT 0,
  deactivated_count INTEGER NOT NULL DEFAULT 0,
  error            TEXT
);
-- The lock: the database refuses a second 'running' job for the same source and module.
CREATE UNIQUE INDEX IF NOT EXISTS uq_sync_jobs_one_running ON sync_jobs (source, module) WHERE status = 'running';
CREATE INDEX IF NOT EXISTS idx_sync_jobs_recent ON sync_jobs (source, module, started_at DESC);

CREATE TABLE IF NOT EXISTS sync_logs (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_id      BIGINT REFERENCES sync_jobs(id) ON DELETE CASCADE,
  source      TEXT NOT NULL,
  module      TEXT NOT NULL,
  level       TEXT NOT NULL,                          -- info | warn | error
  message     TEXT NOT NULL,                          -- sanitised
  detail      JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sync_logs_job ON sync_logs (job_id);
CREATE INDEX IF NOT EXISTS idx_sync_logs_recent ON sync_logs (source, module, created_at DESC);

-- One row per management record, identified by the provider's own stable ID (devices.external_id).
-- The full record is kept in payload so every existing screen keeps working unchanged.
CREATE TABLE IF NOT EXISTS devices (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source           TEXT NOT NULL,
  external_id      TEXT NOT NULL,
  device_name      TEXT NOT NULL DEFAULT '',
  serial_number    TEXT NOT NULL DEFAULT '',
  platform         TEXT NOT NULL DEFAULT '',
  os_version       TEXT NOT NULL DEFAULT '',
  user_name        TEXT NOT NULL DEFAULT '',
  compliance_state TEXT NOT NULL DEFAULT '',
  last_check_in    TIMESTAMPTZ,
  payload          JSONB NOT NULL,
  payload_hash     TEXT NOT NULL,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  first_seen_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),   -- last sync that returned this record
  retired_at       TIMESTAMPTZ,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),   -- last time the data actually changed
  UNIQUE (source, external_id)
);
CREATE INDEX IF NOT EXISTS idx_devices_name        ON devices (LOWER(device_name));
CREATE INDEX IF NOT EXISTS idx_devices_serial      ON devices (serial_number) WHERE serial_number <> '';
CREATE INDEX IF NOT EXISTS idx_devices_platform    ON devices (platform);
CREATE INDEX IF NOT EXISTS idx_devices_source      ON devices (source, is_active);
CREATE INDEX IF NOT EXISTS idx_devices_checkin     ON devices (last_check_in);
CREATE INDEX IF NOT EXISTS idx_devices_last_seen   ON devices (last_seen_at);

-- Per-device bookkeeping of the sync itself (kept apart so devices stays a clean data table).
CREATE TABLE IF NOT EXISTS device_sync_state (
  device_id          BIGINT PRIMARY KEY REFERENCES devices(id) ON DELETE CASCADE,
  last_seen_job_id   BIGINT,
  last_changed_job_id BIGINT,
  last_changed_at    TIMESTAMPTZ,
  missed_syncs       INTEGER NOT NULL DEFAULT 0       -- consecutive complete syncs that did not return it
);

-- History of stale / not-stale transitions (one row per change, not per sync).
CREATE TABLE IF NOT EXISTS stale_device_status (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  device_id           BIGINT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  is_stale            BOOLEAN NOT NULL,
  days_since_check_in INTEGER,
  threshold_days      INTEGER NOT NULL,
  observed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  job_id              BIGINT
);
CREATE INDEX IF NOT EXISTS idx_stale_status_device ON stale_device_status (device_id, observed_at DESC);

INSERT INTO sync_sources (source, module, display_name, interval_minutes) VALUES
  ('intune',       'devices', 'Microsoft Intune',            45),
  ('manageengine', 'devices', 'ManageEngine Endpoint Central', 45)
ON CONFLICT (source, module) DO NOTHING;
`
