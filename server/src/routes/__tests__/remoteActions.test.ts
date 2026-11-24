import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import express from 'express'
import http from 'node:http'
import type { AddressInfo } from 'net'
import { errorHandler } from '../../middleware/errorHandler.js'

vi.mock('../../db/index.js', () => ({ isDbAvailable: vi.fn(() => false), query: vi.fn() }))
const perms = vi.hoisted(() => ({ byRole: {} as Record<string, Record<string, boolean>> }))
vi.mock('../../services/roleResolution.js', () => ({ permissionsForRole: async (role: string) => perms.byRole[role] ?? {} }))

import router from '../remoteActions.js'
import { setGraphDeps } from '../graphRunner.js'
import * as store from '../../remoteActions/store.js'
import { setDeviceSource } from '../../remoteActions/service.js'
import type { Device } from '../../types.js'

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
const jwt = (roles: string[]) => `${b64({ alg: 'none' })}.${b64({ roles })}.sig`

let server: http.Server
let base = ''
let calls: Array<{ url: string; method: string }> = []
let granted: string[] = []

beforeAll(async () => {
  const app = express()
  app.use(express.json({ limit: '600kb' }))
  app.use('/api/remote-actions', router)
  app.use(errorHandler)
  server = http.createServer(app)
  await new Promise<void>(r => server.listen(0, r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/remote-actions`
})
afterAll(() => { server.close() })

const IT = { 'remoteActions.read': true, 'remoteActions.author': true, 'remoteActions.execute': true, 'graphRunner.read': true, 'graphRunner.run': true, 'graphRunner.change': true }
const APPROVER = { 'remoteActions.read': true, 'remoteActions.approve': true, 'graphRunner.read': true, 'graphRunner.approve': true }

beforeEach(() => {
  store.resetForTests(true)
  perms.byRole = { 'IT Admin': { ...IT }, Approver: { ...APPROVER }, Viewer: { 'remoteActions.read': true, 'graphRunner.read': true }, Nobody: {} }
  calls = []; granted = ['DeviceManagementManagedDevices.Read.All', 'DeviceManagementManagedDevices.ReadWrite.All', 'DeviceManagementManagedDevices.PrivilegedOperations.All', 'Device.ReadWrite.All']
  setGraphDeps({
    getToken: async () => jwt(granted), sleep: async () => {},
    fetchImpl: async (url, init) => { calls.push({ url, method: String(init?.method) }); return new Response(JSON.stringify({ value: [{ id: '1', displayName: 'A', access_token: 'abcdefghijklmnop' }], '@odata.nextLink': 'https://graph.microsoft.com/v1.0/deviceManagement/managedDevices?$skiptoken=n' }), { status: 200, headers: { 'request-id': 'rid-9' } }) },
  })
  setDeviceSource(async () => [{ id: 'w1', deviceName: 'WIN-1', platform: 'Windows', managementSource: 'Microsoft Intune', lastCheckIn: new Date().toISOString(), serialNumber: 'S1', user: 'u', osVersion: '1', complianceState: 'Compliant', azureAdDeviceId: 'a' } as Device])
})

const call = async (method: string, path: string, role: string, email: string, body?: unknown) => {
  const res = await fetch(`${base}${path}`, { method, headers: { 'content-type': 'application/json', 'x-user-role': role, 'x-user-email': email }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) })
  const text = await res.text()
  let json: Record<string, any> = {}; try { json = JSON.parse(text) } catch { /* csv/txt */ }
  return { status: res.status, json, text }
}
const itAdmin = (method: string, path: string, body?: unknown) => call(method, path, 'IT Admin', 'eng@zinnia.com', body)
const approver = (method: string, path: string, body?: unknown) => call(method, path, 'Approver', 'boss@zinnia.com', body)

describe('permission-denied states', () => {
  it('blocks every route without the right capability', async () => {
    expect((await call('GET', '/status', 'Nobody', 'x@z.com')).status).toBe(403)
    expect((await call('GET', '/scripts', 'Nobody', 'x@z.com')).status).toBe(403)
    expect((await call('POST', '/scripts', 'Viewer', 'v@z.com', { name: 'x', content: 'Get-Date', fileName: 'a.ps1' })).status).toBe(403)
    expect((await call('POST', '/jobs', 'Viewer', 'v@z.com', {})).status).toBe(403)
    expect((await call('POST', '/scripts/x/versions/1/decision', 'IT Admin', 'eng@zinnia.com', { decision: 'approve' })).status).toBe(403)
    expect((await call('PUT', '/policy', 'IT Admin', 'eng@zinnia.com', {})).status).toBe(403)
    expect((await call('POST', '/graph/requests', 'Nobody', 'x@z.com', { name: 'n', method: 'GET', endpoint: '/users' })).status).toBe(403)
  })
  it('rejects malformed bodies with 400 rather than executing', async () => {
    expect((await itAdmin('POST', '/scripts', { name: 'x' })).status).toBe(400)
    expect((await itAdmin('POST', '/jobs', { scriptId: 'nope' })).status).toBe(400)
    expect((await itAdmin('POST', '/scripts', { name: 'x', content: 'Get-Date', fileName: 'a.ps1', extra: 1 })).status).toBe(400)   // strict schema
  })
})

describe('script API', () => {
  it('analyzes without saving, creates, hides bodies from viewers, and writes audit', async () => {
    const an = await itAdmin('POST', '/scripts/analyze', { content: 'rm -rf /', fileName: 'w.sh' })
    expect(an.json.data.analysis.risk).toBe('blocked'); expect(store.listScripts()).toHaveLength(0)
    expect((await itAdmin('POST', '/scripts', { name: 'W', content: 'rm -rf /', fileName: 'w.sh' })).status).toBe(201)
    const created = await itAdmin('POST', '/scripts', { name: 'Ver', content: '#!/bin/bash\nsw_vers\n', fileName: 'v.sh' })
    expect(created.status).toBe(201); expect(created.json.data.content).toBeUndefined()
    const id = created.json.data.id
    expect((await itAdmin('GET', `/scripts/${id}`)).json.data.versions[0].content).toContain('sw_vers')
    const asViewer = await call('GET', `/scripts/${id}`, 'Viewer', 'v@z.com')
    expect(asViewer.json.data.versions[0]).toMatchObject({ bodyHidden: true }); expect(asViewer.json.data.versions[0].content).toBeUndefined()
    expect((await itAdmin('GET', '/audit')).json.data.some((e: { action: string }) => e.action === 'script.created')).toBe(true)
  })
})

describe('Graph API Runner — read-only requests', () => {
  it('runs a GET, stores sanitized output, exposes pagination, and records duration/correlation id', async () => {
    const r = await itAdmin('POST', '/graph/requests', { name: 'Devices', method: 'GET', endpoint: '/deviceManagement/managedDevices', query: { $top: '5' } })
    expect(r.status).toBe(200)
    const rec = r.json.data
    expect(rec).toMatchObject({ status: 'executed', httpStatus: 200, classification: 'read_only', correlationId: 'rid-9', requestedBy: 'eng@zinnia.com' })
    expect(JSON.stringify(rec)).not.toMatch(/abcdefghijklmnop|Bearer/); expect(rec.nextLink).toContain('skiptoken')
    expect(calls[0]).toMatchObject({ method: 'GET' }); expect(calls[0]!.url).toMatch(/^https:\/\/graph\.microsoft\.com\/v1\.0\//)
    const next = await itAdmin('POST', `/graph/history/${rec.id}/next`)
    expect(next.status).toBe(200); expect(calls[1]!.url).toContain('skiptoken=n')
  })
  it('refuses before sending when granted permissions are missing, and names them', async () => {
    granted = ['User.Read.All']
    const r = await itAdmin('POST', '/graph/requests', { name: 'Devices', method: 'GET', endpoint: '/deviceManagement/managedDevices' })
    expect(r.status).toBe(422); expect(r.json.error).toMatch(/DeviceManagementManagedDevices\.Read\.All/); expect(calls).toHaveLength(0)
  })
  it('blocks external URLs, unapproved endpoints and credential endpoints without any outbound call', async () => {
    for (const endpoint of ['https://evil.example/x', '/directory/deviceLocalCredentials/abc', '/applications']) {
      expect((await itAdmin('POST', '/graph/requests', { name: 'x', method: 'GET', endpoint })).status).toBe(422)
    }
    expect(calls).toHaveLength(0)
  })
  it('validate endpoint reports classification, minimum permissions and what is missing', async () => {
    granted = []
    const v = await itAdmin('POST', '/graph/validate', { method: 'GET', endpoint: '/users/abc' })
    expect(v.json.data).toMatchObject({ classification: 'read_only', minimumPermissions: ['User.Read.All'], permissions: { ok: false } })
  })
  it('serves JSON/CSV/TXT downloads free of secrets and records download activity', async () => {
    const rec = (await itAdmin('POST', '/graph/requests', { name: 'Devices', method: 'GET', endpoint: '/deviceManagement/managedDevices' })).json.data
    const json = await itAdmin('GET', `/graph/history/${rec.id}/download?format=json`)
    const csv = await itAdmin('GET', `/graph/history/${rec.id}/download?format=csv`)
    const txt = await itAdmin('GET', `/graph/history/${rec.id}/download?format=txt`)
    for (const d of [json, csv, txt]) { expect(d.status).toBe(200); expect(d.text).not.toMatch(/abcdefghijklmnop|Bearer|REDACTED/i) }
    expect(json.text + csv.text).not.toMatch(/authorization/i)
    expect(csv.text.split('\r\n')[0]).toBe('"id","displayName"'); expect(txt.text).toMatch(/HTTP status:\s+200/)
    expect((await itAdmin('GET', `/graph/history/${rec.id}`)).json.data.downloads).toHaveLength(3)
    expect((await itAdmin('GET', `/graph/history/${rec.id}/download?format=xml`)).status).toBe(400)
  })
  it('reruns a read-only request and links it to the original', async () => {
    const rec = (await itAdmin('POST', '/graph/requests', { name: 'Devices', method: 'GET', endpoint: '/deviceManagement/managedDevices' })).json.data
    const again = await itAdmin('POST', `/graph/history/${rec.id}/rerun`, {})
    expect(again.status).toBe(200); expect(again.json.data.retryOf).toBe(rec.id); expect(again.json.data.id).not.toBe(rec.id)
  })
})

describe('Graph API Runner — change and destructive approval workflow', () => {
  const change = { name: 'Rename', method: 'PATCH', endpoint: '/devices/abc', body: { displayName: 'NEW' } }

  it('change requests need a justification and an explicit confirmation, but not approval', async () => {
    expect((await itAdmin('POST', '/graph/requests', change)).json.error).toMatch(/justification/)
    expect((await itAdmin('POST', '/graph/requests', { ...change, justification: 'Fix naming convention drift' })).json.error).toMatch(/confirm/i)
    expect(calls).toHaveLength(0)
    const ok = await itAdmin('POST', '/graph/requests', { ...change, justification: 'Fix naming convention drift', confirmed: true })
    expect(ok.status).toBe(200); expect(ok.json.data).toMatchObject({ classification: 'change', status: 'executed', approvalStatus: 'not_required' }); expect(calls[0]!.method).toBe('PATCH')
  })
  it('requires the change permission (a read-only role cannot PATCH)', async () => {
    perms.byRole['IT Admin'] = { ...IT, 'graphRunner.change': false }
    expect((await itAdmin('POST', '/graph/requests', { ...change, justification: 'Fix naming convention drift', confirmed: true })).status).toBe(403); expect(calls).toHaveLength(0)
  })
  it('DELETE is held for approval; nothing is sent until a DIFFERENT approver approves; permissions are rechecked', async () => {
    const del = { name: 'Remove device', method: 'DELETE', endpoint: '/devices/abc', justification: 'Decommissioned laptop INC-42', confirmed: true }
    const held = await itAdmin('POST', '/graph/requests', del)
    expect(held.status).toBe(202); expect(held.json).toMatchObject({ approvalRequired: true }); expect(held.json.data).toMatchObject({ status: 'pending_approval', approvalStatus: 'pending', classification: 'destructive' })
    expect(calls).toHaveLength(0)
    const id = held.json.data.id
    expect((await itAdmin('POST', `/graph/history/${id}/decision`, { decision: 'approve' })).status).toBe(403)             // requester lacks approver permission
    perms.byRole['IT Admin'] = { ...IT, 'graphRunner.approve': true }
    expect((await itAdmin('POST', `/graph/history/${id}/decision`, { decision: 'approve' })).json.error).toMatch(/own request/) // separation of duties
    granted = ['User.Read.All']
    expect((await approver('POST', `/graph/history/${id}/decision`, { decision: 'approve' })).status).toBe(422)             // permission re-check at execution
    granted = ['Device.ReadWrite.All']
    store.getGraphHistory(id)!.status = 'pending_approval'
    const done = await approver('POST', `/graph/history/${id}/decision`, { decision: 'approve', note: 'confirmed with service desk' })
    expect(done.status).toBe(200); expect(done.json.data).toMatchObject({ status: 'executed', approvalStatus: 'approved', approver: 'boss@zinnia.com', requestedBy: 'eng@zinnia.com' })
    expect(calls).toHaveLength(1); expect(calls[0]).toMatchObject({ method: 'DELETE' })
    expect((await approver('POST', `/graph/history/${id}/decision`, { decision: 'approve' })).status).toBe(409)            // cannot be approved twice
  })
  it('a rejected destructive request is never sent', async () => {
    const held = await itAdmin('POST', '/graph/requests', { name: 'Remove device', method: 'DELETE', endpoint: '/devices/abc', justification: 'Decommissioned laptop INC-42', confirmed: true })
    const r = await approver('POST', `/graph/history/${held.json.data.id}/decision`, { decision: 'reject', note: 'not authorised' })
    expect(r.json.data).toMatchObject({ status: 'rejected', approvalStatus: 'rejected' }); expect(calls).toHaveLength(0)
  })
  it('bulk body changes are treated as destructive and held for approval', async () => {
    const r = await itAdmin('POST', '/graph/requests', { name: 'Bulk', method: 'PATCH', endpoint: '/groups/abc', body: { members: Array.from({ length: 30 }, (_, i) => `i${i}`) }, justification: 'Quarterly cleanup per ticket', confirmed: true })
    expect(r.status).toBe(202); expect(calls).toHaveLength(0)
  })
  it('history never stores request-body secrets, and refuses to replay masked bodies', async () => {
    const r = await itAdmin('POST', '/graph/requests', { name: 'Rename', method: 'PATCH', endpoint: '/devices/abc', body: { displayName: 'X', client_secret: 'topsecretvalue123' }, justification: 'Fix naming convention drift', confirmed: true })
    expect(JSON.stringify(store.listGraphHistory())).not.toContain('topsecretvalue123')
    const again = await itAdmin('POST', `/graph/history/${r.json.data.id}/rerun`, { confirmed: true })
    expect(again.status).toBe(422); expect(again.json.error).toMatch(/masked/)
  })
  it('saved templates store bodies masked and can be deleted only by the owner', async () => {
    const t = await itAdmin('POST', '/graph/templates', { name: 'T', version: 'v1.0', method: 'PATCH', endpoint: '/devices/abc', body: { displayName: 'x', token: 'zzzzzzzzzzzz' } })
    expect(t.status).toBe(201); expect(JSON.stringify(t.json.data)).not.toContain('zzzzzzzzzzzz')
    expect((await call('DELETE', `/graph/templates/${t.json.data.id}`, 'IT Admin', 'other@zinnia.com')).status).toBe(403)
    expect((await itAdmin('DELETE', `/graph/templates/${t.json.data.id}`)).status).toBe(200)
  })
})

describe('Remote Action Center — end-to-end over HTTP (mock provider)', () => {
  it('create script → preflight → job (with device-count confirmation) → status → export', async () => {
    const s = (await itAdmin('POST', '/scripts', { name: 'Inv', content: 'Get-Date\nWrite-Output "__ITO_PROGRESS__:50|x"', fileName: 'i.ps1' })).json.data
    const pf = await itAdmin('POST', '/preflight', { scriptId: s.id, target: { deviceIds: ['w1', 'ghost'] }, provider: 'mock', mode: 'now' })
    expect(pf.json.data.eligible).toHaveLength(1); expect(pf.json.data.excluded[0].reasons.join()).toMatch(/Not found/)
    const j = await itAdmin('POST', '/jobs', { scriptId: s.id, target: { deviceIds: ['w1'] }, provider: 'mock', mode: 'now' })
    expect(j.status).toBe(202)
    const dup = await itAdmin('POST', '/jobs', { scriptId: s.id, target: { deviceIds: ['w1'] }, provider: 'mock', mode: 'now' })
    expect(dup.status).toBe(200); expect(dup.json.duplicate).toBe(true)
    await new Promise(r => setTimeout(r, 30))
    const status = await itAdmin('GET', `/jobs/${j.json.data.id}`)
    expect(status.json.data.counts.total).toBe(1); expect(status.json.data.idempotencyKey).toBeUndefined(); expect(status.json.data.providerContext).toBeUndefined()
    const csv = await itAdmin('GET', `/jobs/${j.json.data.id}/export`)
    expect(csv.text.split('\r\n')[0]).toContain('"Device"')
    const dash = await itAdmin('GET', '/dashboard'); expect(dash.json.data.scripts.total).toBe(1)
  })
  it('status endpoint is honest about providers: Endpoint Central unavailable, Intune unavailable without permissions', async () => {
    const st = (await itAdmin('GET', '/status')).json.data
    const by = Object.fromEntries(st.providers.map((p: { id: string }) => [p.id, p]))
    expect(by.endpoint_central.enabled).toBe(false); expect(by.endpoint_central.reasons.join()).toMatch(/Not configured|no verified/i)
    expect(by.intune.enabled).toBe(false); expect(by.mock.label).toMatch(/simulation/i)
    expect(JSON.stringify(st)).not.toMatch(/secret|token/i)
  })
})
