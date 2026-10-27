import { getManageEngineConfig } from '../store/integrationStore.js'
import { getAccessToken } from './manageEngine.js'
import { getPatchSystems, type PatchSystemStatus } from './endpointCentralPatch.js'

const DEFAULT_HOST = 'https://endpointcentral.manageengine.com'

export type EndpointHealthLevel = 'healthy' | 'attention' | 'high_risk' | 'critical'

export interface EndpointHealthScore {
  resourceId: string
  detailResourceId: string
  deviceName: string
  platform: PatchSystemStatus['platform']
  osName?: string
  score: number
  level: EndpointHealthLevel
  factors: Array<{ label: string; points: number }>
  lastSuccessfulScanTime: string | null
  criticalPatchCount: number
  missingPatchCount: number
}

export interface PatchOperationsDashboard {
  generatedAt: string
  connector: {
    configured: boolean
    healthy: boolean
    latencyMs: number | null
    message: string
    lastRefreshAt: string | null
  }
  coverage: { discovered: number; clientOs: number; assessed: number; unscanned: number; staleScans: number }
  health: { score: number | null; level: EndpointHealthLevel | null; critical: number; highRisk: number; attention: number; healthy: number }
  devices: EndpointHealthScore[]
}

function isClientOs(system: PatchSystemStatus): boolean {
  return system.platform === 'Mac' || (system.platform === 'Windows' && !/windows\s+server/i.test(system.osName ?? ''))
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null
  const ms = Date.now() - new Date(iso).getTime()
  return Number.isFinite(ms) ? ms / 86_400_000 : null
}

export function scoreEndpoint(system: PatchSystemStatus): EndpointHealthScore {
  const factors: EndpointHealthScore['factors'] = []
  const add = (label: string, points: number) => factors.push({ label, points })
  if (!system.scanSucceeded) add('Patch scan has not succeeded', 30)
  const age = daysSince(system.lastSuccessfulScanTime)
  if (age !== null && age > 14) add(`Patch scan is ${Math.floor(age)} days old`, 25)
  else if (age !== null && age > 7) add(`Patch scan is ${Math.floor(age)} days old`, 12)
  if (system.criticalPatchCount) add(`${system.criticalPatchCount} critical patch${system.criticalPatchCount === 1 ? '' : 'es'} missing`, Math.min(45, system.criticalPatchCount * 20))
  if (system.importantPatchCount) add(`${system.importantPatchCount} important patch${system.importantPatchCount === 1 ? '' : 'es'} missing`, Math.min(20, system.importantPatchCount * 6))
  const other = system.missingOsPatches + system.missingThirdPartyPatches + system.missingDriverPatches + system.missingBiosPatches
  if (other && !system.criticalPatchCount && !system.importantPatchCount) add(`${other} non-critical patch${other === 1 ? '' : 'es'} missing`, Math.min(15, other * 2))
  const score = Math.max(0, 100 - factors.reduce((sum, factor) => sum + factor.points, 0))
  const level: EndpointHealthLevel = score < 45 ? 'critical' : score < 65 ? 'high_risk' : score < 85 ? 'attention' : 'healthy'
  return {
    resourceId: system.resourceId,
    detailResourceId: system.detailResourceId,
    deviceName: system.names[0] || system.resourceId,
    platform: system.platform,
    ...(system.osName ? { osName: system.osName } : {}),
    score,
    level,
    factors,
    lastSuccessfulScanTime: system.lastSuccessfulScanTime,
    criticalPatchCount: system.criticalPatchCount,
    missingPatchCount: other,
  }
}

export async function getPatchOperationsDashboard(force = false): Promise<PatchOperationsDashboard> {
  const started = Date.now()
  const generatedAt = new Date().toISOString()
  if (!getManageEngineConfig()) {
    return {
      generatedAt,
      connector: { configured: false, healthy: false, latencyMs: null, message: 'ManageEngine is not configured.', lastRefreshAt: null },
      coverage: { discovered: 0, clientOs: 0, assessed: 0, unscanned: 0, staleScans: 0 },
      health: { score: null, level: null, critical: 0, highRisk: 0, attention: 0, healthy: 0 },
      devices: [],
    }
  }
  try {
    const discovered = await getPatchSystems(force)
    const systems = discovered.filter(isClientOs)
    const devices = systems.map(scoreEndpoint).sort((a, b) => a.score - b.score || b.criticalPatchCount - a.criticalPatchCount)
    const assessed = devices.filter(d => !!d.lastSuccessfulScanTime).length
    const staleScans = devices.filter(d => (daysSince(d.lastSuccessfulScanTime) ?? Infinity) > 7).length
    const score = assessed ? Math.round(devices.reduce((sum, d) => sum + d.score, 0) / devices.length) : null
    const level: EndpointHealthLevel | null = score === null ? null : score < 45 ? 'critical' : score < 65 ? 'high_risk' : score < 85 ? 'attention' : 'healthy'
    return {
      generatedAt,
      connector: { configured: true, healthy: true, latencyMs: Date.now() - started, message: 'Endpoint Central Patch Manager data is current for this refresh.', lastRefreshAt: generatedAt },
      coverage: { discovered: discovered.length, clientOs: systems.length, assessed, unscanned: systems.length - assessed, staleScans },
      health: {
        score, level,
        critical: devices.filter(d => d.level === 'critical').length,
        highRisk: devices.filter(d => d.level === 'high_risk').length,
        attention: devices.filter(d => d.level === 'attention').length,
        healthy: devices.filter(d => d.level === 'healthy').length,
      },
      devices,
    }
  } catch (error) {
    return {
      generatedAt,
      connector: { configured: true, healthy: false, latencyMs: Date.now() - started, message: error instanceof Error ? error.message : 'Endpoint Central Patch Manager request failed.', lastRefreshAt: null },
      coverage: { discovered: 0, clientOs: 0, assessed: 0, unscanned: 0, staleScans: 0 },
      health: { score: null, level: null, critical: 0, highRisk: 0, attention: 0, healthy: 0 },
      devices: [],
    }
  }
}

function baseUrl(): string {
  return (process.env.ENDPOINT_CENTRAL_BASE_URL ?? process.env.ENDPOINT_CENTRAL_PATCH_URL ?? DEFAULT_HOST).replace(/\/$/, '')
}

async function updatePatchManager(path: string, body: Record<string, unknown>): Promise<void> {
  const config = getManageEngineConfig()
  if (!config) throw new Error('ManageEngine is not configured')
  const token = await getAccessToken(config)
  const response = await fetch(`${baseUrl()}${path}`, {
    method: 'POST',
    headers: { Authorization: `Zoho-oauthtoken ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) throw new Error(`Endpoint Central Patch Manager update failed (${response.status}). Verify the PatchMgmt.UPDATE scope and deployment policy.`)
}

export async function scanPatchDevices(resourceIds: string[]): Promise<void> {
  await updatePatchManager('/api/1.4/patch/computers/scan', { resourceids: resourceIds })
}

/** Deploy only explicitly selected patches through a pre-existing Endpoint Central deployment policy. */
export async function deployPatches(input: { patchIds: string[]; resourceIds: string[]; deploymentPolicyTemplateId: string; deadlineTime?: number }): Promise<void> {
  await updatePatchManager('/api/1.4/patch/installpatch?api2', {
    PatchIDs: input.patchIds,
    resourceids: input.resourceIds,
    DeploymentPolicyTemplateID: input.deploymentPolicyTemplateId,
    ...(input.deadlineTime ? { deadlineTime: input.deadlineTime } : {}),
  })
}
