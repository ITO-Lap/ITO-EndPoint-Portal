import { describe, it, expect, vi, afterEach } from 'vitest'
import express from 'express'
import http from 'node:http'
import type { AddressInfo } from 'net'
import { errorHandler } from '../../middleware/errorHandler.js'

vi.mock('../../store/integrationStore.js', () => ({ getManageEngineConfig: vi.fn(() => ({ clientId: 'c', clientSecret: 's', refreshToken: 'r', apiDomain: 'x' })) }))
vi.mock('../../services/manageEngine.js', () => ({ getAccessToken: vi.fn(async () => 'SECRET-ACCESS-TOKEN') }))

import router from '../endpointCentral.js'
import { clearMissingPatchCache } from '../../services/endpointCentralPatch.js'

function get(url: string): Promise<{ status: number; text: string; json: any }> {
  return new Promise((resolve, reject) => {
    http.get(url, res => {
      let b = ''
      res.on('data', c => { b += c })
      res.on('end', () => resolve({ status: res.statusCode ?? 0, text: b, json: JSON.parse(b) }))
    }).on('error', reject)
  })
}

async function start() {
  const app = express(); app.use('/api/endpoint-central', router); app.use(errorHandler)
  const server = app.listen(0); await new Promise<void>(r => server.once('listening', r))
  return { server, base: `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/endpoint-central` }
}

const realFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = realFetch; clearMissingPatchCache(); vi.restoreAllMocks() })

describe('GET /devices/:resourceId/missing-patches', () => {
  it('rejects a malformed resource id or view without calling upstream', async () => {
    const { server, base } = await start()
    const f = vi.fn(); globalThis.fetch = f as unknown as typeof fetch
    expect((await get(`${base}/devices/abc/missing-patches`)).status).toBe(400)
    expect((await get(`${base}/devices/1234567/missing-patches?view=bogus`)).status).toBe(400)
    expect(f).not.toHaveBeenCalled()
    server.close()
  })

  it('returns patches and never leaks the access token', async () => {
    const { server, base } = await start()
    const body = { metadata: { totalPages: 1 }, response_code: 200, message_response: { systemreport: [{ patches: [{ severity: 'Critical', patchname: 'x.zip', update_type: 'Security Updates', patch_status: 'Missing' }] }] } }
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(body))) as unknown as typeof fetch
    const r = await get(`${base}/devices/116819000011966437/missing-patches?view=critical`)
    expect(r.json.data.status).toBe('ok')
    expect(r.json.data.patches).toHaveLength(1)
    expect(r.text).not.toContain('SECRET-ACCESS-TOKEN')
    server.close()
  })

  it('reports scope_required and logs details only on the server', async () => {
    const { server, base } = await start()
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 403 })) as unknown as typeof fetch
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const r = await get(`${base}/devices/116819000011966437/missing-patches`)
    expect(r.json.data).toEqual({ status: 'scope_required', patches: [] })
    expect(log).toHaveBeenCalled()
    server.close()
  })
})

describe('PATCH operations read model', () => {
  it('returns connector health without exposing credentials', async () => {
    const { server, base } = await start()
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ message_response: { allsystems: [], total: 0 } }))) as unknown as typeof fetch
    const r = await get(`${base}/operations`)
    expect(r.status).toBe(200)
    expect(r.json.data).toMatchObject({ connector: { configured: true } })
    expect(r.text).not.toContain('SECRET-ACCESS-TOKEN')
    server.close()
  })
})

describe('critical patching access', () => {
  const post = (base: string, role: string) => fetch(`${base}/remediation/preview`, { method: 'POST', headers: { 'x-user-role': role, 'content-type': 'application/json' }, body: '{}' })

  it('lets the Desktop team (Helpdesk) reach remediation, and still blocks End Users', async () => {
    const { server, base } = await start()
    try {
      for (const role of ['Global Admin', 'IT Admin', 'Helpdesk']) expect((await post(base, role)).status, role).not.toBe(403)
      expect((await post(base, 'End User')).status).toBe(403)
    } finally { server.close() }
  })
})
