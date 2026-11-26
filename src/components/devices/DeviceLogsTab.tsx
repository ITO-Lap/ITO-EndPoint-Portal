import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Download, FileSpreadsheet, FileText, Loader2, RefreshCw, Stethoscope } from 'lucide-react'
import { deviceLogsApi, type DeviceLog, type DiagnosticsStatus, type LogCategory } from '../../api/deviceLogs'
import type { ApiDevice } from '../../api'

const CATEGORIES: LogCategory[] = ['Device', 'Compliance', 'Policy', 'Profile', 'Action', 'Remote action', 'App']
const CAT_CLS: Record<LogCategory, string> = {
  Device: 'bg-slate-100 text-slate-700', Compliance: 'bg-red-50 text-red-700', Policy: 'bg-sky-50 text-sky-700', Profile: 'bg-sky-50 text-sky-700',
  Action: 'bg-violet-50 text-violet-700', 'Remote action': 'bg-violet-50 text-violet-700', App: 'bg-emerald-50 text-emerald-700',
}
const fmt = (iso: string): string => (iso ? new Date(iso).toLocaleString() : '—')
const DONE = new Set(['completed', 'failed', 'unknown'])

export function DeviceLogsTab({ d }: { d: ApiDevice }) {
  const [log, setLog] = useState<DeviceLog | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [cat, setCat] = useState<'all' | LogCategory>('all')
  const [q, setQ] = useState('')
  const [exporting, setExporting] = useState<'csv' | 'excel' | null>(null)
  const [exportErr, setExportErr] = useState<string | null>(null)
  const [diag, setDiag] = useState<DiagnosticsStatus | null>(null)
  const [diagErr, setDiagErr] = useState<string | null>(null)
  const [diagBusy, setDiagBusy] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const load = useCallback(() => {
    setLoading(true); setError(null)
    deviceLogsApi.get(d.id).then(setLog).catch(e => setError(e instanceof Error ? e.message : 'Could not load the device log')).finally(() => setLoading(false))
  }, [d.id])
  // Reload state is flagged during render when the device changes; the fetch itself runs in the effect.
  const [prevId, setPrevId] = useState(d.id)
  if (prevId !== d.id) { setPrevId(d.id); setLoading(true); setError(null) }
  useEffect(() => {
    let cancelled = false
    deviceLogsApi.get(d.id)
      .then(l => { if (!cancelled) setLog(l) })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load the device log') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true; clearTimeout(timer.current) }
  }, [d.id])

  // Polls Intune every 15 s until the collection finishes; held in a ref so it can reschedule itself.
  const pollRef = useRef<(requestId: string) => void>(() => undefined)
  useEffect(() => {
    pollRef.current = (requestId: string) => {
      timer.current = setTimeout(() => {
        deviceLogsApi.diagnosticsStatus(d.id, requestId).then(s => { setDiag(s); if (!DONE.has(s.status.toLowerCase())) pollRef.current(requestId) })
          .catch(e => setDiagErr(e instanceof Error ? e.message : 'Could not read the diagnostics status'))
      }, 15000)
    }
  }, [d.id])

  const startDiagnostics = () => {
    if (!window.confirm(`Ask Intune to collect diagnostic logs from ${d.deviceName}? The device must be online; collection can take several minutes.`)) return
    setDiagBusy(true); setDiagErr(null)
    deviceLogsApi.requestDiagnostics(d.id).then(s => { setDiag(s); pollRef.current(s.requestId) })
      .catch(e => setDiagErr(e instanceof Error ? e.message : 'Diagnostics request failed')).finally(() => setDiagBusy(false))
  }

  const doExport = (format: 'csv' | 'excel') => {
    setExporting(format); setExportErr(null)
    deviceLogsApi.download(d.id, format).catch(e => setExportErr(e instanceof Error ? e.message : 'Export failed')).finally(() => setExporting(null))
  }

  const shown = useMemo(() => (log?.entries ?? []).filter(e => (cat === 'all' || e.category === cat) && (!q || `${e.event} ${e.detail} ${e.status}`.toLowerCase().includes(q.toLowerCase()))), [log, cat, q])
  const counts = useMemo(() => { const m = new Map<string, number>(); for (const e of log?.entries ?? []) m.set(e.category, (m.get(e.category) ?? 0) + 1); return m }, [log])
  const canDiagnose = d.platform === 'Windows' && d.managementSource === 'Microsoft Intune'

  if (loading && !log) return <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Pulling logs from {d.managementSource}…</div>
  if (error && !log) return <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error} <button type="button" onClick={load} className="ml-2 font-semibold underline">Retry</button></div>

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold text-slate-800">Device log · {log?.entries.length ?? 0} entries</h3>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button type="button" onClick={load} disabled={loading} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"><RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Pull again</button>
          <button type="button" onClick={() => doExport('excel')} disabled={!!exporting} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-600 disabled:opacity-60">{exporting === 'excel' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileSpreadsheet className="h-3.5 w-3.5" />} Export Excel</button>
          <button type="button" onClick={() => doExport('csv')} disabled={!!exporting} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">{exporting === 'csv' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />} Export CSV</button>
        </div>
      </div>
      {exportErr && <p className="text-xs text-red-600">{exportErr}</p>}
      {error && <p className="text-xs text-red-600">Refresh failed: {error}. Showing the previous pull.</p>}

      {log?.sections.some(s => !s.ok) && (
        <div className="space-y-1 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
          {log.sections.filter(s => !s.ok).map(s => <p key={s.name} className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span><b>{s.name}:</b> {s.error ?? 'unavailable'}</span></p>)}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <button type="button" onClick={() => setCat('all')} className={`rounded-full border px-3 py-1 font-semibold ${cat === 'all' ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600'}`}>All ({log?.entries.length ?? 0})</button>
        {CATEGORIES.filter(c => counts.get(c)).map(c => <button key={c} type="button" onClick={() => setCat(cat === c ? 'all' : c)} className={`rounded-full border px-3 py-1 font-semibold ${cat === c ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600'}`}>{c} ({counts.get(c)})</button>)}
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search log" className="ml-auto rounded-lg border border-slate-200 px-2.5 py-1" />
      </div>

      <div className="max-h-[28rem] overflow-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[600px] text-left text-xs">
          <thead className="sticky top-0 bg-slate-50 text-slate-500"><tr><th className="px-3 py-2 font-semibold">Time</th><th className="px-3 py-2 font-semibold">Category</th><th className="px-3 py-2 font-semibold">Event</th><th className="px-3 py-2 font-semibold">Status</th><th className="px-3 py-2 font-semibold">Details</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {shown.slice(0, 500).map((e, i) => (
              <tr key={i} className="align-top">
                <td className="whitespace-nowrap px-3 py-2 text-slate-500">{fmt(e.time)}</td>
                <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 font-semibold ${CAT_CLS[e.category]}`}>{e.category}</span></td>
                <td className="px-3 py-2 font-semibold text-slate-800">{e.event}</td>
                <td className="px-3 py-2 text-slate-700">{e.status || '—'}</td>
                <td className="px-3 py-2 text-slate-500">{e.detail || '—'}</td>
              </tr>
            ))}
            {!shown.length && <tr><td colSpan={5} className="px-3 py-8 text-center text-slate-500">No log entries match.</td></tr>}
          </tbody>
        </table>
      </div>
      {shown.length > 500 && <p className="text-xs text-slate-500">Showing the first 500 of {shown.length}; the export contains all {log?.entries.length} entries.</p>}

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-800"><Stethoscope className="h-4 w-4 text-indigo-500" /> Collect diagnostic logs from the device</h4>
        {canDiagnose ? <>
          <p className="mt-1 text-xs text-slate-500">Asks Intune to gather the device's own diagnostic logs (event logs, MDM and update logs). The device must be online. This runs an action on the device and needs the Graph permission DeviceManagementManagedDevices.PrivilegedOperations.All.</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button type="button" onClick={startDiagnostics} disabled={diagBusy || (!!diag && !DONE.has(diag.status.toLowerCase()))} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">{diagBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Stethoscope className="h-3.5 w-3.5" />} Collect diagnostics</button>
            {diag && <span className="text-xs text-slate-600">Status: <b>{diag.status}</b>{diag.requestedAt ? ` · requested ${fmt(diag.requestedAt)}` : ''}{!DONE.has(diag.status.toLowerCase()) && ' · checking every 15 s'}</span>}
            {diag?.downloadUrl && <a href={diag.downloadUrl} className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:underline"><Download className="h-3.5 w-3.5" /> Download diagnostics (zip)</a>}
          </div>
          {diagErr && <p className="mt-2 text-xs text-red-600">{diagErr}</p>}
        </> : <p className="mt-1 text-xs text-slate-500">{d.platform === 'macOS' ? 'On-device log collection is not exposed by the ManageEngine API used here, so macOS devices show the activity history above.' : 'Available for Windows devices managed by Intune only.'}</p>}
      </div>
    </div>
  )
}
