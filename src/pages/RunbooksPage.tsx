import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  BookOpen, Search, Zap, Shield, SkipForward, Play, Copy, Download, Upload,
  CheckCircle2, Clock, AlertTriangle, RotateCcw, ChevronDown, ChevronUp,
  ExternalLink, Tag, Users, History, X, FileDown, Terminal, Package, ShieldCheck,
  HardDrive, Wifi, Lock, RefreshCw, Eye, ClipboardList, Layers, ChevronRight,
  Filter, TrendingUp, Star, Wrench, SlidersHorizontal,
} from 'lucide-react'
import { runbooksApi } from '../api'
import { useToast } from '../components/ui/ToastProvider'
import { ExecutionDrawer } from '../components/runbooks/ExecutionDrawer'
import { usePagination } from '../hooks/usePagination'
import { Pagination } from '../components/ui/Pagination'
import type {
  EnterpriseRunbook, RunbookExecution, ExecMode, ExecStatus,
} from '../types'

const LIBRARY_PAGE_SIZE  = 12
const EXEC_PAGE_SIZE     = 25
const APPROVAL_PAGE_SIZE = 25

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SEV_BADGE: Record<string, string> = {
  Critical: 'bg-red-100 text-red-700 border-red-200',
  High:     'bg-orange-100 text-orange-700 border-orange-200',
  Medium:   'bg-amber-100 text-amber-700 border-amber-200',
  Low:      'bg-slate-100 text-slate-600 border-slate-200',
}

const STATUS_BADGE: Record<ExecStatus, string> = {
  pending:          'bg-slate-100 text-slate-600 border-slate-200',
  waiting_approval: 'bg-amber-100 text-amber-700 border-amber-200',
  running:          'bg-blue-100 text-blue-700 border-blue-200',
  completed:        'bg-emerald-100 text-emerald-700 border-emerald-200',
  failed:           'bg-red-100 text-red-700 border-red-200',
  cancelled:        'bg-slate-100 text-slate-500 border-slate-200',
}

const STATUS_LABELS: Record<ExecStatus, string> = {
  pending: 'Pending', waiting_approval: 'Awaiting Approval',
  running: 'Running', completed: 'Completed', failed: 'Failed', cancelled: 'Cancelled',
}

const MODE_BADGE: Record<ExecMode, string> = {
  normal: 'bg-red-100 text-red-700 border-red-200',
  safe: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  'dry-run': 'bg-violet-100 text-violet-700 border-violet-200',
}

const MODE_TAG: Record<ExecMode, string> = {
  normal: 'LIVE', safe: 'SAFE', 'dry-run': 'DRY RUN',
}

const CAT_ICONS: Record<string, React.ElementType> = {
  'Encryption':   Lock,
  'MDM':          Wifi,
  'Patching':     RefreshCw,
  'Security / AV': Shield,
  'Identity':     Users,
  'Diagnostics':  HardDrive,
  'Application':  Package,
}

const MODE_LABELS: Record<ExecMode, string> = {
  normal: 'Live Execution', safe: 'Safe Mode', 'dry-run': 'Dry Run',
}

const MODE_DESC: Record<ExecMode, string> = {
  normal:   'Execute all steps on the device. Real changes are applied.',
  safe:     'Skip risky steps. Read-only assessment where possible.',
  'dry-run': 'Simulate execution without applying any changes.',
}

const PLATFORM_LABELS: Record<string, string> = {
  'Windows': 'Windows', 'macOS': 'macOS', 'cross-platform': 'All Platforms',
}

