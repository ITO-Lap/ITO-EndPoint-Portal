import { Sparkles, AlertTriangle, XCircle, CheckCircle2, Info, ChevronRight } from 'lucide-react'
import type { AIRecommendation } from '../../types'

interface Props {
  recommendation: AIRecommendation | null
  loading?: boolean
  onAnalyze: () => void
  analyzing?: boolean
}

const SEV_CONFIG = {
  Critical: { icon: XCircle,       cls: 'text-red-600',    bg: 'bg-red-50  border-red-200'    },
  High:     { icon: AlertTriangle,  cls: 'text-orange-600', bg: 'bg-orange-50 border-orange-200' },
  Medium:   { icon: AlertTriangle,  cls: 'text-amber-600',  bg: 'bg-amber-50 border-amber-200'  },
  Low:      { icon: CheckCircle2,   cls: 'text-emerald-600',bg: 'bg-emerald-50 border-emerald-200' },
}

export function AIRecommendationPanel({ recommendation, loading, onAnalyze, analyzing }: Props) {
  if (loading) return (
    <div className="flex items-center justify-center py-16 text-slate-400 text-xs gap-2">
      <Sparkles className="h-4 w-4 animate-pulse" />
      Loading AI analysis…
    </div>
  )

  if (!recommendation) return (
    <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-orange-50 border border-orange-200">
        <Sparkles className="h-6 w-6 text-orange-500" />
      </div>
      <div>
        <p className="text-sm font-semibold text-slate-900">AI Analysis Ready</p>
        <p className="text-xs text-slate-500 mt-1 max-w-xs">Generate a comprehensive root-cause analysis and step-by-step fix for this device.</p>
      </div>
      <button
        type="button"
        onClick={onAnalyze}
        disabled={analyzing}
        className="flex items-center gap-2 rounded-xl bg-orange-500 px-5 py-2.5 text-xs font-semibold text-white hover:bg-orange-600 disabled:opacity-60 transition"
      >
        <Sparkles className="h-3.5 w-3.5" />
        {analyzing ? 'Analyzing…' : 'Run AI Analysis'}
      </button>
    </div>
  )

  const sevCfg = SEV_CONFIG[recommendation.severity]
  const SevIcon = sevCfg.icon

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-xl bg-orange-50 border border-orange-200">
            <Sparkles className="h-4 w-4 text-orange-500" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">AI Diagnostic Analysis</p>
            <p className="text-[0.65rem] text-slate-400">Generated {recommendation.generatedAt}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${sevCfg.bg} ${sevCfg.cls}`}>
            <SevIcon className="h-3 w-3" />
            {recommendation.severity} Priority
          </span>
          <button
            type="button"
            onClick={onAnalyze}
            disabled={analyzing}
            className="flex items-center gap-1.5 rounded-xl border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-semibold text-orange-600 hover:bg-orange-100 disabled:opacity-60 transition"
          >
            <Sparkles className="h-3.5 w-3.5" />
            {analyzing ? 'Re-analyzing…' : 'Re-analyze'}
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className={`rounded-xl border p-4 ${sevCfg.bg}`}>
        <p className="text-[0.6rem] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Summary</p>
        <p className="text-xs text-slate-800 leading-relaxed">{recommendation.summary}</p>
      </div>

      {/* Root Cause */}
      <div>
        <p className="text-[0.6rem] font-semibold uppercase tracking-wider text-slate-500 mb-2">Root Cause Analysis</p>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs text-slate-700 leading-relaxed">{recommendation.rootCause}</p>
        </div>
      </div>

      {/* Step-by-step fix */}
      <div>
        <p className="text-[0.6rem] font-semibold uppercase tracking-wider text-slate-500 mb-2">Step-by-Step Remediation</p>
        <ol className="space-y-2">
          {recommendation.steps.map((step, i) => (
            <li key={i} className="flex items-start gap-3 rounded-xl border border-slate-100 bg-white px-4 py-3">
              <span className="flex-shrink-0 grid h-5 w-5 place-items-center rounded-full bg-orange-100 text-orange-700 text-[0.65rem] font-bold mt-0.5">
                {i + 1}
              </span>
              <p className="text-xs text-slate-700 leading-relaxed flex-1">{step}</p>
              <ChevronRight className="h-3.5 w-3.5 text-slate-300 flex-shrink-0 mt-0.5" />
            </li>
          ))}
        </ol>
      </div>

      {/* Helpdesk explanation */}
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
        <div className="flex items-center gap-2 mb-2">
          <Info className="h-3.5 w-3.5 text-blue-500 flex-shrink-0" />
          <p className="text-[0.6rem] font-semibold uppercase tracking-wider text-blue-600">Helpdesk-Friendly Explanation</p>
        </div>
        <p className="text-xs text-blue-900 leading-relaxed">{recommendation.helpdeskExplanation}</p>
      </div>
    </div>
  )
}
