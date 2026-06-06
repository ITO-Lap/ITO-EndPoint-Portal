import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Terminal,
  Play,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Search,
  Plus,
  Filter,
  ChevronRight,
  Loader2,
  Copy,
  Monitor,
  Apple,
  Globe,
  Code2,
  Shield,
  Tag,
  X,
  RefreshCw,
  History,
  BookOpen,
  Cpu,
  Pencil,
  Trash2,
  Files,
  MoreVertical,
} from 'lucide-react'
import { api } from '../api'
import type { Script, ScriptExecution, ExecuteScriptInput, CreateScriptInput } from '../api'

// ── OS + Type badge helpers ───────────────────────────────────────────────────

const OS_CFG: Record<string, { color: string; icon: React.ElementType }> = {
  Windows:         { color: 'bg-orange-100 text-orange-700',   icon: Monitor },
  macOS:           { color: 'bg-slate-100 text-slate-700', icon: Apple },
  Linux:           { color: 'bg-orange-100 text-orange-700', icon: Cpu },
  'Cross-platform':{ color: 'bg-lime-100 text-lime-700', icon: Globe },
}

const TYPE_CFG: Record<string, { color: string }> = {
  PowerShell: { color: 'bg-orange-50 text-orange-600 border border-orange-200' },
  Bash:       { color: 'bg-emerald-50 text-emerald-600 border border-emerald-200' },
  Batch:      { color: 'bg-amber-50 text-amber-600 border border-amber-200' },
  Python:     { color: 'bg-yellow-50 text-yellow-600 border border-yellow-200' },
}