function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`
}

function fmtRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 60000)  return 'just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return new Date(iso).toLocaleDateString()
}

// ─── Execute modal ────────────────────────────────────────────────────────────

interface ExecuteModalProps {
  runbook: EnterpriseRunbook
  onClose: () => void
  onStart: (mode: ExecMode, deviceId: string, deviceName: string) => void
}

function ExecuteModal({ runbook, onClose, onStart }: ExecuteModalProps) {
  const [mode, setMode]       = useState<ExecMode>('normal')
  const [deviceId, setDeviceId]   = useState('device-001')
  const [deviceName, setDeviceName] = useState('WINLAPTOP-DEMO01')

  const modes: ExecMode[] = ['normal', 'safe', 'dry-run']
  const modeIcons: Record<ExecMode, React.ElementType> = { normal: Zap, safe: Shield, 'dry-run': SkipForward }
  const modeColors: Record<ExecMode, string> = {
    normal:   'border-red-300 bg-red-50 text-red-800',
    safe:     'border-emerald-300 bg-emerald-50 text-emerald-800',
    'dry-run':'border-violet-300 bg-violet-50 text-violet-800',
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4 cursor-pointer" onClick={onClose}>
      <div className="w-full max-w-lg rounded-3xl glass-strong p-6 space-y-5 shadow-2xl cursor-default"
        onClick={e => e.stopPropagation()}
        style={{ boxShadow: '0 32px 96px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.9)' }}>

        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-base font-black text-slate-900">{runbook.name}</h3>
            <p className="text-xs text-slate-500 mt-0.5">v{runbook.version} · {runbook.steps.length} steps · ~{runbook.estimatedMinutes}m</p>
          </div>
          <button onClick={onClose} className="grid h-7 w-7 place-items-center rounded-xl border border-slate-200 text-slate-400 hover:bg-slate-50 transition">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Prerequisites */}
        {runbook.prerequisites.length > 0 && (
          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3.5 space-y-1.5">
            <p className="text-[0.65rem] font-black uppercase tracking-wider text-slate-400">Prerequisites</p>
            {runbook.prerequisites.map(p => (
              <div key={p} className="flex items-center gap-2">
                <CheckCircle2 className="h-3 w-3 text-emerald-500 flex-shrink-0" />
                <p className="text-xs text-slate-600">{p}</p>
              </div>
            ))}
          </div>
        )}

        {/* Execution mode */}
        <div>
          <p className="text-[0.65rem] font-black uppercase tracking-wider text-slate-400 mb-2">Execution Mode</p>
          <div className="space-y-2">
            {modes.map(m => {
              const Icon = modeIcons[m]
              return (
                <label key={m} className={`flex items-start gap-3 rounded-2xl border-2 px-4 py-3 cursor-pointer transition ${
                  mode === m ? modeColors[m] + ' border-current' : 'border-slate-200 bg-white hover:border-slate-300'
                }`}>
                  <input type="radio" name="mode" value={m} checked={mode === m} onChange={() => setMode(m)} className="sr-only" />
                  <Icon className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs font-bold">{MODE_LABELS[m]}</p>
                    <p className="text-[0.65rem] opacity-75 mt-0.5">{MODE_DESC[m]}</p>
                  </div>
                </label>
              )
            })}
          </div>
        </div>

        {/* Device */}
        <div className="space-y-2">
          <p className="text-[0.65rem] font-black uppercase tracking-wider text-slate-400">Target Device</p>
          <input
            value={deviceName}
            onChange={e => { setDeviceName(e.target.value); setDeviceId(e.target.value.toLowerCase().replace(/\s+/g, '-')) }}
            placeholder="Device name…"
            className="h-9 w-full rounded-xl px-3.5 text-xs font-medium text-slate-700 water-input"
          />
        </div>

        {runbook.approvalRequired && (
          <div className="flex items-start gap-2.5 rounded-2xl border border-amber-200 bg-amber-50 px-3.5 py-3">
            <AlertTriangle className="h-4 w-4 flex-shrink-0 text-amber-600 mt-0.5" />
            <p className="text-xs text-amber-800 font-medium">
              This runbook requires admin approval. Execution will pause until an admin approves.
            </p>
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <button onClick={onClose}
            className="flex-1 rounded-2xl border border-slate-200 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition">
            Cancel
          </button>
          <button
            onClick={() => onStart(mode, deviceId, deviceName)}
            disabled={!deviceName.trim()}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-2xl py-2.5 text-xs font-bold text-white transition btn-water disabled:opacity-50">
            <Play className="h-3.5 w-3.5" />
            Start Execution
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Version History panel ────────────────────────────────────────────────────

function VersionHistory({ runbook, onClose }: { runbook: EnterpriseRunbook; onClose: () => void }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-xl p-5 space-y-4 w-80">
      <div className="flex items-center justify-between">
        <p className="text-xs font-black text-slate-800">Version History</p>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition"><X className="h-3.5 w-3.5" /></button>
      </div>
      <div className="space-y-3">
        {runbook.versions.map((v, i) => (
          <div key={v.version} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div className={`h-5 w-5 flex-shrink-0 rounded-full flex items-center justify-center text-[0.55rem] font-black ${
                i === 0 ? 'bg-orange-500 text-white' : 'bg-slate-200 text-slate-600'
              }`}>{i === 0 ? '●' : (runbook.versions.length - i)}</div>
              {i < runbook.versions.length - 1 && <div className="flex-1 w-px bg-slate-200 my-1 min-h-[16px]" />}
            </div>
            <div className="min-w-0 pb-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-800">v{v.version}</span>
                {i === 0 && <span className="text-[0.58rem] font-bold bg-orange-100 text-orange-700 rounded-full px-1.5 py-0.5">Latest</span>}
              </div>
              <p className="text-[0.65rem] text-slate-500 mt-0.5">{v.date} · {v.author}</p>
              <p className="text-[0.65rem] text-slate-600 mt-0.5 leading-snug">{v.notes}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Runbook library card ─────────────────────────────────────────────────────

interface RunbookCardProps {
  runbook: EnterpriseRunbook
  onExecute: (rb: EnterpriseRunbook) => void
  onClone: (id: string) => void
  onExport: (id: string) => void
  viewerRole: string
}

function RunbookCard({ runbook, onExecute, onClone, onExport, viewerRole }: RunbookCardProps) {
  const [showVersions, setShowVersions] = useState(false)
  const CatIcon = CAT_ICONS[runbook.category] ?? BookOpen
  const canExecute = viewerRole === 'Global Admin' || viewerRole === 'IT Admin'

  return (
    <div className="relative rounded-3xl border border-slate-200 bg-white p-5 space-y-4 hover:shadow-lg transition-all group overflow-visible"
      style={{ boxShadow: '0 2px 16px rgba(14,165,233,0.06)' }}>

      {/* Top row */}
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-2xl"
          style={{ background: 'linear-gradient(135deg, rgba(244,108,0,0.10), rgba(14,165,233,0.08))' }}>
          <CatIcon className="h-5 w-5 text-orange-600" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-sm font-bold text-slate-900 leading-tight">{runbook.name}</h3>
          </div>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[0.6rem] font-bold ${SEV_BADGE[runbook.severity] ?? SEV_BADGE.Low}`}>
              {runbook.severity}
            </span>
            <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[0.6rem] font-semibold text-slate-600">
              {PLATFORM_LABELS[runbook.platform] ?? runbook.platform}
            </span>
            <span className="inline-flex items-center rounded-full border border-slate-100 bg-slate-50 px-2 py-0.5 text-[0.6rem] text-slate-500">
              {runbook.category}
            </span>
            {runbook.approvalRequired && (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[0.6rem] font-semibold text-amber-700">
                <Lock className="h-2.5 w-2.5" /> Approval Required
              </span>
            )}
          </div>
        </div>
      </div>

      <p className="text-xs text-slate-500 leading-relaxed">{runbook.description}</p>

      {/* Meta row */}
      <div className="flex items-center gap-3 text-[0.65rem] text-slate-400">
        <span className="flex items-center gap-1"><ClipboardList className="h-3 w-3" />{runbook.steps.length} steps</span>
        <span className="flex items-center gap-1"><Clock className="h-3 w-3" />~{runbook.estimatedMinutes}m</span>
        <span className="flex items-center gap-1"><TrendingUp className="h-3 w-3" />{runbook.usageCount} runs</span>
        <span className="ml-auto flex items-center gap-1 font-mono">v{runbook.version}</span>
      </div>

      {/* Tags */}
      {runbook.tags.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap">
          {runbook.tags.slice(0, 4).map(tag => (
            <span key={tag} className="rounded-full bg-slate-100 px-2 py-0.5 text-[0.58rem] font-mono text-slate-500">
              #{tag}
            </span>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        {canExecute ? (
          <button
            type="button"
            onClick={() => onExecute(runbook)}
            className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-2xl py-2 text-xs font-bold text-white transition btn-water">
            <Play className="h-3.5 w-3.5" /> Execute
          </button>
        ) : (
          <span className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-2xl py-2 text-xs font-semibold text-slate-400 border border-slate-200 bg-slate-50">
            <Eye className="h-3.5 w-3.5" /> View Only
          </span>
        )}

        <div className="relative">
          <button
            type="button"
            onClick={() => setShowVersions(v => !v)}
            className="grid h-9 w-9 place-items-center rounded-2xl border border-slate-200 text-slate-500 hover:bg-slate-50 transition"
            title="Version history">
            <History className="h-3.5 w-3.5" />
          </button>
          {showVersions && (
            <div className="absolute right-0 bottom-full mb-2 z-30">
              <VersionHistory runbook={runbook} onClose={() => setShowVersions(false)} />
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => onClone(runbook.id)}
          className="grid h-9 w-9 place-items-center rounded-2xl border border-slate-200 text-slate-500 hover:bg-slate-50 transition"
          title="Clone runbook">
          <Copy className="h-3.5 w-3.5" />
        </button>

        <button
          type="button"
          onClick={() => onExport(runbook.id)}
          className="grid h-9 w-9 place-items-center rounded-2xl border border-slate-200 text-slate-500 hover:bg-slate-50 transition"
          title="Export JSON">
          <FileDown className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

// ─── Stats bar ────────────────────────────────────────────────────────────────

function StatsBar({ runbooks, executions }: { runbooks: EnterpriseRunbook[]; executions: RunbookExecution[] }) {
  const totalRuns   = executions.length
  const successful  = executions.filter(e => e.status === 'completed').length
  const pending     = executions.filter(e => e.status === 'waiting_approval').length
  const running     = executions.filter(e => e.status === 'running').length
  const successRate = totalRuns > 0 ? Math.round((successful / totalRuns) * 100) : 100

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {[
        { label: 'Total Runbooks', value: runbooks.length.toString(), icon: BookOpen,      color: '#F46C00' },
        { label: 'Total Executions', value: totalRuns.toString(),   icon: Terminal,        color: '#0EA5E9' },
        { label: 'Success Rate',   value: `${successRate}%`,        icon: TrendingUp,      color: '#22C55E' },
        { label: 'Pending Approval', value: pending + running > 0 ? `${pending + running}` : '0', icon: Clock, color: pending > 0 ? '#F59E0B' : '#94A3B8' },
      ].map(s => (
        <div key={s.label} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 flex items-center gap-3"
          style={{ boxShadow: '0 2px 12px rgba(14,165,233,0.05)' }}>
          <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl"
            style={{ background: `${s.color}18` }}>
            <s.icon className="h-4 w-4" style={{ color: s.color }} />
          </div>
          <div>
            <p className="text-lg font-black text-slate-900 leading-tight">{s.value}</p>
            <p className="text-[0.65rem] text-slate-400">{s.label}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Import modal ─────────────────────────────────────────────────────────────

function ImportModal({ onClose, onImport }: { onClose: () => void; onImport: (data: object) => void }) {
  const [json, setJson] = useState('')
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => setJson(String(ev.target?.result ?? ''))
    reader.readAsText(file)
  }

  const handleImport = () => {
    try {
      const parsed = JSON.parse(json) as object
      onImport(parsed)
    } catch {
      setError('Invalid JSON format. Please check the file.')
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4 cursor-pointer" onClick={onClose}>
      <div className="w-full max-w-lg rounded-3xl glass-strong p-6 space-y-4 shadow-2xl cursor-default" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-black text-slate-900">Import Runbook from JSON</h3>
          <button onClick={onClose}><X className="h-4 w-4 text-slate-400" /></button>
        </div>
        <div className="rounded-2xl border-2 border-dashed border-slate-200 p-6 text-center cursor-pointer hover:border-orange-300 transition"
          onClick={() => fileRef.current?.click()}>
          <Upload className="h-6 w-6 text-slate-300 mx-auto mb-2" />
          <p className="text-xs font-semibold text-slate-500">Click to upload .json file</p>
          <input ref={fileRef} type="file" accept=".json" onChange={handleFile} className="hidden" />
        </div>
        <textarea
          value={json}
          onChange={e => { setJson(e.target.value); setError('') }}
          placeholder="Or paste JSON here…"
          rows={6}
          className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-3 font-mono text-[0.68rem] text-slate-700 resize-none focus:outline-none focus:ring-2 focus:ring-orange-400"
        />
        {error && <p className="text-xs text-red-600 font-medium">{error}</p>}
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-2xl border border-slate-200 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition">Cancel</button>
          <button onClick={handleImport} disabled={!json.trim()} className="flex-1 inline-flex items-center justify-center gap-2 rounded-2xl py-2.5 text-xs font-bold text-white btn-water disabled:opacity-50">
            <Upload className="h-3.5 w-3.5" /> Import
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main RunbooksPage ────────────────────────────────────────────────────────

interface RunbooksPageProps { viewerRole?: string; userName?: string }

type Tab = 'library' | 'executions' | 'approvals'

export function RunbooksPage({ viewerRole = 'IT Admin', userName = 'admin' }: RunbooksPageProps) {
  const { notify } = useToast()
  const [tab, setTab] = useState<Tab>('library')
  const [runbooks, setRunbooks]     = useState<EnterpriseRunbook[]>([])
  const [executions, setExecutions] = useState<RunbookExecution[]>([])
  const [loading, setLoading]       = useState(true)
  const [execLoading, setExecLoading] = useState(false)
  const [search, setSearch]         = useState('')
  const [filterSev, setFilterSev]   = useState<string>('all')
  const [filterPlat, setFilterPlat] = useState<string>('all')
  const [filterCat, setFilterCat]   = useState<string>('all')
  const [executeTarget, setExecuteTarget] = useState<EnterpriseRunbook | null>(null)
  const [activeExecId, setActiveExecId]   = useState<string | null>(null)
  const [showImport, setShowImport] = useState(false)

  // Load runbooks
  const loadRunbooks = useCallback(async () => {
    try {
      setLoading(true)
      const data = await runbooksApi.list()
      setRunbooks(data)
    } catch {
      notify('error', 'Error', 'Failed to load runbooks')
    } finally {
      setLoading(false)
    }
  }, [notify])

  // Load executions
  const loadExecutions = useCallback(async () => {
    try {
      setExecLoading(true)
      const data = await runbooksApi.listExecutions()
      setExecutions(data)
    } catch { /* silent */ }
    finally { setExecLoading(false) }
  }, [])

  useEffect(() => { void loadRunbooks() }, [loadRunbooks])

  // Poll executions when on executions/approvals tabs
  useEffect(() => {
    if (tab === 'executions' || tab === 'approvals') {
      void loadExecutions()
      const t = setInterval(loadExecutions, 4000)
      return () => clearInterval(t)
    }
  }, [tab, loadExecutions])

  const handleExecute = async (mode: ExecMode, deviceId: string, deviceName: string) => {
    if (!executeTarget) return
    try {
      const exec = await runbooksApi.execute(executeTarget.id, {
        deviceId, deviceName,
        devicePlatform: executeTarget.platform === 'macOS' ? 'macOS' : 'Windows',
        mode, initiatedBy: userName,
      })
      setExecutions(prev => [exec, ...prev])
      setExecuteTarget(null)
      setActiveExecId(exec.id)
      notify('success', 'Execution Started', `Running: ${executeTarget.name}`)
    } catch {
      notify('error', 'Error', 'Failed to start execution')
    }
  }

  const handleClone = async (id: string) => {
    try {
      const cloned = await runbooksApi.clone(id)
      setRunbooks(prev => [...prev, cloned])
      notify('success', 'Cloned', `Runbook cloned: ${cloned.name}`)
    } catch {
      notify('error', 'Error', 'Failed to clone runbook')
    }
  }

  const handleExport = async (id: string) => {
    try {
      const rb = await runbooksApi.exportJson(id)
      const blob = new Blob([JSON.stringify(rb, null, 2)], { type: 'application/json' })
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
      a.download = `runbook_${id}.json`; a.click()
      notify('success', 'Exported', 'Runbook JSON downloaded')
    } catch {
      notify('error', 'Error', 'Failed to export runbook')
    }
  }

  const handleImport = async (data: object) => {
    try {
      const rb = await runbooksApi.importJson(data)
      setRunbooks(prev => [...prev, rb])
      setShowImport(false)
      notify('success', 'Imported', `Runbook imported: ${rb.name}`)
    } catch {
      notify('error', 'Error', 'Failed to import runbook')
    }
  }

  const handleApprove = async (execId: string, runbookId: string) => {
    try {
      await runbooksApi.approve(runbookId, execId, userName)
      setExecutions(prev => prev.map(e => e.id === execId ? { ...e, status: 'running' as ExecStatus, approvedBy: userName } : e))
      setActiveExecId(execId)
      notify('success', 'Approved', 'Execution approved and started')
    } catch {
      notify('error', 'Error', 'Failed to approve execution')
    }
  }

  // Filtered runbooks
  const filteredRunbooks = useMemo(() => runbooks.filter(rb => {
    if (search && !rb.name.toLowerCase().includes(search.toLowerCase()) &&
        !rb.description.toLowerCase().includes(search.toLowerCase()) &&
        !rb.tags.some(t => t.toLowerCase().includes(search.toLowerCase()))) return false
    if (filterSev  !== 'all' && rb.severity  !== filterSev)  return false
    if (filterPlat !== 'all' && rb.platform  !== filterPlat) return false
    if (filterCat  !== 'all' && rb.category  !== filterCat)  return false
    return true
  }), [runbooks, search, filterSev, filterPlat, filterCat])

  const pendingApprovals = useMemo(() =>
    executions.filter(e => e.status === 'waiting_approval'), [executions])

  const {
    page: libraryPage, setPage: setLibraryPage, totalPages: libraryTotalPages, paginated: paginatedRunbooks,
  } = usePagination(filteredRunbooks, LIBRARY_PAGE_SIZE)

  const {
    page: execPage, setPage: setExecPage, totalPages: execTotalPages, paginated: paginatedExecutions,
  } = usePagination(executions, EXEC_PAGE_SIZE)

  const {
    page: approvalPage, setPage: setApprovalPage, totalPages: approvalTotalPages, paginated: paginatedApprovals,
  } = usePagination(pendingApprovals, APPROVAL_PAGE_SIZE)

  const tabs: Array<{ id: Tab; label: string; badge?: number }> = [
    { id: 'library',    label: 'Library',    badge: runbooks.length },
    { id: 'executions', label: 'Executions', badge: executions.filter(e => e.status === 'running').length || undefined },
    { id: 'approvals',  label: 'Approvals',  badge: pendingApprovals.length || undefined },
  ]

  const categories = useMemo(() => [...new Set(runbooks.map(r => r.category))].sort(), [runbooks])

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-black text-slate-900">Automated Runbooks</h1>
          <p className="text-xs text-slate-500 mt-0.5">Enterprise endpoint automation — execute, monitor, audit.</p>
        </div>
        <div className="flex items-center gap-2">
          {(viewerRole === 'Global Admin' || viewerRole === 'IT Admin') && (
            <>
              <button
                type="button"
                onClick={() => setShowImport(true)}
                className="inline-flex items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition">
                <Upload className="h-3.5 w-3.5" /> Import JSON
              </button>
              <button
                type="button"
                onClick={loadRunbooks}
                className="grid h-9 w-9 place-items-center rounded-2xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 transition">
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Stats */}
      {!loading && <StatsBar runbooks={runbooks} executions={executions} />}

      {/* Tabs */}
      <div className="flex gap-1 rounded-2xl border border-slate-200 bg-white p-1.5 w-fit">
        {tabs.map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition ${
              tab === t.id ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
            }`}
          >
            {t.label}
            {t.badge !== undefined && (
              <span className={`rounded-full px-1.5 py-0.5 text-[0.55rem] font-black leading-none ${
                tab === t.id ? 'bg-white/20 text-white' : 'bg-orange-500 text-white'
              }`}>{t.badge}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── Library tab ── */}
      {tab === 'library' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-48 max-w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search runbooks, tags…"
                className="h-9 w-full rounded-xl pl-9 pr-3 text-xs font-medium text-slate-700 water-input"
              />
            </div>
            {[
              { label: 'Severity', value: filterSev, setter: setFilterSev, opts: ['all', 'Critical', 'High', 'Medium', 'Low'] },
              { label: 'Platform', value: filterPlat, setter: setFilterPlat, opts: ['all', 'Windows', 'macOS', 'cross-platform'] },
              { label: 'Category', value: filterCat, setter: setFilterCat, opts: ['all', ...categories] },
            ].map(f => (
              <select
                key={f.label}
                value={f.value}
                onChange={e => f.setter(e.target.value)}
                className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 focus:outline-none focus:ring-2 focus:ring-orange-400"
              >
                {f.opts.map(o => (
                  <option key={o} value={o}>{o === 'all' ? `All ${f.label}` : o}</option>
                ))}
              </select>
            ))}
            {(search || filterSev !== 'all' || filterPlat !== 'all' || filterCat !== 'all') && (
              <button
                type="button"
                onClick={() => { setSearch(''); setFilterSev('all'); setFilterPlat('all'); setFilterCat('all') }}
                className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 transition">
                <X className="h-3 w-3" /> Clear
              </button>
            )}
            <span className="ml-auto text-xs text-slate-400">{filteredRunbooks.length} of {runbooks.length}</span>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-64 rounded-3xl bg-slate-100 animate-pulse" />
              ))}
            </div>
          ) : filteredRunbooks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
              <BookOpen className="h-10 w-10 text-slate-300" />
              <p className="text-sm text-slate-400 font-medium">No runbooks match your filters</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {paginatedRunbooks.map(rb => (
                  <RunbookCard
                    key={rb.id}
                    runbook={rb}
                    onExecute={setExecuteTarget}
                    onClone={handleClone}
                    onExport={handleExport}
                    viewerRole={viewerRole}
                  />
                ))}
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white">
                <Pagination page={libraryPage} totalPages={libraryTotalPages} onPageChange={setLibraryPage}
                  totalItems={filteredRunbooks.length} pageSize={LIBRARY_PAGE_SIZE} itemLabel="runbook" />
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Executions tab ── */}
      {tab === 'executions' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">{executions.length} executions recorded</p>
            <button onClick={loadExecutions} className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 transition">
              <RefreshCw className={`h-3 w-3 ${execLoading ? 'animate-spin' : ''}`} /> Refresh
            </button>
          </div>

          {executions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4 text-center rounded-3xl border-2 border-dashed border-slate-200">
              <Terminal className="h-10 w-10 text-slate-300" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-500">No executions yet</p>
                <p className="text-xs text-slate-400">Execute a runbook from the Library tab to see it here</p>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    <tr>
                      <th className="px-4 py-3 text-left">Runbook</th>
                      <th className="px-4 py-3 text-left">Device</th>
                      <th className="px-4 py-3 text-left">Mode</th>
                      <th className="px-4 py-3 text-left">Status</th>
                      <th className="px-4 py-3 text-left">Started</th>
                      <th className="px-4 py-3 text-left">Duration</th>
                      <th className="px-4 py-3 text-left">Triggered By</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {paginatedExecutions.map(exec => {
                      const canApprove = exec.status === 'waiting_approval' && (viewerRole === 'Global Admin' || viewerRole === 'IT Admin')
                      return (
                        <tr
                          key={exec.id}
                          className="hover:bg-slate-50 transition cursor-pointer"
                          onClick={() => setActiveExecId(exec.id)}
                        >
                          <td className="px-4 py-3 font-medium text-slate-800">
                            <div className="flex items-center gap-1.5">
                              {exec.status === 'running' && <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse flex-shrink-0" />}
                              <span className="truncate max-w-[220px]" title={exec.runbookName}>{exec.runbookName}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-slate-600 text-xs">{exec.deviceName}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[0.6rem] font-bold ${MODE_BADGE[exec.mode]}`}>
                              {MODE_TAG[exec.mode]}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[0.6rem] font-bold ${STATUS_BADGE[exec.status]}`}>
                              {STATUS_LABELS[exec.status]}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{fmtRelative(exec.startedAt)}</td>
                          <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{exec.durationMs ? fmtDuration(exec.durationMs) : '—'}</td>
                          <td className="px-4 py-3 text-xs text-slate-500">{exec.initiatedBy}</td>
                          <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-2">
                              {canApprove && (
                                <button
                                  type="button"
                                  onClick={() => handleApprove(exec.id, exec.runbookId)}
                                  className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-[0.65rem] font-bold text-white hover:bg-emerald-700 transition">
                                  <CheckCircle2 className="h-3 w-3" /> Approve
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => setActiveExecId(exec.id)}
                                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-[0.65rem] font-semibold text-slate-600 hover:bg-slate-50 transition">
                                <Eye className="h-3 w-3" /> View
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <Pagination page={execPage} totalPages={execTotalPages} onPageChange={setExecPage}
                totalItems={executions.length} pageSize={EXEC_PAGE_SIZE} itemLabel="execution" />
            </div>
          )}
        </div>
      )}

      {/* ── Approvals tab ── */}
      {tab === 'approvals' && (
        <div className="space-y-4">
          {viewerRole === 'Helpdesk' ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4 text-center rounded-3xl border-2 border-dashed border-slate-200">
              <Lock className="h-10 w-10 text-slate-300" />
              <p className="text-sm font-semibold text-slate-500">Approval management requires IT Admin or Global Admin role</p>
            </div>
          ) : pendingApprovals.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4 text-center rounded-3xl border-2 border-dashed border-slate-200">
              <CheckCircle2 className="h-10 w-10 text-emerald-300" />
              <div>
                <p className="text-sm font-semibold text-slate-500">No pending approvals</p>
                <p className="text-xs text-slate-400 mt-1">All runbooks requiring approval have been actioned</p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0" />
                <p className="text-xs font-semibold text-amber-800">
                  {pendingApprovals.length} execution{pendingApprovals.length !== 1 ? 's' : ''} pending your approval
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                      <tr>
                        <th className="px-4 py-3 text-left">Runbook</th>
                        <th className="px-4 py-3 text-left">Device</th>
                        <th className="px-4 py-3 text-left">Mode</th>
                        <th className="px-4 py-3 text-left">Requested</th>
                        <th className="px-4 py-3 text-left">Initiated By</th>
                        <th className="px-4 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {paginatedApprovals.map(exec => (
                        <tr
                          key={exec.id}
                          className="hover:bg-slate-50 transition cursor-pointer"
                          onClick={() => setActiveExecId(exec.id)}
                        >
                          <td className="px-4 py-3 font-medium text-slate-800">
                            <span className="truncate max-w-[220px] block" title={exec.runbookName}>{exec.runbookName}</span>
                          </td>
                          <td className="px-4 py-3 text-slate-600 text-xs">{exec.deviceName}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[0.6rem] font-bold ${MODE_BADGE[exec.mode]}`}>
                              {MODE_TAG[exec.mode]}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{fmtRelative(exec.startedAt)}</td>
                          <td className="px-4 py-3 text-xs text-slate-500">{exec.initiatedBy}</td>
                          <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-2">
                              {(viewerRole === 'Global Admin' || viewerRole === 'IT Admin') && (
                                <button
                                  type="button"
                                  onClick={() => handleApprove(exec.id, exec.runbookId)}
                                  className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-[0.65rem] font-bold text-white hover:bg-emerald-700 transition">
                                  <CheckCircle2 className="h-3 w-3" /> Approve
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => setActiveExecId(exec.id)}
                                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-[0.65rem] font-semibold text-slate-600 hover:bg-slate-50 transition">
                                <Eye className="h-3 w-3" /> View
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pagination page={approvalPage} totalPages={approvalTotalPages} onPageChange={setApprovalPage}
                  totalItems={pendingApprovals.length} pageSize={APPROVAL_PAGE_SIZE} itemLabel="approval" />
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Modals & Drawers ── */}
      {executeTarget && (
        <ExecuteModal
          runbook={executeTarget}
          onClose={() => setExecuteTarget(null)}
          onStart={handleExecute}
        />
      )}

      {showImport && (
        <ImportModal onClose={() => setShowImport(false)} onImport={handleImport} />
      )}

      {activeExecId && (
        <ExecutionDrawer
          executionId={activeExecId}
          onClose={() => { setActiveExecId(null); void loadExecutions() }}
          viewerRole={viewerRole}
          userName={userName}
        />
      )}
    </div>
  )
}

export default RunbooksPage
