import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Bot, ChevronRight, Copy, Download, Play, RefreshCw, Save, Send } from 'lucide-react'
import { remoteActionsApi, type GraphRecord, type GraphRequestInput, type GraphTemplate, type GraphValidation, type RaStatus } from '../../api/remoteActions'
import { Card, Empty, ErrorBanner, GraphClassBadge, Loading, Notice, Pre } from './shared'
import { btnDanger, btnOutline, btnPrimary, errMsg, fmtTime, inputCls, labelCls } from './helpers'

const PRIMARY_KEYS = ['$filter', '$select'] as const
const MORE_KEYS = ['$expand', '$top', '$orderby'] as const
const BLANK: GraphRequestInput = { name: '', description: '', justification: '', version: 'v1.0', method: 'GET', endpoint: '', query: {} }

/** Flattens a Graph list result for the table view. Values are rendered as text only. */
function rowsOf(output: unknown): Array<Record<string, unknown>> | null {
  const list = output && typeof output === 'object' && Array.isArray((output as { value?: unknown }).value) ? (output as { value: unknown[] }).value : null
  const objs = list?.filter((r): r is Record<string, unknown> => !!r && typeof r === 'object' && !Array.isArray(r))
  return objs && objs.length ? objs : null
}
const cell = (v: unknown): string => v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)

export function GraphRunnerTab({ status, refreshSignal, onChanged }: { status: RaStatus; refreshSignal: number; onChanged: () => void }) {
  const [view, setView] = useState<'run' | 'history'>('run')
  return (
    <div className="space-y-3">
      <div className="flex gap-1.5" role="tablist" aria-label="Graph API Runner views">
        {([['run', 'Run a request'], ['history', 'Graph API History']] as const).map(([k, l]) => <button key={k} role="tab" aria-selected={view === k} type="button" onClick={() => setView(k)} className={`rounded-full px-3 py-1 text-xs font-bold ${view === k ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-600'}`}>{l}</button>)}
      </div>
      <Notice tone="info">Authenticated Microsoft Graph requests only, sent from the server. This is not a shell: endpoint PowerShell/Shell scripts are run from the Scripts flow. Only the configured Graph endpoint can be called, and tokens never reach your browser.</Notice>
      {view === 'run' ? <RunPanel status={status} onChanged={onChanged} /> : <HistoryPanel status={status} refreshSignal={refreshSignal} onChanged={onChanged} />}
    </div>
  )
}

