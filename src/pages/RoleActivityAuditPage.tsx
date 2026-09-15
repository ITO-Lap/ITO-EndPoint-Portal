import { useCallback, useEffect, useMemo, useState } from 'react'
import { ShieldCheck, AlertTriangle, Download, Loader2 } from 'lucide-react'
import {
  roleActivityApi, setRoleActivityActor,
  type RoleActivityEvent, type RoleActivityEventsSummary, type RoleActivityFilters,
  type RoleActivitySource, type FilterOptions, SOURCE_LABELS,
} from '../api/roleActivity'
import { AuditSummaryCards } from '../components/role-activity/AuditSummaryCards'
import { AuditDateRangeControls, type DateRangeValue } from '../components/role-activity/AuditDateRangeControls'
import { AuditFiltersBar } from '../components/role-activity/AuditFiltersBar'
import { AuditEventsTable } from '../components/role-activity/AuditEventsTable'
import { AuditEventDetailDrawer } from '../components/role-activity/AuditEventDetailDrawer'
import { detectLocalTimezone } from '../lib/timezone'
import type { UserToolRole } from '../types'

// Matches the server's default ROLE_ACTIVITY_LIVE_BROWSE_MAX_DAYS
// (server/.env.example, server/src/routes/roleActivity.ts) — hardcoded here
// since the backend doesn't expose the configured cap via an API response.
// This is a client-side UX guard only (it hides date-range presets/inputs
// that would obviously exceed the cap); the server's 400 response on
// GET /events is the authoritative check, and its error message is
// surfaced verbatim in the error banner below if a request slips past this
// client-side guard (e.g. cap changed server-side without a matching
// frontend deploy).
const RANGE_MAX_DAYS = 31

// Client-side default view: trailing 24 hours, matching the server's own
// default when startUtc/endUtc are omitted (DEFAULT_RANGE_MS in
// server/src/routes/roleActivity.ts). Passed explicitly (rather than
// omitted) so the date-range picker's displayed value always matches what
// was actually queried.
function defaultRange(timezone: string): DateRangeValue {
  const endUtc = new Date()
  const startUtc = new Date(endUtc.getTime() - 24 * 60 * 60 * 1000)
  return { startUtc, endUtc, timezone }
}

type SaveFormat = 'csv' | 'json'

// Safety cap on how many pages the Save button will walk when assembling a
// full-range export — bounds worst-case client memory/time if a filter
// somehow matches an enormous number of events within the 31-day window.
// At pageSize 200 this is 20,000 events, comfortably above any realistic
// role/RBAC-change volume for a single tenant in 31 days.
const SAVE_MAX_PAGES = 100
const SAVE_PAGE_SIZE = 200

