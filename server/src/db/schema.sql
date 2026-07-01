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
