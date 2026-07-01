import { useState, useEffect } from 'react'
import { Brain, RefreshCw, XCircle, ChevronDown, ChevronRight, AlertTriangle, Shield } from 'lucide-react'
import { intelApi } from '../api/intelligence'
import type { RiskScore } from '../api/intelligence'

const LEVEL_STYLES = {
  critical: { bar: 'bg-red-500',    badge: 'bg-red-100 text-red-700',    label: 'Critical' },
  high:     { bar: 'bg-orange-400', badge: 'bg-orange-100 text-orange-700', label: 'High'   },
  medium:   { bar: 'bg-amber-400',  badge: 'bg-amber-100 text-amber-700', label: 'Medium'   },
  low:      { bar: 'bg-emerald-500',badge: 'bg-emerald-100 text-emerald-700', label: 'Low'  },
}

export function RiskScoringPage({ onBack }: { onBack: () => void }) {
  const [data, setData]         = useState<RiskScore[]>([])
  const [summary, setSummary]   = useState<{ critical: number; high: number; medium: number; low: number; avgScore: number } | null>(null)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [filter, setFilter]     = useState<string>('all')
  const [limit, setLimit]       = useState(50)

  const load = async (lim = limit) => {
    setLoading(true); setError(null)
    try {
      const res = await intelApi.riskScores(lim)
      if (res.success) { setData(res.data); setSummary(res.summary) }
      else setError('Failed to compute risk scores — ensure Intune is configured.')
    } catch {
      setError('Network error computing risk scores.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const toggle = (id: string) =>
    setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  const filtered = filter === 'all' ? data : data.filter(d => d.riskLevel === filter)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1 text-sm text-slate-400">
            <button onClick={onBack} className="hover:text-slate-600 transition">← Back</button>
            <span>/</span>
            <span className="text-slate-700 font-medium flex items-center gap-1.5">
              <Brain className="h-4 w-4 text-purple-500" /> AI Risk Scoring
              <span className="rounded-full bg-purple-100 px-1.5 py-0.5 text-[10px] font-bold text-purple-700">AI</span>
            </span>
          </div>
          <p className="text-xs text-slate-500">Per-device risk scores (0–100) based on compliance, encryption, OS version, and sync recency.</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={limit}
            onChange={e => { const v = Number(e.target.value); setLimit(v); load(v) }}
            className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-600 focus:outline-none"
          >
            {[25, 50, 100, 200].map(n => <option key={n} value={n}>Top {n}</option>)}
          </select>
          <button onClick={() => load()} className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 transition">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </div>

      {loading && <div className="flex items-center justify-center py-20"><RefreshCw className="h-6 w-6 animate-spin text-slate-400" /></div>}

      {error && !loading && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-center">
          <XCircle className="h-8 w-8 text-red-400 mx-auto mb-2" />
          <p className="text-sm font-medium text-red-700">{error}</p>
          <button onClick={() => load()} className="mt-3 rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white">Retry</button>
        </div>
      )}

      {summary && !loading && (
        <>
          {/* Summary */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {[
              { label: 'Avg Score',  value: summary.avgScore, color: 'text-slate-900' },
              { label: 'Critical',   value: summary.critical, color: 'text-red-700'   },
              { label: 'High',       value: summary.high,     color: 'text-orange-700'},
              { label: 'Medium',     value: summary.medium,   color: 'text-amber-700' },
              { label: 'Low',        value: summary.low,      color: 'text-emerald-700'},
            ].map(s => (
              <div key={s.label} className="rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm text-center">
                <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                <div className="text-xs text-slate-500 mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Filter bar */}
          <div className="flex flex-wrap gap-2">
            {['all', 'critical', 'high', 'medium', 'low'].map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition capitalize ${filter === f ? 'bg-purple-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
              >
                {f}{f !== 'all' && <span className="ml-1 opacity-70">({data.filter(d => d.riskLevel === f).length})</span>}
              </button>
            ))}
          </div>

          {/* Device risk list */}
          <div className="space-y-2">
            {filtered.map(score => {
              const styles = LEVEL_STYLES[score.riskLevel]
              const isOpen = expanded.has(score.deviceId)
              return (
                <div key={score.deviceId} className="rounded-xl border border-slate-200/60 bg-white shadow-sm overflow-hidden">
                  <button onClick={() => toggle(score.deviceId)} className="w-full flex items-center gap-4 px-5 py-3.5 text-left hover:bg-slate-50/60 transition">
                    {/* Score gauge */}
                    <div className="flex-shrink-0 w-12 text-center">
                      <div className={`text-lg font-bold ${styles.badge.split(' ')[1]}`}>{score.overallScore}</div>
                      <div className="h-1.5 rounded-full bg-slate-100 mt-1 overflow-hidden">
                        <div className={`h-full rounded-full ${styles.bar}`} style={{ width: `${score.overallScore}%` }} />
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-0.5">
                        <span className="text-sm font-medium text-slate-900">{score.deviceName}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${styles.badge}`}>{styles.label}</span>
                      </div>
                      <p className="text-xs text-slate-500 truncate">{score.userEmail}</p>
                    </div>
                    <div className="flex-shrink-0 text-xs text-slate-400 text-right hidden sm:block">
                      {score.factors.length} factor{score.factors.length !== 1 ? 's' : ''}
                    </div>
                    {isOpen ? <ChevronDown className="h-4 w-4 text-slate-400 flex-shrink-0" /> : <ChevronRight className="h-4 w-4 text-slate-400 flex-shrink-0" />}
                  </button>

                  {isOpen && (
                    <div className="border-t border-slate-100 px-5 py-4 bg-slate-50/50 space-y-3">
                      {score.aiSummary && (
                        <div className="rounded-lg border border-purple-200 bg-purple-50 px-3 py-2">
                          <div className="flex items-center gap-1.5 mb-1">
                            <Brain className="h-3 w-3 text-purple-600" />
                            <span className="text-xs font-semibold text-purple-700">AI Assessment</span>
                          </div>
                          <p className="text-xs text-slate-700 leading-relaxed">{score.aiSummary}</p>
                        </div>
                      )}
                      {score.factors.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-slate-700 mb-2">Risk Factors</p>
                          <div className="space-y-1.5">
                            {score.factors.map((f, i) => (
                              <div key={i} className="flex items-start gap-2 text-xs">
                                <AlertTriangle className="h-3.5 w-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                                <div className="flex-1">
                                  <span className="font-medium text-slate-700">{f.category}: </span>
                                  <span className="text-slate-500">{f.description}</span>
                                </div>
                                <span className="text-slate-400 flex-shrink-0">+{f.points}pts</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {score.actionItems.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-slate-700 mb-2">Action Items</p>
                          <div className="space-y-1">
                            {score.actionItems.map((a, i) => (
                              <div key={i} className="flex items-start gap-2 text-xs">
                                <Shield className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0 mt-0.5" />
                                <span className="text-slate-600">{a}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
