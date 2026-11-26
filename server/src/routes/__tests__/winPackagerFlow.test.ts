import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import express from 'express'
import http from 'node:http'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { AddressInfo } from 'net'
import { errorHandler } from '../../middleware/errorHandler.js'
import { makeMsi, makeMsix, makeZip } from '../../services/winPackager/__tests__/fixtures.js'

vi.mock('../../db/index.js', () => ({ isDbAvailable: vi.fn(() => false), query: vi.fn() }))
const perms = vi.hoisted(() => ({ value: {} as Record<string, boolean> }))
vi.mock('../../services/roleResolution.js', () => ({ permissionsForRole: async () => perms.value }))

import router, { cleanupOldJobs } from '../winPackager.js'
import workerRouter from '../winPackagerWorker.js'
import { outputRoot } from '../../services/winPackager/outputDir.js'
import { jobDir } from '../../services/winPackager/workspace.js'
import type { Json } from '../../test/json.js'

const ALL = { 'winPackager.read': true, 'winPackager.write': true, 'winPackager.validate': true }
const GUID = '{12345678-ABCD-4EF0-9876-0123456789AB}'
const msi = () => makeMsi({ properties: { ProductCode: GUID, ProductVersion: '2.4.6', Manufacturer: 'Contoso', ProductName: 'Contoso Tool' } })

let server: http.Server
let base = ''
const realFetch = globalThis.fetch

