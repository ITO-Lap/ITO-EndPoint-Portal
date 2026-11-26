import { describe, it, expect } from 'vitest'
import { effectiveFormat, EXCEL_ONLY_TYPES } from '../reportFormats.js'

describe('effectiveFormat', () => {
  it('keeps the chosen format for the report types that can honour it', () => {
    for (const f of ['csv', 'pdf', 'excel', 'pptx']) {
      expect(effectiveFormat('compliance', f)).toBe(f)
      expect(effectiveFormat('inventory', f)).toBe(f)
    }
  })
  it('always reports Excel for the four workbook-only types, whatever was requested', () => {
    expect([...EXCEL_ONLY_TYPES].sort()).toEqual(['app-updates', 'critical-patching', 'stale-devices', 'windows-updates'])
    for (const t of EXCEL_ONLY_TYPES) for (const f of ['csv', 'pdf', 'pptx', 'excel']) expect(effectiveFormat(t, f)).toBe('excel')
  })
})
