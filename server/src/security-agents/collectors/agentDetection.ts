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

/**
 * Finds an agent in an app list. When a row carries a macOS bundle id it is matched on that id ONLY: macOS display
 * names are unreliable (the Falcon app is just "Falcon", duplicates are "Falcon 2", and Zscaler installer/uninstaller
 * bundles also contain "Zscaler"). Rows without a bundle id (Windows, Intune) are matched on the display name.
 */
export function findAgentApp(apps: AppStatus[], namePattern: RegExp, bundleIdPattern: RegExp): AppStatus | undefined {
  return apps.find(a => (a.bundleId ? bundleIdPattern.test(a.bundleId) : namePattern.test(a.name)))
}
