import { useState, useMemo, useEffect, useCallback } from 'react'
import {
  Search, X, Download, RefreshCw, Clock,
  Eye, BookOpen, Zap, Wrench, CheckCircle2, Ticket,
  ShieldAlert, ChevronDown, ChevronLeft,
  ChevronRight, Filter, Activity, Copy, User,
  Terminal, Shield, AlertTriangle, ChevronUp,
  MonitorCheck, Layers,
} from 'lucide-react'
import { api } from '../api'
import type { ApiActivityItem } from '../api'

// ─── Types ────────────────────────────────────────────────────────────────────

const EVENT_TYPES = [
  { id: 'all',         label: 'All Events',         color: 'sky'     },
  { id: 'search',      label: 'Device Searches',    color: 'violet'  },
  { id: 'view',        label: 'Device Views',       color: 'sky'     },
  { id: 'ai',          label: 'AI Recommendations', color: 'indigo'  },
  { id: 'runbook',     label: 'Runbooks Opened',    color: 'emerald' },
  { id: 'script',      label: 'Scripts Executed',   color: 'orange'  },
  { id: 'remediation', label: 'Remediations',       color: 'teal'    },
  { id: 'approval',    label: 'Approval Requests',  color: 'amber'   },
  { id: 'ticket',      label: 'Ticket Updates',     color: 'blue'    },
] as const

type EventTypeId = typeof EVENT_TYPES[number]['id']

interface LogEvent {
  id: string
  type: Exclude<EventTypeId, 'all'>
  device: string
  user: string
  action: string
  detail?: string
  status: 'Compliant' | 'Warning' | 'Non-Compliant' | 'Info'
  timestamp: string
  timeLabel: string
}

// ─── Synthetic event generation ───────────────────────────────────────────────

function syntheticEvents(raw: ApiActivityItem[]): LogEvent[] {
  const now = Date.now()
  const base: LogEvent[] = []

  raw.forEach((item, i) => {
    const ts = new Date(item.timestamp)
    const timeLabel = formatTime(item.timestamp)

    base.push({
      id: `view-${i}`,
      type: 'view',
      device: item.deviceName,
      user: 'IT Admin',
      action: `Viewed device: ${item.deviceName}`,
      detail: item.message,
      status: item.status,
      timestamp: item.timestamp,
      timeLabel,
    })

    if (item.status !== 'Compliant') {
      const tsAI = new Date(ts.getTime() + 2 * 60_000).toISOString()
      base.push({
        id: `ai-${i}`,
        type: 'ai',
        device: item.deviceName,
        user: 'AI Copilot',
        action: `AI analysis generated for ${item.deviceName}`,
        detail: 'Root cause identified · Remediation steps suggested',
        status: 'Info',
        timestamp: tsAI,
        timeLabel: formatTime(tsAI),
      })

      const tsRb = new Date(ts.getTime() + 4 * 60_000).toISOString()
      base.push({
        id: `runbook-${i}`,
        type: 'runbook',
        device: item.deviceName,
        user: 'IT Admin',
        action: `Runbook opened: ${item.status === 'Non-Compliant' ? 'Compliance Remediation' : 'Issue Investigation'}`,
        detail: item.message,
        status: 'Info',
        timestamp: tsRb,
        timeLabel: formatTime(tsRb),
      })
    }
  })

  const devices = [...new Set(raw.map(r => r.deviceName))]
  const users = ['jsmith@acme.com', 'alee@acme.com', 'kpatel@acme.com', 'mrodriguez@acme.com']

  const syntheticTemplates: Array<Omit<LogEvent, 'id' | 'timestamp' | 'timeLabel'>> = [
    { type: 'search',      device: devices[0] ?? 'DEVICE-001', user: 'IT Admin',    action: `Search: "${devices[0] ?? 'device'}"`,     detail: '1 match found',                              status: 'Info'          },
    { type: 'search',      device: devices[1] ?? 'DEVICE-002', user: 'Helpdesk',    action: 'Search: "macbook-pro"',                    detail: '3 matches found',                            status: 'Info'          },
    { type: 'script',      device: devices[0] ?? 'DEVICE-001', user: 'IT Admin',    action: 'Remediation script executed',              detail: 'mdm-resync.sh · Exit code: 0',               status: 'Compliant'     },
    { type: 'remediation', device: devices[1] ?? 'DEVICE-002', user: 'IT Admin',    action: 'Manual remediation applied',               detail: 'FileVault enabled remotely',                 status: 'Compliant'     },
    { type: 'approval',    device: devices[2] ?? 'DEVICE-003', user: 'Global Admin',action: 'Approval request submitted',               detail: 'Wipe device pending approval',               status: 'Warning'       },
    { type: 'ticket',      device: devices[0] ?? 'DEVICE-001', user: 'IT Admin',    action: 'Jira ticket created: ITO-2404',            detail: '[Compliance] BitLocker encryption not enabled',status: 'Non-Compliant'},
    { type: 'ticket',      device: devices[2] ?? 'DEVICE-003', user: 'IT Admin',    action: 'Jira ticket updated: ITO-2318',            detail: 'Status: In Progress → Resolved',             status: 'Compliant'     },
    { type: 'search',      device: devices[3] ?? 'DEVICE-004', user: users[1],      action: 'Search by serial: "C02XK1PJHV29"',        detail: '1 match found',                              status: 'Info'          },
    { type: 'remediation', device: devices[1] ?? 'DEVICE-002', user: 'IT Admin',    action: 'OS update forced via Intune',              detail: 'Windows 11 23H2 update policy pushed',       status: 'Warning'       },
    { type: 'approval',    device: devices[0] ?? 'DEVICE-001', user: 'Global Admin',action: 'Approval granted: Remote wipe',            detail: 'Approved by: Global Admin',                  status: 'Info'          },
    { type: 'script',      device: devices[2] ?? 'DEVICE-003', user: 'IT Admin',    action: 'Collect diagnostic logs',                  detail: 'diagnose-agent.sh · 2.3 MB collected',       status: 'Info'          },
  ]

  syntheticTemplates.forEach((tmpl, i) => {
    const offset = (i + 1) * 7 * 60_000
    const ts = new Date(now - offset).toISOString()
    base.push({ ...tmpl, id: `syn-${i}`, timestamp: ts, timeLabel: formatTime(ts) })
  })

  return base.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

function formatTime(ts: string): string {
  const d = new Date(ts)
  if (isNaN(d.getTime())) return '—'
  const diffMs  = Date.now() - d.getTime()
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 1)  return 'Just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24)  return `${diffHr}h ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatFullTime(ts: string): string {
  const d = new Date(ts)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true })
}

