import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, ArrowLeft, Check, CheckCircle2, ChevronRight, Copy, Download, FileArchive, Loader2, Package, RefreshCw, ShieldAlert, Trash2, Upload, XCircle } from 'lucide-react'
import {
  PackagerApiError, STATE_LABEL, winPackagerApi,
  type ArtifactFile, type PackageConfig, type PackageJob, type PackageJobState, type PackagerStatus, type PublishingGuide, type ReturnCode,
} from '../api/winPackager'
import { hasPermission } from '../lib/permissions'
import { usePermissions } from '../context/PermissionsContext'

const STEPS = ['Upload Source', 'Inspect & Analyze', 'Review Configuration', 'Validate on Windows', 'Create Package', 'Publishing Guide & Download'] as const

const STATE_STYLE: Record<PackageJobState, string> = {
  ready: 'bg-emerald-100 text-emerald-700', 'review-required': 'bg-amber-100 text-amber-700', 'validation-failed': 'bg-red-100 text-red-700',
  unsupported: 'bg-red-100 text-red-700', 'api-unavailable': 'bg-slate-200 text-slate-700', processing: 'bg-sky-100 text-sky-700',
}
const CONFIDENCE_LABEL = { verified: 'Verified', likely: 'Likely — test required', unknown: 'Unknown — manual command required' } as const
const CONFIDENCE_STYLE = { verified: 'bg-emerald-100 text-emerald-700', likely: 'bg-amber-100 text-amber-700', unknown: 'bg-red-100 text-red-700' } as const
const SIGNATURE_LABEL = { unsigned: 'Unsigned', 'present-unverified': 'Signature present — not verified', valid: 'Valid', invalid: 'Invalid' } as const
const NOT_TESTED = 'Package Created / Windows Installation Not Tested'

const fmtBytes = (n: number): string => (n >= 1024 ** 3 ? `${(n / 1024 ** 3).toFixed(2)} GB` : n >= 1024 ** 2 ? `${(n / 1024 ** 2).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`)
const errText = (e: unknown): string => (e instanceof PackagerApiError ? [e.message, ...e.problems].join(' — ') : e instanceof Error ? e.message : 'Request failed')

