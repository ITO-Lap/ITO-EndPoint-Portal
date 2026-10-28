// Where the app keeps the data it writes itself (schedules, roles, notifications, cached syncs).
//
// It must NOT live inside the deployed folder: a DeployHub upload replaces that folder and would wipe
// the files. Order of preference:
//   1. DATA_DIR in server/.env (recommended on the server, e.g. D:\ito-data)
//   2. %ProgramData%\ito-endpoint on Windows (outside the app folder, survives re-deploys)
//   3. server/data (local development; a warning is logged outside development)
// Tests (NODE_ENV=test or VITEST) use a throwaway temp folder.
//
// Files written here are replaced atomically (temp file + rename) and the previous copy is kept as
// <name>.bak, so a crash mid-write cannot corrupt a store; readJsonFile falls back to the .bak.

import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// src/store and dist/store both sit two levels below server/.
export const SERVER_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

const isTest = (): boolean => process.env['NODE_ENV'] === 'test' || !!process.env['VITEST']

function writable(dir: string): boolean {
  try {
    mkdirSync(dir, { recursive: true })
    const probe = join(dir, `.write-test-${process.pid}`)
    writeFileSync(probe, 'ok'); rmSync(probe)
    return true
  } catch { return false }
}

let resolved: string | null = null

export function dataDir(): string {
  if (resolved) return resolved
  const fallback = join(SERVER_ROOT, 'data')
  const configured = process.env['DATA_DIR']?.trim()
  if (configured) {
    const dir = resolve(configured)
    if (writable(dir)) return (resolved = dir)
    console.error(`[data] DATA_DIR "${dir}" is not writable; falling back to ${fallback}. Changes may be lost on the next deploy.`)
  } else if (isTest()) {
    return (resolved = join(tmpdir(), `ito-endpoint-test-${process.pid}`))
  } else if (process.platform === 'win32' && process.env['ProgramData']) {
    const dir = join(process.env['ProgramData'], 'ito-endpoint')
    if (writable(dir)) { console.info(`[data] Storing app data in ${dir}`); return (resolved = dir) }
    console.warn(`[data] ${dir} is not writable; set DATA_DIR in server/.env. Falling back to ${fallback}.`)
  } else if (process.env['NODE_ENV'] === 'production') {
    console.warn(`[data] DATA_DIR is not set; using ${fallback}, which a re-deploy may replace. Set DATA_DIR in server/.env.`)
  }
  mkdirSync(fallback, { recursive: true })
  return (resolved = fallback)
}

/**
 * Full path of a data file. When it does not exist yet, the first legacy location that does is copied
 * into place once, so upgrading from the old in-folder files loses nothing.
 */
export function dataFile(name: string, legacyPaths: string[] = []): string {
  const target = join(dataDir(), name)
  try {
    mkdirSync(dirname(target), { recursive: true })
    if (!existsSync(target)) {
      const legacy = legacyPaths.find(p => existsSync(p))
      if (legacy) { copyFileSync(legacy, target); console.info(`[data] Migrated ${legacy} -> ${target}`) }
    }
  } catch (e) { console.warn(`[data] Could not prepare ${target}:`, e instanceof Error ? e.message : e) }
  return target
}

/** A file that used to live directly in server/ (e.g. ".rbac.json"). */
export const legacyServerFile = (name: string): string => join(SERVER_ROOT, name)

/** Replaces `file` atomically, keeping the previous version as `<file>.bak`. Throws on failure. */
export function writeFileAtomic(file: string, content: string | Buffer, mode?: number): void {
  mkdirSync(dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  writeFileSync(tmp, content, mode === undefined ? undefined : { mode })
  try { if (existsSync(file)) copyFileSync(file, `${file}.bak`) } catch { /* a missing backup must not block the save */ }
  renameSync(tmp, file)
}

export const writeJsonAtomic = (file: string, value: unknown, pretty = true): void =>
  writeFileAtomic(file, JSON.stringify(value, null, pretty ? 2 : undefined))

/** Parsed JSON from `file`, or from `<file>.bak` if the file is missing/corrupt; undefined if neither works. */
export function readJsonFile<T>(file: string): T | undefined {
  for (const candidate of [file, `${file}.bak`]) {
    try { return JSON.parse(readFileSync(candidate, 'utf-8')) as T } catch { /* try the next one */ }
  }
  return undefined
}
