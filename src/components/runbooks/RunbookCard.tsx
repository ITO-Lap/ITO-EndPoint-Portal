import { BookOpen, Sparkles } from 'lucide-react'
import type { RunbookData } from '../../types'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { DashboardCard } from '../ui/DashboardCard'

interface RunbookCardProps {
  data: RunbookData
  aiLoading?: boolean
  onViewRunbook?: () => void
  onCopySteps?: () => void
}

export function RunbookCard({ data, aiLoading, onViewRunbook, onCopySteps }: RunbookCardProps) {
  return (
    <DashboardCard title="Recommended Action / Runbook" icon={BookOpen}>
      <div className="space-y-3.5">
        <div className="rounded-xl border border-slate-200/80 bg-slate-50 px-3 py-2.5">
          <div className="flex items-center justify-between mb-1">
            <p className="text-[0.62rem] uppercase tracking-widest text-slate-400">Recommended Runbook</p>
            {aiLoading && (
              <span className="inline-flex items-center gap-1 rounded-full bg-lime-50 border border-lime-200 px-1.5 py-0.5 text-[0.58rem] font-semibold text-lime-600">
                <Sparkles className="h-2.5 w-2.5 animate-pulse" /> AI analysing…
              </span>
            )}
            {!aiLoading && data.runbookLink === 'AI-generated runbook' && (
              <span className="inline-flex items-center gap-1 rounded-full bg-lime-50 border border-lime-200 px-1.5 py-0.5 text-[0.58rem] font-semibold text-lime-600">
                <Sparkles className="h-2.5 w-2.5" /> AI
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onViewRunbook}
            className="text-left text-xs font-semibold text-indigo-600 hover:text-indigo-700 focus-visible:ring-2 focus-visible:ring-indigo-300 rounded leading-snug transition"
          >
            {data.runbookName}
          </button>
        </div>

        <div className="rounded-xl border border-slate-200/80 bg-white px-3 py-2.5 shadow-sm shadow-slate-900/5">
          <div className="flex items-center justify-between gap-2 mb-2.5">
            <p className="text-xs font-semibold text-slate-900">Next Steps</p>
            {!aiLoading && <span className="text-[0.62rem] text-slate-400">{data.steps.length} steps</span>}
          </div>
          {aiLoading ? (
            <div className="space-y-2 animate-pulse">
              {[80, 60, 90, 70, 65].map((w, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="mt-0.5 h-4 w-4 rounded-full bg-slate-200 flex-shrink-0" />
                  <div className="h-3 rounded bg-slate-100 flex-1" style={{ maxWidth: `${w}%` }} />
                </div>
              ))}
            </div>
          ) : (
            <ol className="space-y-2 text-xs text-slate-700">
              {data.steps.map((step, index) => (
                <li key={step} className="flex items-start gap-2">
                  <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[0.55rem] font-bold text-slate-600">{index + 1}</span>
                  <span className="leading-relaxed">{step}</span>
                </li>
              ))}
            </ol>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-slate-200/80 bg-slate-50 px-2.5 py-2">
            <p className="text-[0.62rem] text-slate-400 mb-1">Escalation</p>
            <Badge label={data.escalation} variant="green" className="text-[0.62rem] px-2 py-0.5" />
          </div>
          <div className="rounded-xl border border-slate-200/80 bg-slate-50 px-2.5 py-2">
            <p className="text-[0.62rem] text-slate-400 mb-1">Automation</p>
            <Badge label={data.automation} variant="orange" className="text-[0.62rem] px-2 py-0.5" />
          </div>
        </div>

        <div className="flex gap-2">
          <Button className="flex-1 h-8 px-3 text-xs" onClick={onViewRunbook} disabled={aiLoading}>
            View Runbook
          </Button>
          <Button variant="outline" className="flex-1 h-8 px-3 text-xs" onClick={onCopySteps} disabled={aiLoading}>
            Copy Steps
          </Button>
        </div>
      </div>
    </DashboardCard>
  )
}
