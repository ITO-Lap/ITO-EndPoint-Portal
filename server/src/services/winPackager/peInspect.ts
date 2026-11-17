// Read-only PE (.exe) inspection: architecture, embedded version strings, Authenticode blob, installer technology.
// Everything is parsed from bytes; the file is never executed or loaded.

import { closeSync, fstatSync, openSync, readSync } from 'node:fs'
import type { Architecture, InstallerTech } from './types.js'
import { signatureFromBlob } from './signature.js'
import type { SignatureInfo } from './types.js'

export interface PeInfo {
  architecture?: Architecture
  sections: string[]
  versionStrings: Record<string, string>
  signature: SignatureInfo
  tech: InstallerTech
  /** What matched, shown to the engineer as the reason for the technology guess. */
  techEvidence?: string
}

function readAt(fd: number, position: number, length: number): Buffer {
  const buf = Buffer.alloc(length)
  let read = 0
  while (read < length) {
    const n = readSync(fd, buf, read, length - read, position + read)
    if (n === 0) break
    read += n
  }
  return buf.subarray(0, read)
}

const MACHINES: Record<number, Architecture> = { 0x8664: 'x64', 0x14c: 'x86', 0xaa64: 'arm64' }

const VERSION_KEYS = ['ProductName', 'CompanyName', 'FileDescription', 'ProductVersion', 'FileVersion', 'OriginalFilename']

/** Reads a VS_VERSION_INFO string value: key (UTF-16, NUL-terminated), pad to 4 bytes, value (UTF-16). */
export function readVersionStrings(rsrc: Buffer): Record<string, string> {
  const out: Record<string, string> = {}
  for (const key of VERSION_KEYS) {
    const needle = Buffer.from(key + '\0', 'utf16le')
    let at = rsrc.indexOf(needle)
    while (at >= 6) {
      // A real String block has wType 1 (text) two bytes before the key; skip incidental matches elsewhere.
      if (rsrc.readUInt16LE(at - 2) === 1) {
        const blockStart = at - 6
        let valueStart = at + needle.length
        valueStart = blockStart + Math.ceil((valueStart - blockStart) / 4) * 4
        let end = valueStart
        while (end + 1 < rsrc.length && (rsrc[end] !== 0 || rsrc[end + 1] !== 0) && end - valueStart < 1024) end += 2
        const value = rsrc.subarray(valueStart, end).toString('utf16le').trim()
        if (value) out[key] = value
        break
      }
      at = rsrc.indexOf(needle, at + needle.length)
    }
  }
  return out
}

interface TechSignature { tech: InstallerTech; needle: Buffer; label: string }
const sig = (tech: InstallerTech, text: string, label = text): TechSignature => ({ tech, needle: Buffer.from(text, 'latin1'), label })
// Ordered most-specific first. Needles are plain marker strings that the installers' own runtime stubs contain.
const TECH_SIGNATURES: TechSignature[] = [
  sig('inno-setup', 'Inno Setup Setup Data'),
  sig('inno-setup', 'JR.Inno.Setup'),
  { tech: 'nsis', needle: Buffer.from([0xef, 0xbe, 0xad, 0xde, 0x4e, 0x75, 0x6c, 0x6c, 0x73, 0x6f, 0x66, 0x74, 0x49, 0x6e, 0x73, 0x74]), label: 'NSIS first-header marker' },
  sig('nsis', 'Nullsoft Install System'),
  sig('advanced-installer', 'Advanced Installer'),
  sig('squirrel', 'SquirrelSetup'),
  sig('squirrel', 'Squirrel.Windows'),
  sig('installshield', 'InstallShield'),
  sig('installshield', 'ISSetup.dll'),
]

const SCAN_CAP_BYTES = 256 * 1024 * 1024
const CHUNK = 4 * 1024 * 1024

