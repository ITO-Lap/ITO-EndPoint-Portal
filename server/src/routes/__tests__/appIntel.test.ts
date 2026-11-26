import { describe, it, expect, vi } from 'vitest'
import express from 'express'
import http from 'node:http'
import type { AddressInfo } from 'net'
import { createAppIntelRouter } from '../appIntel.js'
import { createAppIntelService } from '../../services/appIntel/service.js'
import { errorHandler } from '../../middleware/errorHandler.js'
import type { AppIntelProviders } from '../../services/appIntel/providers.js'
import type { Json } from '../../test/json.js'

const NOW = Date.parse('2026-10-12T10:00:00Z')
const latest = { ok: true as const, value: { version: '6.1.0', versionSource: 'Homebrew cask API (zoom)', sourceUrl: 'u', lastCheckedAt: new Date(NOW).toISOString(), selfUpdating: false } }

function providers(over: Partial<AppIntelProviders> = {}): AppIntelProviders {
  return {
    intuneConfigured: () => true, manageEngineConfigured: () => true,
    fetchIntuneDetected: async () => [], fetchIntuneMobileApps: async () => [],
    fetchManageEngineApps: async () => [
      { appId: 'us.zoom.xos', name: 'zoom.us', platform: 'macOS', logs: [{ deviceId: '1', deviceName: 'Mac-1', version: '5.0.0' }] },
      { appId: 'com.acme.tool', name: 'Acme', platform: 'macOS', logs: [{ deviceId: '2', deviceName: 'Mac-2', version: '1.0' }] },
      { appId: 'com.apple.Safari', name: 'Safari', platform: 'macOS', logs: [{ deviceId: '3', deviceName: 'Mac-3', version: '17.0' }] },
    ],
    fetchIntuneDevicesForDetectedApp: async () => [], fetchIntuneAssignments: async () => [],
    probeIntune: async () => ({ detectedApps: { ok: true }, appCatalog: { ok: true } }), ...over,
  }
}