function RunPanel({ status, onChanged }: { status: RaStatus; onChanged: () => void }) {
  const [form, setForm] = useState<GraphRequestInput>(BLANK); const [bodyText, setBodyText] = useState('')
  const [templates, setTemplates] = useState<{ builtin: GraphTemplate[]; saved: GraphTemplate[] } | null>(null)
  const [v, setV] = useState<GraphValidation | null>(null); const [confirming, setConfirming] = useState(false); const [ack, setAck] = useState(false)
  const [rec, setRec] = useState<GraphRecord | null>(null); const [msg, setMsg] = useState<string | null>(null); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false)
  const [aiText, setAiText] = useState(''); const [aiOut, setAiOut] = useState<string | null>(null); const [allPages, setAllPages] = useState(false)
  const hasBody = ['POST', 'PATCH', 'PUT'].includes(form.method)
  const canSend = form.method === 'GET' ? status.permissions.graphRun : status.permissions.graphChange

  useEffect(() => { void remoteActionsApi.graph.templates().then(setTemplates).catch(e => setErr(errMsg(e))) }, [])

  const set = (patch: Partial<GraphRequestInput>) => { setForm(f => ({ ...f, ...patch })); setV(null); setConfirming(false); setAck(false) }
  const setQuery = (k: string, val: string) => set({ query: { ...form.query, [k]: val } })
  const parsedBody = (): { ok: true; value?: unknown } | { ok: false } => { if (!hasBody || !bodyText.trim()) return { ok: true }; try { return { ok: true, value: JSON.parse(bodyText) } } catch { return { ok: false } } }

  function loadTemplate(t: GraphTemplate) {
    setForm({ ...BLANK, name: t.name, description: t.description, version: t.version, method: t.method, endpoint: t.endpoint, query: { ...t.query } }); setBodyText(t.body ? JSON.stringify(t.body, null, 2) : ''); setV(null); setRec(null); setMsg(null)
    if (t.placeholders?.length) setMsg(`Replace ${t.placeholders.join(', ')} in the endpoint or query before running.`)
  }

  async function validate() {
    const b = parsedBody(); if (!b.ok) { setErr('The request body is not valid JSON.'); return }
    setBusy(true); setErr(null)
    try { setV(await remoteActionsApi.graph.validate({ version: form.version, method: form.method, endpoint: form.endpoint, query: form.query, ...(b.value !== undefined ? { body: b.value } : {}) })) } catch (e) { setErr(errMsg(e)) } finally { setBusy(false) }
  }

  async function send(confirmed: boolean) {
    const b = parsedBody(); if (!b.ok) { setErr('The request body is not valid JSON.'); return }
    setBusy(true); setErr(null); setMsg(null)
    try {
      const r = await remoteActionsApi.graph.submit({ ...form, ...(b.value !== undefined ? { body: b.value } : {}), confirmed, allPages: allPages && form.method === 'GET' })
      setRec(r.record); setConfirming(false); setAck(false); onChanged()
      if (r.approvalRequired) setMsg('This request needs approval from an approver before anything is sent. It is waiting in Graph API History.')
    } catch (e) { setErr(errMsg(e)) } finally { setBusy(false) }
  }

  async function ask(task: 'draft' | 'explain_endpoint' | 'suggest_params') {
    setBusy(true); setErr(null)
    try {
      const r = await remoteActionsApi.graph.assistant({ task, text: aiText, endpoint: form.endpoint, method: form.method, version: form.version })
      setAiOut(r.text)
      if (r.draft) { setForm({ ...BLANK, name: r.draft.name, version: r.draft.version, method: r.draft.method as GraphRequestInput['method'], endpoint: r.draft.endpoint, query: r.draft.query }); setV(null); setMsg(`AI draft loaded (${r.draft.validation.classification.replace('_', ' ')}). Review and validate it — it has not been sent.`) }
    } catch (e) { setErr(errMsg(e)) } finally { setBusy(false) }
  }

  const needsJust = v?.requiresJustification && (form.justification ?? '').trim().length < 10
  const ready = Boolean(v?.ok && v.permissions.ok && !needsJust && form.name.trim())

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="space-y-3">
        <Card title="Templates">
          {!templates ? <Loading /> : (
            <div className="flex flex-wrap gap-1.5">{[...templates.builtin, ...templates.saved].map(t => <button key={t.id} type="button" title={t.description} onClick={() => loadTemplate(t)} className="rounded-full border border-slate-300 px-2.5 py-1 text-[0.68rem] font-bold text-slate-700 hover:bg-slate-50">{t.name}</button>)}</div>)}
        </Card>
        <Card title="Request builder">
          <ErrorBanner message={err} onClose={() => setErr(null)} />
          {msg && <div className="mb-2"><Notice tone="info">{msg}</Notice></div>}
          <div className="space-y-2">
            <div className="grid gap-2 sm:grid-cols-2">
              <div><label className={labelCls} htmlFor="g-name">Request name</label><input id="g-name" className={inputCls} value={form.name} onChange={e => set({ name: e.target.value })} /></div>
              <div><label className={labelCls} htmlFor="g-ver">Graph version</label><select id="g-ver" className={inputCls} value={form.version} onChange={e => set({ version: e.target.value as 'v1.0' | 'beta' })}><option value="v1.0">v1.0</option><option value="beta">beta</option></select></div>
            </div>
            {form.version === 'beta' && <Notice tone="warn"><b>Beta API.</b> Not supported for production use; behaviour can change without notice.</Notice>}
            <div className="grid gap-2 sm:grid-cols-[8rem_1fr]">
              <div><label className={labelCls} htmlFor="g-method">Method</label><select id="g-method" className={inputCls} value={form.method} onChange={e => set({ method: e.target.value as GraphRequestInput['method'] })}>{['GET', 'POST', 'PATCH', 'PUT', 'DELETE'].map(m => <option key={m}>{m}</option>)}</select></div>
              <div><label className={labelCls} htmlFor="g-ep">Endpoint</label><input id="g-ep" className={`${inputCls} font-mono`} placeholder="/deviceManagement/managedDevices" value={form.endpoint} onChange={e => set({ endpoint: e.target.value })} /></div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">{(PRIMARY_KEYS).map(k => <div key={k}><label className={labelCls} htmlFor={`g-${k}`}>{k}</label><input id={`g-${k}`} className={`${inputCls} font-mono`} value={form.query[k] ?? ''} onChange={e => setQuery(k, e.target.value)} /></div>)}</div>
            <details><summary className="cursor-pointer text-xs font-bold text-slate-600">More query options and description</summary><div className="mt-2 grid gap-2 sm:grid-cols-2">{(MORE_KEYS).map(k => <div key={k}><label className={labelCls} htmlFor={`g-${k}`}>{k}</label><input id={`g-${k}`} className={`${inputCls} font-mono`} value={form.query[k] ?? ''} onChange={e => setQuery(k, e.target.value)} /></div>)}<div className="sm:col-span-2"><div><label className={labelCls} htmlFor="g-desc">Description</label><input id="g-desc" className={inputCls} value={form.description ?? ''} onChange={e => set({ description: e.target.value })} /></div></div></div></details>
            {hasBody && <div><label className={labelCls} htmlFor="g-body">JSON request body</label><textarea id="g-body" spellCheck={false} rows={6} className="w-full rounded-lg border border-slate-300 bg-slate-50 p-2 font-mono text-[0.72rem]" value={bodyText} onChange={e => { setBodyText(e.target.value); setV(null) }} /></div>}
            <div><label className={labelCls} htmlFor="g-just">Business justification{form.method !== 'GET' ? ' (required for changes)' : ''}</label><textarea id="g-just" rows={2} className="w-full rounded-lg border border-slate-300 p-2 text-xs" value={form.justification ?? ''} onChange={e => set({ justification: e.target.value })} /></div>
            {form.method === 'GET' && <label className="flex items-center gap-1.5 text-xs text-slate-600"><input type="checkbox" checked={allPages} onChange={e => setAllPages(e.target.checked)} />Fetch all pages (up to 10 pages / 5,000 rows)</label>}
            <div className="flex flex-wrap gap-2">
              <button type="button" className={btnOutline} disabled={busy || !form.endpoint.trim()} onClick={() => { void validate() }}>Validate</button>
              <button type="button" className={btnPrimary} disabled={busy || !ready || !canSend} onClick={() => { if (v?.requiresConfirmation) setConfirming(true); else void send(false) }}><Send className="h-3.5 w-3.5" />{v?.requiresApproval ? 'Request approval' : 'Review and send'}</button>
              <button type="button" className={btnOutline} disabled={!v?.ok || !form.name.trim()} onClick={() => { const b = parsedBody(); if (b.ok) void remoteActionsApi.graph.saveTemplate({ name: form.name, description: form.description ?? '', version: form.version, method: form.method, endpoint: form.endpoint, query: form.query, ...(b.value !== undefined ? { body: b.value } : {}) }).then(() => { setMsg('Template saved.'); return remoteActionsApi.graph.templates().then(setTemplates) }).catch(e => setErr(errMsg(e))) }}><Save className="h-3.5 w-3.5" />Save as template</button>
            </div>
            {!canSend && <Notice tone="warn">Your role cannot {form.method === 'GET' ? 'run' : 'submit change'} requests.</Notice>}
          </div>
        </Card>
        <Card title="Graph Assistant" action={<Bot className="h-4 w-4 text-slate-400" />}>
          <details><summary className="cursor-pointer text-xs font-bold text-slate-600">Draft or explain a request with AI (never sends anything)</summary><div className="mt-2 space-y-2">
            <input className={inputCls} aria-label="Describe what you need from Graph" placeholder="e.g. list non-compliant Mac devices that have not synced in 7 days" value={aiText} onChange={e => setAiText(e.target.value)} />
            <div className="flex flex-wrap gap-2"><button type="button" className={btnPrimary} disabled={busy || !aiText.trim()} onClick={() => { void ask('draft') }}>Draft request</button>
              <button type="button" className={btnOutline} disabled={busy || !form.endpoint.trim()} onClick={() => { void ask('explain_endpoint') }}>Explain endpoint & minimum permission</button>
              <button type="button" className={btnOutline} disabled={busy || !aiText.trim()} onClick={() => { void ask('suggest_params') }}>Suggest $select / $filter</button></div>
            {aiOut && <Pre max="max-h-48">{aiOut}</Pre>}</div></details>
        </Card>
      </div>

      <div className="space-y-3">
        {v && (
          <Card title="Validation">
            <div className="space-y-2 text-xs">
              <div className="flex flex-wrap items-center gap-2"><GraphClassBadge c={v.classification} />{v.family && <span className="text-slate-500">{v.family}</span>}</div>
              {v.errors.map(e => <Notice key={e} tone="danger">{e}</Notice>)}
              {v.reasons.map(e => <Notice key={e} tone={v.classification === 'blocked' ? 'danger' : 'warn'}>{e}</Notice>)}
              {v.warnings.map(e => <Notice key={e} tone="warn">{e}</Notice>)}
              {v.request && <p className="break-all font-mono text-[0.68rem] text-slate-600">{v.request.method} {v.request.url}</p>}
              {v.requiredPermissions.length > 0 && <p>Minimum Graph permission: <b className="font-mono">{v.minimumPermissions.join(', ')}</b></p>}
              {v.ok && (v.permissions.ok ? <Notice tone="ok">The app registration has the required permission.</Notice> : <Notice tone="danger">{v.permissions.note ?? `Missing Graph permission${v.permissions.missing.length === 1 ? '' : 's'}: ${v.permissions.missing.map(o => o.join(' or ')).join('; ')}. The request would fail, so it will not be sent.`}</Notice>)}
              {v.ok && <p className="text-slate-600">{v.expectedImpact}</p>}
            </div>
          </Card>
        )}
        {confirming && v?.request && (
          <Card title="Confirm before sending">
            <div className="space-y-2 text-xs">
              <Notice tone={v.requiresApproval ? 'danger' : 'warn'}><b>{v.requiresApproval ? 'Destructive / high-impact request.' : 'This request changes data.'}</b> {v.expectedImpact}</Notice>
              <dl className="grid gap-1 sm:grid-cols-[7rem_1fr]"><dt className="font-bold">Tenant</dt><dd className="break-all font-mono">{v.tenant?.tenantId ?? 'not configured'}</dd><dt className="font-bold">Method</dt><dd>{v.request.method}</dd><dt className="font-bold">Endpoint</dt><dd className="break-all font-mono">{v.request.url}</dd></dl>
              {v.request.body !== undefined && <><h4 className="font-bold">Request body (sensitive values masked)</h4><Pre max="max-h-48">{JSON.stringify(v.request.body, null, 2)}</Pre></>}
              {v.requiresApproval && <Notice tone="warn">Nothing is sent now. An approver must approve this request first.</Notice>}
              <label className="flex items-start gap-1.5"><input type="checkbox" className="mt-0.5" checked={ack} onChange={e => setAck(e.target.checked)} />I have reviewed the tenant, method, endpoint, body and impact.</label>
              <div className="flex gap-2"><button type="button" className={btnOutline} onClick={() => setConfirming(false)}>Cancel</button>
                <button type="button" className={v.requiresApproval ? btnDanger : btnPrimary} disabled={!ack || busy} onClick={() => { void send(true) }}><Play className="h-3.5 w-3.5" />{v.requiresApproval ? 'Submit for approval' : 'Send request'}</button></div>
            </div>
          </Card>
        )}
        {rec && <ResultView rec={rec} onUpdate={r => { setRec(r); onChanged() }} onError={setErr} />}
        {!v && !rec && <Empty>Pick a template or build a request, then validate it. Results appear here.</Empty>}
      </div>
    </div>
  )
}

