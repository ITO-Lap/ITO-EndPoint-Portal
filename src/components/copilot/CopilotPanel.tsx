import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Waves, X, Send, Loader2, AlertTriangle, WifiOff, RefreshCw, Minus, History, GripVertical,
} from 'lucide-react'
import {
  sendCopilotMessage, confirmCopilotAction, rejectCopilotAction,
  listCopilotConversations, getCopilotConversation, CopilotForbiddenError,
} from '../../api/copilot'
import type { CopilotCitation, CopilotConversationSummary, CopilotPendingAction } from '../../api/copilot'
import { CopilotMessageBubble } from './CopilotMessageBubble'
import { CopilotPendingActionCard } from './CopilotPendingActionCard'
import type { PendingActionStatus } from './CopilotPendingActionCard'
import { CopilotConversationList } from './CopilotConversationList'
import { useLocalStorage } from '../../hooks/useLocalStorage'
import { useCopilotContextValue } from '../../context/CopilotContextProvider'
import type { UserToolRole } from '../../types'
import { hasPermission } from '../../lib/permissions'
import { usePermissions } from '../../context/PermissionsContext'

interface DisplayMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  citations?: CopilotCitation[]
}

interface Props {
  viewerRole: UserToolRole
  userEmail?: string
}

let localIdCounter = 0
function nextLocalId(): string {
  localIdCounter += 1
  return `local-${Date.now()}-${localIdCounter}`
}

// ─── Panel sizing ────────────────────────────────────────────────────────────

interface PanelSize { width: number; height: number }

const DEFAULT_SIZE: PanelSize = { width: 400, height: 560 }
const MIN_WIDTH = 320
const MIN_HEIGHT = 420
const MAX_WIDTH = 560
const MAX_HEIGHT = 800
const BUTTON_MARGIN = 20 // matches bottom-5/right-5

function clampSize(size: PanelSize): PanelSize {
  const viewportMaxW = typeof window === 'undefined' ? MAX_WIDTH : window.innerWidth - BUTTON_MARGIN * 2
  const viewportMaxH = typeof window === 'undefined' ? MAX_HEIGHT : window.innerHeight - 120
  return {
    width: Math.min(Math.max(size.width, MIN_WIDTH), Math.min(MAX_WIDTH, viewportMaxW)),
    height: Math.min(Math.max(size.height, MIN_HEIGHT), Math.min(MAX_HEIGHT, viewportMaxH)),
  }
}

// ─── Quick actions ───────────────────────────────────────────────────────────

interface QuickAction { label: string; message: string }

function buildQuickActions(context: ReturnType<typeof useCopilotContextValue>['context']): QuickAction[] {
  const actions: QuickAction[] = []

  if (context.deviceId) {
    actions.push(
      { label: 'Explain this issue', message: `Explain the compliance issue for device ${context.deviceId}.` },
      { label: 'Check device mismatch', message: `Check for a device mismatch on device ${context.deviceId}.` },
      { label: 'Find similar devices', message: `Find devices similar to ${context.deviceId}.` },
      { label: 'Create remediation recommendation', message: `Create a remediation recommendation for device ${context.deviceId}.` },
    )
  }

  if (context.userId) {
    actions.push({
      label: "Show this user's device compliance",
      message: `Show compliance status for this user's devices (user ${context.userId}).`,
    })
  }

  if (context.page === 'Automation' || context.automationRunId) {
    actions.push({
      label: 'Summarize automation failures',
      message: context.automationRunId
        ? `Summarize the failures from automation run ${context.automationRunId}.`
        : 'Summarize recent automation rule failures.',
    })
  }

  if (context.findingId) {
    actions.push({ label: 'Explain this finding', message: `Explain policy conflict finding ${context.findingId}.` })
  }

  if (actions.length === 0) {
    actions.push(
      { label: 'What can you help with?', message: 'What can you help with?' },
      { label: "Summarize today's risk findings", message: "Summarize today's risk findings." },
    )
  }

  return actions.slice(0, 5)
}

