// Where finished packages are placed for the engineer: <Desktop>/win-packager/<Application name>/
// (override the base with WIN_PACKAGER_OUTPUT_DIR). The job workspace under DATA_DIR stays internal.

import { copyFileSync, existsSync, mkdirSync, readdirSync, rmdirSync, rmSync, statSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { jobDir } from './workspace.js'
import type { PackageJob } from './types.js'

export function outputRoot(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env['WIN_PACKAGER_OUTPUT_DIR']?.trim()
  if (configured) return resolve(configured)
  if (env['VITEST'] || env['NODE_ENV'] === 'test') return join(tmpdir(), `win-packager-out-${process.pid}`)
  return join(homedir(), 'Desktop', 'win-packager')
}

/** A single safe folder name for the application (no separators, no leading dots). */
export function appFolderName(appName: string): string {
  const clean = appName.replace(/[^A-Za-z0-9._ ()+-]+/g, '_').replace(/^[.\s_]+|[\s.]+$/g, '').slice(0, 80)
  return clean || 'Application'
}

export function outputDirFor(job: Pick<PackageJob, 'config' | 'source'>): string {
  const root = resolve(outputRoot())
  const dir = resolve(root, appFolderName(job.config?.appName ?? job.source.fileName.replace(/\.[^.]+$/, '')))
  if (!dir.startsWith(root + sep)) throw new Error('Output path escapes the output root')
  return dir
}

/** Copies the finished deliverables (the .intunewin, scripts, metadata, reports, hashes, logs) into the app folder.
 *  Idempotent; returns the destination directory. */
export function exportOutput(job: PackageJob): string {
  const dir = outputDirFor(job)
  mkdirSync(dir, { recursive: true })
  const from = join(jobDir(job.id), 'artifacts')
  if (existsSync(from)) {
    for (const name of readdirSync(from)) {
      const src = join(from, name)
      if (statSync(src).isFile()) copyFileSync(src, join(dir, name))
    }
  }
  return dir
}

/** Removes this job's deliverables from its output folder. Only files that came from this job's artifacts are
 *  deleted (other versions of the same app may share the folder); the folder goes too once it is empty. */
export function removeOutput(job: PackageJob): { dir: string; removed: number } {
  const root = resolve(outputRoot())
  const dir = resolve(job.output?.exportDir ?? outputDirFor(job))
  if (!dir.startsWith(root + sep)) throw new Error('Refusing to delete outside the output root')
  let removed = 0
  const from = join(jobDir(job.id), 'artifacts')
  if (existsSync(dir) && existsSync(from)) {
    for (const name of readdirSync(from)) {
      const target = join(dir, name)
      if (statSync(join(from, name)).isFile() && existsSync(target)) { rmSync(target, { force: true }); removed++ }
    }
    if (readdirSync(dir).length === 0) rmdirSync(dir)
  }
  return { dir, removed }
}
