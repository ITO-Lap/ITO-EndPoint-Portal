import { Sparkles, User } from 'lucide-react'
import type { CopilotCitation } from '../../api/copilot'

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

function CitationBadge({ citation }: { citation: CopilotCitation }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.65rem] font-medium text-slate-500"
      style={{ background: 'rgba(148,163,184,0.10)', borderColor: 'rgba(148,163,184,0.25)' }}
      title={`${citation.source} · ${citation.recordId} · fetched ${citation.freshness}`}
    >
      {citation.source} · {citation.recordId} · {formatFreshness(citation.freshness)}
    </span>
  )
}

interface Props {
  role: 'user' | 'assistant'
  content: string
  citations?: CopilotCitation[]
}

export function CopilotMessageBubble({ role, content, citations }: Props) {
  const isUser = role === 'user'

  return (
    <div className={`flex items-start gap-2 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div
        className={`grid h-6 w-6 flex-shrink-0 place-items-center rounded-lg ${isUser ? 'bg-slate-700' : 'bg-gradient-to-br from-orange-500 to-orange-600'}`}
      >
        {isUser ? <User className="h-3 w-3 text-white" /> : <Sparkles className="h-3 w-3 text-white" />}
      </div>
      <div className={`flex max-w-[85%] flex-col gap-1.5 ${isUser ? 'items-end' : 'items-start'}`}>
        <div
          className={`whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
            isUser
              ? 'bg-slate-800 text-white rounded-tr-sm'
              : 'bg-white text-slate-700 border border-slate-200 rounded-tl-sm shadow-sm'
          }`}
        >
          {content}
        </div>
        {citations && citations.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {citations.map((c, i) => (
              <CitationBadge key={`${c.source}-${c.recordId}-${i}`} citation={c} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
