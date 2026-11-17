// Test fixtures that follow the real on-disk layouts (MSI compound file, ZIP, PE) so the parsers are exercised
// against documented formats rather than mocks.

import { deflateRawSync } from 'node:zlib'
import CFB from 'cfb'
import { encodeMsiStreamName } from '../msiInspect.js'

// ── ZIP ────────────────────────────────────────────────────────────────────────

export interface ZipFixtureEntry { name: string; data?: Buffer | string; deflate?: boolean; unixMode?: number; declaredSize?: number }

function crc32(buf: Buffer): number {
  let c: number
  let crc = 0xffffffff
  for (const byte of buf) {
    c = (crc ^ byte) & 0xff
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    crc = (crc >>> 8) ^ c
  }
  return (crc ^ 0xffffffff) >>> 0
}

export function makeZip(entries: ZipFixtureEntry[]): Buffer {
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0
  for (const e of entries) {
    const name = Buffer.from(e.name, 'utf-8')
    const raw = Buffer.isBuffer(e.data) ? e.data : Buffer.from(e.data ?? '', 'utf-8')
    const method = e.deflate ? 8 : 0
    const body = e.deflate ? deflateRawSync(raw) : raw
    const size = e.declaredSize ?? raw.length
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(method, 8)
    local.writeUInt32LE(crc32(raw), 14); local.writeUInt32LE(body.length, 18); local.writeUInt32LE(size, 22)
    local.writeUInt16LE(name.length, 26)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(method, 10)
    central.writeUInt32LE(crc32(raw), 16); central.writeUInt32LE(body.length, 20); central.writeUInt32LE(size, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt32LE(((e.unixMode ?? 0o100644) << 16) >>> 0, 38)
    central.writeUInt32LE(offset, 42)
    locals.push(local, name, body)
    centrals.push(central, name)
    offset += 30 + name.length + body.length
  }
  const cd = Buffer.concat(centrals)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(entries.length, 8); eocd.writeUInt16LE(entries.length, 10)
  eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, cd, eocd])
}

// ── MSI ────────────────────────────────────────────────────────────────────────

export interface MsiFixture { properties: Record<string, string>; template?: string }

export function makeMsi({ properties, template = 'x64;1033' }: MsiFixture): Buffer {
  const strings: string[] = []
  const ref = (s: string): number => { let i = strings.indexOf(s); if (i < 0) { strings.push(s); i = strings.length - 1 } return i + 1 }
  const keys = Object.keys(properties)
  const keyRefs = keys.map(ref)
  const valueRefs = keys.map(k => ref(properties[k]!))

  const pool = Buffer.alloc(4 + strings.length * 4)
  pool.writeUInt32LE(1252, 0)
  strings.forEach((s, i) => { pool.writeUInt16LE(Buffer.byteLength(s), 4 + i * 4); pool.writeUInt16LE(1, 6 + i * 4) })
  const data = Buffer.concat(strings.map(s => Buffer.from(s, 'latin1')))

  const prop = Buffer.alloc(keys.length * 4)
  keyRefs.forEach((r, i) => prop.writeUInt16LE(r, i * 2))
  valueRefs.forEach((r, i) => prop.writeUInt16LE(r, keys.length * 2 + i * 2))

  // OLE property set with a single section; property 7 = Template (VT_LPSTR).
  const tpl = Buffer.from(template + '\0', 'latin1')
  const section = Buffer.alloc(8 + 8 + 8 + tpl.length)
  section.writeUInt32LE(section.length, 0); section.writeUInt32LE(1, 4)
  section.writeUInt32LE(7, 8); section.writeUInt32LE(16, 12)
  section.writeUInt32LE(0x1e, 16); section.writeUInt32LE(tpl.length, 20); tpl.copy(section, 24)
  const header = Buffer.alloc(48)
  header.writeUInt16LE(0xfffe, 0); header.writeUInt32LE(1, 24); header.writeUInt32LE(48, 44)
  const summary = Buffer.concat([header, section])

  const cfb = CFB.utils.cfb_new()
  CFB.utils.cfb_add(cfb, encodeMsiStreamName('_StringPool'), pool)
  CFB.utils.cfb_add(cfb, encodeMsiStreamName('_StringData'), data)
  CFB.utils.cfb_add(cfb, encodeMsiStreamName('Property'), prop)
  CFB.utils.cfb_add(cfb, '\u0005SummaryInformation', summary)
  return Buffer.from(CFB.write(cfb, { type: 'buffer' }) as Uint8Array)
}

