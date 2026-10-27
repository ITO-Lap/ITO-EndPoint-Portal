import type { PackagingIntent } from '../api/appIntel'

// Hand-off to the reviewed packaging workflows (Windows: WinGet Search → Select → Review → Package;
// macOS: Homebrew package builder). A packager registers itself here; until one is registered the
// "Create package" action stays disabled. A hand-off may only BUILD a package through that reviewed
// workflow — it never publishes or deploys.

export type PackagerHandler = (intent: PackagingIntent) => void

const handlers: Partial<Record<PackagingIntent['platform'], PackagerHandler>> = {}

export function registerPackager(platform: PackagingIntent['platform'], handler: PackagerHandler): () => void {
  handlers[platform] = handler
  return () => { if (handlers[platform] === handler) delete handlers[platform] }
}

export const hasPackager = (platform: PackagingIntent['platform']): boolean => !!handlers[platform]

export function createPackage(intent: PackagingIntent): boolean {
  const h = handlers[intent.platform]
  if (!h) return false
  h(intent)
  return true
}

/** Plain-text request for teams that package outside this app. */
export function intentToText(i: PackagingIntent): string {
  const src = i.sourceKind === 'winget' ? `winget id: ${i.sourceId ?? 'n/a'}` : `Homebrew cask: ${i.sourceId ?? 'n/a'}`
  return [`${i.kind === 'repackage' ? 'Repackage' : 'New package'} request — ${i.displayName}`, `Platform: ${i.platform}`, src, i.bundleId ? `Bundle id: ${i.bundleId}` : null, `Target version: ${i.targetVersion}`, `Why: ${i.reason}`]
    .filter(Boolean).join('\n')
}
