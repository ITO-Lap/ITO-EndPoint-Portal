// PostgreSQL connection pool — lazy-initialised, gracefully degrades when DATABASE_URL is absent.
// All callers should guard with isDbAvailable() before calling query().

import pg from 'pg'

const { Pool } = pg

let pool: pg.Pool | null = null

export function getDb(): pg.Pool {
  if (!pool) {
    const url = process.env.DATABASE_URL
    if (!url) {
      throw new Error(
        'DATABASE_URL is not set — multi-tenant, audit, and scheduler features require a PostgreSQL database.'
      )
    }
    pool = new Pool({
      connectionString: url,
      max: 20,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 2_000,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    })
    pool.on('error', (err) => {
      console.error('[DB] Unexpected pool error:', err.message)
    })
  }
  return pool
}

export function isDbAvailable(): boolean {
  return !!process.env.DATABASE_URL
}

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
