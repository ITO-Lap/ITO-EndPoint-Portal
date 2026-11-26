import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import express from 'express'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { invalidCidrLines } from '../../services/settingsSchemas.js'

let server: http.Server
let base = ''
beforeAll(async () => {
  const { default: router } = await import('../settings.js')
  const app = express(); app.use(express.json()); app.use('/api/settings', router)
  server = http.createServer(app)
  await new Promise<void>(r => server.listen(0, r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/settings`
})
afterAll(() => new Promise<void>(r => server.close(() => r())))

const call = async (method: string, path: string, role: string, body?: unknown) => {
  const res = await fetch(base + path, { method, headers: { 'x-user-role': role, 'x-user-email': 'admin@x.com', 'Content-Type': 'application/json' }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) })
  return { status: res.status, json: await res.json() as { success: boolean; error?: string; data?: Record<string, { values: Record<string, unknown>; updatedBy: string | null }> } }
}

describe('saving Settings sections', () => {
  it('needs the Settings page permission to read or save', async () => {
    expect((await call('GET', '', 'Helpdesk')).status).toBe(403)
    expect((await call('PUT', '/general', 'Helpdesk', { values: { orgName: 'X' } })).status).toBe(403)
    expect((await call('GET', '', 'IT Admin')).status).toBe(200)
  })

  it('saves a section, records who saved it, and returns it on the next read', async () => {
    const r = await call('PUT', '/general', 'Global Admin', { values: { orgName: 'Acme', timezone: 'Asia/Kolkata', environment: 'test', supportEmail: 'help@acme.com' } })
    expect(r.status).toBe(200)
    const all = await call('GET', '', 'Global Admin')
    expect(all.json.data!['general']).toMatchObject({ values: { orgName: 'Acme', timezone: 'Asia/Kolkata', environment: 'test' }, updatedBy: 'admin@x.com' })
  })

  it('replaces a section rather than merging, and keeps other sections', async () => {
    await call('PUT', '/data', 'Global Admin', { values: { deviceRetention: '365', gdprMode: true } })
    await call('PUT', '/data', 'Global Admin', { values: { deviceRetention: '90' } })
    const all = (await call('GET', '', 'Global Admin')).json.data!
    expect(all['data']!.values).toEqual({ deviceRetention: '90' })
    expect(all['general']!.values['orgName']).toBe('Acme')
  })

  it.each([
    ['general', { timezone: 'Mars/Olympus' }, 'time zone'],
    ['general', { logoUrl: 'javascript:alert(1)' }, ''],
    ['general', { surprise: true }, ''],
    ['compliance', { riskWeights: { encryption: 50, osVersion: 25, appCompliance: 20, checkIn: 15 } }, 'add up to 100'],
    ['compliance', { grace: -1 }, ''],
    ['security', { ipAllowlist: '10.0.0.0/8\n999.1.1.1' }, 'IP address or CIDR'],
    ['security', { loginAttempts: 'many' }, 'whole number'],
    ['notifications', { slackWebhook: 'https://hooks.slack.com/services/T/B/x' }, ''],
    ['notifications', { pagerKey: 'abcdef' }, ''],
    ['automation', { maxPerDay: '1e9' }, ''],
  ])('refuses invalid values for %s: %j', async (section, values, hint) => {
    const r = await call('PUT', `/${section}`, 'Global Admin', { values })
    expect(r.status).toBe(400)
    expect(r.json.error ?? '').toContain(hint)
  })

  it('refuses an unknown section, and never accepts credentials as settings', async () => {
    expect((await call('PUT', '/integrations', 'Global Admin', { values: {} })).status).toBe(404)
    const all = JSON.stringify((await call('GET', '', 'Global Admin')).json)
    expect(all).not.toMatch(/hooks\.slack\.com|abcdef/)
  })

  it('accepts a sensible IP allowlist (IPv4, CIDR and IPv6)', async () => {
    const r = await call('PUT', '/security', 'Global Admin', { values: { ipEnabled: true, ipAllowlist: '10.0.0.0/8\n192.168.1.5\n2001:db8::/32', mfaRequired: true } })
    expect(r.status).toBe(200)
    expect(invalidCidrLines('10.0.0.0/8\n  \n172.16.0.0/12')).toEqual([])
    expect(invalidCidrLines('10.0.0.0/33\nnot-an-ip\n300.1.1.1')).toHaveLength(3)
  })
})
