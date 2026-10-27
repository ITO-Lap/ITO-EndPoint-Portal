// Shared DST-safe wall-clock <-> UTC helpers, extracted from intuneAuditScheduler.ts
// so other schedulers (notificationScheduler.ts) can reuse the same tested logic
// instead of re-implementing timezone math.

export function getZonedParts(date: Date, timeZone: string): { y: number; m: number; d: number; hh: number; mm: number; weekday: number } {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, weekday: 'short',
  })
  const parts = formatter.formatToParts(date)
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? '0'
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return {
    y: Number(get('year')), m: Number(get('month')), d: Number(get('day')),
    hh: Number(get('hour')) % 24, mm: Number(get('minute')),
    weekday: weekdayMap[get('weekday')] ?? 0,
  }
}

/** Converts a wall-clock date/time in `timeZone` to a UTC instant, correctly
 *  handling DST offsets without a date-arithmetic library — standard
 *  "guess, measure the offset, correct" technique using Intl as the source
 *  of truth for what a given UTC instant looks like in that zone. */
export function zonedWallTimeToUtc(y: number, m: number, d: number, hh: number, mm: number, timeZone: string): Date {
  let guessUtc = Date.UTC(y, m - 1, d, hh, mm, 0)
  for (let i = 0; i < 2; i++) {
    const seenAsZoned = getZonedParts(new Date(guessUtc), timeZone)
    const seenAsUtc = Date.UTC(seenAsZoned.y, seenAsZoned.m - 1, seenAsZoned.d, seenAsZoned.hh, seenAsZoned.mm, 0)
    const diff = Date.UTC(y, m - 1, d, hh, mm, 0) - seenAsUtc
    guessUtc += diff
  }
  return new Date(guessUtc)
}

export function daysInMonth(year: number, month1based: number): number {
  return new Date(Date.UTC(year, month1based, 0)).getUTCDate()
}

export function getWeekdayForYmd(y: number, m: number, d: number, timeZone: string): number {
  return getZonedParts(zonedWallTimeToUtc(y, m, d, 12, 0, timeZone), timeZone).weekday
}

/** Validates an IANA timezone string the same way the rest of the scheduler
 *  code already probes one — by asking Intl to format with it. */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone })
    return true
  } catch {
    return false
  }
}
