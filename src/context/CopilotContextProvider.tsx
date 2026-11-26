// Provider for the Copilot page-context — see ./copilotContext.ts for the types and hooks.
import { useMemo, useState, useCallback } from 'react'
import { CopilotContext } from './copilotContext'
import type { CopilotContextValue, CopilotPageContext } from './copilotContext'

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
  const [prevPage, setPrevPage] = useState(page)
  if (page !== prevPage) { setPrevPage(page); setIds({}) }

  const setCopilotPageContext = useCallback((ctx: CopilotPageContext) => {
    const rest: Omit<CopilotPageContext, 'page'> & { page?: string } = { ...ctx }
    delete rest.page
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

