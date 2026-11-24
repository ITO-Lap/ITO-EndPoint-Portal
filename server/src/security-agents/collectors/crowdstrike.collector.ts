import type { AppStatus, Device } from '../../types.js'
import type { ISecurityAgentCollector, SecurityAgentInfo, AgentHealth } from '../types.js'
import { findAgentApp, healthFromAppStatus } from './agentDetection.js'

const NAME_PATTERN = /crowdstrike|falcon sensor/i
const BUNDLE_ID_PATTERN = /^com\.crowdstrike\.falcon\.app$/i

export class CrowdStrikeCollector implements ISecurityAgentCollector {
  readonly agentKey = 'crowdstrike'
  readonly agentName = 'CrowdStrike Falcon Sensor'

  getInstalledAgents(device: Device, apps: AppStatus[]): SecurityAgentInfo[] {
    const app = findAgentApp(apps, NAME_PATTERN, BUNDLE_ID_PATTERN)
    const seenViaAntivirusStatus = !app && device.antivirusStatus?.toLowerCase().includes('crowdstrike')
    return app || seenViaAntivirusStatus ? [this.getAgentInfo(device, apps)] : []
  }

  getAgentInfo(device: Device, apps: AppStatus[]): SecurityAgentInfo {
    const app = findAgentApp(apps, NAME_PATTERN, BUNDLE_ID_PATTERN)
    if (!app) {
      // Some connectors surface Falcon detection via a profile
      // name mapped onto Device.antivirusStatus rather than an installed-app
      // record — treat that as installed-but-unverified (Warning), never
      // fabricate a version/health we don't have.
      if (device.antivirusStatus?.toLowerCase().includes('crowdstrike')) {
        return {
          agentKey: this.agentKey,
          agentName: this.agentName,
          installed: true,
          health: 'Warning',
        }
      }
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
