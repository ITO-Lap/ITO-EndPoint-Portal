import { BookOpen } from 'lucide-react'
import type { RunbookData } from '../types'
import { Badge } from './Badge'
import { Button } from './Button'
import { DashboardCard } from './DashboardCard'

interface RunbookCardProps {
  data: RunbookData
}

export function RunbookCard({ data }: RunbookCardProps) {
  return (
    <DashboardCard title="Recommended Action / Runbook" icon={BookOpen}>
      <div className="space-y-6">
        <div className="rounded-3xl border border-slate-200/80 bg-slate-50 p-4">
          <p className="text-sm uppercase tracking-[0.22em] text-slate-500">Recommended Runbook</p>
          <a href="#" className="mt-2 inline-block text-sm font-semibold text-sky-600 hover:text-sky-700">
            {data.runbookName}
          </a>
        </div>

        <div className="space-y-4 rounded-3xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-900/5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-slate-900">Next Steps</p>
            <span className="text-xs text-slate-500">5 items</span>
          </div>
          <ol className="space-y-4 text-sm text-slate-700">
            {data.steps.map((step, index) => (
              <li key={step} className="flex items-start gap-3">
                <span className="mt-1 flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-[0.70rem] font-semibold text-slate-700">{index + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-3xl border border-slate-200/80 bg-slate-50 px-4 py-3">
            <p className="text-sm text-slate-500">Escalation Needed</p>
            <Badge label={data.escalation} variant="green" className="mt-2" />
          </div>
          <div className="rounded-3xl border border-slate-200/80 bg-slate-50 px-4 py-3">
            <p className="text-sm text-slate-500">Automation Available</p>
            <Badge label={data.automation} variant="orange" className="mt-2" />
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button className="rounded-3xl px-6 py-3">View Runbook</Button>
          <Button variant="outline" className="rounded-3xl px-6 py-3">
            Copy Steps
          </Button>
        </div>
      </div>
    </DashboardCard>
  )
}