async function start(p: AppIntelProviders = providers()) {
  const service = createAppIntelService({
    providers: p, now: () => NOW, latest: { brew: async () => latest, winget: async () => latest },
    endpointCentral: async () => ({ state: 'scope_missing', message: 'MDM-only' }), packagers: () => ({ windows: false, macOS: false }),
  })
  await service.startSync()
  const app = express(); app.use('/api/app-intel', createAppIntelRouter(() => service, () => NOW)); app.use(errorHandler)
  const server = app.listen(0); await new Promise<void>(r => server.once('listening', r))
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/app-intel`
  return { server, base, service }
}

function call(url: string, method = 'GET', role: string | null = 'IT Admin'): Promise<{ status: number; text: string; json: Json }> {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method, headers: role ? { 'x-user-role': role } : {} }, res => {
      let b = ''; res.on('data', c => { b += c }); res.on('end', () => { let json: Json = null; try { json = b ? JSON.parse(b) : null } catch { /* non-JSON (e.g. 404 HTML) */ } resolve({ status: res.statusCode ?? 0, text: b, json }) })
    })
    req.on('error', reject); req.end()
  })
}

describe('app-intel route', () => {
  it('requires a permitted role', async () => {
    const { server, base } = await start()
    expect((await call(`${base}/summary?platform=macOS`, 'GET', null)).status).toBe(403)
    expect((await call(`${base}/summary?platform=macOS`, 'GET', 'End User')).status).toBe(403)
    expect((await call(`${base}/summary?platform=macOS`, 'GET', 'Helpdesk')).status).toBe(200)
    server.close()
  })

  it('validates platform and filter values', async () => {
    const { server, base } = await start()
    expect((await call(`${base}/apps`)).status).toBe(400)
    expect((await call(`${base}/apps?platform=linux`)).status).toBe(400)
    expect((await call(`${base}/apps?platform=macOS&status=Bogus`)).status).toBe(400)
    expect((await call(`${base}/apps?platform=macOS&sortKey=nope`)).status).toBe(400)
    expect((await call(`${base}/apps?platform=macOS&installSource=native`)).status).toBe(400)
    server.close()
  })

  it('lists apps with the spec columns, filters, sorts and pages', async () => {
    const { server, base } = await start()
    const all = (await call(`${base}/apps?platform=macOS`)).json.data
    expect(all.total).toBe(2)
    expect(all.rows[0]).toMatchObject({ app: 'zoom.us', status: 'Package required', latestVerifiedVersion: '6.1.0', deployedPackageVersion: null, affectedDevices: 1, providers: ['manageengine-mdm'], latestSource: 'Homebrew cask API (zoom)', confidence: 'high' })
    expect(Object.keys(all.rows[0])).toEqual(expect.arrayContaining(['app', 'publisher', 'platform', 'installedVersions', 'affectedDevices', 'deployedPackageVersion', 'latestVerifiedVersion', 'status', 'action', 'providers', 'lastChecked']))
    expect((await call(`${base}/apps?platform=macOS&status=Data%20unavailable`)).json.data.rows.map((r: Json) => r.app)).toEqual(['Acme'])
    expect((await call(`${base}/apps?platform=macOS&q=zoom`)).json.data.total).toBe(1)
    expect((await call(`${base}/apps?platform=macOS&pageSize=1&page=2&sortKey=app&sortDir=asc`)).json.data.rows[0].app).toBe('zoom.us')
    expect((await call(`${base}/apps?platform=windows`)).json.data.total).toBe(0)
    server.close()
  })

  it('native apps never appear, and every row carries its install source', async () => {
    const { server, base } = await start()
    const rows = (await call(`${base}/apps?platform=macOS`)).json.data.rows
    expect(rows.map((r: Json) => r.app)).not.toContain('Safari')
    expect(rows.every((r: Json) => ['custom', 'self-service', 'manual'].includes(r.installSource))).toBe(true)
    expect(rows[0]).toMatchObject({ installSource: 'manual', installSourceBasis: 'none' })
    expect((await call(`${base}/apps?platform=macOS&installSource=manual`)).json.data.total).toBe(2)
    expect((await call(`${base}/apps?platform=macOS&installSource=self-service`)).json.data.total).toBe(0)
    expect((await call(`${base}/status`)).json.data.excludedNative).toEqual({ windows: 0, macOS: 1 })
    server.close()
  })

  it('updateAvailable=1 returns only apps with a confirmed newer version and the summary explains the count', async () => {
    const { server, base } = await start()
    const rows = (await call(`${base}/apps?platform=macOS&updateAvailable=1`)).json.data.rows
    expect(rows.map((r: Json) => r.app)).toEqual(['zoom.us'])
    const s = (await call(`${base}/summary?platform=macOS`)).json.data.summary
    expect(s.updateAvailable).toBe(1)
    expect(s.updateBreakdown).toMatchObject({ needsPackaging: 1, devicesBehind: 1 })
    expect((await call(`${base}/apps?platform=macOS&updateAvailable=0`)).json.data.total).toBe(2) // anything but "1" means no filter
    server.close()
  })

  it('summary cards', async () => {
    const { server, base } = await start()
    const s = (await call(`${base}/summary?platform=macOS`)).json.data.summary
    expect(s).toMatchObject({ appsDiscovered: 2, packageRequired: 1, reviewRequired: 0, updateAvailable: 1 })
    server.close()
  })

  it('detail returns evidence, devices and a build-only packaging hand-off for Package required', async () => {
    const { server, base } = await start()
    const key = encodeURIComponent('mdm|macOS|us.zoom.xos')
    const d = (await call(`${base}/apps/detail?key=${key}`)).json.data
    expect(d.app.status).toBe('Package required')
    expect(d.app.evidence.map((e: Json) => e.label)).toEqual(expect.arrayContaining(['Detected versions', 'Latest verified version', 'Comparison']))
    expect(d.devices).toEqual([{ name: 'Mac-1', user: null, version: '5.0.0', provider: 'manageengine-mdm' }])
    expect(d.packagingIntent).toMatchObject({ sourceKind: 'homebrew', sourceId: 'zoom', targetVersion: '6.1.0', allowedActions: ['build-package'] })
    const noIntent = (await call(`${base}/apps/detail?key=${encodeURIComponent('mdm|macOS|com.acme.tool')}`)).json.data
    expect(noIntent.packagingIntent).toBeNull()
    expect((await call(`${base}/apps/detail?key=nope`)).status).toBe(404)
    server.close()
  })

  it('status exposes capabilities including the MDM-only Endpoint Central state', async () => {
    const { server, base } = await start()
    const st = (await call(`${base}/status`)).json.data
    expect(st.state).toBe('ready')
    expect(st.capabilities.endpointCentralInventory.state).toBe('scope_missing')
    expect(st.capabilities.packagers).toEqual({ windows: false, macOS: false })
    server.close()
  })

  it('is read-only: no mutating verbs other than the sync trigger exist, and no credential appears in responses', async () => {
    const { server, base } = await start()
    expect((await call(`${base}/apps?platform=macOS`, 'DELETE')).status).toBe(404)
    expect((await call(`${base}/apps/detail?key=x`, 'PUT')).status).toBe(404)
    const bodies = [await call(`${base}/status`), await call(`${base}/apps?platform=macOS`), await call(`${base}/apps/detail?key=${encodeURIComponent('mdm|macOS|us.zoom.xos')}`)]
    for (const b of bodies) expect(b.text).not.toMatch(/access_token|refresh_token|client_secret|Zoho-oauthtoken|Bearer /i)
    server.close()
  })

  it('POST /sync starts a background sync and returns 202', async () => {
    const { server, base, service } = await start()
    const spy = vi.spyOn(service, 'startSync')
    expect((await call(`${base}/sync`, 'POST')).status).toBe(202)
    expect(spy).toHaveBeenCalled()
    server.close()
  })

  it('before any sync, returns an empty list with the state (never mock rows)', async () => {
    const service = createAppIntelService({ providers: providers({ intuneConfigured: () => false, manageEngineConfigured: () => false }), now: () => NOW, latest: { brew: async () => latest, winget: async () => latest }, endpointCentral: async () => ({ state: 'not_configured', message: '' }), packagers: () => ({ windows: false, macOS: false }) })
    await service.startSync() // nothing configured -> error, no snapshot
    const app = express(); app.use('/api/app-intel', createAppIntelRouter(() => service, () => NOW)); app.use(errorHandler)
    const server = app.listen(0); await new Promise<void>(r => server.once('listening', r))
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/app-intel`
    const r = (await call(`${base}/apps?platform=macOS`)).json.data
    expect(r.rows).toEqual([])
    expect(r.state.state).toBe('error')
    expect(r.state.lastError).toMatch(/No inventory provider is configured/)
    server.close()
  })
})

