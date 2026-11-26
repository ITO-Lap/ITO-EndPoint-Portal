import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { MarkdownText } from '../ui/MarkdownText'
import { oceanApi, type OceanDocView } from '../../api/ocean'
import type { CopilotCitation } from '../../api/copilot'

/** Shows the indexed source document behind an Ocean answer, with the cited section highlighted. */
export function OceanDocViewer({ citation, onClose }: { citation: CopilotCitation | null; onClose: () => void }) {
  const [doc, setDoc] = useState<OceanDocView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const cited = useRef<HTMLDivElement | null>(null)
  const docId = citation?.docId

  useEffect(() => {
    if (!docId) return
    let cancelled = false
    void Promise.resolve().then(() => { if (!cancelled) { setLoading(true); setError(null); setDoc(null) } })
    oceanApi.viewDoc(docId)
      .then(d => { if (!cancelled) setDoc(d) })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load the document') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [docId])

  useEffect(() => { if (doc) cited.current?.scrollIntoView({ block: 'center' }) }, [doc])

  if (!citation) return null
  return (
    <Modal open title={citation.title ?? 'Source documentation'} description={citation.path ? `${citation.path}${doc?.lastIndexedAt ? ` · indexed ${new Date(doc.lastIndexedAt).toLocaleString()}` : ''}` : undefined} onClose={onClose} size="lg">
      {loading && <div className="flex items-center gap-2 py-6 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading the document…</div>}
      {error && <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-xs text-amber-800"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{error === 'Document not found.' ? 'This document is no longer available, or you do not have access to it.' : error}</div>}
      {doc && (
        <div className="max-h-[70vh] space-y-3 overflow-y-auto pr-1">
          {doc.chunks.map(c => {
            const isCited = c.id === citation.chunkId
            return (
              <div key={c.id} ref={isCited ? cited : undefined} className={`rounded-xl border px-3.5 py-3 ${isCited ? 'border-sky-300 bg-sky-50/60 ring-2 ring-sky-200' : 'border-slate-200 bg-white'}`}>
                <p className="text-[0.7rem] font-semibold text-slate-500">{c.heading}{isCited && <span className="ml-2 rounded-full bg-sky-100 px-1.5 py-0.5 text-sky-700 normal-case">Cited in this answer</span>}</p>
                <div className="mt-2 text-xs leading-relaxed text-slate-700"><MarkdownText text={c.text} /></div>
              </div>
            )
          })}
        </div>
      )}
    </Modal>
  )
}
