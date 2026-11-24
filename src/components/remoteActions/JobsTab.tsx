import { useCallback, useEffect, useMemo, useState } from 'react'
import { Ban, Check, Download, RefreshCw, RotateCcw, X } from 'lucide-react'
import { remoteActionsApi, type DeviceExecution, type Job, type RaStatus } from '../../api/remoteActions'
import { Card, DeviceBadge, Empty, ErrorBanner, JobBadge, Loading, Notice, Pre, RiskBadge } from './shared'
import { btnOutline, btnPrimary, errMsg, fmtTime, inputCls } from './helpers'

const ACTIVE = new Set(['queued', 'running', 'scheduled'])

export function JobsTab({ status, openJobId, onOpened, refreshSignal }: { status: RaStatus; openJobId: string | null; onOpened: () => void; refreshSignal: number }) {
  const [jobs, setJobs] = useState<Job[] | null>(null); const [sel, setSel] = useState<Job | null>(null); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false)
  const [filter, setFilter] = useState('')

  const load = useCallback(async () => { try { setJobs(await remoteActionsApi.jobs(filter || undefined)) } catch (e) { setErr(errMsg(e)) } }, [filter])
  useEffect(() => { let live = true; void remoteActionsApi.jobs(filter || undefined).then(j => { if (live) setJobs(j) }).catch(e => { if (live) setErr(errMsg(e)) }); return () => { live = false } }, [filter, refreshSignal])
  useEffect(() => { if (openJobId) { void remoteActionsApi.job(openJobId).then(setSel).catch(e => setErr(errMsg(e))); onOpened() } }, [openJobId, onOpened])

  // Near-real-time: while a job is active, ask the server to pull the provider's reported state every 10s.
  useEffect(() => {
    if (!sel || !ACTIVE.has(sel.status)) return
    const t = window.setInterval(() => { void remoteActionsApi.refreshJob(sel.id).then(j => { setSel(j); void load() }).catch(() => undefined) }, 10_000)
    return () => window.clearInterval(t)
  }, [sel, load])

  async function act(fn: () => Promise<Job>) {
    setBusy(true); setErr(null)
    try { setSel(await fn()); void load() } catch (e) { setErr(errMsg(e)) } finally { setBusy(false) }
  }

  return (
    <div className="space-y-3">
      <ErrorBanner message={err} onClose={() => setErr(null)} />
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Filter jobs by status" className={`${inputCls} max-w-[12rem]`} value={filter} onChange={e => setFilter(e.target.value)}>
          <option value="">All jobs</option>{['pending_approval', 'scheduled', 'queued', 'running', 'completed', 'completed_with_failures', 'failed', 'cancelled', 'rejected'].map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}</select>
        <button type="button" className={btnOutline} onClick={() => { void load() }}><RefreshCw className="h-3.5 w-3.5" />Refresh</button>
      </div>
      {!jobs ? <Loading /> : jobs.length === 0 ? <Empty>No jobs yet.</Empty> : (
        <div className="overflow-auto rounded-2xl border border-slate-200 bg-white"><table className="w-full text-left text-xs">
          <thead className="bg-slate-50 text-[0.65rem] uppercase text-slate-500"><tr>{['Script', 'Status', 'Devices', 'Result', 'Requested by', 'Created'].map(h => <th key={h} className="px-3 py-2">{h}</th>)}</tr></thead>
          <tbody>{jobs.map(j => (
            <tr key={j.id} className="cursor-pointer border-t border-slate-100 hover:bg-slate-50" onClick={() => { void remoteActionsApi.job(j.id).then(setSel).catch(e => setErr(errMsg(e))) }}>
              <td className="px-3 py-2 font-medium text-sky-700">{j.scriptName}</td><td className="px-3 py-2"><JobBadge s={j.status} /></td>
              <td className="px-3 py-2">{j.counts.total}</td><td className="px-3 py-2">{j.counts.succeeded} ok{j.counts.failed > 0 ? <span className="font-bold text-red-700"> · {j.counts.failed} failed</span> : ''}</td>
              <td className="px-3 py-2">{j.requestedBy}</td><td className="px-3 py-2">{fmtTime(j.createdAt)}</td></tr>))}</tbody></table></div>
      )}
      {sel && <JobDetail key={sel.id} job={sel} status={status} busy={busy} onClose={() => setSel(null)}
        onRefresh={() => { void act(() => remoteActionsApi.refreshJob(sel.id)) }} onCancel={() => { void act(() => remoteActionsApi.cancelJob(sel.id)) }}
        onRetry={() => { const n = sel.devices.filter(d => d.state === 'failed' || d.state === 'timed_out').length; void act(() => remoteActionsApi.retryFailed(sel.id, n)) }}
        onDecide={(d, note) => { void act(() => remoteActionsApi.decideJob(sel.id, d, note)) }} />}
    </div>
  )
}

