import { useState, useEffect } from 'react'
import { Shield, RefreshCw, Download, ChevronDown, XCircle, Brain } from 'lucide-react'
import { intelApi } from '../api/intelligence'

const EXPORT_FORMATS = [
  { id: 'csv',   label: 'CSV'   },
  { id: 'excel', label: 'Excel' },
  { id: 'pdf',   label: 'PDF'   },
  { id: 'pptx',  label: 'PPTX'  },
] as const

export function ComplianceIntelPage({ onBack }: { onBack: () => void }) {
  const [summary, setSummary]       = useState('')
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState<string | null>(null)
  const [exporting, setExporting]   = useState<string | null>(null)
  const [dropOpen, setDropOpen]     = useState(false)

  const load = async () => {
    setLoading(true); setError(null)
    try {
      const res = await intelApi.summary()
      if (res.success) setSummary(res.summary)
      else setError(res.error ?? 'Failed to generate summary — ensure OpenAI is configured.')
    } catch {
      setError('Network error generating compliance summary.')
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
          <p className="text-xs text-slate-500">AI-generated executive summary of tenant-wide compliance posture, with report export.</p>
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
              disabled={!!exporting}
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

      {/* Error */}
      {error && !loading && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-center">
          <XCircle className="h-8 w-8 text-red-400 mx-auto mb-2" />
          <p className="text-sm font-medium text-red-700">{error}</p>
          <button onClick={load} className="mt-3 rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700">
            Retry
          </button>
        </div>
      )}

      {/* AI executive summary */}
      {!error && (
        <div className="rounded-xl border border-purple-200/60 bg-purple-50/60 p-5">
          <div className="flex items-start gap-3">
            <Brain className="h-4 w-4 text-purple-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="mb-2 text-xs font-semibold text-purple-700 uppercase tracking-wide">AI Executive Summary</div>
              {loading ? (
                <div className="space-y-1.5">
                  <div className="h-3.5 w-full animate-pulse rounded bg-purple-200" />
                  <div className="h-3.5 w-5/6 animate-pulse rounded bg-purple-200" />
                  <div className="h-3.5 w-2/3 animate-pulse rounded bg-purple-200" />
                </div>
              ) : (
                <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">{summary}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
