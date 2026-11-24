import type { ProviderCapabilities, DeviceState, RemoteJob, TargetDevice } from '../types.js'
import type { DispatchContext, DispatchOutcome, PollUpdate, RemoteExecutionProvider } from './types.js'
import { getIntuneConfig } from '../../store/integrationStore.js'
import { getGraphAccessToken, graphRolesFromToken } from '../../services/graphApi.js'

// Intune script execution via Microsoft Graph (beta):
//   Windows PowerShell → deviceManagementScripts          (+ /assign, /deviceRunStates)
//   macOS shell        → deviceShellScripts               (+ /assign, /deviceRunStates)
// Intune assigns scripts to GROUPS, so each job gets a short-lived security group containing exactly its devices.
// Intune reports per-device run state and a (size-limited) result message when the device next checks in. It does not
// stream output and offers no progress percentage. This provider reports exactly that and nothing more.
//
// NOT verified against a live tenant in this repository. It is disabled unless the app registration's granted
// application roles prove every required permission (checked from the real token, not assumed).

const BETA = 'https://graph.microsoft.com/beta'
const V1 = 'https://graph.microsoft.com/v1.0'

const SCRIPT_WRITE = ['DeviceManagementScripts.ReadWrite.All', 'DeviceManagementConfiguration.ReadWrite.All']
const GROUP_WRITE = ['Group.ReadWrite.All']
const DEVICE_READ = ['Device.Read.All', 'Directory.Read.All', 'Device.ReadWrite.All', 'Directory.ReadWrite.All']

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>

export function missingRoles(granted: string[]): string[] {
  const has = (opts: string[]) => opts.some(o => granted.includes(o))
  const missing: string[] = []
  if (!has(SCRIPT_WRITE)) missing.push(SCRIPT_WRITE[0]!)
  if (!has(GROUP_WRITE)) missing.push(GROUP_WRITE[0]!)
  if (!has(DEVICE_READ)) missing.push(DEVICE_READ[0]!)
  return missing
}

export function mapRunState(runState: string | undefined): { state: DeviceState; providerState: string } {
  const s = runState ?? 'unknown'
  switch (s) {
    case 'success': return { state: 'succeeded', providerState: s }
    case 'fail': case 'scriptError': return { state: 'failed', providerState: s }
    case 'notApplicable': return { state: 'skipped', providerState: s }
    case 'pending': return { state: 'waiting_online', providerState: s }
    default: return { state: 'sent', providerState: s }
  }
}

export class IntuneExecutionProvider implements RemoteExecutionProvider {
  readonly id = 'intune' as const
  constructor(private readonly fetchImpl: FetchLike = fetch, private readonly tokenFn?: () => Promise<string>) {}

  private async token(): Promise<string> {
    if (this.tokenFn) return this.tokenFn()
    const cfg = getIntuneConfig()
    if (!cfg) throw new Error('Intune is not configured.')
    return getGraphAccessToken({ tenantId: cfg.tenantId, clientId: cfg.clientId, clientSecret: cfg.clientSecret })
  }

  async capabilities(): Promise<ProviderCapabilities> {
    const base = {
      id: this.id, label: 'Microsoft Intune',
      supports: { powershell: true, shell: true, runAsSystem: true, runAsUser: true, perDeviceStatus: true, scriptOutput: true, liveStreaming: false, cancel: true, runWhenOnline: true, scheduling: true },
      notes: [
        'Intune runs a script when the device next checks in (typically within hours, not instantly) and reports a per-device state plus a short result message.',
        'No live output streaming and no progress percentage: only the states Intune reports are shown.',
        'Cancel removes the assignment; devices that already received the script keep running it.',
        'Scheduled jobs are held by this application and sent to Intune at the scheduled time.',
      ],
    }
    if (!this.tokenFn && !getIntuneConfig()) return { ...base, enabled: false, reasons: ['Intune is not configured.'] }
    try {
      const missing = missingRoles(graphRolesFromToken(await this.token()))
      if (missing.length) return { ...base, enabled: false, reasons: [`The Intune app registration is missing Graph application permissions: ${missing.join(', ')} (admin consent required).`] }
      return { ...base, enabled: true, reasons: [] }
    } catch (e) {
      return { ...base, enabled: false, reasons: [`Could not read the app registration's permissions: ${e instanceof Error ? e.message : 'unknown error'}`] }
    }
  }