const STATUS_CFG: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  queued:           { icon: Clock,         color: 'text-slate-500',  label: 'Queued' },
  running:          { icon: Loader2,       color: 'text-orange-500',    label: 'Running' },
  completed:        { icon: CheckCircle,   color: 'text-emerald-600',label: 'Completed' },
  failed:           { icon: XCircle,       color: 'text-red-600',    label: 'Failed' },
  timeout:          { icon: AlertTriangle, color: 'text-amber-600',  label: 'Timed Out' },
  cancelled:        { icon: XCircle,       color: 'text-slate-500',  label: 'Cancelled' },
  pending_approval: { icon: Shield,        color: 'text-lime-600', label: 'Awaiting Approval' },
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CFG[status] ?? STATUS_CFG.queued
  const Icon = cfg.icon
  const spin = status === 'running'
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${cfg.color}`}>
      <Icon className={`h-3.5 w-3.5 ${spin ? 'animate-spin' : ''}`} />
      {cfg.label}
    </span>
  )
}

// ── Script card (left list) ───────────────────────────────────────────────────

function ScriptCard({ script, selected, onClick, onEdit, onDelete, onDuplicate }: {
  script: Script
  selected: boolean
  onClick: () => void
  onEdit: (script: Script) => void
  onDelete: (script: Script) => void
  onDuplicate: (script: Script) => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const osCfg = OS_CFG[script.os] ?? OS_CFG['Cross-platform']
  const OsIcon = osCfg.icon

  useEffect(() => {
    if (!menuOpen) return
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  return (
    <div
      className={`relative border-b border-slate-100 group ${
        selected ? 'bg-orange-50 border-l-2 border-l-orange-500' : 'hover:bg-slate-50'
      } transition`}
    >
      <button
        type="button"
        onClick={onClick}
        className="w-full text-left px-4 py-3 pr-10"
      >
        <div className="flex items-start gap-3">
          <div className={`mt-0.5 rounded p-1.5 flex-shrink-0 ${osCfg.color}`}>
            <OsIcon className="h-3.5 w-3.5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-slate-800 truncate">{script.name}</span>
              {script.isDestructive && (
                <span className="flex-shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-red-100 text-red-600">DESTRUCTIVE</span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{script.description}</p>
            <div className="flex items-center gap-2 mt-1.5">
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${TYPE_CFG[script.type]?.color ?? ''}`}>
                {script.type}
              </span>
              <span className="text-[10px] text-slate-400">{script.useCount} runs</span>
            </div>
          </div>
        </div>
      </button>

      {/* Overflow menu trigger */}
      <div ref={menuRef} className="absolute top-3 right-2">
        <button
          type="button"
          onClick={e => { e.stopPropagation(); setMenuOpen(v => !v) }}
          className="p-1 rounded-md text-slate-300 hover:text-slate-600 hover:bg-slate-200 opacity-0 group-hover:opacity-100 transition"
          title="Actions"
        >
          <MoreVertical className="h-3.5 w-3.5" />
        </button>

        {menuOpen && (
          <div className="absolute right-0 mt-1 w-36 bg-white rounded-xl border border-slate-200 shadow-lg z-20 overflow-hidden py-1">
            <button
              type="button"
              onClick={() => { setMenuOpen(false); onEdit(script) }}
              className="flex items-center gap-2.5 w-full px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 transition"
            >
              <Pencil className="h-3.5 w-3.5 text-slate-400" />Edit
            </button>
            <button
              type="button"
              onClick={() => { setMenuOpen(false); onDuplicate(script) }}
              className="flex items-center gap-2.5 w-full px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 transition"
            >
              <Files className="h-3.5 w-3.5 text-slate-400" />Duplicate
            </button>
            <div className="my-1 border-t border-slate-100" />
            <button
              type="button"
              onClick={() => { setMenuOpen(false); onDelete(script) }}
              className="flex items-center gap-2.5 w-full px-3 py-2 text-xs text-red-600 hover:bg-red-50 transition"
            >
              <Trash2 className="h-3.5 w-3.5" />Delete
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Output viewer ─────────────────────────────────────────────────────────────

function OutputViewer({ execution }: { execution: ScriptExecution | null }) {
  const [copied, setCopied] = useState(false)

  if (!execution) return null

  const isActive = execution.status === 'running' || execution.status === 'queued'

  const handleCopy = () => {
    const text = execution.stdout ?? execution.stderr ?? ''
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="mt-4 rounded-xl border border-slate-200 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-800">
        <div className="flex items-center gap-2">
          <StatusBadge status={execution.status} />
          {execution.exitCode !== undefined && (
            <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${execution.exitCode === 0 ? 'bg-emerald-900 text-emerald-300' : 'bg-red-900 text-red-300'}`}>
              exit {execution.exitCode}
            </span>
          )}
          {execution.runtimeMs !== undefined && (
            <span className="text-xs text-slate-400 font-mono">{(execution.runtimeMs / 1000).toFixed(2)}s</span>
          )}
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition"
        >
          <Copy className="h-3.5 w-3.5" />
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <div className="bg-slate-900 px-4 py-3 min-h-[120px] max-h-[320px] overflow-y-auto">
        {isActive ? (
          <div className="flex items-center gap-2 text-slate-400 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            Executing on {execution.deviceName}…
          </div>
        ) : execution.stdout ? (
          <pre className="text-xs font-mono text-emerald-300 whitespace-pre-wrap leading-relaxed">{execution.stdout}</pre>
        ) : execution.stderr ? (
          <pre className="text-xs font-mono text-red-300 whitespace-pre-wrap leading-relaxed">{execution.stderr}</pre>
        ) : (
          <span className="text-slate-500 text-sm italic">No output captured.</span>
        )}
      </div>
      {execution.stderr && execution.stdout && (
        <div className="bg-slate-900 border-t border-slate-700 px-4 py-2">
          <p className="text-xs font-semibold text-red-400 mb-1">stderr</p>
          <pre className="text-xs font-mono text-red-300 whitespace-pre-wrap leading-relaxed">{execution.stderr}</pre>
        </div>
      )}
    </div>
  )
}

// ── Device picker ─────────────────────────────────────────────────────────────

interface PickedDevice { id: string; name: string; platform: string; managementSource: string }

function DevicePicker({ value, onChange }: {
  value: PickedDevice | null
  onChange: (d: PickedDevice | null) => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<import('../api').ApiDevice[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const search = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); return }
    setLoading(true)
    try {
      const devices = await api.fetchDevices(q)
      setResults(devices.slice(0, 8))
    } catch {
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => search(query), 300)
    return () => clearTimeout(t)
  }, [query, search])

  if (value) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-emerald-200 bg-emerald-50">
        <Monitor className="h-4 w-4 text-emerald-600 flex-shrink-0" />
        <span className="flex-1 text-sm font-medium text-emerald-800">{value.name}</span>
        <span className="text-xs text-emerald-600">{value.platform}</span>
        <button type="button" onClick={() => onChange(null)} className="ml-1 text-emerald-500 hover:text-emerald-700">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    )
  }

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
        <input
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          placeholder="Search device name or user…"
          className="w-full pl-8 pr-3 py-2 text-sm rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-400"
        />
        {loading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 animate-spin" />}
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full bg-white rounded-lg border border-slate-200 shadow-lg overflow-hidden">
          {results.map(d => (
            <button
              key={d.id}
              type="button"
              onMouseDown={() => {
                onChange({ id: d.id, name: d.deviceName, platform: d.platform, managementSource: d.managementSource })
                setQuery('')
                setOpen(false)
              }}
              className="w-full text-left px-3 py-2.5 hover:bg-orange-50 border-b border-slate-100 last:border-0 transition"
            >
              <div className="flex items-center gap-2">
                <Monitor className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                <span className="text-sm font-medium text-slate-800">{d.deviceName}</span>
                <span className="text-xs text-slate-500 ml-auto">{d.platform}</span>
              </div>
              <p className="text-xs text-slate-400 pl-5.5 mt-0.5 truncate">{d.user} · {d.managementSource}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Script detail + execution panel ──────────────────────────────────────────

function ScriptDetailPanel({ script, onExecuted, onEdit, onDelete, onDuplicate }: {
  script: Script
  onExecuted: (exec: ScriptExecution) => void
  onEdit: (script: Script) => void
  onDelete: (script: Script) => void
  onDuplicate: (script: Script) => void
}) {
  const [device, setDevice] = useState<PickedDevice | null>(null)
  const [params, setParams] = useState<Record<string, string>>(() => {
    const defaults: Record<string, string> = {}
    script.parameters.forEach(p => { if (p.defaultValue) defaults[p.name] = p.defaultValue })
    return defaults
  })
  const [executing, setExecuting] = useState(false)
  const [currentExec, setCurrentExec] = useState<ScriptExecution | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showContent, setShowContent] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Stop polling on unmount
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current) }, [])

  const startPolling = useCallback((execId: string) => {
    let attempts = 0
    pollRef.current = setInterval(async () => {
      attempts++
      try {
        const exec = await api.fetchExecution(execId)
        setCurrentExec(exec)
        if (['completed', 'failed', 'timeout', 'cancelled'].includes(exec.status) || attempts > 30) {
          if (pollRef.current) clearInterval(pollRef.current)
          setExecuting(false)
          onExecuted(exec)
        }
      } catch {
        if (attempts > 30) {
          if (pollRef.current) clearInterval(pollRef.current)
          setExecuting(false)
        }
      }
    }, 1000)
  }, [onExecuted])

  const handleExecute = async () => {
    if (!device) { setError('Select a target device first.'); return }
    const missing = script.parameters.filter(p => p.required && !params[p.name]?.trim())
    if (missing.length) { setError(`Required: ${missing.map(p => p.label).join(', ')}`); return }

    setError(null)
    setExecuting(true)
    setCurrentExec(null)

    try {
      const input: ExecuteScriptInput = {
        deviceId:         device.id,
        deviceName:       device.name,
        platform:         device.platform,
        managementSource: device.managementSource,
        executedBy:       'avinash.verma@zinnia.com',
        parameters:       Object.keys(params).length ? params : undefined,
      }
      const exec = await api.executeScript(script.id, input)
      setCurrentExec(exec)
      startPolling(exec.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Execution failed')
      setExecuting(false)
    }
  }

  const osCfg = OS_CFG[script.os] ?? OS_CFG['Cross-platform']
  const OsIcon = osCfg.icon

  const canRun = !executing && !!device

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Header */}
      <div className="px-5 pt-5 pb-4 border-b border-slate-100">
        <div className="flex items-start gap-3">
          <div className={`rounded-lg p-2.5 flex-shrink-0 ${osCfg.color}`}>
            <OsIcon className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-slate-800">{script.name}</h2>
            <p className="text-sm text-slate-500 mt-0.5">{script.description}</p>
          </div>
          {/* Management actions */}
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              type="button"
              onClick={() => onEdit(script)}
              title="Edit script"
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition"
            >
              <Pencil className="h-3.5 w-3.5" />Edit
            </button>
            <button
              type="button"
              onClick={() => onDuplicate(script)}
              title="Duplicate script"
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition"
            >
              <Files className="h-3.5 w-3.5" />Duplicate
            </button>
            <button
              type="button"
              onClick={() => onDelete(script)}
              title="Delete script"
              className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 transition"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Meta row */}
        <div className="flex flex-wrap gap-2 mt-3">
          <span className={`text-xs font-medium px-2 py-1 rounded-full ${TYPE_CFG[script.type]?.color ?? ''}`}>{script.type}</span>
          <span className={`text-xs font-medium px-2 py-1 rounded-full ${osCfg.color}`}>{script.os}</span>
          {script.isDestructive && (
            <span className="text-xs font-semibold px-2 py-1 rounded-full bg-red-100 text-red-600">Destructive</span>
          )}
          {script.requiresApproval && (
            <span className="text-xs font-semibold px-2 py-1 rounded-full bg-lime-100 text-lime-600">Approval required</span>
          )}
          <span className="text-xs font-medium px-2 py-1 rounded-full bg-slate-100 text-slate-600">v{script.version}</span>
          <span className="text-xs font-medium px-2 py-1 rounded-full bg-slate-100 text-slate-600">{script.useCount} runs</span>
          <span className="text-xs font-medium px-2 py-1 rounded-full bg-slate-100 text-slate-600">Timeout {script.timeoutSeconds}s</span>
        </div>

        {/* Tags */}
        {script.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {script.tags.map(tag => (
              <span key={tag} className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                <Tag className="h-2.5 w-2.5" />{tag}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 px-5 py-4 space-y-5">
        {/* Script content toggle */}
        <div>
          <button
            type="button"
            onClick={() => setShowContent(v => !v)}
            className="flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-800 transition"
          >
            <Code2 className="h-4 w-4" />
            {showContent ? 'Hide script' : 'View script'}
          </button>
          {showContent && (
            <div className="mt-2 rounded-xl border border-slate-200 overflow-hidden">
              <div className="bg-slate-800 px-4 py-2 text-xs text-slate-400 font-mono">{script.type} · {script.os}</div>
              <pre className="bg-slate-900 px-4 py-3 text-xs font-mono text-slate-200 whitespace-pre-wrap max-h-64 overflow-y-auto leading-relaxed">{script.content}</pre>
            </div>
          )}
        </div>

        {/* Parameters */}
        {script.parameters.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-3">Parameters</h3>
            <div className="space-y-3">
              {script.parameters.map(p => (
                <div key={p.name}>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    {p.label}{p.required && <span className="text-red-500 ml-0.5">*</span>}
                  </label>
                  {p.type === 'boolean' ? (
                    <select
                      value={params[p.name] ?? p.defaultValue ?? 'false'}
                      onChange={e => setParams(prev => ({ ...prev, [p.name]: e.target.value }))}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                    >
                      <option value="true">true</option>
                      <option value="false">false</option>
                    </select>
                  ) : p.type === 'select' && p.options ? (
                    <select
                      value={params[p.name] ?? p.defaultValue ?? ''}
                      onChange={e => setParams(prev => ({ ...prev, [p.name]: e.target.value }))}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                    >
                      <option value="">Select…</option>
                      {p.options.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : (
                    <input
                      type={p.type === 'number' ? 'number' : 'text'}
                      value={params[p.name] ?? p.defaultValue ?? ''}
                      onChange={e => setParams(prev => ({ ...prev, [p.name]: e.target.value }))}
                      placeholder={p.placeholder ?? ''}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500 placeholder:text-slate-400"
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Device picker */}
        <div>
          <h3 className="text-sm font-semibold text-slate-700 mb-2">Target Device</h3>
          <DevicePicker value={device} onChange={setDevice} />
        </div>

        {/* Destructive warning */}
        {script.isDestructive && (
          <div className="flex items-start gap-2.5 rounded-lg bg-red-50 border border-red-200 px-4 py-3">
            <AlertTriangle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-red-700">
              This script makes changes that cannot be automatically reversed. Confirm the target device before executing.
            </p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-2.5">
            <XCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Execute button */}
        <button
          type="button"
          onClick={handleExecute}
          disabled={!canRun}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold bg-orange-600 text-white hover:bg-orange-700 active:bg-orange-800 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {executing ? (
            <><Loader2 className="h-4 w-4 animate-spin" />Executing…</>
          ) : (
            <><Play className="h-4 w-4" />Run on {device?.name ?? 'Device'}</>
          )}
        </button>

        {/* Output */}
        <OutputViewer execution={currentExec} />
      </div>
    </div>
  )
}

// ── History table ─────────────────────────────────────────────────────────────

function HistoryTab() {
  // loadedFor tracks which filter value was last fetched — used to derive loading state
  // without ever calling setState synchronously inside an effect body.
  const [loadedFor, setLoadedFor] = useState<string | null>(null)
  const [executions, setExecutions] = useState<ScriptExecution[]>([])
  const [statusFilter, setStatusFilter] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  // loading is derived: true while the current filter hasn't finished fetching
  const loading = loadedFor !== `${statusFilter}:${refreshKey}`

  useEffect(() => {
    const key = `${statusFilter}:${refreshKey}`
    let cancelled = false
    api.fetchExecutions({ limit: 100, status: statusFilter || undefined })
      .then(data  => { if (!cancelled) { setExecutions(data);  setLoadedFor(key) } })
      .catch(()   => { if (!cancelled) { setExecutions([]);    setLoadedFor(key) } })
    return () => { cancelled = true }
  }, [statusFilter, refreshKey])

  const statuses = ['', 'completed', 'failed', 'running', 'queued', 'timeout', 'cancelled', 'pending_approval']

  function fmt(iso: string) {
    return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="flex flex-col h-full">
      {/* Filter bar */}
      <div className="flex items-center gap-3 p-4 border-b border-slate-100">
        <Filter className="h-4 w-4 text-slate-400 flex-shrink-0" />
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500"
        >
          {statuses.map(s => (
            <option key={s} value={s}>{s ? STATUS_CFG[s]?.label ?? s : 'All statuses'}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setRefreshKey(k => k + 1)}
          className={`ml-auto flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium text-slate-500 transition ${loading ? 'border-orange-300 bg-orange-50 animate-pulse' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-orange-500' : ''}`} />Refresh
        </button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
        ) : executions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-slate-400">
            <History className="h-8 w-8 mb-2 opacity-40" />
            <p className="text-sm">No executions found</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {executions.map(exec => {
              const isOpen = expanded === exec.id
              return (
                <div key={exec.id}>
                  <button
                    type="button"
                    onClick={() => setExpanded(isOpen ? null : exec.id)}
                    className="w-full text-left px-4 py-3 hover:bg-slate-50 transition grid grid-cols-[1fr_140px_100px_90px] gap-4 items-center"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-800 truncate">{exec.scriptName}</p>
                      <p className="text-xs text-slate-500 truncate">on {exec.deviceName} · {exec.managementSource}</p>
                    </div>
                    <span className="text-xs text-slate-500">{fmt(exec.startedAt)}</span>
                    <StatusBadge status={exec.status} />
                    <span className="text-xs text-slate-500 text-right">
                      {exec.runtimeMs !== undefined ? `${(exec.runtimeMs / 1000).toFixed(1)}s` : '—'}
                    </span>
                  </button>
                  {isOpen && (
                    <div className="px-4 pb-4 bg-slate-50">
                      <div className="grid grid-cols-2 gap-3 mb-3 text-xs text-slate-600">
                        <div><span className="font-medium">Executed by:</span> {exec.executedBy}</div>
                        {exec.approvedBy && <div><span className="font-medium">Approved by:</span> {exec.approvedBy}</div>}
                        {exec.exitCode !== undefined && <div><span className="font-medium">Exit code:</span> {exec.exitCode}</div>}
                        {exec.completedAt && <div><span className="font-medium">Completed:</span> {fmt(exec.completedAt)}</div>}
                        {exec.parameters && Object.keys(exec.parameters).length > 0 && (
                          <div className="col-span-2">
                            <span className="font-medium">Parameters:</span>{' '}
                            {Object.entries(exec.parameters).map(([k, v]) => `${k}=${v}`).join(', ')}
                          </div>
                        )}
                      </div>
                      {exec.stdout && (
                        <pre className="bg-slate-900 rounded-lg px-4 py-3 text-xs font-mono text-emerald-300 whitespace-pre-wrap max-h-48 overflow-y-auto leading-relaxed">{exec.stdout}</pre>
                      )}
                      {exec.stderr && (
                        <pre className="mt-2 bg-slate-900 rounded-lg px-4 py-3 text-xs font-mono text-red-300 whitespace-pre-wrap max-h-32 overflow-y-auto leading-relaxed">{exec.stderr}</pre>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Script Form Modal (create + edit) ────────────────────────────────────────

function ScriptFormModal({ onClose, onSaved, editScript, forceCreate }: {
  onClose: () => void
  onSaved: (s: Script, mode: 'create' | 'edit') => void
  editScript?: Script
  forceCreate?: boolean
}) {
  const isEdit = !!editScript && !forceCreate
  const [form, setForm] = useState<Partial<CreateScriptInput>>(() => editScript ? {
    name:             editScript.name,
    description:      editScript.description,
    os:               editScript.os,
    type:             editScript.type,
    content:          editScript.content,
    version:          forceCreate ? 1 : editScript.version,
    tags:             editScript.tags,
    createdBy:        editScript.createdBy,
    isDestructive:    editScript.isDestructive,
    requiresApproval: editScript.requiresApproval,
    minRole:          editScript.minRole,
    parameters:       editScript.parameters,
    timeoutSeconds:   editScript.timeoutSeconds,
  } : {
    os: 'Windows',
    type: 'PowerShell',
    isDestructive: false,
    requiresApproval: false,
    minRole: 'Helpdesk',
    timeoutSeconds: 60,
    tags: [],
    parameters: [],
    createdBy: 'avinash.verma@zinnia.com',
  })
  const [tagInput, setTagInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function set<K extends keyof CreateScriptInput>(key: K, value: CreateScriptInput[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  const addTag = () => {
    const t = tagInput.trim()
    if (!t) return
    set('tags', [...(form.tags ?? []), t])
    setTagInput('')
  }

  const removeTag = (t: string) => set('tags', (form.tags ?? []).filter(x => x !== t))

  const handleSave = async () => {
    if (!form.name?.trim()) { setError('Name is required.'); return }
    if (!form.description?.trim()) { setError('Description is required.'); return }
    if (!form.content?.trim()) { setError('Script content is required.'); return }
    setSaving(true)
    setError(null)
    try {
      if (isEdit && editScript) {
        const updated = await api.updateScript(editScript.id, {
          ...form,
          version: editScript.version + 1,
        })
        onSaved(updated, 'edit')
      } else {
        const script = await api.createScript(form as CreateScriptInput)
        onSaved(script, 'create')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save script')
    } finally {
      setSaving(false)
    }
  }

  const placeholders: Record<string, string> = {
    PowerShell: '# PowerShell script\nGet-ComputerInfo | Select-Object CsName, WindowsVersion',
    Bash:       '#!/bin/bash\n# Bash script',
    Batch:      '@echo off\necho Script content here',
    Python:     '#!/usr/bin/env python3\n# Python script',
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            {isEdit ? <Pencil className="h-5 w-5 text-orange-600" /> : <Terminal className="h-5 w-5 text-orange-600" />}
            <h2 className="text-base font-semibold text-slate-800">
              {isEdit ? `Edit — ${editScript!.name}` : 'New Script'}
            </h2>
            {isEdit && (
              <span className="text-xs text-slate-400 font-mono bg-slate-100 px-2 py-0.5 rounded">
                v{editScript!.version} → v{editScript!.version + 1}
              </span>
            )}
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 transition">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-600 mb-1">Name<span className="text-red-500 ml-0.5">*</span></label>
              <input
                value={form.name ?? ''}
                onChange={e => set('name', e.target.value)}
                placeholder="e.g. Check Antivirus Status"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500 placeholder:text-slate-400"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-600 mb-1">Description<span className="text-red-500 ml-0.5">*</span></label>
              <input
                value={form.description ?? ''}
                onChange={e => set('description', e.target.value)}
                placeholder="Brief description of what this script does"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500 placeholder:text-slate-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">OS</label>
              <select
                value={form.os}
                onChange={e => set('os', e.target.value as Script['os'])}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500"
              >
                <option>Windows</option>
                <option>macOS</option>
                <option>Linux</option>
                <option>Cross-platform</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Type</label>
              <select
                value={form.type}
                onChange={e => set('type', e.target.value as Script['type'])}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500"
              >
                <option>PowerShell</option>
                <option>Bash</option>
                <option>Batch</option>
                <option>Python</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Minimum Role</label>
              <select
                value={form.minRole}
                onChange={e => set('minRole', e.target.value as Script['minRole'])}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500"
              >
                <option>Helpdesk</option>
                <option>IT Admin</option>
                <option>Global Admin</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Timeout (seconds)</label>
              <input
                type="number"
                min={5}
                max={3600}
                value={form.timeoutSeconds ?? 60}
                onChange={e => set('timeoutSeconds', Number(e.target.value))}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Tags</label>
            <div className="flex gap-2">
              <input
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag() } }}
                placeholder="Add tag and press Enter"
                className="flex-1 px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500 placeholder:text-slate-400"
              />
              <button type="button" onClick={addTag}
                className="px-3 py-2 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 text-sm transition">
                Add
              </button>
            </div>
            {(form.tags ?? []).length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {(form.tags ?? []).map(t => (
                  <span key={t} className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">
                    {t}
                    <button type="button" onClick={() => removeTag(t)} className="text-slate-400 hover:text-slate-600">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Flags */}
          <div className="flex gap-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.isDestructive ?? false}
                onChange={e => set('isDestructive', e.target.checked)}
                className="rounded border-slate-300 text-orange-600 focus:ring-orange-500" />
              <span className="text-sm text-slate-700">Destructive</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.requiresApproval ?? false}
                onChange={e => set('requiresApproval', e.target.checked)}
                className="rounded border-slate-300 text-orange-600 focus:ring-orange-500" />
              <span className="text-sm text-slate-700">Requires approval</span>
            </label>
          </div>

          {/* Script content */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Script Content<span className="text-red-500 ml-0.5">*</span>
            </label>
            <textarea
              value={form.content ?? ''}
              onChange={e => set('content', e.target.value)}
              rows={10}
              placeholder={placeholders[form.type ?? 'PowerShell'] ?? '# Script content'}
              spellCheck={false}
              className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-orange-500 placeholder:text-slate-400 resize-y"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-2.5">
              <XCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3">
          <button type="button" onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 transition">
            Cancel
          </button>
          <button type="button" onClick={handleSave} disabled={saving}
            className="flex items-center gap-2 px-5 py-2 text-sm font-semibold rounded-xl bg-orange-600 text-white hover:bg-orange-700 transition disabled:opacity-50">
            {saving
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : isEdit ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />
            }
            {isEdit ? 'Save Changes' : 'Save Script'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function RemoteScriptsPage() {
  const [tab, setTab] = useState<'library' | 'history'>('library')
  const [scripts, setScripts] = useState<Script[]>([])
  const [loading, setLoading] = useState(true)
  // Store only the ID — derive the full Script object from the scripts array.
  // This avoids the infinite loop: selected (Script) in loadScripts deps →
  // setSelected inside loadScripts → deps change → effect re-fires → loop.
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = scripts.find(s => s.id === selectedId) ?? null
  const [search, setSearch] = useState('')
  const [osFilter, setOsFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [showNewModal, setShowNewModal] = useState(false)
  const [editScript, setEditScript] = useState<Script | null>(null)
  const [duplicateScript, setDuplicateScript] = useState<Script | null>(null)
  const [recentExec, setRecentExec] = useState<ScriptExecution | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<Script | null>(null)
  const [deleting, setDeleting] = useState(false)

  const loadScripts = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.fetchScripts({
        q: search || undefined,
        os: osFilter || undefined,
        type: typeFilter || undefined,
      })
      setScripts(data)
    } catch {
      setScripts([])
    } finally {
      setLoading(false)
    }
  }, [search, osFilter, typeFilter])

  useEffect(() => {
    const t = setTimeout(loadScripts, search ? 250 : 0)
    return () => clearTimeout(t)
  }, [loadScripts, search])

  const handleSaved = (s: Script, mode: 'create' | 'edit') => {
    if (mode === 'create') {
      setScripts(prev => [s, ...prev])
      setSelectedId(s.id)
    } else {
      setScripts(prev => prev.map(x => x.id === s.id ? s : x))
    }
    setShowNewModal(false)
    setEditScript(null)
    setDuplicateScript(null)
  }

  const handleEdit = (script: Script) => {
    setEditScript(script)
  }

  const handleDuplicate = (script: Script) => {
    setDuplicateScript({ ...script, name: `${script.name} (Copy)`, id: '' })
  }

  const handleDeleteConfirmed = async () => {
    if (!deleteConfirm) return
    setDeleting(true)
    try {
      await api.deleteScript(deleteConfirm.id)
      setScripts(prev => prev.filter(s => s.id !== deleteConfirm.id))
      if (selectedId === deleteConfirm.id) setSelectedId(null)
    } finally {
      setDeleting(false)
      setDeleteConfirm(null)
    }
  }

  const handleExecuted = (exec: ScriptExecution) => {
    setRecentExec(exec)
    setScripts(prev => prev.map(s => s.id === exec.scriptId ? { ...s, useCount: s.useCount + 1 } : s))
  }

  const osList = ['', 'Windows', 'macOS', 'Linux', 'Cross-platform']
  const typeList = ['', 'PowerShell', 'Bash', 'Batch', 'Python']

  return (
    <div className="flex flex-col h-full">
      {/* Page header */}
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="rounded-lg bg-orange-100 p-2">
              <Terminal className="h-5 w-5 text-orange-700" />
            </div>
            <h1 className="text-xl font-semibold text-slate-800">Remote Script Execution</h1>
          </div>
          <p className="text-sm text-slate-500 ml-11">
            Run scripts on managed devices via Intune, Kandji, or ManageEngine.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowNewModal(true)}
          className="flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-orange-600 text-white hover:bg-orange-700 transition"
        >
          <Plus className="h-4 w-4" />New Script
        </button>
      </div>

      {/* Recent execution toast-style banner */}
      {recentExec && (
        <div className={`mb-4 flex items-center gap-3 px-4 py-3 rounded-xl border ${
          recentExec.status === 'completed' ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'
        }`}>
          {recentExec.status === 'completed'
            ? <CheckCircle className="h-4 w-4 text-emerald-600 flex-shrink-0" />
            : <XCircle className="h-4 w-4 text-red-500 flex-shrink-0" />}
          <p className="text-sm font-medium text-slate-700 flex-1">
            <span className="font-semibold">{recentExec.scriptName}</span> completed on{' '}
            <span className="font-semibold">{recentExec.deviceName}</span>
            {recentExec.exitCode !== undefined && ` with exit code ${recentExec.exitCode}`}.
          </p>
          <button type="button" onClick={() => setRecentExec(null)} className="text-slate-400 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1 mb-5 w-fit">
        <button
          type="button"
          onClick={() => setTab('library')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
            tab === 'library' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <BookOpen className="h-4 w-4" />Script Library
        </button>
        <button
          type="button"
          onClick={() => setTab('history')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
            tab === 'history' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <History className="h-4 w-4" />Execution History
        </button>
      </div>

      {tab === 'library' ? (
        <div className="flex-1 flex gap-5 min-h-0 overflow-hidden">
          {/* Left: script list */}
          <div className="w-80 flex-shrink-0 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
            {/* Search + filters */}
            <div className="p-3 border-b border-slate-100 space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search scripts…"
                  className="w-full pl-8 pr-3 py-2 text-sm rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-400"
                />
              </div>
              <div className="flex gap-2">
                <select
                  value={osFilter}
                  onChange={e => setOsFilter(e.target.value)}
                  className="flex-1 px-2 py-1.5 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-1 focus:ring-orange-500 text-slate-600"
                >
                  {osList.map(o => <option key={o} value={o}>{o || 'All OS'}</option>)}
                </select>
                <select
                  value={typeFilter}
                  onChange={e => setTypeFilter(e.target.value)}
                  className="flex-1 px-2 py-1.5 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-1 focus:ring-orange-500 text-slate-600"
                >
                  {typeList.map(t => <option key={t} value={t}>{t || 'All types'}</option>)}
                </select>
              </div>
            </div>

            {/* Script list */}
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center h-40">
                  <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                </div>
              ) : scripts.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 text-slate-400">
                  <Terminal className="h-8 w-8 mb-2 opacity-40" />
                  <p className="text-sm">No scripts found</p>
                </div>
              ) : (
                scripts.map(s => (
                  <ScriptCard
                    key={s.id}
                    script={s}
                    selected={selectedId === s.id}
                    onClick={() => setSelectedId(s.id)}
                    onEdit={handleEdit}
                    onDelete={s => setDeleteConfirm(s)}
                    onDuplicate={handleDuplicate}
                  />
                ))
              )}
            </div>

            {/* Footer count */}
            <div className="px-4 py-2.5 border-t border-slate-100 text-xs text-slate-400">
              {scripts.length} script{scripts.length !== 1 ? 's' : ''}
            </div>
          </div>

          {/* Right: detail + execution */}
          <div className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            {selected ? (
              <ScriptDetailPanel
                key={selected.id}
                script={selected}
                onExecuted={handleExecuted}
                onEdit={handleEdit}
                onDelete={s => setDeleteConfirm(s)}
                onDuplicate={handleDuplicate}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-3">
                <div className="rounded-full bg-slate-100 p-5">
                  <Terminal className="h-8 w-8 text-slate-300" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-slate-500">Select a script</p>
                  <p className="text-xs text-slate-400 mt-1">Choose from the library to view details and run on a device</p>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <HistoryTab />
        </div>
      )}

      {/* Create modal */}
      {showNewModal && (
        <ScriptFormModal
          onClose={() => setShowNewModal(false)}
          onSaved={handleSaved}
        />
      )}

      {/* Edit modal */}
      {editScript && (
        <ScriptFormModal
          editScript={editScript}
          onClose={() => setEditScript(null)}
          onSaved={handleSaved}
        />
      )}

      {/* Duplicate modal (pre-filled create) */}
      {duplicateScript && (
        <ScriptFormModal
          editScript={duplicateScript}
          forceCreate
          onClose={() => setDuplicateScript(null)}
          onSaved={handleSaved}
        />
      )}

      {/* Delete confirm dialog */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-start gap-3 mb-4">
              <div className="rounded-full bg-red-100 p-2 flex-shrink-0">
                <Trash2 className="h-4 w-4 text-red-600" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-800 mb-1">Delete script?</h3>
                <p className="text-sm text-slate-500">
                  <span className="font-medium text-slate-700">{deleteConfirm.name}</span> will be permanently
                  removed from the library. This cannot be undone.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setDeleteConfirm(null)} disabled={deleting}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 transition disabled:opacity-50">
                Cancel
              </button>
              <button type="button" onClick={handleDeleteConfirmed} disabled={deleting}
                className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl bg-red-600 text-white hover:bg-red-700 transition disabled:opacity-50">
                {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
