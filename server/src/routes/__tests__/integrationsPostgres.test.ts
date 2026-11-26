import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import express from 'express'
import http from 'node:http'
import type { AddressInfo } from 'node:net'

const testConnection = vi.fn()
const savePostgresConfig = vi.fn()
const clearPostgresConfig = vi.fn()
vi.mock('../../db/index.js', () => ({
  testConnection: (c: unknown) => testConnection(c),
  configuredConnectionString: () => undefined,
  activeConnectionString: () => undefined,
  isDbAvailable: () => false,
}))
vi.mock('../../store/postgresConfig.js', () => ({
  savePostgresConfig: (c: unknown) => savePostgresConfig(c),
  clearPostgresConfig: () => clearPostgresConfig(),
  getPostgresConfig: () => undefined,
}))
vi.mock('../../services/sync/syncEngine.js', () => ({ storageKind: () => 'file' }))

let server: http.Server
let base = ''
beforeAll(async () => {
  const { default: router } = await import('../integrations.js')
  const app = express()
  app.use(express.json())
  app.use('/api/integrations', router)
  server = http.createServer(app)
  await new Promise<void>(r => server.listen(0, r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(() => new Promise<void>(r => server.close(() => r())))
beforeEach(() => { testConnection.mockReset(); savePostgresConfig.mockReset(); clearPostgresConfig.mockReset() })

const push = (fields: unknown) => fetch(`${base}/api/integrations/postgres/credentials`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-user-role': 'Global Admin' }, body: JSON.stringify({ fields }) }).then(async r => ({ status: r.status, json: await r.json() as Record<string, any> })) // eslint-disable-line @typescript-eslint/no-explicit-any

describe('PostgreSQL in Settings -> Integrations', () => {
  it('rejects something that is not a PostgreSQL connection string, without trying to connect', async () => {
    const r = await push({ connectionString: 'mysql://x' })
    expect(r.status).toBe(400)
    expect(testConnection).not.toHaveBeenCalled()
    expect(savePostgresConfig).not.toHaveBeenCalled()
  })

  it('saves nothing when the connection fails, and the error does not carry the password', async () => {
    testConnection.mockResolvedValue({ ok: false, error: 'connect ECONNREFUSED 10.0.0.5:5432' })
    const r = await push({ connectionString: 'postgresql://user:hunter2@10.0.0.5/app' })
    expect(r.status).toBe(400)
    expect(r.json['error']).toContain('ECONNREFUSED')
    expect(JSON.stringify(r.json)).not.toContain('hunter2')
    expect(savePostgresConfig).not.toHaveBeenCalled()
  })

  it('saves a working connection and says a restart applies it', async () => {
    testConnection.mockResolvedValue({ ok: true, latencyMs: 12, serverVersion: '16.2' })
    const r = await push({ connectionString: 'postgresql://user:pw@10.0.0.5/app', ssl: 'require' })
    expect(r.status).toBe(200)
    expect(savePostgresConfig).toHaveBeenCalledWith({ connectionString: 'postgresql://user:pw@10.0.0.5/app', ssl: 'require' })
    expect(r.json['data']).toMatchObject({ configured: true, serverVersion: '16.2' })
    expect(JSON.stringify(r.json)).not.toContain('pw@')
  })

  it('disconnect forgets the saved connection', async () => {
    const res = await fetch(`${base}/api/integrations/postgres/credentials`, { method: 'DELETE', headers: { 'x-user-role': 'Global Admin' } })
    expect(res.status).toBe(200)
    expect(clearPostgresConfig).toHaveBeenCalled()
  })

  it('shows PostgreSQL as optional and on local files in the status list', async () => {
    const res = await fetch(`${base}/api/integrations/status`)
    const pgItem = ((await res.json()) as { data: Array<Record<string, unknown>> }).data.find(x => x['id'] === 'postgres')!
    expect(pgItem).toMatchObject({ configured: false, storage: 'file', restartRequired: false })
    expect(String(pgItem['note'])).toContain('local files')
  })
})
