// History of Security Posture findings: one row per (check, device), opened when the check first fails,
// resolved when it passes again (or the device is gone), reopened if it fails again.

export const id = '003_security_findings'

export const sql = /* sql */ `
CREATE TABLE IF NOT EXISTS security_findings (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pillar          TEXT NOT NULL,                       -- encryption | patching | compliance | checkin
  device_id       TEXT NOT NULL,
  device_name     TEXT NOT NULL DEFAULT '',
  platform        TEXT NOT NULL DEFAULT '',
  source          TEXT NOT NULL DEFAULT '',
  detail          TEXT NOT NULL DEFAULT '',
  status          TEXT NOT NULL DEFAULT 'open',        -- open | resolved
  first_seen_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at     TIMESTAMPTZ,
  reopened_count  INTEGER NOT NULL DEFAULT 0,
  last_job_id     BIGINT,
  UNIQUE (pillar, device_id)
);
CREATE INDEX IF NOT EXISTS idx_findings_status   ON security_findings (status, pillar);
CREATE INDEX IF NOT EXISTS idx_findings_device   ON security_findings (device_id);
CREATE INDEX IF NOT EXISTS idx_findings_resolved ON security_findings (resolved_at) WHERE resolved_at IS NOT NULL;

INSERT INTO sync_sources (source, module, display_name, interval_minutes) VALUES
  ('portal', 'findings', 'Security findings history', 60)
ON CONFLICT (source, module) DO NOTHING;
`
