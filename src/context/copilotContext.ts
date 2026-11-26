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

import { createContext, useContext } from 'react'

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

export const CopilotContext = createContext<CopilotContextValue | null>(null)


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
