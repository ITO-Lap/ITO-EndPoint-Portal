// Mac Package Builder portal support: describes the mirrored macOS app (apps/mac-package-builder) and serves builds that an
// administrator has published into MAC_PACKAGE_BUILDER_DIST_DIR. The macOS app itself is native SwiftUI and never runs in
// this server or in the browser; this module only reads metadata and streams published installers. Nothing is executed.

import { createHash } from 'node:crypto'
import { closeSync, createReadStream, existsSync, lstatSync, openSync, readFileSync, readSync, readdirSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import { SERVER_ROOT } from '../store/dataDir.js'

export const appRoot = (): string => resolve(SERVER_ROOT, '..', 'apps', 'mac-package-builder')

export interface SyncInfo { mirroredFrom?: string; originalCommit?: string; syncedAt?: string }
export interface MacBuild { name: string; sizeBytes: number; modifiedAt: string; sha256: string; kind: 'dmg' | 'pkg' | 'zip' }

/** Parses the `.synced-from` file written by scripts/sync-mac-package-builder.sh. */
export function readSyncInfo(root = appRoot()): { bundled: boolean; sync: SyncInfo } {
  if (!existsSync(join(root, 'Package.swift'))) return { bundled: false, sync: {} }
  let text = ''
  try { text = readFileSync(join(root, '.synced-from'), 'utf-8') } catch { /* mirror made without the marker */ }
  const grab = (label: string): string | undefined => new RegExp(`^${label}:\\s*(.+)$`, 'm').exec(text)?.[1]?.trim()
  const commit = grab('Original repo commit')?.split(' ')[0]
  const from = grab('Mirrored from')
  const at = grab('Synced at')
  return { bundled: true, sync: { ...(from ? { mirroredFrom: from } : {}), ...(commit ? { originalCommit: commit } : {}), ...(at ? { syncedAt: at } : {}) } }
}

/** Only plain installer files may be listed or downloaded: no path separators, no dot-prefix, fixed extensions. */
export const BUILD_NAME = /^[A-Za-z0-9][A-Za-z0-9._ +()-]{0,120}\.(dmg|pkg|zip)$/i

export function distDir(env: NodeJS.ProcessEnv = process.env): string | null {
  const d = env['MAC_PACKAGE_BUILDER_DIST_DIR']?.trim()
  return d ? resolve(d) : null
}

const hashCache = new Map<string, { key: string; sha256: string }>()

function sha256Of(file: string, key: string): string {
  const cached = hashCache.get(file)
  if (cached?.key === key) return cached.sha256
  const h = createHash('sha256')
  const fd = openSync(file, 'r')
  try {
    const buf = Buffer.alloc(1024 * 1024)
    for (let n = readSync(fd, buf, 0, buf.length, null); n > 0; n = readSync(fd, buf, 0, buf.length, null)) h.update(buf.subarray(0, n))
  } finally { closeSync(fd) }
  const sha256 = h.digest('hex')
  hashCache.set(file, { key, sha256 })
  return sha256
}

/** Top-level regular files only; symlinks and anything not matching BUILD_NAME are ignored. */
export function listBuilds(dir: string | null): MacBuild[] {
  if (!dir || !existsSync(dir)) return []
  const out: MacBuild[] = []
  for (const name of readdirSync(dir)) {
    if (!BUILD_NAME.test(name)) continue
    const file = join(dir, name)
    const st = lstatSync(file)
    if (!st.isFile() || st.isSymbolicLink()) continue
    out.push({
      name, sizeBytes: st.size, modifiedAt: st.mtime.toISOString(),
      sha256: sha256Of(file, `${st.mtimeMs}:${st.size}`), kind: name.slice(name.lastIndexOf('.') + 1).toLowerCase() as MacBuild['kind'],
    })
  }
  return out.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt))
}

/** Resolves a requested build name to a safe absolute path, or null when it is not an allowed published build. */
export function resolveBuild(dir: string | null, name: string): string | null {
  if (!dir || !BUILD_NAME.test(name)) return null
  const root = resolve(dir)
  const file = resolve(root, name)
  if (!file.startsWith(root + sep)) return null
  try {
    const st = lstatSync(file)
    return st.isFile() && !st.isSymbolicLink() ? file : null
  } catch { return null }
}

export const openBuild = (file: string) => createReadStream(file)

export const FEATURES = [
  { title: 'macOS packages', detail: 'Turn a Homebrew cask or formula into a signed, notarizable .pkg with detection and uninstall scripts for Endpoint Central.' },
  { title: 'Local Installer → .intunewin', detail: 'Browse an .msi, .exe, .msix or .appx (or a source folder) and build the Intune package on the Mac. For MSI files the ProductCode, version, publisher, architecture and uninstall command are read from the file itself, and a detection script is written.' },
  { title: 'WinGet packager (local)', detail: 'Resolve a WinGet package and build an .intunewin locally via PowerShell + WinTuner — no Windows host needed.' },
  { title: 'Windows build agent client', detail: 'Optional: send work to the Windows worker used by the Windows Package Builder page.' },
]

export const REQUIREMENTS = [
  'macOS 14 (Sonoma) or newer',
  'Xcode or the Xcode Command Line Tools with Swift 5.10+ (only to build from source)',
  'Homebrew — only for the Homebrew packaging flow; PowerShell + WinTuner — only for the WinGet (local) flow',
  'An Apple Developer ID certificate and notarytool profile — only if you want signed, notarized packages',
]

export const BUILD_STEPS = [
  { label: 'Run the tests', command: 'cd apps/mac-package-builder && swift test' },
  { label: 'Build the app bundle', command: 'cd apps/mac-package-builder && scripts/build-release.sh' },
  { label: 'Build signed + notarized', command: 'cd apps/mac-package-builder && scripts/build-release.sh --sign "Developer ID Application: <Your Company> (<TEAMID>)" --notary-profile <profile>' },
  { label: 'Open the app', command: 'open "apps/mac-package-builder/dist/App Package Builder.app"' },
  { label: 'Refresh this copy from the original', command: 'npm run sync:mac-builder' },
]