beforeAll(async () => {
  const app = express()
  app.use('/api/win-packager-worker', workerRouter)
  app.use(express.json())
  app.use('/api/win-packager', router)
  app.use(errorHandler)
  server = http.createServer(app)
  await new Promise<void>(r => server.listen(0, r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(() => { server.close() })
beforeEach(() => {
  perms.value = { ...ALL }
  for (const k of ['WIN_PACKAGER_WORKER_URL', 'WIN_PACKAGER_WORKER_TOKEN', 'WIN_PACKAGER_PUBLIC_URL']) delete process.env[k]
  globalThis.fetch = realFetch
})

const api = (path: string, init: RequestInit = {}) =>
  realFetch(`${base}/api/win-packager${path}`, { ...init, headers: { 'x-user-role': 'IT Admin', 'x-user-email': 'eng@zinnia.com', ...(init.headers as object) } })
const json = (body: unknown): RequestInit => ({ method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
const post = (body: unknown = {}): RequestInit => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
const upload = (name: string, body: Buffer) => api('/jobs', { method: 'POST', headers: { 'x-file-name': encodeURIComponent(name), 'content-type': 'application/octet-stream' }, body: new Uint8Array(body) })
type Job = { id: string; state: string; stateReason?: string; analysis?: Json; config?: Json; validation?: Json; output?: Json; events: Array<{ action: string }> }
const read = async (res: Response) => (await res.json()) as { success: boolean; data: Json; error?: string; problems?: string[] }
const newJob = async (name = 'tool.msi', body = msi()): Promise<Job> => (await read(await upload(name, body))).data
async function waitFor(id: string, pred: (j: Job) => boolean): Promise<Job> {
  for (let i = 0; i < 100; i++) {
    const j = (await read(await api(`/jobs/${id}`))).data as Job
    if (pred(j)) return j
    await new Promise(r => setTimeout(r, 20))
  }
  throw new Error('timed out waiting for job')
}

describe('upload + inspection', () => {
  it('inspects an MSI automatically and lands in Review Required (never Ready)', async () => {
    const job = await newJob()
    expect(job.state).toBe('review-required')
    expect(job.analysis).toMatchObject({ tech: 'msi', productCode: GUID, windowsValidationRequired: true })
    expect(job.config).toMatchObject({ appName: 'Contoso Tool', installCommand: 'msiexec /i "tool.msi" /qn /norestart' })
    expect(job.events.map(e => e.action)).toEqual(expect.arrayContaining(['upload', 'inspect']))
  })
  it('marks an unreadable MSI Unsupported but keeps the job', async () => {
    const bad = Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(64, 1)])
    const job = await newJob('broken.msi', bad)
    expect(job.state).toBe('unsupported')
    expect(job.stateReason).toBeTruthy()
  })
  it('lists a ZIP, requires an installer choice, then extracts safely and inspects it', async () => {
    const zip = makeZip([{ name: 'bundle/', data: '' }, { name: 'bundle/setup.msi', data: msi(), deflate: true }, { name: 'notes.txt', data: 'x' }])
    const job = await newJob('bundle.zip', zip)
    expect(job.state).toBe('review-required')
    expect(job.config).toBeUndefined()
    expect(job.analysis.archiveEntries.filter((e: Json) => e.kind).map((e: Json) => e.name)).toEqual(['bundle/setup.msi'])

    expect((await api(`/jobs/${job.id}/select-installer`, post({ entry: 'notes.txt' }))).status).toBe(400)
    expect((await api(`/jobs/${job.id}/select-installer`, post({ entry: '../../etc/passwd' }))).status).toBe(400)
    const picked = (await read(await api(`/jobs/${job.id}/select-installer`, post({ entry: 'bundle/setup.msi' })))).data as Job
    expect(picked.analysis).toMatchObject({ tech: 'msi', productCode: GUID })
    expect(picked.config.setupFile).toBe('bundle/setup.msi')
    expect(existsSync(join(jobDir(job.id), 'content', 'bundle', 'setup.msi'))).toBe(true)
  })
  it('marks a ZIP with a traversal entry Unsupported and extracts nothing', async () => {
    const job = await newJob('evil.zip', makeZip([{ name: '../escape.msi', data: msi() }]))
    expect(job.state).toBe('unsupported')
    expect(existsSync(join(jobDir(job.id), 'content'))).toBe(false)
  })
  it('rejects unsupported types and disguised files', async () => {
    expect((await upload('x.sh', Buffer.from('#!/bin/sh'))).status).toBe(415)
    expect((await upload('x.exe', Buffer.from('#!/bin/sh'))).status).toBe(415)
  })
})

describe('configuration', () => {
  it('rejects unknown fields and reports unsafe commands as problems', async () => {
    const job = await newJob()
    expect((await api(`/jobs/${job.id}/config`, json({ evil: true }))).status).toBe(400)
    const res = await read(await api(`/jobs/${job.id}/config`, json({ installCommand: 'msiexec /i "tool.msi" & calc' })))
    expect(res.problems?.join()).toMatch(/shell operators/)
    expect((await api(`/jobs/${job.id}/artifacts/install.ps1`)).status).toBe(422)
  })
})

describe('without a Windows worker (honest degradation)', () => {
  it('reports API Unavailable, and validation is "not tested" rather than a fake success', async () => {
    expect((await read(await api('/status'))).data.windowsWorker).toMatchObject({ configured: false, state: 'api-unavailable' })
    const job = await newJob()
    const res = await read(await api(`/jobs/${job.id}/validate`, post()))
    expect(res.data.state).toBe('api-unavailable')
    expect(res.data.validation.outcome).toBe('not-tested')
    expect(res.data.validation.message).toMatch(/Package Created \/ Windows Installation Not Tested/)
  })
  it('requires approval, refuses untested approval unless explicit, then builds the package without any worker', async () => {
    const job = await newJob()
    expect((await api(`/jobs/${job.id}/package`, post())).status).toBe(409)
    expect((await api(`/jobs/${job.id}/approve`, post())).status).toBe(409)
    expect((await api(`/jobs/${job.id}/approve`, post({ acceptUntested: true }))).status).toBe(200)
    expect((await api(`/jobs/${job.id}/package`, post())).status).toBe(202)
    const done = await waitFor(job.id, j => j.state !== 'processing')
    expect(done.state).toBe('review-required') // built, but never installed on Windows
    expect(done.stateReason).toMatch(/Windows Installation Not Tested/)
    expect(done.output).toMatchObject({ fileName: 'Contoso-Tool-2.4.6-x64.intunewin', workerName: 'built-in packager' })
    const dl = await api(`/jobs/${job.id}/artifacts/package`)
    expect(dl.status).toBe(200)
    expect(Buffer.from(await dl.arrayBuffer()).subarray(0, 2).toString()).toBe('PK')
  })
  it('serves generated artifacts and has no publishing endpoints', async () => {
    const job = await newJob()
    const install = await api(`/jobs/${job.id}/artifacts/install.ps1`)
    expect(install.status).toBe(200)
    expect(await install.text()).toContain("msiexec")
    const info = JSON.parse(await (await api(`/jobs/${job.id}/artifacts/package-info.json`)).text())
    expect(info.validated).toBe(false)
    for (const gone of ['guide', 'publish', 'publishing-approval', 'icon']) expect((await api(`/jobs/${job.id}/${gone}`, post({ confirm: true }))).status).toBe(404)
    expect((await api(`/jobs/${job.id}/artifacts/package`)).status).toBe(404) // nothing built yet
  })
})

describe('output folder', () => {
  it('reports the artifacts path, refuses to open before a package exists, and needs a loopback client afterwards', async () => {
    const job = await newJob()
    const info = (await read(await api(`/jobs/${job.id}/output-folder`))).data
    expect(info.path).toBe(join(outputRoot(), 'Contoso Tool')) // <output root>/<application name>, not the internal workspace
    expect(info.path).not.toContain('win-packager/' + job.id)
    expect(info.canOpen).toBe(false)
    expect((await api(`/jobs/${job.id}/output-folder/open`, post())).status).toBe(409)
    // A proxied request (x-forwarded-for) is never treated as the local machine.
    await api(`/jobs/${job.id}/approve`, post({ acceptUntested: true }))
    await api(`/jobs/${job.id}/package`, post())
    await waitFor(job.id, j => j.state !== 'processing')
    const after = (await read(await api(`/jobs/${job.id}/output-folder`))).data
    expect(existsSync(join(after.path, 'Contoso-Tool-2.4.6-x64.intunewin'))).toBe(true)
    expect(existsSync(join(after.path, 'install.ps1'))).toBe(true)
    const proxied = await api(`/jobs/${job.id}/output-folder/open`, { ...post(), headers: { 'content-type': 'application/json', 'x-forwarded-for': '10.0.0.5' } })
    expect(proxied.status).toBe(403)
  })
})

describe('RBAC', () => {
  it.each([
    ['upload', { 'winPackager.read': true }, () => upload('a.msi', msi()), 403],
    ['config', { 'winPackager.read': true }, (id: string) => api(`/jobs/${id}/config`, json({ description: 'x' })), 403],
    ['validate', { 'winPackager.read': true, 'winPackager.write': true }, (id: string) => api(`/jobs/${id}/validate`, post()), 403],
    ['package', { 'winPackager.read': true, 'winPackager.write': true }, (id: string) => api(`/jobs/${id}/package`, post()), 403],
    ['read', {}, (id: string) => api(`/jobs/${id}`), 403],
    ['download', {}, (id: string) => api(`/jobs/${id}/artifacts/source`), 403],
  ])('blocks %s without the capability', async (_n, granted, call, status) => {
    const job = await newJob()
    perms.value = granted as Record<string, boolean>
    expect((await call(job.id)).status).toBe(status)
  })
})

// ── With a (fake) Windows worker ───────────────────────────────────────────────

interface FakeWorker { validateSteps?: Json[]; packageBytes?: Buffer; claimedHash?: string; unreachable?: boolean; canPackage?: boolean; calls: string[] }

function installWorker(fake: FakeWorker): void {
  process.env['WIN_PACKAGER_WORKER_URL'] = 'https://worker.test'
  process.env['WIN_PACKAGER_WORKER_TOKEN'] = 'worker-secret'
  process.env['WIN_PACKAGER_PUBLIC_URL'] = 'https://ito.test'
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    const u = String(url)
    if (!u.startsWith('https://worker.test')) return realFetch(url as string, init)
    const path = new URL(u).pathname
    fake.calls.push(path)
    expect((init?.headers as Record<string, string>)['authorization']).toBe('Bearer worker-secret')
    if (fake.unreachable) throw new Error('ECONNREFUSED')
    if (path === '/health') return Response.json({ name: 'WIN-BUILD-01', intuneWinAppUtil: fake.canPackage !== false })
    const body = JSON.parse(String(init?.body))
    // The worker must be able to pull the source through the signed link (rewritten to the local test server).
    const local = (link: string) => link.replace('https://ito.test', base)
    if (path === '/validate') {
      const src = await realFetch(local(body.sourceUrl))
      expect(src.status).toBe(200)
      expect(Buffer.from(await src.arrayBuffer()).subarray(0, 2).toString()).toBe('PK')
      expect(body.detectionScript).toContain('Detected')
      return Response.json({ steps: fake.validateSteps })
    }
    if (path === '/package') {
      const put = await realFetch(local(body.uploadUrl), { method: 'PUT', body: new Uint8Array(fake.packageBytes!) })
      if (!put.ok) return new Response('{}', { status: 502 })
      const { createHash } = await import('node:crypto')
      return Response.json({ fileName: body.outputName, sizeBytes: fake.packageBytes!.length, sha256: fake.claimedHash ?? createHash('sha256').update(fake.packageBytes!).digest('hex') })
    }
    return new Response('{}', { status: 404 })
  }) as typeof fetch
}

const PASS = ['install', 'detect-after-install', 'uninstall', 'detect-after-uninstall'].map(name => ({ name, status: 'pass', exitCode: 0, durationMs: 5 }))
const intunewin = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(200, 7)])