export function ResultView({ rec, onUpdate, onError }: { rec: GraphRecord; onUpdate: (r: GraphRecord) => void; onError: (m: string) => void }) {
  const [tab, setTab] = useState<'json' | 'table'>('table'); const [busy, setBusy] = useState(false); const [copied, setCopied] = useState(false); const [explain, setExplain] = useState<string | null>(null)
  const rows = useMemo(() => rowsOf(rec.output), [rec.output])
  const cols = useMemo(() => { const c: string[] = []; for (const r of rows ?? []) for (const k of Object.keys(r)) if (!c.includes(k) && !k.startsWith('@odata')) c.push(k); return c.slice(0, 12) }, [rows])
  const ok = rec.status === 'executed'
  const run = async (fn: () => Promise<GraphRecord | void>) => { setBusy(true); try { const r = await fn(); if (r) onUpdate(r) } catch (e) { onError(errMsg(e)) } finally { setBusy(false) } }

  return (
    <Card title={rec.name} action={<GraphClassBadge c={rec.classification} />}>
      <div className="space-y-3 text-xs">
        <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-3">
          {([['Request ID', rec.id.slice(0, 8)], ['Time', fmtTime(rec.executedAt ?? rec.requestedAt)], ['Requestor', rec.requestedBy], ['Method', rec.method], ['Endpoint', rec.endpoint], ['HTTP status', rec.httpStatus ?? '—'], ['State', rec.status.replace('_', ' ')], ['Duration', rec.durationMs !== undefined ? `${rec.durationMs} ms` : '—'], ['Correlation ID', rec.correlationId ?? '—']] as const).map(([k, val]) => <div key={k}><dt className="text-[0.62rem] font-bold uppercase text-slate-500">{k}</dt><dd className="break-all">{val}</dd></div>)}
        </dl>
        {rec.status === 'pending_approval' && <Notice tone="warn">Waiting for an approver. Nothing has been sent.</Notice>}
        {rec.status === 'rejected' && <Notice tone="danger">Rejected{rec.approver ? ` by ${rec.approver}` : ''}. Nothing was sent.</Notice>}
        {rec.status === 'failed' && (
          <Notice tone="danger"><p>{rec.resultSummary}</p>{rec.retryAfterSeconds ? <p className="mt-1 font-bold">Retry after {rec.retryAfterSeconds} seconds.</p> : null}
            <button type="button" className="mt-1 font-bold underline" onClick={() => { void remoteActionsApi.graph.assistant({ task: 'explain_error', status: rec.httpStatus ?? 0, endpoint: rec.endpoint, method: rec.method, version: rec.version, recordId: rec.id }).then(r => setExplain(r.text)).catch(e => onError(errMsg(e))) }}>Explain this error</button>{explain && <p className="mt-1">{explain}</p>}</Notice>)}
        {ok && <p className="text-slate-600">{rec.resultSummary}{rec.outputTruncated ? ' — output was truncated for storage.' : ''}</p>}
        {rec.output !== undefined && (
          <>
            <div className="flex gap-1.5">{rows && <button type="button" onClick={() => setTab('table')} className={`rounded-full px-3 py-1 font-bold ${tab === 'table' ? 'bg-sky-600 text-white' : 'bg-slate-100'}`}>Table</button>}<button type="button" onClick={() => setTab('json')} className={`rounded-full px-3 py-1 font-bold ${tab === 'json' || !rows ? 'bg-sky-600 text-white' : 'bg-slate-100'}`}>JSON</button></div>
            {rows && tab === 'table' ? (
              <div className="max-h-80 overflow-auto rounded-xl border border-slate-200"><table className="w-full text-left"><thead className="sticky top-0 bg-slate-50 text-[0.65rem] uppercase text-slate-500"><tr>{cols.map(c => <th key={c} className="px-2 py-1.5">{c}</th>)}</tr></thead>
                <tbody>{rows.map((r, i) => <tr key={i} className="border-t border-slate-100">{cols.map(c => <td key={c} className="max-w-[16rem] truncate px-2 py-1" title={cell(r[c])}>{cell(r[c])}</td>)}</tr>)}</tbody></table></div>
            ) : <Pre max="max-h-80">{JSON.stringify(rec.output, null, 2)}</Pre>}
          </>
        )}
        <div className="flex flex-wrap gap-2">
          {rec.output !== undefined && <button type="button" className={btnOutline} onClick={() => { void navigator.clipboard.writeText(JSON.stringify(rec.output, null, 2)).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1500) }).catch(() => undefined) }}><Copy className="h-3.5 w-3.5" />{copied ? 'Copied' : 'Copy output'}</button>}
          {rec.status === 'executed' || rec.status === 'failed' ? <>
            <button type="button" className={btnOutline} disabled={busy} onClick={() => { void run(() => remoteActionsApi.graph.download(rec.id, 'json').then(() => remoteActionsApi.graph.record(rec.id))) }}><Download className="h-3.5 w-3.5" />Raw .json</button>
            {rows && <button type="button" className={btnOutline} disabled={busy} onClick={() => { void run(() => remoteActionsApi.graph.download(rec.id, 'csv').then(() => remoteActionsApi.graph.record(rec.id))) }}><Download className="h-3.5 w-3.5" />Table .csv</button>}
            <button type="button" className={btnOutline} disabled={busy} onClick={() => { void run(() => remoteActionsApi.graph.download(rec.id, 'txt').then(() => remoteActionsApi.graph.record(rec.id))) }}><Download className="h-3.5 w-3.5" />Summary .txt</button></> : null}
          {rec.method === 'GET' && rec.nextLink && <button type="button" className={btnPrimary} disabled={busy} onClick={() => { void run(() => remoteActionsApi.graph.nextPage(rec.id)) }}><ChevronRight className="h-3.5 w-3.5" />Next page</button>}
          {rec.method === 'GET' && (rec.status === 'executed' || rec.status === 'failed') && <button type="button" className={btnOutline} disabled={busy} onClick={() => { void run(() => remoteActionsApi.graph.rerun(rec.id)) }}><RefreshCw className="h-3.5 w-3.5" />Retry</button>}
        </div>
        <p className="flex items-center gap-1 text-[0.68rem] text-slate-500"><AlertTriangle className="h-3 w-3" />Downloads exclude tokens, secrets and authorization headers.</p>
      </div>
    </Card>
  )
}

