// Endpoint Operations Copilot — routes.
//
// Chat AI assistant (OpenAI gpt-4o-mini, tool/function calling) over the
// read services already exposed elsewhere in this app, plus two gated write
// actions that are NEVER executed inline — they always come back as a
// pendingAction and only run once a caller with a write-tier role explicitly
// confirms via POST /actions/:id/confirm. See services/copilotEngine.ts
// (the tool-calling loop) and services/copilotTools.ts (the tool registry).
//
// Route-level access is requireCapability('copilot.read'/'copilot.write')
// (server/src/middleware/requireRole.ts) — a dynamic custom-RBAC permission
// lookup, not a hardcoded role list. Which TOOLS are exposed inside an
// already-authorized chat turn still uses copilotTools.ts's own
// READ_ROLES/WRITE_ROLES role-literal check (a narrower, in-process nuance,
// not the security perimeter) — a known, deliberately scoped-out gap: a
// custom role doesn't yet get custom tool-exposure, only the 3 built-ins do.
//

// Persistence is optional (DATABASE_URL): without it, chat still works
// one-shot with an ephemeral conversationId and no cross-request history;
// pending actions live in an in-process Map for the life of the server so
// confirm/reject still work. With a DB, everything is persisted and the
// same in-memory map is kept as a fast execution path in sync with the DB
// row (see pendingActionsMemory below).

import { Router } from 'express'
import { randomUUID } from 'crypto'
import { asyncHandler } from '../middleware/errorHandler.js'
import { identifyAuditActor, requireCapability } from '../middleware/requireRole.js'
import { isDbAvailable, query } from '../db/index.js'
import rateLimit, { ipKeyGenerator } from 'express-rate-limit'
import { runCopilotChat, type AnswerMode, type CopilotChatResult, type CopilotMessage, type CopilotRequestContext } from '../services/copilotEngine.js'
import { getToolByName, scrubSecrets, toolsAllowedForRole, type CopilotCitation } from '../services/copilotTools.js'
import { getGeminiConfig } from '../store/integrationStore.js'
import { permissionsForRole } from '../services/roleResolution.js'
import { inspectRequest, sanitizeAnswer } from '../services/ocean/guard.js'
import { bump, getSettings, listDocuments, recordEvent, recordGap } from '../services/ocean/knowledgeStore.js'
import { webProvider, webSearch, type WebOutcome } from '../services/ocean/webSearch.js'
import { docCitation, docsOnlyAnswer, looksLikeDocQuestion, looksLikeLiveDataQuestion, noDocsAnswer, retrieveDocs, webCitations, type Retrieval } from '../services/ocean/retrieval.js'

const router = Router()
router.use(identifyAuditActor)

// Per-user chat limit (the shared API limiter is per IP and far too generous for a metered AI call).
const MAX_MESSAGE_CHARS = 2000
const chatPerMinute = (): number => { const n = Number(process.env['OCEAN_CHAT_RATE_LIMIT_PER_MIN']); return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 20 }
const chatLimiter = rateLimit({
  windowMs: 60_000,
  limit: () => chatPerMinute(),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: req => req.header('x-user-email') || ipKeyGenerator(req.ip ?? ''),
  handler: (req, res) => {
    bump('rateLimited')
    recordEvent({ type: 'rate_limited', actor: req.header('x-user-email') ?? 'unknown', role: req.header('x-user-role') ?? 'unknown', detail: 'chat limit reached' })
    res.status(429).json({ success: false, error: 'You are sending messages too quickly. Please wait a moment and try again.' })
  },
})

// ─── In-memory pending-action store (server-lifetime, DB-optional) ──────────

type PendingActionStatus = 'pending' | 'executed' | 'rejected' | 'failed'

interface MemoryPendingAction {
  id: string
  conversationId: string
  messageId: string | null
  toolName: string
  args: Record<string, unknown>
  summary: string
  status: PendingActionStatus
  requestedBy: string
  confirmedBy?: string
  createdAt: string
  confirmedAt?: string
  result?: unknown
}

const pendingActionsMemory = new Map<string, MemoryPendingAction>()

// ─── Helpers ──────────────────────────────────────────────────────────────

function actorOf(req: { auditActor?: { email: string; appRole: string } }) {
  return { email: req.auditActor?.email ?? 'unknown@zinnia.com', role: req.auditActor?.appRole ?? 'End User' }
}

