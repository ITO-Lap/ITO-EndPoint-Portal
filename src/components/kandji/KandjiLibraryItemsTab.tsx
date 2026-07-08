/**
 * Kandji Library Items Tab
 *
 * Data sourced from the IRU / Kandji API:
 *   GET /api/v1/library/custom-apps                  → Custom Apps
 *   GET /api/v1/library/ipa-apps                     → In-House Apps
 *   GET /api/v1/library/custom-profiles              → Profiles
 *   GET /api/v1/library/custom-scripts               → Scripts
 *   GET /api/v1/blueprints/{id}/list-library-items   → Blueprint associations
 *   GET /api/v1/library/library-items/{id}/status    → Per-device pass/fail
 *   GET /api/v1/library/library-items/{id}/activity  → Audit activity
 *   GET /api/v1/self-service/categories              → Self Service categories
 *
 * Reference: https://api-docs.iru.com/#73258a78-c9ce-4602-951f-e695c1b13e68
 */

import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Search, X, RefreshCw, ChevronDown, ChevronUp, ChevronRight,
  Package, Shield, Terminal, FileText, Globe, Printer, Smartphone,
  CheckCircle2, XCircle, Clock, AlertCircle, Loader2, Activity,
  LayoutGrid, ExternalLink, Tag, Info, Download, Plus,
} from 'lucide-react'
import { api } from '../../api'
import type { LibraryApp } from '../../api'

// ── Types ─────────────────────────────────────────────────────────────────────

type LibraryCategory = 'All' | 'Auto App' | 'Custom App' | 'VPP App' | 'Profile' | 'Script' | 'Web App' | 'Printer'

interface ItemStatus {
  device_id: string
  device_name: string
  status: string
  status_message?: string
  last_audit_date?: string
}

interface ItemActivity {
  id: string
  action: string
  actor_type: string
  occurred_at: string
  target_component?: string
}

interface ItemDetail {
  statusList: ItemStatus[]
  activityList: ItemActivity[]
  loading: boolean
}

// ── Category icon + color ────────────────────────────────────────────────────

function categoryIcon(cat: string, size = 'h-4 w-4') {
  switch (cat) {
    case 'Auto App':   return <Package   className={`${size} text-orange-500`} />
    case 'Custom App': return <Package   className={`${size} text-amber-500`}  />
    case 'VPP App':    return <Smartphone className={`${size} text-lime-600`}   />
    case 'Script':     return <Terminal  className={`${size} text-slate-500`}  />
    case 'Profile':    return <Shield    className={`${size} text-blue-500`}   />
    case 'Web App':    return <Globe     className={`${size} text-teal-500`}   />
    case 'Printer':    return <Printer   className={`${size} text-slate-400`}  />
    default:           return <FileText  className={`${size} text-slate-400`}  />
  }
}

const CATEGORY_STYLE: Record<string, string> = {
  'Auto App':   'bg-orange-50 text-orange-700 border-orange-200',
  'Custom App': 'bg-amber-50 text-amber-700 border-amber-200',
  'VPP App':    'bg-lime-50 text-lime-700 border-lime-200',
  'Script':     'bg-slate-100 text-slate-600 border-slate-200',
  'Profile':    'bg-blue-50 text-blue-700 border-blue-200',
  'Web App':    'bg-teal-50 text-teal-700 border-teal-200',
  'Printer':    'bg-slate-50 text-slate-500 border-slate-200',
}

// ── Status chip ──────────────────────────────────────────────────────────────

function StatusChip({ status }: { status: string }) {
  const lower = status.toLowerCase()
  if (lower === 'pass' || lower === 'remediated')
    return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[0.6rem] font-bold text-emerald-700"><CheckCircle2 className="h-2.5 w-2.5" />{status}</span>
  if (lower === 'fail' || lower === 'error')
    return <span className="inline-flex items-center gap-1 rounded-full bg-red-50 border border-red-200 px-2 py-0.5 text-[0.6rem] font-bold text-red-700"><XCircle className="h-2.5 w-2.5" />{status}</span>
  if (lower === 'pending')
    return <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[0.6rem] font-bold text-amber-700"><Clock className="h-2.5 w-2.5" />{status}</span>
  if (lower === 'incompatible')
    return <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 border border-slate-200 px-2 py-0.5 text-[0.6rem] font-bold text-slate-500"><AlertCircle className="h-2.5 w-2.5" />{status}</span>
  return <span className="inline-flex rounded-full bg-slate-100 border border-slate-200 px-2 py-0.5 text-[0.6rem] font-semibold text-slate-500">{status}</span>
}

