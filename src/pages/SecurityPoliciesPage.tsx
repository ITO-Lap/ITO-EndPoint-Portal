import { useState, useEffect, useCallback } from 'react'
import {
  Search, X, RefreshCw, ShieldCheck, Download, ChevronRight,
  CheckCircle2, XCircle, Minus, PlusCircle, Pencil, MinusCircle,
} from 'lucide-react'
import {
  securityPoliciesApi, setSecurityPoliciesActor,
  CATEGORY_LABELS, INTUNE_CATEGORIES, ENTRA_CATEGORIES,
} from '../api/securityPolicies'
import type {
  PolicyListItem, PolicyCategory, PolicySource, PolicyDetail,
  SyncRunSummary, ChangeHistoryItem,
} from '../api/securityPolicies'
import type { UserToolRole } from '../types'
import { Badge } from '../components/ui/Badge'
import { Pagination } from '../components/ui/Pagination'
import { useToast } from '../components/ui/ToastProvider'

const PAGE_SIZE = 25
const SYNC_ROLES: UserToolRole[] = ['Global Admin', 'IT Admin']

function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

function StatusPill({ enabled }: { enabled: boolean | null }) {
  if (enabled === true) return <span className="inline-flex items-center gap-1 text-[0.68rem] font-bold text-emerald-600"><CheckCircle2 className="h-3 w-3" />Enabled</span>
  if (enabled === false) return <span className="inline-flex items-center gap-1 text-[0.68rem] font-bold text-slate-400"><XCircle className="h-3 w-3" />Disabled</span>
  return <span className="text-slate-300 text-[0.68rem]">—</span>
}

function ChangeTypeBadge({ type }: { type: ChangeHistoryItem['changeType'] }) {
  if (type === 'added') return <span className="inline-flex items-center gap-1 text-[0.68rem] font-bold text-emerald-600"><PlusCircle className="h-3 w-3" />Added</span>
  if (type === 'removed') return <span className="inline-flex items-center gap-1 text-[0.68rem] font-bold text-red-600"><MinusCircle className="h-3 w-3" />Removed</span>
  return <span className="inline-flex items-center gap-1 text-[0.68rem] font-bold text-amber-600"><Pencil className="h-3 w-3" />Modified</span>
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <div className="flex items-start justify-between gap-2 py-1.5 border-b border-slate-100 last:border-b-0">
      <span className="text-[0.68rem] font-medium text-slate-500 flex-shrink-0">{label}</span>
      <span className="text-xs text-slate-800 text-right break-all">{value}</span>
    </div>
  )
}

