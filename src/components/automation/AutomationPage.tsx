import { useState, useCallback, useEffect } from 'react'
import {
  Zap, ShieldCheck, Package, Activity, GitBranch,
  ToggleLeft, ToggleRight, Play, Trash2, Plus, Clock,
  CheckCircle2, XCircle, AlertCircle, ChevronDown, ChevronUp,
  Bell, MessageSquare, Ticket, Terminal, BarChart2, X,
  ArrowRight, Layers, Settings, RefreshCw, Filter,
  Sparkles, ScanSearch, FileText, Code2, ExternalLink,
  ListChecks, Cpu,
} from 'lucide-react'
import { useAutomations, useAutomationExecutions } from '../../hooks/useAutomations'
import { api } from '../../api'
import type { AutomationRule, AutomationCategory, AutomationActionType, AutomationTriggerType, AutomationExecution } from '../../api'
import { useToast } from '../ui/ToastProvider'
import { usePagination } from '../../hooks/usePagination'
import { Pagination } from '../ui/Pagination'
import { SortableHeader } from '../ui/SortableHeader'
import { sortRows, toggleSortDirection, type SortDirection } from '../../lib/tableSorting'
import { useCopilotPageContext } from '../../context/CopilotContextProvider'

// ── Types & Constants ─────────────────────────────────────────────────────────

type ViewTab = 'rules' | 'history'

const RULES_PAGE_SIZE   = 12
const HISTORY_PAGE_SIZE = 25

const CATEGORIES: { key: AutomationCategory | 'all'; label: string; icon: React.ElementType; color: string }[] = [
  { key: 'all',        label: 'All',          icon: Layers,      color: 'text-slate-500'   },
  { key: 'compliance', label: 'Compliance',   icon: ShieldCheck, color: 'text-emerald-600' },
  { key: 'security',   label: 'Security',     icon: ShieldCheck, color: 'text-red-600'     },
  { key: 'patching',   label: 'Patching',     icon: Package,     color: 'text-orange-600'  },
  { key: 'reporting',  label: 'Reporting',    icon: BarChart2,   color: 'text-violet-600'  },
  { key: 'drift',      label: 'Drift',        icon: Activity,    color: 'text-amber-600'   },
]

const CATEGORY_BADGE: Record<AutomationCategory, string> = {
  compliance: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  security:   'bg-red-100 text-red-700 border-red-200',
  patching:   'bg-orange-100 text-orange-700 border-orange-200',
  reporting:  'bg-violet-100 text-violet-700 border-violet-200',
  drift:      'bg-amber-100 text-amber-700 border-amber-200',
}

const TRIGGER_LABELS: Record<AutomationTriggerType, string> = {
  device_non_compliant: 'Device Non-Compliant',
  compliance_threshold: 'Compliance Threshold',
  device_offline:       'Device Offline',
  new_enrollment:       'New Enrollment',
  scheduled:            'Scheduled',
  risky_signin:         'Risky Sign-in',
  drift_detected:       'Drift Detected',
  encryption_off:       'Encryption Off',
  script_failure:       'Script Failure',
  enrollment_failed:    'Enrollment Failed',
  sync_failure:         'Sync Failure',
  app_deploy_failed:    'App Deployment Failed',
  cert_expiring:        'Certificate Expiring',
  stale_device:         'Stale / Inactive Device',
  agent_missing:        'Agent Missing',
  agent_stale:          'Agent Stale',
}

const ACTION_ICONS: Record<AutomationActionType, React.ElementType> = {
  slack_notify:      MessageSquare,
  create_jira:       Ticket,
  execute_runbook:   Play,
  execute_script:    Terminal,
  generate_report:   BarChart2,
  send_notification: Bell,
  teams_notify:      MessageSquare,
}

const ACTION_COLORS: Record<AutomationActionType, string> = {
  slack_notify:      'bg-[#4A154B]/10 text-[#4A154B] border-[#4A154B]/20',
  create_jira:       'bg-blue-100 text-blue-700 border-blue-200',
  execute_runbook:   'bg-emerald-100 text-emerald-700 border-emerald-200',
  execute_script:    'bg-slate-100 text-slate-700 border-slate-200',
  generate_report:   'bg-violet-100 text-violet-700 border-violet-200',
  send_notification: 'bg-orange-100 text-orange-700 border-orange-200',
  teams_notify:      'bg-[#0078D4]/10 text-[#0078D4] border-[#0078D4]/20',
}

