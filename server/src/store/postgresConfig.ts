// The optional PostgreSQL connection setting (Settings -> Integrations -> PostgreSQL).
// Kept in its own owner-only file under DATA_DIR rather than in the shared credentials file, and read once
// at start-up by db/index.ts. Without it (and without DATABASE_URL) the app runs on local files.

import { chmodSync } from 'node:fs'
import { dataFile, readJsonFile, writeJsonAtomic } from './dataDir.js'

export interface PostgresConfig {
  connectionString: string
  /** 'require' = TLS (certificate not verified, as for most managed databases), 'disable' = plain. Default: TLS in production only. */
  ssl?: 'require' | 'disable'
}

const file = (): string => dataFile('postgres-config.json')
const isTest = (): boolean => process.env['NODE_ENV'] === 'test' || !!process.env['VITEST']

/** Saved setting first, then DATABASE_URL. Tests ignore the file so they never touch real settings. */
export function getPostgresConfig(): PostgresConfig | undefined {
  if (!isTest()) {
    const saved = readJsonFile<PostgresConfig>(file())
    if (saved?.connectionString) return saved
  }
  const url = process.env['DATABASE_URL']
  return url ? { connectionString: url } : undefined
}

export const hasSavedPostgresConfig = (): boolean => !isTest() && !!readJsonFile<PostgresConfig>(file())?.connectionString

export function savePostgresConfig(cfg: PostgresConfig): void {
  writeJsonAtomic(file(), cfg)
  try { chmodSync(file(), 0o600) } catch { /* not supported on this filesystem */ }
}

export function clearPostgresConfig(): void {
  writeJsonAtomic(file(), {})
}
