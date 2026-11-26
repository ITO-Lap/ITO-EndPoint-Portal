import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import express from 'express'
import http from 'node:http'
import type { AddressInfo } from 'node:net'

// The routes below used to be open to any signed-in user; the page permission was only enforced in the UI.
// Every handler is stubbed out: these tests only prove who is let in.
vi.mock('../../services/sync/syncEngine.js', async orig => ({ ...(await orig<typeof import('../../services/sync/syncEngine.js')>()), storageKind: () => 'file' as const }))
vi.mock('../../db/index.js', () => ({ testConnection: async () => ({ ok: true, latencyMs: 1, serverVersion: '16' }), configuredConnectionString: () => undefined, activeConnectionString: () => undefined, isDbAvailable: () => false }))
vi.mock('../../store/postgresConfig.js', () => ({ savePostgresConfig: () => undefined, clearPostgresConfig: () => undefined, getPostgresConfig: () => undefined }))

let server: http.Server
let base = ''
beforeAll(async () => {
  const [integrations, reports, scheduled, intelligence, patch, ec] = await Promise.all([
    import('../integrations.js'), import('../reports.js'), import('../scheduledReports.js'),
    import('../intelligence.js'), import('../patch.js'), import('../endpointCentral.js'),
  ])
  const app = express()
  app.use(express.json())
  app.use('/api/integrations', integrations.default)
  app.use('/api/reports', reports.default)
  app.use('/api/scheduled-reports', scheduled.default)
  app.use('/api/intelligence', intelligence.default)
  app.use('/api/patch', patch.default)
  app.use('/api/endpoint-central', ec.default)
  app.use((_e: unknown, _req: express.Request, res: express.Response, _n: express.NextFunction) => { res.status(500).json({ success: false, error: 'handler reached' }) }) // eslint-disable-line @typescript-eslint/no-unused-vars
  server = http.createServer(app)
  await new Promise<void>(r => server.listen(0, r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(() => new Promise<void>(r => server.close(() => r())))

const call = async (method: string, path: string, role: string) =>
  (await fetch(base + path, { method, headers: { 'x-user-role': role, 'Content-Type': 'application/json' }, ...(method === 'GET' ? {} : { body: '{}' }) })).status

// Helpdesk lacks these pages by default (see rolePermissions.ts), IT Admin has every page.
const HELPDESK_BLOCKED: Array<[string, string]> = [
  ['POST', '/api/integrations/intune/credentials'],
  ['POST', '/api/integrations/intune/sync'],
  ['DELETE', '/api/integrations/postgres/credentials'],
  ['GET', '/api/integrations/intune/debug'],
  ['GET', '/api/scheduled-reports'],
  ['POST', '/api/scheduled-reports'],
  ['DELETE', '/api/scheduled-reports/x'],
  ['POST', '/api/scheduled-reports/x/run'],
  ['GET', '/api/intelligence/risk-scores'],
  ['GET', '/api/intelligence/policies'],
  ['GET', '/api/intelligence/devices'],
]

describe('read and write routes enforce the page permission on the server', () => {
  it.each(HELPDESK_BLOCKED)('refuses Helpdesk: %s %s', async (method, path) => {
    expect(await call(method, path, 'Helpdesk')).toBe(403)
  })

  it('refuses an unknown or empty role everywhere', async () => {
    for (const [method, path] of HELPDESK_BLOCKED) expect(await call(method, path, 'End User')).toBe(403)
  })

  it('lets Global Admin through to the handler (not a 403)', async () => {
    for (const [method, path] of HELPDESK_BLOCKED) expect(await call(method, path, 'Global Admin')).not.toBe(403)
  })

  it('shared endpoints admit any role that has one of the owning pages, and only those', async () => {
    // Helpdesk has Patch Operations and Security Posture by default, so shared patch reads stay available to it.
    expect(await call('GET', '/api/endpoint-central/devices/1/missing-patches', 'Helpdesk')).not.toBe(403)
    expect(await call('GET', '/api/endpoint-central/devices/1/missing-patches', 'End User')).toBe(403)
    expect(await call('GET', '/api/patch/systems', 'End User')).toBe(403)
    // Reports are shared by Reports & Analytics, Managed Devices and Mac Fleet Reports; Helpdesk has the last two.
    expect(await call('GET', '/api/reports', 'Helpdesk')).not.toBe(403)
    expect(await call('GET', '/api/reports', 'End User')).toBe(403)
    expect(await call('GET', '/api/integrations/manageengine/apps', 'Helpdesk')).not.toBe(403) // App Guardian is a Helpdesk page
    expect(await call('GET', '/api/integrations/manageengine/apps', 'End User')).toBe(403)
  })

  it('keeps the aggregate dashboard endpoints open to any signed-in user', async () => {
    expect(await call('GET', '/api/integrations/status', 'End User')).toBe(200)
    expect(await call('GET', '/api/patch/priority-summary', 'End User')).not.toBe(403)
  })
})

describe('automation writes and Slack actions', () => {
  it('need the owning page, so Helpdesk (which has neither) is refused and Global Admin is not', async () => {
    const [auto, slack] = await Promise.all([import('../automations.js'), import('../slack.js')])
    const app = express(); app.use(express.json()); app.use('/api/automations', auto.default); app.use('/api/slack', slack.default)
    app.use((_e: unknown, _r: express.Request, res: express.Response, _n: express.NextFunction) => { res.status(500).json({ success: false }) }) // eslint-disable-line @typescript-eslint/no-unused-vars
    const s = http.createServer(app); await new Promise<void>(r => s.listen(0, r))
    const b = `http://127.0.0.1:${(s.address() as AddressInfo).port}`
    const status = async (m: string, path: string, role: string) => (await fetch(b + path, { method: m, headers: { 'x-user-role': role, 'Content-Type': 'application/json' }, ...(m === 'GET' ? {} : { body: '{}' }) })).status
    try {
      for (const [m, path] of [['POST', '/api/automations'], ['DELETE', '/api/automations/x'], ['POST', '/api/automations/scan'], ['POST', '/api/slack/test'], ['POST', '/api/slack/reconnect']] as const) {
        expect(await status(m, path, 'Helpdesk'), `${m} ${path}`).toBe(403)
        expect(await status(m, path, 'Global Admin'), `${m} ${path}`).not.toBe(403)
      }
      expect(await status('GET', '/api/automations', 'Helpdesk')).not.toBe(403) // reads stay open: the dashboard shows automation counts
    } finally { await new Promise<void>(r => s.close(() => r())) }
  })
})

describe('security findings history API', () => {
  it('needs the Security Posture page, validates its filters, and returns counts with the history', async () => {
    const [posture, backend] = await Promise.all([import('../securityPosture.js'), import('../../services/sync/backend.js')])
    await backend.getBackend().recordFindings(1, [
      { pillar: 'encryption', deviceId: 'a', deviceName: 'PC-A', platform: 'Windows', source: 'Microsoft Intune', detail: 'BitLocker off' },
      { pillar: 'patching', deviceId: 'a', deviceName: 'PC-A', platform: 'Windows', source: 'Microsoft Intune', detail: '2 critical patches missing' },
    ], ['encryption', 'patching'])
    await backend.getBackend().recordFindings(2, [{ pillar: 'patching', deviceId: 'a', deviceName: 'PC-A', platform: 'Windows', source: 'Microsoft Intune', detail: '2 critical patches missing' }], ['encryption', 'patching'])
    const app = express(); app.use('/api/security-posture', posture.default)
    const s = http.createServer(app); await new Promise<void>(r => s.listen(0, r))
    const b = `http://127.0.0.1:${(s.address() as AddressInfo).port}/api/security-posture/findings`
    const get = (q: string, role: string) => fetch(b + q, { headers: { 'x-user-role': role } })
    try {
      expect((await get('', 'End User')).status).toBe(403)
      const ok = await get('', 'Helpdesk')
      expect(ok.status).toBe(200)
      const body = await ok.json() as { data: { counts: { open: number; resolved: number }; findings: Array<{ pillar: string; status: string; firstSeenAt: string }> } }
      expect(body.data.counts).toEqual({ open: 1, resolved: 1 })
      expect(body.data.findings.map(f => `${f.pillar}:${f.status}`).sort()).toEqual(['encryption:resolved', 'patching:open'])
      const filtered = await (await get('?status=resolved&pillar=encryption', 'Global Admin')).json() as { data: { findings: unknown[] } }
      expect(filtered.data.findings).toHaveLength(1)
      const junk = await (await get('?status=bogus&pillar=nope&limit=-5', 'Global Admin')).json() as { data: { findings: unknown[] } }
      expect(junk.data.findings).toHaveLength(2) // unknown filters are ignored, not trusted
    } finally { await new Promise<void>(r => s.close(() => r())) }
  })
})
