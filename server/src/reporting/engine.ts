import type { Device } from '../types.js'
import type { LibraryApp } from '../services/kandji.js'
import type { EntraData } from '../services/entra.js'

// ── Public types ──────────────────────────────────────────────────────────────

export type ReportCategory =
  | 'inventory'
  | 'compliance'
  | 'security'
  | 'software'
  | 'health'
  | 'users'
  // Microsoft Graph API report categories
  | 'endpoint'   // Endpoint management (Intune MDM)
  | 'threat'     // Security & threat intelligence (Defender)
  | 'identity'   // Identity & user (Entra ID / AAD)
  | 'audit'      // Compliance & audit (Purview / AAD)
  // Slack Audit Logs API report categories
  | 'slack-access'      // Login, SSO & authentication events
  | 'slack-channel'     // Message & channel activity
  | 'slack-users'       // User & workspace management
  | 'slack-files'       // File & app activity
  | 'slack-compliance'  // Data retention, DLP & eDiscovery

export interface ReportColumn {
  key:    string
  label:  string
  type:   'string' | 'number' | 'date' | 'badge' | 'percent'
  align?: 'left' | 'right'
  width?: 'sm' | 'md' | 'lg' | 'xl'
}

export interface ReportSummaryCard {
  label: string
  value: string | number
  color: 'green' | 'red' | 'amber' | 'sky' | 'slate' | 'violet'
}

export interface ReportParams {
  limit?:   number
  offset?:  number
  sortBy?:  string
  sortDir?: 'asc' | 'desc'
}

export interface ReportResult {
  reportId:    string
  reportName:  string
  category:    ReportCategory
  description: string
  generatedAt: string
  totalRows:   number
  rows:        Record<string, unknown>[]
  columns:     ReportColumn[]
  summary?:    ReportSummaryCard[]
  cached:      boolean
}

export interface ReportMeta {
  id:           string
  name:         string
  category:     ReportCategory
  description:  string
  sources:      string[]
  apiEndpoint?: string
  graphSource?: string
}

// Data context injected into every report runner
export interface ReportContext {
  devices:     Device[]
  kandjiApps?: LibraryApp[]
  entraData?:  EntraData
  isMock:      boolean
}

export interface ReportDef {
  id:           string
  name:         string
  category:     ReportCategory
  description:  string
  sources:      string[]
  columns:      ReportColumn[]
  defaultSort?: { field: string; dir: 'asc' | 'desc' }
  cacheTtlSec:  number
  apiEndpoint?: string
  graphSource?: string
  run(ctx: ReportContext, params: ReportParams): {
    rows:     Record<string, unknown>[]
    summary?: ReportSummaryCard[]
  }
}

// ── Registry ──────────────────────────────────────────────────────────────────

const registry = new Map<string, ReportDef>()

export function registerReport(def: ReportDef): void {
  registry.set(def.id, def)
}

export function getReportDef(id: string): ReportDef {
  const def = registry.get(id)
  if (!def) throw new Error(`Report not found: ${id}`)
  return def
}

export function listReportMeta(): ReportMeta[] {
  return Array.from(registry.values()).map(r => ({
    id: r.id, name: r.name, category: r.category,
    description: r.description, sources: r.sources,
    ...(r.apiEndpoint && { apiEndpoint: r.apiEndpoint }),
    ...(r.graphSource && { graphSource: r.graphSource }),
  }))
}

// ── Cache ─────────────────────────────────────────────────────────────────────

interface CacheEntry { result: ReportResult; expiresAt: number }
const cache = new Map<string, CacheEntry>()

export function invalidateReportCache(reportId?: string): void {
  if (reportId) {
    cache.delete(reportId)
  } else {
    cache.clear()
  }
}

// ── Runner ────────────────────────────────────────────────────────────────────

export function runReport(
  def: ReportDef,
  ctx: ReportContext,
  params: ReportParams = {},
): ReportResult {
  // Cache check
  const cached = cache.get(def.id)
  if (cached && Date.now() < cached.expiresAt) {
    return { ...cached.result, cached: true }
  }

  const { rows: allRows, summary } = def.run(ctx, params)

  // Sort
  const sortField = params.sortBy ?? def.defaultSort?.field
  const sortDir   = params.sortDir ?? def.defaultSort?.dir ?? 'asc'
  let sorted = allRows
  if (sortField) {
    sorted = [...allRows].sort((a, b) => {
      const av = a[sortField], bv = b[sortField]
      if (av == null) return 1
      if (bv == null) return -1
      const less = av < bv
      return sortDir === 'asc' ? (less ? -1 : 1) : (less ? 1 : -1)
    })
  }

  // Paginate
  const limit  = Math.min(params.limit ?? 500, 5000)
  const offset = params.offset ?? 0
  const page   = sorted.slice(offset, offset + limit)

  const result: ReportResult = {
    reportId:    def.id,
    reportName:  def.name,
    category:    def.category,
    description: def.description,
    generatedAt: new Date().toISOString(),
    totalRows:   allRows.length,
    rows:        page,
    columns:     def.columns,
    ...(summary !== undefined && { summary }),
    cached:      false,
  }

  cache.set(def.id, { result, expiresAt: Date.now() + def.cacheTtlSec * 1000 })
  return result
}

// ── CSV export ────────────────────────────────────────────────────────────────

export function toCSV(result: ReportResult): string {
  const header = result.columns.map(c => `"${c.label}"`).join(',')
  const rows   = result.rows.map(row =>
    result.columns.map(c => {
      const v = row[c.key] ?? ''
      return `"${String(v).replace(/"/g, '""')}"`
    }).join(',')
  )
  return [header, ...rows].join('\n')
}
