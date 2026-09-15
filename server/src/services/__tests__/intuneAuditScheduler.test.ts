import { describe, it, expect } from 'vitest'
import { computeNextRunAtUtc, computeRelativeRangeUtc } from '../intuneAuditScheduler.js'

describe('computeNextRunAtUtc', () => {
  it('computes the next daily run after "now"', () => {
    const next = computeNextRunAtUtc(
      { frequency: 'daily', execution_time: '09:00', timezone: 'UTC', created_at: '2026-01-01T00:00:00Z' },
      new Date('2026-03-10T08:00:00Z')
    )
    expect(next.toISOString()).toBe('2026-03-10T09:00:00.000Z')
  })

  it('rolls to tomorrow if the daily time already passed today', () => {
    const next = computeNextRunAtUtc(
      { frequency: 'daily', execution_time: '09:00', timezone: 'UTC', created_at: '2026-01-01T00:00:00Z' },
      new Date('2026-03-10T10:00:00Z')
    )
    expect(next.toISOString()).toBe('2026-03-11T09:00:00.000Z')
  })

  it('computes the next weekly run anchored to the schedule creation weekday', () => {
    // 2026-01-01 is a Thursday.
    const next = computeNextRunAtUtc(
      { frequency: 'weekly', execution_time: '09:00', timezone: 'UTC', created_at: '2026-01-01T00:00:00Z' },
      new Date('2026-03-10T00:00:00Z') // a Tuesday
    )
    expect(next.getUTCDay()).toBe(4) // Thursday
    expect(next.getTime()).toBeGreaterThan(new Date('2026-03-10T00:00:00Z').getTime())
  })

  it('computes the next monthly run, clamping day-of-month for shorter months', () => {
    // Anchored to the 31st — February must clamp to the 28th (2026 is not a leap year).
    const next = computeNextRunAtUtc(
      { frequency: 'monthly', execution_time: '00:00', timezone: 'UTC', created_at: '2026-01-31T00:00:00Z' },
      new Date('2026-02-01T00:00:00Z')
    )
    expect(next.getUTCMonth()).toBe(1) // February
    expect(next.getUTCDate()).toBe(28)
  })

  it('computes the next yearly run anchored to month+day', () => {
    const next = computeNextRunAtUtc(
      { frequency: 'yearly', execution_time: '06:00', timezone: 'UTC', created_at: '2026-06-15T00:00:00Z' },
      new Date('2026-07-01T00:00:00Z')
    )
    expect(next.getUTCFullYear()).toBe(2027)
    expect(next.getUTCMonth()).toBe(5) // June
    expect(next.getUTCDate()).toBe(15)
  })

  it('is timezone-aware for a non-UTC IANA zone', () => {
    const next = computeNextRunAtUtc(
      { frequency: 'daily', execution_time: '09:00', timezone: 'Asia/Kolkata', created_at: '2026-01-01T00:00:00Z' },
      new Date('2026-03-10T00:00:00Z')
    )
    // 09:00 IST == 03:30 UTC
    expect(next.getUTCHours()).toBe(3)
    expect(next.getUTCMinutes()).toBe(30)
  })
})

describe('computeRelativeRangeUtc', () => {
  it('computes previous_day as [yesterday 00:00, today 00:00) UTC', () => {
    const { startUtc, endUtc } = computeRelativeRangeUtc('previous_day', 'UTC', new Date('2026-03-10T15:00:00Z'))
    expect(startUtc.toISOString()).toBe('2026-03-09T00:00:00.000Z')
    expect(endUtc.toISOString()).toBe('2026-03-10T00:00:00.000Z')
  })

  it('computes rolling_365 as exactly 365 days ending today', () => {
    const { startUtc, endUtc } = computeRelativeRangeUtc('rolling_365', 'UTC', new Date('2026-03-10T15:00:00Z'))
    const days = (endUtc.getTime() - startUtc.getTime()) / 86_400_000
    expect(days).toBe(365)
  })

  it('computes previous_month across a year boundary', () => {
    const { startUtc, endUtc } = computeRelativeRangeUtc('previous_month', 'UTC', new Date('2026-01-15T00:00:00Z'))
    expect(startUtc.toISOString()).toBe('2025-12-01T00:00:00.000Z')
    expect(endUtc.toISOString()).toBe('2026-01-01T00:00:00.000Z')
  })
})
