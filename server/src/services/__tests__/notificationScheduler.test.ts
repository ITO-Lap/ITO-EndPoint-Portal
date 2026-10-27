import { describe, it, expect } from 'vitest'
import { computeNextRunAtUtc } from '../notificationScheduler.js'

describe('computeNextRunAtUtc (notification schedules)', () => {
  it('computes the next daily run after "now"', () => {
    const next = computeNextRunAtUtc(
      { frequency: 'daily', weekdays: [], execution_time: '09:00', timezone: 'UTC' },
      new Date('2026-03-10T08:00:00Z')
    )
    expect(next.toISOString()).toBe('2026-03-10T09:00:00.000Z')
  })

  it('rolls to tomorrow if the daily time already passed today', () => {
    const next = computeNextRunAtUtc(
      { frequency: 'daily', weekdays: [], execution_time: '09:00', timezone: 'UTC' },
      new Date('2026-03-10T10:00:00Z')
    )
    expect(next.toISOString()).toBe('2026-03-11T09:00:00.000Z')
  })

  it('matches any of several selected weekdays, not just one anchor', () => {
    // 2026-03-10 is a Tuesday. Schedule fires Mon/Wed/Fri at 09:00 UTC.
    const next = computeNextRunAtUtc(
      { frequency: 'weekly', weekdays: [1, 3, 5], execution_time: '09:00', timezone: 'UTC' },
      new Date('2026-03-10T00:00:00Z')
    )
    expect(next.toISOString()).toBe('2026-03-11T09:00:00.000Z') // next Wednesday
  })

  it('picks the very next occurrence across a week boundary', () => {
    // 2026-03-13 is a Friday, after the Fri 09:00 run has already passed.
    const next = computeNextRunAtUtc(
      { frequency: 'weekly', weekdays: [1, 5], execution_time: '09:00', timezone: 'UTC' },
      new Date('2026-03-13T10:00:00Z')
    )
    expect(next.toISOString()).toBe('2026-03-16T09:00:00.000Z') // next Monday
  })

  it('is correct for Asia/Kolkata (UTC+5:30, no DST)', () => {
    const next = computeNextRunAtUtc(
      { frequency: 'daily', weekdays: [], execution_time: '09:00', timezone: 'Asia/Kolkata' },
      new Date('2026-03-10T00:00:00Z')
    )
    // 09:00 IST == 03:30 UTC
    expect(next.getUTCHours()).toBe(3)
    expect(next.getUTCMinutes()).toBe(30)
    expect(next.toISOString().slice(0, 10)).toBe('2026-03-10')
  })

  it('computes a weekly Asia/Kolkata run on the correct next matching weekday', () => {
    // 2026-03-10 00:00 UTC is 2026-03-10 05:30 IST, a Tuesday. Schedule fires
    // Thursday at 14:00 IST == 08:30 UTC.
    const next = computeNextRunAtUtc(
      { frequency: 'weekly', weekdays: [4], execution_time: '14:00', timezone: 'Asia/Kolkata' },
      new Date('2026-03-10T00:00:00Z')
    )
    expect(next.toISOString()).toBe('2026-03-12T08:30:00.000Z')
  })
})