describe('with a Windows worker', () => {
  it('validates, approves and packages', async () => {
    const fake: FakeWorker = { validateSteps: PASS, packageBytes: intunewin, calls: [] }
    installWorker(fake)
    expect((await read(await api('/status'))).data.windowsWorker).toEqual({ configured: true, state: 'ready', name: 'WIN-BUILD-01', canPackage: true })
    const job = await newJob()

    expect((await api(`/jobs/${job.id}/validate`, post())).status).toBe(202)
    const validated = await waitFor(job.id, j => j.state !== 'processing')
    expect(validated.state).toBe('ready')
    expect(validated.validation).toMatchObject({ outcome: 'validated', workerName: 'WIN-BUILD-01' })

    expect((await api(`/jobs/${job.id}/approve`, post())).status).toBe(200)
    expect((await api(`/jobs/${job.id}/package`, post())).status).toBe(202)
    const packaged = await waitFor(job.id, j => j.state !== 'processing')
    expect(packaged.state).toBe('ready')
    expect(packaged.output).toMatchObject({ fileName: 'Contoso-Tool-2.4.6-x64.intunewin' })
    expect(existsSync(join(jobDir(job.id), 'artifacts', 'Contoso-Tool-2.4.6-x64.intunewin'))).toBe(true)

    const dl = await api(`/jobs/${job.id}/artifacts/package`)
    expect(dl.status).toBe(200)
    expect(Buffer.from(await dl.arrayBuffer()).length).toBe(packaged.output.sizeBytes)
    expect((await (await api(`/jobs/${job.id}/artifacts/sha256.txt`)).text())).toContain(packaged.output.sha256)

    const final = (await read(await api(`/jobs/${job.id}`))).data as Job
    expect(final.events.map(e => e.action)).toEqual(expect.arrayContaining(['upload', 'inspect', 'validate-result', 'approve', 'package-created', 'download']))
  })

  it('records Validation Failed when uninstall fails — never validated', async () => {
    installWorker({ validateSteps: PASS.map(s => (s.name === 'uninstall' ? { ...s, status: 'fail', exitCode: 1603, stderr: 'boom' } : s)), calls: [] })
    const job = await newJob()
    await api(`/jobs/${job.id}/validate`, post())
    const done = await waitFor(job.id, j => j.state !== 'processing')
    expect(done.state).toBe('validation-failed')
    expect(done.validation.outcome).toBe('failed')
    expect(done.validation.message).toMatch(/uninstall.*1603/)
    expect((await api(`/jobs/${job.id}/approve`, post())).status).toBe(409)
  })

  it('shows API Unavailable when the worker is unreachable', async () => {
    installWorker({ unreachable: true, calls: [] })
    const job = await newJob()
    const res = await read(await api(`/jobs/${job.id}/validate`, post()))
    expect(res.data.state).toBe('api-unavailable')
    expect(res.data.validation.outcome).toBe('not-tested')
  })

  it('creating an untested package yields Review Required, not Ready', async () => {
    installWorker({ packageBytes: intunewin, calls: [] })
    const job = await newJob()
    await api(`/jobs/${job.id}/approve`, post({ acceptUntested: true }))
    await api(`/jobs/${job.id}/package`, post())
    const done = await waitFor(job.id, j => j.state !== 'processing')
    expect(done.state).toBe('review-required')
    expect(done.stateReason).toMatch(/Windows Installation Not Tested/)
  })

  it('editing a command after packaging clears validation, approval and the package', async () => {
    installWorker({ validateSteps: PASS, packageBytes: intunewin, calls: [] })
    const job = await newJob()
    await api(`/jobs/${job.id}/validate`, post()); await waitFor(job.id, j => j.state !== 'processing')
    await api(`/jobs/${job.id}/approve`, post())
    await api(`/jobs/${job.id}/package`, post()); await waitFor(job.id, j => j.state !== 'processing')
    const edited = (await read(await api(`/jobs/${job.id}/config`, json({ installCommand: 'msiexec /i "tool.msi" /qn /norestart ALLUSERS=1' })))).data as Job & { approval?: unknown }
    expect(edited.validation).toBeUndefined(); expect(edited.output).toBeUndefined(); expect(edited.approval).toBeUndefined()
    expect(existsSync(join(jobDir(job.id), 'artifacts', 'Contoso-Tool-2.4.6-x64.intunewin'))).toBe(false)
  })

  it('packages an MSIX with the generated AppX scripts', async () => {
    installWorker({ validateSteps: PASS, packageBytes: intunewin, calls: [] })
    const job = await newJob('app.msix', makeMsix())
    expect(job.analysis.tech).toBe('msix')
    // MSIX commands are "likely", not verified: artifacts stay blocked until the engineer acknowledges that.
    expect((await api(`/jobs/${job.id}/artifacts/install.ps1`)).status).toBe(422)
    await api(`/jobs/${job.id}/config`, json({ acknowledgedUnverifiedCommands: true }))
    const script = await (await api(`/jobs/${job.id}/artifacts/install.ps1`)).text()
    expect(script).toContain('Add-AppxPackage')
    // The worker's source zip carries the generated wrapper scripts so the MSIX commands can run and ship in the package.
    process.env['WIN_PACKAGER_WORKER_URL'] = 'https://worker.test'; process.env['WIN_PACKAGER_WORKER_TOKEN'] = 'worker-secret'
    const { signedLink } = await import('../../services/winPackager/signing.js')
    const zipRes = await realFetch(signedLink('https://ito.test', 'worker-secret', job.id, 'source').replace('https://ito.test', base))
    const zipText = Buffer.from(await zipRes.arrayBuffer()).toString('latin1')
    expect(zipText).toContain('install.ps1'); expect(zipText).toContain('uninstall.ps1')
    expect(await (await api(`/jobs/${job.id}/artifacts/uninstall.ps1`)).text()).toContain("Get-AppxPackage -AllUsers -Name 'Contoso.Tool'")
  })
})

