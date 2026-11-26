// Saved portal settings (Settings page sections). Local file by default, PostgreSQL (app_settings) once connected,
// like the sync store. Reads fall back to the file for a section PostgreSQL does not have yet, so connecting
// PostgreSQL later does not lose what was saved before. Values are only stored here; whether the portal enforces
// them is a separate matter (see docs/07-features/SETTINGS.md).

import { query } from '../db/index.js'
import { dataFile, readJsonFile, writeJsonAtomic } from './dataDir.js'
import { isDbReady } from '../services/sync/backend.js'
import type { SettingsSection } from '../services/settingsSchemas.js'

export interface SavedSection { values: Record<string, unknown>; updatedBy: string | null; updatedAt: string }
type FileShape = { sections?: Record<string, SavedSection> }

const file = (): string => dataFile('app-settings.json')
const readFileStore = (): Record<string, SavedSection> => readJsonFile<FileShape>(file())?.sections ?? {}

export async function getAllSettings(): Promise<Record<string, SavedSection>> {
  const fromFile = readFileStore()
  if (!isDbReady()) return fromFile
  const r = await query<{ section: string; settings: Record<string, unknown>; updated_by: string | null; updated_at: Date }>('SELECT section, settings, updated_by, updated_at FROM app_settings')
  const merged = { ...fromFile }
  for (const x of r.rows) merged[x.section] = { values: x.settings, updatedBy: x.updated_by, updatedAt: x.updated_at.toISOString() }
  return merged
}

/** Saves one section (replacing its stored values) and returns the previous values, for the audit trail. */
export async function saveSection(section: SettingsSection, values: Record<string, unknown>, actor: string): Promise<{ before: Record<string, unknown> | null; saved: SavedSection }> {
  const before = (await getAllSettings())[section]?.values ?? null
  const saved: SavedSection = { values, updatedBy: actor, updatedAt: new Date().toISOString() }
  if (isDbReady()) {
    await query(
      `INSERT INTO app_settings (section, settings, updated_by, updated_at) VALUES ($1, $2, $3, NOW())
       ON CONFLICT (section) DO UPDATE SET settings = EXCLUDED.settings, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
      [section, JSON.stringify(values), actor],
    )
  } else {
    writeJsonAtomic(file(), { sections: { ...readFileStore(), [section]: saved } })
  }
  return { before, saved }
}
