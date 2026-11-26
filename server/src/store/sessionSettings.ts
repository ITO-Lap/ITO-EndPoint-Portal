// Auto sign-out setting (Settings -> Security). One value for everybody: how many minutes of
// inactivity end a session. Saved under DATA_DIR so it survives restarts and re-deploys.

import { dataFile, readJsonFile, writeJsonAtomic } from './dataDir.js'

export const IDLE_TIMEOUT_OPTIONS = [15, 30, 45, 60] as const
export type IdleTimeoutMin = typeof IDLE_TIMEOUT_OPTIONS[number]
export const DEFAULT_IDLE_TIMEOUT_MIN: IdleTimeoutMin = 60

const file = (): string => dataFile('session-settings.json')

export const isIdleTimeout = (v: unknown): v is IdleTimeoutMin =>
  typeof v === 'number' && (IDLE_TIMEOUT_OPTIONS as readonly number[]).includes(v)

/** The saved value, or the 60-minute default when nothing valid is saved. */
export function getIdleTimeoutMin(): IdleTimeoutMin {
  const saved = readJsonFile<{ idleTimeoutMin?: unknown }>(file())?.idleTimeoutMin
  return isIdleTimeout(saved) ? saved : DEFAULT_IDLE_TIMEOUT_MIN
}

export function setIdleTimeoutMin(minutes: IdleTimeoutMin, changedBy: string): void {
  writeJsonAtomic(file(), { idleTimeoutMin: minutes, updatedBy: changedBy, updatedAt: new Date().toISOString() })
}
