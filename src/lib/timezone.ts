// Client-side timezone helpers for the Role Activity Audit date/time controls.
// Mirrors the DST-safe "guess, measure, correct" conversion used server-side
// (server/src/services/intuneAuditScheduler.ts, still used by the Role
// Activity module's schedule computations) so a selected wall-clock
// date/time in an IANA zone maps to the same UTC instant on both sides.

function getZonedParts(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
  const parts = formatter.formatToParts(date)
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? '0'
  return { y: Number(get('year')), m: Number(get('month')), d: Number(get('day')), hh: Number(get('hour')) % 24, mm: Number(get('minute')) }
}

export function zonedWallTimeToUtc(y: number, m: number, d: number, hh: number, mm: number, timeZone: string): Date {
  let guessUtc = Date.UTC(y, m - 1, d, hh, mm, 0)
  for (let i = 0; i < 2; i++) {
    const seen = getZonedParts(new Date(guessUtc), timeZone)
    const seenAsUtc = Date.UTC(seen.y, seen.m - 1, seen.d, seen.hh, seen.mm, 0)
    guessUtc += Date.UTC(y, m - 1, d, hh, mm, 0) - seenAsUtc
  }
  return new Date(guessUtc)
}

/** Formats a UTC instant as it appears in `timeZone`, for the "local time"
 *  side of the UTC / local-time dual display. */
export function formatInTimezone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: true, timeZoneName: 'short',
  }).format(date)
}

export function formatUtc(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

let cachedTimezones: string[] | null = null

export function listTimezones(): string[] {
  if (cachedTimezones) return cachedTimezones
  try {
    const supported = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.('timeZone')
    cachedTimezones = supported && supported.length > 0 ? supported : FALLBACK_TIMEZONES
  } catch {
    cachedTimezones = FALLBACK_TIMEZONES
  }
  return cachedTimezones
}

const FALLBACK_TIMEZONES = [
  'UTC', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Asia/Kolkata', 'Asia/Singapore',
  'Asia/Tokyo', 'Asia/Dubai', 'Australia/Sydney',
]

export function detectLocalTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    return 'UTC'
  }
}
