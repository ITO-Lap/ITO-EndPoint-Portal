import type { AppStatus, Device } from '../../types.js'
import type { ISecurityAgentCollector, SecurityAgentInfo, AgentHealth } from '../types.js'
import { findAgentApp, healthFromAppStatus } from './agentDetection.js'

const NAME_PATTERN = /zscaler/i
const BUNDLE_ID_PATTERN = /^com\.zscaler\.zscaler$/i

export class ZscalerCollector implements ISecurityAgentCollector {
  readonly agentKey = 'zscaler'
  readonly agentName = 'Zscaler Client Connector'

  getInstalledAgents(_device: Device, apps: AppStatus[]): SecurityAgentInfo[] {
    const app = findAgentApp(apps, NAME_PATTERN, BUNDLE_ID_PATTERN)
    return app ? [this.getAgentInfo(_device, apps)] : []
  }

  getAgentInfo(_device: Device, apps: AppStatus[]): SecurityAgentInfo {
    const app = findAgentApp(apps, NAME_PATTERN, BUNDLE_ID_PATTERN)
    if (!app) {
      return { agentKey: this.agentKey, agentName: this.agentName, installed: false, health: 'NotInstalled' }
    }
    const lastCheckIn = app.lastAttempt ?? app.installDate
    const info: SecurityAgentInfo = {
      agentKey: this.agentKey,
      agentName: this.agentName,
      // Present in the app inventory at all — health (below) carries whether
      // the install actually succeeded, so a Failed record still surfaces as
      // "installed: true, health: Error" rather than looking absent.
      installed: app.status !== 'NotApplicable',
      productName: app.name,
      version: app.version,
      health: 'NotInstalled',
      ...(app.appType !== undefined ? { installPath: app.appType } : {}),
      ...(lastCheckIn !== undefined ? { lastCheckIn } : {}),
    }
    info.health = this.getHealthStatus(info, app)
    return info
  }

  getHealthStatus(info: SecurityAgentInfo, app?: AppStatus): AgentHealth {
    if (!info.installed) return 'NotInstalled'
    return app ? healthFromAppStatus(app) : 'Warning'
  }
}
