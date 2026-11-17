import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import express from 'express'
import http from 'node:http'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AddressInfo } from 'net'
import { errorHandler } from '../../middleware/errorHandler.js'

const audit = vi.hoisted(() => ({ calls: [] as Array<Record<string, unknown>> }))
vi.mock('../../services/auditLog.js', () => ({ recordAuditLog: async (e: Record<string, unknown>) => { audit.calls.push(e) } }))
const perms = vi.hoisted(() => ({ value: { 'macPackager.read': true } as Record<string, boolean> }))
vi.mock('../../services/roleResolution.js', () => ({ permissionsForRole: async () => perms.value }))

import router from '../macPackager.js'
import { BUILD_NAME, readSyncInfo, resolveBuild, listBuilds } from '../../services/macPackager.js'

let server: http.Server
let base = ''
let dist: string
const DMG = Buffer.from('fake-dmg-bytes-'.repeat(100))

beforeAll(async () => {
  dist = mkdtempSync(join(tmpdir(), 'mac-dist-'))
  writeFileSync(join(dist, 'App Package Builder-1.0.0.dmg'), DMG)
  writeFileSync(join(dist, 'notes.txt'), 'not an installer')
  writeFileSync(join(dist, '.hidden.dmg'), 'x')
  writeFileSync(join(dist, 'secret.key'), 'k')
  mkdirSync(join(dist, 'dir.dmg'))
  const outside = mkdtempSync(join(tmpdir(), 'mac-outside-')); writeFileSync(join(outside, 'leak.dmg'), 'LEAK')
  symlinkSync(join(outside, 'leak.dmg'), join(dist, 'link.dmg'))
  const app = express()
  app.use('/api/mac-packager', router)
  app.use(errorHandler)
  server = http.createServer(app)
  await new Promise<void>(r => server.listen(0, r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/mac-packager`
})
afterAll(() => { server.close(); rmSync(dist, { recursive: true, force: true }) })
beforeEach(() => { perms.value = { 'macPackager.read': true }; audit.calls.length = 0; delete process.env['MAC_PACKAGE_BUILDER_DIST_DIR'] })
interface InfoBody { success: boolean; data: {
  source: { bundled: boolean }; runsOn: string; features: Array<{ title: string }>; buildSteps: Array<{ command: string }>
  downloads: { configured: boolean; builds: Array<{ name: string; sizeBytes: number; kind: string; sha256: string }> }
} }
const get = (p: string) => fetch(`${base}${p}`, { headers: { 'x-user-role': 'IT Admin', 'x-user-email': 'eng@zinnia.com' } })

describe('Mac Package Builder API', () => {
  it('describes the app honestly when no build is published', async () => {
    const body = await (await get('/info')).json() as InfoBody
    expect(body.success).toBe(true)
    expect(body.data.downloads).toEqual({ configured: false, builds: [] })
    expect(body.data.runsOn).toMatch(/macOS only/)
    expect(body.data.features.map(f => f.title)).toEqual(expect.arrayContaining(['macOS packages', 'Local Installer → .intunewin']))
    expect(body.data.buildSteps.some(s => /swift test/.test(s.command))).toBe(true)
    expect(typeof body.data.source.bundled).toBe('boolean')
  })

  it('lists only plain installer files from the published folder, with a real SHA-256', async () => {
    process.env['MAC_PACKAGE_BUILDER_DIST_DIR'] = dist
    const { downloads } = (await (await get('/info')).json() as InfoBody).data
    expect(downloads.configured).toBe(true)
    expect(downloads.builds.map(b => b.name)).toEqual(['App Package Builder-1.0.0.dmg'])
    expect(downloads.builds[0]).toMatchObject({ sizeBytes: DMG.length, kind: 'dmg', sha256: createHash('sha256').update(DMG).digest('hex') })
  })

  it('downloads a published build and records an audit entry', async () => {
    process.env['MAC_PACKAGE_BUILDER_DIST_DIR'] = dist
    const res = await get('/download/' + encodeURIComponent('App Package Builder-1.0.0.dmg'))
    expect(res.status).toBe(200)
    expect(Buffer.from(await res.arrayBuffer()).equals(DMG)).toBe(true)
    expect(audit.calls[0]).toMatchObject({ userEmail: 'eng@zinnia.com', action: 'macPackager.download', resourceId: 'App Package Builder-1.0.0.dmg' })
  })

  it.each([
    '..%2F..%2Fetc%2Fpasswd', '%2e%2e%2fsecret.key', 'notes.txt', 'secret.key', '.hidden.dmg', 'dir.dmg', 'link.dmg', 'missing.dmg', '..%5C..%5Cx.dmg', 'a%00.dmg',
  ])('refuses %s', async name => {
    process.env['MAC_PACKAGE_BUILDER_DIST_DIR'] = dist
    const res = await get('/download/' + name)
    expect([400, 404]).toContain(res.status)
    expect(audit.calls).toHaveLength(0)
  })

  it('refuses downloads when no folder is configured', async () => {
    expect((await get('/download/App%20Package%20Builder-1.0.0.dmg')).status).toBe(404)
  })

  it('requires the macPackager.read permission', async () => {
    perms.value = {}
    expect((await get('/info')).status).toBe(403)
    expect((await get('/download/x.dmg')).status).toBe(403)
  })
})

describe('mac packager helpers', () => {
  it('accepts only installer-looking names', () => {
    for (const ok of ['App Package Builder-1.0.0.dmg', 'a.pkg', 'x-1_2.ZIP']) expect(BUILD_NAME.test(ok)).toBe(true)
    for (const bad of ['../a.dmg', 'a/b.dmg', '.a.dmg', 'a.exe', 'a.dmg.txt', 'a\\b.dmg', '']) expect(BUILD_NAME.test(bad)).toBe(false)
    expect(resolveBuild(dist, '../x.dmg')).toBeNull()
    expect(resolveBuild(null, 'a.dmg')).toBeNull()
    expect(listBuilds(null)).toEqual([])
  })
  it('parses the sync marker and tolerates its absence', () => {
    const root = mkdtempSync(join(tmpdir(), 'mac-app-'))
    expect(readSyncInfo(root)).toEqual({ bundled: false, sync: {} })
    writeFileSync(join(root, 'Package.swift'), '// swift')
    expect(readSyncInfo(root)).toEqual({ bundled: true, sync: {} })
    writeFileSync(join(root, '.synced-from'), 'Mirrored from: /x/Apps Package Builder\nOriginal repo commit: f919703 (the working tree may be newer)\nSynced at: 2026-11-17T13:15:54Z\n')
    expect(readSyncInfo(root).sync).toEqual({ mirroredFrom: '/x/Apps Package Builder', originalCommit: 'f919703', syncedAt: '2026-11-17T13:15:54Z' })
    rmSync(root, { recursive: true, force: true })
  })
})