  private async call<T>(method: string, url: string, body?: unknown, attempts = 4): Promise<T> {
    const token = await this.token()
    for (let attempt = 1; ; attempt++) {
      const res = await this.fetchImpl(url, {
        method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      })
      if ((res.status === 429 || res.status === 503) && attempt < attempts) {
        const ra = Number(res.headers.get('retry-after'))
        await new Promise(r => setTimeout(r, Math.min(Number.isFinite(ra) && ra > 0 ? ra * 1000 : 1000 * 2 ** (attempt - 1), 30_000)))
        continue
      }
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw Object.assign(new Error(`Microsoft Graph ${res.status} on ${method} ${url.replace(/^https:\/\/graph\.microsoft\.com\/(?:beta|v1\.0)/, '')}: ${text.slice(0, 200)}`), { status: res.status })
      }
      return (res.status === 204 ? undefined : await res.json().catch(() => undefined)) as T
    }
  }

  private async directoryObjectId(d: TargetDevice): Promise<string | null> {
    if (!d.azureAdDeviceId) return null
    const r = await this.call<{ value?: Array<{ id: string }> }>('GET', `${V1}/devices?$filter=${encodeURIComponent(`deviceId eq '${d.azureAdDeviceId.replace(/'/g, "''")}'`)}&$select=id`)
    return r.value?.[0]?.id ?? null
  }

  async dispatch(ctx: DispatchContext): Promise<DispatchOutcome> {
    const { job, script, devices } = ctx
    const results: DispatchOutcome['devices'] = []
    const memberIds: string[] = []
    for (const d of devices) {
      try {
        const oid = await this.directoryObjectId(d)
        if (!oid) { results.push({ deviceId: d.id, accepted: false, error: 'Device was not found in Entra ID, so Intune cannot target it.' }); continue }
        memberIds.push(oid); results.push({ deviceId: d.id, accepted: true, providerRef: oid, state: 'sent' })
      } catch (e) { results.push({ deviceId: d.id, accepted: false, error: e instanceof Error ? e.message : 'Lookup failed' }) }
    }
    if (memberIds.length === 0) return { providerContext: {}, devices: results }

    const nick = `ito-ra-${job.id.replace(/-/g, '').slice(0, 12)}`
    const group = await this.call<{ id: string }>('POST', `${V1}/groups`, { displayName: `ITO Remote Action ${job.id.slice(0, 8)}`, description: 'Temporary group created by ITO Remote Action Center. Safe to delete after the job finishes.', mailEnabled: false, mailNickname: nick, securityEnabled: true })
    for (const oid of memberIds) await this.call('POST', `${V1}/groups/${group.id}/members/$ref`, { '@odata.id': `${V1}/directoryObjects/${oid}` })

    const isWin = script.language === 'powershell'
    const collection = isWin ? 'deviceManagementScripts' : 'deviceShellScripts'
    const fileName = `${script.name.replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 60) || 'script'}.${isWin ? 'ps1' : 'sh'}`
    const created = await this.call<{ id: string }>('POST', `${BETA}/deviceManagement/${collection}`, {
      displayName: `ITO RA ${job.id.slice(0, 8)} — ${script.name}`.slice(0, 100),
      description: `Created by ITO Remote Action Center for job ${job.id}`,
      scriptContent: Buffer.from(script.content, 'utf8').toString('base64'),
      runAsAccount: job.runAs === 'user' ? 'user' : 'system',
      fileName,
      ...(isWin ? { enforceSignatureCheck: false, runAs32Bit: false } : { retryCount: 3, blockExecutionNotifications: true }),
    })
    await this.call('POST', `${BETA}/deviceManagement/${collection}/${created.id}/assign`, {
      deviceManagementScriptAssignments: [{ target: { '@odata.type': '#microsoft.graph.groupAssignmentTarget', groupId: group.id } }],
    })
    return { providerContext: { collection, scriptId: created.id, groupId: group.id }, devices: results }
  }

  async poll(job: RemoteJob): Promise<PollUpdate[]> {
    const { collection, scriptId } = job.providerContext ?? {}
    if (!collection || !scriptId) return []
    const out: PollUpdate[] = []
    let url: string | null = `${BETA}/deviceManagement/${collection}/${scriptId}/deviceRunStates?$expand=managedDevice($select=id)&$top=100`
    for (let pages = 0; url && pages < 20; pages++) {
      const r: { value?: Array<{ runState?: string; resultMessage?: string; errorCode?: number; errorDescription?: string; managedDevice?: { id?: string } }>; '@odata.nextLink'?: string } = await this.call('GET', url)
      for (const s of r.value ?? []) {
        const deviceId = s.managedDevice?.id
        if (!deviceId) continue
        const m = mapRunState(s.runState)
        out.push({
          deviceId, state: m.state, providerState: m.providerState,
          ...(s.resultMessage ? { output: s.resultMessage } : {}),
          ...(m.state === 'failed' ? { error: s.errorDescription || `Intune reported "${m.providerState}"${s.errorCode ? ` (code ${s.errorCode})` : ''}`, exitCode: s.errorCode ?? null } : m.state === 'succeeded' ? { exitCode: 0 } : {}),
        })
      }
      url = r['@odata.nextLink'] ?? null
    }
    return out
  }

  async cancel(job: RemoteJob): Promise<void> {
    const { collection, scriptId, groupId } = job.providerContext ?? {}
    if (collection && scriptId) await this.call('POST', `${BETA}/deviceManagement/${collection}/${scriptId}/assign`, { deviceManagementScriptAssignments: [] })
    if (groupId) await this.call('DELETE', `${V1}/groups/${groupId}`).catch(() => undefined)
  }

  async cleanup(job: RemoteJob): Promise<void> {
    const { groupId } = job.providerContext ?? {}
    if (groupId) await this.call('DELETE', `${V1}/groups/${groupId}`).catch(() => undefined)
  }
}
