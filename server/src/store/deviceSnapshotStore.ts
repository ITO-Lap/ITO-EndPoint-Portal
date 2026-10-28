// Last-known-good device list per MDM source, kept on disk (DATA_DIR/cache). It lets the app
//  - keep showing data when Intune/ManageEngine is slow or down, instead of an empty page or an error, and
//  - answer immediately after a restart or deploy while the first live sync runs in the background.
// Tests (NODE_ENV=test) skip the disk unless a file is passed explicitly.

import { dataFile, readJsonFile, writeJsonAtomic } from './dataDir.js'
import type { Device } from '../types.js'

export type DeviceSource = 'intune' | 'manageengine'
export interface SourceSnapshot { savedAt: string; devices: Device[] }

const PERSIST = process.env['NODE_ENV'] !== 'test'
const fileFor = (source: DeviceSource): string => dataFile(`cache/devices-${source}.json`)

export function saveSourceDevices(source: DeviceSource, devices: Device[], file?: string): void {
  if (!file && !PERSIST) return
  // An empty answer is not a "good" snapshot: never let an outage wipe the last real list.
  if (!devices.length) return
  try { writeJsonAtomic(file ?? fileFor(source), { savedAt: new Date().toISOString(), devices } satisfies SourceSnapshot, false) }
  catch (e) { console.warn(`[deviceSnapshot] Could not save ${source} devices:`, e instanceof Error ? e.message : e) }
}

export function loadSourceDevices(source: DeviceSource, file?: string): SourceSnapshot | null {
  if (!file && !PERSIST) return null
  const snap = readJsonFile<SourceSnapshot>(file ?? fileFor(source))
  return snap && Array.isArray(snap.devices) && snap.devices.length && snap.savedAt ? snap : null
}