describe('signed worker endpoints', () => {
  it('refuse unsigned, expired, wrong-purpose and non-zip requests', async () => {
    process.env['WIN_PACKAGER_WORKER_URL'] = 'https://worker.test'
    process.env['WIN_PACKAGER_WORKER_TOKEN'] = 'worker-secret'
    process.env['WIN_PACKAGER_PUBLIC_URL'] = 'https://ito.test'
    const job = await newJob()
    const { signedLink } = await import('../../services/winPackager/signing.js')
    const local = (l: string) => l.replace('https://ito.test', base)
    expect((await realFetch(`${base}/api/win-packager-worker/${job.id}/source`)).status).toBe(403)
    expect((await realFetch(local(signedLink('https://ito.test', 'worker-secret', job.id, 'source', -1000)))).status).toBe(403)
    expect((await realFetch(local(signedLink('https://ito.test', 'wrong-secret', job.id, 'source')))).status).toBe(403)
    const outputLink = local(signedLink('https://ito.test', 'worker-secret', job.id, 'output'))
    expect((await realFetch(outputLink.replace('/output', '/source'))).status).toBe(403)
    expect((await realFetch(outputLink, { method: 'PUT', body: new Uint8Array(Buffer.from('not zip')) })).status).toBe(415)
    const ok = await realFetch(local(signedLink('https://ito.test', 'worker-secret', job.id, 'source')))
    expect(ok.status).toBe(200)
    expect(ok.headers.get('content-type')).toBe('application/zip')
  })
  it('are unavailable when no worker token is configured', async () => {
    const job = await newJob()
    expect((await realFetch(`${base}/api/win-packager-worker/${job.id}/source?exp=${Date.now() + 1e6}&sig=${'a'.repeat(64)}`)).status).toBe(403)
  })
})

