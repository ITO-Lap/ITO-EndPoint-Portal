import { describe, it, expect } from 'vitest'
import { CrowdStrikeCollector } from '../collectors/crowdstrike.collector.js'
import { ZscalerCollector } from '../collectors/zscaler.collector.js'
import type { AppStatus, Device } from '../../types.js'

const app = (name: string, bundleId?: string, version = '7.1'): AppStatus => ({ name, version, publisher: '', status: 'Installed', ...(bundleId ? { bundleId } : {}) })
const dev = {} as Device

describe('macOS agent detection by bundle id', () => {
  it('detects Falcon even though the app is just called "Falcon" (or "Falcon 2")', () => {
    const c = new CrowdStrikeCollector()
    expect(c.getAgentInfo(dev, [app('Falcon', 'com.crowdstrike.falcon.App')]).installed).toBe(true)
    expect(c.getAgentInfo(dev, [app('Falcon 2', 'com.crowdstrike.falcon.App')]).installed).toBe(true)
  })
  it('does not count the Falcon notification helper alone as the sensor', () => {
    expect(new CrowdStrikeCollector().getAgentInfo(dev, [app('Falcon Notifications', 'com.crowdstrike.falcon.UserAgent')]).installed).toBe(false)
  })
  it('does not count Zscaler installer/uninstaller bundles as the client', () => {
    const z = new ZscalerCollector()
    expect(z.getAgentInfo(dev, [app('Zscaler-osx-4.8.0', 'com.zscaler.installer'), app('UninstallApplication', 'com.zscaler.installer.uninstall')]).installed).toBe(false)
    expect(z.getAgentInfo(dev, [app('Zscaler', 'com.zscaler.zscaler')]).installed).toBe(true)
  })
  it('still matches Windows rows (no bundle id) by name', () => {
    expect(new CrowdStrikeCollector().getAgentInfo(dev, [app('CrowdStrike Windows Sensor')]).installed).toBe(true)
    expect(new ZscalerCollector().getAgentInfo(dev, [app('Zscaler')]).installed).toBe(true)
  })
})
