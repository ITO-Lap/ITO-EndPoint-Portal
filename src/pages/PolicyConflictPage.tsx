import { useState, useEffect } from 'react'
import { GitBranch, RefreshCw, XCircle, AlertTriangle, Info, ChevronDown, ChevronRight } from 'lucide-react'
import { intelApi } from '../api/intelligence'
import type { PolicyConflict } from '../api/intelligence'

const SEVERITY_STYLES: Record<string, string> = {
  high:   'bg-red-100 text-red-700',
  medium: 'bg-amber-100 text-amber-700',
  low:    'bg-slate-100 text-slate-600',
}

const TYPE_LABELS: Record<string, string> = {
  duplicate_name: 'Duplicate Name',
  stale_policy:   'Stale Policy',
  scope_conflict: 'Scope Conflict',
  version_drift:  'Version Drift',
}

export function PolicyConflictPage({ onBack }: { onBack: () => void }) {
  const [data, setData]           = useState<Awaited<ReturnType<typeof intelApi.policies>> | null>(null)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)
  const [expanded, setExpanded]   = useState<Set<string>>(new Set())
  const [filter, setFilter]       = useState<string>('all')

  const load = async () => {
    setLoading(true); setError(null)
    try {
      const res = await intelApi.policies()
      if (res.success) setData(res)
      else setError('Failed to load policy data.')
    } catch {
      setError('Network error loading policies.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const toggle = (id: string) =>
    setExpanded(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next })

  const conflicts = data?.conflicts ?? []
  const filtered  = filter === 'all' ? conflicts : conflicts.filter(c => c.severity === filter || c.type === filter)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1 text-sm text-slate-400">
            <button onClick={onBack} className="hover:text-slate-600 transition">← Back</button>
            <span>/</span>
            <span className="text-slate-700 font-medium flex items-center gap-1.5">
              <GitBranch className="h-4 w-4 text-orange-500" /> Policy Conflicts
            </span>
          </div>
          <p className="text-xs text-slate-500">Detected duplicates, stale policies, and scope conflicts across your Intune tenant.</p>
        </div>
        <button onClick={load} className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 transition">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {loading && <div className="flex items-center justify-center py-20"><RefreshCw className="h-6 w-6 animate-spin text-slate-400" /></div>}

      {error && !loading && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-center">
          <XCircle className="h-8 w-8 text-red-400 mx-auto mb-2" />
          <p className="text-sm font-medium text-red-700">{error}</p>
          <button onClick={load} className="mt-3 rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white">Retry</button>
        </div>
      )}

      {data && !loading && (
        <>
          {/* Summary */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: 'Total Conflicts', value: data.summary.total, color: 'text-slate-900' },
              { label: 'High',            value: data.summary.high,   color: 'text-red-700'   },
              { label: 'Medium',          value: data.summary.medium, color: 'text-amber-700' },
              { label: 'Low',             value: data.summary.low,    color: 'text-slate-600' },
            ].map(s => (
              <div key={s.label} className="rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm text-center">
                <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                <div className="text-xs text-slate-500 mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Policy counts */}
          <div className="flex gap-3">
            <div className="flex-1 rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm">
              <div className="text-xl font-bold text-slate-900">{data.compliance.length}</div>
              <div className="text-xs text-slate-500 mt-0.5">Compliance Policies</div>
            </div>
            <div className="flex-1 rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm">
              <div className="text-xl font-bold text-slate-900">{data.config.length}</div>
              <div className="text-xs text-slate-500 mt-0.5">Config Profiles</div>
            </div>
          </div>

          {/* Filter bar */}
          {conflicts.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {['all', 'high', 'medium', 'low', 'duplicate_name', 'stale_policy'].map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition ${filter === f ? 'bg-orange-500 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                >
                  {f === 'all' ? 'All' : TYPE_LABELS[f] ?? f.charAt(0).toUpperCase() + f.slice(1)}
                  {f !== 'all' && <span className="ml-1 opacity-70">({conflicts.filter(c => c.severity === f || c.type === f).length})</span>}
                </button>
              ))}
            </div>
          )}

          {/* Conflict list */}
          {filtered.length === 0 ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-8 text-center">
              <div className="text-3xl mb-2">✓</div>
              <p className="text-sm font-semibold text-emerald-700">No conflicts detected</p>
              <p className="text-xs text-emerald-600 mt-1">All {data.compliance.length + data.config.length} policies appear healthy.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map(conflict => (
                <ConflictCard
                  key={conflict.id}
                  conflict={conflict}
                  isExpanded={expanded.has(conflict.id)}
                  onToggle={() => toggle(conflict.id)}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function ConflictCard({ conflict, isExpanded, onToggle }: {
  conflict: PolicyConflict; isExpanded: boolean; onToggle: () => void
}) {
  return (
    <div className="rounded-xl border border-slate-200/60 bg-white shadow-sm overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-start gap-3 px-5 py-4 text-left hover:bg-slate-50/60 transition"
      >
        <div className="mt-0.5 flex-shrink-0">
          {conflict.severity === 'high' ? (
            <XCircle className="h-4 w-4 text-red-500" />
          ) : conflict.severity === 'medium' ? (
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          ) : (
            <Info className="h-4 w-4 text-slate-400" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-0.5">
            <span className="text-sm font-medium text-slate-900">{conflict.title}</span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${SEVERITY_STYLES[conflict.severity]}`}>
              {conflict.severity.toUpperCase()}
            </span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
              {TYPE_LABELS[conflict.type] ?? conflict.type}
            </span>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">{conflict.description}</p>
        </div>
        {isExpanded ? <ChevronDown className="h-4 w-4 text-slate-400 flex-shrink-0 mt-0.5" /> : <ChevronRight className="h-4 w-4 text-slate-400 flex-shrink-0 mt-0.5" />}
      </button>

      {isExpanded && (
        <div className="border-t border-slate-100 px-5 py-4 space-y-3 bg-slate-50/50">
          <div>
            <p className="text-xs font-semibold text-slate-700 mb-1">Affected Policies</p>
            <div className="flex flex-wrap gap-2">
              {conflict.affectedPolicies.map(p => (
                <span key={p.id} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700">
                  <span className={`mr-1 font-medium ${p.type === 'compliance' ? 'text-emerald-600' : 'text-blue-600'}`}>
                    [{p.type === 'compliance' ? 'C' : 'P'}]
                  </span>
                  {p.name}
                </span>
              ))}
            </div>
          </div>
          <div className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-2">
            <p className="text-xs font-semibold text-orange-700 mb-0.5">Recommendation</p>
            <p className="text-xs text-orange-800 leading-relaxed">{conflict.recommendation}</p>
          </div>
        </div>
      )}
    </div>
  )
}