// ── Detail drawer for a single library item ───────────────────────────────────

function LibraryItemDrawer({ app, onClose }: { app: LibraryApp; onClose: () => void }) {
  const [detail, setDetail] = useState<ItemDetail>({ statusList: [], activityList: [], loading: true })
  const [activeTab, setActiveTab] = useState<'status' | 'activity'>('status')

  const fetchDetail = useCallback(async () => {
    setDetail(d => ({ ...d, loading: true }))
    const [statusList, activityList] = await Promise.all([
      api.fetchKandjiLibraryItemStatus(app.id).catch(() => []),
      api.fetchKandjiLibraryItemActivity(app.id).catch(() => []),
    ])
    setDetail({ statusList, activityList, loading: false })
  }, [app.id])

  useState(() => { fetchDetail() })

  const passCount = detail.statusList.filter(s => s.status.toLowerCase() === 'pass' || s.status.toLowerCase() === 'remediated').length
  const failCount = detail.statusList.filter(s => s.status.toLowerCase() === 'fail' || s.status.toLowerCase() === 'error').length

  return (
    <div className="fixed inset-0 z-40 flex" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="flex-1 bg-black/20 backdrop-blur-sm cursor-pointer" onClick={onClose} />
      <div className="w-full max-w-[560px] bg-white border-l border-slate-200 shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`grid h-10 w-10 place-items-center rounded-xl flex-shrink-0 ${CATEGORY_STYLE[app.category] ?? 'bg-slate-50 border border-slate-200'}`}>
              {categoryIcon(app.category, 'h-5 w-5')}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-900 truncate">{app.name}</p>
              <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                <span className={`inline-flex rounded-full border px-2 py-0.5 text-[0.6rem] font-bold ${CATEGORY_STYLE[app.category] ?? 'bg-slate-50 text-slate-500 border-slate-200'}`}>{app.category}</span>
                {app.active
                  ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[0.6rem] font-bold text-emerald-700"><CheckCircle2 className="h-2.5 w-2.5" />Active</span>
                  : <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 border border-slate-200 px-2 py-0.5 text-[0.6rem] font-bold text-slate-500"><XCircle className="h-2.5 w-2.5" />Inactive</span>
                }
              </div>
            </div>
          </div>
          <button type="button" onClick={onClose}
            className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-lg border border-slate-200 text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Metadata */}
        <div className="px-5 py-3 bg-slate-50 border-b border-slate-100">
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <p className="text-slate-400 font-semibold uppercase tracking-wide text-[0.6rem]">Enforcement</p>
              <p className="text-slate-700 font-medium mt-0.5">{app.enforcement || '—'}</p>
            </div>
            <div>
              <p className="text-slate-400 font-semibold uppercase tracking-wide text-[0.6rem]">Library Item ID</p>
              <p className="text-slate-500 font-mono text-[0.68rem] mt-0.5 truncate">{app.id}</p>
            </div>
            <div>
              <p className="text-slate-400 font-semibold uppercase tracking-wide text-[0.6rem]">Blueprint</p>
              {app.blueprint
                ? <span className="inline-flex items-center gap-1 rounded-full bg-purple-50 border border-purple-200 px-2 py-0.5 text-[0.6rem] font-bold text-purple-700 mt-0.5"><LayoutGrid className="h-2.5 w-2.5" />{app.blueprint}</span>
                : <p className="text-slate-400 text-[0.68rem] mt-0.5">Not assigned to a blueprint</p>
              }
            </div>
            <div>
              <p className="text-slate-400 font-semibold uppercase tracking-wide text-[0.6rem]">Blueprint ID</p>
              <p className="text-slate-500 font-mono text-[0.65rem] mt-0.5 truncate">{app.groupId ?? '—'}</p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-100">
          {[
            { id: 'status' as const,   label: `Device Status${detail.statusList.length ? ` (${detail.statusList.length})` : ''}` },
            { id: 'activity' as const, label: `Activity${detail.activityList.length ? ` (${detail.activityList.length})` : ''}` },
          ].map(t => (
            <button key={t.id} type="button" onClick={() => setActiveTab(t.id)}
              className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition ${activeTab === t.id ? 'border-[#F46C00] text-[#F46C00]' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto">
          {detail.loading ? (
            <div className="flex items-center justify-center py-16 gap-2 text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-xs">Loading IRU data…</span>
            </div>
          ) : activeTab === 'status' ? (
            detail.statusList.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center px-6">
                <CheckCircle2 className="h-8 w-8 text-slate-200 mb-3" />
                <p className="text-sm font-semibold text-slate-500">No device status data</p>
                <p className="text-xs text-slate-400 mt-1">Status is available once this item has been assigned to devices via a Blueprint.</p>
              </div>
            ) : (
              <div>
                {/* Summary bar */}
                <div className="flex gap-3 px-5 py-3 border-b border-slate-50 text-xs">
                  <span className="text-emerald-600 font-bold">{passCount} Pass</span>
                  <span className="text-red-500 font-bold">{failCount} Fail</span>
                  <span className="text-slate-400">{detail.statusList.length - passCount - failCount} Other</span>
                </div>
                <div className="divide-y divide-slate-50">
                  {detail.statusList.map(s => (
                    <div key={s.device_id} className="px-5 py-2.5 flex items-center gap-3 hover:bg-slate-50 transition">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-slate-800 truncate">{s.device_name}</p>
                        {s.status_message && <p className="text-[0.65rem] text-slate-400 truncate">{s.status_message}</p>}
                        {s.last_audit_date && <p className="text-[0.6rem] text-slate-300">{new Date(s.last_audit_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>}
                      </div>
                      <StatusChip status={s.status} />
                    </div>
                  ))}
                </div>
              </div>
            )
          ) : (
            detail.activityList.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center px-6">
                <Activity className="h-8 w-8 text-slate-200 mb-3" />
                <p className="text-sm font-semibold text-slate-500">No activity recorded</p>
                <p className="text-xs text-slate-400 mt-1">Activity is logged when this library item is created, updated, or assigned.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-50">
                {detail.activityList.map(a => (
                  <div key={a.id} className="px-5 py-2.5 hover:bg-slate-50 transition">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-800">{a.action.replace(/_/g, ' ')}</p>
                        {a.target_component && <p className="text-[0.65rem] text-slate-400 mt-0.5">{a.target_component}</p>}
                        <p className="text-[0.6rem] text-slate-300 mt-0.5">{a.actor_type}</p>
                      </div>
                      <p className="text-[0.62rem] text-slate-400 flex-shrink-0">
                        {new Date(a.occurred_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  )
}

// ── Self Service Categories panel ─────────────────────────────────────────────

interface SelfServiceCategory { id: string; name: string }

function SelfServiceCategoriesPanel() {
  const [categories, setCategories] = useState<SelfServiceCategory[]>([])
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState(false)

  useEffect(() => {
    api.fetchKandjiSelfServiceCategories()
      .then(data => setCategories(data))
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [])

  const CATEGORY_ICONS: Record<string, React.ReactNode> = {
    apps:         <Package   className="h-4 w-4 text-orange-500" />,
    productivity: <Smartphone className="h-4 w-4 text-blue-500"  />,
    utilities:    <Terminal  className="h-4 w-4 text-slate-500"  />,
    security:     <Shield    className="h-4 w-4 text-red-500"    />,
  }

  const getIcon = (name: string) =>
    CATEGORY_ICONS[name.toLowerCase()] ?? <Tag className="h-4 w-4 text-purple-500" />

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <div className="grid h-7 w-7 place-items-center rounded-lg bg-purple-50">
            <Tag className="h-3.5 w-3.5 text-purple-600" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-800">Self Service Categories</p>
            <p className="text-[0.62rem] text-slate-400">
              From <code className="font-mono bg-slate-100 rounded px-1">GET /api/v1/self-service/categories</code>
            </p>
          </div>
        </div>
        {!loading && (
          <span className="rounded-full bg-purple-50 border border-purple-200 px-2.5 py-0.5 text-[0.65rem] font-bold text-purple-700">
            {categories.length} categories
          </span>
        )}
      </div>

      {/* Content */}
      <div className="px-5 py-4">
        {loading ? (
          <div className="flex items-center gap-2 text-slate-400 py-3">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-xs">Fetching Self Service categories from IRU…</span>
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 text-amber-600 py-3">
            <AlertCircle className="h-4 w-4" />
            <span className="text-xs">Could not load Self Service categories — check Kandji API access.</span>
          </div>
        ) : categories.length === 0 ? (
          <div className="flex items-center gap-2 text-slate-400 py-3">
            <Info className="h-4 w-4" />
            <span className="text-xs">No Self Service categories configured in this IRU tenant.</span>
          </div>
        ) : (
          <>
            {/* Category cards grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-4">
              {categories.map(cat => (
                <div key={cat.id}
                  className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 hover:border-purple-200 hover:bg-purple-50 transition">
                  <div className="grid h-8 w-8 place-items-center rounded-lg bg-white border border-slate-200 flex-shrink-0">
                    {getIcon(cat.name)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-800 truncate">{cat.name}</p>
                    <p className="text-[0.58rem] text-slate-400 font-mono truncate">{cat.id.slice(0, 8)}…</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Full table */}
            <div className="rounded-xl border border-slate-200 overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-4 py-2.5 text-left text-[0.6rem] font-bold uppercase tracking-wide text-slate-400">Category Name</th>
                    <th className="px-4 py-2.5 text-left text-[0.6rem] font-bold uppercase tracking-wide text-slate-400">Category ID</th>
                    <th className="px-4 py-2.5 text-left text-[0.6rem] font-bold uppercase tracking-wide text-slate-400">Use</th>
                  </tr>
                </thead>
                <tbody>
                  {categories.map((cat, i) => (
                    <tr key={cat.id} className={`border-b border-slate-100 last:border-0 ${i % 2 !== 0 ? 'bg-slate-50/40' : ''}`}>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          {getIcon(cat.name)}
                          <span className="font-semibold text-slate-800">{cat.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <code className="font-mono text-[0.65rem] text-slate-500 bg-slate-100 rounded px-1.5 py-0.5">{cat.id}</code>
                      </td>
                      <td className="px-4 py-2.5 text-slate-400 text-[0.65rem]">
                        Pass as <code className="font-mono bg-slate-100 rounded px-1">self_service_category_id</code> when creating a library item
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="text-[0.62rem] text-slate-400 mt-3 flex items-center gap-1.5">
              <Info className="h-3 w-3 flex-shrink-0" />
              These category IDs are used when assigning library items to your IRU Self Service catalogue via the API.
            </p>
          </>
        )}
      </div>
    </div>
  )
}

// ── Main Library Items Tab ─────────────────────────────────────────────────────

interface Props {
  apps: LibraryApp[]
  loading: boolean
  onRefresh: () => void
  onAddApp: () => void
}

function exportCsv(apps: LibraryApp[]) {
  const headers = ['Name', 'Category', 'Enforcement', 'Blueprint', 'Group ID', 'Status']
  const rows = apps.map(a => [
    a.name, a.category, a.enforcement,
    a.blueprint ?? '', a.groupId ?? '',
    a.active ? 'Active' : 'Inactive',
  ])
  const csv = [headers, ...rows]
    .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url
  a.download = `iru-library-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export function KandjiLibraryItemsTab({ apps, loading, onRefresh, onAddApp }: Props) {
  const [search,       setSearch]       = useState('')
  const [category,     setCategory]     = useState<LibraryCategory>('All')
  const [activeStatus, setActiveStatus] = useState<'All' | 'Active' | 'Inactive'>('All')
  const [sortKey,      setSortKey]      = useState<'name' | 'category' | 'enforcement' | 'blueprint'>('name')
  const [sortDir,      setSortDir]      = useState<'asc' | 'desc'>('asc')
  const [expanded,     setExpanded]     = useState<Set<string>>(new Set())
  const [selected,     setSelected]     = useState<LibraryApp | null>(null)

  const categories = useMemo(() => {
    const counts: Record<string, number> = {}
    apps.forEach(a => { counts[a.category] = (counts[a.category] ?? 0) + 1 })
    return Object.entries(counts).sort((a, b) => b[1] - a[1])
  }, [apps])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return [...apps]
      .filter(a => {
        if (category !== 'All' && a.category !== category) return false
        if (activeStatus === 'Active' && !a.active) return false
        if (activeStatus === 'Inactive' && a.active) return false
        if (q) {
          return a.name.toLowerCase().includes(q) ||
            a.category.toLowerCase().includes(q) ||
            (a.blueprint ?? '').toLowerCase().includes(q) ||
            (a.groupId ?? '').toLowerCase().includes(q)
        }
        return true
      })
      .sort((a, b) => {
        const av = (a[sortKey] ?? '').toString()
        const bv = (b[sortKey] ?? '').toString()
        return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
      })
  }, [apps, search, category, activeStatus, sortKey, sortDir])

  const handleSort = (key: typeof sortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const SortIndicator = ({ col }: { col: typeof sortKey }) =>
    sortKey === col
      ? sortDir === 'asc'
        ? <ChevronUp   className="h-3 w-3 text-[#F46C00] inline ml-1" />
        : <ChevronDown className="h-3 w-3 text-[#F46C00] inline ml-1" />
      : <ChevronDown className="h-3 w-3 text-slate-300 inline ml-1 opacity-50" />

  const hasBlueprintData = apps.some(a => !!a.blueprint)

  if (loading) return (
    <div className="flex items-center justify-center py-24 gap-2 text-slate-400">
      <Loader2 className="h-4 w-4 animate-spin" />
      <span className="text-sm">Loading IRU library items…</span>
    </div>
  )

  return (
    <div className="flex flex-col gap-4">

      {/* Source note */}
      <div className="flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-xs text-blue-700">
        <ExternalLink className="h-3.5 w-3.5 flex-shrink-0" />
        <span>
          Data sourced from <strong>IRU API</strong> — library items, blueprint associations, device status, activity &amp; self-service categories.
          See: <a href="https://api-docs.iru.com/#73258a78-c9ce-4602-951f-e695c1b13e68"
            target="_blank" rel="noopener noreferrer"
            className="underline font-semibold">api-docs.iru.com</a>
        </span>
        <button type="button" onClick={onRefresh}
          className="ml-auto flex items-center gap-1 rounded-lg border border-blue-300 bg-white px-2.5 py-1 text-[0.68rem] font-semibold text-blue-600 hover:bg-blue-50 transition">
          <RefreshCw className="h-3 w-3" />Refresh
        </button>
      </div>

      {/* API Token Scope Notice — explains missing item types */}
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
        <div className="flex items-start gap-2.5">
          <AlertCircle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-amber-800">
            <p className="font-bold mb-1">Incomplete library coverage — API token needs broader permissions</p>
            <div className="space-y-1">
              <p>
                <span className="font-semibold text-emerald-700">✓ Accessible:</span>{' '}
                Custom Apps · Custom Scripts · Custom Profiles · IPA Apps
              </p>
              <p>
                <span className="font-semibold text-red-600">✗ Blocked (404):</span>{' '}
                <span className="font-mono bg-amber-100 rounded px-1 text-[0.68rem]">Auto Apps</span>{' · '}
                <span className="font-mono bg-amber-100 rounded px-1 text-[0.68rem]">VPP Apps</span>{' · '}
                <span className="font-mono bg-amber-100 rounded px-1 text-[0.68rem]">Web Apps</span>{' · '}
                <span className="font-mono bg-amber-100 rounded px-1 text-[0.68rem]">Printers</span>
              </p>
              <p className="mt-1.5 text-amber-700">
                <span className="font-semibold">Fix:</span>{' '}
                In IRU Dashboard → Settings → Access → API Tokens → edit your token → enable read access for{' '}
                <strong>Auto Apps</strong>, <strong>VPP Apps</strong>, <strong>Web Apps</strong>, and <strong>Printers</strong>.
                These are the missing ~96 items.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Blueprint status notice */}
      {!hasBlueprintData && (
        <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs text-slate-600">
          <Info className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
          <span>Blueprint associations are loading via <code className="font-mono bg-slate-100 rounded px-1">GET /api/v1/blueprints/{'{id}'}/list-library-items</code>. Refresh to see updated assignments.</span>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-4 py-3">
          <div className="flex items-baseline gap-1.5">
            <p className="text-xl font-black text-slate-800">{apps.length}</p>
            <p className="text-[0.6rem] text-amber-500 font-bold">of 217</p>
          </div>
          <p className="text-[0.62rem] text-slate-400 font-medium">Accessible Items</p>
          <p className="text-[0.58rem] text-slate-300 mt-0.5">4 of 8 library types visible</p>
        </div>
        <div className="bg-white rounded-2xl border border-emerald-200 shadow-sm px-4 py-3">
          <p className="text-xl font-black text-emerald-600">{apps.filter(a => a.active).length}</p>
          <p className="text-[0.62rem] text-slate-400 font-medium">Active</p>
        </div>
        <div className="bg-white rounded-2xl border border-purple-200 shadow-sm px-4 py-3">
          <p className="text-xl font-black text-purple-600">{apps.filter(a => !!a.blueprint).length}</p>
          <p className="text-[0.62rem] text-slate-400 font-medium">With Blueprint</p>
        </div>
        <div className="bg-white rounded-2xl border border-orange-200 shadow-sm px-4 py-3">
          <p className="text-xl font-black text-orange-600">{categories.length}</p>
          <p className="text-[0.62rem] text-slate-400 font-medium">Categories</p>
        </div>
      </div>

      {/* Category filter chips */}
      <div className="flex flex-wrap gap-1.5">
        {(['All', ...categories.map(([k]) => k)] as LibraryCategory[]).map(cat => (
          <button key={cat} type="button" onClick={() => setCategory(cat)}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition ${
              category === cat
                ? 'border-[#F46C00] bg-orange-50 text-orange-700'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}>
            {cat !== 'All' && categoryIcon(cat, 'h-3 w-3')}
            {cat}
            {cat !== 'All' && (
              <span className={`rounded-full px-1.5 py-0.5 text-[0.55rem] font-black ${category === cat ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-500'}`}>
                {categories.find(([k]) => k === cat)?.[1] ?? 0}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Toolbar: Search + Active/Inactive filter + Export + Add App */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search items, blueprints, categories…"
            className="h-8 w-full rounded-xl border border-slate-200 bg-white pl-8 pr-8 text-xs text-slate-700 placeholder:text-slate-400 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-300/40" />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2">
              <X className="h-3.5 w-3.5 text-slate-400 hover:text-slate-600" />
            </button>
          )}
        </div>

        {/* Active / Inactive toggle */}
        <div className="flex rounded-xl border border-slate-200 bg-slate-50 overflow-hidden text-xs">
          {(['All', 'Active', 'Inactive'] as const).map(s => (
            <button key={s} type="button" onClick={() => setActiveStatus(s)}
              className={`px-3 py-1.5 font-semibold transition ${activeStatus === s ? 'bg-orange-500 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
              {s}
            </button>
          ))}
        </div>

        <span className="text-xs text-slate-400 mr-auto">{filtered.length} of {apps.length} items</span>

        {/* Export CSV */}
        <button type="button" onClick={() => exportCsv(filtered)}
          className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-orange-300 hover:bg-orange-50 hover:text-orange-700 transition shadow-sm">
          <Download className="h-3.5 w-3.5" />Export CSV
        </button>

        {/* Add App */}
        <button type="button" onClick={onAddApp}
          className="flex items-center gap-1.5 rounded-xl bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-600 transition shadow-sm">
          <Plus className="h-3.5 w-3.5" />Add App
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 text-slate-400 gap-2">
            <Package className="h-7 w-7 opacity-30" />
            <p className="text-sm">No items match your filters</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-left">
                  {[
                    { key: 'name'        as const, label: 'Library Item' },
                    { key: 'category'    as const, label: 'Category'     },
                    { key: 'enforcement' as const, label: 'Enforcement'  },
                    { key: 'blueprint'   as const, label: 'Blueprint'    },
                  ].map(col => (
                    <th key={col.key} onClick={() => handleSort(col.key)}
                      className="px-4 py-3 text-[0.6rem] font-bold uppercase tracking-wide text-slate-400 cursor-pointer select-none hover:text-slate-600 whitespace-nowrap">
                      {col.label}<SortIndicator col={col.key} />
                    </th>
                  ))}
                  <th className="px-4 py-3 text-[0.6rem] font-bold uppercase tracking-wide text-slate-400">Status</th>
                  <th className="px-4 py-3 text-[0.6rem] font-bold uppercase tracking-wide text-slate-400 w-28">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((app, i) => {
                  const isExp = expanded.has(app.id)
                  return (
                    <tr key={app.id}
                      className={`border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors ${i % 2 !== 0 ? 'bg-slate-50/40' : ''}`}>
                      {/* Name */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {categoryIcon(app.category, 'h-3.5 w-3.5')}
                          <span className="font-semibold text-slate-800">{app.name}</span>
                          {app.id.startsWith('app-added-') && (
                            <span className="inline-flex rounded-full bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 text-[0.55rem] font-bold text-emerald-700">NEW</span>
                          )}
                        </div>
                        <p className="text-[0.6rem] text-slate-400 font-mono mt-0.5 ml-5 truncate max-w-[220px]">{app.id}</p>
                      </td>
                      {/* Category */}
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.6rem] font-bold ${CATEGORY_STYLE[app.category] ?? 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                          {categoryIcon(app.category, 'h-2.5 w-2.5')}{app.category}
                        </span>
                      </td>
                      {/* Enforcement */}
                      <td className="px-4 py-3 text-slate-500">{app.enforcement || '—'}</td>
                      {/* Blueprint */}
                      <td className="px-4 py-3">
                        {app.blueprint
                          ? <div>
                              <span className="inline-flex items-center gap-1 rounded-full bg-purple-50 border border-purple-200 px-2 py-0.5 text-[0.6rem] font-semibold text-purple-700">
                                <LayoutGrid className="h-2.5 w-2.5" />{app.blueprint}
                              </span>
                              <p className="text-[0.58rem] text-slate-300 font-mono mt-0.5 truncate max-w-[160px]">{app.groupId}</p>
                            </div>
                          : <span className="text-slate-300 text-[0.65rem]">—</span>
                        }
                      </td>
                      {/* Active status */}
                      <td className="px-4 py-3">
                        {app.active
                          ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[0.6rem] font-bold text-emerald-700"><CheckCircle2 className="h-2.5 w-2.5" />Active</span>
                          : <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 border border-slate-200 px-2 py-0.5 text-[0.6rem] font-bold text-slate-500"><XCircle className="h-2.5 w-2.5" />Inactive</span>
                        }
                      </td>
                      {/* Actions */}
                      <td className="px-4 py-3">
                        <button type="button" onClick={() => setSelected(app)}
                          className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[0.65rem] font-semibold text-slate-600 hover:border-orange-300 hover:bg-orange-50 hover:text-orange-600 transition">
                          <ChevronRight className="h-3 w-3" />Details
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50 text-xs text-slate-400 flex items-center justify-between">
              <span>{filtered.length} of {apps.length} library items · Source: IRU API <code className="font-mono bg-slate-100 rounded px-1">/api/v1/library/*</code></span>
              {hasBlueprintData && <span className="text-purple-500 font-semibold">✓ Blueprint data loaded</span>}
            </div>
          </div>
        )}
      </div>

      {/* Self Service Categories — always shown, fetches independently */}
      <SelfServiceCategoriesPanel />

      {/* Detail drawer */}
      {selected && <LibraryItemDrawer app={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}
