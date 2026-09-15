// Endpoint Operations Copilot — frontend HTTP client.
//
// Talks to the backend AI assistant (OpenAI tool-calling) that answers
// questions and, only after explicit confirmation, performs write actions
// (Jira ticket creation, automation-rule test-trigger) against real data
// sources. See server/src/routes/copilot.ts for the authoritative contract.
// The backend enforces roles via the same x-user-role/x-user-email headers
// every other page already sends (see src/api/securityPolicies.ts,
// src/api/roleActivity.ts, src/api/intuneScriptsConfig.ts for precedent —
// server/src/middleware/requireRole.ts reads these; it's a header, not a
// verified credential, same caveat as every other page using this pattern).

// Mirrors the same same-origin-relative baseURL resolution used throughout
// src/api/ (see src/api/index.ts, src/api/securityPolicies.ts) — do NOT
// hardcode localhost:4000 here (see project memory: bug_hardcoded_api_baseurl).
const BASE_URL = import.meta.env.VITE_API_URL ?? ''
const BASE = `${BASE_URL}/api/copilot`

export interface CopilotCitation {
  source: string
  recordId: string
  freshness: string // ISO timestamp
}

export interface CopilotMessage {
  role: 'user' | 'assistant'
  content: string
  citations?: CopilotCitation[]
}

/** Structured, safe page-context hints — see src/context/CopilotContextProvider.tsx.
 *  Never include credentials/tokens/free-text page content here. */
export interface CopilotRequestContext {
  page?: string
  deviceId?: string
  userId?: string
  reportId?: string
  automationRunId?: string
  findingId?: string
}

export interface CopilotPendingAction {
  id: string
  toolName: string
  summary: string
  argsPreview: Record<string, unknown>
}

export interface CopilotChatResponse {
  conversationId: string
  message: CopilotMessage
  pendingAction?: CopilotPendingAction
  available: boolean
}

export interface CopilotConfirmResponse {
  status: 'executed' | 'failed'
  result: unknown
  message: string
}

export interface CopilotRejectResponse {
  status: 'rejected'
}

export interface CopilotConversationSummary {
  id: string
  title: string
  updatedAt: string
}

export interface CopilotConversationMessage {
  id: string
  role: string
  content: string
  citations?: CopilotCitation[]
  createdAt: string
}

export interface CopilotConversationPendingAction {
  id: string
  toolName: string
  summary: string
  argsPreview: Record<string, unknown>
  status: string
}

export interface CopilotConversationDetail {
  id: string
  title: string
  messages: CopilotConversationMessage[]
  pendingActions: CopilotConversationPendingAction[]
}

/** Thrown when the backend returns the app's RBAC 403 shape: { success: false, error }. */
export class CopilotForbiddenError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CopilotForbiddenError'
  }
}

function actorHeaders(viewerRole: string, userEmail?: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'x-user-role': viewerRole,
    'x-user-email': userEmail ?? '',
  }
}

async function request<T>(path: string, viewerRole: string, userEmail?: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      ...actorHeaders(viewerRole, userEmail),
      ...(init?.headers ?? {}),
    },
  })

  if (res.status === 403) {
    const body = await res.json().catch(() => ({})) as { success?: false; error?: string }
    throw new CopilotForbiddenError(body.error ?? 'You do not have permission to perform this action.')
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string }
    throw new Error(body.error ?? `Request failed (${res.status})`)
  }

  return res.json() as Promise<T>
}

export function sendCopilotMessage(
  message: string,
  conversationId: string | undefined,
  viewerRole: string,
  userEmail?: string,
  context?: CopilotRequestContext,
): Promise<CopilotChatResponse> {
  return request('/chat', viewerRole, userEmail, {
    method: 'POST',
    body: JSON.stringify({ conversationId, message, ...(context ? { context } : {}) }),
  })
}

export function confirmCopilotAction(
  id: string,
  viewerRole: string,
  userEmail?: string,
): Promise<CopilotConfirmResponse> {
  return request(`/actions/${encodeURIComponent(id)}/confirm`, viewerRole, userEmail, { method: 'POST' })
}

export function rejectCopilotAction(
  id: string,
  viewerRole: string,
  userEmail?: string,
): Promise<CopilotRejectResponse> {
  return request(`/actions/${encodeURIComponent(id)}/reject`, viewerRole, userEmail, { method: 'POST' })
}

export function listCopilotConversations(
  viewerRole: string,
  userEmail?: string,
): Promise<{ conversations: CopilotConversationSummary[] }> {
  return request('/conversations', viewerRole, userEmail)
}

export function getCopilotConversation(
  id: string,
  viewerRole: string,
  userEmail?: string,
): Promise<CopilotConversationDetail> {
  return request(`/conversations/${encodeURIComponent(id)}`, viewerRole, userEmail)
}