/** Streams the file in chunks (with overlap) looking for installer-technology markers. */
export function detectTechFromBytes(fd: number, fileSize: number, sections: string[]): { tech: InstallerTech; evidence?: string } {
  if (sections.some(s => s.toLowerCase() === '.wixburn')) return { tech: 'wix-burn', evidence: 'PE section ".wixburn"' }
  const maxNeedle = Math.max(...TECH_SIGNATURES.map(s => s.needle.length))
  const found = new Map<InstallerTech, string>()
  let pos = 0
  while (pos < Math.min(fileSize, SCAN_CAP_BYTES)) {
    const buf = readAt(fd, pos, CHUNK + maxNeedle)
    if (buf.length === 0) break
    for (const s of TECH_SIGNATURES) {
      if (!found.has(s.tech) && buf.indexOf(s.needle) >= 0) found.set(s.tech, s.label)
    }
    // Inno/NSIS markers are decisive; stop scanning once one is seen.
    if (found.has('inno-setup') || found.has('nsis')) break
    pos += CHUNK
  }
  for (const s of TECH_SIGNATURES) {
    const evidence = found.get(s.tech)
    if (evidence) return { tech: s.tech, evidence: `marker "${evidence}"` }
  }
  if (sections.length && sections.some(s => s.toLowerCase().includes('wix'))) return { tech: 'wix-burn', evidence: 'WiX section' }
  return { tech: 'unknown' }
}

export class PeError extends Error {}

export function inspectPe(file: string): PeInfo {
  const fd = openSync(file, 'r')
  try {
    const fileSize = fstatSync(fd).size
    const dos = readAt(fd, 0, 64)
    if (dos.length < 64 || dos.readUInt16LE(0) !== 0x5a4d) throw new PeError('Not a PE executable.')
    const peOffset = dos.readUInt32LE(0x3c)
    const header = readAt(fd, peOffset, 24 + 240)
    if (header.length < 24 || header.readUInt32LE(0) !== 0x00004550) throw new PeError('PE header not found.')

    const machine = header.readUInt16LE(4)
    const numSections = header.readUInt16LE(6)
    const optSize = header.readUInt16LE(20)
    const opt = 24
    const magic = header.readUInt16LE(opt)
    const ddBase = opt + (magic === 0x20b ? 112 : 96)
    const securityOffset = ddBase + 4 * 8
    let certBlob: Buffer | null = null
    if (securityOffset + 8 <= header.length) {
      const certPos = header.readUInt32LE(securityOffset)
      const certSize = header.readUInt32LE(securityOffset + 4)
      // The certificate table's offset is a raw file offset. WIN_CERTIFICATE header is 8 bytes.
      if (certPos > 0 && certSize > 8 && certPos + certSize <= fileSize && certSize <= 1024 * 1024) {
        certBlob = readAt(fd, certPos + 8, certSize - 8)
      }
    }

    const sectionTable = readAt(fd, peOffset + 24 + optSize, numSections * 40)
    const sections: string[] = []
    let rsrc: { raw: number; size: number } | null = null
    for (let i = 0; i < numSections && (i + 1) * 40 <= sectionTable.length; i++) {
      const base = i * 40
      const name = sectionTable.subarray(base, base + 8).toString('latin1').replace(/\0+$/, '')
      sections.push(name)
      if (name === '.rsrc') rsrc = { size: sectionTable.readUInt32LE(base + 16), raw: sectionTable.readUInt32LE(base + 20) }
    }

    const versionStrings = rsrc && rsrc.size > 0
      ? readVersionStrings(readAt(fd, rsrc.raw, Math.min(rsrc.size, 16 * 1024 * 1024)))
      : {}
    const { tech, evidence } = detectTechFromBytes(fd, fileSize, sections)
    const arch = MACHINES[machine]
    return {
      ...(arch ? { architecture: arch } : {}),
      sections,
      versionStrings,
      signature: signatureFromBlob(certBlob),
      tech,
      ...(evidence ? { techEvidence: evidence } : {}),
    }
  } finally {
    closeSync(fd)
  }
}