function JobDetail({ job, status, busy, onClose, onRefresh, onCancel, onRetry, onDecide }: {
  job: Job; status: RaStatus; busy: boolean; onClose: () => void; onRefresh: () => void; onCancel: () => void; onRetry: () => void; onDecide: (d: 'approve' | 'reject', note?: string) => void
}) {
  const [q, setQ] = useState(''); const [state, setState] = useState(''); const [sort, setSort] = useState<'name' | 'state'>('name'); const [open, setOpen] = useState<DeviceExecution | null>(null); const [note, setNote] = useState('')
  const rows = useMemo(() => job.devices.filter(d => (!state || d.state === state) && d.deviceName.toLowerCase().includes(q.toLowerCase())).sort((a, b) => sort === 'name' ? a.deviceName.localeCompare(b.deviceName) : a.state.localeCompare(b.state)), [job.devices, q, state, sort])
  const c = job.counts
  const mine = job.requestedBy.toLowerCase() === status.me.toLowerCase()
  // A job-level bar needs a REAL signal: every device must have reported a script progress marker. Otherwise we show counts only.
  const withProgress = job.devices.filter(d => d.progress)
  const genuineBar = job.devices.length > 0 && withProgress.length === job.devices.length
  const done = job.devices.length ? Math.round(job.devices.reduce((n, d) => n + (['succeeded', 'failed', 'timed_out', 'skipped', 'cancelled'].includes(d.state) ? 100 : d.progress?.percent ?? 0), 0) / job.devices.length) : 0

  return (
    <Card title={`Job ${job.id.slice(0, 8)} — ${job.scriptName} v${job.scriptVersion}`} action={<button type="button" className={btnOutline} onClick={onClose}>Close</button>}>
      <div className="space-y-3 text-xs">
        <div className="flex flex-wrap items-center gap-2"><JobBadge s={job.status} /><RiskBadge risk={job.risk} /><span className="text-slate-500">via {job.provider} · {job.mode.replace('_', ' ')}{job.scheduledFor ? ` @ ${fmtTime(job.scheduledFor)}` : ''}</span></div>
        <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-3">
          <div><dt className="text-[0.65rem] font-bold uppercase text-slate-500">Requestor</dt><dd>{job.requestedBy}</dd></div>
          <div><dt className="text-[0.65rem] font-bold uppercase text-slate-500">Approver</dt><dd>{job.approver ?? (job.approvalRequired ? 'Pending' : 'Not required')}</dd></div>
          <div><dt className="text-[0.65rem] font-bold uppercase text-slate-500">Started / ended</dt><dd>{fmtTime(job.startedAt)} / {fmtTime(job.finishedAt)}</dd></div>
          <div className="sm:col-span-3"><dt className="text-[0.65rem] font-bold uppercase text-slate-500">Justification</dt><dd>{job.justification || '—'}</dd></div>
        </dl>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-7">
          {([['Targets', c.total], ['Queued', c.queued], ['Waiting online', c.waitingOnline], ['Running / sent', c.running], ['Succeeded', c.succeeded], ['Failed', c.failed], ['Skipped', c.skipped + c.cancelled]] as const).map(([k, v]) => <div key={k} className="rounded-xl border border-slate-200 px-2 py-1.5 text-center"><div className="text-base font-bold text-slate-800">{v}</div><div className="text-[0.62rem] text-slate-500">{k}</div></div>)}
        </div>
        {genuineBar
          ? <div><div className="mb-0.5 flex justify-between text-[0.68rem] text-slate-500"><span>Progress reported by the scripts</span><span>{done}%</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuenow={done} aria-valuemin={0} aria-valuemax={100}><div className="h-full bg-sky-500" style={{ width: `${done}%` }} /></div></div>
          : (job.status === 'running' || job.status === 'queued') && <Notice tone="info">No percentage is shown: this provider does not report progress, so only real device states are displayed.</Notice>}
        {job.status === 'pending_approval' && (
          <Notice tone="warn"><div className="space-y-2"><p>This job is waiting for an approver. Nothing has been sent to any device.</p>
            {status.permissions.approve && !mine ? <div className="flex flex-wrap items-center gap-2"><input aria-label="Approval note" className={`${inputCls} max-w-xs`} placeholder="Note (optional)" value={note} onChange={e => setNote(e.target.value)} />
              <button type="button" className={btnPrimary} disabled={busy} onClick={() => onDecide('approve', note)}><Check className="h-3.5 w-3.5" />Approve</button><button type="button" className={btnOutline} disabled={busy} onClick={() => onDecide('reject', note)}><X className="h-3.5 w-3.5" />Reject</button></div>
              : <p className="font-bold">{mine ? 'You requested this job, so another approver must approve it.' : 'You do not have the Approver permission.'}</p>}</div></Notice>)}
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btnOutline} disabled={busy} onClick={onRefresh}><RefreshCw className="h-3.5 w-3.5" />Refresh status</button>
          <button type="button" className={btnOutline} onClick={() => { void remoteActionsApi.exportJob(job.id) }}><Download className="h-3.5 w-3.5" />Export results (CSV)</button>
          {status.permissions.execute && job.counts.failed > 0 && ['completed_with_failures', 'failed'].includes(job.status) && <button type="button" className={btnOutline} disabled={busy} onClick={onRetry}><RotateCcw className="h-3.5 w-3.5" />Retry failed devices only</button>}
          {status.permissions.execute && !['completed', 'completed_with_failures', 'failed', 'cancelled', 'rejected'].includes(job.status) && <button type="button" className={btnOutline} disabled={busy} onClick={onCancel}><Ban className="h-3.5 w-3.5" />Cancel</button>}
        </div>
        <div className="flex flex-wrap gap-2"><input aria-label="Search devices in this job" className={`${inputCls} max-w-xs`} placeholder="Search device" value={q} onChange={e => setQ(e.target.value)} />
          <select aria-label="Filter by device state" className={`${inputCls} max-w-[12rem]`} value={state} onChange={e => setState(e.target.value)}><option value="">All states</option>{['queued', 'waiting_online', 'sent', 'provider_accepted', 'running', 'succeeded', 'failed', 'timed_out', 'skipped', 'cancelled'].map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}</select>
          <select aria-label="Sort devices" className={`${inputCls} max-w-[9rem]`} value={sort} onChange={e => setSort(e.target.value as 'name' | 'state')}><option value="name">Sort: name</option><option value="state">Sort: state</option></select></div>
        <div className="max-h-80 overflow-auto rounded-xl border border-slate-200"><table className="w-full text-left"><thead className="sticky top-0 bg-slate-50 text-[0.65rem] uppercase text-slate-500"><tr><th className="px-3 py-1.5">Device</th><th className="px-3 py-1.5">State</th><th className="px-3 py-1.5">Provider says</th><th className="px-3 py-1.5">Script progress</th><th className="px-3 py-1.5">Updated</th></tr></thead>
          <tbody>{rows.map(d => <tr key={d.deviceId} className="cursor-pointer border-t border-slate-100 hover:bg-slate-50" onClick={() => setOpen(d)}><td className="px-3 py-1.5 font-medium">{d.deviceName}</td><td className="px-3 py-1.5"><DeviceBadge s={d.state} /></td><td className="px-3 py-1.5">{d.providerState ?? '—'}</td><td className="px-3 py-1.5">{d.progress ? `${d.progress.percent}% — ${d.progress.message}` : '—'}</td><td className="px-3 py-1.5">{fmtTime(d.updatedAt)}</td></tr>)}</tbody></table></div>
        {open && <div className="rounded-xl border border-slate-200 p-3"><div className="mb-1 flex items-center justify-between"><b>{open.deviceName}</b><button type="button" className="text-slate-500" onClick={() => setOpen(null)} aria-label="Close device details"><X className="h-3.5 w-3.5" /></button></div>
          <p>State: <DeviceBadge s={open.state} /> {open.exitCode !== undefined && open.exitCode !== null ? `· exit code ${open.exitCode}` : ''}</p>
          {open.error && <><h4 className="mt-2 font-bold text-red-700">Error</h4><Pre max="max-h-40">{open.error}</Pre></>}
          {open.output ? <><h4 className="mt-2 font-bold">Output</h4><Pre>{open.output}</Pre></> : <p className="mt-2 text-slate-500">The provider returned no script output for this device.</p>}</div>}
        {job.excluded.length > 0 && <details><summary className="cursor-pointer font-bold text-amber-800">{job.excluded.length} devices were excluded</summary><ul className="mt-1 list-disc pl-5">{job.excluded.map(x => <li key={x.device.id}>{x.device.name}: {x.reasons.join(' ')}</li>)}</ul></details>}
        {job.audit && <details><summary className="cursor-pointer font-bold text-slate-600">Audit trail</summary><ul className="mt-1 max-h-40 overflow-auto text-slate-600">{job.audit.map(a => <li key={`${a.at}${a.action}`}>{fmtTime(a.at)} · {a.actor} · {a.action}</li>)}</ul></details>}
      </div>
    </Card>
  )
}
