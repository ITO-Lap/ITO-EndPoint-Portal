// Endpoint Operations Copilot — page-context awareness.
//
// Lets the currently-active page tell the floating Copilot widget what it's
// looking at (a device, a user, a specific automation run, etc.) so the user
// can ask "why is this device mismatched?" without re-typing an id, and so
// the widget can surface page-relevant quick-action suggestions.
//
// Only structured, safe identifiers belong here — never credentials, tokens,
// or free-text page content. This value is read by CopilotPanel and, when
// present, forwarded to POST /api/copilot/chat as `context` (see
// src/api/copilot.ts / server/src/routes/copilot.ts) — it is grounding
// metadata for the model, not conversation content, and is never written to
// localStorage or persisted as a chat message.

import { createContext, useContext, useMemo, useState, useCallback, useEffect } from 'react'

export interface CopilotPageContext {
  page?: string
  deviceId?: string
  userId?: string
  reportId?: string
  automationRunId?: string
  findingId?: string
}

export interface CopilotContextValue {
  context: CopilotPageContext
  setCopilotPageContext: (ctx: CopilotPageContext) => void
}

const CopilotContext = createContext<CopilotContextValue | null>(null)

export function CopilotContextProvider({
  page, children,
}: {
  /** Centrally-derived "current page" name — App.tsx's activePage. This is
   *  the single source of truth for the `page` field; most pages never need
   *  to touch this provider at all. Individual pages only need to call
   *  setCopilotPageContext to attach record-level ids (deviceId, userId,
   *  etc.) on top of whatever page is currently active. */
  page: string
  children: React.ReactNode
}) {
  // Record-level ids only — `page` always comes from the prop above so an
  // uninstrumented page can never leak a stale id from whatever page was
  // previously active.
  const [ids, setIds] = useState<Omit<CopilotPageContext, 'page'>>({})

  // Navigating to a different page always clears any record-level ids set by
  // the previous page — instrumented pages then re-set their own ids via the
  // effect below, uninstrumented pages simply get `{ page }` with no ids.
  useEffect(() => {
    setIds({})
  }, [page])

  const setCopilotPageContext = useCallback((ctx: CopilotPageContext) => {
    const { page: _ignoredPage, ...rest } = ctx
    setIds(rest)
  }, [])

  const value = useMemo<CopilotContextValue>(() => ({
    context: { page, ...ids },
    setCopilotPageContext,
  }), [ids, page, setCopilotPageContext])

  return (
    <CopilotContext.Provider value={value}>
      {children}
    </CopilotContext.Provider>
  )
}

/** Read-only access to the current page context (used by the Copilot widget itself). */
export function useCopilotContextValue(): CopilotContextValue {
  const ctx = useContext(CopilotContext)
  if (!ctx) throw new Error('useCopilotContextValue must be inside CopilotContextProvider')
  return ctx
}

/**
 * Hook for page components to register what they're currently showing.
 * Typical usage:
 *
 *   const setCopilotPageContext = useCopilotPageContext()
 *   useEffect(() => {
 *     setCopilotPageContext({ page: 'Risk Scoring', deviceId: score.deviceId })
 *     return () => setCopilotPageContext({ page: 'Risk Scoring' })
 *   }, [score.deviceId, setCopilotPageContext])
 */
export function useCopilotPageContext(): (ctx: CopilotPageContext) => void {
  const ctx = useContext(CopilotContext)
  if (!ctx) throw new Error('useCopilotPageContext must be inside CopilotContextProvider')
  return ctx.setCopilotPageContext
}