function StateBadge({ state }: { state: PackageJobState }) {
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[0.68rem] font-bold ${STATE_STYLE[state]}`}>{state === 'processing' && <Loader2 className="h-3 w-3 animate-spin" />}{STATE_LABEL[state]}</span>
}

function Notice({ tone, children }: { tone: 'warn' | 'error' | 'info'; children: React.ReactNode }) {
  const cls = tone === 'error' ? 'border-red-200 bg-red-50 text-red-800' : tone === 'warn' ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-sky-200 bg-sky-50 text-sky-900'
  return <div role={tone === 'error' ? 'alert' : 'status'} className={`flex gap-2 rounded-xl border px-3 py-2 text-xs ${cls}`}><AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" /><div className="min-w-0">{children}</div></div>
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [done, setDone] = useState(false)
  return (
    <button type="button" aria-label={`Copy ${label}`} title={`Copy ${label}`}
      onClick={() => { void navigator.clipboard.writeText(value).then(() => { setDone(true); window.setTimeout(() => setDone(false), 1500) }).catch(() => undefined) }}
      className="flex-shrink-0 rounded p-1 text-blue-600 hover:bg-blue-50">
      {done ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  )
}

function Btn({ children, onClick = () => undefined, disabled, busy, kind = 'primary', title }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; busy?: boolean; kind?: 'primary' | 'secondary' | 'danger'; title?: string }) {
  const cls = kind === 'primary' ? 'bg-blue-600 text-white hover:bg-blue-700' : kind === 'danger' ? 'border border-red-300 text-red-700 hover:bg-red-50' : 'border border-slate-300 text-slate-700 hover:bg-slate-50'
  return (
    <button type="button" onClick={onClick} disabled={disabled || busy} title={title}
      className={`inline-flex h-8 items-center gap-1.5 rounded-full px-4 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${cls}`}>
      {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}{children}
    </button>
  )
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return <label className="block text-xs"><span className="mb-1 block font-semibold text-slate-700">{label}</span>{children}{hint && <span className="mt-0.5 block text-[0.68rem] text-slate-500">{hint}</span>}</label>
}
const inputCls = 'w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-blue-500 focus:outline-none disabled:bg-slate-100'

// ── Steps ──────────────────────────────────────────────────────────────────────

function UploadStep({ status, canWrite, onUploaded }: { status: PackagerStatus | null; canWrite: boolean; onUploaded: (j: PackageJob) => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  async function send(file: File | undefined) {
    if (!file) return
    setBusy(true); setError(null)
    try { onUploaded(await winPackagerApi.upload(file)) } catch (e) { setError(errText(e)) } finally { setBusy(false); if (input.current) input.current.value = '' }
  }
  return (
    <div className="space-y-3">
      {!canWrite && <Notice tone="warn">You do not have permission to upload sources. Ask a Global Admin for the "Windows Package Builder: upload sources" permission.</Notice>}
      <div onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); void send(e.dataTransfer.files[0]) }}
        className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
        <Upload className="h-7 w-7 text-slate-400" />
        <p className="text-sm font-semibold text-slate-700">Drop an installer here, or choose a file</p>
        <p className="text-xs text-slate-500">.msi · .exe · .msix · .appx · .zip (zip a source folder to upload it)</p>
        {status && <p className="text-xs text-slate-500">Upload limit {fmtBytes(status.limits.maxUploadBytes)} · Intune package limit {fmtBytes(status.limits.maxIntuneBytes)}</p>}
        <input ref={input} type="file" accept=".msi,.exe,.msix,.appx,.zip" className="sr-only" aria-label="Choose installer file" onChange={e => void send(e.target.files?.[0])} />
        <Btn onClick={() => input.current?.click()} disabled={!canWrite} busy={busy}>{busy ? 'Uploading and inspecting…' : 'Choose file'}</Btn>
      </div>
      <p className="text-xs text-slate-500">The file is stored in an isolated job workspace and only read. It is never executed on this server.</p>
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  )
}

function FactRow({ k, v, copy }: { k: string; v?: string; copy?: boolean }) {
  return <tr className="border-t border-slate-100"><th scope="row" className="w-44 py-1.5 pr-3 text-left font-semibold text-slate-600">{k}</th><td className="py-1.5 break-all text-slate-900">{v || '—'}{copy && v && <CopyButton value={v} label={k} />}</td></tr>
}

function InspectStep({ job, canWrite, reload }: { job: PackageJob; canWrite: boolean; reload: (j: PackageJob) => void }) {
  const a = job.analysis
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [entry, setEntry] = useState('')
  const run = async (fn: () => Promise<PackageJob>) => { setBusy(true); setError(null); try { reload(await fn()) } catch (e) { setError(errText(e)) } finally { setBusy(false) } }
  if (!a) return <Notice tone="warn">No analysis is available for this job.</Notice>
  const nested = a.archiveEntries?.filter(e => e.kind) ?? []
  return (
    <div className="space-y-3">
      {job.state === 'unsupported' && <Notice tone="error"><strong>Unsupported.</strong> {job.stateReason}</Notice>}
      <table className="w-full text-xs"><tbody>
        <FactRow k="Source file" v={job.source.fileName} />
        <FactRow k="Size" v={fmtBytes(job.source.sizeBytes)} />
        <FactRow k="File type" v={job.source.type.toUpperCase()} />
        <FactRow k="SHA-256" v={job.source.sha256} copy />
        {a.installerKind && <>
          <FactRow k="Installer inspected" v={a.installerFile} />
          <FactRow k="Installer type" v={a.tech} />
          <FactRow k="Application" v={a.appName} />
          <FactRow k="Publisher" v={a.publisher} />
          <FactRow k="Version" v={a.version} />
          <FactRow k="Architecture" v={a.architecture} />
          {a.productCode && <FactRow k="ProductCode" v={a.productCode} copy />}
          {a.upgradeCode && <FactRow k="UpgradeCode" v={a.upgradeCode} copy />}
          {a.packageFamilyName && <FactRow k="Package family name" v={a.packageFamilyName} copy />}
          <FactRow k="Signature" v={`${SIGNATURE_LABEL[a.signature.status]}${a.signature.signer ? ` — ${a.signature.signer}` : ''}`} />
          <FactRow k="Analysis confidence" v={`${a.confidence} / 100`} />
        </>}
      </tbody></table>
      {a.installerKind && <p className="text-[0.7rem] text-slate-500">{a.signature.note}</p>}

      {a.archiveEntries && !a.installerKind && job.state !== 'unsupported' && (
        <div className="space-y-2 rounded-xl border border-slate-200 p-3">
          <p className="text-xs font-semibold text-slate-700">Select the installer inside the archive ({nested.length} found)</p>
          {nested.length === 0 ? <Notice tone="warn">No installer was found in this archive.</Notice> : (
            <div className="space-y-1" role="radiogroup" aria-label="Installer inside archive">
              {nested.map(n => (
                <label key={n.name} className="flex items-center gap-2 text-xs"><input type="radio" name="entry" checked={entry === n.name} onChange={() => setEntry(n.name)} /><span className="font-mono">{n.name}</span><span className="text-slate-500">{fmtBytes(n.size)}</span></label>
              ))}
            </div>
          )}
          <Btn onClick={() => void run(() => winPackagerApi.selectInstaller(job.id, entry))} disabled={!entry || !canWrite} busy={busy}>Extract safely &amp; inspect</Btn>
        </div>
      )}

      {a.installerKind && (
        <div className="space-y-2 rounded-xl border border-slate-200 p-3">
          <div className="flex flex-wrap items-center gap-2"><span className="text-xs font-semibold text-slate-700">Suggested silent commands</span>
            <span className={`rounded-full px-2.5 py-0.5 text-[0.68rem] font-bold ${CONFIDENCE_STYLE[a.commands.confidence]}`}>{CONFIDENCE_LABEL[a.commands.confidence]}</span>
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[0.68rem] font-bold text-slate-700">Windows validation required</span></div>
          {a.commands.install ? <div className="flex items-center gap-1 text-xs"><span className="w-20 font-semibold">Install</span><code className="break-all rounded bg-slate-100 px-1.5 py-0.5">{a.commands.install}</code><CopyButton value={a.commands.install} label="install command" /></div> : <p className="text-xs text-slate-600">Install: none suggested — enter the vendor-documented command manually.</p>}
          {a.commands.uninstall ? <div className="flex items-center gap-1 text-xs"><span className="w-20 font-semibold">Uninstall</span><code className="break-all rounded bg-slate-100 px-1.5 py-0.5">{a.commands.uninstall}</code><CopyButton value={a.commands.uninstall} label="uninstall command" /></div> : <p className="text-xs text-slate-600">Uninstall: none suggested — enter it manually.</p>}
          <p className="text-[0.7rem] text-slate-500">{a.commands.basis}</p>
        </div>
      )}
      {a.warnings.map(w => <Notice key={w} tone="warn">{w}</Notice>)}
      {error && <Notice tone="error">{error}</Notice>}
      {a.installerKind && <Btn kind="secondary" onClick={() => void run(() => winPackagerApi.inspect(job.id))} busy={busy} disabled={!canWrite}>Re-inspect</Btn>}
    </div>
  )
}

const RETURN_TYPES: ReturnCode['type'][] = ['success', 'softReboot', 'hardReboot', 'retry', 'failed']

function ReviewStep({ job, canWrite, reload }: { job: PackageJob; canWrite: boolean; reload: (j: PackageJob) => void }) {
  const [draft, setDraft] = useState<PackageConfig | null>(job.config ?? null)
  const [saving, setSaving] = useState(false)
  const [problems, setProblems] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [artifacts, setArtifacts] = useState<ArtifactFile[]>([])
  const icon = useRef<HTMLInputElement>(null)
  useEffect(() => { void winPackagerApi.artifacts(job.id).then(r => setArtifacts(r.files)).catch(() => undefined) }, [job.id, job.updatedAt])
  if (!draft || !job.analysis) return <Notice tone="warn">Nothing to review yet. Select an installer in the previous step.</Notice>
  const set = <K extends keyof PackageConfig>(k: K, v: PackageConfig[K]) => setDraft({ ...draft, [k]: v })
  const unverified = job.analysis.commands.confidence !== 'verified'
  async function save() {
    if (!draft) return
    setSaving(true); setError(null)
    try { const r = await winPackagerApi.saveConfig(job.id, draft); reload(r.data); setDraft(r.data.config ?? draft); setProblems(r.problems) } catch (e) { setError(errText(e)) } finally { setSaving(false) }
  }
  async function download(name: string) { try { await winPackagerApi.download(job.id, name, name) } catch (e) { setError(errText(e)) } }
  const dis = !canWrite
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="App name"><input className={inputCls} disabled={dis} value={draft.appName} onChange={e => set('appName', e.target.value)} /></Field>
        <Field label="Publisher"><input className={inputCls} disabled={dis} value={draft.publisher} onChange={e => set('publisher', e.target.value)} /></Field>
        <Field label="Version"><input className={inputCls} disabled={dis} value={draft.version} onChange={e => set('version', e.target.value)} /></Field>
        <Field label="Architecture"><select className={inputCls} disabled={dis} value={draft.architecture} onChange={e => set('architecture', e.target.value as PackageConfig['architecture'])}><option value="x64">x64</option><option value="x86">x86</option><option value="arm64">ARM64</option></select></Field>
        <div className="sm:col-span-2"><Field label="Description"><textarea className={inputCls} rows={2} disabled={dis} value={draft.description} onChange={e => set('description', e.target.value)} /></Field></div>
        <div className="sm:col-span-2"><Field label="Install command" hint="Allowed: msiexec, the setup file, or the generated scripts. Shell operators are rejected."><input className={`${inputCls} font-mono`} disabled={dis} value={draft.installCommand} onChange={e => set('installCommand', e.target.value)} /></Field></div>
        <div className="sm:col-span-2"><Field label="Uninstall command"><input className={`${inputCls} font-mono`} disabled={dis} value={draft.uninstallCommand} onChange={e => set('uninstallCommand', e.target.value)} /></Field></div>
        <Field label="Detection method"><select className={inputCls} disabled={dis} value={draft.detection.type} onChange={e => set('detection', { ...draft.detection, type: e.target.value as PackageConfig['detection']['type'] })}>
          <option value="msi-product-code">MSI product code</option><option value="appx-package">AppX package</option><option value="registry-uninstall">Registry (Uninstall DisplayName)</option><option value="file-exists">File exists</option><option value="custom-script">Not chosen yet</option></select></Field>
        <Field label="Detection value" hint={draft.detection.guidance}><input className={`${inputCls} font-mono`} disabled={dis} value={draft.detection.value ?? ''} onChange={e => set('detection', { ...draft.detection, value: e.target.value })} /></Field>
        <Field label="Detection minimum version"><input className={inputCls} disabled={dis} value={draft.detection.minVersion ?? ''} onChange={e => set('detection', { ...draft.detection, minVersion: e.target.value })} /></Field>
        <Field label="Install behavior"><select className={inputCls} disabled={dis} value={draft.installBehavior} onChange={e => set('installBehavior', e.target.value as PackageConfig['installBehavior'])}><option value="system">System</option><option value="user">User</option></select></Field>
        <Field label="Minimum OS requirement"><input className={inputCls} disabled={dis} value={draft.minimumOs} onChange={e => set('minimumOs', e.target.value)} /></Field>
        <Field label="Restart behavior"><select className={inputCls} disabled={dis} value={draft.restartBehavior} onChange={e => set('restartBehavior', e.target.value as PackageConfig['restartBehavior'])}><option value="intune-decides">Determine from return codes</option><option value="none">No specific action</option><option value="allow">Allow restart</option><option value="force">Force restart</option></select></Field>
      </div>

      <fieldset className="space-y-1 rounded-xl border border-slate-200 p-3"><legend className="px-1 text-xs font-semibold text-slate-700">Return codes</legend>
        {draft.returnCodes.map((r, i) => (
          <div key={i} className="flex items-center gap-2">
            <input aria-label={`Return code ${i + 1}`} type="number" className={`${inputCls} w-28`} disabled={dis} value={r.code} onChange={e => set('returnCodes', draft.returnCodes.map((x, j) => (j === i ? { ...x, code: Number(e.target.value) } : x)))} />
            <select aria-label={`Return code ${i + 1} type`} className={`${inputCls} w-40`} disabled={dis} value={r.type} onChange={e => set('returnCodes', draft.returnCodes.map((x, j) => (j === i ? { ...x, type: e.target.value as ReturnCode['type'] } : x)))}>{RETURN_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select>
            <button type="button" aria-label={`Remove return code ${i + 1}`} className="text-slate-400 hover:text-red-600" disabled={dis} onClick={() => set('returnCodes', draft.returnCodes.filter((_, j) => j !== i))}><XCircle className="h-4 w-4" /></button>
          </div>
        ))}
        <Btn kind="secondary" disabled={dis} onClick={() => set('returnCodes', [...draft.returnCodes, { code: 0, type: 'success' }])}>Add return code</Btn>
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Dependencies"><textarea className={inputCls} rows={2} disabled={dis} value={draft.dependencies} onChange={e => set('dependencies', e.target.value)} /></Field>
        <Field label="Supersedence notes"><textarea className={inputCls} rows={2} disabled={dis} value={draft.supersedenceNotes} onChange={e => set('supersedenceNotes', e.target.value)} /></Field>
        <Field label="Assignment notes"><textarea className={inputCls} rows={2} disabled={dis} value={draft.assignmentNotes} onChange={e => set('assignmentNotes', e.target.value)} /></Field>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 p-3 text-xs">
        <span className="font-semibold text-slate-700">Logo</span>
        <input ref={icon} type="file" accept="image/png,image/jpeg" className="sr-only" aria-label="Choose logo image" onChange={e => { const f = e.target.files?.[0]; if (f) void winPackagerApi.uploadIcon(job.id, f).then(reload).catch(err => setError(errText(err))) }} />
        <Btn kind="secondary" disabled={dis} onClick={() => icon.current?.click()}>Upload logo</Btn>
        <span className="text-slate-500">{job.iconFile ? `Stored: ${job.iconFile}` : 'PNG or JPEG, up to 512 KB. Stored outside the package source.'}</span>
      </div>

      <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600">Source <span className="font-mono">{job.source.fileName}</span> · SHA-256 <span className="font-mono break-all">{job.source.sha256}</span> · Signature: {job.analysis.signature.status === 'unsigned' ? 'Unsigned' : `${SIGNATURE_LABEL[job.analysis.signature.status]}${job.analysis.signature.signer ? ` (${job.analysis.signature.signer})` : ''}`}</div>

      {unverified && (
        <label className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <input type="checkbox" className="mt-0.5" disabled={dis} checked={draft.acknowledgedUnverifiedCommands} onChange={e => set('acknowledgedUnverifiedCommands', e.target.checked)} />
          <span>These commands are <strong>{CONFIDENCE_LABEL[job.analysis.commands.confidence]}</strong>. I understand they have not been tested and must be validated on Windows before deployment.</span>
        </label>
      )}
      {problems.length > 0 && <Notice tone="warn"><p className="font-semibold">Fix before validating or packaging:</p><ul className="list-disc pl-4">{problems.map(p => <li key={p}>{p}</li>)}</ul></Notice>}
      {error && <Notice tone="error">{error}</Notice>}
      <Btn onClick={() => void save()} busy={saving} disabled={dis}>Save configuration</Btn>

      <div className="space-y-1 border-t border-slate-100 pt-3"><p className="text-xs font-semibold text-slate-700">Generated artifacts</p>
        <div className="flex flex-wrap gap-2">{artifacts.filter(f => f.kind === 'generated').map(f => (
          <Btn key={f.name} kind="secondary" disabled={!f.available} title={f.available ? undefined : 'Save a valid configuration first'} onClick={() => void download(f.name)}><Download className="h-3.5 w-3.5" />{f.name}</Btn>
        ))}</div></div>
    </div>
  )
}

function ValidateStep({ job, status, canValidate, reload }: { job: PackageJob; status: PackagerStatus | null; canValidate: boolean; reload: (j: PackageJob) => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const v = job.validation
  async function run() { setBusy(true); setError(null); try { reload(await winPackagerApi.validate(job.id)) } catch (e) { setError(errText(e)) } finally { setBusy(false) } }
  const worker = status?.windowsWorker
  return (
    <div className="space-y-3">
      {worker?.state === 'ready'
        ? <Notice tone="info">Windows worker <strong>{worker.name ?? 'connected'}</strong> is reachable{worker.canPackage ? '' : ', but IntuneWinAppUtil.exe is not configured on it'}.</Notice>
        : <Notice tone="warn"><strong>API Unavailable.</strong> {worker?.reason ?? 'No Windows worker is configured.'} Installers are never run on this server. {NOT_TESTED}.</Notice>}
      <p className="text-xs text-slate-600">The worker installs silently, checks detection, uninstalls, then checks detection no longer succeeds. The package is only marked validated when all four steps pass.</p>
      {job.state === 'processing' && <Notice tone="info"><Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" />{job.stateReason ?? 'Working…'}</Notice>}
      {v && (
        <div className="space-y-2">
          <Notice tone={v.outcome === 'validated' ? 'info' : v.outcome === 'failed' ? 'error' : 'warn'}><strong>{v.outcome === 'validated' ? 'Validated' : v.outcome === 'failed' ? 'Validation Failed' : 'Not tested'}.</strong> {v.message}</Notice>
          {v.steps.length > 0 && <table className="w-full text-xs"><thead><tr className="text-left text-slate-500"><th>Step</th><th>Result</th><th>Exit</th><th>Duration</th><th>Reboot</th></tr></thead><tbody>
            {v.steps.map(s => <tr key={s.name} className="border-t border-slate-100 align-top"><td className="py-1.5 font-mono">{s.name}</td><td>{s.status === 'pass' ? <span className="text-emerald-700">pass</span> : <span className="text-red-700">{s.status}</span>}</td><td>{s.exitCode ?? '—'}</td><td>{s.durationMs !== undefined ? `${s.durationMs} ms` : '—'}</td><td>{s.rebootIndicated ? 'yes' : 'no'}</td></tr>)}</tbody></table>}
          {v.steps.filter(s => s.stdout || s.stderr).map(s => <details key={s.name} className="rounded-lg border border-slate-200 p-2 text-xs"><summary className="cursor-pointer font-semibold">Logs — {s.name}</summary><pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-slate-900 p-2 text-[0.7rem] text-slate-100">{[s.stdout && `stdout:\n${s.stdout}`, s.stderr && `stderr:\n${s.stderr}`].filter(Boolean).join('\n\n')}</pre></details>)}
        </div>
      )}
      {error && <Notice tone="error">{error}</Notice>}
      <Btn onClick={() => void run()} busy={busy || job.state === 'processing'} disabled={!canValidate || !job.config}>{v ? 'Retry Windows validation' : 'Run Windows validation'}</Btn>
    </div>
  )
}

function CreateStep({ job, canValidate, reload, setStep }: { job: PackageJob; canValidate: boolean; reload: (j: PackageJob) => void; setStep: (n: number) => void }) {
  const [accept, setAccept] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const validated = job.validation?.outcome === 'validated'
  const o = job.output
  async function go(fn: () => Promise<PackageJob>) { setBusy(true); setError(null); try { reload(await fn()) } catch (e) { setError(errText(e)) } finally { setBusy(false) } }
  return (
    <div className="space-y-3">
      <Notice tone={validated ? 'info' : 'warn'}>{validated ? 'Windows validation passed.' : `${NOT_TESTED}. Validate on Windows first, or explicitly approve an untested package below.`}</Notice>
      <p className="text-xs text-slate-600">Only the Windows worker runs Microsoft's IntuneWinAppUtil.exe (kept outside the source folder). The output is named <span className="font-mono">{job.config ? `${job.config.appName}-${job.config.version}-${job.config.architecture}.intunewin` : '<AppName>-<Version>-<Architecture>.intunewin'}</span>. Packages over {fmtBytes(30 * 1024 ** 3)} are rejected.</p>
      {job.state === 'processing' && <Notice tone="info"><Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" />{job.stateReason ?? 'Working…'}</Notice>}
      {job.approval ? <p className="text-xs text-emerald-700"><CheckCircle2 className="mr-1 inline h-3.5 w-3.5" />Approved for packaging by {job.approval.by} at {new Date(job.approval.at).toLocaleString()}</p> : (
        <div className="space-y-2">
          {!validated && <label className="flex items-start gap-2 text-xs"><input type="checkbox" className="mt-0.5" checked={accept} onChange={e => setAccept(e.target.checked)} /><span>I accept that this package has <strong>not passed Windows validation</strong>.</span></label>}
          <Btn onClick={() => void go(() => winPackagerApi.approve(job.id, accept))} busy={busy} disabled={!canValidate || (!validated && !accept)}>Approve for packaging</Btn>
        </div>
      )}
      {job.approval && !o && <Btn onClick={() => void go(() => winPackagerApi.createPackage(job.id))} busy={busy || job.state === 'processing'} disabled={!canValidate}>Create .intunewin package</Btn>}
      {o && (
        <div className="space-y-1 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs">
          <p className="font-semibold text-emerald-800"><Package className="mr-1 inline h-3.5 w-3.5" />{o.fileName}</p>
          <p>{fmtBytes(o.sizeBytes)} · SHA-256 <span className="font-mono break-all">{o.sha256}</span>{o.workerName ? ` · built on ${o.workerName}` : ''}</p>
          <Btn kind="secondary" onClick={() => setStep(5)}>Continue to publishing guide <ChevronRight className="h-3.5 w-3.5" /></Btn>
        </div>
      )}
      {job.state === 'api-unavailable' && <Notice tone="warn"><strong>API Unavailable.</strong> {job.stateReason}</Notice>}
      {job.state === 'validation-failed' && <Notice tone="error"><strong>Validation Failed.</strong> {job.stateReason}</Notice>}
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  )
}

function GuideStep({ job, status, canPublish, reload }: { job: PackageJob; status: PackagerStatus | null; canPublish: boolean; reload: (j: PackageJob) => void }) {
  const [guide, setGuide] = useState<PublishingGuide | null>(null)
  const [tab, setTab] = useState<'intune' | 'ec'>('intune')
  const [files, setFiles] = useState<ArtifactFile[]>([])
  const [confirm, setConfirm] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmed, setConfirmed] = useState(() => job.events.some(e => e.action === 'publish-approval'))
  useEffect(() => {
    void winPackagerApi.guide(job.id).then(setGuide).catch(e => setError(errText(e)))
    void winPackagerApi.artifacts(job.id).then(r => setFiles(r.files)).catch(() => undefined)
  }, [job.id, job.updatedAt])
  async function dl(name: string) { try { await winPackagerApi.download(job.id, name, name === 'package' ? job.output?.fileName ?? name : name === 'source' ? job.source.fileName : name) } catch (e) { setError(errText(e)) } }
  if (!guide) return error ? <Notice tone="error">{error}</Notice> : <p className="text-xs text-slate-500"><Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" />Loading guide…</p>
  if (!guide.ready) return <Notice tone="warn">{guide.banner}</Notice>
  const sections = tab === 'intune' ? guide.intune : guide.endpointCentral
  return (
    <div className="space-y-4">
      {guide.banner && <Notice tone="warn">{guide.banner}</Notice>}
      <div className="flex flex-wrap gap-2">{files.filter(f => f.available).map(f => <Btn key={f.name} kind="secondary" onClick={() => void dl(f.name)}><Download className="h-3.5 w-3.5" />{f.name === 'package' ? '.intunewin' : f.name === 'source' ? 'original source' : f.name}</Btn>)}</div>
      <div role="tablist" className="flex gap-1 border-b border-slate-200">
        {([['intune', 'Intune / Company Portal'], ['ec', 'Endpoint Central']] as const).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} type="button" onClick={() => setTab(id)} className={`px-3 py-1.5 text-xs font-bold ${tab === id ? 'border-b-2 border-blue-600 text-blue-700' : 'text-slate-500'}`}>{label}</button>
        ))}
      </div>
      {tab === 'ec' && <Notice tone="info">{guide.endpointCentralApi.message}</Notice>}
      {sections.map(s => (
        <section key={s.title} className="rounded-xl border border-slate-200 p-3">
          <h4 className="mb-1 text-xs font-bold text-slate-800">{s.title}</h4>
          {s.items.map(i => (
            <div key={i.label} className="flex items-start gap-2 border-t border-slate-100 py-1.5 text-xs first:border-0"><span className="w-48 flex-shrink-0 font-semibold text-slate-600">{i.label}</span><span className="min-w-0 flex-1 whitespace-pre-wrap break-all font-mono text-slate-900">{i.value}</span>{i.copy && <CopyButton value={i.value} label={i.label} />}</div>
          ))}
          {s.notes?.map(n => <p key={n} className="mt-1 text-[0.7rem] text-amber-800">• {n}</p>)}
        </section>
      ))}
      <div className="space-y-2 rounded-xl border border-slate-200 p-3">
        <p className="text-xs font-bold text-slate-800">Publishing</p>
        <p className="text-xs text-slate-600">Nothing is published, assigned or deployed automatically. Follow the guide manually, starting with a pilot group.</p>
        <label className="flex items-start gap-2 text-xs"><input type="checkbox" className="mt-0.5" disabled={!canPublish || confirmed} checked={confirm || confirmed} onChange={e => setConfirm(e.target.checked)} /><span>I confirm I will publish this package manually{job.validation?.outcome === 'validated' ? '' : ' and that it has not been validated on Windows'}.</span></label>
        <div className="flex flex-wrap items-center gap-2">
          <Btn disabled={!canPublish || !confirm || confirmed} onClick={() => { void winPackagerApi.confirmPublishing(job.id).then(j => { setConfirmed(true); reload(j) }).catch(e => setError(errText(e))) }}>Record publishing approval</Btn>
          <Btn kind="secondary" disabled title={status?.publishing.intune.reason}>Publish to Intune (disabled)</Btn>
        </div>
        <p className="text-[0.7rem] text-slate-500">{status?.publishing.intune.reason ?? 'Publish to Intune is disabled until Microsoft Graph permissions and implementation are verified.'}</p>
        {confirmed && <p className="text-xs text-emerald-700"><CheckCircle2 className="mr-1 inline h-3.5 w-3.5" />Publishing approval recorded in the audit log.</p>}
      </div>
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

function suggestedStep(job: PackageJob | null): number {
  if (!job) return 0
  if (job.output) return 5
  if (job.approval) return 4
  if (job.validation) return 3
  if (job.config) return 2
  return 1
}

export function WindowsPackageBuilderPage({ onBack, viewerRole }: { onBack: () => void; viewerRole?: string }) {
  const permissions = usePermissions()
  const can = (key: string): boolean => hasPermission(viewerRole ?? '', permissions, key)
  const [status, setStatus] = useState<PackagerStatus | null>(null)
  const [jobs, setJobs] = useState<PackageJob[]>([])
  const [selected, setSelected] = useState<PackageJob | null>(null)
  const [step, setStep] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const refreshList = useCallback(async () => {
    try { setJobs(await winPackagerApi.jobs()); setError(null) } catch (e) { setError(errText(e)) }
  }, [])
  useEffect(() => {
    let live = true
    void winPackagerApi.jobs().then(j => { if (live) setJobs(j) }).catch(e => { if (live) setError(errText(e)) })
    void winPackagerApi.status().then(s => { if (live) setStatus(s) }).catch(() => undefined)
    return () => { live = false }
  }, [])

  const apply = useCallback((job: PackageJob) => {
    setSelected(job)
    setJobs(prev => (prev.some(j => j.id === job.id) ? prev.map(j => (j.id === job.id ? job : j)) : [job, ...prev]))
  }, [])
  const choose = (job: PackageJob) => { setSelected(job); setStep(suggestedStep(job)) }

  // Poll while the worker is busy so state changes appear without a manual refresh.
  const selectedId = selected?.id; const processing = selected?.state === 'processing'
  useEffect(() => {
    if (!selectedId || !processing) return
    const timer = window.setInterval(() => { void winPackagerApi.job(selectedId).then(apply).catch(() => undefined) }, 2000)
    return () => window.clearInterval(timer)
  }, [selectedId, processing, apply])

  const canRead = can('winPackager.read')
  if (!canRead) return <div className="p-6"><Notice tone="warn">You do not have permission to view Windows Package Builder.</Notice></div>

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={onBack} className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Back to dashboard"><ArrowLeft className="h-4 w-4" /></button>
        <div><h1 className="text-lg font-bold text-slate-900">Windows Package Builder</h1><p className="text-xs text-slate-500">Inspect an installer, validate it on Windows, build the .intunewin, and publish with a guided checklist.</p></div>
        <div className="ml-auto flex items-center gap-2 text-xs">
          <span className={`rounded-full px-2.5 py-0.5 font-bold ${status?.windowsWorker.state === 'ready' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-700'}`}>Windows worker: {status?.windowsWorker.state === 'ready' ? 'Ready' : 'API Unavailable'}</span>
          <Btn kind="secondary" onClick={() => { void refreshList(); void winPackagerApi.status().then(setStatus).catch(() => undefined) }}><RefreshCw className="h-3.5 w-3.5" />Refresh</Btn>
        </div>
      </div>
      {error && <Notice tone="error">{error}</Notice>}

      <div className="grid gap-4 lg:grid-cols-[17rem_1fr]">
        <aside className="space-y-2">
          <Btn onClick={() => { setSelected(null); setStep(0) }} disabled={!can('winPackager.write')}><Upload className="h-3.5 w-3.5" />New package</Btn>
          <ul className="space-y-1" aria-label="Package jobs">
            {jobs.length === 0 && <li className="text-xs text-slate-500">No package jobs yet.</li>}
            {jobs.map(j => (
              <li key={j.id}><button type="button" onClick={() => choose(j)} className={`w-full rounded-xl border px-3 py-2 text-left text-xs ${selected?.id === j.id ? 'border-blue-400 bg-blue-50' : 'border-slate-200 hover:bg-slate-50'}`}>
                <span className="flex items-center gap-1 font-semibold text-slate-800"><FileArchive className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" /><span className="truncate">{j.config?.appName ?? j.source.fileName}</span></span>
                <span className="mt-1 flex items-center justify-between"><StateBadge state={j.state} /><span className="text-[0.65rem] text-slate-400">{new Date(j.createdAt).toLocaleDateString()}</span></span>
              </button></li>
            ))}
          </ul>
        </aside>

        <main className="min-w-0 space-y-4 rounded-2xl border border-slate-200 bg-white p-4">
          <ol className="flex flex-wrap gap-1" aria-label="Workflow steps">
            {STEPS.map((label, i) => {
              const reachable = i === 0 || !!selected
              return <li key={label}><button type="button" disabled={!reachable} aria-current={step === i ? 'step' : undefined} onClick={() => setStep(i)}
                className={`rounded-full px-3 py-1 text-[0.7rem] font-bold ${step === i ? 'bg-blue-600 text-white' : reachable ? 'bg-slate-100 text-slate-700 hover:bg-slate-200' : 'bg-slate-50 text-slate-300'}`}>{i + 1}. {label}</button></li>
            })}
          </ol>
          {selected && (
            <div className="flex flex-wrap items-center gap-2 text-xs"><StateBadge state={selected.state} /><span className="text-slate-600">{selected.stateReason}</span>
              {can('winPackager.validate') && <button type="button" aria-label="Delete job" title="Delete job workspace" className="ml-auto text-slate-400 hover:text-red-600"
                onClick={() => { if (window.confirm('Delete this job and all of its files?')) void winPackagerApi.remove(selected.id).then(() => { setSelected(null); setStep(0); void refreshList() }).catch(e => setError(errText(e))) }}><Trash2 className="h-4 w-4" /></button>}
            </div>
          )}
          {step === 0 && <UploadStep status={status} canWrite={can('winPackager.write')} onUploaded={j => { apply(j); setStep(1) }} />}
          {step > 0 && !selected && <Notice tone="warn">Upload a source or pick a job from the list.</Notice>}
          {selected && step === 1 && <InspectStep key={selected.id + selected.updatedAt} job={selected} canWrite={can('winPackager.write')} reload={apply} />}
          {selected && step === 2 && <ReviewStep key={selected.id + (selected.config ? '1' : '0')} job={selected} canWrite={can('winPackager.write')} reload={apply} />}
          {selected && step === 3 && <ValidateStep job={selected} status={status} canValidate={can('winPackager.validate')} reload={apply} />}
          {selected && step === 4 && <CreateStep job={selected} canValidate={can('winPackager.validate')} reload={apply} setStep={setStep} />}
          {selected && step === 5 && <GuideStep job={selected} status={status} canPublish={can('winPackager.publish')} reload={apply} />}
          {selected && step > 0 && step < 5 && <div className="flex justify-between border-t border-slate-100 pt-3"><Btn kind="secondary" onClick={() => setStep(step - 1)}>Back</Btn><Btn kind="secondary" onClick={() => setStep(step + 1)}>Next <ChevronRight className="h-3.5 w-3.5" /></Btn></div>}
          {selected?.state === 'unsupported' && step > 1 && <Notice tone="error"><ShieldAlert className="mr-1 inline h-3.5 w-3.5" />This source is Unsupported: {selected.stateReason}</Notice>}
        </main>
      </div>
    </div>
  )
}
