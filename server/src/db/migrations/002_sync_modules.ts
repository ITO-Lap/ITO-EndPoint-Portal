// Scheduled refresh and status for application inventory and patch data (Endpoint Central).
// Their data stays in the existing caches; these rows hold the schedule and the latest status, like the device rows.

export const id = '002_sync_modules'

export const sql = /* sql */ `
INSERT INTO sync_sources (source, module, display_name, interval_minutes) VALUES
  ('manageengine', 'applications', 'Application inventory (Endpoint Central)', 480),
  ('manageengine', 'patches',      'Patch data (Endpoint Central)',            1440)
ON CONFLICT (source, module) DO NOTHING;
`
