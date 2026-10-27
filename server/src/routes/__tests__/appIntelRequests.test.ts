import { describe, it, expect, vi } from 'vitest'
import express from 'express'
import http from 'node:http'
import type { AddressInfo } from 'net'
import { createAppIntelRouter } from '../appIntel.js'
import { createAppIntelService } from '../../services/appIntel/service.js'
import { createCveStore } from '../../services/appIntel/cve.js'
import { createRequestService, createFileRequestStore, buildRequestContent, priorityFor, eligibility } from '../../services/appIntel/requests.js'
import type { RequestDeps } from '../../services/appIntel/requests.js'
import { errorHandler } from '../../middleware/errorHandler.js'
import type { AppIntelProviders } from '../../services/appIntel/providers.js'
import type { AssessedApp } from '../../services/appIntel/types.js'

const NOW = Date.parse('2026-10-20T06:00:00Z')
const iso = new Date(NOW).toISOString()
const latest = { ok: true as const, value: { version: '6.1.0', versionSource: 'Homebrew cask API (zoom)', sourceUrl: 'https://formulae.brew.sh/api/cask/zoom.json', lastCheckedAt: iso, selfUpdating: false } }

function providers(): AppIntelProviders {
  return {
    intuneConfigured: () => true, manageEngineConfigured: () => true,
    fetchIntuneDetected: async () => [], fetchIntuneMobileApps: async () => [],
    fetchManageEngineApps: async () => [
      { appId: 'us.zoom.xos', name: 'zoom.us <!channel> *bold*', platform: 'macOS', logs: [{ deviceId: '1', deviceName: 'Mac-1', version: '5.0.0' }, { deviceId: '2', deviceName: 'Mac-2', version: '5.0.0' }] },
      { appId: 'com.google.Chrome', name: 'Google Chrome', platform: 'macOS', logs: [{ deviceId: '3', deviceName: 'Mac-3', version: '6.1.0' }] },
    ],
    fetchIntuneDevicesForDetectedApp: async () => [], fetchIntuneAssignments: async () => [],
    probeIntune: async () => ({ detectedApps: { ok: true }, appCatalog: { ok: true } }),
  }
}

interface Harness { base: string; close: () => void; deps: { createIssue: ReturnType<typeof vi.fn>; sendSlack: ReturnType<typeof vi.fn> }; zoomKey: string; chromeKey: string }

async function start(over: Partial<RequestDeps> = {}): Promise<Harness> {
  const service = createAppIntelService({
    providers: providers(), now: () => NOW,
    latest: { brew: async () => latest, winget: async () => latest },
    endpointCentral: async () => ({ state: 'scope_missing', message: 'MDM-only' }), packagers: () => ({ windows: false, macOS: false }),
  })
  await service.startSync()
  const createIssue = vi.fn(async () => ({ key: 'ITO-42', url: 'https://jira.example/browse/ITO-42' }))
  const sendSlack = vi.fn(async () => ({ ok: true }))
  const requests = createRequestService({
    store: createFileRequestStore(null), now: () => NOW, jiraConfigured: () => true, createIssue,
    slackConfig: () => ({ botToken: 'xoxb-secret' }), slackChannelId: () => 'C123', sendSlack, ...over,
  })
  const cve = createCveStore({ cacheFile: null, fetchImpl: (async () => new Response(JSON.stringify({ totalResults: 0, vulnerabilities: [] }), { status: 200 })) as unknown as typeof fetch, sleep: async () => {}, now: () => NOW })
  const apps = service.getSnapshot()!.apps
  const app = express(); app.use(express.json()); app.use('/api/app-intel', createAppIntelRouter(() => service, () => NOW, { cve: () => cve, requests: () => requests })); app.use(errorHandler)
  const server = app.listen(0); await new Promise<void>(r => server.once('listening', r))
  return {
    base: `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/app-intel`, close: () => server.close(), deps: { createIssue, sendSlack },
    zoomKey: apps.find(a => a.identity.bundleId === 'us.zoom.xos')!.key, chromeKey: apps.find(a => a.identity.bundleId === 'com.google.Chrome')!.key,
  }
}

interface Reply { success?: boolean; error?: string; code?: string; existing?: unknown; data?: any }
function call(url: string, method = 'GET', role: string | null = 'IT Admin', body?: unknown): Promise<{ status: number; json: Reply | null }> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = { 'x-user-email': 'avinash@zinnia.com', ...(role ? { 'x-user-role': role } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }
    const req = http.request(url, { method, headers }, res => {
      let b = ''; res.on('data', c => { b += c }); res.on('end', () => { let json: Reply | null = null; try { json = b ? JSON.parse(b) : null } catch { /* */ } resolve({ status: res.statusCode ?? 0, json }) })
    })
    req.on('error', reject); if (body) req.write(JSON.stringify(body)); req.end()
  })
}

