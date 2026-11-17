// Read-only MSIX/AppX inspection: parses AppxManifest.xml out of the package zip and derives the package family
// name from the publisher string using Microsoft's documented hashing scheme.

import { createHash } from 'node:crypto'
import type { Architecture, SignatureInfo } from './types.js'
import { listZipEntries, readZipEntry } from './zipSafe.js'
import { signatureFromBlob } from './signature.js'

export interface MsixInfo {
  identityName: string
  publisher: string
  version: string
  architecture?: Architecture
  displayName?: string
  publisherDisplayName?: string
  packageFamilyName: string
  minOsVersion?: string
  signature: SignatureInfo
}

export class MsixError extends Error {}

const attr = (tag: string, name: string): string | undefined =>
  new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, 'i').exec(tag)?.[1]

const decodeXml = (s: string): string => s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')

// Windows' base-32 alphabet for publisher ids (no a, e, i, o... style vowels: "0123456789abcdefghjkmnpqrstvwxyz").
const PUBLISHER_ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz'

/** 13-character publisher id: first 8 bytes of SHA-256(UTF-16LE publisher), base-32 encoded 5 bits at a time. */
export function publisherId(publisher: string): string {
  const hash = createHash('sha256').update(Buffer.from(publisher, 'utf16le')).digest().subarray(0, 8)
  let bits = ''
  for (const byte of hash) bits += byte.toString(2).padStart(8, '0')
  bits = bits.padEnd(65, '0')
  let out = ''
  for (let i = 0; i < 65; i += 5) out += PUBLISHER_ALPHABET[parseInt(bits.slice(i, i + 5), 2)]
  return out
}

const ARCH: Record<string, Architecture> = { x64: 'x64', x86: 'x86', arm64: 'arm64' }

export async function inspectMsix(file: string): Promise<MsixInfo> {
  const manifest = await readZipEntry(file, 'AppxManifest.xml')
  if (!manifest) throw new MsixError('AppxManifest.xml not found — this is not a single MSIX/AppX package (bundles are not supported).')
  const xml = manifest.toString('utf-8')
  const identity = /<Identity\b[^>]*>/i.exec(xml)?.[0]
  if (!identity) throw new MsixError('AppxManifest.xml has no Identity element.')
  const name = attr(identity, 'Name')
  const publisher = attr(identity, 'Publisher')
  const version = attr(identity, 'Version')
  if (!name || !publisher || !version) throw new MsixError('AppxManifest.xml Identity is incomplete.')
  const publisherDecoded = decodeXml(publisher)
  const arch = ARCH[(attr(identity, 'ProcessorArchitecture') ?? '').toLowerCase()]
  const displayName = /<DisplayName>([^<]*)<\/DisplayName>/i.exec(xml)?.[1]
  const publisherDisplayName = /<PublisherDisplayName>([^<]*)<\/PublisherDisplayName>/i.exec(xml)?.[1]
  const minOsVersion = attr(/<TargetDeviceFamily\b[^>]*>/i.exec(xml)?.[0] ?? '', 'MinVersion')

  const signatureEntry = listZipEntries(file).find(e => e.name === 'AppxSignature.p7x')
  let signature: SignatureInfo = signatureFromBlob(null)
  if (signatureEntry) {
    const blob = await readZipEntry(file, 'AppxSignature.p7x', 1024 * 1024)
    // The .p7x file is a 4-byte "PKCX" marker followed by a PKCS#7 blob.
    signature = signatureFromBlob(blob ? blob.subarray(4) : null)
  }

  return {
    identityName: name,
    publisher: publisherDecoded,
    version,
    ...(arch ? { architecture: arch } : {}),
    ...(displayName && !displayName.startsWith('ms-resource:') ? { displayName: decodeXml(displayName) } : {}),
    ...(publisherDisplayName && !publisherDisplayName.startsWith('ms-resource:') ? { publisherDisplayName: decodeXml(publisherDisplayName) } : {}),
    packageFamilyName: `${name}_${publisherId(publisherDecoded)}`,
    ...(minOsVersion ? { minOsVersion } : {}),
    signature,
  }
}
