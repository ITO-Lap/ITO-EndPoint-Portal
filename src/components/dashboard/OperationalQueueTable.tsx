import { useEffect, useMemo, useState } from 'react'
import { ListChecks, RefreshCw, Search } from 'lucide-react'
import { api } from '../../api'
import type { OperationalQueueRow, QueuePriority } from '../../api'

const PRIORITY_BADGE: Record<QueuePriority, string> = {
  Critical: 'bg-red-100 text-red-700',
  High: 'bg-amber-100 text-amber-700',
  Medium: 'bg-slate-100 text-slate-600',
}

interface OperationalQueueTableProps {
  onViewDevice?: (deviceName: string) => void
}

export function OperationalQueueTable({ onViewDevice }: OperationalQueueTableProps) {
  const [state, setState] = useState<'loading' | 'ready' | 'empty' | 'error'>('loading')
  const [rows, setRows] = useState<OperationalQueueRow[]>([])
  const [sourceFilter, setSourceFilter] = useState<string>('')
  const [priorityFilter, setPriorityFilter] = useState<string>('')
  const [search, setSearch] = useState('')

  useEffect(() => {
    let cancelled = false
    api.fetchOperationalQueue()
      .then(res => {
        if (cancelled) return
        setRows(res.rows)
        setState(res.rows.length === 0 ? 'empty' : 'ready')
      })
      .catch(() => { if (!cancelled) setState('error') })
    return () => { cancelled = true }
  }, [])

  const sources = useMemo(() => [...new Set(rows.map(r => r.source))], [rows])
  const priorities = useMemo(() => [...new Set(rows.map(r => r.priority))], [rows])

  const filtered = rows.filter(r =>
    (!sourceFilter || r.source === sourceFilter)
    && (!priorityFilter || r.priority === priorityFilter)
    && (!search.trim() || r.device.toLowerCase().includes(search.trim().toLowerCase()) || r.owner.toLowerCase().includes(search.trim().toLowerCase()))
  )

  return (
    <div className="rounded-2xl border border-slate-200/60 bg-white shadow-sm p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ListChecks className="h-4 w-4 text-slate-500" />
          <h2 className="text-sm font-bold text-slate-900">Operational queue</h2>
          <span className="text-xs text-slate-400">Actionable exceptions across your environment</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs">
            <option value="">All sources</option>
            {sources.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs">
            <option value="">All priorities</option>
            {priorities.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search devices or users…" className="rounded-lg border border-slate-200 bg-white py-1.5 pl-7 pr-2 text-xs focus:outline-none focus:border-sky-400" />
          </div>
        </div>
      </div>

      {state === 'loading' && <div className="flex items-center justify-center py-10"><RefreshCw className="h-5 w-5 animate-spin text-slate-300" /></div>}
      {state === 'error' && <p className="py-6 text-center text-xs text-red-500">Couldn't load the operational queue.</p>}
      {state === 'empty' && <p className="py-6 text-center text-xs text-slate-400">No actionable exceptions right now.</p>}

      {state === 'ready' && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-[0.65rem] uppercase tracking-wide text-slate-400">
                <th className="pb-2 pr-3 font-semibold">Device</th>
                <th className="pb-2 pr-3 font-semibold">Owner</th>
                <th className="pb-2 pr-3 font-semibold">Issue</th>
                <th className="pb-2 pr-3 font-semibold">Source</th>
                <th className="pb-2 pr-3 font-semibold">Age</th>
                <th className="pb-2 pr-3 font-semibold">Priority</th>
                <th className="pb-2 font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row, i) => (
                <tr key={`${row.deviceId}-${i}`} className="border-t border-slate-100">
                  <td className="py-2 pr-3 font-medium text-slate-800">{row.device}</td>
                  <td className="py-2 pr-3 text-slate-600">{row.owner}</td>
                  <td className="py-2 pr-3 text-slate-600">{row.issue}</td>
                  <td className="py-2 pr-3"><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[0.65rem] font-medium text-slate-600">{row.source}</span></td>
                  <td className="py-2 pr-3 text-slate-500">{row.ageDays !== null ? `${row.ageDays} days` : '—'}</td>
                  <td className="py-2 pr-3"><span className={`rounded-full px-2 py-0.5 text-[0.65rem] font-semibold ${PRIORITY_BADGE[row.priority]}`}>{row.priority}</span></td>
                  <td className="py-2">
                    <button onClick={() => onViewDevice?.(row.device)} className="rounded-lg border border-slate-200 px-2.5 py-1 text-[0.68rem] font-medium text-slate-600 hover:bg-slate-50">View details</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
