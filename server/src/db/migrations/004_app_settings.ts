// Portal settings saved from Settings (General, Compliance, Automation, Security, Notifications, Data & Privacy):
// one row per section, the values as JSON.

export const id = '004_app_settings'

export const sql = /* sql */ `
CREATE TABLE IF NOT EXISTS app_settings (
  section     TEXT PRIMARY KEY,
  settings    JSONB NOT NULL,
  updated_by  TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`