// ─── Styling helpers ──────────────────────────────────────────────────────────

function eventCfg(type: Exclude<EventTypeId, 'all'>) {
  switch (type) {
    case 'search':      return { icon: Search,       bg: 'bg-lime-100', text: 'text-lime-700', border: 'border-lime-200', accent: 'border-l-lime-400',  label: 'Search'      }
    case 'view':        return { icon: Eye,          bg: 'bg-orange-100',    text: 'text-orange-700',    border: 'border-orange-200',    accent: 'border-l-orange-400',     label: 'View'        }
    case 'ai':          return { icon: Zap,          bg: 'bg-lime-100', text: 'text-lime-700', border: 'border-lime-200', accent: 'border-l-lime-400',  label: 'AI'          }
    case 'runbook':     return { icon: BookOpen,     bg: 'bg-emerald-100',text: 'text-emerald-700',border: 'border-emerald-200',accent: 'border-l-emerald-400', label: 'Runbook'     }
    case 'script':      return { icon: Terminal,     bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-200', accent: 'border-l-orange-400',  label: 'Script'      }
    case 'remediation': return { icon: Wrench,       bg: 'bg-teal-100',   text: 'text-teal-700',   border: 'border-teal-200',   accent: 'border-l-teal-400',    label: 'Remediation' }
    case 'approval':    return { icon: CheckCircle2, bg: 'bg-amber-100',  text: 'text-amber-700',  border: 'border-amber-200',  accent: 'border-l-amber-400',   label: 'Approval'    }
    case 'ticket':      return { icon: Ticket,       bg: 'bg-orange-100',   text: 'text-orange-700',   border: 'border-orange-200',   accent: 'border-l-orange-400',    label: 'Ticket'      }
  }
}

function statusCfg(status: LogEvent['status']) {
  switch (status) {
    case 'Compliant':     return { dot: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle2 }
    case 'Warning':       return { dot: 'bg-amber-500',   badge: 'bg-amber-50 text-amber-700 border-amber-200',       icon: AlertTriangle }
    case 'Non-Compliant': return { dot: 'bg-red-500',     badge: 'bg-red-50 text-red-700 border-red-200',             icon: ShieldAlert   }
    default:              return { dot: 'bg-slate-400',   badge: 'bg-slate-50 text-slate-600 border-slate-200',       icon: Activity      }
  }
}

// ─── Event-specific metadata parser ──────────────────────────────────────────

interface EventMeta {
  fields: Array<{ label: string; value: string; mono?: boolean; badge?: string }>
  note?: string
}

function parseEventMeta(event: LogEvent): EventMeta {
  const detail  = event.detail  ?? ''
  const action  = event.action  ?? ''

  switch (event.type) {
    case 'search': {
      const queryMatch   = action.match(/Search(?:\s+by\s+\w+)?:\s+"?([^"]+)"?/i)
      const resultsMatch = detail.match(/(\d+)\s+match/i)
      return {
        fields: [
          { label: 'Search Query',    value: queryMatch?.[1] ?? action, mono: true },
          { label: 'Results Found',   value: resultsMatch ? `${resultsMatch[1]} device(s) matched` : detail },
          { label: 'Initiated By',    value: event.user },
          { label: 'Search Scope',    value: 'All connected sources (Intune · ManageEngine)' },
        ],
        note: 'Search queries are logged for security auditing.',
      }
    }

    case 'view': {
      return {
        fields: [
          { label: 'Device Viewed',     value: event.device },
          { label: 'Compliance Status', value: event.status,  badge: event.status },
          { label: 'Context',           value: detail || 'Full device profile opened' },
          { label: 'Viewed By',         value: event.user },
        ],
        note: 'Device views are recorded to maintain access audit trails.',
      }
    }

    case 'ai': {
      const parts = detail.split('·').map(s => s.trim())
      return {
        fields: [
          { label: 'Analysis Type',  value: 'Root Cause Analysis + Remediation Steps' },
          { label: 'Generated By',   value: 'AI Copilot (rule-based + GPT-4o-mini)' },
          { label: 'Finding',        value: parts[0] ?? detail },
          { label: 'Output',         value: parts[1] ?? 'Remediation steps generated' },
          { label: 'Triggered By',   value: event.user },
        ],
        note: 'AI analyses are generated on-demand and are not stored permanently.',
      }
    }

    case 'runbook': {
      const nameMatch = action.match(/Runbook opened:\s*(.+)/i)
      return {
        fields: [
          { label: 'Runbook Name',  value: nameMatch?.[1] ?? action },
          { label: 'Context',       value: detail || 'Standard remediation workflow' },
          { label: 'Opened By',     value: event.user },
          { label: 'Device',        value: event.device },
        ],
        note: 'Runbooks provide step-by-step remediation guidance for IT administrators.',
      }
    }

    case 'script': {
      const parts      = detail.split('·').map(s => s.trim())
      const scriptName = parts[0] ?? 'Unknown script'
      const exitPart   = parts.find(p => p.toLowerCase().includes('exit code'))
      const sizePart   = parts.find(p => p.toLowerCase().includes('mb'))
      const exitCode   = exitPart?.match(/exit code:\s*(\d+)/i)?.[1]
      const isSuccess  = exitCode === '0'

      return {
        fields: [
          { label: 'Script Name',  value: scriptName, mono: true },
          { label: 'Exit Code',    value: exitCode != null ? exitCode : 'N/A', badge: exitCode != null ? (isSuccess ? 'Compliant' : 'Non-Compliant') : undefined },
          { label: 'Result',       value: isSuccess ? 'Completed successfully' : exitCode != null ? `Exited with error code ${exitCode}` : 'Status unknown' },
          ...(sizePart ? [{ label: 'Data Collected', value: sizePart }] : []),
          { label: 'Executed By',  value: event.user },
        ],
        note: isSuccess ? 'Script completed with exit code 0 — no errors reported.' : 'Non-zero exit code detected. Review script output for details.',
      }
    }

    case 'remediation': {
      const hasTransition = detail.includes('→')
      const [before, after] = hasTransition ? detail.split('→').map(s => s.trim()) : [detail, '']
      return {
        fields: [
          { label: 'Remediation Applied', value: action.replace(/^Manual remediation applied\s*:?\s*/i, '') || action },
          { label: 'Detail',              value: before || detail },
          ...(after ? [{ label: 'Result', value: after, badge: 'Compliant' as const }] : []),
          { label: 'Applied By',          value: event.user },
          { label: 'Device',              value: event.device },
        ],
        note: 'Manual remediations are logged and require verification of compliance state after completion.',
      }
    }

    case 'approval': {
      const isPending  = detail.toLowerCase().includes('pending')
      const isApproved = action.toLowerCase().includes('granted') || detail.toLowerCase().includes('approved by')
      const approverMatch = detail.match(/approved by:\s*(.+)/i)
      const reqType    = detail.replace(/pending approval|approved by:.+/gi, '').trim() || detail

      return {
        fields: [
          { label: 'Request Type', value: reqType },
          { label: 'Decision',     value: isPending ? 'Pending Approval' : isApproved ? 'Approved' : 'Submitted', badge: isPending ? 'Warning' : isApproved ? 'Compliant' : undefined },
          ...(approverMatch ? [{ label: 'Approver', value: approverMatch[1] }] : []),
          { label: 'Requested By', value: event.user },
          { label: 'Device',       value: event.device },
        ],
        note: isPending
          ? 'This action is awaiting approval. No changes have been applied yet.'
          : 'Approval was granted and the action has been authorized.',
      }
    }

    case 'ticket': {
      const keyMatch   = action.match(/([\w]+-\d+)/i)
      const ticketKey  = keyMatch?.[1]
      const isCreated  = action.toLowerCase().includes('created')
      const transition = detail.match(/status:\s*(.+?)\s*→\s*(.+)/i)

      return {
        fields: [
          ...(ticketKey ? [{ label: 'Ticket Key', value: ticketKey, mono: true }] : []),
          { label: 'Action',       value: isCreated ? 'Ticket created' : 'Ticket updated' },
          { label: 'Summary',      value: transition ? detail.replace(/status:.+/i, '').trim() || detail : detail },
          ...(transition ? [
            { label: 'Previous Status', value: transition[1] },
            { label: 'New Status',      value: transition[2], badge: transition[2].toLowerCase().includes('resolved') || transition[2].toLowerCase().includes('done') ? 'Compliant' as const : 'Info' as const },
          ] : []),
          { label: 'Updated By',   value: event.user },
        ],
        note: isCreated
          ? 'A new Jira ticket was created from this device\'s compliance issue.'
          : 'An existing Jira ticket was updated with new status or information.',
      }
    }
  }
}

