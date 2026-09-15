import { describe, it, expect, vi } from 'vitest'

// Token acquisition hits a real network endpoint — stub it so these tests
// exercise only the page-fetch retry/pagination logic, not live Entra auth.
vi.mock('../intuneAuditAuth.js', () => ({
  getAuditGraphToken: vi.fn().mockResolvedValue('fake-token-for-tests'),
}))

import {
  splitIntoUtcChunks, buildAuditEventsUrl, fetchAuditEventsPage, fetchAuditEventsForChunk,
  TransientGraphError, FatalGraphError, type GraphAuditEvent,
} from '../intuneAuditGraph.js'

function fakeEvent(id: string, activityDateTime = '2026-01-01T00:00:00Z'): GraphAuditEvent {
  return {
    id, displayName: 'x', componentName: 'x', category: 'Application', activity: 'Create',
    activityDateTime, activityType: 'Create', activityOperationType: 'Create', activityResult: 'Success',
    correlationId: 'corr-1', resources: [],
    actor: { type: 'ItPro', userPermissions: null, applicationId: null, applicationDisplayName: null, userPrincipalName: 'a@b.com', servicePrincipalName: null, ipAddress: '1.2.3.4', userId: 'u1' },
  }
}

describe('splitIntoUtcChunks', () => {
  it('splits a 365-day range into 53 chunks of 7 days (last chunk shorter)', () => {
    const start = new Date('2025-01-01T00:00:00Z')
    const end = new Date('2026-01-01T00:00:00Z') // 365 days, not a leap year range here
    const chunks = splitIntoUtcChunks(start, end, 7)
    expect(chunks.length).toBe(Math.ceil(365 / 7))
    expect(chunks[0].startUtc.toISOString()).toBe(start.toISOString())
    expect(chunks[chunks.length - 1].endUtc.toISOString()).toBe(end.toISOString())
  })

  it('splits a leap-year 366-day range correctly', () => {
    const start = new Date('2024-01-01T00:00:00Z')
    const end = new Date('2025-01-01T00:00:00Z') // 2024 is a leap year: 366 days
    const chunks = splitIntoUtcChunks(start, end, 7)
    const totalDays = chunks.reduce((sum, c) => sum + (c.endUtc.getTime() - c.startUtc.getTime()) / 86_400_000, 0)
    expect(totalDays).toBeCloseTo(366, 5)
  })

  it('produces no gaps or overlaps at chunk boundaries', () => {
    const start = new Date('2026-01-01T00:00:00Z')
    const end = new Date('2026-02-01T00:00:00Z')
    const chunks = splitIntoUtcChunks(start, end, 7)
    for (let i = 1; i < chunks.length; i++) {
      expect(chunks[i].startUtc.getTime()).toBe(chunks[i - 1].endUtc.getTime())
    }
  })

  it('handles an empty trailing chunk day count correctly (31-day month, 7-day chunks)', () => {
    const chunks = splitIntoUtcChunks(new Date('2026-01-01T00:00:00Z'), new Date('2026-01-31T00:00:00Z'), 7)
    expect(chunks.length).toBe(5) // 4 full 7-day chunks + one 2-day remainder
    expect(chunks[4].endUtc.getTime() - chunks[4].startUtc.getTime()).toBe(2 * 86_400_000)
  })

  it('throws on an inverted range', () => {
    expect(() => splitIntoUtcChunks(new Date('2026-01-02T00:00:00Z'), new Date('2026-01-01T00:00:00Z'), 7)).toThrow()
  })
})

describe('buildAuditEventsUrl', () => {
  it('builds an inclusive-start, exclusive-end $filter, URL-encoded', () => {
    const url = buildAuditEventsUrl(new Date('2026-01-01T00:00:00Z'), new Date('2026-01-08T00:00:00Z'))
    expect(url).toContain('/deviceManagement/auditEvents')
    const decoded = decodeURIComponent(url.replace(/\+/g, ' '))
    expect(decoded).toContain('activityDateTime ge 2026-01-01T00:00:00Z and activityDateTime lt 2026-01-08T00:00:00Z')
  })
})

