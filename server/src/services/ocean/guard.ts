// Ocean input and output guards: refuse requests that try to extract secrets or the assistant's internal
// instructions, and mask anything credential-like before an answer leaves the server.

import { scrubSecrets } from '../copilotTools.js'
import { redactSecrets } from './knowledgeRules.js'

const SECRET_WORDS = '(?:api[\\s_-]?keys?|secrets?|client[\\s_-]?secrets?|tokens?|access[\\s_-]?tokens?|refresh[\\s_-]?tokens?|passwords?|passwd|credentials?|connection[\\s_-]?strings?|private[\\s_-]?keys?|\\.env|env(?:ironment)?[\\s_-]?(?:file|vars?|variables?)\\s+(?:values?|contents?)|bearer)'
const REVEAL_VERBS = '(?:show|print|reveal|give|tell|display|dump|expose|leak|share|send|paste|output|list|read|cat|echo|return|provide|disclose|decode|what(?:\'s|\\s+is|\\s+are)|whats)'
// Phrases that turn "the API key" into a how-to or policy question rather than a request for the value.
const BENIGN_FOLLOW = '(?:\\s+(?:rotation|rotate|expir|requirement|permission|scope|setting|setup|set\\s*up|config|location|stored|storage|policy|process|name|variable|var\\b|format|length|lifetime|renew|generate|create|obtain|get\\s+one|required|needed|used\\s+for|refresh|renewal|lifecycle|flow|handling))'

const EXTRACTION = new RegExp(`\\b${REVEAL_VERBS}\\b[^.?!\\n]{0,60}\\b${SECRET_WORDS}\\b(?!${BENIGN_FOLLOW})`, 'i')
const VALUE_REQUEST = /\b(?:value|contents?)\s+of\s+(?:the\s+|our\s+|your\s+)?(?:[\w.-]*(?:key|secret|token|password)[\w.-]*|\.env)\b/i
const INJECTION = /\b(?:ignore|disregard|forget|override)\b[^.?!\n]{0,40}\b(?:previous|prior|above|earlier|all|your)\b[^.?!\n]{0,30}\b(?:instructions?|rules?|prompt|guidelines?)\b|\b(?:reveal|show|print|repeat|display|leak)\b[^.?!\n]{0,30}\b(?:system|hidden|internal|initial)\s+(?:prompt|instructions?|message)\b|\bdeveloper mode\b|\bjailbreak\b/i

export type GuardVerdict = { blocked: false } | { blocked: true; reason: 'secret-request' | 'instruction-override'; message: string }

export function inspectRequest(message: string): GuardVerdict {
  if (INJECTION.test(message)) {
    return { blocked: true, reason: 'instruction-override', message: "I can't change my safety rules or share my internal instructions. I can still answer questions about the tool from the project documentation, so tell me what you'd like to know." }
  }
  if (EXTRACTION.test(message) || VALUE_REQUEST.test(message)) {
    return { blocked: true, reason: 'secret-request', message: "I can't share secrets, API keys, tokens, passwords, connection strings or other private configuration values, and I don't have access to them. If you need to know how a credential is configured or rotated, ask me how it works and I'll point you to the documentation, or contact an administrator." }
  }
  return { blocked: false }
}

/** Last line of defence: masks credential-looking text in anything Ocean returns. */
export function sanitizeAnswer(text: string): string {
  return redactSecrets(scrubSecrets(text))
}
