import { useState, useEffect, useRef, useCallback } from 'react'
import {
  X, CheckCircle2, XCircle, AlertTriangle, Loader2, Clock, SkipForward,
  RefreshCw, SquareX, Download, FileText, Shield, Zap, ChevronDown, ChevronRight,
  Brain, Cpu, HardDrive, MemoryStick, Wifi, RotateCcw, Copy, ExternalLink,
} from 'lucide-react'
import { runbooksApi } from '../../api'
import { useToast } from '../ui/ToastProvider'
import type {
  RunbookExecution, ExecStatus, ExecStep, ExecLog, HealthSnapshot,
  ExecMode, LogLevel,
} from '../../types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MODE_META: Record<ExecMode, { label: string; color: string; bg: string; icon: typeof Zap }> = {
  'normal':  { label: 'LIVE',     color: '#EF4444', bg: 'bg-red-100 text-red-700 border-red-300',     icon: Zap },
  'safe':    { label: 'SAFE',     color: '#22C55E', bg: 'bg-emerald-100 text-emerald-700 border-emerald-300', icon: Shield },
  'dry-run': { label: 'DRY RUN',  color: '#6366F1', bg: 'bg-violet-100 text-violet-700 border-violet-300',   icon: SkipForward },
}

const STATUS_META: Record<ExecStatus, { label: string; color: string; dot: string }> = {
  pending:          { label: 'Pending',          color: 'text-slate-500',  dot: 'bg-slate-400' },
  waiting_approval: { label: 'Awaiting Approval', color: 'text-amber-600', dot: 'bg-amber-400' },
  running:          { label: 'Running',           color: 'text-blue-600',  dot: 'bg-blue-500' },
  completed:        { label: 'Completed',         color: 'text-emerald-600', dot: 'bg-emerald-500' },
  failed:           { label: 'Failed',            color: 'text-red-600',   dot: 'bg-red-500' },
  cancelled:        { label: 'Cancelled',         color: 'text-slate-500', dot: 'bg-slate-400' },
}

const LOG_COLORS: Record<LogLevel, string> = {
  info:    'text-slate-300',
  success: 'text-emerald-400',
  warning: 'text-amber-400',
  error:   'text-red-400',
  debug:   'text-slate-500',
}

const LOG_PREFIX: Record<LogLevel, string> = {
  info:    'INFO ',
  success: 'DONE ',
  warning: 'WARN ',
  error:   'ERR  ',
  debug:   '···  ',
}

