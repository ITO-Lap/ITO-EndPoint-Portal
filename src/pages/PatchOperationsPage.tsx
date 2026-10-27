import { useEffect, useMemo, useState } from 'react'
import { Activity, CheckCircle2, ChevronLeft, Download, Loader2, RefreshCw, ShieldAlert, ShieldCheck, TriangleAlert, Wrench } from 'lucide-react'
import { api, type EndpointHealthLevel, type EndpointHealthScore, type MissingPatch, type MissingPatchSeverity, type MissingPatchView, type PatchOperationsDashboard, type PatchRemediationAction } from '../api'
import { Modal } from '../components/ui/Modal'
import type { UserToolRole } from '../types'

const levelStyle: Record<EndpointHealthLevel, { label: string; color: string }> = {
  healthy: { label: 'Healthy', color: 'bg-emerald-100 text-emerald-700' },
  attention: { label: 'Attention', color: 'bg-amber-100 text-amber-700' },
  high_risk: { label: 'High risk', color: 'bg-orange-100 text-orange-700' },
  critical: { label: 'Critical', color: 'bg-red-100 text-red-700' },
}

const SEVERITY_STYLE: Record<MissingPatchSeverity, string> = {
  Critical: 'bg-red-50 text-red-700 border-red-200',
  Important: 'bg-orange-50 text-orange-700 border-orange-200',
  Moderate: 'bg-amber-50 text-amber-700 border-amber-200',
  Low: 'bg-slate-50 text-slate-600 border-slate-200',
  Unrated: 'bg-slate-50 text-slate-500 border-slate-200',
}

const PATCH_VIEW_TABS: { view: MissingPatchView; label: string }[] = [
  { view: 'critical', label: 'Critical' },
  { view: 'all', label: 'All missing' },
  { view: 'os', label: 'OS updates' },
  { view: 'app', label: 'App updates' },
]

