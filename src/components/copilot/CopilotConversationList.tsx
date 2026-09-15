import { Plus, MessageSquare, Loader2 } from 'lucide-react'
import type { CopilotConversationSummary } from '../../api/copilot'

interface Props {
  conversations: CopilotConversationSummary[]
  activeId?: string
  loading: boolean
  error: string | null
  onSelect: (id: string) => void
  onNew: () => void
}

function formatUpdatedAt(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function CopilotConversationList({ conversations, activeId, loading, error, onSelect, onNew }: Props) {
  return (
    <div className="flex flex-col gap-2 border-b border-slate-200 bg-slate-50/60 px-3 py-2.5">
      <button
        type="button"
        onClick={onNew}
        className="flex items-center justify-center gap-1.5 rounded-lg border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-semibold text-orange-700 hover:bg-orange-100 transition"
      >
        <Plus className="h-3.5 w-3.5" />
        New conversation
      </button>

      {loading ? (
        <div className="flex items-center gap-2 px-1 py-1 text-xs text-slate-400">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading history…
        </div>
      ) : error ? (
        <p className="px-1 text-xs text-red-500">{error}</p>
      ) : conversations.length === 0 ? (
        <p className="px-1 text-xs text-slate-400">No past conversations yet.</p>
      ) : (
        <div className="flex max-h-32 flex-col gap-1 overflow-y-auto">
          {conversations.map(c => (
            <button
              key={c.id}
              type="button"
              onClick={() => onSelect(c.id)}
              className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs transition ${
                c.id === activeId ? 'bg-orange-100 text-orange-800 font-semibold' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <MessageSquare className="h-3.5 w-3.5 flex-shrink-0" />
              <span className="min-w-0 flex-1 truncate">{c.title || 'Untitled conversation'}</span>
              <span className="flex-shrink-0 text-[0.65rem] text-slate-400">{formatUpdatedAt(c.updatedAt)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
