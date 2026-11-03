import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import express from 'express'
import http from 'node:http'
import type { AddressInfo } from 'net'
import { macAdminIngestRouter, macAdminReadRouter } from '../macAdminAccess.js'
import { getMacAdminAccess } from '../../services/macAdminAccess.js'

const KEY = 'test-report-key-1234'
const body = { serial: 'ROUTE1234567', user: 'jdoe', hostname: 'ROUTE-MBP', status: 'admin' }

function send(server: http.Server, method: string, path: string, headers: Record<string, string> = {}, payload?: unknown): Promise<number> {
  const { port } = server.address() as AddressInfo
  return new Promise((resolve, reject) => {
    const data = payload === undefined ? undefined : JSON.stringify(payload)
    const req = http.request({ port, method, path, headers: { ...headers, ...(data ? { 'Content-Type': 'application/json' } : {}) } }, res => { res.resume(); res.on('end', () => resolve(res.statusCode ?? 0)) })
    req.on('error', reject)
    if (data) req.write(data)
    req.end()
  })
}

describe('POST /api/mac-admin-access/report', () => {
  let server: http.Server
  beforeEach(async () => {
    const app = express(); app.use(express.json())
    app.use('/api/mac-admin-access', macAdminIngestRouter); app.use('/api/mac-admin-access', macAdminReadRouter)
    server = http.createServer(app); await new Promise<void>(r => server.listen(0, r))
  })
  afterEach(async () => { delete process.env['MAC_ADMIN_REPORT_KEY']; await new Promise(r => server.close(r)) })

  it('is 404 while no key is configured', async () => {
    expect(await send(server, 'POST', '/api/mac-admin-access/report', { 'x-report-key': KEY }, body)).toBe(404)
  })
  it('rejects a missing or wrong key and stores nothing', async () => {
    process.env['MAC_ADMIN_REPORT_KEY'] = KEY
    expect(await send(server, 'POST', '/api/mac-admin-access/report', {}, body)).toBe(401)
    expect(await send(server, 'POST', '/api/mac-admin-access/report', { 'x-report-key': 'nope-nope-nope-nope' }, body)).toBe(401)
    expect(getMacAdminAccess().admins.some(a => a.serialNumber === 'ROUTE1234567')).toBe(false)
  })
  it('rejects malformed reports and accepts a valid one', async () => {
    process.env['MAC_ADMIN_REPORT_KEY'] = KEY
    expect(await send(server, 'POST', '/api/mac-admin-access/report', { 'x-report-key': KEY }, { ...body, status: 'root' })).toBe(400)
    expect(await send(server, 'POST', '/api/mac-admin-access/report', { 'x-report-key': KEY }, body)).toBe(204)
    expect(getMacAdminAccess().admins.some(a => a.serialNumber === 'ROUTE1234567')).toBe(true)
  })
})