describe('lifecycle', () => {
  it('deletes a job workspace and cleans up expired jobs', async () => {
    const job = await newJob()
    expect(cleanupOldJobs(14)).toBeGreaterThanOrEqual(0)
    expect(cleanupOldJobs(1, Date.now() + 3 * 86_400_000)).toBeGreaterThan(0)
    expect((await api(`/jobs/${job.id}`)).status).toBe(404)
    const j2 = await newJob()
    expect((await api(`/jobs/${j2.id}`, { method: 'DELETE' })).status).toBe(200)
    expect(existsSync(jobDir(j2.id))).toBe(false)
  })
  it('delete removes the package from the OUTPUT folder and keeps the uploaded job', async () => {
    const job = await newJob('keep.msi')
    await api(`/jobs/${job.id}/approve`, post({ acceptUntested: true }))
    await api(`/jobs/${job.id}/package`, post())
    await waitFor(job.id, j => j.state !== 'processing')
    const out = (await read(await api(`/jobs/${job.id}/output-folder`))).data.path as string
    expect(existsSync(join(out, 'Contoso-Tool-2.4.6-x64.intunewin'))).toBe(true)
    const res = await read(await api(`/jobs/${job.id}`, { method: 'DELETE' }))
    expect(res.data.jobRemoved).toBe(false)
    expect(existsSync(join(out, 'Contoso-Tool-2.4.6-x64.intunewin'))).toBe(false)
    expect(existsSync(out)).toBe(false) // empty app folder is removed
    expect(existsSync(jobDir(job.id))).toBe(true)
    const after = (await read(await api(`/jobs/${job.id}`))).data as Job & { approval?: unknown }
    expect(after.output).toBeUndefined(); expect(after.approval).toBeUndefined()
  })
})
