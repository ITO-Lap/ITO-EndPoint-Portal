// Endpoint Operations Copilot — OpenAI tool-calling loop.
//
// Follows the same OpenAI-client pattern as services/openai.ts's getClient():
// throws if OPENAI_API_KEY / the Settings-configured key is missing, no
// fallback key path. Unlike services/openai.ts (which has rule-based
// fallbacks for its own features), the Copilot has NO fallback persona —
// when OpenAI isn't configured, routes/copilot.ts must say so plainly
// (`available: false`) rather than answering from a canned/rule-based
// script, per the product brief ("never fabricate").

import OpenAI from 'openai'
import type { ChatCompletionMessageParam, ChatCompletionTool } from 'openai/resources/chat/completions'
import { getOpenAIConfig } from '../store/integrationStore.js'
import {
  COPILOT_TOOLS, getToolByName, toolsAllowedForRole, scrubSecrets,
  type CopilotCitation, type ToolContext,
} from './copilotTools.js'

const MODEL = 'gpt-4o-mini'
const MAX_TOOL_ITERATIONS = 5

export interface CopilotMessage {
  role: 'user' | 'assistant'
  content: string
  citations?: CopilotCitation[]
}

export interface CopilotPendingActionDraft {
  toolName: string
  args: Record<string, unknown>
  summary: string
}

export interface CopilotChatResult {
  message: CopilotMessage
  pendingAction?: CopilotPendingActionDraft
  available: boolean
  /** Redacted tool-call trace for this turn, for persistence in copilot_messages.tool_calls. */
  toolCallTrace: Array<{ tool: string; args: unknown; result?: unknown; error?: string }>
}

function isOpenAIAvailable(): boolean {
  return !!getOpenAIConfig()?.apiKey
}

function getClient(): OpenAI {
  const cfg = getOpenAIConfig()
  if (!cfg?.apiKey) throw new Error('OPENAI_API_KEY is not configured — add it to server/.env or set it in Settings → Integrations')
  return new OpenAI({ apiKey: cfg.apiKey, ...(cfg.orgId ? { organization: cfg.orgId } : {}) })
}

const SYSTEM_PROMPT = `You are the Endpoint Operations Copilot for Zinnia's endpoint management platform (Zahara/Market Connect). You help IT admins, IT operators, and helpdesk staff answer questions about device compliance, risk, security posture, policies, and role activity, using ONLY the tools provided.

Rules:
- NEVER fabricate data. Only state facts returned by a tool call. If a tool fails or a data source isn't configured, say so plainly instead of guessing or inventing a plausible-sounding answer.
- Always call a tool to ground factual claims about devices, users, policies, risk scores, or activity — do not answer from memory or assumption.
- If a request is ambiguous (e.g. which device, which rule, which time range), ask a clarifying question instead of guessing.
- For write actions (creating a Jira ticket, triggering an automation rule), you must call the corresponding tool — the system will always require the user to explicitly confirm before anything actually happens. Never claim an action has been completed until the user has confirmed it.
- Be concise and specific. Cite the device/policy/rule/user identifiers you're referring to.`

function parseToolArgs(raw: string | undefined): Record<string, unknown> {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

function toOpenAITools(role: string): ChatCompletionTool[] {
  return toolsAllowedForRole(role).map(t => ({
    type: 'function' as const,
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }))
}

export async function runCopilotChat(params: {
  history: CopilotMessage[]
  userMessage: string
  ctx: ToolContext
}): Promise<CopilotChatResult> {
  const { history, userMessage, ctx } = params

  if (!isOpenAIAvailable()) {
    return {
      available: false,
      message: {
        role: 'assistant',
        content: 'The Endpoint Operations Copilot is currently unavailable — OpenAI is not configured for this environment. Add OPENAI_API_KEY in Settings → Integrations to enable it.',
      },
      toolCallTrace: [],
    }
  }

  const ai = getClient()
  const tools = toOpenAITools(ctx.actorRole)

  const messages: ChatCompletionMessageParam[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history.map((m): ChatCompletionMessageParam => ({ role: m.role, content: m.content })),
    { role: 'user', content: userMessage },
  ]

  const allCitations: CopilotCitation[] = []
  const toolCallTrace: CopilotChatResult['toolCallTrace'] = []

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
    const response = await ai.chat.completions.create({
      model: MODEL,
      messages,
      ...(tools.length > 0 ? { tools } : {}),
      temperature: 0.2,
      max_tokens: 800,
    })

    const choice = response.choices[0]
    const assistantMsg = choice?.message

    if (!assistantMsg) {
      return {
        available: true,
        message: { role: 'assistant', content: 'The Copilot did not return a response. Please try again.' },
        toolCallTrace,
      }
    }

    const toolCalls = (assistantMsg.tool_calls ?? []).filter(
      (c): c is Extract<typeof c, { type: 'function' }> => c.type === 'function'
    )
    if (toolCalls.length === 0) {
      return {
        available: true,
        message: {
          role: 'assistant', content: assistantMsg.content ?? '',
          ...(allCitations.length > 0 ? { citations: allCitations } : {}),
        },
        toolCallTrace,
      }
    }

    // Append the assistant's tool-call turn so the follow-up tool result
    // messages have a matching assistant turn to attach to.
    messages.push({
      role: 'assistant',
      content: assistantMsg.content ?? null,
      tool_calls: toolCalls,
    })

    for (const call of toolCalls) {
      const toolName = call.function.name
      const tool = getToolByName(toolName)
      const args: Record<string, unknown> = parseToolArgs(call.function.arguments)
      const redactedArgs = scrubSecrets(args)

      if (!tool) {
        toolCallTrace.push({ tool: toolName, args: redactedArgs, error: 'Unknown tool' })
        messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify({ error: `Unknown tool: ${toolName}` }) })
        continue
      }

      // Write tools are NEVER executed inside this loop — short-circuit
      // immediately with a pendingAction, regardless of iteration count or
      // any other tool calls requested in the same turn.
      if (tool.rbac === 'write') {
        const summary = tool.describeAction ? tool.describeAction(args) : `Run ${tool.name} with the given arguments`
        return {
          available: true,
          message: {
            role: 'assistant',
            content: `${summary}. This requires your confirmation before it runs — review and confirm or reject below.`,
          },
          pendingAction: { toolName: tool.name, args: redactedArgs, summary },
          toolCallTrace,
        }
      }

      try {
        const { result, citations } = await tool.run(args, ctx)
        const redactedResult = scrubSecrets(result)
        allCitations.push(...citations)
        toolCallTrace.push({ tool: toolName, args: redactedArgs, result: redactedResult })
        messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(redactedResult) })
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err)
        toolCallTrace.push({ tool: toolName, args: redactedArgs, error: errorMessage })
        messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify({ error: errorMessage }) })
      }
    }
  }

  return {
    available: true,
    message: {
      role: 'assistant',
      content: 'I gathered information across multiple tool calls but reached the maximum reasoning depth for a single turn. Please ask a more specific follow-up question.',
      ...(allCitations.length > 0 ? { citations: allCitations } : {}),
    },
    toolCallTrace,
  }
}

export { COPILOT_TOOLS }
