// Intune Scripts & Configurations — decode, filename, JSON, and ZIP building.
//
// Pure/local functions only (no Graph calls here) — server/src/services/
// intuneScriptsConfigGraph.ts owns all Graph I/O; this file turns fetched
// data into the files a user downloads.

import { PassThrough } from 'stream'
import type { Assignment, InventoryItem, ResourceType } from './intuneScriptsConfigGraph.js'
import { resourceTypeDef } from './intuneScriptsConfigGraph.js'

const GRAPH_VERSION_LABEL: Record<string, string> = {
  'https://graph.microsoft.com/v1.0': 'v1.0',
  'https://graph.microsoft.com/beta': 'beta',
}

// ─── Script content decoding ─────────────────────────────────────────────────
// Only these three field names are ever decoded — scoped deliberately so a
// future Graph response shape change can't cause an unrelated field (a
// secret, a certificate blob, etc.) to be decoded and written to disk.
const DECODABLE_FIELDS = ['scriptContent', 'detectionScriptContent', 'remediationScriptContent'] as const

export function decodeScriptContent(base64: string): string {
  return Buffer.from(base64, 'base64').toString('utf-8')
}

/** Extracts every decodable script-content field present on an item's raw
 *  Graph object, decoded. A remediation has two (detection + remediation);
 *  a PowerShell/shell script has one. */
export function extractDecodedScripts(item: InventoryItem): Array<{ field: string; content: string }> {
  const out: Array<{ field: string; content: string }> = []
  for (const field of DECODABLE_FIELDS) {
    const value = item.raw[field]
    if (typeof value === 'string' && value.length > 0) {
      out.push({ field, content: decodeScriptContent(value) })
    }
  }
  return out
}

// ─── Filename sanitization ────────────────────────────────────────────────────

/** Strips path-traversal and filesystem-unsafe characters from a display
 *  name and produces a safe base filename (no extension). Falls back to the
 *  resource id when the display name is empty/whitespace-only after
 *  sanitizing, so every item always gets a non-empty, non-colliding-by-default name. */
