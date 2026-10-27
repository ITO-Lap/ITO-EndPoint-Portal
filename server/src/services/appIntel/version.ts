// Vendor-aware version parsing and comparison. Never compares versions as plain strings.
//
// Handles: dotted numerics of any length ("155.0.8059.40", "2025.912.644.0"), leading "v", Homebrew
// "version,build" suffixes, MSI-style 4-part versions, and pre-release tags (beta/rc/preview/...)
// which sort BELOW the same numeric release. Anything that does not start with a number is
// unparsable — callers must then report "Review required", not guess.

export interface ParsedVersion {
  nums: number[]
  /** Pre-release label (lowercased) or null for a normal release. */
  pre: string | null
  /** Optional trailing build number (Homebrew "1.2.3,456" or "1.2.3-456"). */
  build: number | null
  raw: string
}

const PRE_RE = /(alpha|beta|rc|preview|pre|dev|canary|nightly|snapshot)[.\-_]?(\d+)?/i

export function parseVersion(input: string | null | undefined): ParsedVersion | null {
  if (!input) return null
  let s = String(input).trim()
  if (!s) return null
  const raw = s
  s = s.replace(/^v(?=\d)/i, '')

  let build: number | null = null
  const comma = s.indexOf(',')
  if (comma > 0) {
    const tail = /^\d+$/.exec(s.slice(comma + 1).trim())
    build = tail ? Number(tail[0]) : null
    s = s.slice(0, comma)
  }

  const m = /^(\d+(?:\.\d+)*)(.*)$/.exec(s)
  if (!m) return null
  const nums = m[1]!.split('.').map(Number)
  if (nums.some(n => !Number.isSafeInteger(n))) return null

  const rest = m[2]!.replace(/^[\s_\-+]+/, '')
  let pre: string | null = null
  const pm = PRE_RE.exec(rest)
  if (pm) pre = `${pm[1]!.toLowerCase()}${pm[2] ? `.${pm[2]}` : ''}`
  else if (build === null) {
    // "-456" style build suffix, e.g. 1.2.3-456
    const bm = /^(\d+)$/.exec(rest)
    if (bm) build = Number(bm[1])
  }
  return { nums, pre, build, raw }
}

/** -1 if a < b, 0 if equal, 1 if a > b; null when either side cannot be parsed. */
export function compareVersions(a: string | null | undefined, b: string | null | undefined): -1 | 0 | 1 | null {
  const pa = parseVersion(a), pb = parseVersion(b)
  if (!pa || !pb) return null
  const len = Math.max(pa.nums.length, pb.nums.length)
  for (let i = 0; i < len; i++) {
    const x = pa.nums[i] ?? 0, y = pb.nums[i] ?? 0
    if (x !== y) return x < y ? -1 : 1
  }
  // Same numbers: a pre-release is older than the release.
  if (pa.pre && !pb.pre) return -1
  if (!pa.pre && pb.pre) return 1
  if (pa.pre && pb.pre && pa.pre !== pb.pre) return pa.pre < pb.pre ? -1 : 1
  const ba = pa.build ?? 0, bb = pb.build ?? 0
  return ba === bb ? 0 : ba < bb ? -1 : 1
}

/** Highest of several versions, or null if any is unparsable (so a bad value can't silently win/lose). */
export function maxVersion(versions: string[]): string | null {
  let best: string | null = null
  for (const v of versions) {
    if (!parseVersion(v)) return null
    if (best === null || compareVersions(v, best) === 1) best = v
  }
  return best
}
