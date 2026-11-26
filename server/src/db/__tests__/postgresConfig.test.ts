import { describe, it, expect, afterEach, vi } from 'vitest'
import { getPostgresConfig } from '../../store/postgresConfig.js'
import { isDbAvailable, testConnection } from '../index.js'

afterEach(() => vi.unstubAllEnvs())

describe('PostgreSQL is optional', () => {
  it('is not available, and not configured, without a connection string', () => {
    expect(isDbAvailable()).toBe(false)
    expect(getPostgresConfig()).toBeUndefined()
  })
  it('reads DATABASE_URL when no setting is saved', () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://u:p@db.example/app')
    expect(getPostgresConfig()).toEqual({ connectionString: 'postgresql://u:p@db.example/app' })
  })
})

describe('testConnection', () => {
  it('reports a failure without ever echoing the password', async () => {
    const r = await testConnection({ connectionString: 'postgresql://appuser:Sup3rSecretPw@127.0.0.1:1/appdb', ssl: 'disable' })
    expect(r.ok).toBe(false)
    expect(JSON.stringify(r)).not.toContain('Sup3rSecretPw')
  }, 15_000)
})