export function sanitizeFilename(displayName: string, fallbackId: string): string {
  const noControlChars = Array.from(displayName).filter(ch => ch.codePointAt(0)! > 0x1f).join('')
  const cleaned = noControlChars
    .normalize('NFKD')
    .replace(/[\\/]+/g, '-')       // path separators
    .replace(/\.\.+/g, '.')        // collapse ".." sequences (traversal)
    .replace(/[<>:"|?*]/g, '')     // Windows-reserved characters
    .replace(/^[.\s]+|[.\s]+$/g, '') // leading/trailing dots/spaces
    .trim()
  // A name built entirely from traversal/separator noise (e.g. "../..\..")
  // can survive the replacements above as a residual run of dots/dashes —
  // that's not a usable filename, so treat it the same as empty.
  const isMeaningless = cleaned.length === 0 || /^[-._\s]*$/.test(cleaned)
  return !isMeaningless ? cleaned.slice(0, 150) : fallbackId
}

/** Appends " (1)", " (2)", … on collision, mutating `usedNames` as it goes so
 *  a caller can call this in a loop over a full export batch. */
export function dedupeFilename(usedNames: Set<string>, candidate: string): string {
  if (!usedNames.has(candidate)) {
    usedNames.add(candidate)
    return candidate
  }
  const dotIndex = candidate.lastIndexOf('.')
  const base = dotIndex > 0 ? candidate.slice(0, dotIndex) : candidate
  const ext = dotIndex > 0 ? candidate.slice(dotIndex) : ''
  let n = 1
  let next = `${base} (${n})${ext}`
  while (usedNames.has(next)) {
    n += 1
    next = `${base} (${n})${ext}`
  }
  usedNames.add(next)
  return next
}

function scriptExtension(type: ResourceType): string | null {
  // Remediations (deviceHealthScript) carry PowerShell content in both
  // detectionScriptContent and remediationScriptContent — exported as .ps1
  // like a plain PowerShell script, not wrapped in JSON. This was previously
  // inconsistent with the single-item download route, which already treated
  // remediations as a script — fixed here so bulk ZIP export matches.
  if (type === 'powershell_script' || type === 'remediation') return '.ps1'
  return null
}

// ─── Configuration JSON (preserves the complete Intune object) ───────────────

export interface AssignmentOut {
  id: string
  targetType: string | null
  groupId: string | null
  groupDisplayName: string | null
  assignmentFilterId: string | null
  assignmentFilterType: string | null
}

function toAssignmentOut(a: Assignment, groupNames: Record<string, string>): AssignmentOut {
  const target = a.target ?? {}
  const groupId = target.groupId ?? null
  return {
    id: a.id,
    targetType: target['@odata.type'] ?? null,
    groupId,
    groupDisplayName: groupId ? (groupNames[groupId] ?? null) : null,
    assignmentFilterId: target.deviceAndAppManagementAssignmentFilterId ?? null,
    assignmentFilterType: target.deviceAndAppManagementAssignmentFilterType ?? null,
  }
}

export interface ConfigJsonExport {
  exportedAt: string
  graphApiVersion: string
  resourceType: ResourceType
  category: string
  id: string
  name: string
  scopeTagIds: string[]
  settings: unknown[] | null
  assignments: AssignmentOut[]
  includedGroups: string[]
  excludedGroups: string[]
  source: Record<string, unknown>
}

/** Builds the full preserved-object JSON export for a non-script item
 *  (@odata.type, id, name, settings, assignments, included/excluded groups,
 *  assignment filters, scope tags, export timestamp, Graph API version). */
export function buildConfigJson(
  item: InventoryItem,
  assignments: Assignment[],
  settings: unknown[] | null,
  groupNames: Record<string, string>
): ConfigJsonExport {
  const def = resourceTypeDef(item.type)
  const assignmentsOut = assignments.map(a => toAssignmentOut(a, groupNames))
  const includedGroups = assignmentsOut
    .filter(a => a.targetType?.includes('groupAssignmentTarget') && !a.targetType?.toLowerCase().includes('exclusion'))
    .map(a => a.groupDisplayName ?? a.groupId)
    .filter((g): g is string => !!g)
  const excludedGroups = assignmentsOut
    .filter(a => a.targetType?.toLowerCase().includes('exclusion'))
    .map(a => a.groupDisplayName ?? a.groupId)
    .filter((g): g is string => !!g)

  return {
    exportedAt: new Date().toISOString(),
    graphApiVersion: GRAPH_VERSION_LABEL[def.base] ?? def.base,
    resourceType: item.type,
    category: item.category,
    id: item.id,
    name: item.displayName,
    scopeTagIds: Array.isArray(item.raw.roleScopeTagIds) ? item.raw.roleScopeTagIds as string[] : [],
    settings,
    assignments: assignmentsOut,
    includedGroups,
    excludedGroups,
    source: item.raw,
  }
}

// ─── ZIP export ───────────────────────────────────────────────────────────────

export interface ExportFile {
  compositeId: string
  resourceType: ResourceType
  category: string
  resourceId: string
  displayName: string
  lastModifiedDateTime: string | null
  zipPath: string
  content: Buffer
  success: true
}

export interface ExportFailure {
  compositeId: string
  resourceType: ResourceType
  category: string
  resourceId: string
  displayName: string
  success: false
  error: string
}

export type ExportEntry = ExportFile | ExportFailure

const CATEGORY_ZIP_DIR: Record<string, string> = {
  'scripts/powershell': 'scripts/powershell',
  'scripts/remediations': 'scripts/remediations',
  'configurations/settings-catalog': 'configurations/settings-catalog',
  'configurations/device-configuration': 'configurations/device-configuration',
  'configurations/compliance': 'configurations/compliance',
  'configurations/endpoint-security': 'configurations/endpoint-security',
  'configurations/administrative-templates': 'configurations/administrative-templates',
  'configurations/windows-update': 'configurations/windows-update',
  'configurations/autopilot': 'configurations/autopilot',
}

/** Builds one export file entry (script content decoded to .ps1/.sh, or the
 *  full preserved object to .json) for a single item, given its already-
 *  fetched assignments/settings/group names. Never throws — callers pass the
 *  result straight into buildManifest/buildExportZip so a per-item failure
 *  (caught by the caller before this is invoked) is recorded, not fatal to
 *  the rest of the batch. */
export function buildExportEntry(
  item: InventoryItem,
  assignments: Assignment[],
  settings: unknown[] | null,
  groupNames: Record<string, string>,
  usedNames: Set<string>
): ExportFile {
  const dir = CATEGORY_ZIP_DIR[item.category] ?? item.category
  const ext = scriptExtension(item.type)
  const baseName = sanitizeFilename(item.displayName, item.id)

  let content: Buffer
  let filename: string
  if (ext) {
    const scripts = extractDecodedScripts(item)
    const body = scripts.length > 1
      ? scripts.map(s => `# ---- ${s.field} ----\n${s.content}`).join('\n\n')
      : (scripts[0]?.content ?? '')
    content = Buffer.from(body, 'utf-8')
    filename = dedupeFilename(usedNames, `${baseName}${ext}`)
  } else {
    const json = buildConfigJson(item, assignments, settings, groupNames)
    content = Buffer.from(JSON.stringify(json, null, 2), 'utf-8')
    filename = dedupeFilename(usedNames, `${baseName}.json`)
  }

  return {
    compositeId: item.compositeId,
    resourceType: item.type,
    category: item.category,
    resourceId: item.id,
    displayName: item.displayName,
    lastModifiedDateTime: item.lastModifiedDateTime,
    zipPath: `${dir}/${filename}`,
    content,
    success: true,
  }
}

export interface Manifest {
  generatedAt: string
  totalRequested: number
  totalSucceeded: number
  totalFailed: number
  entries: Array<
    | { compositeId: string; resourceType: string; category: string; resourceId: string; filename: string; lastModifiedDateTime: string | null; status: 'success' }
    | { compositeId: string; resourceType: string; category: string; resourceId: string; filename: null; lastModifiedDateTime: null; status: 'failed'; error: string }
  >
}

export function buildManifest(entries: ExportEntry[]): Manifest {
  const succeeded = entries.filter((e): e is ExportFile => e.success)
  const failed = entries.filter((e): e is ExportFailure => !e.success)
  return {
    generatedAt: new Date().toISOString(),
    totalRequested: entries.length,
    totalSucceeded: succeeded.length,
    totalFailed: failed.length,
    entries: [
      ...succeeded.map(e => ({
        compositeId: e.compositeId, resourceType: e.resourceType, category: e.category,
        resourceId: e.resourceId, filename: e.zipPath, lastModifiedDateTime: e.lastModifiedDateTime,
        status: 'success' as const,
      })),
      ...failed.map(e => ({
        compositeId: e.compositeId, resourceType: e.resourceType, category: e.category,
        resourceId: e.resourceId, filename: null, lastModifiedDateTime: null,
        status: 'failed' as const, error: e.error,
      })),
    ],
  }
}

/** Streams every successful entry plus manifest.json into a single in-memory
 *  ZIP buffer under an `intune-export/` root, matching the folder layout in
 *  docs/04-integrations/INTUNE-SCRIPTS-CONFIGURATIONS.md. A partial-failure
 *  batch still produces a valid zip — failures are recorded in the manifest,
 *  never silently dropped or turned into a thrown error. */
export async function buildExportZip(entries: ExportEntry[]): Promise<Buffer> {
  const { ZipArchive } = await import('archiver')
  const manifest = buildManifest(entries)
  const manifestBuf = Buffer.from(JSON.stringify(manifest, null, 2), 'utf-8')

  return new Promise((resolve, reject) => {
    const archive = new ZipArchive({ zlib: { level: 9 } })
    const stream = new PassThrough()
    const chunks: Buffer[] = []
    stream.on('data', (c: Buffer) => chunks.push(c))
    stream.on('end', () => resolve(Buffer.concat(chunks)))
    archive.on('error', reject)
    archive.pipe(stream)

    archive.append(manifestBuf, { name: 'intune-export/manifest.json' })
    for (const entry of entries) {
      if (entry.success) archive.append(entry.content, { name: `intune-export/${entry.zipPath}` })
    }
    void archive.finalize()
  })
}

// ─── Bounded concurrency ──────────────────────────────────────────────────────
// Copied (not imported/shared) to match this repo's existing convention of
// keeping bounded-concurrency helpers local to each service file.
export async function pLimit<T>(tasks: Array<() => Promise<T>>, limit: number): Promise<T[]> {
  const results: T[] = new Array(tasks.length)
  let idx = 0
  async function worker() {
    while (idx < tasks.length) {
      const i = idx++
      const task = tasks[i]
      if (task) results[i] = await task()
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker))
  return results
}
