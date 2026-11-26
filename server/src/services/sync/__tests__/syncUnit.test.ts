import { describe, it, expect } from 'vitest'
import { sanitizeError, isDue, type SyncSourceStatus } from '../syncEngine.js'
import { hashDevice } from '../../../store/deviceStore.js'
import { runMigrations, type Queryable } from '../../../db/migrate.js'
import type { Device } from '../../../types.js'

describe('sanitizeError', () => {
  it('removes bearer tokens, JWTs, secrets and long opaque strings', () => {
    const jwt = 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.c2lnbmF0dXJlc2lnbmF0dXJl'
    const out = sanitizeError(new Error(`401 Bearer abc123.def-456 at https://x?client_secret=hunter2&api_key="k-999" token: zzz ${jwt} ${'A'.repeat(48)}`))
    for (const secret of ['abc123', 'hunter2', 'k-999', 'zzz', jwt, 'A'.repeat(48)]) expect(out).not.toContain(secret)
    expect(out).toContain('[redacted')
  })
  it('keeps ordinary diagnostics and caps the length', () => {
    expect(sanitizeError(new Error('Graph returned 429 Too Many Requests'))).toBe('Graph returned 429 Too Many Requests')
    expect(sanitizeError('x'.repeat(2000)).length).toBeLessThanOrEqual(500)
  })
})

const status = (o: Partial<SyncSourceStatus> = {}): SyncSourceStatus => ({
  source: 'intune', module: 'devices', displayName: 'Microsoft Intune', enabled: true, intervalMinutes: 45, configured: true,
  lastAttemptAt: null, lastSuccessAt: null, status: 'never', lastError: null, recordCount: null, running: false, stale: false, ...o,
})

describe('isDue', () => {
  const now = Date.parse('2026-11-20T12:00:00Z')
  const ago = (min: number) => new Date(now - min * 60_000).toISOString()
  it('is due when never attempted, or when the interval has passed', () => {
    expect(isDue(status(), now)).toBe(true)
    expect(isDue(status({ lastAttemptAt: ago(44), status: 'succeeded' }), now)).toBe(false)
    expect(isDue(status({ lastAttemptAt: ago(46), status: 'succeeded' }), now)).toBe(true)
  })
  it('retries a failed source after 10 minutes instead of the full interval', () => {
    expect(isDue(status({ lastAttemptAt: ago(9), status: 'failed' }), now)).toBe(false)
    expect(isDue(status({ lastAttemptAt: ago(11), status: 'failed' }), now)).toBe(true)
  })
  it('is never due when disabled, not configured, or already running', () => {
    expect(isDue(status({ enabled: false }), now)).toBe(false)
    expect(isDue(status({ configured: false }), now)).toBe(false)
    expect(isDue(status({ running: true }), now)).toBe(false)
  })
})

const dev = (o: Partial<Device> = {}): Device => ({ id: 'd1', deviceName: 'PC-1', user: 'a@x.com', serialNumber: 'S1', platform: 'Windows', osVersion: '11', managementSource: 'Microsoft Intune', lastCheckIn: '2026-11-20T10:00:00Z', complianceState: 'Compliant', encryptionStatus: 'Encrypted', primaryIssue: 'None', policyFailed: '', severity: 'Low', confidence: 'High', firstDetected: '', lastDetected: '', issueSource: '', ...o })

describe('hashDevice', () => {
  it('is the same for the same data whatever the key order, and differs when data changes', () => {
    const a = dev(); const reordered = Object.fromEntries(Object.entries(a).reverse()) as unknown as Device
    expect(hashDevice(reordered)).toBe(hashDevice(a))
    expect(hashDevice(dev({ osVersion: '12' }))).not.toBe(hashDevice(a))
  })
})

describe('runMigrations', () => {
  const fake = () => {
    const done = new Set<string>(); const calls: string[] = []
    const db: Queryable = {
      async query(sql, params) {
        calls.push(sql.trim().split('\n')[0]!.slice(0, 40))
        if (sql.startsWith('SELECT id FROM schema_migrations')) return { rows: [...done].map(id => ({ id })) }
        if (sql.startsWith('INSERT INTO schema_migrations')) done.add(String(params![0]))
        return { rows: [] }
      },
    }
    return { db, calls }
  }
  it('applies each migration once, in order, and is a no-op the second time', async () => {
    const { db } = fake()
    const m = [{ id: '001', sql: 'CREATE TABLE a()' }, { id: '002', sql: 'CREATE TABLE b()' }]
    expect(await runMigrations(db, m)).toEqual(['001', '002'])
    expect(await runMigrations(db, m)).toEqual([])
  })
  it('rolls back and reports which migration failed, and releases the lock', async () => {
    const calls: string[] = []
    const db: Queryable = { async query(sql) { calls.push(sql.slice(0, 40)); if (sql === 'BAD SQL') throw new Error('syntax error'); return { rows: [] } } }
    await expect(runMigrations(db, [{ id: '001', sql: 'BAD SQL' }])).rejects.toThrow('Migration 001 failed: syntax error')
    expect(calls).toContain('ROLLBACK')
    expect(calls.some(c => c.startsWith('SELECT pg_advisory_unlock'))).toBe(true)
  })
})
