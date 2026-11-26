import { describe, it, expect, beforeAll, vi } from 'vitest'

// The settings store on PostgreSQL (PGlite, real PostgreSQL in WebAssembly). Skipped if the dev dependency is not installed.
type Pg = { query(sql: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>>; affectedRows?: number }>; exec(sql: string): Promise<Array<{ rows: Array<Record<string, unknown>> }>> }
let pg: Pg
const available = await import(/* @vite-ignore */ '@electric-sql/pglite' as string).then(() => true, () => false)
vi.mock('../../db/index.js', () => ({
  isDbAvailable: () => true,
  query: async (sql: string, params?: unknown[]) => { const r = await pg.query(sql, params); return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length } },
}))

describe.skipIf(!available)('app settings on PostgreSQL', () => {
  beforeAll(async () => {
    const { PGlite } = await import(/* @vite-ignore */ '@electric-sql/pglite' as string)
    pg = new PGlite() as Pg
    const { runMigrations } = await import('../../db/migrate.js')
    await runMigrations({ query: async (sql, p) => p ? pg.query(sql, p) : { rows: (await pg.exec(sql)).at(-1)?.rows ?? [] } })
    ;(await import('../../services/sync/backend.js')).__setDbReadyForTests(true)
  })

  it('saves, replaces and reads a section, and records who saved it', async () => {
    const { saveSection, getAllSettings } = await import('../appSettings.js')
    await saveSection('general', { orgName: 'Acme', environment: 'test' }, 'a@x.com')
    const second = await saveSection('general', { orgName: 'Acme 2' }, 'b@x.com')
    expect(second.before).toEqual({ orgName: 'Acme', environment: 'test' })
    const all = await getAllSettings()
    expect(all['general']).toMatchObject({ values: { orgName: 'Acme 2' }, updatedBy: 'b@x.com' })
  })

  it('migration 004 is idempotent', async () => {
    const { runMigrations } = await import('../../db/migrate.js')
    expect(await runMigrations({ query: async (sql, p) => p ? pg.query(sql, p) : { rows: (await pg.exec(sql)).at(-1)?.rows ?? [] } })).toEqual([])
  })
})