function HistoryPanel({ status, refreshSignal, onChanged }: { status: RaStatus; refreshSignal: number; onChanged: () => void }) {
  const [rows, setRows] = useState<GraphRecord[] | null>(null); const [sel, setSel] = useState<GraphRecord | null>(null); const [err, setErr] = useState<string | null>(null)
  const [cls, setCls] = useState(''); const [st, setSt] = useState(''); const [note, setNote] = useState(''); const [busy, setBusy] = useState(false)
  const load = () => remoteActionsApi.graph.history({ ...(cls ? { classification: cls } : {}), ...(st ? { status: st } : {}) }).then(setRows).catch(e => setErr(errMsg(e)))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load() }, [cls, st, refreshSignal])
  const open = (id: string) => { void remoteActionsApi.graph.record(id).then(setSel).catch(e => setErr(errMsg(e))) }
  const decide = async (d: 'approve' | 'reject') => { if (!sel) return; setBusy(true); setErr(null); try { setSel(await remoteActionsApi.graph.decide(sel.id, d, note)); void load(); onChanged() } catch (e) { setErr(errMsg(e)) } finally { setBusy(false) } }

  return (
    <div className="space-y-3">
      <ErrorBanner message={err} onClose={() => setErr(null)} />
      <div className="flex flex-wrap gap-2">
        <select aria-label="Filter by classification" className={`${inputCls} max-w-[12rem]`} value={cls} onChange={e => setCls(e.target.value)}><option value="">All classifications</option><option value="read_only">Read-only</option><option value="change">Change</option><option value="destructive">Destructive</option></select>
        <select aria-label="Filter by status" className={`${inputCls} max-w-[12rem]`} value={st} onChange={e => setSt(e.target.value)}><option value="">All statuses</option><option value="pending_approval">Pending approval</option><option value="executed">Executed</option><option value="failed">Failed</option><option value="rejected">Rejected</option></select>
        <button type="button" className={btnOutline} onClick={() => { void load() }}><RefreshCw className="h-3.5 w-3.5" />Refresh</button>
      </div>
      {!rows ? <Loading /> : rows.length === 0 ? <Empty>No Graph requests yet.</Empty> : (
        <div className="overflow-auto rounded-2xl border border-slate-200 bg-white"><table className="w-full text-left text-xs"><thead className="bg-slate-50 text-[0.65rem] uppercase text-slate-500"><tr>{['Name', 'Requestor', 'Time', 'Method', 'Endpoint', 'Class', 'Approval', 'HTTP', 'Result', 'Downloads'].map(h => <th key={h} className="px-3 py-2">{h}</th>)}</tr></thead>
          <tbody>{rows.map(r => <tr key={r.id} className="cursor-pointer border-t border-slate-100 hover:bg-slate-50" onClick={() => open(r.id)}><td className="px-3 py-2 font-bold text-sky-700">{r.name}</td><td className="px-3 py-2">{r.requestedBy}</td><td className="px-3 py-2">{fmtTime(r.requestedAt)}</td><td className="px-3 py-2">{r.method}</td><td className="max-w-[14rem] truncate px-3 py-2 font-mono text-[0.68rem]">{r.endpoint}</td><td className="px-3 py-2"><GraphClassBadge c={r.classification} /></td><td className="px-3 py-2">{r.approvalStatus.replace('_', ' ')}</td><td className="px-3 py-2">{r.httpStatus ?? '—'}</td><td className="px-3 py-2">{r.status.replace('_', ' ')}</td><td className="px-3 py-2">{r.downloads.length}</td></tr>)}</tbody></table></div>
      )}
      {sel && (
        <div className="space-y-3">
          {sel.status === 'pending_approval' && (
            <Notice tone="warn"><div className="space-y-2"><p><b>{sel.classification === 'destructive' ? 'Destructive request' : 'Request'} awaiting approval.</b> Justification: {sel.justification || '—'}</p>
              {status.permissions.graphApprove && sel.requestedBy.toLowerCase() !== status.me.toLowerCase()
                ? <div className="flex flex-wrap items-center gap-2"><input aria-label="Approval note" className={`${inputCls} max-w-xs`} placeholder="Note (optional)" value={note} onChange={e => setNote(e.target.value)} /><button type="button" className={btnPrimary} disabled={busy} onClick={() => { void decide('approve') }}>Approve and send</button><button type="button" className={btnOutline} disabled={busy} onClick={() => { void decide('reject') }}>Reject</button></div>
                : <p className="font-bold">{sel.requestedBy.toLowerCase() === status.me.toLowerCase() ? 'You requested this, so another approver must approve it.' : 'You do not have the Approver permission.'}</p>}</div></Notice>)}
          <p className="text-xs text-slate-600">Justification: {sel.justification || '—'} · Request body: {sel.body !== undefined ? 'stored with sensitive values masked' : 'none'}</p>
          <ResultView rec={sel} onUpdate={r => { setSel(r); void load() }} onError={setErr} />
          <div className="flex flex-wrap gap-2">
            {sel.method === 'GET' && <button type="button" className={btnOutline} onClick={() => { void remoteActionsApi.graph.rerun(sel.id).then(r => { setSel(r); void load() }).catch(e => setErr(errMsg(e))) }}>Rerun</button>}
            <span className="self-center text-[0.68rem] text-slate-500">Rerunning a change or delete request goes through justification, confirmation and approval again.</span>
          </div>
          {sel.audit && <details><summary className="cursor-pointer text-xs font-bold text-slate-600">Audit trail</summary><ul className="mt-1 max-h-40 overflow-auto text-xs text-slate-600">{sel.audit.map(a => <li key={`${a.at}${a.action}`}>{fmtTime(a.at)} · {a.actor} · {a.action}</li>)}</ul></details>}
        </div>
      )}
    </div>
  )
}
