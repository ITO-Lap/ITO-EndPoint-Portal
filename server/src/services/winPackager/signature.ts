// Authenticode / package signature discovery. This server runs no Windows trust APIs, so it can report that a
// signature blob EXISTS and name the leaf signing certificate, but never that it is cryptographically valid —
// that is stated on every result and only the Windows worker can upgrade it.

import { X509Certificate } from 'node:crypto'
import type { SignatureInfo } from './types.js'

export const UNVERIFIED_NOTE = 'Signature present but not cryptographically verified on this server. Windows validation required.'

/** Pulls DER certificates out of a PKCS#7 blob by scanning for SEQUENCE headers that parse as X.509. */
export function certificatesFromPkcs7(blob: Buffer): X509Certificate[] {
  const certs: X509Certificate[] = []
  for (let i = 0; i + 4 < blob.length; i++) {
    if (blob[i] !== 0x30 || blob[i + 1] !== 0x82) continue
    const len = blob.readUInt16BE(i + 2)
    if (len < 200 || i + 4 + len > blob.length) continue
    try {
      certs.push(new X509Certificate(blob.subarray(i, i + 4 + len)))
      i += 3 + len
    } catch { /* not a certificate; keep scanning */ }
  }
  return certs
}

/** CN from an X.509 subject; RFC 2253 escapes such as "NOTEPAD\\+\\+" are unescaped for display. */
export function commonName(subject: string): string | undefined {
  const m = /(?:^|\n)CN=([^\n]+)/.exec(subject)
  return m?.[1]?.replace(/\\(.)/g, '$1').trim()
}

const EKU_CODE_SIGNING = '1.3.6.1.5.5.7.3.3'

export interface CertLike { subject: string; issuer: string; ca?: boolean | undefined; keyUsage?: string[] | undefined }

/** Picks the code-signing leaf. A PKCS#7 blob also carries the CA chain and the timestamp responder, so the
 *  first non-CA certificate is not necessarily the publisher. */
export function pickSigner<T extends CertLike>(certs: T[]): T | undefined {
  const leafs = certs.filter(c => c.ca !== true)
  return leafs.find(c => c.keyUsage?.includes(EKU_CODE_SIGNING))
    ?? leafs.find(c => !c.keyUsage || c.keyUsage.length === 0 ? false : !c.keyUsage.includes('1.3.6.1.5.5.7.3.8'))
    ?? certs.find(c => c.subject !== c.issuer && c.ca !== true)
}

/** Builds a SignatureInfo from a raw PKCS#7 blob (or reports unsigned when there is none). */
export function signatureFromBlob(blob: Buffer | null): SignatureInfo {
  if (!blob || blob.length === 0) return { status: 'unsigned', note: 'No digital signature found in the file.' }
  const certs = certificatesFromPkcs7(blob)
  const leaf = pickSigner(certs.map(c => ({ subject: c.subject, issuer: c.issuer, ca: c.ca, keyUsage: c.keyUsage })))
  const signer = leaf ? commonName(leaf.subject) : undefined
  return { status: 'present-unverified', ...(signer ? { signer } : {}), note: UNVERIFIED_NOTE }
}
