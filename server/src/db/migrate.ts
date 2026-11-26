// Applies db/migrations in order, once each, recorded in schema_migrations. Safe to run on every start:
// an advisory lock makes concurrent starts (several instances) take turns, and each migration runs in
// one transaction, so a failure leaves nothing half-applied.

import { MIGRATIONS } from './migrations/index.js'

export interface Queryable { query(sql: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }> }

const LOCK_KEY = 727_001 // arbitrary app-wide constant for pg_advisory_lock

export async function runMigrations(db: Queryable, migrations = MIGRATIONS): Promise<string[]> {
  await db.query('SELECT pg_advisory_lock($1)', [LOCK_KEY])
  const applied: string[] = []
  try {
    await db.query('CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())')
    const done = new Set((await db.query('SELECT id FROM schema_migrations')).rows.map(r => String(r['id'])))
    for (const m of migrations) {
      if (done.has(m.id)) continue
      await db.query('BEGIN')
      try {
        await db.query(m.sql)
        await db.query('INSERT INTO schema_migrations (id) VALUES ($1)', [m.id])
        await db.query('COMMIT')
        applied.push(m.id)
      } catch (e) {
        await db.query('ROLLBACK').catch(() => undefined)
        throw new Error(`Migration ${m.id} failed: ${e instanceof Error ? e.message : String(e)}`, { cause: e })
      }
    }
  } finally {
    await db.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]).catch(() => undefined)
  }
  return applied
}

/** Production entry: one dedicated connection (the advisory lock and BEGIN/COMMIT need a single session). */
export async function migrateOnStartup(): Promise<void> {
  const { getDb, isDbAvailable } = await import('./index.js')
  if (!isDbAvailable()) return
  const client = await getDb().connect()
  try {
    const applied = await runMigrations(client)
    if (applied.length) console.log(`[db] applied migrations: ${applied.join(', ')}`)
  } finally {
    client.release()
  }
}
