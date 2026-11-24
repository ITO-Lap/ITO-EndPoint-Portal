import { useCallback, useEffect, useState } from 'react'
import { AlertOctagon, ArrowLeft, CheckCircle2, Clock, Play, RefreshCw, TerminalSquare } from 'lucide-react'
import { remoteActionsApi, type Dashboard, type Policy, type RaStatus, type ScriptSummary } from '../api/remoteActions'
import { hasPermission } from '../lib/permissions'
import { usePermissions } from '../context/permissionsHooks'
import { Card, Empty, ErrorBanner, JobBadge, Loading, Notice, RiskBadge } from '../components/remoteActions/shared'
import { btnDanger, btnOutline, btnPrimary, errMsg, fmtTime, inputCls, labelCls } from '../components/remoteActions/helpers'
import { ScriptWizard } from '../components/remoteActions/ScriptWizard'
import { LibraryTab } from '../components/remoteActions/LibraryTab'
import { JobsTab } from '../components/remoteActions/JobsTab'
import { GraphRunnerTab } from '../components/remoteActions/GraphRunnerTab'

type Tab = 'overview' | 'run' | 'library' | 'jobs' | 'approvals' | 'graph' | 'settings'

export function RemoteActionCenterPage({ onBack, viewerRole }: { onBack: () => void; viewerRole?: string }) {
  const permissions = usePermissions()
  const allowed = hasPermission(viewerRole ?? '', permissions, 'pages.Remote Action Center')
  const [tab, setTab] = useState<Tab>('overview')
  const [status, setStatus] = useState<RaStatus | null>(null); const [dash, setDash] = useState<Dashboard | null>(null); const [scripts, setScripts] = useState<ScriptSummary[]>([])
  const [err, setErr] = useState<string | null>(null); const [tick, setTick] = useState(0); const [openJob, setOpenJob] = useState<string | null>(null); const [runScriptId, setRunScriptId] = useState<string | null>(null)

  const load = useCallback((alive: () => boolean = () => true) =>
    Promise.all([remoteActionsApi.status(), remoteActionsApi.dashboard(), remoteActionsApi.scripts()])
      .then(([s, d, sc]) => { if (alive()) { setStatus(s); setDash(d); setScripts(sc); setErr(null) } })
      .catch(e => { if (alive()) setErr(errMsg(e)) }), [])
  useEffect(() => {
    if (!allowed) return
    let live = true
    void load(() => live)
    // Light background refresh keeps active jobs and approvals current without a manual reload.
    const t = window.setInterval(() => { void load(() => live) }, 30_000)
    return () => { live = false; window.clearInterval(t) }
  }, [allowed, load, tick])

  if (!allowed) return <div className="p-6"><div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">You do not have permission to view Remote Action Center.</div></div>

  const refresh = () => setTick(t => t + 1)
  const pendingCount = (dash?.pendingApprovals.scripts.length ?? 0) + (dash?.pendingApprovals.jobs.length ?? 0)
  const tabs: Array<[Tab, string]> = [['overview', 'Overview'], ['run', 'Run Script'], ['library', 'Script Library'], ['jobs', 'Jobs'], ['approvals', `Pending Approvals${pendingCount ? ` (${pendingCount})` : ''}`], ['graph', 'Graph API Runner'], ...(status?.permissions.admin ? [['settings', 'Settings'] as [Tab, string]] : [])]

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={onBack} className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Back to dashboard"><ArrowLeft className="h-4 w-4" /></button>
        <div><h1 className="flex items-center gap-2 text-lg font-bold text-slate-900"><TerminalSquare className="h-5 w-5" />Remote Action Center</h1>
          <p className="text-xs text-slate-500">Secure script execution and endpoint automation</p></div>
        <div className="ml-auto flex flex-wrap gap-2">
          {status?.permissions.execute && <button type="button" className={btnPrimary} onClick={() => { setRunScriptId(null); setTab('run') }}><Play className="h-3.5 w-3.5" />Run Script</button>}
          <button type="button" className={btnOutline} onClick={refresh} aria-label="Refresh"><RefreshCw className="h-3.5 w-3.5" />Refresh</button>
        </div>
      </div>

      <ErrorBanner message={err} />
      {!status && !err && <Loading />}
      {status?.policy.executionPaused && <Notice tone="danger"><b>Emergency stop is active.</b> No new job can be created or sent until a Super Admin resumes execution.</Notice>}

      {status && (
        <>
          <div role="tablist" aria-label="Remote Action Center sections" className="flex flex-wrap gap-1.5 border-b border-slate-200 pb-2">
            {tabs.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} type="button" onClick={() => setTab(k)} className={`rounded-full px-3 py-1.5 text-xs font-bold ${tab === k ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{l}</button>)}
          </div>

          {tab === 'overview' && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Stat label="Active jobs" value={String(dash?.activeJobs.length ?? 0)} icon={<Play className="h-4 w-4" />} />
                <Stat label="Pending approvals" value={String(pendingCount)} icon={<Clock className="h-4 w-4" />} />
                <Stat label="Waiting to run when online" value={String(dash?.waitingForOnline ?? 0)} icon={<Clock className="h-4 w-4" />} />
                <Stat label="Success rate (30 days)" value={dash?.successRate30d == null ? '—' : `${dash.successRate30d}%`} sub={dash && dash.attemptedDevices30d ? `${dash.attemptedDevices30d} device runs` : 'no runs yet'} icon={<CheckCircle2 className="h-4 w-4" />} />
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <Card title="Active jobs">{!dash?.activeJobs.length ? <Empty>No active jobs.</Empty> : <ul className="space-y-1.5">{dash.activeJobs.map(j => <li key={j.id}><button type="button" className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-left text-xs hover:bg-slate-50" onClick={() => { setOpenJob(j.id); setTab('jobs') }}><span><b>{j.scriptName}</b> · {j.counts.total} devices</span><JobBadge s={j.status} /></button></li>)}</ul>}</Card>
                <Card title="Recent failures">{!dash?.recentFailures.length ? <Empty>No recent failures.</Empty> : <ul className="space-y-1.5">{dash.recentFailures.map(j => <li key={j.id}><button type="button" className="flex w-full items-center justify-between gap-2 rounded-lg border border-red-100 px-3 py-2 text-left text-xs hover:bg-red-50" onClick={() => { setOpenJob(j.id); setTab('jobs') }}><span><b>{j.scriptName}</b> · {j.counts.failed}/{j.counts.total} failed · {fmtTime(j.finishedAt)}</span><JobBadge s={j.status} /></button></li>)}</ul>}</Card>
              </div>
              <Card title="Execution providers">
                <ul className="space-y-1.5 text-xs">
                  {status.providers.map(p => (
                    <li key={p.id} className="flex flex-wrap items-baseline gap-x-2"><span className={`rounded-full px-2 py-0.5 text-[0.65rem] font-bold ${p.enabled ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}`}>{p.enabled ? 'Available' : 'Unavailable'}</span><b>{p.label}</b>
                      {!p.enabled && <span className="text-amber-800">{p.reasons[0]}</span>}</li>))}
                </ul>
                {!status.encryptionAtRest && <div className="mt-2"><Notice tone="warn">Script bodies are stored unencrypted. Set REMOTE_ACTIONS_ENCRYPTION_KEY on the server to encrypt them at rest.</Notice></div>}
              </Card>
              <Card title="Script Library (recent)" action={<button type="button" className={btnOutline} onClick={() => setTab('library')}>Open library</button>}>
                {scripts.length === 0 ? <Empty>No scripts yet. Use “Run Script” to create one.</Empty> : <ul className="grid gap-1.5 sm:grid-cols-2">{scripts.filter(s => !s.archived && true).slice(-6).reverse().map(s => <li key={s.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs"><span className="truncate"><b>{s.name}</b> <span className="text-slate-500">v{s.version} · {s.platform}</span></span><RiskBadge risk={s.risk} /></li>)}</ul>}
              </Card>
            </div>
          )}

          {tab === 'run' && <ScriptWizard key={runScriptId ?? 'new'} status={status} scripts={scripts} initialScriptId={runScriptId} onDone={refresh} onJobCreated={id => { setOpenJob(id); setTab('jobs'); refresh() }} />}
          {tab === 'library' && <LibraryTab status={status} scripts={scripts} onChanged={refresh} onRun={id => { setRunScriptId(id); setTab('run') }} />}
          {tab === 'jobs' && <JobsTab status={status} openJobId={openJob} onOpened={() => setOpenJob(null)} refreshSignal={tick} />}
          {tab === 'approvals' && <Approvals dash={dash} status={status} onOpenJob={id => { setOpenJob(id); setTab('jobs') }} onOpenScript={() => setTab('library')} onGraph={() => setTab('graph')} />}
          {tab === 'graph' && <GraphRunnerTab status={status} refreshSignal={tick} onChanged={refresh} />}
          {tab === 'settings' && status.permissions.admin && <AdminSettings policy={status.policy} onChanged={refresh} />}
        </>
      )}
    </div>
  )
}

function Stat({ label, value, sub, icon }: { label: string; value: string; sub?: string; icon: React.ReactNode }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-4"><div className="flex items-center justify-between text-slate-400">{icon}</div><div className="mt-1 text-2xl font-bold text-slate-900">{value}</div><div className="text-xs text-slate-500">{label}</div>{sub && <div className="text-[0.68rem] text-slate-400">{sub}</div>}</div>
}

function Approvals({ dash, status, onOpenJob, onOpenScript, onGraph }: { dash: Dashboard | null; status: RaStatus; onOpenJob: (id: string) => void; onOpenScript: () => void; onGraph: () => void }) {
  if (!dash) return <Loading />
  return (
    <div className="space-y-4">
      {!status.permissions.approve && <Notice tone="info">You can see what is waiting, but approving requires the Approver permission.</Notice>}
      <Card title="Scripts awaiting approval">{dash.pendingApprovals.scripts.length === 0 ? <Empty>Nothing waiting.</Empty> : <ul className="space-y-1.5">{dash.pendingApprovals.scripts.map(s => <li key={s.id}><button type="button" onClick={onOpenScript} className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-left text-xs hover:bg-slate-50"><span><b>{s.name}</b> v{s.version} · by {s.createdBy}</span><RiskBadge risk={s.risk} /></button></li>)}</ul>}</Card>
      <Card title="Jobs awaiting approval">{dash.pendingApprovals.jobs.length === 0 ? <Empty>Nothing waiting.</Empty> : <ul className="space-y-1.5">{dash.pendingApprovals.jobs.map(j => <li key={j.id}><button type="button" onClick={() => onOpenJob(j.id)} className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-left text-xs hover:bg-slate-50"><span><b>{j.scriptName}</b> · {j.counts.total} devices · by {j.requestedBy}</span><RiskBadge risk={j.risk} /></button></li>)}</ul>}</Card>
      <Card title="Graph API requests awaiting approval"><p className="text-xs text-slate-600">Destructive and bulk Graph requests wait in <button type="button" className="font-bold text-sky-700 underline" onClick={onGraph}>Graph API Runner → Graph API History</button> (filter: Pending approval).</p></Card>
    </div>
  )
}

function AdminSettings({ policy, onChanged }: { policy: Policy; onChanged: () => void }) {
  const [p, setP] = useState(policy); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false); const [saved, setSaved] = useState(false)
  const num = (k: keyof Omit<Policy, 'executionPaused'>, label: string) => <div key={k}><label className={labelCls} htmlFor={`p-${k}`}>{label}</label><input id={`p-${k}`} type="number" className={inputCls} value={p[k]} onChange={e => { setP({ ...p, [k]: Number(e.target.value) }); setSaved(false) }} /></div>
  const run = async (fn: () => Promise<unknown>) => { setBusy(true); setErr(null); try { await fn(); setSaved(true); onChanged() } catch (e) { setErr(errMsg(e)) } finally { setBusy(false) } }
  return (
    <div className="space-y-4">
      <ErrorBanner message={err} />
      <Card title="Emergency execution control">
        <p className="mb-2 text-xs text-slate-600">Immediately stops new jobs from being created or sent. Jobs already sent to a provider continue on devices.</p>
        <button type="button" className={policy.executionPaused ? btnPrimary : btnDanger} disabled={busy} onClick={() => { void run(() => remoteActionsApi.emergencyStop(!policy.executionPaused)) }}><AlertOctagon className="h-3.5 w-3.5" />{policy.executionPaused ? 'Resume execution' : 'Emergency stop — pause all execution'}</button>
      </Card>
      <Card title="Execution limits">
        <div className="grid gap-2 sm:grid-cols-3">{num('maxDevicesPerJob', 'Max devices per job')}{num('pilotMaxDevices', 'Max devices in a pilot')}{num('mediumRiskApprovalAbove', 'Medium risk needs job approval above (devices)')}{num('maxConcurrentJobs', 'Max concurrent jobs')}{num('maxJobsPerUserPerHour', 'Max jobs per user per hour')}{num('maxCheckInAgeHours', 'Device must have checked in within (hours)')}</div>
        <div className="mt-3 flex items-center gap-2"><button type="button" className={btnPrimary} disabled={busy} onClick={() => { const { executionPaused: _e, ...rest } = p; void _e; void run(() => remoteActionsApi.setPolicy(rest)) }}>Save limits</button>{saved && <span className="text-xs text-emerald-700">Saved.</span>}</div>
      </Card>
    </div>
  )
}
