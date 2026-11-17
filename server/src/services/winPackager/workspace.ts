// Isolated per-job workspaces under DATA_DIR/win-packager/<jobId>. Every path handed back is verified to stay
// inside that root, so a crafted file name or job id can never escape it.

import { randomUUID } from 'node:crypto'
import { mkdirSync, rmSync } from 'node:fs'
import { basename, join, resolve, sep } from 'node:path'
import { dataDir } from '../../store/dataDir.js'
import type { PackageSourceType, PackagerLimits } from './types.js'

export const INTUNE_MAX_BYTES = 30 * 1024 * 1024 * 1024

export function packagerLimits(env: NodeJS.ProcessEnv = process.env): PackagerLimits {
  const mb = Number(env['WIN_PACKAGER_MAX_UPLOAD_MB'])
  const maxUploadBytes = Number.isFinite(mb) && mb > 0 ? Math.floor(mb * 1024 * 1024) : 2 * 1024 * 1024 * 1024
  return { maxUploadBytes: Math.min(maxUploadBytes, INTUNE_MAX_BYTES), maxIntuneBytes: INTUNE_MAX_BYTES }
}

export const workspaceRoot = (): string => join(dataDir(), 'win-packager')

const JOB_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export const newJobId = (): string => randomUUID()
export const isValidJobId = (id: string): boolean => JOB_ID.test(id)

/** Absolute workspace dir for a job; throws on a malformed id. */
export function jobDir(jobId: string): string {
  if (!isValidJobId(jobId)) throw new Error('Invalid job id')
  const root = resolve(workspaceRoot())
  const dir = resolve(root, jobId)
  if (!dir.startsWith(root + sep)) throw new Error('Path escapes workspace')
  return dir
}

export function createJobWorkspace(jobId: string): string {
  const dir = jobDir(jobId)
  mkdirSync(join(dir, 'source'), { recursive: true })
  mkdirSync(join(dir, 'artifacts'), { recursive: true })
  return dir
}

export function removeJobWorkspace(jobId: string): void {
  rmSync(jobDir(jobId), { recursive: true, force: true })
}

const EXT_TYPES: Record<string, PackageSourceType> = {
  '.msi': 'msi', '.exe': 'exe', '.msix': 'msix', '.appx': 'appx', '.zip': 'zip',
}

/** Strips any directory part and unsafe characters; returns a flat, bounded file name. */
export function sanitizeFileName(raw: string): string {
  const flat = basename(raw.replace(/\\/g, '/')).replace(/[^A-Za-z0-9._ ()+-]/g, '_').replace(/^\.+/, '_').trim()
  return flat.slice(0, 120) || 'upload'
}

export function sourceTypeFor(fileName: string): PackageSourceType | null {
  const dot = fileName.lastIndexOf('.')
  return dot < 0 ? null : EXT_TYPES[fileName.slice(dot).toLowerCase()] ?? null
}

/** Cheap content check so a renamed file is not accepted as an installer. */
export function magicMatches(type: PackageSourceType, head: Buffer): boolean {
  const startsWith = (sig: number[]) => sig.every((b, i) => head[i] === b)
  switch (type) {
    case 'msi': return startsWith([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
    case 'exe': return startsWith([0x4d, 0x5a])
    case 'msix': case 'appx': case 'zip': return startsWith([0x50, 0x4b, 0x03, 0x04])
  }
}

/** Folder handed to IntuneWinAppUtil as the source: the extracted ZIP contents, or the lone uploaded installer. */
export function packageSourceDir(jobId: string, sourceType: PackageSourceType): string {
  return join(jobDir(jobId), sourceType === 'zip' ? 'content' : 'source')
}

export function createContentDir(jobId: string): string {
  const dir = join(jobDir(jobId), 'content')
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  return dir
}

/** Resolves `rel` under `base`, refusing anything that escapes it. */
export function resolveInside(base: string, rel: string): string {
  const root = resolve(base)
  const target = resolve(root, rel)
  if (target !== root && !target.startsWith(root + sep)) throw new Error('Path escapes workspace')
  return target
}