describe('lifecycle on the list and detail endpoints', () => {
  it('adds owner, ring, packaging, impact and CVE state to rows, and the full lifecycle to the detail', async () => {
    const h = await start()
    const rows = (await call(`${h.base}/apps?platform=macOS`)).json!.data.rows as Array<Record<string, unknown>>
    const zoom = rows.find(r => String(r.app).startsWith('zoom'))!
    expect(zoom).toMatchObject({ owner: null, ring: null, packagingState: 'no-package', impactPercent: 100, request: null })
    expect(zoom.cve).toMatchObject({ state: 'unmapped', total: 0 })
    const detail = (await call(`${h.base}/apps/detail?key=${encodeURIComponent(h.zoomKey)}`)).json!.data
    expect(detail.lifecycle).toMatchObject({ owner: { name: null }, impact: { devicesBehind: 2, totalDevices: 2 }, packaging: { state: 'no-package' } })
    expect(detail.cve.state).toBe('unmapped')
    h.close()
  })
})

describe('create packaging request / Slack notification', () => {
  it('previews the exact server-built content and destination without sending anything', async () => {
    const h = await start()
    const p = (await call(`${h.base}/requests/preview?key=${encodeURIComponent(h.zoomKey)}&kind=jira`, 'GET', 'Helpdesk')).json!.data
    expect(p).toMatchObject({ eligible: true, configured: true, destination: 'Jira (new Task)', duplicate: null })
    expect(p.content.title).toBe('[App update] zoom.us <!channel> *bold* (macOS) → 6.1.0')
    expect(p.content.body).toMatch(/Estimated impacted devices: 2 of 2 \(100%\)/)
    expect(p.content.body).toMatch(/Nothing has been packaged, published or deployed/)
    expect(h.deps.createIssue).not.toHaveBeenCalled()
    h.close()
  })

  it('creates a Jira task from the snapshot (not client text), records it, and refuses a duplicate', async () => {
    const h = await start()
    const first = await call(`${h.base}/requests`, 'POST', 'IT Admin', { key: h.zoomKey, kind: 'jira', title: 'client text must be ignored', body: 'ignored' })
    expect(first.status).toBe(201)
    expect(first.json!.data).toMatchObject({ kind: 'jira', externalKey: 'ITO-42', createdBy: 'avinash@zinnia.com', targetVersion: '6.1.0' })
    const sent = h.deps.createIssue.mock.calls[0]![0] as { summary: string; description: string; issueType: string; priority: string }
    expect(sent.summary).not.toMatch(/client text/)
    expect(sent).toMatchObject({ issueType: 'Task', priority: 'Medium' })
    const again = await call(`${h.base}/requests`, 'POST', 'IT Admin', { key: h.zoomKey, kind: 'jira' })
    expect(again.status).toBe(409)
    expect(again.json).toMatchObject({ code: 'duplicate', existing: { externalKey: 'ITO-42' } })
    expect(h.deps.createIssue).toHaveBeenCalledTimes(1)
    const row = ((await call(`${h.base}/apps?platform=macOS`)).json!.data.rows as Array<{ app: string; request: unknown }>).find(r => r.app.startsWith('zoom'))!
    expect(row.request).toMatchObject({ jiraKey: 'ITO-42', jiraUrl: 'https://jira.example/browse/ITO-42' })
    h.close()
  })

  it('posts a sanitised Slack message to the configured channel and rate-limits repeats', async () => {
    const h = await start()
    const r = await call(`${h.base}/requests`, 'POST', 'Global Admin', { key: h.zoomKey, kind: 'slack' })
    expect(r.status).toBe(201)
    const [cfg, channel, text] = h.deps.sendSlack.mock.calls[0]! as [unknown, string, string]
    expect(channel).toBe('C123')
    expect(text).toContain('zoom.us &lt;!channel&gt; *bold*') // cannot mention @channel through an inventory name
    expect(text).not.toContain('<!channel>')
    expect(JSON.stringify(text)).not.toContain('xoxb')
    expect(cfg).toBeTruthy()
    expect((await call(`${h.base}/requests`, 'POST', 'IT Admin', { key: h.zoomKey, kind: 'slack' })).status).toBe(409)
    h.close()
  })

  it('is admin-only and validates the app, the kind and eligibility', async () => {
    const h = await start()
    expect((await call(`${h.base}/requests`, 'POST', 'Helpdesk', { key: h.zoomKey, kind: 'jira' })).status).toBe(403)
    expect((await call(`${h.base}/requests`, 'POST', null, { key: h.zoomKey, kind: 'jira' })).status).toBe(403)
    expect((await call(`${h.base}/requests`, 'POST', 'IT Admin', { key: h.zoomKey, kind: 'email' })).status).toBe(400)
    expect((await call(`${h.base}/requests`, 'POST', 'IT Admin', { key: 'nope', kind: 'jira' })).status).toBe(404)
    const upToDate = await call(`${h.base}/requests`, 'POST', 'IT Admin', { key: h.chromeKey, kind: 'jira' })
    expect(upToDate.status).toBe(400)
    expect(upToDate.json).toMatchObject({ code: 'not_eligible' })
    expect(h.deps.createIssue).not.toHaveBeenCalled()
    expect(h.deps.sendSlack).not.toHaveBeenCalled()
    h.close()
  })

  it('reports an unconfigured destination and a failed delivery without recording a request', async () => {
    const off = await start({ jiraConfigured: () => false, slackConfig: () => undefined })
    expect((await call(`${off.base}/requests`, 'POST', 'IT Admin', { key: off.zoomKey, kind: 'jira' })).json).toMatchObject({ code: 'not_configured' })
    expect((await call(`${off.base}/requests`, 'POST', 'IT Admin', { key: off.zoomKey, kind: 'slack' })).status).toBe(409)
    expect((await call(`${off.base}/requests/preview?key=${encodeURIComponent(off.zoomKey)}&kind=slack`)).json!.data).toMatchObject({ configured: false })
    off.close()

    const failing = await start({ createIssue: vi.fn(async () => { throw new Error('Jira API error 400: bad field') }) })
    const r = await call(`${failing.base}/requests`, 'POST', 'IT Admin', { key: failing.zoomKey, kind: 'jira' })
    expect(r.status).toBe(502)
    expect(r.json).toMatchObject({ code: 'delivery_failed' })
    const row = ((await call(`${failing.base}/apps?platform=macOS`)).json!.data.rows as Array<{ app: string; request: unknown }>).find(x => x.app.startsWith('zoom'))!
    expect(row.request).toBeNull() // a failed send is not recorded as a request
    // a retry is allowed because nothing was recorded
    expect((await call(`${failing.base}/requests`, 'POST', 'IT Admin', { key: failing.zoomKey, kind: 'jira' })).status).toBe(502)
    failing.close()
  })
})

