import { describe, it, expect } from 'vitest'
import express from 'express'
import http from 'node:http'
import type { AddressInfo } from 'net'
import { createStaleDevicesRouter } from '../staleDevices.js'
import { createStaleDevicesService } from '../../services/staleDevices/service.js'
import { errorHandler } from '../../middleware/errorHandler.js'

const NOW = Date.parse('2026-10-20T06:00:00Z')
const ago = (d: number) => new Date(NOW - d * 86_400_000).toISOString()

async function start() {
  const service = createStaleDevicesService({
    cacheFile: null, now: () => NOW,
    providers: {
      intuneConfigured: () => true, ecConfigured: () => true,
      fetchIntune: async () => [
        { id: 'i1', deviceName: 'WIN-OLD', operatingSystem: 'Windows', osVersion: '10.0.22631', serialNumber: 'SER-0001', userDisplayName: 'Asha', userPrincipalName: 'asha@zinnia.com', lastSyncDateTime: ago(40) },
        { id: 'i2', deviceName: 'PHONE', operatingSystem: 'iOS', osVersion: '17', serialNumber: 'SER-0002', lastSyncDateTime: ago(90) },
      ],
      fetchEc: async () => [{ device_id: 'm1', device_name: 'MBP-OLD', serial_number: 'C02OLD001', platform_type: 'iOS', model: 'MacBook Air', os_version: '14', last_contact_time: Date.parse(ago(30)) }],
    },
  })
  await service.startSync()
  const app = express(); app.use('/api/stale-devices', createStaleDevicesRouter(() => service)); app.use(errorHandler)
  const server = app.listen(0); await new Promise<void>(r => server.once('listening', r))
  return { server, base: `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/stale-devices`, service }
}

interface Reply { data?: { rows?: Array<{ deviceName: string }>; summary?: Record<string, number>; device?: Record<string, unknown> } }

function call(url: string, method = 'GET', role: string | null = 'IT Admin'): Promise<{ status: number; text: string; json: Reply | null; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method, headers: role ? { 'x-user-role': role } : {} }, res => {
      let body = ''; res.on('data', c => { body += c }); res.on('end', () => { let json: Reply | null = null; try { json = JSON.parse(body) } catch { /* csv */ } resolve({ status: res.statusCode ?? 0, text: body, json, headers: res.headers }) })
    })
    req.on('error', reject); req.end()
  })
}

describe('stale devices router', () => {
  it('lists stale devices from the cached snapshot with summary counts and no out-of-scope rows', async () => {
    const { server, base } = await start()
    const r = await call(`${base}/devices?view=stale`)
    server.close()
    expect(r.status).toBe(200)
    expect(r.json?.data?.summary).toMatchObject({ staleWindows: 1, staleMacOS: 1, totalInScope: 2 })
    expect(r.json?.data?.rows?.map(d => d.deviceName).sort()).toEqual(['MBP-OLD', 'WIN-OLD'])
    expect(JSON.stringify(r.json)).not.toMatch(/PHONE|SER-0002/)
  })

  it('enforces roles: End User and missing role are rejected, Helpdesk can view but not export', async () => {
    const { server, base } = await start()
    const results = await Promise.all([
      call(`${base}/devices`, 'GET', 'End User'), call(`${base}/devices`, 'GET', null),
      call(`${base}/devices`, 'GET', 'Helpdesk'), call(`${base}/export`, 'GET', 'Helpdesk'), call(`${base}/export`, 'GET', 'IT Admin'),
    ])
    server.close()
    expect(results.map(r => r.status)).toEqual([403, 403, 200, 403, 200])
  })

  it('exports only the filtered dataset as CSV', async () => {
    const { server, base } = await start()
    const r = await call(`${base}/export?view=macos&tz=Asia/Kolkata`)
    server.close()
    expect(r.headers['content-type']).toMatch(/text\/csv/)
    const lines = r.text.replace('﻿', '').trim().split('\r\n')
    expect(lines).toHaveLength(2)
    expect(lines[1]).toContain('MBP-OLD')
    expect(r.text).not.toContain('WIN-OLD')
  })

  it('returns detail for a canonical id and 404 for an unknown one', async () => {
    const { server, base } = await start()
    const ok = await call(`${base}/devices/detail?id=${encodeURIComponent('win:serial:SER-0001')}`)
    const missing = await call(`${base}/devices/detail?id=nope`)
    server.close()
    expect(ok.json?.data?.device).toMatchObject({ deviceName: 'WIN-OLD', staleStatus: 'stale' })
    expect(missing.status).toBe(404)
  })

  it('exposes no mutating device endpoint — only POST /sync (a refresh of the cache)', async () => {
    const { server, base } = await start()
    const r = await Promise.all([call(`${base}/devices`, 'DELETE'), call(`${base}/devices`, 'POST'), call(`${base}/devices/retire`, 'POST')])
    server.close()
    expect(r.every(x => x.status === 404)).toBe(true)
  })
})
