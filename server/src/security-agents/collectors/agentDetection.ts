import type { AppStatus } from '../../types.js'
import type { AgentHealth } from '../types.js'

// Health rules (per spec): Healthy = installed + running/detected version;
// Warning = installed but stopped/outdated; Error = corrupt/missing/detection
// failure; NotInstalled = agent absent. MDM app-inventory APIs only report
// install status + version, not live service state, so `serviceStatus` /
// `tamperProtection` stay undefined until a collector with real agent
// telemetry (e.g. a vendor console API) is added — never fabricated here.
export function healthFromAppStatus(app: AppStatus): AgentHealth {
  if (app.status === 'Failed') return 'Error'
  if (app.status === 'Pending') return 'Warning'
  if (!app.version || app.version === 'Unknown') return 'Warning'
  return 'Healthy'
}

export function findAppByNamePattern(apps: AppStatus[], pattern: RegExp): AppStatus | undefined {
  return apps.find(a => pattern.test(a.name))
}
