import { BookOpen, Database, Info, Waves, User } from 'lucide-react'
import type { AnswerMode, CopilotCitation, DocsStatus } from '../../api/copilot'
import { MarkdownText } from '../ui/MarkdownText'

function formatFreshness(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso

  const diffMs = Date.now() - d.getTime()
  const diffMin = Math.round(diffMs / 60000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.round(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.round(diffHr / 24)
  if (diffDay < 7) return `${diffDay}d ago`
  return d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const chipClass = 'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.65rem] font-medium text-slate-500'
const chipStyle = { background: 'rgba(148,163,184,0.10)', borderColor: 'rgba(148,163,184,0.25)' }

function CitationBadge({ citation }: { citation: CopilotCitation }) {
  // Live data: say where it came from and when it was retrieved.
  const content = <>Source: {citation.source} · {citation.recordId} · retrieved {formatFreshness(citation.freshness)}</>
  if (citation.url) return (
    <a href={citation.url} target="_blank" rel="noreferrer" className={`${chipClass} hover:text-blue-600`} style={chipStyle} title={`External source: ${citation.recordId}`}>
      {citation.source} · {citation.recordId} · {formatFreshness(citation.freshness)}
    </a>
  )
  return <span className={chipClass} style={chipStyle} title={`${citation.source} · ${citation.recordId} · fetched ${citation.freshness}`}>{content}</span>
}

const MODE_LABEL: Partial<Record<AnswerMode, { label: string; icon: typeof BookOpen }>> = {
  documentation: { label: 'From documentation', icon: BookOpen },
  live: { label: 'Live data', icon: Database },
  mixed: { label: 'Documentation + live data', icon: BookOpen },
}

interface Props {
  role: 'user' | 'assistant'
  content: string
  citations?: CopilotCitation[]
  mode?: AnswerMode | undefined
  docsStatus?: DocsStatus | undefined
  onViewSource?: ((citation: CopilotCitation) => void) | undefined
}

export function CopilotMessageBubble({ role, content, citations, mode, docsStatus, onViewSource }: Props) {
  const isUser = role === 'user'
  const docCitations = (citations ?? []).filter(c => c.kind === 'doc')
  const webCitations = (citations ?? []).filter(c => c.kind === 'web')
  const otherCitations = (citations ?? []).filter(c => c.kind !== 'doc' && c.kind !== 'web')
  const modeInfo = !isUser && mode ? MODE_LABEL[mode] : undefined
  const noDocs = !isUser && !docCitations.length && (docsStatus === 'none' || docsStatus === 'admin-only' || docsStatus === 'not-indexed') && content.includes('could not find a verified answer')

  return (
    <div className={`flex items-start gap-2 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div
        className={`grid h-6 w-6 flex-shrink-0 place-items-center rounded-lg ${isUser ? 'bg-slate-700' : 'bg-gradient-to-br from-blue-700 via-sky-500 to-cyan-400'}`}
      >
        {isUser ? <User className="h-3 w-3 text-white" /> : <Waves className="h-3 w-3 text-white" />}
      </div>
      <div className={`flex min-w-0 max-w-[85%] flex-col gap-1.5 ${isUser ? 'items-end' : 'items-start'}`}>
        {modeInfo && (
          <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-[0.62rem] font-semibold text-sky-700">
            <modeInfo.icon className="h-3 w-3" />{modeInfo.label}
          </span>
        )}
        <div
          className={`max-w-full ${isUser ? 'whitespace-pre-wrap' : ''} break-words [overflow-wrap:anywhere] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
            isUser
              ? 'bg-slate-800 text-white rounded-tr-sm'
              : noDocs
                ? 'bg-amber-50 text-slate-700 border border-amber-200 rounded-tl-sm shadow-sm'
                : 'bg-white text-slate-700 border border-slate-200 rounded-tl-sm shadow-sm'
          }`}
        >
          {noDocs && <span className="mb-1 flex items-center gap-1 text-[0.65rem] font-semibold text-amber-700"><Info className="h-3 w-3" />No verified documentation found</span>}
          {isUser ? content : <MarkdownText text={content} compact />}
        </div>
        {docCitations.length > 0 && (
          <div className="flex min-w-0 max-w-full flex-col gap-1.5">
            <div className="flex min-w-0 max-w-full flex-wrap gap-1.5">
              {docCitations.map((c, i) => (
                <button
                  key={`${c.chunkId ?? c.recordId}-${i}`}
                  type="button"
                  onClick={() => onViewSource?.(c)}
                  title={`${c.title ?? ''} › ${c.section ?? ''} (${c.path ?? ''}) — indexed ${formatFreshness(c.freshness)}`}
                  className="inline-flex max-w-full items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-left text-[0.65rem] font-medium text-sky-700 hover:bg-sky-100"
                >
                  <BookOpen className="h-3 w-3 flex-shrink-0" /><span className="truncate">{c.recordId}</span>
                </button>
              ))}
            </div>
            <button type="button" onClick={() => onViewSource?.(docCitations[0]!)} className="self-start text-[0.65rem] font-semibold text-sky-700 hover:underline">View source documentation</button>
          </div>
        )}
        {webCitations.length > 0 && (
          <div className="flex min-w-0 max-w-full flex-col gap-1">
            <span className="text-[0.62rem] font-semibold text-amber-700">External web results — not verified project documentation</span>
            <div className="flex min-w-0 max-w-full flex-wrap gap-1.5">
              {webCitations.map((c, i) => (
                <a key={`${c.url}-${i}`} href={c.url} target="_blank" rel="noreferrer" title={c.url} className="inline-flex max-w-full items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[0.65rem] font-medium text-amber-800 hover:bg-amber-100"><span className="truncate">External · {c.recordId}</span></a>
              ))}
            </div>
          </div>
        )}
        {otherCitations.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {otherCitations.map((c, i) => (
              <CitationBadge key={`${c.source}-${c.recordId}-${i}`} citation={c} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