describe('app-intel export', () => {
  it('exports the same filtered list as /apps, as CSV and as Excel, with formula-safe cells', async () => {
    const { server, base } = await start()
    const csv = await call(`${base}/export?platform=macOS&format=csv`)
    expect(csv.status).toBe(200)
    expect(csv.text).toContain('Application Name')
    expect(csv.text).toContain('Acme')
    expect(csv.text).not.toContain('Safari') // OS-native apps are excluded, as on screen
    expect(csv.text.split('\r\n')).toHaveLength(1 + (await call(`${base}/apps?platform=macOS`)).json.data.total)
    expect((await call(`${base}/export?platform=macOS&format=csv&q=zoom`)).text).not.toContain('Acme')
    const xlsx = await call(`${base}/export?platform=macOS&format=xlsx`)
    expect(xlsx.status).toBe(200)
    expect(xlsx.text.startsWith('PK')).toBe(true) // zip container
    server.close()
  })

  it('exports one app\'s devices and validates input and role', async () => {
    const { server, base, service } = await start()
    const key = service.getSnapshot()!.apps.find(a => a.identity.displayName.includes('zoom'))!.key
    const devices = await call(`${base}/export?platform=macOS&format=csv&key=${encodeURIComponent(key)}`)
    expect(devices.text).toContain('Mac-1')
    expect(devices.text).toContain('Update required') // 5.0.0 is behind 6.1.0
    expect((await call(`${base}/export?platform=macOS&format=csv&key=missing`)).status).toBe(404)
    expect((await call(`${base}/export?platform=macOS&format=pdf`)).status).toBe(400)
    expect((await call(`${base}/export?format=csv`)).status).toBe(400)
    expect((await call(`${base}/export?platform=macOS&format=csv`, 'GET', 'End User')).status).toBe(403)
    server.close()
  })
})

