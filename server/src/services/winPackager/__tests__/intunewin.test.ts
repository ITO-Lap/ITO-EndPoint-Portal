import { describe, it, expect } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { createDecipheriv, createHash, createHmac } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildIntuneWin } from '../intunewin.js'
import { listZipEntries, readZipEntry } from '../zipSafe.js'

describe('buildIntuneWin', () => {
  it('produces a package whose MAC, digest and contents verify after decryption', async () => {
    const root = mkdtempSync(join(tmpdir(), 'iw-'))
    const src = join(root, 'src'), work = join(root, 'work')
    mkdirSync(src); mkdirSync(work)
    writeFileSync(join(src, 'setup.exe'), Buffer.alloc(200_000, 7))
    const out = join(root, 'App-1.0-x64.intunewin')
    const r = await buildIntuneWin({ sourceDir: src, setupFile: 'setup.exe', outputFile: out, workDir: work, extraFiles: [{ name: 'install.ps1', content: 'x' }] })
    expect(r.sizeBytes).toBeGreaterThan(0)
    expect(existsSync(`${out}.partial`)).toBe(false)
    expect(readdirSync(work)).toEqual([]) // temp files cleaned up

    const names = listZipEntries(out).map(e => e.name)
    expect(names).toEqual(expect.arrayContaining(['IntuneWinPackage/Contents/IntunePackage.intunewin', 'IntuneWinPackage/Metadata/Detection.xml']))
    const xml = (await readZipEntry(out, 'IntuneWinPackage/Metadata/Detection.xml'))!.toString('utf-8')
    const tag = (n: string): Buffer => Buffer.from(new RegExp(`<${n}>([^<]+)</${n}>`).exec(xml)![1]!, 'base64')
    expect(xml).toContain('<SetupFile>setup.exe</SetupFile>')

    const payload = (await readZipEntry(out, 'IntuneWinPackage/Contents/IntunePackage.intunewin', 1 << 30))!
    const mac = payload.subarray(0, 32), iv = payload.subarray(32, 48), body = payload.subarray(48)
    expect(mac.equals(tag('Mac'))).toBe(true)
    expect(createHmac('sha256', tag('MacKey')).update(payload.subarray(32)).digest().equals(mac)).toBe(true)
    const d = createDecipheriv('aes-256-cbc', tag('EncryptionKey'), iv)
    const plain = Buffer.concat([d.update(body), d.final()])
    expect(plain.length).toBe(r.unencryptedBytes)
    expect(createHash('sha256').update(plain).digest().equals(tag('FileDigest'))).toBe(true)
    expect(plain.subarray(0, 2).toString()).toBe('PK') // inner content is a zip
  })
})
