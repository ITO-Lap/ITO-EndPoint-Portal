import { useState } from 'react'
import { Search, X, ChevronDown, AlertTriangle, Info, AlertCircle, XCircle } from 'lucide-react'
import type { EventLogEntry } from '../../types'
import { usePagination } from '../../hooks/usePagination'
import { Pagination } from '../ui/Pagination'

const PAGE_SIZE = 25

interface Props {
  logs: EventLogEntry[]
  loading?: boolean
}

const LEVEL_CONFIG = {
  Critical:    { icon: XCircle,      cls: 'text-red-600',     badge: 'bg-red-100 text-red-700 border-red-200' },
  Error:       { icon: AlertCircle,  cls: 'text-orange-600',  badge: 'bg-orange-100 text-orange-700 border-orange-200' },
  Warning:     { icon: AlertTriangle,cls: 'text-amber-600',   badge: 'bg-amber-100 text-amber-700 border-amber-200' },
  Information: { icon: Info,         cls: 'text-blue-500',    badge: 'bg-blue-100 text-blue-700 border-blue-200' },
}

function DetailModal({ log, onClose }: { log: EventLogEntry; onClose: () => void }) {
  const cfg = LEVEL_CONFIG[log.level]
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg max-h-[80vh] flex flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5 flex-shrink-0">
          <h3 className="text-sm font-semibold text-slate-900 truncate">Event {log.eventId} — {log.source}</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 transition">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 text-xs">
          <div className="flex flex-wrap gap-2">
            <span className={`rounded-full border px-2.5 py-1 font-semibold text-[0.65rem] ${cfg.badge}`}>{log.level}</span>
            <span className="text-slate-400 font-mono">{log.timestamp}</span>
            <span className="text-slate-400">{log.category}</span>
          </div>
          <div>
            <p className="text-[0.6rem] font-semibold uppercase tracking-wider text-slate-400 mb-1">Source</p>
            <p className="font-mono text-slate-800">{log.source}</p>
          </div>
          <div>
            <p className="text-[0.6rem] font-semibold uppercase tracking-wider text-slate-400 mb-1">Event ID</p>
            <p className="font-mono text-slate-800">{log.eventId}</p>
          </div>
          <div>
            <p className="text-[0.6rem] font-semibold uppercase tracking-wider text-slate-400 mb-1">Description</p>
            <p className="text-slate-700 leading-relaxed">{log.description}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export function EventLogViewer({ logs, loading }: Props) {
  const [search, setSearch] = useState('')
  const [level, setLevel]   = useState('')
  const [selected, setSelected] = useState<EventLogEntry | null>(null)

  const filtered = logs.filter(l => {
    const q = search.toLowerCase()
    if (q && !l.source.toLowerCase().includes(q) && !l.description.toLowerCase().includes(q) && !l.eventId.includes(q)) return false
    if (level && l.level !== level) return false
    return true
  })

  const { page, setPage, totalPages, paginated } = usePagination(filtered, PAGE_SIZE)

  if (loading) return <div className="flex items-center justify-center py-16 text-slate-400 text-xs">Loading event logs…</div>

  return (
    <>
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search logs…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-orange-300"
          />
        </div>
        <div className="relative">
          <select
            value={level}
            onChange={e => setLevel(e.target.value)}
            className="appearance-none rounded-xl border border-slate-200 bg-white pl-3 pr-8 py-2 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-300"
          >
            <option value="">Level: All</option>
            {['Critical','Error','Warning','Information'].map(l => <option key={l} value={l}>{l}</option>)}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-slate-400">
          <p className="text-xs font-medium">{logs.length === 0 ? 'No event logs recorded' : 'No logs match your filters'}</p>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3 text-left">Level</th>
                  <th className="px-4 py-3 text-left">Event ID</th>
                  <th className="px-4 py-3 text-left">Source</th>
                  <th className="px-4 py-3 text-left">Category</th>
                  <th className="px-4 py-3 text-left">Message</th>
                  <th className="px-4 py-3 text-left">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginated.map(log => {
                  const cfg = LEVEL_CONFIG[log.level]
                  return (
                    <tr
                      key={log.id}
                      onClick={() => setSelected(log)}
                      className="cursor-pointer hover:bg-slate-50 transition"
                    >
                      <td className="px-4 py-2.5 align-top whitespace-nowrap">
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[0.65rem] font-bold ${cfg.badge}`}>{log.level}</span>
                      </td>
                      <td className="px-4 py-2.5 align-top text-slate-500 text-xs font-mono whitespace-nowrap">{log.eventId || '—'}</td>
                      <td className="px-4 py-2.5 align-top text-slate-800 text-xs font-medium max-w-[160px] truncate" title={log.source || undefined}>{log.source || '—'}</td>
                      <td className="px-4 py-2.5 align-top text-slate-500 text-xs whitespace-nowrap">{log.category || '—'}</td>
                      <td className="px-4 py-2.5 align-top text-slate-600 text-xs max-w-[360px] truncate" title={log.description || undefined}>{log.description || '—'}</td>
                      <td className="px-4 py-2.5 align-top text-slate-400 text-xs font-mono whitespace-nowrap">{log.timestamp || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage}
            totalItems={filtered.length} pageSize={PAGE_SIZE} itemLabel="event" />
        </div>
      )}

      {selected && <DetailModal log={selected} onClose={() => setSelected(null)} />}
    </>
  )
}
