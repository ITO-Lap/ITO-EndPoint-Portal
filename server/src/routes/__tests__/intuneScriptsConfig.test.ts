import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import express from 'express'
import http from 'node:http'
import type { AddressInfo } from 'net'
import { errorHandler } from '../../middleware/errorHandler.js'

// The test client below uses node:http directly (not global fetch) so that
// spying on globalThis.fetch only observes calls the route handler itself
// makes (i.e. outbound Graph calls) — not the test's own request to the
// in-process server.
function httpGet(url: string, headers: Record<string, string> = {}): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    http.get(url, { headers }, res => {
      let body = ''
      res.on('data', chunk => { body += chunk })
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body }))
    }).on('error', reject)
  })
}

// Mock/live separation contract: when Intune isn't configured, the route
// must never touch Graph (no fetch call) and must return a clear
// configured:false response, not fabricated data.
vi.mock('../../store/integrationStore.js', () => ({
  getIntuneConfig: vi.fn(),
}))

import { getIntuneConfig } from '../../store/integrationStore.js'
import intuneScriptsConfigRouter from '../intuneScriptsConfig.js'

async function startServer() {
  const app = express()
  app.use(express.json())
  app.use('/api/intune-scripts-config', intuneScriptsConfigRouter)
  app.use(errorHandler)
  const server = app.listen(0)
  await new Promise<void>(resolve => server.once('listening', resolve))
  const port = (server.address() as AddressInfo).port
  return { server, baseUrl: `http://127.0.0.1:${port}/api/intune-scripts-config` }
}

describe('GET /api/intune-scripts-config/items — mock/live separation', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch')
  })
  afterEach(() => {
    fetchSpy.mockRestore()
    vi.clearAllMocks()
  })

  it('returns configured:false with empty data and makes zero Graph/network calls when Intune is not configured', async () => {
    vi.mocked(getIntuneConfig).mockReturnValue(undefined)
    const { server, baseUrl } = await startServer()
    try {
      const res = await httpGet(`${baseUrl}/items`, { 'x-user-role': 'Global Admin' })
      const body = JSON.parse(res.body)
      expect(res.status).toBe(200)
      expect(body.success).toBe(true)
      expect(body.configured).toBe(false)
      expect(body.data).toEqual([])
      expect(fetchSpy).not.toHaveBeenCalled()
    } finally {
      server.close()
    }
  })

  it('rejects a non-admin role with 403 before ever checking Intune configuration', async () => {
    vi.mocked(getIntuneConfig).mockReturnValue(undefined)
    const { server, baseUrl } = await startServer()
    try {
      const res = await httpGet(`${baseUrl}/items`, { 'x-user-role': 'Helpdesk' })
      expect(res.status).toBe(403)
    } finally {
      server.close()
    }
  })

  it('rejects a request with no x-user-role header with 403', async () => {
    const { server, baseUrl } = await startServer()
    try {
      const res = await httpGet(`${baseUrl}/items`)
      expect(res.status).toBe(403)
    } finally {
      server.close()
    }
  })
})