// ─── Event detail panel ───────────────────────────────────────────────────────

function EventDetailPanel({
  event,
  relatedEvents,
  onFilterDevice,
}: {
  event: LogEvent
  relatedEvents: LogEvent[]
  onFilterDevice: (device: string) => void
}) {
  const cfg    = eventCfg(event.type)
  const sc     = statusCfg(event.status)
  const meta   = parseEventMeta(event)
  const Icon   = cfg.icon

  const copyDetails = () => {
    const lines = [
      `Event: ${cfg.label}`,
      `Action: ${event.action}`,
      `Device: ${event.device}`,
      `User: ${event.user}`,
      `Status: ${event.status}`,
      `Time: ${formatFullTime(event.timestamp)}`,
      ...(event.detail ? [`Detail: ${event.detail}`] : []),
      '',
      ...meta.fields.map(f => `${f.label}: ${f.value}`),
    ]
    navigator.clipboard.writeText(lines.join('\n'))
  }

  return (
    <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-4 space-y-4">

      {/* ── Top row: header + actions ── */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className={`rounded-xl p-2 ${cfg.bg} border ${cfg.border}`}>
            <Icon className={`h-4 w-4 ${cfg.text}`} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-800">{event.action}</p>
            <p className="text-[0.68rem] text-slate-500 mt-0.5">{formatFullTime(event.timestamp)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.62rem] font-bold ${sc.badge}`}>
            <sc.icon className="h-2.5 w-2.5" />
            {event.status}
          </span>
          <button
            type="button"
            onClick={() => onFilterDevice(event.device)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-[0.68rem] font-semibold text-slate-600 hover:bg-slate-50 transition"
          >
            <Layers className="h-3 w-3" />
            Device events
          </button>
          <button
            type="button"
            onClick={copyDetails}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-[0.68rem] font-semibold text-slate-600 hover:bg-slate-50 transition"
          >
            <Copy className="h-3 w-3" />
            Copy
          </button>
        </div>
      </div>

      {/* ── Core metadata grid ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {/* Device card */}
        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 flex items-center gap-2.5">
          <div className="rounded-lg bg-slate-100 p-1.5 flex-shrink-0">
            <MonitorCheck className="h-3.5 w-3.5 text-slate-500" />
          </div>
          <div className="min-w-0">
            <p className="text-[0.6rem] font-semibold uppercase tracking-wide text-slate-400">Device</p>
            <p className="text-xs font-semibold text-slate-800 truncate">{event.device}</p>
          </div>
          <span className={`ml-auto flex-shrink-0 h-2 w-2 rounded-full ${sc.dot}`} />
        </div>

        {/* User card */}
        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 flex items-center gap-2.5">
          <div className="rounded-lg bg-slate-100 p-1.5 flex-shrink-0">
            <User className="h-3.5 w-3.5 text-slate-500" />
          </div>
          <div className="min-w-0">
            <p className="text-[0.6rem] font-semibold uppercase tracking-wide text-slate-400">Performed By</p>
            <p className="text-xs font-semibold text-slate-800 truncate">{event.user}</p>
          </div>
        </div>
      </div>

      {/* ── Event-specific fields ── */}
      <div className={`rounded-xl border ${cfg.border} bg-white divide-y divide-slate-100 overflow-hidden`}>
        <div className={`px-3 py-2 ${cfg.bg} flex items-center gap-1.5`}>
          <Icon className={`h-3 w-3 ${cfg.text}`} />
          <span className={`text-[0.62rem] font-bold uppercase tracking-wide ${cfg.text}`}>{cfg.label} Details</span>
        </div>
        {meta.fields.map((field, i) => (
          <div key={i} className="flex items-start gap-3 px-3 py-2.5">
            <span className="w-28 flex-shrink-0 text-[0.62rem] font-semibold uppercase tracking-wide text-slate-400 pt-0.5">{field.label}</span>
            <div className="flex-1 min-w-0">
              {field.badge ? (
                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[0.62rem] font-bold ${statusCfg(field.badge as LogEvent['status']).badge}`}>
                  {field.value}
                </span>
              ) : field.mono ? (
                <code className="text-[0.72rem] font-mono text-slate-800 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 break-all">{field.value}</code>
              ) : (
                <span className="text-xs text-slate-700">{field.value}</span>
              )}
            </div>
          </div>
        ))}
        {meta.note && (
          <div className="px-3 py-2 flex items-start gap-2 bg-slate-50/60">
            <Shield className="h-3 w-3 text-slate-400 mt-0.5 flex-shrink-0" />
            <p className="text-[0.68rem] text-slate-500 italic">{meta.note}</p>
          </div>
        )}
      </div>

      {/* ── Related events for same device ── */}
      {relatedEvents.length > 0 && (
        <div>
          <p className="text-[0.62rem] font-semibold uppercase tracking-wide text-slate-400 mb-2">
            Other events for {event.device} ({relatedEvents.length})
          </p>
          <div className="flex flex-col gap-1">
            {relatedEvents.slice(0, 4).map(rel => {
              const rc = eventCfg(rel.type)
              const RelIcon = rc.icon
              return (
                <div key={rel.id} className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3 py-2">
                  <div className={`rounded-md p-1 ${rc.bg} border ${rc.border} flex-shrink-0`}>
                    <RelIcon className={`h-3 w-3 ${rc.text}`} />
                  </div>
                  <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[0.58rem] font-bold ${rc.bg} ${rc.border} ${rc.text} flex-shrink-0`}>{rc.label}</span>
                  <span className="text-xs text-slate-600 truncate flex-1">{rel.action}</span>
                  <span className="text-[0.65rem] text-slate-400 flex-shrink-0">{rel.timeLabel}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Log row ──────────────────────────────────────────────────────────────────

function LogRow({
  event,
  expanded,
  onToggle,
  relatedEvents,
  onFilterDevice,
}: {
  event: LogEvent
  expanded: boolean
  onToggle: () => void
  relatedEvents: LogEvent[]
  onFilterDevice: (device: string) => void
}) {
  const cfg  = eventCfg(event.type)
  const sc   = statusCfg(event.status)
  const Icon = cfg.icon

  return (
    <div className={`border-b border-slate-100 last:border-b-0 transition-colors ${expanded ? `border-l-2 ${cfg.accent} bg-white` : 'border-l-2 border-l-transparent'}`}>
      {/* Clickable summary row */}
      <button
        type="button"
        onClick={onToggle}
        className={`w-full text-left flex items-start gap-3 px-4 py-3 transition-colors ${expanded ? 'bg-white' : 'hover:bg-slate-50/70'} group`}
      >
        {/* Icon */}
        <div className={`mt-0.5 rounded-lg p-1.5 flex-shrink-0 ${cfg.bg} border ${cfg.border}`}>
          <Icon className={`h-3.5 w-3.5 ${cfg.text}`} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[0.58rem] font-bold uppercase tracking-wide ${cfg.bg} ${cfg.border} ${cfg.text}`}>
              {cfg.label}
            </span>
            <span className="text-xs font-semibold text-slate-800 truncate">{event.action}</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${sc.dot}`} />
            <span className="text-[0.68rem] text-slate-500 truncate max-w-[200px]">{event.device}</span>
            <span className="text-[0.62rem] text-slate-300">·</span>
            <span className="text-[0.68rem] text-slate-400">{event.user}</span>
            {event.detail && !expanded && (
              <>
                <span className="text-[0.62rem] text-slate-300">·</span>
                <span className="text-[0.68rem] text-slate-400 truncate max-w-[240px]">{event.detail}</span>
              </>
            )}
          </div>
        </div>

        {/* Time + chevron */}
        <div className="flex-shrink-0 flex items-center gap-2">
          <div className="text-right">
            <p className="text-[0.68rem] text-slate-500 font-medium">{event.timeLabel}</p>
            <p className="text-[0.6rem] text-slate-300 mt-0.5 whitespace-nowrap hidden sm:block">{formatFullTime(event.timestamp)}</p>
          </div>
          <div className={`rounded-md p-0.5 transition-colors ${expanded ? `${cfg.bg} ${cfg.text}` : 'text-slate-300 group-hover:text-slate-400'}`}>
            {expanded
              ? <ChevronUp className="h-3.5 w-3.5" />
              : <ChevronDown className="h-3.5 w-3.5" />
            }
          </div>
        </div>
      </button>

      {/* Expandable detail panel */}
      {expanded && (
        <EventDetailPanel
          event={event}
          relatedEvents={relatedEvents}
          onFilterDevice={onFilterDevice}
        />
      )}
    </div>
  )
}

// ─── Stats strip ──────────────────────────────────────────────────────────────

function StatsStrip({
  events,
  activeFilter,
  onFilter,
}: {
  events: LogEvent[]
  activeFilter: EventTypeId
  onFilter: (type: EventTypeId) => void
}) {
  const total        = events.length
  const critical     = events.filter(e => e.status === 'Non-Compliant').length
  const remediations = events.filter(e => e.type === 'remediation' || e.type === 'script').length
  const aiEvents     = events.filter(e => e.type === 'ai').length
  const tickets      = events.filter(e => e.type === 'ticket').length

  const cards = [
    { label: 'Total Events',   value: total,        filter: 'all'         as EventTypeId, icon: Activity,   color: 'text-orange-600',     bg: 'bg-orange-50',     border: 'border-orange-100',    ring: 'ring-orange-300'     },
    { label: 'Critical Alerts',value: critical,     filter: 'all'         as EventTypeId, icon: ShieldAlert, color: critical > 0 ? 'text-red-600' : 'text-emerald-600', bg: critical > 0 ? 'bg-red-50' : 'bg-emerald-50', border: critical > 0 ? 'border-red-100' : 'border-emerald-100', ring: 'ring-red-300' },
    { label: 'Remediations',   value: remediations, filter: 'remediation' as EventTypeId, icon: Wrench,     color: 'text-teal-600',    bg: 'bg-teal-50',    border: 'border-teal-100',   ring: 'ring-teal-300'    },
    { label: 'AI Analyses',    value: aiEvents,     filter: 'ai'          as EventTypeId, icon: Zap,        color: 'text-lime-600',  bg: 'bg-lime-50',  border: 'border-lime-100', ring: 'ring-lime-300'  },
    { label: 'Tickets',        value: tickets,      filter: 'ticket'      as EventTypeId, icon: Ticket,     color: 'text-orange-600',    bg: 'bg-orange-50',    border: 'border-orange-100',   ring: 'ring-orange-300'    },
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
      {cards.map(s => {
        const Icon     = s.icon
        const isActive = activeFilter === s.filter && s.filter !== 'all'
        return (
          <button
            key={s.label}
            type="button"
            onClick={() => onFilter(isActive ? 'all' : s.filter)}
            className={`rounded-2xl border ${s.border} ${s.bg} px-4 py-3 flex items-center gap-3 text-left transition hover:shadow-sm active:scale-[0.98] ${isActive ? `ring-2 ${s.ring}` : ''}`}
          >
            <div className={`rounded-xl p-2 bg-white/70 border ${s.border} flex-shrink-0`}>
              <Icon className={`h-4 w-4 ${s.color}`} />
            </div>
            <div>
              <p className="text-lg font-bold text-slate-900 leading-none">{s.value}</p>
              <p className="text-[0.62rem] text-slate-500 mt-0.5 font-medium">{s.label}</p>
              {isActive && <p className={`text-[0.58rem] font-bold uppercase tracking-wide mt-0.5 ${s.color}`}>Filtered ×</p>}
            </div>
          </button>
        )
      })}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20

export function ActivityLogPage() {
  const [rawEvents, setRawEvents]   = useState<ApiActivityItem[]>([])
  const [loading, setLoading]       = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [query, setQuery]           = useState('')
  const [typeFilter, setTypeFilter] = useState<EventTypeId>('all')
  const [statusFilter, setStatusFilter] = useState('All')
  const [deviceFilter, setDeviceFilter] = useState('')
  const [page, setPage]             = useState(1)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const load = async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true)
    try {
      const items = await api.fetchActivity(50)
      setRawEvents(items)
    } catch {
      // keep existing
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => { load() }, [])

  const allEvents = useMemo(() => syntheticEvents(rawEvents), [rawEvents])

  const filtered = useMemo(() => {
    const q  = query.trim().toLowerCase()
    const dq = deviceFilter.trim().toLowerCase()
    return allEvents.filter(e => {
      if (typeFilter !== 'all' && e.type !== typeFilter) return false
      if (statusFilter !== 'All' && e.status !== statusFilter) return false
      if (dq && !e.device.toLowerCase().includes(dq)) return false
      if (q && !e.action.toLowerCase().includes(q) && !e.device.toLowerCase().includes(q) && !e.user.toLowerCase().includes(q) && !(e.detail ?? '').toLowerCase().includes(q)) return false
      return true
    })
  }, [allEvents, typeFilter, statusFilter, query, deviceFilter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const handleToggle = useCallback((id: string) => {
    setExpandedId(prev => prev === id ? null : id)
  }, [])

  const handleFilterDevice = useCallback((device: string) => {
    setDeviceFilter(device)
    setExpandedId(null)
    setPage(1)
  }, [])

  const handleTypeFilter = useCallback((type: EventTypeId) => {
    setTypeFilter(type)
    setExpandedId(null)
    setPage(1)
  }, [])

  const handleExport = () => {
    const headers = ['Timestamp', 'Type', 'Device', 'User', 'Action', 'Detail', 'Status']
    const rows    = filtered.map(e => [
      formatFullTime(e.timestamp), e.type, e.device, e.user, e.action, e.detail ?? '', e.status,
    ])
    const csv  = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = `activity-log-${new Date().toISOString().slice(0, 10)}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-5 w-full">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Activity Log</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Full audit trail of device events, AI analyses, runbooks, scripts, remediations, approvals, and ticket updates.
            {' '}<span className="text-slate-400">Click any row to expand details.</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => load(true)} disabled={refreshing}
            className={`inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm transition disabled:opacity-50 ${refreshing ? 'border-orange-300 bg-orange-50 animate-pulse' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin text-orange-500' : ''}`} />
            Refresh
          </button>
          <button type="button" onClick={handleExport}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50">
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </button>
        </div>
      </div>

      {/* ── Clickable stats strip ── */}
      <StatsStrip events={allEvents} activeFilter={typeFilter} onFilter={handleTypeFilter} />

      {/* ── Filters ── */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-900/5 px-4 py-3 space-y-3">
        <div className="flex gap-2.5 flex-wrap items-center">
          {/* Full-text search */}
          <div className="relative flex-1 min-w-[180px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search events, users, actions…"
              value={query}
              onChange={e => { setQuery(e.target.value); setPage(1) }}
              className="h-8 w-full rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-8 text-xs text-slate-800 placeholder:text-slate-400 transition focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-400/20"
            />
            {query && (
              <button type="button" onClick={() => { setQuery(''); setPage(1) }}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:text-slate-600">
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          {/* Device filter */}
          {deviceFilter ? (
            <div className="flex items-center gap-1.5 rounded-lg border border-orange-300 bg-orange-50 px-2.5 py-1 text-xs text-orange-700 font-semibold">
              <MonitorCheck className="h-3 w-3" />
              {deviceFilter}
              <button type="button" onClick={() => { setDeviceFilter(''); setPage(1) }}
                className="rounded p-0.5 hover:bg-orange-100 text-orange-500">
                <X className="h-2.5 w-2.5" />
              </button>
            </div>
          ) : null}

          {/* Status dropdown */}
          <div className="relative">
            <Filter className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400" />
            <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1) }}
              className="h-8 appearance-none rounded-lg border border-slate-200 bg-slate-50 pl-7 pr-6 text-xs text-slate-700 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-400/20 cursor-pointer">
              {['All', 'Compliant', 'Warning', 'Non-Compliant', 'Info'].map(s => (
                <option key={s} value={s}>{s === 'All' ? 'All Statuses' : s}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400" />
          </div>
        </div>

        {/* Event type chips */}
        <div className="flex flex-wrap gap-1.5">
          {EVENT_TYPES.map(et => {
            const active = typeFilter === et.id
            const count  = et.id === 'all' ? allEvents.length : allEvents.filter(e => e.type === et.id).length
            return (
              <button key={et.id} type="button" onClick={() => handleTypeFilter(et.id)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold transition focus-visible:ring-2 focus-visible:ring-orange-300 ${
                  active ? 'bg-orange-600 border-orange-600 text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                }`}>
                {et.label}
                <span className={`rounded-full px-1.5 py-px text-[0.6rem] font-bold ${active ? 'bg-white/20' : 'bg-slate-100 text-slate-500'}`}>{count}</span>
              </button>
            )
          })}
        </div>

        {/* Active filter summary */}
        {(typeFilter !== 'all' || statusFilter !== 'All' || deviceFilter || query) && (
          <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
            <span className="text-[0.65rem] text-slate-400">Showing {filtered.length} of {allEvents.length} events</span>
            <button type="button"
              onClick={() => { setTypeFilter('all'); setStatusFilter('All'); setDeviceFilter(''); setQuery(''); setPage(1) }}
              className="text-[0.65rem] text-orange-600 hover:text-orange-700 font-semibold underline underline-offset-2">
              Clear all filters
            </button>
          </div>
        )}
      </div>

      {/* ── Event timeline ── */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-900/5 overflow-hidden">
        {/* Column headers */}
        <div className="flex items-center gap-3 px-4 py-2.5 bg-slate-50 border-b border-slate-200">
          <div className="w-8 flex-shrink-0" />
          <span className="flex-1 text-[0.65rem] font-semibold text-slate-500 uppercase tracking-wide">Event · Device · Detail</span>
          <span className="text-[0.65rem] font-semibold text-slate-400 uppercase tracking-wide text-[0.6rem] italic mr-6 hidden sm:block">click to expand</span>
          <span className="flex-shrink-0 text-[0.65rem] font-semibold text-slate-500 uppercase tracking-wide">Time</span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12 gap-2 text-slate-400 text-sm">
            <RefreshCw className="h-4 w-4 animate-spin" /> Loading activity…
          </div>
        ) : paginated.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center px-4">
            <div className="rounded-full bg-slate-100 p-4 mb-3">
              <Clock className="h-6 w-6 text-slate-400" />
            </div>
            <p className="text-sm font-semibold text-slate-700">No events match your filters</p>
            <button type="button"
              onClick={() => { setQuery(''); setTypeFilter('all'); setStatusFilter('All'); setDeviceFilter(''); setPage(1) }}
              className="mt-2 text-xs text-orange-600 hover:text-orange-700 font-medium underline underline-offset-2">
              Clear filters
            </button>
          </div>
        ) : (
          <div>
            {paginated.map(event => (
              <LogRow
                key={event.id}
                event={event}
                expanded={expandedId === event.id}
                onToggle={() => handleToggle(event.id)}
                relatedEvents={allEvents.filter(e => e.device === event.device && e.id !== event.id)}
                onFilterDevice={handleFilterDevice}
              />
            ))}
          </div>
        )}

        {/* Pagination */}
        {filtered.length > PAGE_SIZE && (
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2.5 bg-slate-50">
            <p className="text-[0.68rem] text-slate-500">
              Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length} events
            </p>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="rounded-lg border border-slate-200 bg-white p-1 text-slate-500 transition hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed">
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => i + 1).map(p => (
                <button key={p} type="button" onClick={() => setPage(p)}
                  className={`rounded-lg border px-2.5 py-1 text-[0.68rem] font-semibold transition ${p === page ? 'bg-orange-600 border-orange-600 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
                  {p}
                </button>
              ))}
              <button type="button" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="rounded-lg border border-slate-200 bg-white p-1 text-slate-500 transition hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed">
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Legend ── */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-900/5 px-5 py-4">
        <p className="text-[0.65rem] font-semibold text-slate-500 uppercase tracking-wide mb-3">Event Type Legend</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {EVENT_TYPES.filter(et => et.id !== 'all').map(et => {
            const cfg  = eventCfg(et.id as Exclude<EventTypeId, 'all'>)
            const Icon = cfg.icon
            return (
              <button
                key={et.id}
                type="button"
                onClick={() => handleTypeFilter(et.id as EventTypeId)}
                className={`flex items-center gap-2 rounded-xl border ${cfg.border} ${cfg.bg} px-3 py-2 transition hover:opacity-80`}
              >
                <Icon className={`h-3.5 w-3.5 ${cfg.text} flex-shrink-0`} />
                <span className={`text-[0.68rem] font-semibold ${cfg.text}`}>{et.label}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
