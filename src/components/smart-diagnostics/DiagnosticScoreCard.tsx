import { CheckCircle2, AlertTriangle, XCircle, HelpCircle } from 'lucide-react'
import type { DiagnosticCategoryResult } from '../../types'

interface Props {
  category: DiagnosticCategoryResult
  onClick?: () => void
}

const STATUS_CONFIG = {
  Healthy:  { icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50',  border: 'border-emerald-200', bar: 'bg-emerald-500' },
  Warning:  { icon: AlertTriangle,color: 'text-amber-600',   bg: 'bg-amber-50',    border: 'border-amber-200',   bar: 'bg-amber-500'   },
  Critical: { icon: XCircle,      color: 'text-red-600',     bg: 'bg-red-50',      border: 'border-red-200',     bar: 'bg-red-500'     },
  Unknown:  { icon: HelpCircle,   color: 'text-slate-500',   bg: 'bg-slate-50',    border: 'border-slate-200',   bar: 'bg-slate-400'   },
}

export function DiagnosticScoreCard({ category, onClick }: Props) {
  const cfg = STATUS_CONFIG[category.status]
  const Icon = cfg.icon

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left rounded-2xl border p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-2 focus-visible:ring-orange-300 ${cfg.bg} ${cfg.border}`}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <p className="text-xs font-semibold text-slate-800 leading-snug">{category.name}</p>
        <Icon className={`h-4 w-4 flex-shrink-0 ${cfg.color}`} />
      </div>

      <div className="mb-2">
        <div className="flex justify-between text-[0.65rem] mb-1">
          <span className="text-slate-500">Score</span>
          <span className={`font-bold ${cfg.color}`}>{category.score}/100</span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-white/60 overflow-hidden border border-white/40">
          <div className={`h-full rounded-full ${cfg.bar}`} style={{ width: `${category.score}%` }} />
        </div>
      </div>

      <span className={`inline-flex rounded-full px-2 py-0.5 text-[0.6rem] font-bold border ${cfg.bg} ${cfg.color} ${cfg.border}`}>
        {category.status}
      </span>

      {category.findings.length > 0 && category.findings[0] !== 'No issues detected' && (
        <p className="mt-2 text-[0.65rem] text-slate-600 leading-snug line-clamp-2">
          {category.findings[0]}
        </p>
      )}
    </button>
  )
}
