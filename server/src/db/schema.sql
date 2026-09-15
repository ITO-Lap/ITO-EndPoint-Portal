-- AI-powered Endpoint Intelligence Platform — PostgreSQL Schema
-- Run this against your database to initialise all tables.
-- Connect: psql $DATABASE_URL -f schema.sql

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── Tenants ──────────────────────────────────────────────────────────────────
-- Each row is one Microsoft Entra ID / Intune tenant (MSP multi-tenant support).
CREATE TABLE IF NOT EXISTS tenants (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name           TEXT NOT NULL,
  domain         TEXT,
  ms_tenant_id   TEXT NOT NULL,
  client_id      TEXT NOT NULL,
  -- Store encrypted in production (e.g. AWS KMS, Azure Key Vault)
  client_secret  TEXT NOT NULL,
  plan           TEXT NOT NULL DEFAULT 'free',   -- free | pro | enterprise
  is_active      BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_ms_tenant ON tenants(ms_tenant_id);

-- ─── Audit Log ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     UUID REFERENCES tenants(id) ON DELETE SET NULL,
  user_email    TEXT,
  action        TEXT NOT NULL,          -- DEVICE_REMEDIATED | REPORT_EXPORTED | POLICY_REVIEWED …
  resource_type TEXT,                   -- device | policy | tenant | report | user
  resource_id   TEXT,
  old_value     JSONB,
  new_value     JSONB,
  ip_address    TEXT,
  user_agent    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_tenant    ON audit_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_created   ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action    ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_resource  ON audit_logs(resource_type, resource_id);

-- ─── Device Risk Scores ───────────────────────────────────────────────────────
-- Cached AI risk scores; refreshed by the scheduler or on-demand.
CREATE TABLE IF NOT EXISTS device_risk_scores (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     UUID REFERENCES tenants(id) ON DELETE CASCADE,
  device_id     TEXT NOT NULL,
  device_name   TEXT NOT NULL,
  user_email    TEXT,
  risk_score    INTEGER NOT NULL CHECK (risk_score >= 0 AND risk_score <= 100),
  risk_level    TEXT NOT NULL,           -- low | medium | high | critical
  risk_factors  JSONB NOT NULL DEFAULT '[]',
  ai_summary    TEXT,
  action_items  JSONB NOT NULL DEFAULT '[]',
  computed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_risk_tenant     ON device_risk_scores(tenant_id);
CREATE INDEX IF NOT EXISTS idx_risk_level      ON device_risk_scores(risk_level);
CREATE INDEX IF NOT EXISTS idx_risk_score_desc ON device_risk_scores(risk_score DESC);

-- ─── Scheduled Reports ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS scheduled_reports (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id      UUID REFERENCES tenants(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  report_type    TEXT NOT NULL,          -- compliance | inventory | app-deployment | risk | executive
  schedule_cron  TEXT NOT NULL,          -- standard 5-field cron expression
  format         TEXT NOT NULL DEFAULT 'pdf',  -- pdf | excel | csv | pptx
  recipients     JSONB NOT NULL DEFAULT '[]',  -- ["user@org.com", …]
  filters        JSONB NOT NULL DEFAULT '{}',
  is_active      BOOLEAN NOT NULL DEFAULT true,
  last_run_at    TIMESTAMPTZ,
  next_run_at    TIMESTAMPTZ,
  created_by     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sched_tenant ON scheduled_reports(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sched_active ON scheduled_reports(is_active, next_run_at);

-- ─── Report Run History ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS report_runs (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  scheduled_report_id  UUID REFERENCES scheduled_reports(id) ON DELETE CASCADE,
  tenant_id            UUID REFERENCES tenants(id) ON DELETE CASCADE,
  status               TEXT NOT NULL DEFAULT 'pending',  -- pending | running | completed | failed
  format               TEXT NOT NULL,
  record_count         INTEGER,
  file_size_bytes      INTEGER,
  error_message        TEXT,
  triggered_by         TEXT DEFAULT 'scheduler',         -- scheduler | manual | api
  started_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at         TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_runs_schedule ON report_runs(scheduled_report_id);
CREATE INDEX IF NOT EXISTS idx_runs_tenant   ON report_runs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_runs_status   ON report_runs(status, started_at DESC);

-- ─── Intune Audit Log Export Module ────────────────────────────────────────────
-- Durable, resumable exports of Microsoft Graph /deviceManagement/auditEvents.
-- All tables are tenant-scoped (tenant_id defaults to the single configured
-- tenant when the app runs in its current single-tenant mode).

CREATE TABLE IF NOT EXISTS intune_audit_export_jobs (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id         TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'queued', -- queued | running | completed | failed | cancelled | expired
  range_start_utc   TIMESTAMPTZ NOT NULL,
  range_end_utc     TIMESTAMPTZ NOT NULL,
  timezone          TEXT NOT NULL DEFAULT 'UTC',
  filters           JSONB NOT NULL DEFAULT '{}',
  formats           JSONB NOT NULL DEFAULT '["json"]', -- any of json | csv | zip
  chunk_size_days   INTEGER NOT NULL DEFAULT 7,
  total_chunks      INTEGER NOT NULL DEFAULT 0,
  completed_chunks  INTEGER NOT NULL DEFAULT 0,
  total_pages       INTEGER NOT NULL DEFAULT 0,
  event_count       INTEGER NOT NULL DEFAULT 0,
  duplicate_count   INTEGER NOT NULL DEFAULT 0,
  retry_count       INTEGER NOT NULL DEFAULT 0,
  error_summary     TEXT,
  schedule_id       UUID,
  correlation_id    TEXT NOT NULL,
  created_by        TEXT NOT NULL,
  updated_by        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at        TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_audit_export_jobs_tenant  ON intune_audit_export_jobs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_export_jobs_status  ON intune_audit_export_jobs(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_export_jobs_creator ON intune_audit_export_jobs(created_by);

-- One row per 7-day (configurable) UTC chunk — the durable checkpoint unit.
-- A chunk is only marked 'completed' once every @odata.nextLink page inside
-- it has been fetched and written to the export artifact.
CREATE TABLE IF NOT EXISTS intune_audit_export_chunks (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id            UUID NOT NULL REFERENCES intune_audit_export_jobs(id) ON DELETE CASCADE,
  chunk_index       INTEGER NOT NULL,
  chunk_start_utc   TIMESTAMPTZ NOT NULL,
  chunk_end_utc     TIMESTAMPTZ NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending', -- pending | running | completed | failed
  pages_fetched     INTEGER NOT NULL DEFAULT 0,
  events_fetched    INTEGER NOT NULL DEFAULT 0,
  retry_count       INTEGER NOT NULL DEFAULT 0,
  last_error        TEXT,
  next_link         TEXT, -- in-progress @odata.nextLink, for mid-chunk resume
  started_at        TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,
  UNIQUE(job_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_audit_export_chunks_job ON intune_audit_export_chunks(job_id, chunk_index);

-- Completed export artifacts (one job can produce json + csv + zip).
CREATE TABLE IF NOT EXISTS intune_audit_export_artifacts (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id            UUID NOT NULL REFERENCES intune_audit_export_jobs(id) ON DELETE CASCADE,
  format            TEXT NOT NULL, -- json | csv | zip
  blob_path         TEXT NOT NULL,
  content_type      TEXT NOT NULL,
  size_bytes         BIGINT NOT NULL,
  sha256_checksum   TEXT NOT NULL,
  schema_version    TEXT NOT NULL DEFAULT '1',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_export_artifacts_job ON intune_audit_export_artifacts(job_id);

-- Email deliveries of a completed export (attachment or expiring link).
CREATE TABLE IF NOT EXISTS intune_audit_email_deliveries (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id            UUID NOT NULL REFERENCES intune_audit_export_jobs(id) ON DELETE CASCADE,
  recipients        JSONB NOT NULL DEFAULT '[]',
  subject           TEXT NOT NULL,
  message           TEXT,
  format            TEXT NOT NULL,
  delivery_mode     TEXT NOT NULL DEFAULT 'link', -- attachment | link
  status            TEXT NOT NULL DEFAULT 'queued', -- queued | sending | sent | failed
  error_message     TEXT,
  requested_by      TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at           TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_audit_email_job ON intune_audit_email_deliveries(job_id);

-- Recurring automatic export schedules.
CREATE TABLE IF NOT EXISTS intune_audit_export_schedules (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id         TEXT NOT NULL,
  name              TEXT NOT NULL,
  is_enabled        BOOLEAN NOT NULL DEFAULT true,
  frequency         TEXT NOT NULL, -- daily | weekly | monthly | yearly
  execution_time    TEXT NOT NULL, -- HH:mm, interpreted in `timezone`
  timezone          TEXT NOT NULL DEFAULT 'UTC',
  relative_period   TEXT NOT NULL DEFAULT 'previous_day', -- previous_day | previous_week | previous_month | previous_year | rolling_365
  filters           JSONB NOT NULL DEFAULT '{}',
  formats           JSONB NOT NULL DEFAULT '["csv"]',
  recipients        JSONB NOT NULL DEFAULT '[]',
  email_subject     TEXT,
  email_message     TEXT,
  retention_days    INTEGER NOT NULL DEFAULT 90,
  next_run_at       TIMESTAMPTZ,
  last_run_at       TIMESTAMPTZ,
  last_run_status   TEXT, -- completed | failed | running
  last_run_job_id   UUID REFERENCES intune_audit_export_jobs(id) ON DELETE SET NULL,
  is_running        BOOLEAN NOT NULL DEFAULT false, -- claim flag — prevents overlapping execution
  created_by        TEXT NOT NULL,
  updated_by        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_schedules_tenant ON intune_audit_export_schedules(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_schedules_due     ON intune_audit_export_schedules(is_enabled, next_run_at);

-- Immutable application-level audit trail for this module — who viewed,
-- exported, downloaded, emailed, or changed schedules. Never updated in
-- place; only inserted. No application code path exposes UPDATE/DELETE.
CREATE TABLE IF NOT EXISTS intune_audit_app_trail (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id         TEXT NOT NULL,
  actor_email       TEXT NOT NULL,
  actor_role        TEXT NOT NULL,
  action            TEXT NOT NULL, -- VIEW_EVENTS | CREATE_EXPORT | DOWNLOAD_EXPORT | SEND_EMAIL | CREATE_SCHEDULE | UPDATE_SCHEDULE | DELETE_SCHEDULE | RUN_SCHEDULE
  job_id            UUID,
  schedule_id       UUID,
  range_start_utc   TIMESTAMPTZ,
  range_end_utc     TIMESTAMPTZ,
  timezone          TEXT,
  filters           JSONB,
  recipients        JSONB,
  blob_path         TEXT,
  checksum          TEXT,
  event_count       INTEGER,
  chunk_count       INTEGER,
  page_count        INTEGER,
  success           BOOLEAN NOT NULL DEFAULT true,
  error_message     TEXT,
  correlation_id    TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_trail_tenant  ON intune_audit_app_trail(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_trail_action  ON intune_audit_app_trail(action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_trail_job     ON intune_audit_app_trail(job_id);

-- ─── Security Policies Module ──────────────────────────────────────────────────
-- Periodic Microsoft Graph pulls of Intune device-management policies and
-- Entra ID identity/security policies, normalized and snapshotted per sync
-- run so the latest two runs can be diffed (added/modified/removed). Raw
-- Graph JSON is preserved alongside normalized fields for full-fidelity
-- export. See server/src/services/securityPoliciesGraph.ts and
-- securityPoliciesStore.ts. Degrades gracefully without DATABASE_URL: the
-- route responds 503 to sync/history endpoints and the page shows a
-- configuration-required state (same isDbAvailable() guard as every other
-- DB-backed feature above).

CREATE TABLE IF NOT EXISTS security_policy_sync_runs (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  status         TEXT NOT NULL DEFAULT 'running', -- running | success | partial | failed
  triggered_by   TEXT NOT NULL DEFAULT 'manual',  -- manual | scheduled
  actor_email    TEXT,
  started_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at   TIMESTAMPTZ,
  policy_count   INTEGER NOT NULL DEFAULT 0,
  source_errors  JSONB NOT NULL DEFAULT '{}', -- per source/category partial-failure messages
  error_message  TEXT
);

CREATE INDEX IF NOT EXISTS idx_sec_policy_runs_started ON security_policy_sync_runs(started_at DESC);

-- One row per normalized policy, per sync run — a full point-in-time
-- snapshot, not an incremental delta (deltas are computed and stored
-- separately in security_policy_changes below).
CREATE TABLE IF NOT EXISTS security_policy_snapshots (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sync_run_id         UUID NOT NULL REFERENCES security_policy_sync_runs(id) ON DELETE CASCADE,
  source              TEXT NOT NULL,  -- intune | entra
  category            TEXT NOT NULL,  -- configurationPolicy | deviceConfiguration | compliancePolicy | securityBaseline | conditionalAccessPolicy | namedLocation | authenticationMethodsPolicy | authenticationStrengthPolicy | authorizationPolicy | securityDefaults
  policy_id           TEXT NOT NULL,
  name                TEXT NOT NULL,
  description         TEXT,
  platform            TEXT,
  technology          TEXT,
  is_enabled          BOOLEAN,
  settings            JSONB NOT NULL DEFAULT '[]',
  assignments         JSONB NOT NULL DEFAULT '[]',
  scope_tags          JSONB NOT NULL DEFAULT '[]',
  created_at_source   TIMESTAMPTZ,
  modified_at_source  TIMESTAMPTZ,
  captured_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  raw                 JSONB NOT NULL,
  UNIQUE(sync_run_id, source, category, policy_id)
);

CREATE INDEX IF NOT EXISTS idx_sec_policy_snap_run    ON security_policy_snapshots(sync_run_id);
CREATE INDEX IF NOT EXISTS idx_sec_policy_snap_lookup ON security_policy_snapshots(source, category, policy_id, captured_at DESC);

-- Computed once per sync run by diffing against the immediately preceding
-- run (previous_sync_run_id is null for the very first run, which has no
-- prior snapshot to compare against and therefore produces no changes).
CREATE TABLE IF NOT EXISTS security_policy_changes (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sync_run_id           UUID NOT NULL REFERENCES security_policy_sync_runs(id) ON DELETE CASCADE,
  previous_sync_run_id  UUID REFERENCES security_policy_sync_runs(id) ON DELETE SET NULL,
  source                TEXT NOT NULL,
  category              TEXT NOT NULL,
  policy_id             TEXT NOT NULL,
  name                  TEXT NOT NULL,
  change_type           TEXT NOT NULL, -- added | modified | removed
  diff                  JSONB NOT NULL DEFAULT '[]', -- [{ field, oldValue, newValue }]
  detected_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sec_policy_changes_run  ON security_policy_changes(sync_run_id);
CREATE INDEX IF NOT EXISTS idx_sec_policy_changes_type ON security_policy_changes(change_type, detected_at DESC);

-- Assignment target group id -> display name cache (Group.Read.All). TTL is
-- enforced in application code (securityPoliciesStore.ts), not here.
CREATE TABLE IF NOT EXISTS security_policy_group_cache (
  group_id      TEXT PRIMARY KEY,
  display_name  TEXT NOT NULL,
  cached_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Endpoint Operations Copilot ───────────────────────────────────────────────
-- Chat-based AI assistant (OpenAI gpt-4o-mini tool-calling) over the read
-- services already exposed elsewhere in this app, plus two gated write
-- actions (Jira ticket creation, automation-rule test-mode trigger) that
-- always go through an explicit user-confirmation step before executing.
-- See server/src/services/copilotEngine.ts and copilotTools.ts.
--
-- Degrades gracefully without DATABASE_URL: chat still works one-shot (no
-- persistence, ephemeral conversationId), and pending actions live in an
-- in-process Map for the life of the server so confirm/reject still work.
-- When DATABASE_URL IS set, everything below is persisted and the in-memory
-- map is kept in sync as a fast execution path (same pattern as every other
-- DB-optional feature in this schema).

CREATE TABLE IF NOT EXISTS copilot_conversations (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_email   TEXT NOT NULL,
  title        TEXT NOT NULL DEFAULT 'New conversation',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_copilot_conversations_user ON copilot_conversations(user_email, updated_at DESC);

CREATE TABLE IF NOT EXISTS copilot_messages (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES copilot_conversations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL,          -- user | assistant
  content         TEXT NOT NULL,
  tool_calls      JSONB NOT NULL DEFAULT '[]',  -- redacted tool-call names/args/results for this turn
  citations       JSONB NOT NULL DEFAULT '[]',  -- CopilotCitation[]
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_copilot_messages_conversation ON copilot_messages(conversation_id, created_at);

CREATE TABLE IF NOT EXISTS copilot_pending_actions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES copilot_conversations(id) ON DELETE CASCADE,
  message_id      UUID REFERENCES copilot_messages(id) ON DELETE SET NULL,
  tool_name       TEXT NOT NULL,          -- create_jira_ticket | trigger_automation_rule
  tool_args       JSONB NOT NULL DEFAULT '{}',
  status          TEXT NOT NULL DEFAULT 'pending',  -- pending | executed | rejected | failed
  requested_by    TEXT NOT NULL,
  confirmed_by    TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at    TIMESTAMPTZ,
  result          JSONB
);

CREATE INDEX IF NOT EXISTS idx_copilot_pending_actions_conversation ON copilot_pending_actions(conversation_id);
CREATE INDEX IF NOT EXISTS idx_copilot_pending_actions_status       ON copilot_pending_actions(status);

-- Immutability of intune_audit_app_trail is enforced at the application layer:
-- server/src/routes/roleActivity.ts (and, historically, the now-removed
-- intuneAuditLogs.ts) only ever INSERTs into this table, no route exposes
-- UPDATE/DELETE. For stronger DB-level enforcement, connect the application
-- as a role that owns no UPDATE/DELETE grant on this table (the app's DB
-- role must differ from the table owner for a REVOKE to take effect).
--
-- NOTE: the intune_audit_export_* / intune_audit_email_deliveries tables
-- above back the OLD "Intune Audit Logs" feature (generic Intune
-- config-audit browsing). That feature's routes have been removed — these
-- tables are retained only so any pre-existing rows aren't silently
-- dropped, but nothing in the application writes new rows to them anymore
-- (see server/src/index.ts).

-- ─── Role Activity Backup Module ───────────────────────────────────────────────
-- The Role Activity Backup module (server/src/routes/roleActivity.ts) has no
-- database dependency: it used to continuously back up admin
-- role-management/RBAC/permission-change activity from Entra ID, Intune, and
-- SharePoint into role_activity_events (plus sync-state/export-job/artifact/
-- email/schedule tables) via a background scheduler. That has all been
-- removed in favor of live per-request queries against the three sources,
-- bounded by ROLE_ACTIVITY_LIVE_BROWSE_MAX_DAYS — see the route file's
-- top-of-file comment for the current design and response contract. Export
-- is now a client-side (frontend) concern with no backend persistence.
-- View-events audit-trail entries for this module still go through
-- intune_audit_app_trail above (recordAppTrail() no-ops gracefully when
-- DATABASE_URL is unset, same as every other caller of that function), which
-- is otherwise unaffected by this removal.
