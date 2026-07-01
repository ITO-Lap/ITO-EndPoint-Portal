import { useState } from 'react'
import { Sparkles, Send, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react'
import { AI_PROMPTS, AI_RESPONSES } from '../../data/entraData'

interface Message { role: 'user' | 'ai'; text: string; time: string }

function formatResponse(text: string) {
  // Simple markdown-like renderer
  const lines = text.split('\n')
  return lines.map((line, i) => {
    if (line.startsWith('**') && line.endsWith('**'))
      return <p key={i} className="font-bold text-slate-100 mt-2">{line.replace(/\*\*/g, '')}</p>
    if (line.startsWith('# '))
      return <p key={i} className="text-sm font-black text-blue-400 mb-1">{line.replace('# ', '')}</p>
    if (line.match(/^\d+\.\s/))
      return <p key={i} className="text-xs text-slate-300 ml-3 my-0.5">• {line.replace(/^\d+\.\s/, '')}</p>
    if (line.startsWith('- '))
      return <p key={i} className="text-xs text-slate-400 ml-3 my-0.5">· {line.replace('- ', '')}</p>
    if (line.startsWith('**') && line.includes('**'))
      return <p key={i} className="text-xs text-slate-300" dangerouslySetInnerHTML={{ __html: line.replace(/\*\*([^*]+)\*\*/g, '<strong class="text-slate-100">$1</strong>') }} />
    return line ? <p key={i} className="text-xs text-slate-300 leading-relaxed">{line}</p> : <div key={i} className="h-1" />
  })
}

export function EntraAiCopilotPanel() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input,    setInput]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const [open,     setOpen]     = useState(true)

  const now = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  const send = async (text: string) => {
    const msg = text.trim()
    if (!msg || loading) return
    setInput('')
    setMessages(prev => [...prev, { role: 'user', text: msg, time: now() }])
    setLoading(true)
    await new Promise(r => setTimeout(r, 1400))
    const response = AI_RESPONSES[msg] ?? `I found **${Math.floor(Math.random() * 50 + 5)} resources** matching your query across your Intune/Entra environment.\n\nFor detailed analysis, connect live Microsoft Graph credentials in Settings → Integrations → Microsoft Entra ID.\n\nCurrently running in **demo mode** with synthetic data.`
    setMessages(prev => [...prev, { role: 'ai', text: response, time: now() }])
    setLoading(false)
  }

  return (
    <div className="rounded-xl border border-purple-500/30 bg-gradient-to-b from-purple-900/20 to-slate-900/20 overflow-hidden">
      {/* Header */}
      <button type="button" onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 border-b border-purple-500/20">
        <div className="flex items-center gap-2.5">
          <div className="grid h-7 w-7 place-items-center rounded-lg bg-purple-500/20">
            <Sparkles className="h-4 w-4 text-purple-400" />
          </div>
          <div className="text-left">
            <p className="text-xs font-bold text-purple-300">AI Copilot</p>
            <p className="text-[0.6rem] text-purple-400/60">Powered by Entra Intelligence · Demo mode</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {messages.length > 0 && (
            <button type="button" onClick={e => { e.stopPropagation(); setMessages([]) }}
              className="grid h-6 w-6 place-items-center rounded text-slate-500 hover:text-slate-300 transition">
              <RotateCcw className="h-3 w-3" />
            </button>
          )}
          {open ? <ChevronUp className="h-4 w-4 text-purple-400" /> : <ChevronDown className="h-4 w-4 text-purple-400" />}
        </div>
      </button>

      {open && (
        <div className="p-4 space-y-3">
          {/* Sample prompts */}
          {messages.length === 0 && (
            <div>
              <p className="text-[0.6rem] font-bold uppercase tracking-widest text-slate-500 mb-2">Sample questions</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {AI_PROMPTS.slice(0, 4).map(prompt => (
                  <button key={prompt} type="button" onClick={() => send(prompt)}
                    className="rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-left text-[0.68rem] text-slate-300 hover:border-purple-500/50 hover:bg-purple-500/8 hover:text-purple-300 transition">
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Message thread */}
          {messages.length > 0 && (
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {msg.role === 'ai' && (
                    <div className="grid h-6 w-6 flex-shrink-0 place-items-center rounded-full bg-purple-500/20 mr-2 mt-0.5">
                      <Sparkles className="h-3 w-3 text-purple-400" />
                    </div>
                  )}
                  <div className={`max-w-[85%] rounded-xl px-3 py-2.5 ${
                    msg.role === 'user'
                      ? 'bg-blue-600 text-white text-xs'
                      : 'bg-slate-800 border border-slate-700'
                  }`}>
                    {msg.role === 'user'
                      ? <p className="text-xs">{msg.text}</p>
                      : <div className="space-y-0.5">{formatResponse(msg.text)}</div>
                    }
                    <p className={`text-[0.55rem] mt-1 ${msg.role === 'user' ? 'text-blue-200' : 'text-slate-600'}`}>{msg.time}</p>
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="grid h-6 w-6 flex-shrink-0 place-items-center rounded-full bg-purple-500/20 mr-2">
                    <Sparkles className="h-3 w-3 text-purple-400 animate-pulse" />
                  </div>
                  <div className="rounded-xl bg-slate-800 border border-slate-700 px-4 py-2.5">
                    <div className="flex gap-1 items-center">
                      <div className="h-1.5 w-1.5 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="h-1.5 w-1.5 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="h-1.5 w-1.5 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Input */}
          <div className="flex gap-2">
            <input value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send(input)}
              placeholder="Ask about devices, users, policies…"
              className="flex-1 h-9 rounded-lg bg-slate-800 border border-slate-700 px-3 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-purple-500" />
            <button type="button" onClick={() => send(input)} disabled={!input.trim() || loading}
              className="grid h-9 w-9 place-items-center rounded-lg bg-purple-600 text-white hover:bg-purple-500 transition disabled:opacity-40">
              <Send className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
