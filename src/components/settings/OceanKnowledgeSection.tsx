import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, BookOpen, CheckCircle2, Loader2, RefreshCw, Trash2, Upload, XCircle } from 'lucide-react'
import { useToast } from '../ui/toastHooks'
import { oceanApi, type AccessClass, type OceanDocSummary, type OceanEvent, type OceanGap, type OceanReindexReport, type OceanStatus } from '../../api/ocean'

const MAX_BYTES = 1_000_000
const fmt = (iso: string | null): string => (iso ? new Date(iso).toLocaleString() : '—')

function Tile({ label, value, hint, tone = 'text-slate-900' }: { label: string; value: string; hint?: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-1 text-lg font-bold ${tone}`}>{value}</p>
      {hint && <p className="mt-0.5 text-[0.65rem] text-slate-500">{hint}</p>}
    </div>
  )
}

/** Settings → Ocean Knowledge: administrators manage which documents Ocean may use as sources. */
export function OceanKnowledgeSection({ canManage }: { canManage: boolean }) {
  const { notify } = useToast()
  const [docs, setDocs] = useState<OceanDocSummary[] | null>(null)
  const [status, setStatus] = useState<OceanStatus | null>(null)
  const [events, setEvents] = useState<OceanEvent[]>([])
  const [gaps, setGaps] = useState<OceanGap[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [report, setReport] = useState<OceanReindexReport | null>(null)
  const [form, setForm] = useState({ filename: '', title: '', classification: 'general' as AccessClass, content: '' })
  const [formErrors, setFormErrors] = useState<string[]>([])
  const fileInput = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const [d, s, e, g] = await Promise.all([oceanApi.listDocs(), oceanApi.status(), oceanApi.events(), oceanApi.gaps()])
      setDocs(d); setStatus(s); setEvents(e); setGaps(g)
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not load the knowledge base') }
  }, [])
  useEffect(() => { if (canManage) void Promise.resolve().then(load) }, [canManage, load])

  if (!canManage) return <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">Managing Ocean's knowledge base requires administrator access.</div>

  const act = async (key: string, fn: () => Promise<unknown>, okMessage: string) => {
    setBusy(key)
    try { await fn(); notify('success', 'Ocean Knowledge', okMessage); await load() }
    catch (err) { notify('error', 'Ocean Knowledge', err instanceof Error ? err.message : 'The action failed') }
    finally { setBusy(null) }
  }

  const reindex = async (force: boolean) => {
    setBusy(force ? 'force' : 'reindex'); setReport(null)
    try { setReport(await oceanApi.reindexAll(force)); await load() }
    catch (err) { notify('error', 'Ocean Knowledge', err instanceof Error ? err.message : 'Re-index failed') }
    finally { setBusy(null) }
  }

  const pickFile = (file: File | undefined) => {
    if (!file) return
    if (file.size > MAX_BYTES) { setFormErrors([`That file is larger than ${Math.round(MAX_BYTES / 1000)} KB.`]); return }
    const reader = new FileReader()
    reader.onload = () => setForm(f => ({ ...f, filename: f.filename || file.name, content: String(reader.result ?? '') }))
    reader.readAsText(file)
  }

  const save = async () => {
    setBusy('save'); setFormErrors([])
    try {
      await oceanApi.upload({ filename: form.filename.trim(), content: form.content, ...(form.title.trim() ? { title: form.title.trim() } : {}), classification: form.classification })
      notify('success', 'Ocean Knowledge', `${form.filename.trim()} was indexed.`)
      setForm({ filename: '', title: '', classification: 'general', content: '' })
      await load()
    } catch (err) { setFormErrors([err instanceof Error ? err.message : 'The document could not be saved']) }
    finally { setBusy(null) }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-bold text-slate-900">Ocean Knowledge</h2>
        <p className="mt-0.5 text-xs text-slate-500">The approved documentation Ocean answers from. Secrets, .env files, keys and logs are never indexed; administrator-only documents are shown only to roles with this permission.</p>
      </div>

      {error && <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700"><AlertTriangle className="h-4 w-4 shrink-0" />{error}<button type="button" onClick={() => void load()} className="ml-auto font-semibold underline">Retry</button></div>}
      {!docs && !error && <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading the knowledge base…</div>}

      {status && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Tile label="Documents" value={`${status.documents.enabled} / ${status.documents.total}`} hint={`${status.documents.excluded} excluded · ${status.documents.disabled} disabled`} />
          <Tile label="Sections" value={String(status.sections)} hint={`${status.documents.adminOnly} documents admin-only`} />
          <Tile label="Last indexed" value={status.lastIndexedAt ? new Date(status.lastIndexedAt).toLocaleDateString() : 'Never'} hint={status.lastIndexedAt ? new Date(status.lastIndexedAt).toLocaleTimeString() : 'Run a re-index'} />
          <Tile label="AI model" value={status.provider.aiConfigured ? 'Configured' : 'Not configured'} tone={status.provider.aiConfigured ? 'text-emerald-600' : 'text-amber-600'} hint={status.provider.aiConfigured ? 'Written answers enabled' : 'Ocean shows document excerpts only'} />
          <Tile label="Search" value="Local" hint="Keyword + semantic + typo tolerance, on this server; no external API" />
        </div>
      )}
      {status && !status.repoDocsFolderFound && <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">No <code>docs/</code> folder was found next to this deployment, so no repository documentation can be scanned here. Add documents below, or set <code>OCEAN_DOCS_ROOT</code> on the server.</div>}

      {status && (
        <div className="rounded-[18px] border border-slate-200 bg-white p-4 shadow-sm shadow-slate-900/5">
          <div className="flex items-start gap-3">
            <button type="button" role="switch" aria-checked={status.web.fallbackEnabled} aria-label="Web fallback" disabled={!!busy || (!status.web.ready && !status.web.fallbackEnabled)}
              onClick={() => void act('web', () => oceanApi.setWebFallback(!status.web.fallbackEnabled), status.web.fallbackEnabled ? 'Web fallback switched off.' : 'Web fallback switched on.')}
              className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition disabled:opacity-40 ${status.web.fallbackEnabled ? 'bg-emerald-500' : 'bg-slate-300'}`}><span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${status.web.fallbackEnabled ? 'left-[1.1rem]' : 'left-0.5'}`} /></button>
            <div className="min-w-0 text-xs">
              <p className="font-semibold text-slate-900">Web fallback <span className="ml-1 font-normal text-slate-500">({status.web.fallbackEnabled ? 'on' : 'off'} · provider: {status.web.provider})</span></p>
              <p className="mt-0.5 text-slate-500">When the documentation has no answer, Ocean can add a few public web results. They are always labelled <b>external, not verified project documentation</b>. Only a short keyword query is sent (never the question text, names, e-mail addresses, ids or anything credential-like). Off by default.</p>
              {!status.web.ready && <p className="mt-1 text-amber-700">Not available: {status.web.reason ?? 'no provider configured'}.</p>}
            </div>
          </div>
        </div>
      )}

      <div className="rounded-[18px] border border-slate-200 bg-white p-4 shadow-sm shadow-slate-900/5">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => void reindex(false)} disabled={!!busy || !!status?.indexing} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-600 disabled:opacity-60">{busy === 'reindex' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Re-index changed documents</button>
          <button type="button" onClick={() => void reindex(true)} disabled={!!busy || !!status?.indexing} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">{busy === 'force' && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Full re-index</button>
          {report && <span className="text-xs text-slate-600">{report.indexed} indexed · {report.unchanged} unchanged · {report.excluded} excluded · {report.errors} errors · {report.removed} removed · {(report.durationMs / 1000).toFixed(1)} s</span>}
        </div>
      </div>

      <div className="rounded-[18px] border border-slate-200 bg-white shadow-sm shadow-slate-900/5">
        <div className="border-b border-slate-100 px-5 py-3.5"><p className="text-xs font-semibold text-slate-900">Add or update an approved document</p><p className="mt-0.5 text-[0.65rem] text-slate-500">Markdown or text, up to 1 MB. Using an existing file name updates that document. Documents containing credentials are rejected.</p></div>
        <div className="grid gap-3 px-5 py-4 sm:grid-cols-3">
          <label className="text-xs font-medium text-slate-700">File name<input value={form.filename} onChange={e => setForm(f => ({ ...f, filename: e.target.value }))} placeholder="vpn-guide.md" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs" /></label>
          <label className="text-xs font-medium text-slate-700">Title (optional)<input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="From the first heading" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs" /></label>
          <label className="text-xs font-medium text-slate-700">Who can see it<select value={form.classification} onChange={e => setForm(f => ({ ...f, classification: e.target.value as AccessClass }))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs"><option value="general">Everyone who can use Ocean</option><option value="admin">Administrators only</option></select></label>
          <label className="text-xs font-medium text-slate-700 sm:col-span-3">Content<textarea value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))} rows={6} placeholder="Paste markdown here, or choose a file" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-xs" /></label>
          {formErrors.length > 0 && <div className="sm:col-span-3 space-y-1 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{formErrors.map(e => <p key={e}>{e}</p>)}</div>}
          <div className="flex items-center gap-2 sm:col-span-3">
            <button type="button" onClick={() => void save()} disabled={busy === 'save' || !form.filename.trim() || !form.content.trim()} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-600 disabled:opacity-60">{busy === 'save' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BookOpen className="h-3.5 w-3.5" />} Save and index</button>
            <input ref={fileInput} type="file" accept=".md,.markdown,.txt,text/markdown,text/plain" className="hidden" onChange={e => { pickFile(e.target.files?.[0]); e.target.value = '' }} />
            <button type="button" onClick={() => fileInput.current?.click()} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"><Upload className="h-3.5 w-3.5" /> Choose file…</button>
          </div>
        </div>
      </div>

      {docs && (
        <div className="overflow-hidden rounded-[18px] border border-slate-200 bg-white shadow-sm shadow-slate-900/5">
          <div className="border-b border-slate-100 px-5 py-3.5"><p className="text-xs font-semibold text-slate-900">Indexed documents ({docs.length})</p></div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-xs">
              <thead className="bg-slate-50 text-slate-500"><tr><th className="px-4 py-2 font-semibold">Document</th><th className="px-4 py-2 font-semibold">Status</th><th className="px-4 py-2 font-semibold">Access</th><th className="px-4 py-2 font-semibold">Use as source</th><th className="px-4 py-2 font-semibold">Sections</th><th className="px-4 py-2 font-semibold">Last indexed</th><th className="px-4 py-2 font-semibold">Actions</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {docs.map(d => (
                  <tr key={d.id} className="align-top">
                    <td className="px-4 py-2.5"><p className="font-semibold text-slate-800">{d.title}</p><p className="font-mono text-[0.65rem] text-slate-400">{d.path}</p></td>
                    <td className="px-4 py-2.5">{d.status === 'indexed' ? <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" />Indexed</span> : <span className="inline-flex items-start gap-1 text-amber-700"><XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>{d.status === 'excluded' ? 'Excluded' : 'Error'}{d.statusReason && <span className="block max-w-[16rem] text-[0.65rem] text-slate-500">{d.statusReason}</span>}</span></span>}</td>
                    <td className="px-4 py-2.5"><select value={d.classification} onChange={e => void act(`cls-${d.id}`, () => oceanApi.patchDoc(d.id, { classification: e.target.value as AccessClass }), 'Access updated.')} disabled={!!busy} className="rounded-lg border border-slate-200 px-2 py-1 text-xs"><option value="general">Everyone</option><option value="admin">Admins only</option></select></td>
                    <td className="px-4 py-2.5"><button type="button" role="switch" aria-checked={d.enabled} aria-label={`Use ${d.title} as a source`} disabled={!!busy || d.status !== 'indexed'} onClick={() => void act(`en-${d.id}`, () => oceanApi.patchDoc(d.id, { enabled: !d.enabled }), d.enabled ? 'Document disabled.' : 'Document enabled.')} className={`relative h-5 w-9 rounded-full transition disabled:opacity-40 ${d.enabled ? 'bg-emerald-500' : 'bg-slate-300'}`}><span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${d.enabled ? 'left-[1.1rem]' : 'left-0.5'}`} /></button></td>
                    <td className="px-4 py-2.5 text-slate-600">{d.sections}</td>
                    <td className="px-4 py-2.5 text-slate-500">{fmt(d.lastIndexedAt)}</td>
                    <td className="px-4 py-2.5"><div className="flex items-center gap-2">
                      <button type="button" onClick={() => void act(`re-${d.id}`, () => oceanApi.reindexDoc(d.id), 'Document re-indexed.')} disabled={!!busy} title="Re-index this document" className="rounded-md border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50 disabled:opacity-50">{busy === `re-${d.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}</button>
                      {d.source === 'uploaded' && <button type="button" onClick={() => { if (window.confirm(`Remove ${d.path} from Ocean's knowledge base?`)) void act(`del-${d.id}`, () => oceanApi.deleteDoc(d.id), 'Document removed.') }} disabled={!!busy} title="Remove this uploaded document" className="rounded-md border border-red-200 p-1.5 text-red-500 hover:bg-red-50 disabled:opacity-50"><Trash2 className="h-3.5 w-3.5" /></button>}
                    </div></td>
                  </tr>
                ))}
                {!docs.length && <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">No documents are indexed yet. Run a re-index, or add a document above.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {gaps.length > 0 && (
        <div className="rounded-[18px] border border-amber-200 bg-amber-50/50 p-4 shadow-sm shadow-slate-900/5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-slate-900">Documentation gaps <span className="font-normal text-slate-500">· questions Ocean could not answer from the documentation (most asked first)</span></p>
            <button type="button" onClick={() => void act('gaps', () => oceanApi.clearGaps(), 'Gap list cleared.')} disabled={!!busy} className="text-[0.65rem] font-semibold text-slate-500 hover:underline">Clear</button>
          </div>
          <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs text-slate-700">
            {gaps.slice(0, 25).map(g => <li key={g.question}><b>{g.count}×</b> {g.question}{g.page ? <span className="text-slate-400"> · on {g.page}</span> : null} <span className="text-slate-400">· last {new Date(g.lastAt).toLocaleDateString()}</span></li>)}
          </ul>
          <p className="mt-2 text-[0.65rem] text-slate-500">Add or update a document above to close a gap; masked and shortened, no personal identifiers are kept.</p>
        </div>
      )}

      {status && (
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="rounded-[18px] border border-slate-200 bg-white p-4 shadow-sm shadow-slate-900/5">
            <p className="text-xs font-semibold text-slate-900">Usage since {new Date(status.usage.since).toLocaleString()}</p>
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-600">
              <dt>Questions</dt><dd className="font-semibold text-slate-800">{status.usage.queries}</dd>
              <dt>Answered from documentation</dt><dd className="font-semibold text-slate-800">{status.usage.documentationAnswers}</dd>
              <dt>No verified answer</dt><dd className="font-semibold text-slate-800">{status.usage.noDocumentation}</dd>
              <dt>Web fallback searches</dt><dd className="font-semibold text-slate-800">{status.usage.webFallbacks}</dd>
              <dt>Blocked (secrets / instructions)</dt><dd className="font-semibold text-slate-800">{status.usage.blockedRequests}</dd>
              <dt>Rate limited</dt><dd className="font-semibold text-slate-800">{status.usage.rateLimited}</dd>
              <dt>Errors</dt><dd className="font-semibold text-slate-800">{status.usage.errors}</dd>
              <dt>Average retrieval time</dt><dd className="font-semibold text-slate-800">{status.usage.avgRetrievalMs} ms</dd>
            </dl>
            <p className="mt-2 text-[0.65rem] text-slate-400">Counts are kept across restarts.</p>
          </div>
          <div className="rounded-[18px] border border-slate-200 bg-white p-4 shadow-sm shadow-slate-900/5">
            <p className="text-xs font-semibold text-slate-900">Recent activity</p>
            <ul className="mt-2 max-h-48 space-y-1.5 overflow-y-auto text-xs text-slate-600">
              {events.slice(0, 30).map((e, i) => <li key={`${e.at}-${i}`}><span className="text-slate-400">{new Date(e.at).toLocaleString()}</span> · <b className="text-slate-700">{e.type}</b> · {e.actor} · {e.detail}</li>)}
              {!events.length && <li className="text-slate-400">No activity recorded yet.</li>}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}
