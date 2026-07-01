import { useState, useEffect } from 'react'
import { Shield, RefreshCw, Download, ChevronDown, CheckCircle, XCircle, AlertTriangle, Clock } from 'lucide-react'
import { intelApi } from '../api/intelligence'

type ComplianceData = Awaited<ReturnType<typeof intelApi.compliance>>

const EXPORT_FORMATS = [
  { id: 'csv',   label: 'CSV'   },
  { id: 'excel', label: 'Excel' },
  { id: 'pdf',   label: 'PDF'   },
  { id: 'pptx',  label: 'PPTX'  },
] as const

export function ComplianceIntelPage({ onBack }: { onBack: () => void }) {
  const [data, setData]         = useState<ComplianceData | null>(null)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [exporting, setExporting] = useState<string | null>(null)
  const [dropOpen, setDropOpen] = useState(false)

  const load = async () => {
    setLoading(true); setError(null)
    try {
      const res = await intelApi.compliance()
      if (res.success) setData(res)
      else setError('Failed to load compliance data — ensure Intune is configured.')
    } catch {
      setError('Network error loading compliance data.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleExport = async (format: string) => {
    setExporting(format); setDropOpen(false)
    try {
      await intelApi.export(format as 'csv' | 'excel' | 'pdf' | 'pptx', 'compliance')
    } finally {
      setExporting(null)
    }
  }

  const rate = data ? ((data.summary.compliant / (data.summary.total || 1)) * 100).toFixed(1) : null

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1 text-sm text-slate-400">
            <button onClick={onBack} className="hover:text-slate-600 transition">← Back</button>
            <span>/</span>
            <span className="text-slate-700 font-medium flex items-center gap-1.5">
              <Shield className="h-4 w-4 text-emerald-500" /> Compliance Intelligence
            </span>
          </div>
          <p className="text-xs text-slate-500">Deep compliance reporting across all Microsoft Intune managed devices.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 transition"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          {/* Export dropdown */}
          <div className="relative">
            <button
              onClick={() => setDropOpen(v => !v)}
              disabled={!!exporting || loading}
              className="flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-2 text-xs font-semibold text-white hover:bg-orange-600 disabled:opacity-50 transition"
            >
              <Download className="h-3.5 w-3.5" />
              {exporting ? 'Exporting…' : 'Export'}
              <ChevronDown className="h-3 w-3" />
            </button>
            {dropOpen && (
              <div className="absolute right-0 top-full mt-1 z-20 min-w-[130px] rounded-lg border border-slate-200 bg-white shadow-lg py-1">
                {EXPORT_FORMATS.map(f => (
                  <button
                    key={f.id}
                    onClick={() => handleExport(f.id)}
                    className="w-full text-left px-4 py-2 text-xs text-slate-700 hover:bg-slate-50"
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-center">
          <XCircle className="h-8 w-8 text-red-400 mx-auto mb-2" />
          <p className="text-sm font-medium text-red-700">{error}</p>
          <p className="text-xs text-slate-500 mt-1">Configure Intune credentials in Settings → Integrations.</p>
          <button onClick={load} className="mt-3 rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700">
            Retry
          </button>
        </div>
      )}

      {data && !loading && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[
              { label: 'Total',         value: data.summary.total,         color: 'text-slate-900',   Icon: null           },
              { label: 'Compliant',     value: data.summary.compliant,     color: 'text-emerald-700', Icon: CheckCircle    },
              { label: 'Non-Compliant', value: data.summary.noncompliant,  color: 'text-red-700',     Icon: XCircle        },
              { label: 'Grace Period',  value: data.summary.inGracePeriod, color: 'text-amber-700',   Icon: Clock          },
              { label: 'Errors',        value: data.summary.error,         color: 'text-orange-700',  Icon: AlertTriangle  },
              { label: 'Rate',          value: `${rate}%`,                 color: Number(rate) >= 80 ? 'text-emerald-700' : 'text-red-700', Icon: Shield },
            ].map(s => (
              <div key={s.label} className="rounded-xl border border-slate-200/60 bg-white p-4 text-center shadow-sm">
                {s.Icon && <s.Icon className={`h-4 w-4 mx-auto mb-1 ${s.color}`} />}
                <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                <div className="text-xs text-slate-500 mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Compliance by OS */}
          <div className="rounded-xl border border-slate-200/60 bg-white shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">Compliance by Operating System</h2>
              <span className="text-xs text-slate-400">{Object.keys(data.byOS).length} platforms</span>
            </div>
            <div className="divide-y divide-slate-100">
              {Object.entries(data.byOS).sort((a, b) => b[1].total - a[1].total).map(([os, stats]) => {
                const osRate = ((stats.compliant / (stats.total || 1)) * 100).toFixed(1)
                return (
                  <div key={os} className="px-5 py-3 flex items-center gap-4">
                    <div className="w-24 text-sm font-medium text-slate-800 flex-shrink-0">{os}</div>
                    <div className="flex-1">
                      <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${Number(osRate) >= 80 ? 'bg-emerald-500' : Number(osRate) >= 50 ? 'bg-amber-400' : 'bg-red-400'}`}
                          style={{ width: `${osRate}%` }}
                        />
                      </div>
                    </div>
                    <div className="text-xs text-slate-500 w-36 text-right flex-shrink-0">
                      {stats.compliant}/{stats.total} compliant · {osRate}%
                    </div>
                  </div>
                )
              })}
              {Object.keys(data.byOS).length === 0 && (
                <div className="px-5 py-8 text-center text-sm text-slate-400">No OS data available</div>
              )}
            </div>
          </div>

          {/* Management agents */}
          {Object.keys(data.byManagementAgent ?? {}).length > 0 && (
            <div className="rounded-xl border border-slate-200/60 bg-white shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100">
                <h2 className="text-sm font-semibold text-slate-900">Devices by Management Agent</h2>
              </div>
              <div className="divide-y divide-slate-100">
                {Object.entries(data.byManagementAgent).sort((a, b) => b[1] - a[1]).map(([agent, count]) => (
                  <div key={agent} className="px-5 py-3 flex items-center justify-between">
                    <span className="text-sm text-slate-700">{agent}</span>
                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Policies */}
          <div className="rounded-xl border border-slate-200/60 bg-white shadow-sm p-5 flex items-center gap-4">
            <Shield className="h-8 w-8 text-emerald-500 flex-shrink-0" />
            <div>
              <div className="text-2xl font-bold text-slate-900">{data.policyCount}</div>
              <div className="text-xs text-slate-500">compliance policies active on this tenant</div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
