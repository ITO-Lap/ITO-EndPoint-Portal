// Read-only MSI inspection. An .msi is an OLE compound file holding a relational database; we decode just the
// Property table (ProductCode, ProductVersion, ...) and the SummaryInformation template (architecture) from the
// documented stream layout. The installer is never executed or opened by Windows Installer.

import { readFileSync } from 'node:fs'
import CFB from 'cfb'
import type { Architecture, SignatureInfo } from './types.js'
import { signatureFromBlob } from './signature.js'

export interface MsiInfo {
  properties: Record<string, string>
  architecture?: Architecture
  signature: SignatureInfo
}

export class MsiError extends Error {}

const NAME_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz._'

/** Decodes an MSI storage-stream name (two characters are packed into one UTF-16 unit; U+4840 prefixes a table). */
export function decodeMsiStreamName(name: string): string {
  let out = ''
  for (const ch of name) {
    const c = ch.codePointAt(0) ?? 0
    if (c >= 0x3800 && c < 0x4800) {
      const v = c - 0x3800
      out += NAME_ALPHABET.charAt(v & 0x3f) + NAME_ALPHABET.charAt((v >> 6) & 0x3f)
    } else if (c >= 0x4800 && c < 0x4840) {
      out += NAME_ALPHABET.charAt(c - 0x4800)
    } else if (c === 0x4840) {
      out += '!'
    } else {
      out += ch
    }
  }
  return out
}

/** Inverse of decodeMsiStreamName; used to build test fixtures that follow the real layout. */
export function encodeMsiStreamName(name: string, table = true): string {
  let out = table ? String.fromCodePoint(0x4840) : ''
  const chars = [...name]
  for (let i = 0; i < chars.length; i += 2) {
    const a = NAME_ALPHABET.indexOf(chars[i]!)
    const b = i + 1 < chars.length ? NAME_ALPHABET.indexOf(chars[i + 1]!) : -1
    if (a < 0 || (i + 1 < chars.length && b < 0)) throw new Error(`Unencodable MSI name: ${name}`)
    out += b >= 0 ? String.fromCodePoint(0x3800 + a + (b << 6)) : String.fromCodePoint(0x4800 + a)
  }
  return out
}

function parseStringPool(pool: Uint8Array, data: Uint8Array): { strings: string[]; refSize: number } {
  const poolBuf = Buffer.from(pool)
  const dataBuf = Buffer.from(data)
  if (poolBuf.length < 4) throw new MsiError('MSI string pool is empty.')
  const header = poolBuf.readUInt32LE(0)
  const refSize = header & 0x80000000 ? 3 : 2
  const codepage = header & 0x7fffffff
  const encoding: BufferEncoding = codepage === 65001 ? 'utf-8' : 'latin1'
  const strings: string[] = ['']
  let dataPos = 0
  for (let p = 4; p + 4 <= poolBuf.length; p += 4) {
    const size = poolBuf.readUInt16LE(p)
    const refs = poolBuf.readUInt16LE(p + 2)
    if (size === 0 && refs !== 0) throw new MsiError('MSI contains an oversized string entry that is not supported.')
    strings.push(dataBuf.subarray(dataPos, dataPos + size).toString(encoding))
    dataPos += size
  }
  return { strings, refSize }
}

/** Property table = two string-reference columns stored column-major (all keys, then all values). */
function parsePropertyTable(stream: Uint8Array, strings: string[], refSize: number): Record<string, string> {
  const buf = Buffer.from(stream)
  const rowSize = refSize * 2
  const rows = Math.floor(buf.length / rowSize)
  const readRef = (offset: number): number => (refSize === 3 ? buf.readUIntLE(offset, 3) : buf.readUInt16LE(offset))
  const out: Record<string, string> = {}
  for (let r = 0; r < rows; r++) {
    const key = strings[readRef(r * refSize)]
    const value = strings[readRef(rows * refSize + r * refSize)]
    if (key) out[key] = value ?? ''
  }
  return out
}

/** SummaryInformation property 7 is the Template: "x64;1033", "Intel;1033", "Arm64;1033". */
function templateFromSummary(stream: Uint8Array): string | undefined {
  const buf = Buffer.from(stream)
  try {
    const sectionOffset = buf.readUInt32LE(44)
    const count = buf.readUInt32LE(sectionOffset + 4)
    for (let i = 0; i < count; i++) {
      const pid = buf.readUInt32LE(sectionOffset + 8 + i * 8)
      const off = buf.readUInt32LE(sectionOffset + 12 + i * 8)
      if (pid !== 7) continue
      const type = buf.readUInt32LE(sectionOffset + off)
      if (type !== 0x1e) return undefined
      const len = buf.readUInt32LE(sectionOffset + off + 4)
      return buf.subarray(sectionOffset + off + 8, sectionOffset + off + 8 + len).toString('latin1').replace(/\0+$/, '')
    }
  } catch { /* malformed summary stream: architecture simply stays unknown */ }
  return undefined
}

export function architectureFromTemplate(template: string | undefined): Architecture | undefined {
  const platform = template?.split(';')[0]?.trim().toLowerCase()
  if (!platform) return undefined
  if (platform === 'x64' || platform === 'amd64') return 'x64'
  if (platform === 'arm64') return 'arm64'
  if (platform === 'intel' || platform === 'x86') return 'x86'
  return undefined
}

export function inspectMsi(file: string): MsiInfo {
  let container: CFB.CFB$Container
  try {
    container = CFB.read(readFileSync(file), { type: 'buffer' })
  } catch {
    throw new MsiError('File is not a readable MSI database.')
  }
  const streams = new Map<string, Uint8Array>()
  for (const entry of container.FileIndex) {
    if (entry.type === 2 && entry.content) streams.set(decodeMsiStreamName(entry.name), entry.content as Uint8Array)
  }
  const pool = streams.get('!_StringPool')
  const data = streams.get('!_StringData')
  const prop = streams.get('!Property')
  if (!pool || !data || !prop) throw new MsiError('MSI is missing its Property table.')
  const { strings, refSize } = parseStringPool(pool, data)
  const properties = parsePropertyTable(prop, strings, refSize)

  const summary = [...streams.entries()].find(([n]) => n.endsWith('SummaryInformation'))?.[1]
  const architecture = architectureFromTemplate(summary ? templateFromSummary(summary) : undefined)
  const digital = [...streams.entries()].find(([n]) => n.endsWith('DigitalSignature'))?.[1]
  return {
    properties,
    ...(architecture ? { architecture } : {}),
    signature: signatureFromBlob(digital ? Buffer.from(digital) : null),
  }
}