describe('fetchAuditEventsPage', () => {
  const noSleep = () => Promise.resolve()

  it('follows @odata.nextLink returned in the response', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ value: [fakeEvent('1')], '@odata.nextLink': 'https://graph/next' }), { status: 200 }))
    const result = await fetchAuditEventsPage('https://graph/first', { fetchImpl, sleepImpl: noSleep })
    expect(result.events).toHaveLength(1)
    expect(result.nextLink).toBe('https://graph/next')
  })

  it('retries on 429 honoring Retry-After', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response('', { status: 429, headers: { 'Retry-After': '0' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ value: [fakeEvent('1')] }), { status: 200 }))
    const sleepImpl = vi.fn().mockResolvedValue(undefined)
    const result = await fetchAuditEventsPage('https://graph/x', { fetchImpl, sleepImpl })
    expect(sleepImpl).toHaveBeenCalledWith(0)
    expect(result.events).toHaveLength(1)
  })

  it('retries transient 5xx failures with backoff, then succeeds', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response('server error', { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ value: [] }), { status: 200 }))
    const result = await fetchAuditEventsPage('https://graph/x', { fetchImpl, sleepImpl: noSleep })
    expect(result.events).toHaveLength(0)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('throws TransientGraphError after exhausting retries on repeated 5xx', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('', { status: 500 }))
    await expect(fetchAuditEventsPage('https://graph/x', { fetchImpl, sleepImpl: noSleep, maxRetries: 2 }))
      .rejects.toBeInstanceOf(TransientGraphError)
    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })

  it('throws FatalGraphError immediately on a non-429 4xx without retrying', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('bad filter', { status: 400 }))
    await expect(fetchAuditEventsPage('https://graph/x', { fetchImpl, sleepImpl: noSleep }))
      .rejects.toBeInstanceOf(FatalGraphError)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('retries a network-level failure (fetch rejects) and eventually succeeds', async () => {
    const fetchImpl = vi.fn()
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ value: [] }), { status: 200 }))
    const result = await fetchAuditEventsPage('https://graph/x', { fetchImpl, sleepImpl: noSleep })
    expect(result.events).toHaveLength(0)
  })

  it('never leaks the bearer token into a thrown error message', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('Bearer abc123.def456 leaked', { status: 400 }))
    await expect(fetchAuditEventsPage('https://graph/x', { fetchImpl, sleepImpl: noSleep }))
      .rejects.toThrow(/\[redacted\]/)
  })
})

describe('fetchAuditEventsForChunk', () => {
  it('fetches every page of a chunk until nextLink is exhausted', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ value: [fakeEvent('1'), fakeEvent('2')], '@odata.nextLink': 'https://graph/p2' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ value: [fakeEvent('3')] }), { status: 200 }))

    const pages: number[] = []
    const result = await fetchAuditEventsForChunk(
      { index: 0, startUtc: new Date('2026-01-01T00:00:00Z'), endUtc: new Date('2026-01-08T00:00:00Z') },
      page => { pages.push(page.events.length) },
      { fetchImpl, sleepImpl: () => Promise.resolve() }
    )
    expect(result.pagesFetched).toBe(2)
    expect(result.eventCount).toBe(3)
    expect(pages).toEqual([2, 1])
  })

  it('handles an empty chunk (zero events, zero pages of content) without error', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ value: [] }), { status: 200 }))
    const result = await fetchAuditEventsForChunk(
      { index: 0, startUtc: new Date('2026-01-01T00:00:00Z'), endUtc: new Date('2026-01-08T00:00:00Z') },
      () => {},
      { fetchImpl, sleepImpl: () => Promise.resolve() }
    )
    expect(result.pagesFetched).toBe(1)
    expect(result.eventCount).toBe(0)
  })
})