async function loadHistory(conversationId: string): Promise<CopilotMessage[]> {
  if (!isDbAvailable()) return []
  const result = await query<{ role: string; content: string }>(
    `SELECT role, content FROM copilot_messages WHERE conversation_id = $1 ORDER BY created_at ASC`,
    [conversationId]
  )
  return result.rows
    .filter(r => r.role === 'user' || r.role === 'assistant')
    .map(r => ({ role: r.role as 'user' | 'assistant', content: r.content }))
}

async function ensureConversation(conversationId: string | undefined, userEmail: string, firstMessage: string): Promise<string> {
  if (!isDbAvailable()) return conversationId ?? randomUUID()

  if (conversationId) {
    const existing = await query<{ id: string }>(
      `SELECT id FROM copilot_conversations WHERE id = $1 AND user_email = $2`,
      [conversationId, userEmail]
    )
    if (existing.rows[0]) {
      await query(`UPDATE copilot_conversations SET updated_at = NOW() WHERE id = $1`, [conversationId])
      return conversationId
    }
  }

  const title = firstMessage.length > 60 ? `${firstMessage.slice(0, 57)}...` : firstMessage
  const created = await query<{ id: string }>(
    `INSERT INTO copilot_conversations (user_email, title) VALUES ($1, $2) RETURNING id`,
    [userEmail, title || 'New conversation']
  )
  return created.rows[0]!.id
}

