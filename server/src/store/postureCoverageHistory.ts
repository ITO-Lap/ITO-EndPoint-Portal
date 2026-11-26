import { dataFile, readJsonFile, writeJsonAtomic } from './dataDir.js'

// Daily Endpoint Central agent-coverage history for the Security Posture page, so rollout progress
// (e.g. "Windows 85% → 92%") shows up on its own as agents are installed. One entry per UTC day (the latest
// reading of the day wins); the last HISTORY_DAYS days are kept. Tests skip the disk unless a file is passed.

export interface CoverageCount { devices: number; withAgent: number }
export interface CoverageEntry { date: string; windows: CoverageCount; macos: CoverageCount }

const HISTORY_DAYS = 180
const PERSIST = process.env['NODE_ENV'] !== 'test' && !process.env['VITEST']
const file = (): string => dataFile('cache/posture-coverage-history.json')

export function loadCoverageHistory(path?: string): CoverageEntry[] {
  if (!path && !PERSIST) return []
  const raw = readJsonFile<CoverageEntry[]>(path ?? file())
  return Array.isArray(raw) ? raw.filter(e => e && typeof e.date === 'string') : []
}

export function recordCoverage(entry: CoverageEntry, path?: string): CoverageEntry[] {
  if (!path && !PERSIST) return [entry]
  // A reading with no devices is not a reading (e.g. an outage) — never let it write a misleading 0%.
  if (entry.windows.devices + entry.macos.devices === 0) return loadCoverageHistory(path)
  const history = loadCoverageHistory(path).filter(e => e.date !== entry.date)
  history.push(entry)
  history.sort((a, b) => a.date.localeCompare(b.date))
  const kept = history.slice(-HISTORY_DAYS)
  try { writeJsonAtomic(path ?? file(), kept, false) } catch (e) { console.warn('[postureCoverage] could not save history:', e instanceof Error ? e.message : e) }
  return kept
}
