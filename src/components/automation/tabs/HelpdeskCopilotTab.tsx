import { useState, useRef, useEffect } from 'react'
import { Send, Bot, User, Sparkles, RefreshCw } from 'lucide-react'
import { intuneHealthApi } from '../../../api'
import type { CopilotResponse } from '../../../api'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  suggestions?: string[]
  timestamp: Date
}

const QUICK_QUESTIONS = [
  'Which devices are non-compliant?',
  'Show BitLocker encryption status',
  'What are the current enrollment failures?',
  'Are any certificates expiring soon?',
  'Show stale or inactive devices',
  'Summarize current fleet health',
]

export function HelpdeskCopilotTab({ viewerRole }: { viewerRole: string }) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: `Hello! I'm your **Intune & MDM AI Copilot**. I can help you investigate device compliance, BitLocker encryption, enrollment failures, certificate expiry, stale devices, and policy gaps.\n\nWhat would you like to know about your endpoint fleet?`,
      suggestions: QUICK_QUESTIONS.slice(0, 4),
      timestamp: new Date(),
    },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = async (question: string) => {
    if (!question.trim() || loading) return

    const userMsg: Message = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: question,
      timestamp: new Date(),
    }

    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)

    try {
      const response: CopilotResponse = await intuneHealthApi.askCopilot(question)
      const assistantMsg: Message = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: response.answer,
        suggestions: response.suggestions,
        timestamp: new Date(response.respondedAt),
      }
      setMessages(prev => [...prev, assistantMsg])
    } catch {
      const errMsg: Message = {
        id: `e-${Date.now()}`,
        role: 'assistant',
        content: 'Sorry, I encountered an error processing your question. Please try again.',
        timestamp: new Date(),
      }
      setMessages(prev => [...prev, errMsg])
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    void sendMessage(input)
  }

  const handleReset = () => {
    setMessages([
      {
        id: 'welcome',
        role: 'assistant',
        content: `Hello! I'm your **Intune & MDM AI Copilot**. What would you like to know about your endpoint fleet?`,
        suggestions: QUICK_QUESTIONS.slice(0, 4),
        timestamp: new Date(),
      },
    ])
  }

  function renderMarkdown(text: string): React.ReactNode {
    const parts = text.split(/(\*\*[^*]+\*\*)/g)
    return parts.map((part, i) =>
      part.startsWith('**') && part.endsWith('**')
        ? <strong key={i} className="font-bold">{part.slice(2, -2)}</strong>
        : part.split('\n').map((line, j) => (
          <span key={`${i}-${j}`}>
            {j > 0 && <br />}
            {line.startsWith('• ') ? <span className="block pl-3 before:content-['•'] before:-ml-3 before:mr-1">{line.slice(2)}</span> : line}
          </span>
        ))
    )
  }

  return (
    <div className="flex flex-col h-full" style={{ minHeight: '70vh' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Bot className="h-5 w-5 text-violet-500" />
            Helpdesk AI Copilot
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Ask questions in plain English about your Intune-managed devices
            {viewerRole === 'Helpdesk' && ' · View-only access'}
          </p>
        </div>
        <button
          type="button"
          onClick={handleReset}
          className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
        >
          <RefreshCw className="h-3.5 w-3.5" />New Chat
        </button>
      </div>

      {/* Quick questions (shown when just welcome message) */}
      {messages.length <= 1 && (
        <div className="mb-4">
          <p className="text-[0.65rem] font-bold text-slate-400 uppercase tracking-wider mb-2">Quick Questions</p>
          <div className="flex flex-wrap gap-2">
            {QUICK_QUESTIONS.map(q => (
              <button
                key={q}
                type="button"
                onClick={() => void sendMessage(q)}
                className="inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-[0.68rem] font-semibold text-violet-700 hover:bg-violet-100 transition"
              >
                <Sparkles className="h-3 w-3" />{q}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Chat messages */}
      <div className="flex-1 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-4" style={{ maxHeight: '50vh' }}>
        {messages.map(msg => (
          <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
            {/* Avatar */}
            <div className={`shrink-0 h-7 w-7 rounded-full grid place-items-center text-white ${
              msg.role === 'assistant' ? 'bg-violet-500' : 'bg-[#F46C00]'
            }`}>
              {msg.role === 'assistant' ? <Bot className="h-4 w-4" /> : <User className="h-4 w-4" />}
            </div>

            {/* Bubble */}
            <div className={`max-w-[80%] rounded-2xl px-4 py-3 ${
              msg.role === 'user'
                ? 'bg-[#F46C00] text-white rounded-tr-none'
                : 'bg-white border border-slate-200 text-slate-800 rounded-tl-none shadow-sm'
            }`}>
              <p className={`text-xs leading-relaxed ${msg.role === 'user' ? 'text-white' : 'text-slate-800'}`}>
                {renderMarkdown(msg.content)}
              </p>

              {/* Follow-up suggestions */}
              {msg.suggestions && msg.suggestions.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {msg.suggestions.map(s => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => void sendMessage(s)}
                      className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[0.62rem] font-semibold text-violet-700 hover:bg-violet-100 transition"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}

              <p className="text-[0.55rem] mt-2 opacity-50">
                {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex gap-3">
            <div className="shrink-0 h-7 w-7 rounded-full grid place-items-center bg-violet-500">
              <Bot className="h-4 w-4 text-white" />
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-none px-4 py-3 shadow-sm">
              <div className="flex items-center gap-1.5">
                <div className="h-2 w-2 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="h-2 w-2 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="h-2 w-2 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="mt-3 flex gap-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Ask about device compliance, BitLocker, certificates, enrollment…"
          className="flex-1 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-400/40 focus:border-violet-400 transition"
          disabled={loading}
        />
        <button
          type="submit"
          disabled={!input.trim() || loading}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-violet-500 text-white hover:bg-violet-600 disabled:opacity-40 disabled:cursor-not-allowed transition"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>

      {/* Role note */}
      {viewerRole === 'Helpdesk' && (
        <p className="mt-2 text-center text-[0.6rem] text-slate-400">
          Helpdesk access — read-only queries only. Remediation actions require IT Admin or Global Admin role.
        </p>
      )}
    </div>
  )
}