async function persistMessage(
  conversationId: string,
  role: 'user' | 'assistant',
  content: string,
  toolCalls: unknown = [],
  citations: CopilotCitation[] = []
): Promise<string | null> {
  if (!isDbAvailable()) return null
  const result = await query<{ id: string }>(
    `INSERT INTO copilot_messages (conversation_id, role, content, tool_calls, citations)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [conversationId, role, content, JSON.stringify(scrubSecrets(toolCalls)), JSON.stringify(scrubSecrets(citations))]
  )
  return result.rows[0]!.id
}

async function persistPendingAction(entry: MemoryPendingAction): Promise<void> {
  if (!isDbAvailable()) return
  await query(
    `INSERT INTO copilot_pending_actions
       (id, conversation_id, message_id, tool_name, tool_args, status, requested_by, confirmed_by, confirmed_at, result)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (id) DO UPDATE SET
       status = EXCLUDED.status, confirmed_by = EXCLUDED.confirmed_by,
       confirmed_at = EXCLUDED.confirmed_at, result = EXCLUDED.result`,
    [
      entry.id, entry.conversationId, entry.messageId, entry.toolName,
      JSON.stringify(scrubSecrets(entry.args)), entry.status, entry.requestedBy,
      entry.confirmedBy ?? null, entry.confirmedAt ?? null,
      entry.result !== undefined ? JSON.stringify(scrubSecrets(entry.result)) : null,
    ]
  )
}

async function insertAuditLog(action: string, resourceType: string, resourceId: string, userEmail: string): Promise<void> {
  if (!isDbAvailable()) return
  await query(
    `INSERT INTO audit_logs (user_email, action, resource_type, resource_id) VALUES ($1,$2,$3,$4)`,
    [userEmail, action, resourceType, resourceId]
  )
}

function toPendingActionOut(entry: MemoryPendingAction) {
  return { id: entry.id, toolName: entry.toolName, summary: entry.summary, argsPreview: entry.args }
}

// Only forward known, structured string fields — never trust the client body
// blindly into the model's context window (no arbitrary keys, no objects).
function sanitizePageContext(raw: unknown): CopilotRequestContext | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const src = raw as Record<string, unknown>
  const out: CopilotRequestContext = {}
  for (const key of ['page', 'deviceId', 'userId', 'reportId', 'automationRunId', 'findingId'] as const) {
    const v = src[key]
    if (typeof v === 'string' && v.trim()) out[key] = v.trim().slice(0, 200)
  }
  return Object.keys(out).length > 0 ? out : undefined
}

// ─── POST /chat ───────────────────────────────────────────────────────────

router.post('/chat', chatLimiter, requireCapability('copilot.read'), asyncHandler(async (req, res) => {
  const { conversationId: requestedId, message, context } = req.body as {
    conversationId?: string; message?: string; context?: CopilotRequestContext
  }
  if (!message || typeof message !== 'string' || !message.trim()) {
    res.status(400).json({ success: false, error: 'message is required' })
    return
  }
  if (message.length > MAX_MESSAGE_CHARS) {
    res.status(400).json({ success: false, error: `Please keep your message under ${MAX_MESSAGE_CHARS} characters.` })
    return
  }

  const started = Date.now()
  const actor = actorOf(req)
  const conversationId = await ensureConversation(requestedId, actor.email, message)
  const history = await loadHistory(conversationId)
  bump('queries')

  const sanitizedContext = sanitizePageContext(context)
  const hasRecordContext = !!(sanitizedContext && (sanitizedContext.deviceId || sanitizedContext.userId || sanitizedContext.reportId || sanitizedContext.automationRunId || sanitizedContext.findingId))

  // Which documentation this caller may read: administrator-only documents need the ocean.docs.manage permission.
  const perms = await permissionsForRole(actor.role)
  const includeAdminDocs = perms['ocean.docs.manage'] === true

  let chatResult: CopilotChatResult
  let retrieval: Retrieval | null = null
  let webOutcome: WebOutcome | null = null
  const verdict = inspectRequest(message)
  try {
    if (verdict.blocked) {
      bump('blockedRequests')
      recordEvent({ type: 'blocked_request', actor: actor.email, role: actor.role, detail: verdict.reason })
      chatResult = { available: true, mode: 'general', message: { role: 'assistant', content: verdict.message }, toolCallTrace: [] }
    } else {
      retrieval = await retrieveDocs(message, { includeAdmin: includeAdminDocs, ...(sanitizedContext?.page ? { page: sanitizedContext.page } : {}) })
      const liveIntent = toolsAllowedForRole(actor.role).length > 0 && looksLikeLiveDataQuestion(message, hasRecordContext)
      const geminiReady = !!getGeminiConfig()?.apiKey
      // Nothing documented + a how-this-tool-works question => the fixed "no verified answer" reply, without calling the model.
      if (!retrieval.hits.length && looksLikeDocQuestion(message) && !liveIntent) {
        bump('noDocumentation')
        recordGap(message, sanitizedContext?.page ?? null)
        // Optional, administrator-enabled web fallback: a minimal keyword query, results clearly labelled as external.
        let web: WebOutcome | null = null
        if (getSettings().webFallback && webProvider().ready) {
          web = await webSearch(message)
          bump('webFallbacks')
          recordEvent({ type: 'web_search', actor: actor.email, role: actor.role, detail: sanitizeAnswer(`${web.label}: ${web.results.length} result(s)${web.error ? ` (${web.error})` : ''} for "${web.query}"`) })
        }
        webOutcome = web
        const webCites = webCitations(web)
        chatResult = { available: true, mode: 'general', message: { role: 'assistant', content: noDocsAnswer({ adminOnlyMatch: retrieval.adminOnlyMatch, page: sanitizedContext?.page, notIndexed: retrieval.indexedChunks === 0, web }), ...(webCites.length ? { citations: webCites } : {}) }, toolCallTrace: [] }
      } else if (!geminiReady && retrieval.hits.length) {
        bump('documentationAnswers')
        chatResult = { available: true, mode: 'documentation', message: { role: 'assistant', content: docsOnlyAnswer(retrieval.hits), citations: retrieval.hits.slice(0, 3).map((h, i) => docCitation(h, `D${i + 1}`)) }, toolCallTrace: [] }
      } else {
        chatResult = await runCopilotChat({
          history, userMessage: message, ctx: { actorEmail: actor.email, actorRole: actor.role },
          ...(sanitizedContext ? { pageContext: sanitizedContext } : {}),
          docs: { hits: retrieval.hits, adminOnlyMatch: retrieval.adminOnlyMatch },
        })
        if (chatResult.mode === 'documentation' || chatResult.mode === 'mixed') bump('documentationAnswers')
      }
    }
  } catch (err) {
    bump('errors')
    const timedOut = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')
    recordEvent({ type: 'error', actor: actor.email, role: actor.role, detail: sanitizeAnswer(err instanceof Error ? err.message : String(err)).slice(0, 160) })
    res.status(timedOut ? 504 : 502).json({ success: false, error: timedOut ? 'Ocean took too long to respond. Please try again in a moment.' : 'Ocean could not complete that request. Please try again, or contact an administrator if it keeps happening.' })
    return
  }

  const docsStatus = retrieval
    ? (retrieval.hits.length ? 'found' : retrieval.adminOnlyMatch ? 'admin-only' : retrieval.indexedChunks === 0 ? 'not-indexed' : 'none')
    : 'not-searched'
  recordEvent({ type: 'query', actor: actor.email, role: actor.role, detail: sanitizeAnswer(`mode=${chatResult.mode ?? 'n/a'} docs=${docsStatus}/${retrieval?.hits.length ?? 0} ${Date.now() - started}ms q="${message.replace(/\s+/g, ' ').slice(0, 100)}"`) })
  void insertAuditLog('OCEAN_QUERY', 'ocean_conversation', conversationId, actor.email).catch(() => undefined)

  if (!chatResult.available) {
    // Nothing to persist — Ocean's AI model is unavailable, no AI call was made.
    res.json({ conversationId, message: chatResult.message, available: false })
    return
  }

  await persistMessage(conversationId, 'user', message)
  const assistantMessageId = await persistMessage(
    conversationId, 'assistant', chatResult.message.content,
    chatResult.toolCallTrace, chatResult.message.citations ?? []
  )

  let pendingActionOut: ReturnType<typeof toPendingActionOut> | undefined

  if (chatResult.pendingAction) {
    const id = randomUUID()
    const entry: MemoryPendingAction = {
      id,
      conversationId,
      messageId: assistantMessageId,
      toolName: chatResult.pendingAction.toolName,
      args: chatResult.pendingAction.args,
      summary: chatResult.pendingAction.summary,
      status: 'pending',
      requestedBy: actor.email,
      createdAt: new Date().toISOString(),
    }
    pendingActionsMemory.set(id, entry)
    await persistPendingAction(entry)
    pendingActionOut = toPendingActionOut(entry)
  }

  const mode: AnswerMode = chatResult.mode ?? 'general'
  res.json({
    conversationId,
    message: chatResult.message,
    ...(pendingActionOut ? { pendingAction: pendingActionOut } : {}),
    available: true,
    mode,
    docs: { status: docsStatus, retrieval: retrieval?.mode ?? null, count: retrieval?.hits.length ?? 0, indexedDocuments: listDocuments().filter(d => d.enabled && d.status === 'indexed').length },
    ...(webOutcome ? { web: { provider: (webOutcome as WebOutcome).label, count: (webOutcome as WebOutcome).results.length, ...((webOutcome as WebOutcome).error ? { error: (webOutcome as WebOutcome).error } : {}) } } : {}),
  })
}))

// ─── Pending action lookup (memory-first, DB fallback) ─────────────────────

async function findPendingAction(id: string): Promise<MemoryPendingAction | null> {
  const inMemory = pendingActionsMemory.get(id)
  if (inMemory) return inMemory

  if (!isDbAvailable()) return null
  const result = await query<{
    id: string; conversation_id: string; message_id: string | null; tool_name: string
    tool_args: unknown; status: PendingActionStatus; requested_by: string
    confirmed_by: string | null; confirmed_at: string | null; result: unknown; created_at: string
  }>(`SELECT * FROM copilot_pending_actions WHERE id = $1`, [id])
  const row = result.rows[0]
  if (!row) return null

  const toolForSummary = getToolByName(row.tool_name)
  const args = (row.tool_args ?? {}) as Record<string, unknown>
  const hydrated: MemoryPendingAction = {
    id: row.id, conversationId: row.conversation_id, messageId: row.message_id,
    toolName: row.tool_name, args,
    summary: toolForSummary?.describeAction ? toolForSummary.describeAction(args) : `Run ${row.tool_name}`,
    status: row.status, requestedBy: row.requested_by,
    createdAt: row.created_at,
    ...(row.confirmed_by ? { confirmedBy: row.confirmed_by } : {}),
    ...(row.confirmed_at ? { confirmedAt: row.confirmed_at } : {}),
    ...(row.result !== null && row.result !== undefined ? { result: row.result } : {}),
  }
  pendingActionsMemory.set(id, hydrated)
  return hydrated
}

// ─── POST /actions/:id/confirm ──────────────────────────────────────────────

router.post('/actions/:id/confirm', requireCapability('copilot.write'), asyncHandler(async (req, res) => {
  const id = req.params.id as string
  const entry = await findPendingAction(id)
  if (!entry) { res.status(404).json({ success: false, error: 'Pending action not found' }); return }
  if (entry.status !== 'pending') {
    res.status(404).json({ success: false, error: `Pending action is already ${entry.status}` })
    return
  }

  const actor = actorOf(req)
  const tool = getToolByName(entry.toolName)
  if (!tool) {
    entry.status = 'failed'
    entry.confirmedBy = actor.email
    entry.confirmedAt = new Date().toISOString()
    entry.result = { error: `Unknown tool: ${entry.toolName}` }
    await persistPendingAction(entry)
    res.json({ status: 'failed', result: entry.result, message: `Unknown tool: ${entry.toolName}` })
    return
  }

  try {
    const { result } = await tool.run(entry.args, { actorEmail: actor.email, actorRole: actor.role })
    const redactedResult = scrubSecrets(result)
    entry.status = 'executed'
    entry.confirmedBy = actor.email
    entry.confirmedAt = new Date().toISOString()
    entry.result = redactedResult
    await persistPendingAction(entry)

    if (entry.toolName === 'create_jira_ticket') {
      const issue = redactedResult as { key?: string }
      await insertAuditLog('COPILOT_JIRA_CREATED', 'jira_issue', issue.key ?? 'unknown', actor.email)
    } else if (entry.toolName === 'trigger_automation_rule') {
      const execution = redactedResult as { id?: string; ruleId?: string }
      await insertAuditLog('COPILOT_AUTOMATION_TRIGGERED', 'automation_execution', execution.id ?? execution.ruleId ?? 'unknown', actor.email)
    } else if (entry.toolName === 'send_team_alert') {
      await insertAuditLog('COPILOT_TEAMS_ALERT_SENT', 'teams_alert', entry.id, actor.email)
    }

    res.json({ status: 'executed', result: redactedResult, message: 'Action executed successfully.' })
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    entry.status = 'failed'
    entry.confirmedBy = actor.email
    entry.confirmedAt = new Date().toISOString()
    entry.result = { error: errorMessage }
    await persistPendingAction(entry)
    res.json({ status: 'failed', result: entry.result, message: errorMessage })
  }
}))

// ─── POST /actions/:id/reject ────────────────────────────────────────────────

router.post('/actions/:id/reject', requireCapability('copilot.read'), asyncHandler(async (req, res) => {
  const id = req.params.id as string
  const entry = await findPendingAction(id)
  if (!entry) { res.status(404).json({ success: false, error: 'Pending action not found' }); return }
  if (entry.status !== 'pending') {
    res.status(404).json({ success: false, error: `Pending action is already ${entry.status}` })
    return
  }

  const actor = actorOf(req)
  entry.status = 'rejected'
  entry.confirmedBy = actor.email
  entry.confirmedAt = new Date().toISOString()
  await persistPendingAction(entry)

  res.json({ status: 'rejected' })
}))

// ─── GET /conversations ───────────────────────────────────────────────────

router.get('/conversations', requireCapability('copilot.read'), asyncHandler(async (req, res) => {
  if (!isDbAvailable()) { res.json({ conversations: [] }); return }
  const actor = actorOf(req)
  const result = await query<{ id: string; title: string; updated_at: string }>(
    `SELECT id, title, updated_at FROM copilot_conversations WHERE user_email = $1 ORDER BY updated_at DESC LIMIT 100`,
    [actor.email]
  )
  res.json({ conversations: result.rows.map(r => ({ id: r.id, title: r.title, updatedAt: r.updated_at })) })
}))

// ─── GET /conversations/:id ───────────────────────────────────────────────

router.get('/conversations/:id', requireCapability('copilot.read'), asyncHandler(async (req, res) => {
  const id = req.params.id as string
  if (!isDbAvailable()) {
    res.status(404).json({ success: false, error: 'Conversation not found — no database configured' })
    return
  }

  const actor = actorOf(req)
  const convResult = await query<{ id: string; title: string }>(
    `SELECT id, title FROM copilot_conversations WHERE id = $1 AND user_email = $2`,
    [id, actor.email]
  )
  const conversation = convResult.rows[0]
  if (!conversation) { res.status(404).json({ success: false, error: 'Conversation not found' }); return }

  const [messagesResult, actionsResult] = await Promise.all([
    query<{ id: string; role: string; content: string; citations: unknown; created_at: string }>(
      `SELECT id, role, content, citations, created_at FROM copilot_messages WHERE conversation_id = $1 ORDER BY created_at ASC`,
      [id]
    ),
    query<{ id: string; tool_name: string; tool_args: unknown; status: string }>(
      `SELECT id, tool_name, tool_args, status FROM copilot_pending_actions WHERE conversation_id = $1 ORDER BY created_at ASC`,
      [id]
    ),
  ])

  res.json({
    id: conversation.id,
    title: conversation.title,
    messages: messagesResult.rows.map(m => ({
      id: m.id, role: m.role, content: m.content,
      ...(Array.isArray(m.citations) && m.citations.length > 0 ? { citations: m.citations } : {}),
      createdAt: m.created_at,
    })),
    pendingActions: actionsResult.rows.map(a => {
      const args = (a.tool_args ?? {}) as Record<string, unknown>
      const tool = getToolByName(a.tool_name)
      return {
        id: a.id, toolName: a.tool_name,
        summary: tool?.describeAction ? tool.describeAction(args) : `Run ${a.tool_name}`,
        argsPreview: args, status: a.status,
      }
    }),
  })
}))

export default router
