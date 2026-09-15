import { useCallback, useEffect, useRef, useState } from 'react'
import { Sparkles, X, Send, Loader2, AlertTriangle, WifiOff, RefreshCw } from 'lucide-react'
import {
  sendCopilotMessage, confirmCopilotAction, rejectCopilotAction,
  listCopilotConversations, getCopilotConversation, CopilotForbiddenError,
} from '../../api/copilot'
import type { CopilotCitation, CopilotConversationSummary, CopilotPendingAction } from '../../api/copilot'
import { CopilotMessageBubble } from './CopilotMessageBubble'
import { CopilotPendingActionCard } from './CopilotPendingActionCard'
import type { PendingActionStatus } from './CopilotPendingActionCard'
import { CopilotConversationList } from './CopilotConversationList'
import type { UserToolRole } from '../../types'

interface DisplayMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  citations?: CopilotCitation[]
}

interface Props {
  viewerRole: UserToolRole
  userEmail?: string
  open: boolean
  onClose: () => void
}

let localIdCounter = 0
function nextLocalId(): string {
  localIdCounter += 1
  return `local-${Date.now()}-${localIdCounter}`
}

export function CopilotPanel({ viewerRole, userEmail, open, onClose }: Props) {
  const [conversations, setConversations]   = useState<CopilotConversationSummary[]>([])
  const [convLoading, setConvLoading]       = useState(false)
  const [convError, setConvError]           = useState<string | null>(null)
  const [activeConversationId, setActiveConversationId] = useState<string | undefined>(undefined)

  const [messages, setMessages] = useState<DisplayMessage[]>([])
  const [input, setInput]       = useState('')
  const [sending, setSending]   = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [unavailable, setUnavailable]         = useState(false)
  const [unavailableMessage, setUnavailableMessage] = useState<string | null>(null)

  const [pendingAction, setPendingAction]       = useState<CopilotPendingAction | null>(null)
  const [pendingStatus, setPendingStatus]       = useState<PendingActionStatus>('pending')
  const [pendingResultMessage, setPendingResultMessage] = useState<string | undefined>(undefined)
  const [actionBusy, setActionBusy]             = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)

  const loadConversations = useCallback(() => {
    setConvLoading(true)
    setConvError(null)
    listCopilotConversations(viewerRole, userEmail)
      .then(res => setConversations(res.conversations))
      .catch(e => setConvError(e instanceof Error ? e.message : 'Failed to load conversation history'))
      .finally(() => setConvLoading(false))
  }, [viewerRole, userEmail])

  useEffect(() => {
    if (viewerRole === 'End User' || !open) return
    // Defer to a microtask so the state updates inside loadConversations()
    // don't fire synchronously during the effect's commit phase.
    void Promise.resolve().then(loadConversations)
  }, [open, loadConversations, viewerRole])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, pendingAction, sending, unavailable, sendError])

  if (viewerRole === 'End User') return null

  const resetPendingAction = () => {
    setPendingAction(null)
    setPendingStatus('pending')
    setPendingResultMessage(undefined)
  }

  const handleNewConversation = () => {
    setActiveConversationId(undefined)
    setMessages([])
    setSendError(null)
    setUnavailable(false)
    setUnavailableMessage(null)
    resetPendingAction()
  }

  const handleSelectConversation = async (id: string) => {
    setSendError(null)
    setUnavailable(false)
    setUnavailableMessage(null)
    try {
      const detail = await getCopilotConversation(id, viewerRole, userEmail)
      setActiveConversationId(detail.id)
      setMessages(detail.messages.map(m => ({
        id: m.id,
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.content,
        citations: m.citations,
      })))
      const latestPending = detail.pendingActions[detail.pendingActions.length - 1]
      if (latestPending) {
        setPendingAction({
          id: latestPending.id,
          toolName: latestPending.toolName,
          summary: latestPending.summary,
          argsPreview: latestPending.argsPreview,
        })
        const status = latestPending.status as PendingActionStatus
        setPendingStatus(['pending', 'executed', 'failed', 'rejected', 'forbidden'].includes(status) ? status : 'pending')
        setPendingResultMessage(undefined)
      } else {
        resetPendingAction()
      }
    } catch (e) {
      setSendError(e instanceof Error ? e.message : 'Failed to load conversation')
    }
  }

  const handleSend = async () => {
    const text = input.trim()
    if (!text || sending) return

    setMessages(prev => [...prev, { id: nextLocalId(), role: 'user', content: text }])
    setInput('')
    setSending(true)
    setSendError(null)
    setUnavailable(false)
    setUnavailableMessage(null)

    try {
      const res = await sendCopilotMessage(text, activeConversationId, viewerRole, userEmail)
      const isNewConversation = !activeConversationId
      setActiveConversationId(res.conversationId)

      if (!res.available) {
        setUnavailable(true)
        setUnavailableMessage(res.message.content)
      } else {
        setMessages(prev => [...prev, { id: nextLocalId(), role: 'assistant', content: res.message.content, citations: res.message.citations }])
        if (res.pendingAction) {
          setPendingAction(res.pendingAction)
          setPendingStatus('pending')
          setPendingResultMessage(undefined)
        }
      }

      if (isNewConversation) loadConversations()
    } catch (e) {
      setSendError(e instanceof Error ? e.message : 'Network error — could not reach the Copilot service.')
    } finally {
      setSending(false)
    }
  }

  const handleConfirm = async () => {
    if (!pendingAction) return
    setActionBusy(true)
    try {
      const res = await confirmCopilotAction(pendingAction.id, viewerRole, userEmail)
      setPendingStatus(res.status)
      setPendingResultMessage(res.message)
    } catch (e) {
      if (e instanceof CopilotForbiddenError) {
        setPendingStatus('forbidden')
        setPendingResultMessage(e.message)
      } else {
        setSendError(e instanceof Error ? e.message : 'Failed to confirm action.')
      }
    } finally {
      setActionBusy(false)
    }
  }

  const handleReject = async () => {
    if (!pendingAction) return
    setActionBusy(true)
    try {
      await rejectCopilotAction(pendingAction.id, viewerRole, userEmail)
      setPendingStatus('rejected')
    } catch (e) {
      if (e instanceof CopilotForbiddenError) {
        setPendingStatus('forbidden')
        setPendingResultMessage(e.message)
      } else {
        setSendError(e instanceof Error ? e.message : 'Failed to reject action.')
      }
    } finally {
      setActionBusy(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <>
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close Copilot panel"
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm cursor-pointer transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
      />

      {/* Panel */}
      <aside
        className={`fixed inset-y-0 right-0 z-50 flex w-full flex-col bg-slate-50 shadow-2xl transition-transform duration-300 ease-in-out sm:w-[26rem] ${open ? 'translate-x-0' : 'translate-x-full'}`}
        aria-hidden={!open}
      >
        {/* Header */}
        <div className="relative flex flex-shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3.5">
          <div
            className="absolute top-0 left-0 right-0 h-[2px]"
            style={{ background: 'linear-gradient(90deg, transparent, #F46C00 20%, #0EA5E9 80%, transparent)' }}
          />
          <div className="flex items-center gap-2.5">
            <div className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 shadow-sm">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800">Endpoint Operations Copilot</p>
              <p className="text-[0.68rem] text-slate-400">AI assistant · {viewerRole}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Copilot"
            className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <CopilotConversationList
          conversations={conversations}
          activeId={activeConversationId}
          loading={convLoading}
          error={convError}
          onSelect={handleSelectConversation}
          onNew={handleNewConversation}
        />

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {messages.length === 0 && !unavailable && !sendError && (
            <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
              <Sparkles className="h-8 w-8 text-orange-300" />
              <p className="text-sm font-semibold text-slate-500">Ask about device compliance, users, or policies</p>
              <p className="max-w-[16rem] text-xs text-slate-400">
                The Copilot can look up real Intune, Entra, and ManageEngine data, and — with your confirmation — create Jira tickets or trigger automation tests.
              </p>
            </div>
          )}

          {messages.map(m => (
            <CopilotMessageBubble key={m.id} role={m.role} content={m.content} citations={m.citations} />
          ))}

          {pendingAction && (
            <CopilotPendingActionCard
              action={pendingAction}
              status={pendingStatus}
              resultMessage={pendingResultMessage}
              busy={actionBusy}
              onConfirm={handleConfirm}
              onReject={handleReject}
            />
          )}

          {sending && (
            <div className="flex items-center gap-2 px-1 text-xs text-slate-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Copilot is thinking…
            </div>
          )}

          {unavailable && (
            <div className="rounded-xl border border-slate-300 bg-slate-100 px-3.5 py-3">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-600">
                <WifiOff className="h-3.5 w-3.5 flex-shrink-0" />
                Copilot unavailable
              </div>
              <p className="mt-1.5 text-xs text-slate-500">
                {unavailableMessage ?? 'The AI assistant is not configured on the server. Contact your Global Admin.'}
              </p>
            </div>
          )}

          {sendError && (
            <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-red-500" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-red-700">Something went wrong</p>
                <p className="mt-0.5 text-xs text-red-600">{sendError}</p>
              </div>
              <button
                type="button"
                onClick={() => setSendError(null)}
                aria-label="Dismiss error"
                className="flex-shrink-0 rounded-lg p-1 text-red-400 hover:bg-red-100 hover:text-red-600 transition"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="flex-shrink-0 border-t border-slate-200 bg-white px-3 py-3">
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={sending}
              rows={1}
              placeholder="Ask the Copilot…"
              aria-label="Message the Endpoint Operations Copilot"
              className="max-h-28 min-h-[2.25rem] flex-1 resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-orange-400 disabled:opacity-60"
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={sending || !input.trim()}
              aria-label="Send message"
              className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-orange-600 text-white transition hover:bg-orange-700 disabled:opacity-50"
            >
              {sending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
          <p className="mt-1.5 text-[0.62rem] text-slate-400">Enter to send · Shift+Enter for a new line</p>
        </div>
      </aside>
    </>
  )
}