export function CopilotPanel({ viewerRole, userEmail }: Props) {
  const permissions = usePermissions()
  const canAccessCopilot = hasPermission(viewerRole, permissions, 'copilot.access')
  const { context } = useCopilotContextValue()

  const [panelOpen, setPanelOpen]         = useLocalStorage('copilot-panel-open', false)
  const [minimized, setMinimized]         = useLocalStorage('copilot-panel-minimized', false)
  const [storedSize, setStoredSize]       = useLocalStorage<PanelSize>('copilot-panel-size', DEFAULT_SIZE)
  const size = useMemo(() => clampSize(storedSize), [storedSize])

  const [showHistory, setShowHistory] = useState(false)
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
  const dragState = useRef<{ startX: number; startY: number; startW: number; startH: number } | null>(null)

  const loadConversations = useCallback(() => {
    setConvLoading(true)
    setConvError(null)
    listCopilotConversations(viewerRole, userEmail)
      .then(res => setConversations(res.conversations))
      .catch(e => setConvError(e instanceof Error ? e.message : 'Failed to load conversation history'))
      .finally(() => setConvLoading(false))
  }, [viewerRole, userEmail])

  useEffect(() => {
    if (!canAccessCopilot || !panelOpen || minimized) return
    // Defer to a microtask so the state updates inside loadConversations()
    // don't fire synchronously during the effect's commit phase.
    void Promise.resolve().then(loadConversations)
  }, [panelOpen, minimized, loadConversations, canAccessCopilot])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, pendingAction, sending, unavailable, sendError])

  // ── Resize handling ──────────────────────────────────────────────────────
  const handleResizeStart = (e: React.PointerEvent) => {
    e.preventDefault()
    dragState.current = { startX: e.clientX, startY: e.clientY, startW: size.width, startH: size.height }
    const onMove = (ev: PointerEvent) => {
      if (!dragState.current) return
      const dx = dragState.current.startX - ev.clientX // dragging left grows width (anchored right)
      const dy = dragState.current.startY - ev.clientY // dragging up grows height (anchored bottom)
      setStoredSize(clampSize({
        width: dragState.current.startW + dx,
        height: dragState.current.startH + dy,
      }))
    }
    const onUp = () => {
      dragState.current = null
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  if (!canAccessCopilot) return null

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
      setShowHistory(false)
    } catch (e) {
      setSendError(e instanceof Error ? e.message : 'Failed to load conversation')
    }
  }

  const sendText = async (text: string) => {
    if (!text.trim() || sending) return

    setMessages(prev => [...prev, { id: nextLocalId(), role: 'user', content: text }])
    setInput('')
    setSending(true)
    setSendError(null)
    setUnavailable(false)
    setUnavailableMessage(null)

    try {
      const res = await sendCopilotMessage(text, activeConversationId, viewerRole, userEmail, context)
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

  const handleSend = () => sendText(input.trim())
  const handleQuickAction = (action: QuickAction) => sendText(action.message)

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

  const quickActions = buildQuickActions(context)

  return (
    <>
      {/* Floating action button — the single entry point, always visible, never blocks page content */}
      <button
        type="button"
        onClick={() => setPanelOpen((p: boolean) => !p)}
        aria-label={panelOpen ? 'Close Ocean panel' : 'Open Ocean assistant'}
        aria-pressed={panelOpen}
        data-selected-skip
        className="fixed bottom-5 right-5 z-50 grid h-[3.25rem] w-[3.25rem] place-items-center rounded-full bg-gradient-to-br from-blue-600 via-sky-500 to-cyan-400 text-white shadow-lg shadow-blue-900/25 transition hover:scale-105 hover:shadow-xl active:scale-95"
      >
        {panelOpen ? <X className="h-5 w-5" /> : <Waves className="h-5 w-5" />}
      </button>

      {/* Compact floating panel — anchored above the button, never a full-height edge drawer, no backdrop */}
      {panelOpen && (
        <div
          role="dialog"
          aria-label="Ocean assistant"
          className="fixed z-50 flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-2xl transition-[height,width] duration-150"
          style={{
            right: BUTTON_MARGIN,
            bottom: BUTTON_MARGIN + 56 + 12,
            width: size.width,
            height: minimized ? 'auto' : size.height,
          }}
        >
          {/* Resize handle — top-left corner, hidden while minimized */}
          {!minimized && (
            <div
              onPointerDown={handleResizeStart}
              role="separator"
              aria-label="Resize Ocean panel"
              className="absolute left-0 top-0 z-10 flex h-4 w-4 cursor-nwse-resize items-center justify-center text-slate-300 hover:text-slate-400"
            >
              <GripVertical className="h-3 w-3 rotate-45" />
            </div>
          )}

          {/* Header */}
          <div className="relative flex flex-shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
            <div
              className="absolute top-0 left-0 right-0 h-[2px]"
              style={{ background: 'linear-gradient(90deg, transparent, #1D4ED8 20%, #22D3EE 80%, transparent)' }}
            />
            <button
              type="button"
              onClick={() => setMinimized((m: boolean) => !m)}
              aria-label={minimized ? 'Expand Ocean panel' : 'Minimize Ocean panel'}
              className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
            >
              <div className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-xl bg-gradient-to-br from-blue-700 via-sky-500 to-cyan-400 shadow-sm shadow-blue-900/20">
                <Waves className="h-4 w-4 text-white" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-slate-800">Ocean</p>
                <p className="truncate text-[0.68rem] text-sky-600">Endpoint operations assistant · {viewerRole}</p>
              </div>
            </button>
            <div className="flex flex-shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => setShowHistory(h => !h)}
                aria-label="Toggle conversation history"
                aria-pressed={showHistory}
                className={`grid h-7 w-7 place-items-center rounded-lg transition ${showHistory ? 'is-selected' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600'}`}
              >
                <History className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setMinimized((m: boolean) => !m)}
                aria-label={minimized ? 'Expand Ocean panel' : 'Minimize Ocean panel'}
                className="grid h-7 w-7 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setPanelOpen(false)}
                aria-label="Close Ocean"
                className="grid h-7 w-7 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {!minimized && (
            <>
              {showHistory && (
                <CopilotConversationList
                  conversations={conversations}
                  activeId={activeConversationId}
                  loading={convLoading}
                  error={convError}
                  onSelect={handleSelectConversation}
                  onNew={() => { handleNewConversation(); setShowHistory(false) }}
                />
              )}

              {/* Messages */}
              <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
                {messages.length === 0 && !unavailable && !sendError && (
                  <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
                    <Waves className="h-7 w-7 text-sky-400" />
                    <p className="text-sm font-semibold text-slate-500">Ask about device compliance, users, or policies</p>
                    <p className="max-w-[15rem] text-xs text-slate-400">
                      Ocean can look up real Intune, Entra, and ManageEngine data, and — with your confirmation — create Jira tickets, trigger automation tests, or send a Teams alert.
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
                    Ocean is thinking…
                  </div>
                )}

                {unavailable && (
                  <div className="rounded-xl border border-slate-300 bg-slate-100 px-3.5 py-3">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-600">
                      <WifiOff className="h-3.5 w-3.5 flex-shrink-0" />
                      Ocean unavailable
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

              {/* Quick actions */}
              <div className="flex-shrink-0 border-t border-slate-200 bg-white px-3 pt-2.5">
                <div className="flex flex-wrap gap-1.5 pb-2.5">
                  {quickActions.map(qa => (
                    <button
                      key={qa.label}
                      type="button"
                      onClick={() => handleQuickAction(qa)}
                      disabled={sending}
                      className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[0.68rem] font-medium text-sky-700 transition hover:bg-sky-100 disabled:opacity-50"
                    >
                      {qa.label}
                    </button>
                  ))}
                </div>
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
                    placeholder="Ask Ocean…"
                    aria-label="Message Ocean"
                    className="max-h-24 min-h-[2.25rem] flex-1 resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-300 disabled:opacity-60"
                  />
                  <button
                    type="button"
                    onClick={handleSend}
                    disabled={sending || !input.trim()}
                    aria-label="Send message"
                    className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white transition hover:bg-blue-700 disabled:opacity-50"
                  >
                    {sending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </button>
                </div>
                <p className="mt-1.5 text-[0.62rem] text-slate-400">Enter to send · Shift+Enter for a new line</p>
              </div>
            </>
          )}
        </div>
      )}
    </>
  )
}
