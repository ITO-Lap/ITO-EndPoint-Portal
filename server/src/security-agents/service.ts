import type { AppStatus, Device } from '../types.js'
import type { DeviceSecurityStatus, ISecurityAgentCollector, OverallHealth, AgentHealth, PlatformCoverage, MissingAgentDevice, CoverageHealth } from './types.js'
import { securityAgentCollectors } from './registry.js'
import { findAgent } from './types.js'

const HEALTH_WEIGHT: Record<AgentHealth, number> = { Healthy: 100, Warning: 60, Error: 20, NotInstalled: 0 }

// Worst-case-wins across every registered agent: any Error dominates, else any
// Warning, else Healthy only if every agent that's installed is Healthy and at
// least one agent is installed. Zero agents installed is its own bucket
// ("Unprotected") rather than folded into Warning, since that's a materially
// different risk than "protected but degraded" (mirrors the Health Rules spec).
export function computeOverallHealth(agents: DeviceSecurityStatus['agents']): OverallHealth {
  if (agents.every(a => a.health === 'NotInstalled')) return 'Unprotected'
  if (agents.some(a => a.health === 'Error')) return 'Error'
  if (agents.some(a => a.health === 'Warning' || a.health === 'NotInstalled')) return 'Warning'
  return 'Healthy'
}

// 0-100, averaged across registered agents (NotInstalled counts as 0, i.e. an
// unprotected agent drags the score down same as a broken one) — a simple,
// explainable formula rather than a fabricated ML-style risk model.
export function computeSecurityScore(agents: DeviceSecurityStatus['agents']): number {
  if (agents.length === 0) return 0
  const total = agents.reduce((sum, a) => sum + HEALTH_WEIGHT[a.health], 0)
  return Math.round(total / agents.length)
}

// Pure, side-effect-free — no network I/O — so it's unit-testable without
// mocking any connector (mirrors buildAppInventory in manageEngine.ts).
export function scanDevice(
  device: Device,
  apps: AppStatus[],
  scanTime: string,
  collectors: ISecurityAgentCollector[] = securityAgentCollectors
): DeviceSecurityStatus {
  // One entry per registered agent (not just installed ones), so the UI can
  // render an explicit "Not Installed" row/column instead of an absence.
  const agents = collectors.map(c => c.getAgentInfo(device, apps))
  return {
    deviceId: device.id,
    deviceName: device.deviceName,
    hostname: device.deviceName,
    primaryUser: device.user,
    ...(device.azureAdDeviceId !== undefined ? { azureAdDeviceId: device.azureAdDeviceId } : {}),
    operatingSystem: device.platform,
    osVersion: device.osVersion,
    connector: device.managementSource,
    lastSync: device.lastCheckIn,
    scanTime,
    agents,
    overallHealth: computeOverallHealth(agents),
    securityScore: computeSecurityScore(agents),
  }
}

// Fleet-relative "outdated version" pass: since no external vendor version
// catalog is available to this integration (same limitation documented in
// manageEngine.ts's buildAppInventory), "latest" means the newest version
// actually observed installed somewhere in the fleet. A device running an
// older version than that gets bumped from Healthy to Warning — never
// downgraded from Error, since a failed install is worse than "outdated".
function applyFleetRelativeVersionCheck(statuses: DeviceSecurityStatus[]): void {
  const latestByAgent = new Map<string, string>()
  for (const s of statuses) {
    for (const a of s.agents) {
      if (!a.installed || !a.version) continue
      const current = latestByAgent.get(a.agentKey)
      if (!current || compareVersions(a.version, current) > 0) latestByAgent.set(a.agentKey, a.version)
    }
  }
  for (const s of statuses) {
    for (const a of s.agents) {
      const latest = latestByAgent.get(a.agentKey)
      if (a.installed && a.version && latest && a.health === 'Healthy' && compareVersions(a.version, latest) < 0) {
        a.health = 'Warning'
      }
    }
    s.overallHealth = computeOverallHealth(s.agents)
    s.securityScore = computeSecurityScore(s.agents)
  }
}

function compareVersions(a: string, b: string): number {
  const pa = a.match(/\d+/g)?.map(Number) ?? []
  const pb = b.match(/\d+/g)?.map(Number) ?? []
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

export function scanFleet(
  devicesWithApps: Array<{ device: Device; apps: AppStatus[] }>,
  scanTime: string,
  collectors: ISecurityAgentCollector[] = securityAgentCollectors
): DeviceSecurityStatus[] {
  const statuses = devicesWithApps.map(({ device, apps }) => scanDevice(device, apps, scanTime, collectors))
  applyFleetRelativeVersionCheck(statuses)
  return statuses
}

// VDI/virtual desktops are excluded from physical-device coverage — same
// hostname heuristic already used by ManageEngineDevicesPage.classifyDevice
// (no fabricated device-type field exists to check instead).
const VIRTUAL_HOSTNAME_PATTERN = /vdi|virtual-machine|virtualmac/i
export function isVirtualHostname(hostname: string): boolean {
  return VIRTUAL_HOSTNAME_PATTERN.test(hostname)
}

const CRITICAL_COVERAGE_PCT = 70
const WARNING_COVERAGE_PCT = 95

function coverageHealth(falconPct: number, zscalerPct: number, totalDevices: number): CoverageHealth {
  if (totalDevices === 0) return 'Healthy'
  const worst = Math.min(falconPct, zscalerPct)
  if (worst < CRITICAL_COVERAGE_PCT) return 'Critical'
  if (worst < WARNING_COVERAGE_PCT) return 'Warning'
  return 'Healthy'
}

// Physical-device-only coverage for one platform — the number this feature
// exists to answer: "are our Windows/macOS devices protected?"
export function buildPlatformCoverage(statuses: DeviceSecurityStatus[], platform: 'Windows' | 'macOS'): PlatformCoverage {
  const devices = statuses.filter(s => s.operatingSystem === platform && !isVirtualHostname(s.hostname))
  const total = devices.length
  const falconInstalled = devices.filter(s => findAgent(s, 'crowdstrike')?.installed).length
  const zscalerInstalled = devices.filter(s => findAgent(s, 'zscaler')?.installed).length
  const falconCoveragePct = total ? Math.round((falconInstalled / total) * 100) : 100
  const zscalerCoveragePct = total ? Math.round((zscalerInstalled / total) * 100) : 100

  return {
    platform,
    totalDevices: total,
    falconInstalled,
    zscalerInstalled,
    falconMissing: total - falconInstalled,
    zscalerMissing: total - zscalerInstalled,
    falconCoveragePct,
    zscalerCoveragePct,
    health: coverageHealth(falconCoveragePct, zscalerCoveragePct, total),
  }
}

export function listDevicesMissingAgent(
  statuses: DeviceSecurityStatus[],
  platform: 'Windows' | 'macOS',
  agentKey: string
): MissingAgentDevice[] {
  return statuses
    .filter(s => s.operatingSystem === platform && !isVirtualHostname(s.hostname) && !findAgent(s, agentKey)?.installed)
    .map(s => ({ deviceId: s.deviceId, deviceName: s.deviceName, primaryUser: s.primaryUser, connector: s.connector, lastSync: s.lastSync }))
}