function formatDate(value: string | null): string {
  if (!value) return 'Not reported'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

function scanStatusLabel(device: EndpointHealthScore): string {
  if (!device.lastSuccessfulScanTime) return 'Not scanned'
  const ageDays = (Date.now() - new Date(device.lastSuccessfulScanTime).getTime()) / 86_400_000
  return ageDays > 7 ? 'Stale (>7 days)' : 'Current'
}

function csvCell(v: string): string {
  return `"${v.replace(/"/g, '""')}"`
}

function endpointsToCsv(devices: EndpointHealthScore[]): string {
  const header = ['Device Name', 'Platform', 'OS', 'Health Score', 'Health Level', 'Last Successful Scan', 'Scan Status', 'Critical Missing Patches', 'Other Missing Patches']
  const rows = devices.map(d => [
    d.deviceName, d.platform, d.osName ?? '—', String(d.score), levelStyle[d.level].label,
    d.lastSuccessfulScanTime ? new Date(d.lastSuccessfulScanTime).toLocaleString() : 'Never',
    scanStatusLabel(d), String(d.criticalPatchCount), String(d.missingPatchCount),
  ])
  return [header, ...rows].map(r => r.map(csvCell).join(',')).join('\n')
}

function downloadEndpointsCsv(devices: EndpointHealthScore[]): void {
  const blob = new Blob(['﻿' + endpointsToCsv(devices)], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = Object.assign(document.createElement('a'), { href: url, download: `patch-operations-${new Date().toISOString().slice(0, 10)}.csv` })
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function PatchOperationsPage({ viewerRole, userEmail, onBack }: { viewerRole: UserToolRole; userEmail?: string; onBack: () => void }) {
  const [data, setData] = useState<PatchOperationsDashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<EndpointHealthScore | null>(null)
  const [action, setAction] = useState<PatchRemediationAction | null>(null)
  const [policyId, setPolicyId] = useState('')
  const [working, setWorking] = useState(false)
  const [patchDetail, setPatchDetail] = useState<EndpointHealthScore | null>(null)
  const [patchView, setPatchView] = useState<MissingPatchView>('all')
  const [patchState, setPatchState] = useState<
    { kind: 'loading' } | { kind: 'ready'; patches: MissingPatch[] } | { kind: 'empty' } | { kind: 'error'; message: string }
  >({ kind: 'loading' })

  const load = async (refresh = false) => {
    setLoading(true); setError(null)
    try { setData(await api.fetchPatchOperations(refresh)) }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to load patch operations.') }
    finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [])

  const critical = useMemo(() => data?.devices.filter(d => d.criticalPatchCount > 0) ?? [], [data])
  const admin = viewerRole === 'Global Admin' || viewerRole === 'IT Admin'

  const previewScan = async (device: EndpointHealthScore) => {
    setWorking(true); setError(null)
    try { setAction(await api.previewPatchRemediation({ type: 'scan', resourceIds: [device.resourceId] }, viewerRole, userEmail)) }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not prepare scan.') }
    finally { setWorking(false) }
  }
  const previewDeploy = async () => {
    if (!selected || !policyId.trim()) { setError('Enter an Endpoint Central deployment policy template ID before preparing a deployment.'); return }
    setWorking(true); setError(null)
    try {
      const details = await api.fetchMissingPatches(selected.detailResourceId, 'critical', true)
      const patchIds = details.patches.map(p => p.patchId).filter(Boolean)
      if (!patchIds.length) throw new Error('Endpoint Central did not report a currently missing critical patch for this device.')
      setAction(await api.previewPatchRemediation({ type: 'deploy', resourceIds: [selected.resourceId], patchIds, deploymentPolicyTemplateId: policyId.trim() }, viewerRole, userEmail))
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not prepare deployment.') }
    finally { setWorking(false) }
  }
  const confirm = async () => {
    if (!action) return
    setWorking(true); setError(null)
    try { setAction(await api.confirmPatchRemediation(action.id, viewerRole, userEmail)); await load(true) }
    catch (e) { setError(e instanceof Error ? e.message : 'Endpoint Central did not accept the remediation action.') }
    finally { setWorking(false) }
  }

  const loadPatchDetail = async (device: EndpointHealthScore, view: MissingPatchView) => {
    setPatchState({ kind: 'loading' })
    try {
      const res = await api.fetchMissingPatches(device.detailResourceId, view)
      if (res.status === 'ok') setPatchState(res.patches.length ? { kind: 'ready', patches: res.patches } : { kind: 'empty' })
      else setPatchState({ kind: 'error', message: res.status === 'not_configured' ? 'ManageEngine is not configured.' : res.status === 'scope_required' ? 'Patch Management access is not configured — the Endpoint Central API client needs the PatchMgmt.READ scope.' : 'Missing patch details could not be loaded.' })
    } catch (e) {
      setPatchState({ kind: 'error', message: e instanceof Error ? e.message : 'Missing patch details could not be loaded.' })
    }
  }
  const openPatchDetail = (device: EndpointHealthScore) => {
    setPatchDetail(device)
    setPatchView('all')
    void loadPatchDetail(device, 'all')
  }
  const selectPatchView = (view: MissingPatchView) => {
    if (!patchDetail || view === patchView) return
    setPatchView(view)
    void loadPatchDetail(patchDetail, view)
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <button type="button" onClick={onBack} className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800"><ChevronLeft className="h-3.5 w-3.5" /> Dashboard</button>
          <h1 className="text-xl font-bold text-slate-900">Patch Operations</h1>
          <p className="mt-1 text-sm text-slate-500">Endpoint Central client patch health, connector trust, and approval-gated remediation.</p>
        </div>
        <button type="button" onClick={() => void load(true)} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh data</button>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {selected && <section className="rounded-2xl border border-blue-200 bg-blue-50 p-4"><div className="flex items-start justify-between gap-3"><div><h2 className="flex items-center gap-2 font-bold text-blue-950"><Wrench className="h-4 w-4" /> Prepare remediation for {selected.deviceName}</h2><p className="mt-1 text-xs text-blue-800">Ocean will re-read currently missing critical patches, then create a confirmation request. No patch is deployed until you confirm it.</p></div><button type="button" onClick={() => setSelected(null)} className="text-xs font-semibold text-blue-700">Cancel</button></div><div className="mt-3 flex flex-wrap items-end gap-2"><label className="block text-xs font-semibold text-blue-900">Deployment policy template ID<input value={policyId} onChange={e => setPolicyId(e.target.value)} placeholder="Endpoint Central policy ID" className="mt-1 block w-56 rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm text-slate-800" /></label><button type="button" onClick={() => void previewDeploy()} disabled={working || !admin} className="rounded-lg bg-blue-700 px-3 py-2 text-xs font-bold text-white hover:bg-blue-800 disabled:opacity-50">{working ? 'Checking patches…' : 'Prepare deployment'}</button></div></section>}
      {action && <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4"><div className="flex items-start justify-between gap-3"><div><h2 className="flex items-center gap-2 font-bold text-amber-950"><TriangleAlert className="h-4 w-4" /> Confirmation required</h2><p className="mt-1 text-xs text-amber-900">{action.type === 'scan' ? `Run a Patch Manager scan on ${action.resourceIds.length} endpoint(s).` : `Deploy ${action.patchIds?.length ?? 0} selected patch(es) to ${action.resourceIds.length} endpoint(s) using policy ${action.deploymentPolicyTemplateId}.`}</p><p className="mt-1 text-[0.68rem] text-amber-700">Request expires {formatDate(action.expiresAt)} · audit ID {action.id}</p></div>{action.status === 'pending' ? <button type="button" onClick={() => void confirm()} disabled={working} className="rounded-lg bg-amber-600 px-3 py-2 text-xs font-bold text-white hover:bg-amber-700 disabled:opacity-50">{working ? 'Submitting…' : 'Confirm action'}</button> : <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-700">{action.status}</span>}</div></section>}
      {loading && !data ? <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading Endpoint Central patch health…</div> : data && <>
        <section className="grid gap-3 md:grid-cols-3">
          <div className={`rounded-2xl border p-4 ${data.connector.healthy ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}`}>
            <div className="flex items-center gap-2 text-sm font-bold text-slate-800">{data.connector.healthy ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <ShieldAlert className="h-4 w-4 text-red-600" />} Connector trust</div>
            <p className="mt-2 text-xs text-slate-600">{data.connector.message}</p>
            <p className="mt-2 text-[0.68rem] text-slate-500">{data.connector.latencyMs !== null ? `${data.connector.latencyMs} ms` : 'Not connected'} · refreshed {formatDate(data.connector.lastRefreshAt)}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-800"><Activity className="h-4 w-4 text-sky-600" /> Data coverage</div>
              <button type="button" disabled={!data.devices.length} onClick={() => downloadEndpointsCsv(data.devices)} title="Export all assessed endpoints as CSV" className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[0.65rem] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40"><Download className="h-3 w-3" /> Export</button>
            </div>
            <p className="mt-2 text-2xl font-bold text-slate-900">{data.coverage.assessed}<span className="text-sm font-medium text-slate-400"> / {data.coverage.clientOs}</span></p>
            <p className="mt-1 text-xs text-slate-500">assessed client endpoints · {data.coverage.unscanned} unscanned · {data.coverage.staleScans} stale scans</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-800"><ShieldCheck className="h-4 w-4 text-blue-600" /> Endpoint health score</div>
              <button type="button" disabled={!data.devices.length} onClick={() => downloadEndpointsCsv(data.devices)} title="Export all scored endpoints as CSV" className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[0.65rem] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40"><Download className="h-3 w-3" /> Export</button>
            </div>
            <p className="mt-2 text-2xl font-bold text-slate-900">{data.health.score ?? '—'}<span className="text-sm font-medium text-slate-400"> / 100</span></p>
            <p className="mt-1 text-xs text-slate-500">{data.health.critical} critical · {data.health.highRisk} high risk · {data.health.healthy} healthy</p>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
            <div><h2 className="font-bold text-slate-800">Critical remediation queue</h2><p className="text-xs text-slate-500">Windows client and macOS endpoints only. Servers are excluded.</p></div>
            <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700">{critical.length} with critical patches</span>
          </div>
          <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-xs"><thead className="bg-slate-50 text-slate-500"><tr><th className="px-4 py-2.5 font-semibold">Endpoint</th><th className="px-4 py-2.5 font-semibold">Health</th><th className="px-4 py-2.5 font-semibold">Missing patches</th><th className="px-4 py-2.5 font-semibold">Last successful scan</th><th className="px-4 py-2.5 font-semibold">Action</th></tr></thead><tbody className="divide-y divide-slate-100">
            {critical.map(device => <tr key={`${device.resourceId}-${device.detailResourceId}`} className="hover:bg-slate-50"><td className="px-4 py-3"><p className="font-semibold text-slate-800">{device.deviceName}</p><p className="text-slate-400">{device.platform} · {device.osName ?? 'OS not reported'}</p></td><td className="px-4 py-3"><span className={`rounded-full px-2 py-1 font-semibold ${levelStyle[device.level].color}`}>{device.score}/100 · {levelStyle[device.level].label}</span></td><td className="px-4 py-3"><button type="button" onClick={() => openPatchDetail(device)} title="View missing patch details" className="text-left text-red-700 hover:underline"><span className="font-semibold">{device.criticalPatchCount} critical</span><span className="text-slate-500"> · {device.missingPatchCount} total</span></button></td><td className="px-4 py-3 text-slate-600">{formatDate(device.lastSuccessfulScanTime)}</td><td className="px-4 py-3"><div className="flex gap-2"><button type="button" disabled={!admin || working} onClick={() => void previewScan(device)} className="rounded-lg border border-sky-200 px-2 py-1 font-semibold text-sky-700 hover:bg-sky-50 disabled:opacity-40">{working ? 'Preparing…' : 'Scan'}</button><button type="button" disabled={!admin || working} onClick={() => setSelected(device)} className="rounded-lg bg-blue-600 px-2 py-1 font-semibold text-white hover:bg-blue-700 disabled:opacity-40">Remediate</button></div></td></tr>)}
            {!critical.length && <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">No missing critical patches were reported by Endpoint Central in the latest scan.</td></tr>}
          </tbody></table></div>
        </section>
      </>}

      {patchDetail && (
        <Modal
          open
          title={`Missing patches — ${patchDetail.deviceName}`}
          description={`${patchDetail.platform} · ${patchDetail.osName ?? 'OS not reported'} · last successful scan ${formatDate(patchDetail.lastSuccessfulScanTime)}`}
          onClose={() => setPatchDetail(null)}
          size="lg"
        >
          <div role="tablist" aria-label="Missing patch filters" className="mb-3 flex flex-wrap gap-1">
            {PATCH_VIEW_TABS.map(t => (
              <button key={t.view} type="button" role="tab" aria-selected={patchView === t.view} onClick={() => selectPatchView(t.view)}
                className={`rounded-lg px-3 py-1 text-xs font-semibold ${patchView === t.view ? 'border border-orange-200 bg-orange-50 text-orange-700' : 'border border-transparent text-slate-500 hover:text-slate-700'}`}>
                {t.label}
              </button>
            ))}
          </div>
          {patchState.kind === 'loading' && <div className="space-y-2.5">{[0, 1, 2].map(i => <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-100" />)}</div>}
          {patchState.kind === 'error' && <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">{patchState.message}</p>}
          {patchState.kind === 'empty' && <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-xs text-slate-500">No missing patches reported for this filter.</p>}
          {patchState.kind === 'ready' && (
            <ul className="space-y-2.5">
              {patchState.patches.map(p => (
                <li key={p.patchId} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                  <div className="flex items-start gap-2">
                    <span className={`inline-flex flex-shrink-0 rounded-full border px-2 py-0.5 text-[0.62rem] font-bold ${SEVERITY_STYLE[p.severity]}`}>{p.severity}</span>
                    <p className="break-all text-xs font-bold text-slate-800">{p.name}</p>
                  </div>
                  {p.description && <p className="mt-1.5 text-xs leading-relaxed text-slate-500">{p.description}</p>}
                  <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[0.65rem] text-slate-500">
                    {p.kb && <span><span className="text-slate-400">KB:</span> {p.kb}</span>}
                    {p.vendor && <span><span className="text-slate-400">Vendor:</span> {p.vendor}</span>}
                    {p.category && <span>{p.category}</span>}
                    {p.releasedAt && <span><span className="text-slate-400">Released:</span> {formatDate(p.releasedAt)}</span>}
                    {p.approvalStatus && <span><span className="text-slate-400">Approval:</span> {p.approvalStatus}</span>}
                    {p.deploymentStatus && <span><span className="text-slate-400">Deployment:</span> {p.deploymentStatus}</span>}
                  </p>
                  {p.cves.length > 0 && <p className="mt-1.5 text-[0.65rem] text-slate-500"><span className="text-slate-400">CVEs:</span> {p.cves.join(', ')}</p>}
                </li>
              ))}
            </ul>
          )}
        </Modal>
      )}

    </div>
  )
}
