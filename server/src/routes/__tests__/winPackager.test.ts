import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import express from 'express'
import http from 'node:http'
import type { AddressInfo } from 'net'
import { errorHandler } from '../../middleware/errorHandler.js'

vi.mock('../../db/index.js', () => ({ isDbAvailable: vi.fn(() => false), query: vi.fn() }))
const perms = vi.hoisted(() => ({ value: { 'winPackager.read': true, 'winPackager.write': true } as Record<string, boolean> }))
vi.mock('../../services/roleResolution.js', () => ({ permissionsForRole: async () => perms.value }))

import router from '../winPackager.js'
import { makeMsi } from '../../services/winPackager/__tests__/fixtures.js'
import { isValidJobId, jobDir, magicMatches, sanitizeFileName, sourceTypeFor, packagerLimits } from '../../services/winPackager/workspace.js'

let server: http.Server
let base = ''

beforeAll(async () => {
  const app = express()
  app.use(express.json())
  app.use('/api/win-packager', router)
  app.use(errorHandler)
  server = http.createServer(app)
  await new Promise<void>(r => server.listen(0, r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/win-packager`
})
afterAll(() => { server.close() })

const msiBytes = Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(64, 1)])
const upload = (name: string, body: Buffer) =>
  fetch(`${base}/jobs`, { method: 'POST', headers: { 'x-file-name': encodeURIComponent(name), 'content-type': 'application/octet-stream', 'x-user-role': 'IT Admin' }, body: new Uint8Array(body) })

describe('winPackager workspace helpers', () => {
  it('rejects path traversal and bad ids', () => {
    expect(isValidJobId('../../etc')).toBe(false)
    expect(() => jobDir('../x')).toThrow()
  })
  it('flattens hostile file names', () => {
    expect(sanitizeFileName('..\\..\\evil/../app.msi')).toBe('app.msi')
    expect(sanitizeFileName('a;rm -rf.exe')).toBe('a_rm -rf.exe')
  })
  it('maps types and checks magic bytes', () => {
    expect(sourceTypeFor('x.MSI')).toBe('msi')
    expect(sourceTypeFor('x.sh')).toBeNull()
    expect(magicMatches('exe', Buffer.from('MZ....'))).toBe(true)
    expect(magicMatches('exe', Buffer.from('#!/bin/sh'))).toBe(false)
  })
  it('caps the configured upload limit at the 30 GB Intune limit', () => {
    expect(packagerLimits({ WIN_PACKAGER_MAX_UPLOAD_MB: '999999999' }).maxUploadBytes).toBe(30 * 1024 ** 3)
  })
})

describe('winPackager API', () => {
  it('stores an MSI, hashes it and reports Review Required (never Ready)', async () => {
    const real = makeMsi({ properties: { ProductCode: '{12345678-ABCD-4EF0-9876-0123456789AB}', ProductVersion: '1.0' } })
    const res = await upload('app.msi', real)
    expect(res.status).toBe(201)
    const { data } = await res.json() as { data: { id: string; state: string; source: { sha256: string; sizeBytes: number } } }
    expect(data.state).toBe('review-required')
    expect(data.source.sizeBytes).toBe(real.length)
    expect(data.source.sha256).toMatch(/^[0-9a-f]{64}$/)
    const got = await fetch(`${base}/jobs/${data.id}`)
    expect(got.status).toBe(200)
  })
  it('keeps an unreadable MSI but marks it Unsupported (never Ready)', async () => {
    const res = await upload('corrupt.msi', msiBytes)
    expect(res.status).toBe(201)
    expect(((await res.json()) as { data: { state: string } }).data.state).toBe('unsupported')
  })
  it('rejects unsupported types and mismatched content', async () => {
    expect((await upload('run.sh', msiBytes)).status).toBe(415)
    expect((await upload('fake.exe', Buffer.from('not an exe at all'))).status).toBe(415)
  })
  it('rejects empty uploads', async () => {
    expect((await upload('app.msi', Buffer.alloc(0))).status).toBe(400)
  })
  it('reports the Windows worker as unavailable', async () => {
    const body = await (await fetch(`${base}/status`)).json() as { data: { windowsWorker: { state: string } } }
    expect(body.data.windowsWorker.state).toBe('api-unavailable')
  })
  it('requires the write permission to upload', async () => {
    perms.value = { 'winPackager.read': true }
    expect((await upload('app.msi', msiBytes)).status).toBe(403)
    perms.value = { 'winPackager.read': true, 'winPackager.write': true }
  })
  it('404s for unknown or malformed job ids', async () => {
    expect((await fetch(`${base}/jobs/not-a-uuid`)).status).toBe(404)
  })
})