function fmt(ts: string) {
  return new Date(ts).toLocaleTimeString('en-GB', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`
}

// ─── Step list item ───────────────────────────────────────────────────────────

function StepRow({
  step, index, total, onRetry, canRetry,
}: {
  step: ExecStep; index: number; total: number; onRetry?: (id: string) => void; canRetry: boolean
}) {
  const icons: Record<string, React.ReactNode> = {
    pending:   <div className="h-5 w-5 rounded-full border-2 border-slate-300 flex-shrink-0" />,
    running:   <Loader2 className="h-5 w-5 text-blue-500 flex-shrink-0 animate-spin" />,
    completed: <CheckCircle2 className="h-5 w-5 text-emerald-500 flex-shrink-0" />,
    failed:    <XCircle className="h-5 w-5 text-red-500 flex-shrink-0" />,
    skipped:   <SkipForward className="h-5 w-5 text-slate-400 flex-shrink-0" />,
    retrying:  <RotateCcw className="h-5 w-5 text-amber-500 flex-shrink-0 animate-spin" />,
  }
  const textColors: Record<string, string> = {
    pending:   'text-slate-400',
    running:   'text-blue-700',
    completed: 'text-slate-700',
    failed:    'text-red-700',
    skipped:   'text-slate-400 line-through',
    retrying:  'text-amber-700',
  }
  const bgColors: Record<string, string> = {
    pending:   '',
    running:   'bg-blue-50 border-l-2 border-blue-400',
    completed: '',
    failed:    'bg-red-50 border-l-2 border-red-400',
    skipped:   '',
    retrying:  'bg-amber-50 border-l-2 border-amber-400',
  }

  return (
    <div className={`flex items-start gap-3 px-4 py-2.5 rounded-xl transition-all ${bgColors[step.status]}`}>
      {icons[step.status]}
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className={`text-xs font-semibold truncate ${textColors[step.status]}`}>
            <span className="text-slate-400 font-mono mr-1.5">{String(index + 1).padStart(2, '0')}</span>
            {step.name}
          </p>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {step.durationMs !== undefined && (
              <span className="text-[0.6rem] text-slate-400 font-mono">{fmtDuration(step.durationMs)}</span>
            )}
            {step.retryCount > 0 && (
              <span className="text-[0.6rem] bg-amber-100 text-amber-700 rounded-full px-1.5 py-0.5 font-bold">
                ×{step.retryCount + 1}
              </span>
            )}
            {step.status === 'failed' && canRetry && onRetry && (
              <button
                type="button"
                onClick={() => onRetry(step.id)}
                className="inline-flex items-center gap-1 rounded-full bg-red-100 border border-red-200 px-2 py-0.5 text-[0.6rem] font-bold text-red-700 hover:bg-red-200 transition"
              >
                <RotateCcw className="h-2.5 w-2.5" /> Retry
              </button>
            )}
          </div>
        </div>
        {step.status === 'running' && (
          <div className="mt-1 h-1 w-full rounded-full bg-blue-100 overflow-hidden">
            <div className="h-full bg-blue-500 rounded-full animate-[progress_2s_ease-in-out_infinite]" style={{ width: '60%' }} />
          </div>
        )}
        {index < total - 1 && (
          <div className="ml-[-28px] mt-1 h-3 w-px bg-slate-200 ml-2" />
        )}
      </div>
    </div>
  )
}

// ─── Health comparison card ───────────────────────────────────────────────────

function HealthCard({ snap, label }: { snap: HealthSnapshot; label: string }) {
  const isAfter = label === 'After'
  const metrics = [
    { icon: Cpu,        label: 'CPU',    value: `${snap.cpu}%`,    good: snap.cpu < 70 },
    { icon: MemoryStick,label: 'Memory', value: `${snap.memory}%`, good: snap.memory < 80 },
    { icon: HardDrive,  label: 'Disk',   value: `${snap.disk}%`,   good: snap.disk < 85 },
  ]
  return (
    <div className={`flex-1 rounded-2xl border p-4 space-y-3 ${
      isAfter ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50'
    }`}>
      <div className="flex items-center justify-between">
        <p className={`text-xs font-black uppercase tracking-wider ${isAfter ? 'text-emerald-700' : 'text-slate-500'}`}>
          {label}
        </p>
        <span className={`inline-flex items-center gap-1 text-[0.6rem] font-bold rounded-full px-2 py-0.5 border ${
          snap.compliance === 'Compliant'
            ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
            : 'bg-red-100 text-red-700 border-red-200'
        }`}>
          {snap.compliance === 'Compliant' ? <CheckCircle2 className="h-2.5 w-2.5" /> : <XCircle className="h-2.5 w-2.5" />}
          {snap.compliance}
        </span>
      </div>
      <div className="space-y-2">
        {metrics.map(m => (
          <div key={m.label} className="flex items-center gap-2">
            <m.icon className="h-3 w-3 text-slate-400 flex-shrink-0" />
            <span className="text-[0.65rem] text-slate-500 w-12">{m.label}</span>
            <div className="flex-1 h-1.5 rounded-full bg-slate-200 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${m.good ? 'bg-emerald-400' : 'bg-amber-400'}`}
                style={{ width: m.value }}
              />
            </div>
            <span className={`text-[0.65rem] font-mono font-semibold ${m.good ? 'text-emerald-600' : 'text-amber-600'}`}>{m.value}</span>
          </div>
        ))}
      </div>
      <div className="space-y-1">
        <div className="flex items-center gap-1.5">
          <Wifi className="h-3 w-3 text-slate-400" />
          <span className={`text-[0.65rem] font-semibold ${snap.encryptionEnabled ? 'text-emerald-600' : 'text-red-500'}`}>
            Encryption: {snap.encryptionEnabled ? 'Enabled' : 'Disabled'}
          </span>
        </div>
        {snap.issues.length > 0 && snap.issues.map(issue => (
          <div key={issue} className="flex items-center gap-1.5">
            <AlertTriangle className="h-3 w-3 text-red-400 flex-shrink-0" />
            <span className="text-[0.65rem] text-red-600">{issue}</span>
          </div>
        ))}
        {snap.issues.length === 0 && (
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="h-3 w-3 text-emerald-400" />
            <span className="text-[0.65rem] text-emerald-600">No issues detected</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main ExecutionDrawer ─────────────────────────────────────────────────────

interface ExecutionDrawerProps {
  executionId: string
  onClose: () => void
  viewerRole?: string
  userName?: string
}

type StreamEvent =
  | { type: 'init'; execution: RunbookExecution }
  | { type: 'log'; log: ExecLog }
  | { type: 'step_update'; step: ExecStep; stepIndex: number }
  | { type: 'progress'; progress: number }
  | { type: 'status'; status: ExecStatus; beforeHealth?: HealthSnapshot; error?: string; cancelledBy?: string }
  | { type: 'complete'; execution: RunbookExecution }

export function ExecutionDrawer({ executionId, onClose, viewerRole = 'IT Admin', userName = 'admin' }: ExecutionDrawerProps) {
  const { notify } = useToast()
  const [exec, setExec]         = useState<RunbookExecution | null>(null)
  const [steps, setSteps]       = useState<ExecStep[]>([])
  const [logs, setLogs]         = useState<ExecLog[]>([])
  const [progress, setProgress] = useState(0)
  const [status, setStatus]     = useState<ExecStatus>('pending')
  const [aiOpen, setAiOpen]     = useState(false)
  const [filterLevel, setFilterLevel] = useState<LogLevel | 'all'>('all')
  const logEndRef = useRef<HTMLDivElement>(null)
  const logsRef   = useRef<HTMLDivElement>(null)
  const atBottom  = useRef(true)

  // SSE connection
  useEffect(() => {
    if (!executionId) return
    const url = runbooksApi.streamUrl(executionId)
    const es = new EventSource(url)

    es.onmessage = (ev: MessageEvent) => {
      const data = JSON.parse(ev.data as string) as StreamEvent
      switch (data.type) {
        case 'init':
          setExec(data.execution)
          setSteps(data.execution.steps)
          setLogs(data.execution.logs)
          setProgress(data.execution.progress)
          setStatus(data.execution.status)
          break
        case 'log':
          setLogs(prev => [...prev, data.log])
          break
        case 'step_update':
          setSteps(prev => prev.map((s, i) => i === data.stepIndex ? data.step : s))
          break
        case 'progress':
          setProgress(data.progress)
          break
        case 'status':
          setStatus(data.status)
          if (data.beforeHealth) setExec(prev => prev ? { ...prev, beforeHealth: data.beforeHealth } : prev)
          break
        case 'complete':
          setExec(data.execution)
          setSteps(data.execution.steps)
          setProgress(100)
          setStatus('completed')
          setAiOpen(true)
          es.close()
          break
      }
    }
    es.onerror = () => es.close()
    return () => es.close()
  }, [executionId])

  // Auto-scroll logs
  useEffect(() => {
    if (atBottom.current) logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  const handleScroll = useCallback(() => {
    const el = logsRef.current
    if (!el) return
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
  }, [])

  const handleCancel = async () => {
    if (!exec) return
    try {
      await runbooksApi.cancel(exec.id, userName)
      setStatus('cancelled')
      notify('info', 'Cancelled', 'Execution cancelled')
    } catch { notify('error', 'Error', 'Failed to cancel') }
  }

  const handleRetryStep = async (stepId: string) => {
    if (!exec) return
    try {
      await runbooksApi.retryStep(exec.id, stepId)
      notify('info', 'Retrying', 'Retrying step...')
    } catch { notify('error', 'Error', 'Failed to retry step') }
  }

  const handleRetryAll = async () => {
    if (!exec) return
    try {
      await runbooksApi.retryExecution(exec.id)
      setStatus('pending')
      setProgress(0)
      setLogs([])
      setSteps(prev => prev.map(s => ({ ...s, status: 'pending', startedAt: undefined, completedAt: undefined })))
      notify('info', 'Retrying', 'Restarting execution...')
    } catch { notify('error', 'Error', 'Failed to retry') }
  }

  const exportCSV = () => {
    if (!exec) return
    const header = 'Timestamp,Level,Step,Message'
    const rows = exec.logs.map(l =>
      `"${l.timestamp}","${l.level}","${l.stepName ?? ''}","${l.message.replace(/"/g, '""')}"`
    )
    const csv = [header, ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
    a.download = `runbook_${exec.id}_logs.csv`; a.click()
  }

  const exportEvidence = async () => {
    if (!exec) return
    try {
      const bundle = await runbooksApi.getEvidence(exec.id)
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' })
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
      a.download = `evidence_${exec.id}.json`; a.click()
      notify('success', 'Evidence Bundle', 'Downloaded evidence package')
    } catch { notify('error', 'Error', 'Failed to export evidence') }
  }

  const copyExecId = () => {
    if (!exec) return
    navigator.clipboard.writeText(exec.id).then(() => notify('success', 'Copied', 'Execution ID copied'))
  }

  const filteredLogs = filterLevel === 'all' ? logs : logs.filter(l => l.level === filterLevel)

  const canCancel = status === 'running' || status === 'waiting_approval'
  const canRetry  = (status === 'failed' || status === 'cancelled') && (viewerRole === 'Global Admin' || viewerRole === 'IT Admin')
  const isDone    = status === 'completed' || status === 'failed' || status === 'cancelled'
  const statusMeta = STATUS_META[status] ?? STATUS_META.pending
  const modeMeta   = exec ? MODE_META[exec.mode] : null
  const elapsed    = exec ? (exec.completedAt
    ? fmtDuration(new Date(exec.completedAt).getTime() - new Date(exec.startedAt).getTime())
    : fmtDuration(Date.now() - new Date(exec.startedAt).getTime())) : '—'

  if (!exec) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <div className="rounded-2xl glass-strong p-8 flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 text-orange-500 animate-spin" />
          <p className="text-sm text-slate-600 font-medium">Loading execution…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white" style={{ background: 'linear-gradient(135deg, #F8FAFC 0%, #F0F9FF 100%)' }}>

      {/* ── Header ── */}
      <div className="flex-shrink-0 border-b border-slate-200 bg-white/90"
        style={{ boxShadow: '0 4px 24px rgba(14,165,233,0.06)' }}>
        {/* Top accent */}
        <div className="h-[2px]" style={{ background: 'linear-gradient(90deg, #E8172D 0%, #F46C00 40%, #0EA5E9 80%, transparent)' }} />

        <div className="flex items-center gap-3 px-5 py-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-sm font-black text-slate-900 truncate">{exec.runbookName}</h2>
              <span className="text-[0.6rem] font-mono text-slate-400">v{exec.runbookVersion}</span>
              {modeMeta && (
                <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.65rem] font-black ${modeMeta.bg}`}>
                  <modeMeta.icon className="h-2.5 w-2.5" />
                  {modeMeta.label}
                </span>
              )}
              <span className={`inline-flex items-center gap-1.5 text-[0.65rem] font-semibold ${statusMeta.color}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${statusMeta.dot} ${status === 'running' ? 'animate-pulse' : ''}`} />
                {statusMeta.label}
              </span>
            </div>
            <div className="flex items-center gap-3 mt-0.5 text-[0.65rem] text-slate-400">
              <span>Device: <span className="font-semibold text-slate-600">{exec.deviceName}</span></span>
              <span>·</span>
              <span>By: <span className="font-semibold text-slate-600">{exec.initiatedBy}</span></span>
              {exec.approvedBy && <><span>·</span><span>Approved: <span className="font-semibold text-slate-600">{exec.approvedBy}</span></span></>}
              <button type="button" onClick={copyExecId} className="flex items-center gap-1 hover:text-slate-600 transition" title="Copy execution ID">
                <Copy className="h-2.5 w-2.5" />
                <span className="font-mono">{exec.id.slice(0, 16)}…</span>
              </button>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {canCancel && (
              <button type="button" onClick={handleCancel}
                className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 transition">
                <SquareX className="h-3.5 w-3.5" /> Cancel
              </button>
            )}
            {canRetry && (
              <button type="button" onClick={handleRetryAll}
                className="inline-flex items-center gap-1.5 rounded-xl border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-semibold text-orange-700 hover:bg-orange-100 transition">
                <RefreshCw className="h-3.5 w-3.5" /> Retry All
              </button>
            )}
            {isDone && (
              <>
                <button type="button" onClick={exportCSV}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition">
                  <Download className="h-3.5 w-3.5" /> CSV
                </button>
                <button type="button" onClick={exportEvidence}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition">
                  <FileText className="h-3.5 w-3.5" /> Evidence
                </button>
              </>
            )}
            <button type="button" onClick={onClose}
              className="grid h-8 w-8 place-items-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 transition">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="px-5 pb-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[0.65rem] font-semibold text-slate-500">
              Progress: {steps.filter(s => s.status === 'completed' || s.status === 'skipped').length}/{steps.length} steps
            </span>
            <div className="flex items-center gap-3 text-[0.65rem] text-slate-400">
              <span className="flex items-center gap-1"><Clock className="h-2.5 w-2.5" />{elapsed}</span>
              <span className="font-bold text-slate-600">{progress}%</span>
            </div>
          </div>
          <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ${
                status === 'completed' ? 'bg-emerald-500'
                : status === 'failed'  ? 'bg-red-500'
                : status === 'cancelled' ? 'bg-slate-400'
                : 'bg-gradient-to-r from-orange-400 via-orange-500 to-blue-500'
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>

      {/* ── Approval banner ── */}
      {status === 'waiting_approval' && (
        <div className="flex-shrink-0 flex items-center gap-3 bg-amber-50 border-b border-amber-200 px-5 py-3">
          <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0" />
          <p className="text-xs font-semibold text-amber-800 flex-1">
            This runbook requires admin approval before execution begins.
          </p>
          {(viewerRole === 'Global Admin' || viewerRole === 'IT Admin') && (
            <div className="flex gap-2">
              <button type="button"
                onClick={() => runbooksApi.approve(exec.runbookId, exec.id, userName).then(() => setStatus('running')).catch(() => notify('error', 'Error', 'Approval failed'))}
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[0.7rem] font-bold text-white hover:bg-emerald-700 transition">
                Approve & Run
              </button>
              <button type="button"
                onClick={() => runbooksApi.approve(exec.runbookId, exec.id, userName, true).then(() => setStatus('cancelled')).catch(() => notify('error', 'Error', 'Failed'))}
                className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-[0.7rem] font-bold text-red-700 hover:bg-red-100 transition">
                Reject
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Main body: steps + logs ── */}
      <div className="flex-1 min-h-0 flex">

        {/* Left: Steps */}
        <div className="w-72 flex-shrink-0 border-r border-slate-200 bg-white/60 flex flex-col">
          <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between">
            <p className="text-[0.7rem] font-black uppercase tracking-wider text-slate-500">Steps</p>
            <div className="flex gap-1">
              {['completed', 'failed', 'running'].map(s => {
                const count = steps.filter(st => st.status === s).length
                if (!count) return null
                const colors: Record<string, string> = { completed: 'text-emerald-600 bg-emerald-100', failed: 'text-red-600 bg-red-100', running: 'text-blue-600 bg-blue-100' }
                return (
                  <span key={s} className={`text-[0.6rem] font-black rounded-full px-1.5 py-0.5 ${colors[s]}`}>{count}</span>
                )
              })}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto py-2">
            {steps.map((step, i) => (
              <StepRow
                key={step.id}
                step={step}
                index={i}
                total={steps.length}
                canRetry={canRetry}
                onRetry={handleRetryStep}
              />
            ))}
          </div>
        </div>

        {/* Right: Log stream */}
        <div className="flex-1 min-w-0 flex flex-col bg-slate-900">
          {/* Log toolbar */}
          <div className="flex-shrink-0 flex items-center justify-between px-4 py-2 bg-slate-800 border-b border-slate-700">
            <div className="flex items-center gap-1">
              <p className="text-[0.65rem] font-black uppercase tracking-wider text-slate-400 mr-2">Logs</p>
              {(['all', 'success', 'warning', 'error', 'debug'] as const).map(level => (
                <button
                  key={level}
                  type="button"
                  onClick={() => setFilterLevel(level)}
                  className={`rounded-md px-2 py-0.5 text-[0.6rem] font-bold transition ${
                    filterLevel === level
                      ? 'bg-slate-600 text-white'
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {level === 'all' ? 'ALL' : level.toUpperCase()}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 text-[0.6rem] text-slate-500">
              <span>{filteredLogs.length} lines</span>
              {status === 'running' && (
                <span className="flex items-center gap-1 text-green-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
                  LIVE
                </span>
              )}
            </div>
          </div>

          {/* Log lines */}
          <div
            ref={logsRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto p-4 font-mono text-[0.68rem] space-y-0.5 leading-relaxed"
          >
            {filteredLogs.length === 0 && (
              <p className="text-slate-600 italic">Waiting for output…</p>
            )}
            {filteredLogs.map(log => (
              <div key={log.id} className="flex gap-2">
                <span className="text-slate-600 flex-shrink-0 select-none">{fmt(log.timestamp)}</span>
                <span className={`font-bold flex-shrink-0 select-none ${LOG_COLORS[log.level]}`}>
                  {LOG_PREFIX[log.level]}
                </span>
                <span className={LOG_COLORS[log.level]}>{log.message}</span>
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        </div>
      </div>

      {/* ── Before/After + AI Summary (post-completion) ── */}
      {isDone && exec.beforeHealth && exec.afterHealth && (
        <div className="flex-shrink-0 border-t border-slate-200 bg-white max-h-80 overflow-y-auto">
          <div className="px-5 py-4 space-y-4">
            {/* Health comparison */}
            <div>
              <p className="text-[0.7rem] font-black uppercase tracking-wider text-slate-500 mb-3">Device Health Comparison</p>
              <div className="flex gap-3">
                <HealthCard snap={exec.beforeHealth} label="Before" />
                <HealthCard snap={exec.afterHealth}  label="After" />
              </div>
            </div>

            {/* AI Summary */}
            {(exec.aiRootCause || exec.aiResolution) && (
              <div className="rounded-2xl border border-violet-200 bg-violet-50 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setAiOpen(v => !v)}
                  className="w-full flex items-center justify-between px-4 py-3"
                >
                  <div className="flex items-center gap-2">
                    <div className="grid h-6 w-6 place-items-center rounded-lg bg-violet-200">
                      <Brain className="h-3.5 w-3.5 text-violet-700" />
                    </div>
                    <p className="text-xs font-black text-violet-800">AI Analysis</p>
                  </div>
                  {aiOpen ? <ChevronDown className="h-3.5 w-3.5 text-violet-600" /> : <ChevronRight className="h-3.5 w-3.5 text-violet-600" />}
                </button>
                {aiOpen && (
                  <div className="px-4 pb-4 space-y-3 border-t border-violet-200">
                    {exec.aiRootCause && (
                      <div>
                        <p className="text-[0.65rem] font-black uppercase tracking-wider text-violet-600 mb-1">Root Cause</p>
                        <p className="text-xs text-slate-700 leading-relaxed">{exec.aiRootCause}</p>
                      </div>
                    )}
                    {exec.aiResolution && (
                      <div>
                        <p className="text-[0.65rem] font-black uppercase tracking-wider text-emerald-600 mb-1">Resolution</p>
                        <p className="text-xs text-slate-700 leading-relaxed">{exec.aiResolution}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
