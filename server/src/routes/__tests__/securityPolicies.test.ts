import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import express from 'express'
import http from 'node:http'
import type { AddressInfo } from 'net'
import { errorHandler } from '../../middleware/errorHandler.js'

function httpGet(url: string, headers: Record<string, string> = {}): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    http.get(url, { headers }, res => {
      let body = ''
      res.on('data', chunk => { body += chunk })
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body }))
    }).on('error', reject)
  })
}

function httpPost(url: string, headers: Record<string, string> = {}): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method: 'POST', headers }, res => {
      let body = ''
      res.on('data', chunk => { body += chunk })
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body }))
    })
    req.on('error', reject)
    req.end()
  })
}

// Mock/live separation contract: when neither Intune nor Entra is
// configured, list/status routes must never touch Graph and must report
// configured:false rather than fabricated data.
vi.mock('../../store/integrationStore.js', () => ({
  getIntuneConfig: vi.fn(),
  getEntraConfig: vi.fn(),
}))
vi.mock('../../db/index.js', () => ({
  isDbAvailable: vi.fn(() => false),
  query: vi.fn(),
}))

import { getIntuneConfig, getEntraConfig } from '../../store/integrationStore.js'
import { isDbAvailable } from '../../db/index.js'
import securityPoliciesRouter from '../securityPolicies.js'

async function startServer() {
  const app = express()
  app.use(express.json())
  app.use('/api/security-policies', securityPoliciesRouter)
  app.use(errorHandler)
  const server = app.listen(0)
  await new Promise<void>(resolve => server.once('listening', resolve))
  const port = (server.address() as AddressInfo).port
  return { server, baseUrl: `http://127.0.0.1:${port}/api/security-policies` }
}

describe('GET /api/security-policies/policies — mock/live separation and authorization', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch')
    vi.mocked(getIntuneConfig).mockReturnValue(undefined)
    vi.mocked(getEntraConfig).mockReturnValue(undefined)
    vi.mocked(isDbAvailable).mockReturnValue(false)
  })
  afterEach(() => {
    fetchSpy.mockRestore()
    vi.clearAllMocks()
  })

  it('returns configured:false with empty data and makes zero Graph calls when nothing is configured', async () => {
    const { server, baseUrl } = await startServer()
    try {
      const res = await httpGet(`${baseUrl}/policies`, { 'x-user-role': 'Global Admin' })
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

  it('rejects a Helpdesk-and-below-unlisted role with 403 on /sync (sync is Global Admin / IT Admin only)', async () => {
    const { server, baseUrl } = await startServer()
    try {
      const res = await httpPost(`${baseUrl}/sync`, { 'x-user-role': 'Helpdesk' })
      expect(res.status).toBe(403)
      expect(fetchSpy).not.toHaveBeenCalled()
    } finally {
      server.close()
    }
  })

  it('allows Helpdesk to read /policies (read role includes Helpdesk)', async () => {
    const { server, baseUrl } = await startServer()
    try {
      const res = await httpGet(`${baseUrl}/policies`, { 'x-user-role': 'Helpdesk' })
      expect(res.status).toBe(200)
    } finally {
      server.close()
    }
  })

  it('rejects a request with no x-user-role header with 403', async () => {
    const { server, baseUrl } = await startServer()
    try {
      const res = await httpGet(`${baseUrl}/policies`)
      expect(res.status).toBe(403)
    } finally {
      server.close()
    }
  })

  it('returns 503 on /sync when Graph is configured but DATABASE_URL is not', async () => {
    vi.mocked(getIntuneConfig).mockReturnValue({ tenantId: 't1', clientId: 'c1', clientSecret: 's1' })
    vi.mocked(isDbAvailable).mockReturnValue(false)
    const { server, baseUrl } = await startServer()
    try {
      const res = await httpPost(`${baseUrl}/sync`, { 'x-user-role': 'Global Admin' })
      expect(res.status).toBe(503)
    } finally {
      server.close()
    }
  })

  it('rejects an unknown category on the policy-detail route with 400 before querying the DB', async () => {
    const { server, baseUrl } = await startServer()
    try {
      const res = await httpGet(`${baseUrl}/policies/intune/not-a-real-category/p1`, { 'x-user-role': 'Global Admin' })
      expect(res.status).toBe(400)
    } finally {
      server.close()
    }
  })
})
