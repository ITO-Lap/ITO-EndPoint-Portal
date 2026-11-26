// PostgreSQL connection pool: optional, lazy, and fixed for the life of the process.
//
// The connection string comes from Settings -> Integrations -> PostgreSQL (saved) or DATABASE_URL.
// It is read ONCE at start-up. Saving a new value therefore takes effect after a restart, so no module
// can switch storage halfway through a session and strand data in the other store. Without a connection
// string the app runs on local files (see services/sync/fileBackend.ts and the file stores).
// All callers should guard with isDbAvailable() before calling query().

import pg from 'pg'
import { getPostgresConfig, type PostgresConfig as RuntimePostgresConfig } from '../store/postgresConfig.js'

const { Pool } = pg

const ACTIVE: RuntimePostgresConfig | undefined = getPostgresConfig()
let pool: pg.Pool | null = null

export const sslOption = (cfg: RuntimePostgresConfig | undefined = ACTIVE): false | { rejectUnauthorized: false } =>
  (cfg?.ssl ? cfg.ssl === 'require' : process.env.NODE_ENV === 'production') ? { rejectUnauthorized: false } : false

export function getDb(): pg.Pool {
  if (!pool) {
    if (!ACTIVE) {
      throw new Error('PostgreSQL is not configured (Settings -> Integrations -> PostgreSQL, or DATABASE_URL); multi-tenant, audit and scheduler features use local files instead.')
    }
    pool = new Pool({
      connectionString: ACTIVE.connectionString,
      max: 20,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 2_000,
      ssl: sslOption(),
    })
    pool.on('error', (err) => {
      console.error('[DB] Unexpected pool error:', err.message)
    })
  }
  return pool
}

export function isDbAvailable(): boolean {
  return !!ACTIVE
}

/** The connection string saved or in the environment right now, which may differ from the one in use until a restart. */
export const configuredConnectionString = (): string | undefined => getPostgresConfig()?.connectionString
export const activeConnectionString = (): string | undefined => ACTIVE?.connectionString

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  sql: string,
  params?: unknown[]
): Promise<pg.QueryResult<T>> {
  return getDb().query<T>(sql, params)
}

export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end()
    pool = null
  }
}

/** Tries a connection with the given settings without touching the pool in use. Never returns the password. */
export async function testConnection(cfg: RuntimePostgresConfig): Promise<{ ok: true; latencyMs: number; serverVersion: string } | { ok: false; error: string }> {
  const t0 = Date.now()
  const probe = new Pool({ connectionString: cfg.connectionString, max: 1, connectionTimeoutMillis: 5_000, ssl: sslOption(cfg) })
  probe.on('error', () => undefined)
  try {
    const r = await probe.query<{ v: string }>('SHOW server_version')
    return { ok: true, latencyMs: Date.now() - t0, serverVersion: r.rows[0]?.v ?? 'unknown' }
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e)
    // Connection errors can echo the connection string: remove user:password@ before it is shown.
    return { ok: false, error: raw.replace(/\/\/[^@\s/]+@/g, '//[redacted]@').replace(cfg.connectionString, '[connection string]').slice(0, 300) }
  } finally {
    await probe.end().catch(() => undefined)
  }
}