function csvEscape(value: unknown): string {
  const str = value === null || value === undefined ? '' : String(value)
  // Formula-injection guard: prefix cells starting with =, +, -, @ so
  // spreadsheet apps don't interpret them as formulas.
  const guarded = /^[=+\-@]/.test(str) ? `'${str}` : str
  return /[",\n]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded
}

function toCsv(events: RoleActivityEvent[]): string {
  const headers = ['id', 'source', 'sourceRecordId', 'occurredAt', 'actor', 'operation', 'target', 'rawJson']
  const lines = [headers.join(',')]
  for (const e of events) {
    lines.push([e.id, e.source, e.sourceRecordId, e.occurredAt, e.actor ?? '', e.operation ?? '', e.target ?? '', JSON.stringify(e.rawJson)]
      .map(csvEscape).join(','))
  }
  return lines.join('\n')
}

// Backend error strings often embed a raw upstream JSON error body (Graph or
// the O365 Management Activity API), e.g. `Microsoft Graph returned 400:
// {"error":{"code":"...","message":"..."}}`. Dumping that whole blob in the
// UI isn't web-friendly — extract just the human-readable `error.message`
// (keeping any appended hint text, like the ActivityFeed.Read permission
// note) and let the raw text stay available behind a "Details" toggle.
function friendlyErrorMessage(raw: string): string {
  const jsonStart = raw.indexOf('{')
  const jsonEnd = raw.lastIndexOf('}')
  if (jsonStart === -1 || jsonEnd === -1 || jsonEnd < jsonStart) return raw
  try {
    const parsed = JSON.parse(raw.slice(jsonStart, jsonEnd + 1)) as { error?: { message?: string } }
    const inner = parsed.error?.message
    if (!inner?.trim()) return raw
    const suffix = raw.slice(jsonEnd + 1).trim()
    return suffix ? `${inner} ${suffix}` : inner
  } catch {
    return raw
  }
}

function downloadBlob(content: string, mimeType: string, filename: string) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

interface Props {
  viewerRole: UserToolRole
  userEmail?: string
  onBack?: () => void
}

function canExport(role: UserToolRole): boolean {
  return role === 'Global Admin' || role === 'IT Admin'
}

export function RoleActivityAuditPage({ viewerRole, userEmail, onBack }: Props) {
  useEffect(() => { setRoleActivityActor(viewerRole, userEmail ?? 'unknown@zinnia.com') }, [viewerRole, userEmail])

  const [range, setRange] = useState<DateRangeValue>(() => defaultRange(detectLocalTimezone()))
  const [source, setSource] = useState<RoleActivitySource | undefined>(undefined)
  const [filters, setFilters] = useState<RoleActivityFilters>({})
  const [filterOptions, setFilterOptions] = useState<FilterOptions | null>(null)

  const [events, setEvents] = useState<RoleActivityEvent[]>([])
  const [summary, setSummary] = useState<RoleActivityEventsSummary | null>(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [sortField, setSortField] = useState('occurredAt')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null)
  const [selectedEvent, setSelectedEvent] = useState<RoleActivityEvent | null>(null)
  const [sourceErrors, setSourceErrors] = useState<Partial<Record<RoleActivitySource, string>>>({})
  const [sourceNotes, setSourceNotes] = useState<Partial<Record<RoleActivitySource, string>>>({})
  const [saving, setSaving] = useState<SaveFormat | null>(null)

  useEffect(() => {
    roleActivityApi.filterOptions().then(res => setFilterOptions(res.data)).catch(() => {})
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await roleActivityApi.listEvents({
        startUtc: range.startUtc.toISOString(), endUtc: range.endUtc.toISOString(), timezone: range.timezone,
        source, page, pageSize, sortField, sortDirection, ...filters,
      })
      setEvents(res.data)
      setSummary(res.summary)
      setTotal(res.pagination.total)
      setSourceErrors(res.sourceErrors ?? {})
      setSourceNotes(res.sourceNotes ?? {})
      setLastRefreshed(new Date())
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load role activity events'
      setError(message)
      setSourceErrors({})
      setSourceNotes({})
    } finally {
      setLoading(false)
    }
  }, [range, source, filters, page, pageSize, sortField, sortDirection])

  useEffect(() => { void load() }, [load])

  // Reset to page 1 whenever the query itself changes (not just page number).
  useEffect(() => { setPage(1) }, [range, source, filters, pageSize, sortField, sortDirection])

  const roleCanExport = useMemo(() => canExport(viewerRole), [viewerRole])
  const failedSourceCount = Object.keys(sourceErrors).length

  // Save button: this fetches the FULL currently-filtered range client-side
  // (walking pages at the max page size), not just the page of rows visible
  // in the table right now. A user who filters to e.g. actor=X across a
  // 7-day range and clicks Save reasonably expects "export what I'm looking
  // at" to mean every matching event in that range/filter, not only the 25
  // (or however many) rows currently on-screen. There is no server-side
  // export route anymore (removed with the DB), so this walks GET /events
  // with the same range/filters/sort, pageSize=200, until it has every
  // matching event (bounded by SAVE_MAX_PAGES as a safety cap).
  async function handleSave(format: SaveFormat) {
    setSaving(format)
    setError(null)
    try {
      const all: RoleActivityEvent[] = []
      let pageNum = 1
      let expectedTotal = Infinity
      while (all.length < expectedTotal && pageNum <= SAVE_MAX_PAGES) {
        const res = await roleActivityApi.listEvents({
          startUtc: range.startUtc.toISOString(), endUtc: range.endUtc.toISOString(), timezone: range.timezone,
          source, page: pageNum, pageSize: SAVE_PAGE_SIZE, sortField, sortDirection, ...filters,
        })
        all.push(...res.data)
        expectedTotal = res.pagination.total
        if (res.data.length === 0) break
        pageNum += 1
      }
      const stamp = `${range.startUtc.toISOString().slice(0, 10)}_${range.endUtc.toISOString().slice(0, 10)}`
      if (format === 'csv') {
        downloadBlob(toCsv(all), 'text/csv;charset=utf-8', `role-activity-${stamp}.csv`)
      } else {
        downloadBlob(JSON.stringify(all, null, 2), 'application/json', `role-activity-${stamp}.json`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate export')
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          {onBack && (
            <div className="flex items-center gap-2 mb-1 text-sm text-slate-400">
              <button type="button" onClick={onBack} className="hover:text-slate-600 transition">← Back</button>
              <span>/</span>
              <span className="text-slate-700 font-medium flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-slate-500" aria-hidden="true" /> Role Activity Audit
              </span>
            </div>
          )}
          {!onBack && (
            <h1 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-orange-600" aria-hidden="true" /> Role Activity Audit
            </h1>
          )}
          <p className="text-xs text-slate-500 mt-0.5">
            Live browse of admin role-management, RBAC, and permission-change activity across Microsoft Entra ID,
            Intune, and SharePoint. Every refresh queries all three sources directly, in real time — nothing is
            stored server-side, so click Refresh to see the latest activity.
          </p>
        </div>
        {roleCanExport && (
          <div className="flex items-center gap-2">
            <button type="button" disabled={saving !== null} onClick={() => void handleSave('csv')}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition disabled:opacity-50">
              {saving === 'csv' ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Download className="h-3.5 w-3.5" aria-hidden="true" />}
              Save CSV
            </button>
            <button type="button" disabled={saving !== null} onClick={() => void handleSave('json')}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition disabled:opacity-50">
              {saving === 'json' ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Download className="h-3.5 w-3.5" aria-hidden="true" />}
              Save JSON
            </button>
          </div>
        )}
      </div>

      <AuditSummaryCards summary={summary} loading={loading} />

      <AuditDateRangeControls value={range} onChange={setRange} maxRangeDays={RANGE_MAX_DAYS} />

      <AuditFiltersBar filters={filters} onChange={setFilters} source={source} onSourceChange={setSource} filterOptions={filterOptions} />

      {failedSourceCount > 0 && (
        <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800 space-y-2">
          {(Object.entries(sourceErrors) as Array<[RoleActivitySource, string]>).map(([src, message]) => (
            <div key={src} className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" aria-hidden="true" />
              <span>
                <span className="font-semibold">{SOURCE_LABELS[src]} failed:</span> {friendlyErrorMessage(message)} — showing
                results from the other {3 - failedSourceCount} source{3 - failedSourceCount === 1 ? '' : 's'} only.
                {message !== friendlyErrorMessage(message) && (
                  <details className="mt-1">
                    <summary className="cursor-pointer text-amber-700 underline">Technical details</summary>
                    <pre className="mt-1 whitespace-pre-wrap break-all text-[0.65rem] text-amber-700">{message}</pre>
                  </details>
                )}
              </span>
            </div>
          ))}
        </div>
      )}

      {Object.keys(sourceNotes).length > 0 && (
        <div role="status" className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-xs text-sky-800 space-y-1.5">
          {(Object.entries(sourceNotes) as Array<[RoleActivitySource, string]>).map(([src, note]) => (
            <div key={src} className="flex items-start gap-2">
              <span className="font-semibold">{SOURCE_LABELS[src]}:</span> <span>{note}</span>
            </div>
          ))}
        </div>
      )}

      <AuditEventsTable
        events={events} loading={loading} error={error ? friendlyErrorMessage(error) : error}
        page={page} pageSize={pageSize} total={total}
        onPageChange={setPage} onPageSizeChange={setPageSize}
        sortField={sortField} sortDirection={sortDirection}
        onSortChange={(field, direction) => { setSortField(field); setSortDirection(direction) }}
        timezone={range.timezone} onRowClick={setSelectedEvent}
        onRefresh={() => void load()} lastRefreshed={lastRefreshed}
      />

      <AuditEventDetailDrawer event={selectedEvent} timezone={range.timezone} onClose={() => setSelectedEvent(null)} />
    </div>
  )
}