const QUICK_START_TEMPLATES = [
  {
    title: 'Auto-Remediate Encryption',
    desc: 'Trigger FileVault / BitLocker runbook when encryption is detected as off.',
    category: 'compliance' as AutomationCategory,
    trigger: 'encryption_off' as AutomationTriggerType,
    actions: ['execute_runbook', 'send_notification'] as AutomationActionType[],
    color: 'border-emerald-200 bg-emerald-50',
    accent: 'text-emerald-700',
  },
  {
    title: 'Jira Escalation on Critical',
    desc: 'Create a Jira incident when any device reaches Critical severity non-compliance.',
    category: 'compliance' as AutomationCategory,
    trigger: 'device_non_compliant' as AutomationTriggerType,
    actions: ['create_jira', 'slack_notify'] as AutomationActionType[],
    color: 'border-red-200 bg-red-50',
    accent: 'text-red-700',
  },
  {
    title: 'Weekly Patch Report',
    desc: 'Automatically generate and deliver a patch status report every Friday.',
    category: 'reporting' as AutomationCategory,
    trigger: 'scheduled' as AutomationTriggerType,
    actions: ['generate_report', 'send_notification'] as AutomationActionType[],
    color: 'border-violet-200 bg-violet-50',
    accent: 'text-violet-700',
  },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function relativeTime(iso?: string): string {
  if (!iso) return 'Never'
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 2)  return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

// ── KPI Stats Bar ─────────────────────────────────────────────────────────────

function StatsBar({ stats }: {
  stats: { total: number; active: number; inactive: number; triggersToday: number; successRate: number }
}) {
  const cards = [
    { label: 'Total Rules',    value: stats.total,              sub: 'configured',      accent: '#F46C00', bg: 'bg-orange-50' },
    { label: 'Active',         value: stats.active,             sub: 'running now',     accent: '#10b981', bg: 'bg-emerald-50' },
    { label: 'Inactive',       value: stats.inactive,           sub: 'paused',          accent: '#94a3b8', bg: 'bg-slate-50' },
    { label: 'Triggered Today',value: stats.triggersToday,      sub: 'executions',      accent: '#8b5cf6', bg: 'bg-violet-50' },
    { label: 'Success Rate',   value: `${stats.successRate}%`,  sub: 'all-time',        accent: stats.successRate >= 90 ? '#10b981' : '#f59e0b', bg: stats.successRate >= 90 ? 'bg-emerald-50' : 'bg-amber-50' },
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {cards.map(card => (
        <div key={card.label} className={`rounded-2xl border border-slate-200/80 bg-white shadow-sm overflow-hidden`}>
          <div className="h-[3px]" style={{ background: `linear-gradient(90deg, ${card.accent}88 0%, ${card.accent} 100%)` }} />
          <div className="px-4 py-3">
            <p className="text-[0.62rem] font-bold uppercase tracking-wider text-slate-400">{card.label}</p>
            <p className="mt-1 text-2xl font-black" style={{ color: card.accent }}>{card.value}</p>
            <p className="text-[0.6rem] text-slate-400 mt-0.5">{card.sub}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Pipeline Diagram (visual "Trigger → Conditions → Actions") ────────────────

function PipelineStep({ icon: Icon, label, color }: { icon: React.ElementType; label: string; color: string }) {
  return (
    <div className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${color}`}>
      <Icon className="h-3.5 w-3.5 flex-shrink-0" />
      <span className="text-[0.68rem] font-semibold">{label}</span>
    </div>
  )
}

function WorkflowPipeline() {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm overflow-hidden">
      <div
        className="h-[3px]"
        style={{ background: 'linear-gradient(90deg, #FFC600 0%, #F46C00 50%, #FB471F 100%)' }}
      />
      <div className="px-5 py-4">
        <div className="flex items-center gap-2 mb-3">
          <GitBranch className="h-4 w-4 text-[#F46C00]" />
          <p className="text-xs font-bold text-slate-900">Automation Pipeline</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PipelineStep icon={Clock}        label="Trigger"    color="border-slate-200 bg-slate-50 text-slate-600" />
          <ArrowRight className="h-3.5 w-3.5 text-slate-300 flex-shrink-0" />
          <PipelineStep icon={Filter}       label="Conditions" color="border-blue-200 bg-blue-50 text-blue-700" />
          <ArrowRight className="h-3.5 w-3.5 text-slate-300 flex-shrink-0" />
          <PipelineStep icon={Zap}          label="Actions"    color="border-orange-200 bg-orange-50 text-orange-700" />
          <ArrowRight className="h-3.5 w-3.5 text-slate-300 flex-shrink-0" />
          <PipelineStep icon={CheckCircle2} label="Log"        color="border-emerald-200 bg-emerald-50 text-emerald-700" />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 text-[0.65rem]">
          <div>
            <p className="font-semibold text-slate-500 uppercase tracking-wide text-[0.55rem] mb-1.5">Trigger types</p>
            <div className="space-y-0.5 text-slate-600">
              {['Device Non-Compliant', 'Encryption Off', 'Device Offline', 'Drift Detected', 'Scheduled (cron)', 'Script Failure'].map(t => (
                <p key={t} className="flex items-center gap-1.5"><span className="h-1 w-1 rounded-full bg-slate-400" />{t}</p>
              ))}
            </div>
          </div>
          <div>
            <p className="font-semibold text-slate-500 uppercase tracking-wide text-[0.55rem] mb-1.5">Action types</p>
            <div className="space-y-0.5 text-slate-600">
              {['Send in-app notification', 'Send Slack message', 'Create Jira ticket', 'Trigger runbook', 'Run remote script', 'Generate report'].map(a => (
                <p key={a} className="flex items-center gap-1.5"><span className="h-1 w-1 rounded-full bg-[#F46C00]" />{a}</p>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Quick-Start Templates ─────────────────────────────────────────────────────

function QuickStartTemplates({ onUseTemplate }: {
  onUseTemplate: (tpl: typeof QUICK_START_TEMPLATES[0]) => void
}) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm overflow-hidden">
      <div
        className="h-[3px]"
        style={{ background: 'linear-gradient(90deg, #FFC600 0%, #F46C00 50%, #FB471F 100%)' }}
      />
      <div className="px-5 py-4">
        <p className="text-xs font-bold text-slate-900 mb-1">Quick-Start Templates</p>
        <p className="text-[0.65rem] text-slate-400 mb-3">Common enterprise automation patterns — click to pre-fill the rule form.</p>
        <div className="space-y-2">
          {QUICK_START_TEMPLATES.map(tpl => (
            <button
              key={tpl.title}
              type="button"
              onClick={() => onUseTemplate(tpl)}
              className={`w-full text-left rounded-xl border px-3.5 py-2.5 transition hover:shadow-sm ${tpl.color}`}
            >
              <p className={`text-[0.72rem] font-bold ${tpl.accent}`}>{tpl.title}</p>
              <p className="text-[0.62rem] text-slate-500 mt-0.5 leading-snug">{tpl.desc}</p>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {tpl.actions.map(a => {
                  const Icon = ACTION_ICONS[a]
                  return (
                    <span key={a} className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[0.55rem] font-semibold ${ACTION_COLORS[a]}`}>
                      <Icon className="h-2.5 w-2.5" />{a.replace('_', ' ')}
                    </span>
                  )
                })}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Rule Card ─────────────────────────────────────────────────────────────────

function RuleCard({ rule, onToggle, onDelete, onTest, toggling, testing, deleting }: {
  rule: AutomationRule
  onToggle: () => void
  onDelete: () => void
  onTest: () => void
  toggling: boolean
  testing: boolean
  deleting: boolean
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className={`rounded-2xl border bg-white shadow-sm shadow-slate-900/5 transition-all overflow-hidden ${
      rule.enabled ? 'border-slate-200' : 'border-slate-200 opacity-60'
    }`}>
      {/* Status stripe */}
      <div className={`h-[3px] ${rule.enabled ? '' : 'bg-slate-200'}`}
        style={rule.enabled ? { background: 'linear-gradient(90deg, #F46C00 0%, #FB471F 100%)' } : undefined}
      />

      <div className="px-5 py-4">
        <div className="flex items-start gap-3">
          {/* Status dot */}
          <div className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${rule.enabled ? 'bg-emerald-400' : 'bg-slate-300'}`} />

          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <p className="text-sm font-bold text-slate-900 leading-snug">{rule.name}</p>
              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[0.6rem] font-bold capitalize ${CATEGORY_BADGE[rule.category]}`}>
                {rule.category}
              </span>
            </div>
            <p className="text-[0.72rem] text-slate-500 leading-relaxed">{rule.description}</p>

            {/* Trigger + conditions chips */}
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 border border-slate-200 px-2.5 py-1 text-[0.62rem] font-semibold text-slate-600">
                <Clock className="h-2.5 w-2.5 text-slate-400" />
                {TRIGGER_LABELS[rule.trigger.type]}
              </span>
              {rule.conditions.platform !== 'all' && (
                <span className="inline-flex items-center rounded-full bg-blue-50 border border-blue-100 px-2.5 py-1 text-[0.62rem] text-blue-700">
                  {rule.conditions.platform}
                </span>
              )}
              {rule.conditions.severity !== 'all' && (
                <span className="inline-flex items-center rounded-full bg-red-50 border border-red-100 px-2.5 py-1 text-[0.62rem] text-red-700">
                  {rule.conditions.severity} severity
                </span>
              )}
              {rule.conditions.source !== 'all' && (
                <span className="inline-flex items-center rounded-full bg-slate-50 border border-slate-200 px-2.5 py-1 text-[0.62rem] text-slate-600 capitalize">
                  {rule.conditions.source}
                </span>
              )}
            </div>

            {/* Action chips */}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {rule.actions.map((action, i) => {
                const Icon = ACTION_ICONS[action.type]
                return (
                  <span key={i} className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[0.6rem] font-bold ${ACTION_COLORS[action.type]}`}>
                    <Icon className="h-2.5 w-2.5" />
                    {action.label}
                  </span>
                )
              })}
            </div>
          </div>

          {/* Enable toggle */}
          <button
            type="button"
            onClick={onToggle}
            disabled={toggling}
            title={rule.enabled ? 'Disable rule' : 'Enable rule'}
            className="flex-shrink-0 focus-visible:ring-2 focus-visible:ring-[#F46C00]/40 rounded-xl transition"
          >
            {rule.enabled
              ? <ToggleRight className="h-8 w-8 text-emerald-500" />
              : <ToggleLeft  className="h-8 w-8 text-slate-300" />
            }
          </button>
        </div>

        {/* Footer */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-4 text-[0.62rem] text-slate-400">
            <span>Last triggered: <strong className="text-slate-600">{relativeTime(rule.lastTriggered)}</strong></span>
            <span>Total runs: <strong className="text-slate-600">{rule.triggerCount}</strong></span>
            <span>By: <strong className="text-slate-600">{rule.createdBy}</strong></span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setExpanded(e => !e)}
              className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[0.62rem] font-semibold text-slate-600 hover:bg-slate-100 transition flex items-center gap-1"
            >
              {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {expanded ? 'Less' : 'Details'}
            </button>
            <button
              type="button"
              onClick={onTest}
              disabled={testing || !rule.enabled}
              className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[0.62rem] font-bold text-emerald-700 hover:bg-emerald-100 transition disabled:opacity-40 flex items-center gap-1"
            >
              <Play className="h-2.5 w-2.5" />
              {testing ? 'Testing…' : 'Test Run'}
            </button>
            <button
              type="button"
              onClick={onDelete}
              disabled={deleting}
              className="rounded-full border border-red-200 bg-red-50 px-2 py-1.5 text-red-500 hover:bg-red-100 transition disabled:opacity-40"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-slate-100 px-5 py-4 bg-slate-50/60">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-[0.72rem]">
            <div>
              <p className="text-[0.58rem] font-black uppercase tracking-widest text-slate-400 mb-2">Trigger Config</p>
              <div className="space-y-1">
                <div className="flex gap-2"><span className="text-slate-400 w-28">Type:</span><span className="font-medium text-slate-700">{TRIGGER_LABELS[rule.trigger.type]}</span></div>
                {Object.entries(rule.trigger.config).map(([k, v]) => (
                  <div key={k} className="flex gap-2">
                    <span className="text-slate-400 w-28 capitalize">{k.replace(/([A-Z])/g, ' $1')}:</span>
                    <span className="font-medium text-slate-700">{String(v)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[0.58rem] font-black uppercase tracking-widest text-slate-400 mb-2">Conditions</p>
              <div className="space-y-1">
                {Object.entries(rule.conditions).map(([k, v]) => (
                  <div key={k} className="flex gap-2">
                    <span className="text-slate-400 w-28 capitalize">{k.replace(/([A-Z])/g, ' $1')}:</span>
                    <span className="font-medium text-slate-700 capitalize">{String(v)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-4">
            <p className="text-[0.58rem] font-black uppercase tracking-widest text-slate-400 mb-2">Actions ({rule.actions.length})</p>
            <div className="space-y-1.5">
              {rule.actions.map((action, i) => {
                const Icon = ACTION_ICONS[action.type]
                return (
                  <div key={i} className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-[0.68rem] ${ACTION_COLORS[action.type]}`}>
                    <Icon className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="font-bold">{action.label}</p>
                      {Object.entries(action.config).length > 0 && (
                        <p className="mt-0.5 opacity-70">{Object.entries(action.config).map(([k, v]) => `${k}: ${v}`).join(' · ')}</p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
          <p className="mt-3 text-[0.6rem] text-slate-400">Created {new Date(rule.createdAt).toLocaleDateString()} by {rule.createdBy} · ID: {rule.id}</p>
        </div>
      )}
    </div>
  )
}

// ── Execution History Tab ─────────────────────────────────────────────────────

function ExecutionHistoryTab({ onRefresh }: { onRefresh?: () => void }) {
  const { executions, loading } = useAutomationExecutions(undefined, 50)
  const [statusFilter, setStatusFilter] = useState<'all' | 'success' | 'failed' | 'partial'>('all')
  const [selectedExec, setSelectedExec] = useState<AutomationExecution | null>(null)
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')

  // Page-context awareness for the Endpoint Operations Copilot — set the
  // specific run id when one is open in the detail drawer.
  const setCopilotPageContext = useCopilotPageContext()
  useEffect(() => {
    setCopilotPageContext({ page: 'Automation', ...(selectedExec ? { automationRunId: selectedExec.id } : {}) })
    return () => setCopilotPageContext({ page: 'Automation' })
  }, [selectedExec, setCopilotPageContext])

  const filtered = statusFilter === 'all' ? executions : executions.filter(e => e.status === statusFilter)
  const sortedExecutions = sortKey ? sortRows(filtered, execution => {
    switch (sortKey) {
      case 'ruleName': return execution.ruleName
      case 'status': return execution.status
      case 'started': return Date.parse(execution.triggeredAt) || execution.triggeredAt
      case 'result': return execution.triggerReason
      case 'duration': return execution.durationMs
      default: return ''
    }
  }, sortDirection) : filtered
  const { page, setPage, totalPages, paginated } = usePagination(sortedExecutions, HISTORY_PAGE_SIZE)
  const handleSort = (key: string) => {
    setSortDirection(direction => toggleSortDirection(sortKey, direction, key))
    setSortKey(key)
  }

  const hasDetail = (exec: AutomationExecution) =>
    exec.actionsExecuted.some(a => a.detail && Object.keys(a.detail).length > 0)

  const statusIcon = (s: string) => {
    if (s === 'success') return <CheckCircle2 className="h-4 w-4 text-emerald-500" />
    if (s === 'failed')  return <XCircle      className="h-4 w-4 text-red-400"     />
    return                      <AlertCircle  className="h-4 w-4 text-amber-400"   />
  }

  return (
    <div className="space-y-4">
      {/* Filter strip */}
      <div className="flex items-center gap-2 flex-wrap">
        {(['all', 'success', 'partial', 'failed'] as const).map(s => (
          <button
            key={s}
            type="button"
            onClick={() => setStatusFilter(s)}
            className={`rounded-full border px-3 py-1 text-[0.68rem] font-semibold transition capitalize ${
              statusFilter === s
                ? 'is-selected'
                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
            }`}
          >
            {s}
          </button>
        ))}
        <span className="ml-auto text-[0.65rem] text-slate-400">{filtered.length} records</span>
        {onRefresh && (
          <button type="button" onClick={onRefresh} className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[0.65rem] text-slate-500 hover:bg-slate-50 transition flex items-center gap-1">
            <RefreshCw className="h-3 w-3" />Refresh
          </button>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm overflow-hidden">
        <div className="h-[3px]" style={{ background: 'linear-gradient(90deg, #FFC600 0%, #F46C00 50%, #FB471F 100%)' }} />
        {loading ? (
          <div className="px-5 py-10 text-center text-xs text-slate-400">Loading execution history…</div>
        ) : filtered.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <Activity className="mx-auto h-8 w-8 text-slate-200 mb-3" />
            <p className="text-xs font-semibold text-slate-500">No executions recorded yet</p>
            <p className="text-[0.65rem] text-slate-400 mt-1">Use "Test Run" on a rule or click "Scan Now" to trigger real executions.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  <tr>
                    <SortableHeader label="Rule Name" sortKey="ruleName" activeSortKey={sortKey} direction={sortDirection} onSort={handleSort} className="px-4 py-3 text-left" />
                    <SortableHeader label="Status" sortKey="status" activeSortKey={sortKey} direction={sortDirection} onSort={handleSort} className="px-4 py-3 text-left" />
                    <SortableHeader label="Started" sortKey="started" activeSortKey={sortKey} direction={sortDirection} onSort={handleSort} className="px-4 py-3 text-left" />
                    <SortableHeader label="Result" sortKey="result" activeSortKey={sortKey} direction={sortDirection} onSort={handleSort} className="px-4 py-3 text-left" />
                    <SortableHeader label="Duration" sortKey="duration" activeSortKey={sortKey} direction={sortDirection} onSort={handleSort} className="px-4 py-3 text-right" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginated.map(exec => (
                    <tr
                      key={exec.id}
                      onClick={() => setSelectedExec(exec)}
                      className="hover:bg-slate-50 transition cursor-pointer"
                    >
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-xs font-bold text-slate-900">{exec.ruleName}</span>
                          <span className={`inline-flex rounded-full border px-1.5 py-0.5 text-[0.55rem] font-bold uppercase ${CATEGORY_BADGE[exec.category]}`}>
                            {exec.category}
                          </span>
                        </div>
                        {exec.deviceName && (
                          <p className="mt-1 text-[0.6rem] font-mono text-slate-400 bg-slate-100 rounded px-1.5 py-0.5 inline-block">{exec.deviceName}</p>
                        )}
                        {exec.matchedDeviceCount !== undefined && (
                          <span className="mt-1 ml-1.5 text-[0.58rem] text-violet-600 bg-violet-50 border border-violet-200 rounded-full px-1.5 py-0.5 inline-flex items-center gap-1">
                            <Cpu className="h-2 w-2" />{exec.matchedDeviceCount} matched
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 capitalize">
                          {statusIcon(exec.status)}{exec.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{relativeTime(exec.triggeredAt)}</td>
                      <td className="px-4 py-3 max-w-sm">
                        <p className="text-xs text-slate-600 truncate" title={exec.triggerReason}>{exec.triggerReason}</p>
                        {hasDetail(exec) && (
                          <span className="text-[0.58rem] text-violet-600 font-bold">View detail →</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 text-right whitespace-nowrap">{exec.durationMs}ms</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage}
              totalItems={filtered.length} pageSize={HISTORY_PAGE_SIZE} itemLabel="execution" />
          </>
        )}
      </div>

      {selectedExec && (
        <ExecutionDetailDrawer exec={selectedExec} onClose={() => setSelectedExec(null)} />
      )}
    </div>
  )
}

// ── Execution Detail Drawer ───────────────────────────────────────────────────

function ExecutionDetailDrawer({ exec, onClose }: { exec: AutomationExecution; onClose: () => void }) {
  const [activeAction, setActiveAction] = useState(0)
  const action = exec.actionsExecuted[activeAction]

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 px-4 py-8">
      <div className="w-full max-w-2xl max-h-[80vh] rounded-3xl bg-white shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 flex items-start justify-between gap-3 border-b border-slate-100 bg-slate-50/60 flex-shrink-0">
          <div className="flex items-start gap-3 min-w-0">
            <div className={`mt-0.5 h-2.5 w-2.5 flex-shrink-0 rounded-full ${exec.status === 'success' ? 'bg-emerald-400' : exec.status === 'failed' ? 'bg-red-400' : 'bg-amber-400'}`} />
            <div className="min-w-0">
              <p className="text-sm font-black text-slate-900 truncate">{exec.ruleName}</p>
              <p className="text-[0.65rem] text-slate-500 mt-0.5">{exec.triggerReason}</p>
              {exec.deviceName && (
                <span className="inline-block mt-1 font-mono text-[0.6rem] bg-slate-100 text-slate-600 rounded px-1.5 py-0.5">{exec.deviceName}</span>
              )}
              {exec.matchedDeviceCount !== undefined && (
                <span className="inline-flex items-center gap-1 ml-1.5 text-[0.6rem] text-violet-700 bg-violet-50 border border-violet-200 rounded-full px-2 py-0.5">
                  <Cpu className="h-2.5 w-2.5" />{exec.matchedDeviceCount} device{exec.matchedDeviceCount !== 1 ? 's' : ''} matched
                </span>
              )}
            </div>
          </div>
          <button type="button" onClick={onClose} className="flex-shrink-0 rounded-full p-1.5 hover:bg-slate-200 transition">
            <X className="h-4 w-4 text-slate-500" />
          </button>
        </div>

        {/* Action tabs */}
        {exec.actionsExecuted.length > 1 && (
          <div className="flex gap-1 px-5 pt-3 pb-1 flex-shrink-0">
            {exec.actionsExecuted.map((a, i) => {
              const Icon = ACTION_ICONS[a.type]
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => setActiveAction(i)}
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[0.65rem] font-bold transition ${
                    activeAction === i ? ACTION_COLORS[a.type] + ' ring-1 ring-inset ring-current' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
                  }`}
                >
                  <Icon className="h-3 w-3" />{a.label}
                </button>
              )
            })}
          </div>
        )}

        {/* Action content */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-3">
          {action && (
            <>
              {/* Result line */}
              <div className={`flex items-start gap-2 rounded-xl border px-3.5 py-2.5 text-xs ${
                action.status === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'
              }`}>
                {action.status === 'success'
                  ? <CheckCircle2 className="h-4 w-4 flex-shrink-0 mt-0.5 text-emerald-500" />
                  : <XCircle className="h-4 w-4 flex-shrink-0 mt-0.5 text-red-500" />
                }
                <p className="font-medium leading-relaxed">{action.result}</p>
              </div>

              {/* AI Runbook Steps */}
              {action.detail?.runbookSteps && action.detail.runbookSteps.length > 0 && (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-2.5 border-b border-emerald-100 bg-emerald-50">
                    <ListChecks className="h-3.5 w-3.5 text-emerald-600" />
                    <p className="text-[0.68rem] font-bold text-emerald-800">AI-Generated Runbook</p>
                    <span className="ml-auto text-[0.55rem] text-emerald-600 bg-emerald-100 rounded-full px-2 py-0.5">{action.detail.runbookSteps.length} steps</span>
                  </div>
                  <ol className="px-4 py-3 space-y-2">
                    {action.detail.runbookSteps.map((step, i) => (
                      <li key={i} className="flex gap-3 text-[0.7rem] text-slate-700">
                        <span className="flex-shrink-0 h-5 w-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-[0.6rem] font-black">{i + 1}</span>
                        <span className="leading-relaxed pt-0.5">{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {/* Script */}
              {action.detail?.script && (
                <div className="rounded-2xl border border-slate-200 overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-100 bg-slate-50">
                    <Code2 className="h-3.5 w-3.5 text-slate-600" />
                    <p className="text-[0.68rem] font-bold text-slate-700">AI-Generated Remediation Script</p>
                    <button
                      type="button"
                      onClick={() => navigator.clipboard.writeText(action.detail!.script!)}
                      className="ml-auto text-[0.58rem] font-bold text-slate-500 hover:text-slate-700 border border-slate-200 rounded px-2 py-0.5 bg-white transition"
                    >
                      Copy
                    </button>
                  </div>
                  <pre className="px-4 py-3 text-[0.62rem] font-mono text-slate-700 bg-slate-900 text-emerald-300 overflow-x-auto leading-relaxed whitespace-pre-wrap max-h-48">
                    {action.detail.script}
                  </pre>
                </div>
              )}

              {/* Jira ticket */}
              {action.detail?.jiraKey && (
                <div className="flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
                  <Ticket className="h-4 w-4 text-blue-600 flex-shrink-0" />
                  <div>
                    <p className="text-xs font-bold text-blue-800">Jira ticket created: {action.detail.jiraKey}</p>
                    {action.detail.jiraUrl && (
                      <a href={action.detail.jiraUrl} target="_blank" rel="noopener noreferrer"
                        className="text-[0.65rem] text-blue-600 hover:underline flex items-center gap-1 mt-0.5">
                        Open in Jira <ExternalLink className="h-2.5 w-2.5" />
                      </a>
                    )}
                  </div>
                </div>
              )}

              {/* Slack message */}
              {action.detail?.slackChannel && (
                <div className="flex items-center gap-3 rounded-xl border border-[#4A154B]/20 bg-[#4A154B]/5 px-4 py-3">
                  <MessageSquare className="h-4 w-4 text-[#4A154B] flex-shrink-0" />
                  <div>
                    <p className="text-xs font-bold text-[#4A154B]">Slack message delivered</p>
                    <p className="text-[0.65rem] text-slate-600 mt-0.5">Channel: {action.detail.slackChannel}{action.detail.slackTs ? ` · ts: ${action.detail.slackTs}` : ''}</p>
                  </div>
                </div>
              )}

              {/* Fleet report */}
              {action.detail?.reportSummary && (
                <div className="rounded-2xl border border-violet-200 bg-violet-50/40 overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-2.5 border-b border-violet-100 bg-violet-50">
                    <FileText className="h-3.5 w-3.5 text-violet-600" />
                    <p className="text-[0.68rem] font-bold text-violet-800">AI Fleet Report</p>
                  </div>
                  <div className="px-4 py-3">
                    <p className="text-[0.72rem] text-slate-700 leading-relaxed">{action.detail.reportSummary}</p>
                    {action.detail.reportMarkdown && (
                      <details className="mt-2">
                        <summary className="text-[0.62rem] font-bold text-violet-600 cursor-pointer hover:text-violet-800">Full report</summary>
                        <pre className="mt-2 text-[0.6rem] text-slate-600 font-mono whitespace-pre-wrap leading-relaxed overflow-x-auto max-h-40 bg-white border border-slate-200 rounded-xl p-3">
                          {action.detail.reportMarkdown}
                        </pre>
                      </details>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="border-t border-slate-100 px-5 py-3 flex justify-between items-center bg-slate-50/60 flex-shrink-0">
          <p className="text-[0.6rem] text-slate-400">{exec.durationMs}ms · {new Date(exec.triggeredAt).toLocaleString()}</p>
          <button type="button" onClick={onClose}
            className="rounded-full border border-slate-200 px-4 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition">
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

// ── AI Build Panel ────────────────────────────────────────────────────────────

function AiBuildPanel({ onBuilt, onClose }: {
  onBuilt: (rule: import('../../api').AiBuiltRule) => void
  onClose: () => void
}) {
  const { notify } = useToast()
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)

  const EXAMPLES = [
    'Alert me on Slack when any Mac has FileVault off and create a Jira ticket',
    'Run a remediation script on non-compliant Windows devices with High severity',
    'Send a notification when any ManageEngine device has been offline for 3 days',
    'Generate a weekly fleet compliance report every Friday',
  ]

  const handleBuild = async () => {
    if (!prompt.trim() || prompt.length < 5) { notify('error', 'Validation', 'Describe the rule in at least 5 characters'); return }
    setLoading(true)
    try {
      const rule = await api.aiBuildAutomationRule(prompt)
      notify('success', 'AI Rule Built', `"${rule.name}" — review and save it`)
      onBuilt(rule)
    } catch (e) {
      notify('error', 'AI Build Failed', e instanceof Error ? e.message : 'Could not build rule')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 to-white shadow-sm overflow-hidden">
      <div className="h-[3px]" style={{ background: 'linear-gradient(90deg, #7c3aed 0%, #a855f7 50%, #F46C00 100%)' }} />
      <div className="px-5 py-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-violet-100 flex items-center justify-center">
              <Sparkles className="h-3.5 w-3.5 text-violet-600" />
            </div>
            <div>
              <p className="text-xs font-black text-slate-900">AI Rule Builder</p>
              <p className="text-[0.6rem] text-slate-400">Describe what you want in plain English</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-1 hover:bg-violet-100 transition">
            <X className="h-3.5 w-3.5 text-slate-400" />
          </button>
        </div>

        <textarea
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          rows={3}
          placeholder="e.g. Alert me on Slack when any Mac device has FileVault off and open a Jira incident..."
          className="w-full rounded-xl border border-violet-200 px-3 py-2.5 text-xs text-slate-900 outline-none resize-none bg-white placeholder:text-slate-400 focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition"
        />

        <div className="mt-2 flex flex-wrap gap-1.5">
          {EXAMPLES.map(ex => (
            <button key={ex} type="button" onClick={() => setPrompt(ex)}
              className="rounded-full border border-violet-200 bg-white px-2.5 py-1 text-[0.6rem] text-violet-700 hover:bg-violet-50 transition truncate max-w-[240px]">
              {ex}
            </button>
          ))}
        </div>

        <div className="mt-3 flex justify-end gap-2">
          <button type="button" onClick={onClose}
            className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleBuild}
            disabled={loading || prompt.trim().length < 5}
            className="inline-flex items-center gap-1.5 rounded-full px-5 py-2 text-xs font-bold text-white transition disabled:opacity-50"
            style={{ background: 'linear-gradient(90deg, #7c3aed 0%, #a855f7 100%)' }}
          >
            <Sparkles className="h-3.5 w-3.5" />
            {loading ? 'Building…' : 'Build Rule with AI'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Create Rule Modal ─────────────────────────────────────────────────────────

const TRIGGER_OPTIONS: { value: AutomationTriggerType; label: string }[] = [
  { value: 'device_non_compliant',  label: 'Device becomes Non-Compliant' },
  { value: 'encryption_off',        label: 'Device encryption turns Off' },
  { value: 'compliance_threshold',  label: 'Fleet compliance drops below threshold' },
  { value: 'device_offline',        label: 'Device goes offline for N days' },
  { value: 'new_enrollment',        label: 'New device enrolled' },
  { value: 'drift_detected',        label: 'Compliance drift detected' },
  { value: 'risky_signin',          label: 'Risky sign-in detected (Entra)' },
  { value: 'scheduled',             label: 'Scheduled (recurring)' },
  { value: 'script_failure',        label: 'Script execution fails' },
  { value: 'enrollment_failed',     label: 'Enrollment failure detected' },
  { value: 'sync_failure',          label: 'Device sync failure (6h+ no check-in)' },
  { value: 'app_deploy_failed',     label: 'App deployment fails' },
  { value: 'cert_expiring',         label: 'Certificate expiring soon' },
  { value: 'stale_device',          label: 'Stale / inactive device detected' },
  { value: 'agent_missing',         label: 'Intune device missing Endpoint Central agent (or the reverse)' },
  { value: 'agent_stale',           label: 'One management agent silent while the other still reports' },
]

const ACTION_OPTIONS: { value: AutomationActionType; label: string }[] = [
  { value: 'send_notification', label: 'Send in-app notification' },
  { value: 'slack_notify',      label: 'Send Slack message'       },
  { value: 'teams_notify',      label: 'Send Teams notification'  },
  { value: 'create_jira',       label: 'Create Jira ticket'       },
  { value: 'execute_runbook',   label: 'Trigger remediation runbook' },
  { value: 'execute_script',    label: 'Run remote script'        },
  { value: 'generate_report',   label: 'Generate report'          },
]

interface CreateRuleForm {
  name: string
  description: string
  category: AutomationCategory
  enabled: boolean
  triggerType: AutomationTriggerType
  platform: 'Windows' | 'macOS' | 'Linux' | 'all'
  source: 'intune' | 'manageengine' | 'all'
  severity: 'Low' | 'Medium' | 'High' | 'Critical' | 'all'
  complianceState: 'Non-Compliant' | 'Warning' | 'all'
  actions: AutomationActionType[]
  scheduleCron: string
  slackChannel: string
  _aiReasoning?: string
}

function CreateRuleModal({ onClose, onCreated, prefill }: {
  onClose: () => void
  onCreated: () => void
  prefill?: Partial<CreateRuleForm>
}) {
  const { notify } = useToast()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<CreateRuleForm>({
    name: '',
    description: '',
    category: 'compliance',
    enabled: true,
    triggerType: 'device_non_compliant',
    platform: 'all',
    source: 'all',
    severity: 'all',
    complianceState: 'all',
    actions: ['send_notification'],
    scheduleCron: '0 8 * * 1-5',
    slackChannel: '',
    ...prefill,
  })

  const toggleAction = (type: AutomationActionType) => {
    setForm(f => ({
      ...f,
      actions: f.actions.includes(type) ? f.actions.filter(a => a !== type) : [...f.actions, type],
    }))
  }

  const handleSave = async () => {
    if (!form.name.trim())        { notify('error', 'Validation', 'Rule name is required'); return }
    if (!form.description.trim()) { notify('error', 'Validation', 'Description is required'); return }
    if (form.actions.length === 0) { notify('error', 'Validation', 'At least one action is required'); return }
    setSaving(true)
    try {
      await api.createAutomationRule({
        name:        form.name,
        description: form.description,
        category:    form.category,
        enabled:     form.enabled,
        trigger:     { type: form.triggerType, config: form.triggerType === 'scheduled' ? { scheduleCron: form.scheduleCron } : {} },
        conditions:  { platform: form.platform, source: form.source, severity: form.severity, complianceState: form.complianceState },
        actions:     form.actions.map(type => ({
          type,
          label: ACTION_OPTIONS.find(a => a.value === type)?.label ?? type,
          config: (type === 'slack_notify' && form.slackChannel.trim() ? { channel: form.slackChannel.trim() } : {}) as Record<string, string>,
        })),
        createdBy: 'Global Admin',
      })
      notify('success', 'Rule Created', `"${form.name}" is now active`)
      onCreated()
      onClose()
    } catch (e) {
      notify('error', 'Error', e instanceof Error ? e.message : 'Failed to create rule')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-xl rounded-3xl bg-white shadow-2xl overflow-hidden">
        {/* Modal header */}
        <div
          className="px-6 py-4 text-white"
          style={{ background: 'linear-gradient(135deg, #141408 0%, #1e1d10 100%)' }}
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Zap className="h-4 w-4" style={{ color: '#F46C00' }} />
                <p className="text-sm font-black text-white">New Automation Rule</p>
              </div>
              <p className="text-[0.65rem] text-slate-400">Trigger → Conditions → Actions workflow</p>
            </div>
            <button type="button" onClick={onClose} className="rounded-full p-1.5 hover:bg-white/10 transition">
              <X className="h-4 w-4 text-slate-400" />
            </button>
          </div>

          {form.triggerType === 'scheduled' && (
            <div className="rounded-xl border border-orange-200 bg-orange-50/60 p-3">
              <label className="block text-[0.65rem] font-bold text-orange-800 mb-1">Run schedule</label>
              <input value={form.scheduleCron} onChange={e => setForm(f => ({ ...f, scheduleCron: e.target.value }))} placeholder="0 8 * * 1-5" className="w-full rounded-lg border border-orange-200 bg-white px-3 py-2 font-mono text-xs text-slate-900 outline-none" />
              <p className="mt-1 text-[0.58rem] text-orange-700">5-field cron in server time. Example: <code>0 8 * * 1-5</code> sends weekdays at 8:00.</p>
            </div>
          )}
          <div className="mt-3 h-[2px] w-12 rounded-full" style={{ background: 'linear-gradient(90deg, #FFC600, #F46C00)' }} />
        </div>

        <div className="overflow-y-auto max-h-[65vh] px-6 py-5 space-y-4">
          {/* AI reasoning banner */}
          {form._aiReasoning && (
            <div className="flex items-start gap-2.5 rounded-xl border border-violet-200 bg-violet-50 px-3.5 py-2.5">
              <Sparkles className="h-3.5 w-3.5 text-violet-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-[0.62rem] font-bold text-violet-700 mb-0.5">AI-generated rule</p>
                <p className="text-[0.62rem] text-violet-600 leading-relaxed">{form._aiReasoning}</p>
              </div>
            </div>
          )}

          {/* Name + Category */}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-[0.65rem] font-bold text-slate-600 mb-1">Rule Name *</label>
              <input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Auto-remediate encryption off"
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs text-slate-900 outline-none transition"
                onFocus={e => { e.currentTarget.style.borderColor = '#F46C00'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(244,108,0,0.12)' }}
                onBlur={e => { e.currentTarget.style.borderColor = ''; e.currentTarget.style.boxShadow = '' }}
              />
            </div>
            <div className="col-span-2">
              <label className="block text-[0.65rem] font-bold text-slate-600 mb-1">Description *</label>
              <textarea
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                rows={2}
                placeholder="What does this rule do and why?"
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs text-slate-900 outline-none resize-none"
                onFocus={e => { e.currentTarget.style.borderColor = '#F46C00'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(244,108,0,0.12)' }}
                onBlur={e => { e.currentTarget.style.borderColor = ''; e.currentTarget.style.boxShadow = '' }}
              />
            </div>
            <div>
              <label className="block text-[0.65rem] font-bold text-slate-600 mb-1">Category</label>
              <select
                value={form.category}
                onChange={e => setForm(f => ({ ...f, category: e.target.value as AutomationCategory }))}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs text-slate-900 outline-none"
              >
                {CATEGORIES.filter(c => c.key !== 'all').map(c => (
                  <option key={c.key} value={c.key}>{c.label}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end pb-0.5">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.enabled}
                  onChange={e => setForm(f => ({ ...f, enabled: e.target.checked }))}
                  className="h-4 w-4 rounded border-slate-300"
                  style={{ accentColor: '#F46C00' }}
                />
                <span className="text-xs font-semibold text-slate-700">Enable immediately</span>
              </label>
            </div>
          </div>

          {/* Trigger */}
          <div>
            <label className="block text-[0.65rem] font-bold text-slate-600 mb-1">
              <Clock className="inline h-3 w-3 mr-1 text-slate-400" />Trigger
            </label>
            <select
              value={form.triggerType}
              onChange={e => setForm(f => ({ ...f, triggerType: e.target.value as AutomationTriggerType }))}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs text-slate-900 outline-none"
            >
              {TRIGGER_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>

          {form.actions.includes('slack_notify') && (
            <div className="rounded-xl border border-[#4A154B]/20 bg-[#4A154B]/[0.03] p-3">
              <label className="block text-[0.65rem] font-bold text-[#4A154B] mb-1">Slack channel ID</label>
              <input value={form.slackChannel} onChange={e => setForm(f => ({ ...f, slackChannel: e.target.value }))} placeholder="C08S9K7G2AH" className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-900 outline-none" />
              <p className="mt-1 text-[0.58rem] text-slate-500">Optional for event rules; required for a precise scheduled Slack destination.</p>
            </div>
          )}

          {/* Conditions */}
          <div>
            <label className="block text-[0.65rem] font-bold text-slate-600 mb-1.5">
              <Filter className="inline h-3 w-3 mr-1 text-slate-400" />Conditions <span className="text-slate-400 font-normal">(optional filters)</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Platform',   key: 'platform',        options: ['all', 'Windows', 'macOS', 'Linux'] },
                { label: 'Source',     key: 'source',          options: ['all', 'intune', 'manageengine'] },
                { label: 'Severity',   key: 'severity',        options: ['all', 'Low', 'Medium', 'High', 'Critical'] },
                { label: 'State',      key: 'complianceState', options: ['all', 'Non-Compliant', 'Warning'] },
              ].map(field => (
                <div key={field.key}>
                  <label className="block text-[0.58rem] text-slate-400 mb-0.5">{field.label}</label>
                  <select
                    value={(form as unknown as Record<string, string>)[field.key]}
                    onChange={e => setForm(f => ({ ...f, [field.key]: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-2.5 py-2 text-[0.68rem] text-slate-900 outline-none capitalize"
                  >
                    {field.options.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div>
            <label className="block text-[0.65rem] font-bold text-slate-600 mb-1.5">
              <Zap className="inline h-3 w-3 mr-1 text-[#F46C00]" />Actions <span className="text-slate-400 font-normal">(select one or more)</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {ACTION_OPTIONS.map(action => {
                const Icon     = ACTION_ICONS[action.value]
                const selected = form.actions.includes(action.value)
                return (
                  <button
                    key={action.value}
                    type="button"
                    onClick={() => toggleAction(action.value)}
                    className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-[0.68rem] transition ${
                      selected
                        ? 'is-selected font-bold'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5 flex-shrink-0" />
                    <span className="leading-tight">{action.label}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* Modal footer */}
        <div className="border-t border-slate-100 px-6 py-4 flex justify-end gap-2 bg-slate-50/60">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-full px-5 py-2 text-xs font-bold text-white transition disabled:opacity-50"
            style={{ background: 'linear-gradient(90deg, #F46C00 0%, #FB471F 100%)' }}
          >
            {saving ? 'Creating…' : 'Create Rule'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function AutomationPage() {
  const { notify }                        = useToast()
  const [activeTab, setActiveTab]         = useState<ViewTab>('rules')
  const [activeCategory, setActiveCategory] = useState<AutomationCategory | 'all'>('all')
  const [showCreate, setShowCreate]       = useState(false)
  const [createPrefill, setCreatePrefill] = useState<Partial<CreateRuleForm> | undefined>()
  const [togglingId, setTogglingId]       = useState<string | null>(null)
  const [testingId, setTestingId]         = useState<string | null>(null)
  const [deletingId, setDeletingId]       = useState<string | null>(null)
  const [showAiBuild, setShowAiBuild]     = useState(false)
  const [scanning, setScanning]           = useState(false)

  const { rules, stats, loading, error, refresh, toggle, remove, test } = useAutomations(
    activeCategory === 'all' ? undefined : activeCategory
  )
  const { page: rulesPage, setPage: setRulesPage, totalPages: rulesTotalPages, paginated: paginatedRules } = usePagination(rules, RULES_PAGE_SIZE)

  // Baseline page-context — ExecutionHistoryTab (below) overrides this with a
  // specific automationRunId while its detail drawer is open.
  const setCopilotPageContext = useCopilotPageContext()
  useEffect(() => {
    setCopilotPageContext({ page: 'Automation' })
  }, [setCopilotPageContext])

  const handleToggle = useCallback(async (id: string, name: string) => {
    setTogglingId(id)
    try {
      const updated = await toggle(id)
      notify('success', 'Rule Updated', `"${name}" is now ${updated.enabled ? 'enabled' : 'disabled'}`)
    } catch { notify('error', 'Error', 'Failed to toggle rule') }
    finally  { setTogglingId(null) }
  }, [toggle, notify])

  const handleDelete = useCallback(async (id: string, name: string) => {
    if (!confirm(`Delete rule "${name}"? This cannot be undone.`)) return
    setDeletingId(id)
    try {
      await remove(id)
      notify('success', 'Rule Deleted', `"${name}" has been removed`)
    } catch { notify('error', 'Error', 'Failed to delete rule') }
    finally  { setDeletingId(null) }
  }, [remove, notify])

  const handleTest = useCallback(async (id: string, name: string) => {
    setTestingId(id)
    try {
      const exec = await test(id)
      const matched = (exec as AutomationExecution).matchedDeviceCount
      const allOk = exec.actionsExecuted.every(a => a.status === 'success')
      const matchedMsg = matched !== undefined ? ` · ${matched} device${matched !== 1 ? 's' : ''} matched` : ''
      notify(
        allOk ? 'success' : 'info',
        'Test Run Complete',
        `"${name}"${matchedMsg} — ${allOk ? 'all actions executed' : 'some actions had issues'}`,
      )
      setActiveTab('history')
    } catch { notify('error', 'Test Failed', 'Could not run test trigger') }
    finally  { setTestingId(null) }
  }, [test, notify])

  const handleScanNow = useCallback(async () => {
    if (rules.filter(r => r.enabled).length === 0) {
      notify('info', 'No Enabled Rules', 'Enable at least one rule before scanning')
      return
    }
    setScanning(true)
    try {
      const result = await api.scanAutomations()
      notify(
        result.rulesFired > 0 ? 'success' : 'info',
        'Scan Complete',
        `${result.rulesEvaluated} rules evaluated · ${result.rulesFired} fired · ${result.totalMatches} device matches`,
      )
      refresh()
      setActiveTab('history')
    } catch (e) {
      notify('error', 'Scan Failed', e instanceof Error ? e.message : 'Scan error')
    } finally {
      setScanning(false)
    }
  }, [rules, notify, refresh])

  const handleAiBuilt = (rule: import('../../api').AiBuiltRule) => {
    setShowAiBuild(false)
    setCreatePrefill({
      name:          rule.name,
      description:   rule.description,
      category:      rule.category,
      triggerType:   rule.trigger.type,
      platform:      rule.conditions.platform,
      source:        rule.conditions.source,
      severity:      rule.conditions.severity,
      complianceState: rule.conditions.complianceState,
      actions:       rule.actions.map(a => a.type),
      _aiReasoning:  rule._meta?.reasoning,
    })
    setShowCreate(true)
  }

  const handleUseTemplate = (tpl: typeof QUICK_START_TEMPLATES[0]) => {
    setCreatePrefill({
      name:        tpl.title,
      description: tpl.desc,
      category:    tpl.category,
      triggerType: tpl.trigger,
      actions:     tpl.actions,
    })
    setShowCreate(true)
  }

  const openCreate = () => { setCreatePrefill(undefined); setShowCreate(true) }

  return (
    <div className="space-y-5 w-full">
      {/* ── Page Header ──────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm overflow-hidden">
        <div className="h-[3px]" style={{ background: 'linear-gradient(90deg, #FFC600 0%, #F46C00 50%, #FB471F 100%)' }} />
        <div className="px-6 py-5 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-orange-50">
                <Zap className="h-5 w-5 text-[#F46C00]" />
              </div>
              <div>
                <h1 className="text-base font-black text-slate-900 leading-tight">Automation Engine</h1>
                <p className="text-[0.65rem] text-slate-400">Platform Section 16 — Trigger-based workflow automation</p>
              </div>
            </div>
            <p className="text-xs text-slate-500 max-w-xl mt-2 leading-relaxed">
              Configure rules that fire automatically on compliance events, security alerts, or schedules.
              Each rule routes through a <strong className="text-slate-700">Trigger → Conditions → Actions</strong> pipeline and is fully logged.
            </p>
            {/* Capability pills */}
            <div className="mt-3 flex flex-wrap gap-1.5">
              {['Compliance', 'Security', 'Patching', 'Reporting', 'Drift Detection'].map(tag => (
                <span key={tag} className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[0.6rem] font-semibold text-slate-500">
                  {tag}
                </span>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={refresh}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
            >
              <RefreshCw className="h-3.5 w-3.5" />Refresh
            </button>
            <button
              type="button"
              onClick={handleScanNow}
              disabled={scanning}
              className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-100 transition disabled:opacity-50"
            >
              <ScanSearch className="h-3.5 w-3.5" />
              {scanning ? 'Scanning…' : 'Scan Now'}
            </button>
            <button
              type="button"
              onClick={() => setShowAiBuild(v => !v)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-bold transition ${
                showAiBuild
                  ? 'border-violet-400 bg-violet-100 text-violet-700'
                  : 'border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100'
              }`}
            >
              <Sparkles className="h-3.5 w-3.5" />AI Build
            </button>
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold text-white shadow-sm transition"
              style={{ background: 'linear-gradient(90deg, #F46C00 0%, #FB471F 100%)' }}
            >
              <Plus className="h-4 w-4" />New Rule
            </button>
          </div>
        </div>
      </div>

      {/* ── AI Build Panel ───────────────────────────────────────────────── */}
      {showAiBuild && (
        <AiBuildPanel
          onBuilt={handleAiBuilt}
          onClose={() => setShowAiBuild(false)}
        />
      )}

      {/* ── KPI Stats ────────────────────────────────────────────────────── */}
      {stats && <StatsBar stats={stats} />}

      {/* ── View Tabs ────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-1 bg-slate-100/80 rounded-2xl p-1">
        {([
          { id: 'rules',             label: 'Automation Rules',  icon: Zap        },
          { id: 'history',           label: 'Execution History', icon: Activity   },
        ] as const).map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 rounded-xl px-4 py-1.5 text-xs font-bold transition ${
              activeTab === tab.id
                ? 'bg-white shadow-sm text-slate-900'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <tab.icon className={`h-3.5 w-3.5 ${activeTab === tab.id ? 'text-[#F46C00]' : ''}`} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Rules Tab ────────────────────────────────────────────────────── */}
      {activeTab === 'rules' && (
        <>
          {/* Category filter */}
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map(cat => {
              const Icon     = cat.icon
              const isActive = activeCategory === cat.key
              const count    = cat.key === 'all' ? rules.length : rules.filter(r => r.category === cat.key).length
              return (
                <button
                  key={cat.key}
                  type="button"
                  onClick={() => setActiveCategory(cat.key as AutomationCategory | 'all')}
                  className={`flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-bold transition ${
                    isActive
                      ? 'text-white border-transparent'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                  style={isActive ? { background: 'linear-gradient(90deg, #F46C00 0%, #FB471F 100%)' } : undefined}
                >
                  <Icon className={`h-3.5 w-3.5 ${isActive ? 'text-white' : cat.color}`} />
                  {cat.label}
                  <span className={`ml-0.5 rounded-full px-1.5 py-0.5 text-[0.55rem] font-black ${
                    isActive ? 'bg-white/25 text-white' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {count}
                  </span>
                </button>
              )
            })}
          </div>

          {/* Two-column layout: rules | sidebar */}
          <div className="grid grid-cols-1 xl:grid-cols-[1fr_300px] gap-5 items-start">
            {/* Rules list */}
            <div className="space-y-3">
              {loading && (
                <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
                  <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-[#F46C00] border-t-transparent mb-3" />
                  <p className="text-xs text-slate-400">Loading automation rules…</p>
                </div>
              )}
              {error && (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-center">
                  <p className="text-xs text-red-600">{error}</p>
                </div>
              )}
              {!loading && !error && rules.length === 0 && (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
                  <div
                    className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl"
                    style={{ background: 'linear-gradient(135deg, #FFF7F0 0%, #FEE8D5 100%)', border: '1px solid #FCD6B0' }}
                  >
                    <Zap className="h-7 w-7 text-[#F46C00]" />
                  </div>
                  <p className="text-sm font-bold text-slate-700">No automation rules yet</p>
                  <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto leading-relaxed">
                    Create your first rule or use a quick-start template from the sidebar to automate compliance workflows.
                  </p>
                  <button
                    type="button"
                    onClick={openCreate}
                    className="mt-4 inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-xs font-bold text-white"
                    style={{ background: 'linear-gradient(90deg, #F46C00 0%, #FB471F 100%)' }}
                  >
                    <Plus className="h-4 w-4" />Create First Rule
                  </button>
                </div>
              )}
              {!loading && paginatedRules.map(rule => (
                <RuleCard
                  key={rule.id}
                  rule={rule}
                  onToggle={() => handleToggle(rule.id, rule.name)}
                  onDelete={() => handleDelete(rule.id, rule.name)}
                  onTest={()   => handleTest(rule.id, rule.name)}
                  toggling={togglingId === rule.id}
                  testing={testingId === rule.id}
                  deleting={deletingId === rule.id}
                />
              ))}
              {!loading && rules.length > 0 && (
                <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm overflow-hidden">
                  <Pagination page={rulesPage} totalPages={rulesTotalPages} onPageChange={setRulesPage}
                    totalItems={rules.length} pageSize={RULES_PAGE_SIZE} itemLabel="rule" />
                </div>
              )}
            </div>

            {/* Sidebar */}
            <div className="space-y-4">
              <WorkflowPipeline />
              <QuickStartTemplates onUseTemplate={handleUseTemplate} />

              {/* Action reference */}
              <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm overflow-hidden">
                <div className="h-[3px]" style={{ background: 'linear-gradient(90deg, #FFC600 0%, #F46C00 50%, #FB471F 100%)' }} />
                <div className="px-5 py-4">
                  <p className="text-xs font-bold text-slate-900 mb-3">Action Reference</p>
                  <div className="space-y-2">
                    {ACTION_OPTIONS.map(action => {
                      const Icon = ACTION_ICONS[action.value]
                      return (
                        <div key={action.value} className={`flex items-center gap-2.5 rounded-xl border px-3 py-2 ${ACTION_COLORS[action.value]}`}>
                          <Icon className="h-3.5 w-3.5 flex-shrink-0" />
                          <span className="text-[0.68rem] font-semibold">{action.label}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>

              {/* Settings shortcut */}
              <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm p-4 text-center">
                <Settings className="mx-auto h-5 w-5 text-slate-400 mb-2" />
                <p className="text-[0.72rem] font-semibold text-slate-700">Integration Required</p>
                <p className="text-[0.62rem] text-slate-400 mt-0.5 leading-snug">
                  Slack, Jira & OpenAI credentials must be configured for full action support.
                </p>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── History Tab ───────────────────────────────────────────────────── */}
      {activeTab === 'history' && <ExecutionHistoryTab onRefresh={refresh} />}

      {/* ── Create Modal ──────────────────────────────────────────────────── */}
      {showCreate && (
        <CreateRuleModal
          onClose={() => { setShowCreate(false); setCreatePrefill(undefined) }}
          onCreated={refresh}
          prefill={createPrefill}
        />
      )}
    </div>
  )
}
