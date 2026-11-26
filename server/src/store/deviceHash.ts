import { createHash } from 'node:crypto'
import type { Device } from '../types.js'

export const RETIRE_AFTER_MISSES = Number(process.env['SYNC_RETIRE_AFTER_MISSES']) || 2

/** JSON with sorted keys, so the same data always hashes the same. */
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>
    return `{${Object.keys(o).filter(k => o[k] !== undefined).sort().map(k => `${JSON.stringify(k)}:${stable(o[k])}`).join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}
export const hashDevice = (d: Device): string => createHash('sha256').update(stable(d)).digest('hex')
