// Native .intunewin builder. Creating the package only zips and encrypts files — nothing from the uploaded
// source is executed — so it runs on this server and needs no Windows host. (Installing/validating an app
// still needs Windows; that is the worker's job.)
//
// Layout produced (the documented Win32 content-prep format):
//   <name>.intunewin            outer zip
//     IntuneWinPackage/Contents/IntunePackage.intunewin   [HMAC-SHA256 32B][IV 16B][AES-256-CBC(inner zip)]
//     IntuneWinPackage/Metadata/Detection.xml             key, MAC key, IV, MAC, digests, setup file
// Original implementation; no third-party packager source is used.

import { createCipheriv, createHash, createHmac, randomBytes } from 'node:crypto'
import { closeSync, createReadStream, createWriteStream, openSync, renameSync, rmSync, statSync, writeSync } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import { Transform, Writable } from 'node:stream'
import { join } from 'node:path'
import { ZipArchive } from 'archiver'

export interface ExtraFile { name: string; content: string }

export interface BuildInput {
  sourceDir: string
  setupFile: string
  outputFile: string
  workDir: string
  extraFiles?: ExtraFile[]
}

export interface BuildResult { sizeBytes: number; unencryptedBytes: number }

const xmlEscape = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

async function zipTo(file: string, add: (zip: ZipArchive) => void, level: number): Promise<void> {
  const out = createWriteStream(file)
  const zip = new ZipArchive({ zlib: { level } })
  const done = pipeline(zip, out)
  add(zip)
  await zip.finalize()
  await done
}

export function detectionXml(p: { setupFile: string; unencryptedBytes: number; key: Buffer; macKey: Buffer; iv: Buffer; mac: Buffer; digest: Buffer }): string {
  const b = (x: Buffer): string => x.toString('base64')
  return `<?xml version="1.0" encoding="utf-8"?>
<ApplicationInfo xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ToolVersion="1.8.4.0">
  <Name>${xmlEscape(p.setupFile)}</Name>
  <UnencryptedContentSize>${p.unencryptedBytes}</UnencryptedContentSize>
  <FileName>IntunePackage.intunewin</FileName>
  <SetupFile>${xmlEscape(p.setupFile)}</SetupFile>
  <EncryptionInfo>
    <EncryptionKey>${b(p.key)}</EncryptionKey>
    <MacKey>${b(p.macKey)}</MacKey>
    <InitializationVector>${b(p.iv)}</InitializationVector>
    <Mac>${b(p.mac)}</Mac>
    <ProfileIdentifier>ProfileVersion1</ProfileIdentifier>
    <FileDigest>${b(p.digest)}</FileDigest>
    <FileDigestAlgorithm>SHA256</FileDigestAlgorithm>
  </EncryptionInfo>
</ApplicationInfo>
`
}

export async function buildIntuneWin(input: BuildInput): Promise<BuildResult> {
  const innerZip = join(input.workDir, 'content.zip')
  const encrypted = join(input.workDir, 'IntunePackage.intunewin')
  const tmpOut = `${input.outputFile}.partial`
  try {
    // 1. Zip the source folder (the extra files sit beside the installer inside the content).
    await zipTo(innerZip, zip => {
      zip.directory(input.sourceDir, false)
      for (const f of input.extraFiles ?? []) zip.append(f.content, { name: f.name })
    }, 1)
    const unencryptedBytes = statSync(innerZip).size

    // 2. Digest of the plain content, then AES-256-CBC encrypt it with an HMAC-SHA256 over IV + ciphertext.
    const digestHash = createHash('sha256')
    await pipeline(createReadStream(innerZip), new Transform({ transform(c, _e, cb) { digestHash.update(c); cb(null, c) } }), nullSink())
    const key = randomBytes(32), macKey = randomBytes(32), iv = randomBytes(16)
    const hmac = createHmac('sha256', macKey)
    hmac.update(iv)
    const fd = openSync(encrypted, 'w', 0o600)
    try {
      writeSync(fd, Buffer.alloc(32)) // HMAC placeholder, filled in below
      writeSync(fd, iv)
    } finally { closeSync(fd) }
    const cipher = createCipheriv('aes-256-cbc', key, iv)
    const body = createWriteStream(encrypted, { flags: 'a', mode: 0o600 })
    await pipeline(createReadStream(innerZip), cipher, new Transform({ transform(c, _e, cb) { hmac.update(c); cb(null, c) } }), body)
    const mac = hmac.digest()
    const fd2 = openSync(encrypted, 'r+')
    try { writeSync(fd2, mac, 0, 32, 0) } finally { closeSync(fd2) }

    // 3. Outer zip: encrypted payload + Detection.xml.
    const xml = detectionXml({ setupFile: input.setupFile, unencryptedBytes, key, macKey, iv, mac, digest: digestHash.digest() })
    await zipTo(tmpOut, zip => {
      zip.file(encrypted, { name: 'IntuneWinPackage/Contents/IntunePackage.intunewin' })
      zip.append(xml, { name: 'IntuneWinPackage/Metadata/Detection.xml' })
    }, 0)
    renameSync(tmpOut, input.outputFile)
    return { sizeBytes: statSync(input.outputFile).size, unencryptedBytes }
  } catch (err) {
    rmSync(tmpOut, { force: true })
    throw err
  } finally {
    rmSync(innerZip, { force: true })
    rmSync(encrypted, { force: true })
  }
}

function nullSink(): Writable { return new Writable({ write(_c, _e, cb) { cb() } }) }
