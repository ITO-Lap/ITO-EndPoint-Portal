import { useState } from 'react'
import { Search, X, ChevronDown } from 'lucide-react'
import type { ApplicationFailureReport } from '../../types'
import { usePagination } from '../../hooks/usePagination'
import { Pagination } from '../ui/Pagination'

const PAGE_SIZE = 25

interface Props {
  failures: ApplicationFailureReport[]
  loading?: boolean
}

const SEV_BADGE: Record<string, string> = {
  Critical: 'bg-red-100 text-red-700 border border-red-200',
  High:     'bg-orange-100 text-orange-700 border border-orange-200',
  Medium:   'bg-amber-100 text-amber-700 border border-amber-200',
  Low:      'bg-emerald-100 text-emerald-700 border border-emerald-200',
}

function DetailModal({ failure, onClose }: { failure: ApplicationFailureReport; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-xl max-h-[85vh] flex flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5 flex-shrink-0">
          <h3 className="text-sm font-semibold text-slate-900 truncate">App Failure: {failure.appName}</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 text-xs">
          <div className="flex flex-wrap gap-2">
            <span className={`rounded-full px-2.5 py-1 font-semibold text-[0.65rem] ${SEV_BADGE[failure.severity]}`}>{failure.severity}</span>
            <span className="rounded-full bg-slate-100 text-slate-600 px-2.5 py-1 font-semibold text-[0.65rem]">Event {failure.eventId}</span>
            <span className="text-slate-400">{failure.crashTime}</span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {[
              { label: 'Application',      value: failure.appName },
              { label: 'Affected User',    value: failure.affectedUser },
              { label: 'Faulting Module',  value: failure.faultingModule },
              { label: 'Error Code',       value: failure.errorCode },
            ].map(r => (
              <div key={r.label}>
                <p className="text-[0.6rem] font-semibold uppercase tracking-wider text-slate-400 mb-0.5">{r.label}</p>
                <p className="font-mono text-slate-900">{r.value}</p>
              </div>
            ))}
          </div>

          <div>
            <p className="text-[0.6rem] font-semibold uppercase tracking-wider text-slate-400 mb-1">Possible Reason</p>
            <p className="text-slate-700 leading-relaxed">{failure.possibleReason}</p>
          </div>

          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-[0.6rem] font-semibold uppercase tracking-wider text-emerald-600 mb-1.5">Recommended Fix</p>
            <p className="text-emerald-800 leading-relaxed">{failure.recommendedFix}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export function ApplicationFailureTable({ failures, loading }: Props) {
  const [search, setSearch]     = useState('')
  const [severity, setSeverity] = useState('')
  const [selected, setSelected] = useState<ApplicationFailureReport | null>(null)

  const filtered = failures.filter(f => {
    const q = search.toLowerCase()
    if (q && !f.appName.toLowerCase().includes(q) && !f.affectedUser.toLowerCase().includes(q)) return false
    if (severity && f.severity !== severity) return false
    return true
  })

  const { page, setPage, totalPages, paginated } = usePagination(filtered, PAGE_SIZE)

  if (loading) return (
    <div className="flex items-center justify-center py-16 text-slate-400 text-xs">Loading application failures…</div>
  )

  return (
    <>
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search failures…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-orange-300"
          />
        </div>
        <div className="relative">
          <select
            value={severity}
            onChange={e => setSeverity(e.target.value)}
            className="appearance-none rounded-xl border border-slate-200 bg-white pl-3 pr-8 py-2 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-300"
          >
            <option value="">Severity: All</option>
            {['Critical','High','Medium','Low'].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-slate-400">
          <div className="rounded-full bg-slate-100 p-3 mb-2">
            <Search className="h-5 w-5" />
          </div>
          <p className="text-xs font-medium">{failures.length === 0 ? 'No application failures recorded' : 'No results match your filters'}</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-100">
                  {['App Name','Crash Time','Faulting Module','Error Code','Event ID','Affected User','Severity'].map(h => (
                    <th key={h} className="px-4 py-3 text-left font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginated.map((f, i) => (
                  <tr
                    key={f.id}
                    onClick={() => setSelected(f)}
                    className={`border-b border-slate-50 cursor-pointer hover:bg-slate-50 transition ${i % 2 ? 'bg-slate-50/40' : ''}`}
                  >
                    <td className="px-4 py-3 font-medium text-slate-900 whitespace-nowrap">{f.appName}</td>
                    <td className="px-4 py-3 font-mono text-slate-500 whitespace-nowrap">{f.crashTime}</td>
                    <td className="px-4 py-3 font-mono text-slate-600 whitespace-nowrap">{f.faultingModule}</td>
                    <td className="px-4 py-3 font-mono text-slate-600">{f.errorCode}</td>
                    <td className="px-4 py-3 font-mono text-slate-600">{f.eventId}</td>
                    <td className="px-4 py-3 text-slate-600">{f.affectedUser}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-[0.65rem] font-semibold ${SEV_BADGE[f.severity]}`}>{f.severity}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage}
            totalItems={filtered.length} pageSize={PAGE_SIZE} itemLabel="failure" />
        </div>
      )}

      {selected && <DetailModal failure={selected} onClose={() => setSelected(null)} />}
    </>
  )
}