function DetailDrawer({ source, category, policyId, onClose }: {
  source: PolicySource; category: PolicyCategory; policyId: string; onClose: () => void
}) {
  const [detail, setDetail] = useState<PolicyDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    securityPoliciesApi.getPolicyDetail(source, category, policyId)
      .then(res => { if (!cancelled) setDetail(res.data) })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load details') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [source, category, policyId])

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button type="button" aria-label="Close details" className="absolute inset-0 bg-slate-900/25" onClick={onClose} />
      <div className="relative z-10 h-full w-full sm:w-[520px] bg-white shadow-2xl overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-800">Policy Detail</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-1.5 hover:bg-slate-100 transition">
            <X className="h-4 w-4 text-slate-500" />
          </button>
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm text-slate-400">Loading…</div>
        ) : error || !detail ? (
          <div className="p-8 text-center text-sm text-red-600">{error ?? 'Not found'}</div>
        ) : (
          <div className="px-5 py-4 space-y-5">
            <section>
              <h3 className="text-[0.68rem] font-semibold uppercase text-slate-400 mb-1">Policy</h3>
              <Field label="Name" value={detail.name} />
              <Field label="Policy ID" value={detail.policyId} />
              <Field label="Source" value={detail.source === 'intune' ? 'Microsoft Intune' : 'Microsoft Entra ID'} />
              <Field label="Category" value={CATEGORY_LABELS[detail.category]} />
              <Field label="Platform" value={detail.platform} />
              <Field label="Technology / Template" value={detail.technology} />
              <Field label="State" value={detail.enabled === null ? null : (detail.enabled ? 'Enabled' : 'Disabled')} />
              <Field label="Description" value={detail.description} />
              <Field label="Scope Tags" value={detail.scopeTags.length ? detail.scopeTags.join(', ') : null} />
              <Field label="Created" value={formatDate(detail.createdDateTime)} />
              <Field label="Last Modified" value={formatDate(detail.modifiedDateTime)} />
              <Field label="Captured" value={formatDateTime(detail.capturedAt)} />
            </section>

            <section>
              <h3 className="text-[0.68rem] font-semibold uppercase text-slate-400 mb-1">
                Assignments ({detail.assignments.length})
              </h3>
              {detail.assignments.length === 0 ? (
                <p className="text-xs text-slate-400 py-1">Not assigned</p>
              ) : (
                <ul className="space-y-1">
                  {detail.assignments.map((a, i) => (
                    <li key={i} className="text-xs text-slate-700 flex items-center gap-1.5 py-1">
                      <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${a.kind === 'exclude' ? 'bg-red-400' : 'bg-emerald-400'}`} />
                      {a.groupDisplayName ?? a.groupId ?? a.targetType ?? 'Unknown target'}
                      {a.kind === 'exclude' && <span className="text-red-500 text-[0.62rem] font-semibold">(excluded)</span>}
                      {a.filterType && <span className="text-slate-400 text-[0.62rem]">filter: {a.filterType}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h3 className="text-[0.68rem] font-semibold uppercase text-slate-400 mb-1">Settings</h3>
              <pre className="text-[0.62rem] bg-slate-50 border border-slate-100 rounded-lg p-3 overflow-x-auto max-h-64 overflow-y-auto text-slate-600">
                {JSON.stringify(detail.settings, null, 2)}
              </pre>
            </section>

            <section>
              <h3 className="text-[0.68rem] font-semibold uppercase text-slate-400 mb-1">Raw Graph record</h3>
              <pre className="text-[0.62rem] bg-slate-50 border border-slate-100 rounded-lg p-3 overflow-x-auto max-h-64 overflow-y-auto text-slate-600">
                {JSON.stringify(detail.raw, null, 2)}
              </pre>
            </section>
          </div>
        )}
      </div>
    </div>
  )
}

interface Props {
  viewerRole: UserToolRole
  userEmail?: string
  onBack?: () => void
}

export function SecurityPoliciesPage({ viewerRole, userEmail, onBack }: Props) {
  useEffect(() => { setSecurityPoliciesActor(viewerRole, userEmail ?? 'unknown@zinnia.com') }, [viewerRole, userEmail])
  const canSync = SYNC_ROLES.includes(viewerRole)
  const { notify } = useToast()

  const [tab, setTab] = useState<PolicySource>('intune')
  const [items, setItems] = useState<PolicyListItem[]>([])
  const [total, setTotal] = useState(0)
  const [configured, setConfigured] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [category, setCategory] = useState<PolicyCategory | 'all'>('all')
  const [status, setStatus] = useState<'all' | 'enabled' | 'disabled' | 'unknown'>('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  const [detailTarget, setDetailTarget] = useState<{ source: PolicySource; category: PolicyCategory; policyId: string } | null>(null)
  const [syncStatus, setSyncStatus] = useState<SyncRunSummary | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [history, setHistory] = useState<ChangeHistoryItem[]>([])

  const categoriesForTab = tab === 'intune' ? INTUNE_CATEGORIES : ENTRA_CATEGORIES

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await securityPoliciesApi.listPolicies({
        source: tab,
        category: category === 'all' ? undefined : category,
        status: status === 'all' ? undefined : status,
        search: search.trim() || undefined,
        page, pageSize: PAGE_SIZE,
      })
      setItems(res.data)
      setTotal(res.pagination.total)
      setConfigured(res.configured)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load security policies')
    } finally {
      setLoading(false)
    }
  }, [tab, category, status, search, page])

  const loadSyncStatus = useCallback(async () => {
    try {
      const res = await securityPoliciesApi.getSyncStatus()
      setSyncStatus(res.data)
    } catch {
      setSyncStatus(null)
    }
  }, [])

  useEffect(() => { void load() }, [load])
  useEffect(() => { void loadSyncStatus() }, [loadSyncStatus])
  useEffect(() => { setPage(1); setCategory('all') }, [tab])
  useEffect(() => { setPage(1) }, [category, status, search])

  async function handleSync() {
    setSyncing(true)
    try {
      const res = await securityPoliciesApi.triggerSync()
      setSyncStatus(res.data)
      notify('success', 'Sync complete', `${res.data.policyCount} policies captured — ${res.data.added} added, ${res.data.modified} modified, ${res.data.removed} removed.`)
      await load()
    } catch (err) {
      notify('error', 'Sync failed', err instanceof Error ? err.message : 'Please try again.')
    } finally {
      setSyncing(false)
    }
  }

  async function handleShowHistory() {
    setShowHistory(true)
    try {
      const res = await securityPoliciesApi.getChangeHistory(100)
      setHistory(res.data)
    } catch {
      notify('error', 'Failed to load change history', 'Please try again.')
    }
  }

  async function handleExport(format: 'json' | 'csv') {
    try {
      await securityPoliciesApi.exportPolicies({
        source: tab, category: category === 'all' ? undefined : category,
        status: status === 'all' ? undefined : status, search: search.trim() || undefined,
      }, format)
    } catch {
      notify('error', 'Export failed', 'Please try again.')
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const isLive = syncStatus !== null

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          {onBack ? (
            <div className="flex items-center gap-2 mb-1 text-sm text-slate-400">
              <button type="button" onClick={onBack} className="hover:text-slate-600 transition">← Back</button>
              <span>/</span>
              <span className="text-slate-700 font-medium flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-slate-500" aria-hidden="true" /> Security Policies
              </span>
            </div>
          ) : (
            <h1 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-orange-600" aria-hidden="true" /> Security Policies
            </h1>
          )}
          <p className="text-xs text-slate-500 mt-0.5">
            Live Intune device-management and Entra ID identity/security policy configurations, captured and diffed on each sync.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.68rem] font-bold ${isLive ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${isLive ? 'bg-emerald-500' : 'bg-amber-500'}`} />
            {isLive ? 'Live · Microsoft Graph' : 'Not yet synced'}
          </span>
          <span className="text-[0.68rem] text-slate-400">
            Last sync: {syncStatus ? formatDateTime(syncStatus.completedAt ?? syncStatus.startedAt) : 'never'}
          </span>
          <button
            type="button"
            onClick={() => void handleExport('csv')}
            disabled={!configured || total === 0}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:border-slate-300 transition disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" />Export CSV
          </button>
          {canSync && (
            <button
              type="button"
              onClick={() => void handleSync()}
              disabled={syncing}
              className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold text-white transition disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg,#0078D4,#6366F1)' }}
            >
              {syncing ? <><RefreshCw className="h-3.5 w-3.5 animate-spin" />Syncing…</> : <><RefreshCw className="h-3.5 w-3.5" />Sync Now</>}
            </button>
          )}
        </div>
      </div>

      {syncStatus && (syncStatus.added > 0 || syncStatus.modified > 0 || syncStatus.removed > 0) && (
        <button type="button" onClick={() => void handleShowHistory()} className="w-full text-left glass rounded-2xl p-3 flex items-center gap-4 hover:glass-strong transition">
          <span className="text-xs font-bold text-slate-600">Last sync changes:</span>
          <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600"><PlusCircle className="h-3.5 w-3.5" />{syncStatus.added} added</span>
          <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-600"><Pencil className="h-3.5 w-3.5" />{syncStatus.modified} modified</span>
          <span className="inline-flex items-center gap-1 text-xs font-bold text-red-600"><MinusCircle className="h-3.5 w-3.5" />{syncStatus.removed} removed</span>
          <span className="ml-auto flex items-center gap-1 text-xs font-semibold text-[#0078D4]">View change history <ChevronRight className="h-3.5 w-3.5" /></span>
        </button>
      )}

      {syncStatus && Object.keys(syncStatus.sourceErrors).length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          Some categories failed during the last sync: {Object.entries(syncStatus.sourceErrors).map(([cat, msg]) => `${CATEGORY_LABELS[cat as PolicyCategory]} (${msg})`).join('; ')}
        </div>
      )}

      {!configured ? (
        <div className="glass rounded-2xl p-10 text-center">
          <ShieldCheck className="mx-auto h-8 w-8 text-slate-300 mb-3" />
          <p className="text-sm text-slate-500 font-medium">Security Policies isn't connected</p>
          <p className="text-xs text-slate-400 mt-1">Connect Intune and/or Entra ID in Settings, then run Sync Now to capture the first snapshot.</p>
        </div>
      ) : (
        <>
          <div className="flex gap-1 glass rounded-2xl p-1 w-fit">
            <button type="button" onClick={() => setTab('intune')}
              className={`rounded-xl px-4 py-1.5 text-xs font-bold transition-all ${tab === 'intune' ? 'glass-strong text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              Intune
            </button>
            <button type="button" onClick={() => setTab('entra')}
              className={`rounded-xl px-4 py-1.5 text-xs font-bold transition-all ${tab === 'entra' ? 'glass-strong text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              Entra ID
            </button>
          </div>

          <div className="flex gap-1 glass rounded-2xl p-1 flex-wrap">
            <button type="button" onClick={() => setCategory('all')}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${category === 'all' ? 'glass-strong text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              All
            </button>
            {categoriesForTab.map(c => (
              <button key={c} type="button" onClick={() => setCategory(c)}
                className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${category === c ? 'glass-strong text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                {CATEGORY_LABELS[c]}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name…"
                className="h-9 w-full rounded-xl pl-9 pr-3 text-xs water-input" />
              {search && <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2"><X className="h-3.5 w-3.5 text-slate-400" /></button>}
            </div>
            {(['all', 'enabled', 'disabled', 'unknown'] as const).map(s => (
              <button key={s} type="button" onClick={() => setStatus(s)}
                className={`rounded-full border px-3 py-1 text-[0.68rem] font-semibold transition capitalize ${status === s ? 'text-white border-transparent' : 'border-slate-200 glass text-slate-600 hover:border-slate-300'}`}
                style={status === s ? { background: 'linear-gradient(135deg,#0078D4,#6366F1)' } : {}}>
                {s}
              </button>
            ))}
            <span className="ml-auto self-center text-[0.65rem] text-slate-400">
              {total.toLocaleString()} polic{total !== 1 ? 'ies' : 'y'}
            </span>
          </div>

          <div className="glass rounded-2xl overflow-hidden">
            <div className="h-[2px]" style={{ background: 'linear-gradient(90deg,#0078D4,#0EA5E9,#6366F1)' }} />
            {loading ? (
              <div className="p-10 text-center">
                <RefreshCw className="mx-auto h-6 w-6 animate-spin text-slate-300 mb-3" />
                <p className="text-sm text-slate-400">Loading…</p>
              </div>
            ) : error ? (
              <div className="p-10 text-center text-sm text-red-600">{error}</div>
            ) : items.length === 0 ? (
              <div className="p-10 text-center">
                <ShieldCheck className="mx-auto h-8 w-8 text-slate-300 mb-3" />
                <p className="text-sm text-slate-400">{syncStatus ? 'No policies match your filters' : 'No snapshot yet — run Sync Now to capture policies'}</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="z-table">
                    <thead>
                      <tr>
                        {['Name', 'Category', 'Platform', 'State', 'Assignments', 'Last Modified'].map(h => <th key={h}>{h}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {items.map(item => (
                        <tr key={item.id} onClick={() => setDetailTarget({ source: item.source, category: item.category, policyId: item.policyId })} className="cursor-pointer">
                          <td><span className="font-semibold text-slate-700">{item.name}</span></td>
                          <td><Badge label={item.categoryLabel} variant="blue" /></td>
                          <td className="text-slate-500 text-[0.7rem]">{item.platform ?? '—'}</td>
                          <td><StatusPill enabled={item.enabled} /></td>
                          <td className="text-slate-500 text-[0.7rem]">
                            {item.assignmentCount > 0 ? `${item.assignmentCount} target${item.assignmentCount > 1 ? 's' : ''}` : <Minus className="h-3 w-3 text-slate-300" />}
                          </td>
                          <td className="text-slate-400 text-[0.68rem]">{formatDate(item.modifiedDateTime)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pagination
                  page={page}
                  totalPages={totalPages}
                  onPageChange={setPage}
                  totalItems={total}
                  pageSize={PAGE_SIZE}
                  itemLabel="policy"
                />
              </>
            )}
          </div>
        </>
      )}

      {detailTarget && (
        <DetailDrawer
          source={detailTarget.source}
          category={detailTarget.category}
          policyId={detailTarget.policyId}
          onClose={() => setDetailTarget(null)}
        />
      )}

      {showHistory && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <button type="button" aria-label="Close change history" className="absolute inset-0 bg-slate-900/25" onClick={() => setShowHistory(false)} />
          <div className="relative z-10 h-full w-full sm:w-[480px] bg-white shadow-2xl overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-800">Change History</h2>
              <button type="button" onClick={() => setShowHistory(false)} aria-label="Close" className="rounded-full p-1.5 hover:bg-slate-100 transition">
                <X className="h-4 w-4 text-slate-500" />
              </button>
            </div>
            <div className="px-5 py-4">
              {history.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-8">No changes recorded yet</p>
              ) : (
                <ul className="space-y-2">
                  {history.map(h => (
                    <li key={h.id} className="rounded-xl border border-slate-100 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-slate-700">{h.name}</span>
                        <ChangeTypeBadge type={h.changeType} />
                      </div>
                      <p className="text-[0.65rem] text-slate-400 mt-1">{h.categoryLabel} · {formatDateTime(h.detectedAt)}</p>
                      {h.diff.length > 0 && (
                        <ul className="mt-2 space-y-0.5">
                          {h.diff.map((d, i) => (
                            <li key={i} className="text-[0.65rem] text-slate-500">
                              <span className="font-semibold">{d.field}</span> changed
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