// ── MSIX ───────────────────────────────────────────────────────────────────────

export const CALC_PUBLISHER = 'CN=Microsoft Corporation, O=Microsoft Corporation, L=Redmond, S=Washington, C=US'

export function makeMsix(opts: { name?: string; publisher?: string; version?: string; arch?: string } = {}): Buffer {
  const manifest = `<?xml version="1.0" encoding="utf-8"?>
<Package xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10">
  <Identity Name="${opts.name ?? 'Contoso.Tool'}" Publisher="${opts.publisher ?? 'CN=Contoso'}" Version="${opts.version ?? '1.2.3.0'}" ProcessorArchitecture="${opts.arch ?? 'x64'}" />
  <Properties><DisplayName>Contoso Tool</DisplayName><PublisherDisplayName>Contoso Ltd</PublisherDisplayName></Properties>
  <Dependencies><TargetDeviceFamily Name="Windows.Desktop" MinVersion="10.0.17763.0" MaxVersionTested="10.0.22000.0" /></Dependencies>
</Package>`
  return makeZip([{ name: 'AppxManifest.xml', data: manifest, deflate: true }, { name: 'app.exe', data: 'MZ' }])
}

// ── PE ─────────────────────────────────────────────────────────────────────────

const utf16z = (s: string): Buffer => Buffer.from(s + '\0', 'utf16le')

/** One VS_VERSION_INFO-style String block: wLength, wValueLength, wType=1, key, pad4, value. */
function versionString(key: string, value: string): Buffer {
  const k = utf16z(key)
  const head = Buffer.alloc(6)
  const pre = Buffer.concat([head, k])
  const pad = Buffer.alloc((4 - (pre.length % 4)) % 4)
  const v = utf16z(value)
  const out = Buffer.concat([pre, pad, v])
  out.writeUInt16LE(out.length, 0); out.writeUInt16LE(value.length + 1, 2); out.writeUInt16LE(1, 4)
  return Buffer.concat([out, Buffer.alloc((4 - (out.length % 4)) % 4)])
}

export interface PeFixture { machine?: number; version?: Record<string, string>; marker?: Buffer | string; sectionNames?: string[]; signed?: boolean; extraBytes?: number }

export function makePe(opts: PeFixture = {}): Buffer {
  const machine = opts.machine ?? 0x8664
  const names = opts.sectionNames ?? ['.text', '.rsrc']
  const rsrc = Buffer.concat(Object.entries(opts.version ?? {}).map(([k, v]) => versionString(k, v)))
  const peOffset = 0x80
  const optSize = 240 // PE32+ optional header
  const sectionTableAt = peOffset + 24 + optSize
  const dataStart = Math.ceil((sectionTableAt + names.length * 40) / 512) * 512
  const rsrcSize = rsrc.length
  const marker = opts.marker ? Buffer.from(opts.marker as string, 'latin1') : Buffer.alloc(0)
  const certBlob = opts.signed ? Buffer.concat([Buffer.alloc(8), Buffer.from('fake-pkcs7')]) : Buffer.alloc(0)
  const total = dataStart + rsrcSize + marker.length + (opts.extraBytes ?? 0) + certBlob.length
  const buf = Buffer.alloc(total)
  buf.write('MZ', 0, 'latin1'); buf.writeUInt32LE(peOffset, 0x3c)
  buf.writeUInt32LE(0x00004550, peOffset)
  buf.writeUInt16LE(machine, peOffset + 4); buf.writeUInt16LE(names.length, peOffset + 6); buf.writeUInt16LE(optSize, peOffset + 20)
  buf.writeUInt16LE(0x20b, peOffset + 24)
  const certAt = dataStart + rsrcSize + marker.length + (opts.extraBytes ?? 0)
  if (opts.signed) {
    const ddSecurity = peOffset + 24 + 112 + 4 * 8
    buf.writeUInt32LE(certAt, ddSecurity); buf.writeUInt32LE(certBlob.length, ddSecurity + 4)
    certBlob.copy(buf, certAt)
  }
  names.forEach((n, i) => {
    const at = sectionTableAt + i * 40
    buf.write(n, at, 'latin1')
    if (n === '.rsrc') { buf.writeUInt32LE(rsrcSize, at + 16); buf.writeUInt32LE(dataStart, at + 20) }
  })
  rsrc.copy(buf, dataStart)
  marker.copy(buf, dataStart + rsrcSize)
  return buf
}
