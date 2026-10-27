import type { AppStatus, Device } from '../types.js'

export type AgentHealth = 'Healthy' | 'Warning' | 'Error' | 'NotInstalled'

export interface SecurityAgentInfo {
  agentKey: string
  agentName: string
  installed: boolean
  productName?: string
  version?: string
  serviceStatus?: string
  health: AgentHealth
  lastCheckIn?: string
  installPath?: string
  // Vendor-specific fields not every agent reports (SensorId, TamperProtection,
  // DigitalSignature, SignatureStatus...) — kept generic instead of hardcoded
  // per-vendor properties so a new collector can surface its own without a
  // type change. Absent key = "not reported by this connector", never faked.
  extra?: Record<string, string>
}

// Every new agent vendor implements this and registers itself in registry.ts —
// core scan logic (service.ts) only ever calls through this interface.
export interface ISecurityAgentCollector {
  readonly agentKey: string
  readonly agentName: string
  getInstalledAgents(device: Device, apps: AppStatus[]): SecurityAgentInfo[]
  getAgentInfo(device: Device, apps: AppStatus[]): SecurityAgentInfo
  getHealthStatus(info: SecurityAgentInfo): AgentHealth
}

export type OverallHealth = 'Healthy' | 'Warning' | 'Error' | 'Unprotected'

export interface DeviceSecurityStatus {
  deviceId: string
  deviceName: string
  hostname: string
  primaryUser: string
  azureAdDeviceId?: string
  operatingSystem: Device['platform']
  osVersion: string
  connector: Device['managementSource']
  lastSync: string
  scanTime: string
  inventoryAvailable: boolean
  agents: SecurityAgentInfo[]
  overallHealth: OverallHealth
  securityScore: number
}

// Executive-facing coverage summary for one physical platform (Windows or
// macOS) — this, not a full device inventory table, answers "are we
// protected?" in one glance. VDI/virtual devices are excluded upstream.
export type CoverageHealth = 'Healthy' | 'Warning' | 'Critical'

export interface PlatformCoverage {
  platform: 'Windows' | 'macOS'
  totalDevices: number
  inventoryAvailableDevices: number
  inventoryUnavailableDevices: number
  falconInstalled: number
  zscalerInstalled: number
  falconMissing: number
  zscalerMissing: number
  falconCoveragePct: number | null
  zscalerCoveragePct: number | null
  health: CoverageHealth
}

export interface MissingAgentDevice {
  deviceId: string
  deviceName: string
  primaryUser: string
  connector: Device['managementSource']
  lastSync: string
}

export function findAgent(status: DeviceSecurityStatus, agentKey: string): SecurityAgentInfo | undefined {
  return status.agents.find(a => a.agentKey === agentKey)
}