describe('request content', () => {
  const app = (over: Partial<AssessedApp> = {}): AssessedApp => ({
    key: 'k', platform: 'windows', identity: { publisher: 'VideoLAN', displayName: 'VLC', bundleId: null, productCode: null, wingetId: 'VideoLAN.VLC', brewToken: null },
    installed: [{ version: '3.0.16', deviceCount: 5, provider: 'intune' }], packages: [], confidence: 'high', confidenceReason: '', providers: ['intune'], nativeHint: null, nativeReason: null,
    installSource: 'manual', installSourceBasis: 'none', installSourceReason: '', status: 'Package required', reason: 'r', action: 'a', deployedPackageVersion: null,
    latest: { version: '3.0.21', versionSource: 'winget', sourceUrl: 'https://x.test', lastCheckedAt: iso, selfUpdating: false }, latestUnavailable: null, affectedDevices: 5,
    evidence: [], dataGaps: [], totalDevices: 5, detectedVersion: ['3.0.16'], lastCheckedAt: iso, ...over,
  })
  const cve = (counts: Partial<{ knownExploited: number; critical: number; high: number }>) => ({ state: 'ok', counts: { total: 1, critical: 0, high: 0, medium: 0, low: 0, knownExploited: 0, ...counts }, cves: [], reason: null }) as never

  it('raises priority from known-exploited and severe CVEs, and says why', () => {
    expect(priorityFor(cve({ knownExploited: 1 })).priority).toBe('Critical')
    expect(priorityFor(cve({ critical: 1 })).priority).toBe('High')
    expect(priorityFor(cve({})).priority).toBe('Medium')
    expect(buildRequestContent(app(), cve({ knownExploited: 2 }), 'a@z.com', iso).body).toMatch(/Priority: Critical — 2 known-exploited/)
  })
  it('only allows requests for a confirmed mismatch in an actionable state', () => {
    expect(eligibility(app(), 'jira')).toEqual({ ok: true })
    expect(eligibility(app({ status: 'Native update' }), 'jira').ok).toBe(false)
    expect(eligibility(app({ status: 'Native update' }), 'slack')).toEqual({ ok: true })
    expect(eligibility(app({ latest: null }), 'slack').ok).toBe(false)
    expect(eligibility(app({ affectedDevices: 0 }), 'slack').ok).toBe(false)
  })
  it('strips control characters and bounds device-reported strings', () => {
    const body = buildRequestContent(app({ identity: { publisher: null, displayName: 'Bad\u0007App\nINJECT: x', bundleId: null, productCode: null, wingetId: null, brewToken: null } }), cve({}), 'a@z.com', iso).body
    expect(body).toContain('Application: Bad App INJECT: x (Windows)')
  })
})
