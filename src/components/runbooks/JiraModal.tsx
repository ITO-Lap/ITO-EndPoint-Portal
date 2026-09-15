import { useState } from 'react'
import { X, ExternalLink, Ticket, Loader2, CheckCircle2 } from 'lucide-react'
import { api } from '../../api'
import type { JiraIssue, JiraIssueInput, ApiDevice } from '../../api'

const PRIORITY_MAP: Record<string, JiraIssueInput['priority']> = {
  Critical: 'Critical', High: 'High', Medium: 'Medium', Low: 'Low',
}

// Narrower than the (now-defunct) DeviceAnalysis type — only the fields this
// modal actually renders into the ticket description. Callers can build this
// from any real AI-derived context (e.g. risk-scoring factors/action items).
export interface JiraAiContext {
  rootCause:      string
  recommendation: string
  steps:          string[]
}

interface Props {
  device:    ApiDevice
  ai?:       JiraAiContext | null
  onClose:   () => void
  onCreated: (ticket: JiraIssue) => void
}

export function JiraModal({ device, ai, onClose, onCreated }: Props) {
  const defaultDesc = ai
    ? `**Device:** ${device.deviceName}\n**User:** ${device.user}\n**Platform:** ${device.platform} ${device.osVersion}\n**Source:** ${device.managementSource}\n\n**Root Cause:**\n${ai.rootCause}\n\n**Recommendation:**\n${ai.recommendation}\n\n**AI Remediation Steps:**\n${ai.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}`
    : `Device: ${device.deviceName}\nUser: ${device.user}\nIssue: ${device.primaryIssue}\nSeverity: ${device.severity}`

  const [summary, setSummary]       = useState(`[Compliance] ${device.deviceName} – ${device.primaryIssue || device.complianceState}`)
  const [description, setDescription] = useState(defaultDesc)
  const [issueType, setIssueType]   = useState<JiraIssueInput['issueType']>('Incident')
  const [priority, setPriority]     = useState<JiraIssueInput['priority']>(PRIORITY_MAP[device.severity] ?? 'Medium')
  const [loading, setLoading]       = useState(false)
  const [created, setCreated]       = useState<JiraIssue | null>(null)
  const [error, setError]           = useState<string | null>(null)

  const handleCreate = async () => {
    setLoading(true)
    setError(null)
    try {
      const ticket = await api.createJiraIssue({ summary, description, issueType, priority, labels: ['endpoint-compliance', 'ai-generated'] })
      setCreated(ticket)
      onCreated(ticket)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create ticket')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-slate-200 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-xl bg-orange-50 border border-orange-200">
              <Ticket className="h-4 w-4 text-orange-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800">Create Jira Ticket</p>
              <p className="text-xs text-slate-500">{device.deviceName}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 hover:bg-slate-100 text-slate-400 transition">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">
          {created ? (
            <div className="flex flex-col items-center justify-center py-8 gap-3 text-center">
              <CheckCircle2 className="h-10 w-10 text-emerald-500" />
              <p className="text-sm font-semibold text-slate-800">Ticket Created!</p>
              <a href={created.url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-sm font-medium text-orange-600 hover:text-orange-700">
                {created.key} — {created.summary}
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
              <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                created.priority === 'Critical' ? 'bg-red-100 text-red-700 border-red-200'
                : created.priority === 'High' ? 'bg-orange-100 text-orange-700 border-orange-200'
                : created.priority === 'Medium' ? 'bg-amber-100 text-amber-700 border-amber-200'
                : 'bg-slate-100 text-slate-600 border-slate-200'
              }`}>
                {created.priority}
              </span>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Summary</label>
                <input
                  type="text"
                  value={summary}
                  onChange={e => setSummary(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-orange-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Issue Type</label>
                  <select
                    value={issueType}
                    onChange={e => setIssueType(e.target.value as JiraIssueInput['issueType'])}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white"
                  >
                    <option>Incident</option>
                    <option>Task</option>
                    <option>Bug</option>
                    <option>Story</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Priority</label>
                  <select
                    value={priority}
                    onChange={e => setPriority(e.target.value as JiraIssueInput['priority'])}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white"
                  >
                    <option>Critical</option>
                    <option>High</option>
                    <option>Medium</option>
                    <option>Low</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Description</label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  rows={8}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 font-mono focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-orange-400 resize-none"
                />
              </div>

              {ai && (
                <div className="rounded-xl border border-orange-100 bg-orange-50 px-3 py-2.5 text-xs text-orange-700">
                  <span className="font-semibold">AI-populated</span> — description includes root cause analysis and remediation steps from AI.
                </div>
              )}

              {error && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100">
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition">
            {created ? 'Close' : 'Cancel'}
          </button>
          {!created && (
            <button
              type="button"
              onClick={handleCreate}
              disabled={loading || !summary.trim()}
              className="flex items-center gap-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 text-sm font-medium transition disabled:opacity-50"
            >
              {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Create Ticket
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
