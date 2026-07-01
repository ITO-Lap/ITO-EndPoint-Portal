import { useState, useEffect } from 'react'
import { ClipboardList, RefreshCw, Search, ChevronLeft, ChevronRight } from 'lucide-react'
import { intelApi } from '../api/intelligence'
import type { AuditEntry } from '../api/intelligence'

const PAGE_SIZE = 50

export function AuditLogPage({ onBack }: { onBack: () => void }) {
  const [entries, setEntries]     = useState<AuditEntry[]>([])
  const [total, setTotal]         = useState(0)
  const [loading, setLoading]     = useState(true)
  const [page, setPage]           = useState(0)
  const [actionFilter, setAction] = useState('')
  const [typeFilter, setType]     = useState('')
  const [actions, setActions]     = useState<string[]>([])
  const [dbMissing, setDbMissing] = useState(false)

  const load = async (p = page) => {
    setLoading(true)
    try {
      const res = await intelApi.audit.list({
        limit:         PAGE_SIZE,
        offset:        p * PAGE_SIZE,
        action:        actionFilter || undefined,
        resource_type: typeFilter   || undefined,
      })
      setEntries(res.data ?? [])
      setTotal(res.count ?? 0)
      if (res.data?.length === 0 && p === 0 && 'message' in res) setDbMissing(true)
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }

  const loadActions = async () => {
    try {
      const res = await intelApi.audit.actions()
      setActions(res.data ?? [])
    } catch {
      // silent
    }
  }

  useEffect(() => { load(0); loadActions() }, [])
  useEffect(() => { load(page) }, [page])

  const handleFilter = () => { setPage(0); load(0) }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1 text-sm text-slate-400">
            <button onClick={onBack} className="hover:text-slate-600 transition">← Back</button>
            <span>/</span>
            <span className="text-slate-700 font-medium flex items-center gap-1.5">
              <ClipboardList className="h-4 w-4 text-slate-500" /> Audit Log
            </span>
          </div>
          <p className="text-xs text-slate-500">Full change and access trail — every action logged with user, timestamp, and resource context.</p>
        </div>
        <button onClick={() => load(page)} className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 transition">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {/* DB warning */}
      {dbMissing && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800">
          <p className="font-semibold mb-0.5">Database not configured</p>
          Audit logging requires PostgreSQL. Set <code className="font-mono">DATABASE_URL</code> in <code className="font-mono">server/.env</code> and run <code className="font-mono">psql $DATABASE_URL -f server/src/db/schema.sql</code>.
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Action</label>
          <select
            value={actionFilter}
            onChange={e => setAction(e.target.value)}
            className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700 focus:outline-none focus:border-orange-400"
          >
            <option value="">All Actions</option>
            {actions.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Resource Type</label>
          <select
            value={typeFilter}
            onChange={e => setType(e.target.value)}
            className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700 focus:outline-none focus:border-orange-400"
          >
            <option value="">All Types</option>
            {['device', 'policy', 'tenant', 'report', 'user'].map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <button
          onClick={handleFilter}
          className="flex h-8 items-center gap-1.5 rounded-lg bg-orange-500 px-3 text-xs font-semibold text-white hover:bg-orange-600 transition"
        >
          <Search className="h-3.5 w-3.5" /> Apply
        </button>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-slate-200/60 bg-white shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-700">{total} events</span>
          {totalPages > 1 && (
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="rounded p-1 hover:bg-slate-100 disabled:opacity-30">
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              Page {page + 1} / {totalPages}
              <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="rounded p-1 hover:bg-slate-100 disabled:opacity-30">
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16"><RefreshCw className="h-5 w-5 animate-spin text-slate-400" /></div>
        ) : entries.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-400">
            {dbMissing ? 'Configure DATABASE_URL to enable audit logging.' : 'No audit entries match the current filters.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 text-left text-slate-500 font-semibold">
                  <th className="px-5 py-3">Timestamp</th>
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">Resource</th>
                  <th className="px-4 py-3">Resource ID</th>
                  <th className="px-4 py-3">IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {entries.map((e, i) => (
                  <tr key={e.id ?? i} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-5 py-3 text-slate-500 whitespace-nowrap">
                      {e.created_at ? new Date(e.created_at).toLocaleString() : '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{e.user_email ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-slate-600">{e.action}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{e.resource_type ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-400 font-mono">{e.resource_id?.slice(0, 16) ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-400">{e.ip_address ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
