import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertCircle, CheckCircle, ExternalLink, Send, X } from 'lucide-react'
import { appIntelApi, RequestFailure } from '../../api/appIntel'
import type { AppRequestRecord, RequestKind, RequestPreview } from '../../api/appIntel'

interface Props {
  appKey: string
  appName: string
  kind: RequestKind
  onClose: () => void
  /** Called after a request was created (or an existing one was found) so the caller can refresh its row. */
  onDone: (record: AppRequestRecord) => void
}

const COPY: Record<RequestKind, { title: string; action: string; done: string }> = {
  jira: { title: 'Create packaging request', action: 'Create Jira request', done: 'Packaging request created' },
  slack: { title: 'Notify in Slack', action: 'Send to Slack', done: 'Slack notification sent' },
}

/** Shows exactly what will be sent and where, and only sends after an explicit confirmation. */
export function RequestDialog({ appKey, appName, kind, onClose, onDone }: Props) {
  const [preview, setPreview] = useState<RequestPreview | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<AppRequestRecord | null>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const copy = COPY[kind]

  useEffect(() => {
    let live = true
    appIntelApi.previewRequest(appKey, kind)
      .then(p => { if (live) setPreview(p) })
      .catch(e => { if (live) setLoadError(e instanceof Error ? e.message : 'Could not load the request preview') })
    return () => { live = false }
  }, [appKey, kind])
  useEffect(() => { closeRef.current?.focus() }, [])
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && !sending) onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose, sending])

  const send = async () => {
    setSending(true); setError(null)
    try {
      const record = await appIntelApi.createRequest(appKey, kind)
      setCreated(record); onDone(record)
    } catch (e) {
      if (e instanceof RequestFailure && e.code === 'duplicate' && e.existing) onDone(e.existing)
      setError(e instanceof Error ? e.message : 'The request could not be created')
    } finally { setSending(false) }
  }

  const blocked = !preview || !preview.eligible || !preview.configured || !!preview.duplicate
  const text = preview?.content ? (kind === 'slack' ? preview.content.slackText : preview.content.body) : ''
  const label = `${copy.title} — ${appName}`

  return createPortal(
    <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 100001, background: 'rgba(15,23,42,0.45)' }}
      onClick={e => { if (e.target === e.currentTarget && !sending) onClose() }}>
      <div role="dialog" aria-modal="true" aria-label={label} className="flex max-h-[90vh] w-full max-w-xl flex-col rounded-2xl bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-sm font-bold text-slate-800">{copy.title}</h2>
            <p className="text-[0.7rem] text-slate-500">{appName}</p>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} disabled={sending} aria-label="Close dialog" className="grid h-8 w-8 place-items-center rounded-xl border border-slate-200 text-slate-500 hover:text-slate-700 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {loadError && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{loadError}</p>}
          {!preview && !loadError && <div aria-busy="true" className="h-24 animate-pulse rounded-xl bg-slate-100" />}

          {preview && !created && (
            <>
              <p className="text-xs text-slate-600"><span className="font-semibold">Destination:</span> {preview.destination}
                {preview.content && <> · <span className="font-semibold">Priority:</span> {preview.content.priority} <span className="text-slate-400">({preview.content.priorityBasis})</span></>}</p>
              {!preview.eligible && <p role="alert" className="flex items-start gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"><AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />{preview.reason}</p>}
              {preview.eligible && !preview.configured && <p role="alert" className="flex items-start gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"><AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />{preview.configuredNote}</p>}
              {preview.duplicate && (
                <p role="status" className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
                  {kind === 'jira' ? 'A packaging request for this app and version already exists' : 'A Slack notification for this app and version was already sent in the last hour'}
                  {preview.duplicate.externalKey && preview.duplicate.externalUrl && <> — <a href={preview.duplicate.externalUrl} target="_blank" rel="noreferrer" className="font-semibold underline">{preview.duplicate.externalKey}</a></>}.
                </p>
              )}
              {preview.content && (
                <div>
                  <p className="mb-1 text-[0.65rem] font-bold uppercase tracking-wide text-slate-500">{kind === 'jira' ? `Summary: ${preview.content.title}` : 'Message'}</p>
                  <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[0.68rem] leading-relaxed text-slate-700">{text}</pre>
                </div>
              )}
              <p className="text-[0.65rem] text-slate-400">This content is built on the server from the latest sync. Sending it creates {kind === 'jira' ? 'a Jira Task' : 'a Slack message'} — nothing is packaged, published or deployed.</p>
            </>
          )}

          {created && (
            <p role="status" className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-xs text-emerald-800">
              <CheckCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span>{copy.done}.{created.externalKey && created.externalUrl && <> <a href={created.externalUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold underline">{created.externalKey}<ExternalLink className="h-3 w-3" /></a></>}</span>
            </p>
          )}
          {error && <p role="alert" className="flex items-start gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"><AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />{error}</p>}
        </div>

        <footer className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">
          <button type="button" onClick={onClose} disabled={sending} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300">{created ? 'Close' : 'Cancel'}</button>
          {!created && (
            <button type="button" onClick={() => void send()} disabled={blocked || sending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400">
              <Send className="h-3.5 w-3.5" />{sending ? 'Sending…' : copy.action}
            </button>
          )}
        </footer>
      </div>
    </div>,
    document.body,
  )
}
