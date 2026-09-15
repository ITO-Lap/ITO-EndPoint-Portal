import { ClipboardList, Users } from 'lucide-react'
import type { RoleActivityEventsSummary } from '../../api/roleActivity'
import { ROLE_ACTIVITY_SOURCES, SOURCE_LABELS } from '../../api/roleActivity'

interface Props {
  summary: RoleActivityEventsSummary | null
  loading: boolean
}

const SOURCE_ACCENT: Record<string, { accent: string; iconBg: string }> = {
  entra_role_mgmt: { accent: 'text-sky-700', iconBg: 'bg-sky-100' },
  intune_rbac: { accent: 'text-orange-700', iconBg: 'bg-orange-100' },
  sharepoint_admin: { accent: 'text-emerald-700', iconBg: 'bg-emerald-100' },
}

export function AuditSummaryCards({ summary, loading }: Props) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
      <div className="rounded-xl border border-slate-200/60 bg-white shadow-sm p-4 flex items-center gap-3">
        <div className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-lg bg-orange-100">
          <ClipboardList className="h-5 w-5 text-orange-600" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="text-[0.68rem] font-medium text-slate-500 truncate">Total Events</p>
          <p className="text-lg font-bold text-orange-700">
            {loading ? '—' : (summary ? summary.totalEvents.toLocaleString() : '0')}
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200/60 bg-white shadow-sm p-4 flex items-center gap-3">
        <div className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-lg bg-sky-100">
          <Users className="h-5 w-5 text-sky-600" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="text-[0.68rem] font-medium text-slate-500 truncate">Unique Actors</p>
          <p className="text-lg font-bold text-sky-700">
            {loading ? '—' : (summary ? summary.uniqueActors.toLocaleString() : '0')}
          </p>
        </div>
      </div>

      {ROLE_ACTIVITY_SOURCES.map(source => {
        const style = SOURCE_ACCENT[source]!
        return (
          <div key={source} className="rounded-xl border border-slate-200/60 bg-white shadow-sm p-4 flex items-center gap-3">
            <div className={`grid h-10 w-10 flex-shrink-0 place-items-center rounded-lg ${style.iconBg}`}>
              <span className={`text-xs font-bold ${style.accent}`}>{SOURCE_LABELS[source].slice(0, 2)}</span>
            </div>
            <div className="min-w-0">
              <p className="text-[0.68rem] font-medium text-slate-500 truncate">{SOURCE_LABELS[source]}</p>
              <p className={`text-lg font-bold ${style.accent}`}>
                {loading ? '—' : (summary?.bySource[source] ?? 0).toLocaleString()}
              </p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
