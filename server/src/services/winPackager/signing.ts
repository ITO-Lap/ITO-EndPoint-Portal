// Short-lived, job-scoped, purpose-scoped HMAC links so the Windows worker can pull the source folder and push the
// finished package without holding a user session. The HMAC key is the worker token, which never leaves the server.

import { createHmac, timingSafeEqual } from 'node:crypto'

export type LinkPurpose = 'source' | 'output'

const sign = (secret: string, jobId: string, purpose: LinkPurpose, exp: number): string =>
  createHmac('sha256', secret).update(`${jobId}.${purpose}.${exp}`).digest('hex')

export function signedLink(base: string, secret: string, jobId: string, purpose: LinkPurpose, ttlMs = 30 * 60 * 1000, now = Date.now()): string {
  const exp = now + ttlMs
  return `${base.replace(/\/$/, '')}/api/win-packager-worker/${jobId}/${purpose}?exp=${exp}&sig=${sign(secret, jobId, purpose, exp)}`
}

export function verifyLink(secret: string, jobId: string, purpose: LinkPurpose, exp: unknown, sig: unknown, now = Date.now()): boolean {
  const e = Number(exp)
  if (!Number.isFinite(e) || e < now || typeof sig !== 'string' || !/^[0-9a-f]{64}$/.test(sig)) return false
  const expected = Buffer.from(sign(secret, jobId, purpose, e), 'hex')
  const given = Buffer.from(sig, 'hex')
  return expected.length === given.length && timingSafeEqual(expected, given)
}
