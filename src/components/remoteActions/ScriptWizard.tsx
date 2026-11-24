import { useMemo, useRef, useState } from 'react'
import { Bot, Play, Save, ShieldCheck, Sparkles, Upload } from 'lucide-react'
import { remoteActionsApi, type AssistantResult, type Preflight, type ProviderCaps, type RaStatus, type ScriptAnalysis, type ScriptSummary, type TargetDevice } from '../../api/remoteActions'
import { Card, ErrorBanner, Notice, Pre, RiskBadge } from './shared'
import { btnOutline, btnPrimary, errMsg, fmtTime, inputCls, labelCls } from './helpers'

const STEPS = ['Script', 'Devices', 'Review and run'] as const

export function ScriptWizard({ status, scripts, initialScriptId, onDone, onJobCreated }: {
  status: RaStatus; scripts: ScriptSummary[]; initialScriptId?: string | null; onDone: () => void; onJobCreated: (jobId: string) => void
}) {
  const canAuthor = status.permissions.author, canExecute = status.permissions.execute
  const [step, setStep] = useState(0)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // ── step 1 state
  const [scriptId, setScriptId] = useState<string | null>(initialScriptId ?? null)
  const [name, setName] = useState(''); const [desc, setDesc] = useState(''); const [content, setContent] = useState(''); const [fileName, setFileName] = useState<string | undefined>()
  const [language, setLanguage] = useState<'powershell' | 'shell' | ''>(''); const [owner, setOwner] = useState(''); const [tags, setTags] = useState('')
  const [timeoutSec, setTimeoutSec] = useState(300); const [runAs, setRunAs] = useState<'system' | 'user'>('system')
  const [scriptJustification, setScriptJustification] = useState(''); const [rollback, setRollback] = useState(''); const [source, setSource] = useState<'manual' | 'upload' | 'ai_draft'>('manual')
  const [analysis, setAnalysis] = useState<ScriptAnalysis | null>(null); const [rollbackAnalysis, setRollbackAnalysis] = useState<ScriptAnalysis | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // ── assistant
  const [aiOpen, setAiOpen] = useState(false); const [aiRequest, setAiRequest] = useState(''); const [aiOut, setAiOut] = useState<AssistantResult | null>(null); const [aiBusy, setAiBusy] = useState(false)

  // ── target / job state
  const [provider, setProvider] = useState<ProviderCaps['id']>(() => status.providers.find(p => p.enabled && p.id !== 'mock')?.id ?? status.providers.find(p => p.enabled)?.id ?? 'intune')
  const [mode, setMode] = useState<'now' | 'when_online' | 'scheduled' | 'pilot'>('now'); const [scheduledFor, setScheduledFor] = useState('')
  const [q, setQ] = useState(''); const [platform, setPlatform] = useState<'' | 'Windows' | 'macOS'>(''); const [within, setWithin] = useState('72'); const [compliance, setCompliance] = useState('')
  const [found, setFound] = useState<TargetDevice[] | null>(null); const [picked, setPicked] = useState<Set<string>>(new Set())
  const [pre, setPre] = useState<Preflight | null>(null)
  const [jobJustification, setJobJustification] = useState(''); const [confirmCount, setConfirmCount] = useState('')

  const chosen = scripts.find(s => s.id === scriptId) ?? null
  const caps = status.providers.find(p => p.id === provider)
  const risk = chosen?.risk ?? analysis?.risk

  async function guard<T>(fn: () => Promise<T>): Promise<T | undefined> { setBusy(true); setErr(null); try { return await fn() } catch (e) { setErr(errMsg(e)); return undefined } finally { setBusy(false) } }

  function onFile(f: File | undefined) {
    if (!f) return
    if (!/\.(ps1|sh)$/i.test(f.name)) { setErr('Only .ps1 (PowerShell) and .sh (Shell) files can be uploaded.'); return }
    if (f.size > 200 * 1024) { setErr('The file is larger than 200 KB.'); return }
    void f.text().then(t => { setContent(t); setFileName(f.name); setSource('upload'); setScriptId(null); setAnalysis(null); setName(n => n || f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ')); setErr(null) })
  }

  const validate = () => guard(async () => {
    const r = await remoteActionsApi.analyze({ content, ...(fileName ? { fileName } : {}), ...(language ? { language } : {}), ...(rollback.trim() ? { rollbackContent: rollback } : {}) })
    setAnalysis(r.analysis); setRollbackAnalysis(r.rollback ?? null)
    if (!name.trim() && r.analysis.name) setName(r.analysis.name)
    if (!desc.trim() && r.analysis.description) setDesc(r.analysis.description)
    if (!language && r.analysis.language !== 'unknown') setLanguage(r.analysis.language)
    return r
  })

  const saveScript = () => guard(async () => {
    const saved = await remoteActionsApi.createScript({
      name, content, ...(desc ? { description: desc } : {}), ...(fileName ? { fileName } : {}), ...(language ? { language } : {}), ...(owner ? { owner } : {}),
      tags: tags.split(',').map(t => t.trim()).filter(Boolean), timeoutSec, runAs, ...(scriptJustification ? { justification: scriptJustification } : {}), ...(rollback.trim() ? { rollbackContent: rollback } : {}), source,
    })
    setScriptId(saved.id); onDone(); return saved
  })

  const runAssistant = (task: string, extra: Record<string, string> = {}) => { setAiBusy(true); setErr(null); void remoteActionsApi.assistant({ task, ...(content ? { content } : {}), ...(language ? { language } : {}), ...extra }).then(setAiOut).catch(e => setErr(errMsg(e))).finally(() => setAiBusy(false)) }

  const searchDevices = () => guard(async () => {
    const r = await remoteActionsApi.devices({ ...(platform ? { platform } : {}), ...(q ? { q } : {}), ...(within ? { checkedInWithinHours: Number(within) } : {}), ...(compliance ? { compliance } : {}), limit: 200 })
    setFound(r.devices); return r
  })

  const targetSpec = () => ({ deviceIds: [...picked] })
  const runPreflight = () => guard(async () => { const r = await remoteActionsApi.preflight({ scriptId: scriptId!, target: targetSpec(), provider, mode }); setPre(r); return r })

  const needsJobApproval = pre?.approval.jobApproval ?? false
  const eligibleCount = pre?.eligible.length ?? 0
  const confirmOk = eligibleCount <= 1 || Number(confirmCount) === eligibleCount
  const justificationOk = !(risk === 'medium' || risk === 'high') || jobJustification.trim().length >= 10

  const submitJob = () => guard(async () => {
    const r = await remoteActionsApi.createJob({
      scriptId: scriptId!, target: targetSpec(), provider, mode, runAs, ...(jobJustification.trim() ? { justification: jobJustification } : {}),
      ...(mode === 'scheduled' ? { scheduledFor: new Date(scheduledFor).toISOString() } : {}), ...(eligibleCount > 1 ? { confirmDeviceCount: Number(confirmCount) } : {}),
    })
    onJobCreated(r.job.id); return r
  })

  const stepOk = useMemo(() => [Boolean(scriptId), picked.size > 0, true], [scriptId, picked.size])
  const goDevices = () => { setStep(1); if (!found && canExecute) void searchDevices() }
  const goReview = () => { setPre(null); setStep(2); void runPreflight() }
  const optionLabel = `${caps?.label ?? provider} · ${mode === 'scheduled' ? 'scheduled' : mode.replace('_', ' ')}`
  const aiNeeded = analysis?.requiresJustification ?? false
  const saveDisabled = busy || !name.trim() || !content.trim() || (aiNeeded && scriptJustification.trim().length < 10)

  return (
    <div className="space-y-4">
      <ol className="flex flex-wrap gap-1.5" aria-label="Progress">
        {STEPS.map((s, i) => (
          <li key={s}><button type="button" disabled={i > step && !stepOk[step]} onClick={() => { if (i === 1) goDevices(); else if (i === 2) goReview(); else setStep(i) }}
            className={`rounded-full px-3 py-1 text-xs font-bold ${i === step ? 'bg-sky-600 text-white' : i < step ? 'bg-sky-100 text-sky-800' : 'bg-slate-100 text-slate-500'}`}>{i + 1}. {s}</button></li>
        ))}
      </ol>
      <ErrorBanner message={err} onClose={() => setErr(null)} />

      {step === 0 && (
        <div className="grid gap-4 lg:grid-cols-5">
          <Card title="Saved scripts" className="lg:col-span-2">
            {scripts.filter(s => !s.archived).length === 0 && <p className="text-xs text-slate-500">No saved scripts yet. Add one on the right.</p>}
            <ul className="max-h-80 space-y-1 overflow-auto">
              {scripts.filter(s => !s.archived).map(s => (
                <li key={s.id}><button type="button" onClick={() => { setScriptId(s.id); setAnalysis(null) }} className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-xs ${scriptId === s.id ? 'border-sky-400 bg-sky-50' : 'border-slate-200 hover:bg-slate-50'}`}>
                  <span><span className="font-bold text-slate-800">{s.name}</span> <span className="text-slate-500">{s.language === 'powershell' ? 'PowerShell' : 'Shell'} · {s.platform}</span></span>
                  <RiskBadge risk={s.risk} /></button></li>
              ))}
            </ul>
            {chosen && !analysis && (
              <div className="mt-3 space-y-2 border-t border-slate-100 pt-3 text-xs">
                <p className="text-slate-600"><b>{chosen.name}</b> · approval: {chosen.approvalStatus.replace('_', ' ')}{chosen.approvedBy ? ` by ${chosen.approvedBy}` : ''}</p>
                {chosen.approvalStatus !== 'approved' && chosen.risk !== 'low' && <Notice tone="warn">Not approved yet. An approver must approve it before it can run.</Notice>}
                {chosen.risk === 'blocked' && <Notice tone="warn">Flagged as blocked: it can be kept in the library but cannot be run.</Notice>}
                <button type="button" className={btnPrimary} onClick={goDevices} disabled={chosen.approvalStatus === 'rejected' || chosen.risk === 'blocked'}>Continue with “{chosen.name}”</button>
              </div>
            )}
          </Card>

          <Card title="New script" className="lg:col-span-3" action={canAuthor && <button type="button" className={btnOutline} onClick={() => setAiOpen(o => !o)}><Bot className="h-3.5 w-3.5" />Script Assistant</button>}>
            {!canAuthor ? <Notice tone="warn">Your role cannot create scripts. Pick a saved script, or ask a Script Admin.</Notice> : (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <input ref={fileRef} type="file" accept=".ps1,.sh" className="hidden" aria-label="Upload script file" onChange={e => onFile(e.target.files?.[0])} />
                  <button type="button" className={btnOutline} onClick={() => fileRef.current?.click()}><Upload className="h-3.5 w-3.5" />Upload .ps1 / .sh</button>
                  <span className="text-xs text-slate-500">or paste below. Nothing runs automatically.</span>
                </div>
                <div><label className={labelCls} htmlFor="ra-content">Script</label>
                  <textarea id="ra-content" spellCheck={false} value={content} onChange={e => { setContent(e.target.value); setAnalysis(null); setSource(x => x === 'upload' ? x : 'manual') }} rows={9} className="w-full rounded-lg border border-slate-300 bg-slate-50 p-2 font-mono text-xs" placeholder="# Paste a PowerShell or Shell script" /></div>
                <div><label className={labelCls} htmlFor="ra-name">Script name</label><input id="ra-name" className={inputCls} value={name} onChange={e => setName(e.target.value)} /></div>
                <details><summary className="cursor-pointer text-xs font-bold text-slate-600">More options (language, timeout, run as, rollback…)</summary>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <div><label className={labelCls} htmlFor="ra-lang">Language</label><select id="ra-lang" className={inputCls} value={language} onChange={e => setLanguage(e.target.value as typeof language)}><option value="">Auto-detect</option><option value="powershell">PowerShell (Windows)</option><option value="shell">Shell (macOS)</option></select></div>
                    <div><label className={labelCls} htmlFor="ra-runas">Run as</label><select id="ra-runas" className={inputCls} value={runAs} onChange={e => setRunAs(e.target.value as 'system' | 'user')}><option value="system">System / root</option><option value="user">Logged-in user</option></select></div>
                    <div><label className={labelCls} htmlFor="ra-timeout">Timeout (seconds)</label><input id="ra-timeout" type="number" min={10} max={3600} className={inputCls} value={timeoutSec} onChange={e => setTimeoutSec(Number(e.target.value))} /></div>
                    <div><label className={labelCls} htmlFor="ra-tags">Tags (comma separated)</label><input id="ra-tags" className={inputCls} value={tags} onChange={e => setTags(e.target.value)} /></div>
                    <div><label className={labelCls} htmlFor="ra-owner">Owner</label><input id="ra-owner" className={inputCls} placeholder="defaults to you" value={owner} onChange={e => setOwner(e.target.value)} /></div>
                    <div><label className={labelCls} htmlFor="ra-desc">Description</label><input id="ra-desc" className={inputCls} value={desc} onChange={e => setDesc(e.target.value)} /></div>
                    <div className="sm:col-span-2"><label className={labelCls} htmlFor="ra-rb">Rollback script (optional)</label>
                      <textarea id="ra-rb" spellCheck={false} value={rollback} onChange={e => setRollback(e.target.value)} rows={3} className="w-full rounded-lg border border-slate-300 bg-slate-50 p-2 font-mono text-xs" /></div>
                  </div></details>
                <button type="button" className={btnPrimary} disabled={busy || !content.trim()} onClick={() => { void validate() }}><ShieldCheck className="h-3.5 w-3.5" />Validate and review</button>

                {analysis && (
                  <div className="space-y-2 border-t border-slate-100 pt-3" aria-label="Validation and safety review">
                    <div className="flex flex-wrap items-center gap-2"><RiskBadge risk={analysis.risk} />
                      <span className="text-xs text-slate-600">{analysis.language === 'powershell' ? 'PowerShell' : analysis.language === 'shell' ? 'Shell' : 'Unknown language'} · {analysis.platform === 'both' ? 'Windows + macOS' : analysis.platform} · {analysis.lineCount} lines{analysis.requiresAdmin ? ' · needs admin/root' : ''}</span></div>
                    {analysis.errors.length > 0 && <Notice tone="warn"><p className="mb-1">Validation issues (you can still save; the script cannot run until fixed):</p><ul className="list-disc pl-4">{analysis.errors.map(e => <li key={e}>{e}</li>)}</ul></Notice>}
                    {analysis.findings.length > 0 ? (
                      <div className="max-h-56 overflow-auto rounded-xl border border-slate-200"><table className="w-full text-left text-xs"><thead className="sticky top-0 bg-slate-50 text-[0.65rem] uppercase text-slate-500"><tr><th className="px-3 py-1.5">Risk</th><th className="px-3 py-1.5">Reason</th><th className="px-3 py-1.5">Line</th><th className="px-3 py-1.5">Code</th></tr></thead>
                        <tbody>{analysis.findings.map((f, i) => <tr key={i} className="border-t border-slate-100"><td className="px-3 py-1.5"><RiskBadge risk={f.severity} /></td><td className="px-3 py-1.5">{f.category}: {f.message}</td><td className="px-3 py-1.5">{f.line ?? '—'}</td><td className="px-3 py-1.5 font-mono text-[0.68rem]">{f.match ?? ''}</td></tr>)}</tbody></table></div>
                    ) : analysis.errors.length === 0 && <Notice tone="ok">No risky patterns detected. (Pattern checks are not a guarantee.)</Notice>}
                    {analysis.risk === 'blocked' && <Notice tone="warn">This script is flagged as blocked. You can save it to the library, but it cannot be run until the flagged content is removed.</Notice>}
                    {analysis.requiresApproval && <Notice tone="warn">High risk: an approver (not you) must approve this script and every job that uses it.</Notice>}
                    {rollbackAnalysis && <p className="text-xs text-slate-600">Rollback script: <RiskBadge risk={rollbackAnalysis.risk} />{rollbackAnalysis.errors.length > 0 ? ` — ${rollbackAnalysis.errors.join(' ')}` : ''}</p>}
                    {aiNeeded && <div><label className={labelCls} htmlFor="ra-sj">Why is this needed? (required for {analysis.risk} risk)</label><textarea id="ra-sj" rows={2} className="w-full rounded-lg border border-slate-300 p-2 text-xs" value={scriptJustification} onChange={e => setScriptJustification(e.target.value)} /></div>}
                    <button type="button" className={btnPrimary} disabled={saveDisabled} onClick={() => { void saveScript().then(sv => { if (sv && sv.risk !== 'blocked') goDevices(); else if (sv) setAnalysis(null) }) }}><Save className="h-3.5 w-3.5" />Save script and continue</button>
                  </div>
                )}
              </div>
            )}
          </Card>

          {aiOpen && canAuthor && (
            <Card title="Script Assistant" className="lg:col-span-5">
              <p className="text-xs text-slate-600">AI only drafts and explains; drafts go through the same review and approval. Secrets and personal data are removed before anything is sent.</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <input className={`${inputCls} max-w-md`} aria-label="Describe the script you need" placeholder="Describe the script you want drafted" value={aiRequest} onChange={e => setAiRequest(e.target.value)} />
                <button type="button" className={btnPrimary} disabled={aiBusy || !aiRequest.trim()} onClick={() => runAssistant('draft', { request: aiRequest, ...(language ? { language } : { language: 'powershell' }) })}><Sparkles className="h-3.5 w-3.5" />Draft</button>
                {(['explain', 'risks', 'targeting', 'rollback'] as const).map(t => <button key={t} type="button" className={btnOutline} disabled={aiBusy || !content.trim()} onClick={() => runAssistant(t)}>{{ explain: 'Explain', risks: 'Risks', targeting: 'Targeting', rollback: 'Rollback' }[t]}</button>)}
              </div>
              {aiOut && (
                <div className="mt-2 space-y-2"><Pre>{aiOut.text}</Pre>
                  {aiOut.draft && <div className="flex flex-wrap items-center gap-2"><RiskBadge risk={aiOut.draft.analysis.risk} /><span className="text-xs text-slate-600">Draft only — not saved.</span>
                    <button type="button" className={btnOutline} onClick={() => { if (aiOut.task === 'rollback') setRollback(aiOut.draft!.content); else { setContent(aiOut.draft!.content); setSource('ai_draft'); setScriptId(null); setAnalysis(null); setFileName(undefined) } }}>{aiOut.task === 'rollback' ? 'Use as rollback' : 'Load draft into editor'}</button></div>}
                  <p className="text-xs text-slate-500">{aiOut.notice}</p></div>
              )}
            </Card>
          )}
        </div>
      )}

      {step === 1 && (
        <Card title="Choose devices">
          {!canExecute ? <Notice tone="warn">Your role cannot run scripts. You can still save scripts for an Operator to run.</Notice> : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-[12rem] flex-1"><label className={labelCls} htmlFor="t-q">Search devices</label><input id="t-q" className={inputCls} placeholder="Device name" value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void searchDevices() }} /></div>
                <div><label className={labelCls} htmlFor="t-plat">Platform</label><select id="t-plat" className={inputCls} value={platform} onChange={e => setPlatform(e.target.value as typeof platform)}><option value="">Any</option><option>Windows</option><option>macOS</option></select></div>
                <button type="button" className={btnPrimary} disabled={busy} onClick={() => { void searchDevices() }}>Find devices</button>
              </div>
              <details><summary className="cursor-pointer text-xs font-bold text-slate-600">More filters</summary>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <div><label className={labelCls} htmlFor="t-w">Checked in within (hours)</label><input id="t-w" type="number" className={inputCls} value={within} onChange={e => setWithin(e.target.value)} /></div>
                  <div><label className={labelCls} htmlFor="t-c">Compliance</label><select id="t-c" className={inputCls} value={compliance} onChange={e => setCompliance(e.target.value)}><option value="">Any</option><option>Compliant</option><option>Warning</option><option>Non-Compliant</option></select></div>
                </div></details>
              {found && (
                <div className="space-y-1"><div className="flex items-center justify-between text-xs"><span>{found.length} devices · {picked.size} selected</span>
                  <span className="flex gap-3"><button type="button" className="font-bold text-sky-700" onClick={() => setPicked(new Set(found.map(d => d.id)))}>Select all</button><button type="button" className="font-bold text-slate-500" onClick={() => setPicked(new Set())}>Clear</button></span></div>
                  <div className="max-h-72 overflow-auto rounded-xl border border-slate-200"><table className="w-full text-left text-xs"><thead className="sticky top-0 bg-slate-50 text-[0.65rem] uppercase text-slate-500"><tr><th className="w-8 px-3 py-1.5" /><th className="px-3 py-1.5">Device</th><th className="px-3 py-1.5">OS</th><th className="px-3 py-1.5">Last check-in</th></tr></thead>
                    <tbody>{found.map(d => <tr key={d.id} className="border-t border-slate-100"><td className="px-3 py-1"><input type="checkbox" aria-label={`Select ${d.name}`} checked={picked.has(d.id)} onChange={() => setPicked(p => { const n = new Set(p); if (n.has(d.id)) n.delete(d.id); else n.add(d.id); return n })} /></td><td className="px-3 py-1 font-medium">{d.name}</td><td className="px-3 py-1">{d.platform}</td><td className="px-3 py-1">{fmtTime(d.lastCheckIn)}</td></tr>)}</tbody></table></div></div>
              )}
              <details open={Boolean(caps && !caps.enabled) || mode === 'scheduled'}><summary className="cursor-pointer text-xs font-bold text-slate-600">Delivery: {optionLabel}</summary>
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  <div><label className={labelCls} htmlFor="t-prov">Execution provider</label>
                    <select id="t-prov" className={inputCls} value={provider} onChange={e => { setProvider(e.target.value as ProviderCaps['id']); setPre(null) }}>{status.providers.map(p => <option key={p.id} value={p.id} disabled={!p.enabled}>{p.label}{p.enabled ? '' : ' (unavailable)'}</option>)}</select></div>
                  <div><label className={labelCls} htmlFor="t-mode">When</label>
                    <select id="t-mode" className={inputCls} value={mode} onChange={e => { setMode(e.target.value as typeof mode); setPre(null) }}><option value="now">Run now</option><option value="when_online">When device is online</option><option value="scheduled">Schedule</option><option value="pilot">Pilot test run</option></select></div>
                  {mode === 'scheduled' && <div><label className={labelCls} htmlFor="t-sched">Date and time</label><input id="t-sched" type="datetime-local" className={inputCls} value={scheduledFor} onChange={e => setScheduledFor(e.target.value)} /></div>}
                </div></details>
              {caps && !caps.enabled && <Notice tone="warn"><b>{caps.label} is unavailable:</b> {caps.reasons.join(' ')}</Notice>}
              {provider === 'mock' && <Notice tone="warn">Simulation only. Nothing runs on any device.</Notice>}
              <div className="flex gap-2"><button type="button" className={btnOutline} onClick={() => setStep(0)}>Back</button>
                <button type="button" className={btnPrimary} disabled={picked.size === 0 || !caps?.enabled || (mode === 'scheduled' && !scheduledFor)} onClick={goReview}>Run pre-flight checks</button></div>
            </div>
          )}
        </Card>
      )}

      {step === 2 && (
        <Card title="Review and run">
          {busy && !pre && <p className="text-xs text-slate-500">Checking devices…</p>}
          {pre && (
            <div className="space-y-3 text-xs">
              <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-3">
                <div><dt className={labelCls}>Script</dt><dd>{chosen?.name ?? name} <RiskBadge risk={(risk ?? 'low') as 'low'} /></dd></div>
                <div><dt className={labelCls}>Provider · when</dt><dd>{optionLabel}{mode === 'scheduled' && scheduledFor ? ` (${fmtTime(new Date(scheduledFor).toISOString())})` : ''}</dd></div>
                <div><dt className={labelCls}>Devices</dt><dd><b className="text-emerald-700">{pre.eligible.length} eligible</b>{pre.excluded.length > 0 && <> · <b className="text-amber-700">{pre.excluded.length} excluded</b></>}</dd></div>
              </dl>
              {pre.blockers.map(b => <Notice key={b} tone="danger">{b}</Notice>)}
              {pre.warnings.map(w => <Notice key={w} tone="warn">{w}</Notice>)}
              {pre.excluded.length > 0 && <details><summary className="cursor-pointer font-bold text-amber-800">Why were {pre.excluded.length} devices excluded?</summary><div className="mt-1 max-h-44 overflow-auto rounded-xl border border-amber-200"><table className="w-full text-left"><tbody>{pre.excluded.map(x => <tr key={x.device.id} className="border-t border-amber-100 first:border-t-0"><td className="px-3 py-1 font-medium">{x.device.name}</td><td className="px-3 py-1">{x.reasons.join(' ')}</td></tr>)}</tbody></table></div></details>}
              {pre.approval.versionApproval && pre.versionApproval !== 'approved' && <Notice tone="danger">The script version must be approved by an approver before a job can be created. Ask an Approver (not the author) to approve it in the Library tab.</Notice>}
              {needsJobApproval && <Notice tone="warn">This job needs approver sign-off before anything is sent. It will wait under Pending Approvals.</Notice>}
              {(risk === 'medium' || risk === 'high') && <div><label className={labelCls} htmlFor="j-just">Business justification (required)</label><textarea id="j-just" rows={2} className="w-full rounded-lg border border-slate-300 p-2 text-xs" value={jobJustification} onChange={e => setJobJustification(e.target.value)} /></div>}
              {eligibleCount > 1 && <div><label className={labelCls} htmlFor="j-count">Type {eligibleCount} to confirm you are running on {eligibleCount} devices</label><input id="j-count" inputMode="numeric" className={`${inputCls} max-w-[8rem]`} value={confirmCount} onChange={e => setConfirmCount(e.target.value)} /></div>}
              <div className="flex gap-2"><button type="button" className={btnOutline} onClick={() => setStep(1)}>Change devices</button>
                <button type="button" className={btnPrimary} disabled={busy || pre.blockers.length > 0 || eligibleCount === 0 || !confirmOk || !justificationOk || (pre.approval.versionApproval && pre.versionApproval !== 'approved')} onClick={() => { void submitJob() }}><Play className="h-3.5 w-3.5" />{needsJobApproval ? 'Request approval' : mode === 'scheduled' ? 'Schedule job' : 'Run job'}</button></div>
            </div>
          )}
        </Card>
      )}
    </div>
  )
}
