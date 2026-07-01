import { useState, useEffect, useRef, useCallback } from 'react'
import {
  X, RefreshCw, Download, Sparkles, Terminal, Filter,
  ChevronDown, AlertTriangle, CheckCircle2, XCircle, Info,
  Shield, Cpu, Wifi, Package, Apple, BookOpen, User,
  TrendingUp, AlertCircle, FileText, Copy, Check,
} from 'lucide-react'
import { macLogsApi } from '../../api'
import type { MacLogEntry, MacLogResult, MacLogAnalysis, ApiDevice } from '../../api'
import { useToast } from '../ui/ToastProvider'

// ── Constants ─────────────────────────────────────────────────────────────────

type LogLevel = MacLogEntry['level']
type EventType = MacLogEntry['eventType']
type DrawerTab = 'raw' | 'analysis'

const LEVEL_COLORS: Record<LogLevel, string> = {
  fault:   'text-red-400',
  error:   'text-red-400',
  info:    'text-emerald-400',
  debug:   'text-slate-500',
  default: 'text-slate-400',
}

const LEVEL_BG: Record<LogLevel, string> = {
  fault:   'bg-red-500/15 border-red-500/25 text-red-400',
  error:   'bg-red-500/10 border-red-400/20 text-red-400',
  info:    'bg-emerald-500/10 border-emerald-400/20 text-emerald-400',
  debug:   'bg-slate-700/40 border-slate-600/20 text-slate-500',
  default: 'bg-slate-800/30 border-slate-700/20 text-slate-500',
}

const EVENT_ICONS: Record<EventType, React.ElementType> = {
  mdm:      Shield,
  security: Shield,
  system:   Cpu,
  app:      Package,
  network:  Wifi,
  kandji:   Apple,
  user:     User,
}

const EVENT_COLORS: Record<EventType, string> = {
  mdm:      'text-blue-400',
  security: 'text-violet-400',
  system:   'text-slate-400',
  app:      'text-orange-400',
  network:  'text-cyan-400',
  kandji:   'text-emerald-400',
  user:     'text-amber-400',
}

const EVENT_FILTER_LABELS: Record<EventType, string> = {
  mdm:      'MDM',
  security: 'Security',
  system:   'System',
  app:      'Apps',
  network:  'Network',
  kandji:   'Kandji',
  user:     'User',
}

const HEALTH_CONFIG = {
  healthy:  { color: 'text-emerald-400', bg: 'bg-emerald-500/15 border-emerald-500/25', icon: CheckCircle2, label: 'Healthy' },
  warning:  { color: 'text-amber-400',   bg: 'bg-amber-500/15 border-amber-500/25',   icon: AlertTriangle, label: 'Warning' },
  critical: { color: 'text-red-400',     bg: 'bg-red-500/15 border-red-500/25',       icon: XCircle,       label: 'Critical' },
}

const SEVERITY_CONFIG = {
  critical: { bg: 'bg-red-500/20 border-red-500/30',    text: 'text-red-400',    dot: 'bg-red-500' },
  high:     { bg: 'bg-orange-500/20 border-orange-500/30', text: 'text-orange-400', dot: 'bg-orange-500' },
  medium:   { bg: 'bg-amber-500/20 border-amber-500/30',  text: 'text-amber-400',  dot: 'bg-amber-500' },
  low:      { bg: 'bg-slate-700/40 border-slate-600/20',  text: 'text-slate-400',  dot: 'bg-slate-500' },
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTs(iso: string): string {
  const d = new Date(iso)
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
}

function logLineText(l: MacLogEntry): string {
  return `${l.timestamp}  ${l.level.toUpperCase().padEnd(7)}  ${l.subsystem.padEnd(40)}  ${l.category.padEnd(20)}  ${l.process}[${l.pid}]: ${l.message}`
}

// ── Log Row ───────────────────────────────────────────────────────────────────

function LogRow({ entry, highlight }: { entry: MacLogEntry; highlight: string }) {
  const [expanded, setExpanded] = useState(false)
  const Icon = EVENT_ICONS[entry.eventType]
  const isAlert = entry.level === 'error' || entry.level === 'fault'

  const msgWithHighlight = highlight
    ? entry.message.replace(new RegExp(`(${highlight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'),
        '<mark class="bg-yellow-400/30 text-yellow-200 rounded px-0.5">$1</mark>')
    : entry.message

  return (
    <div
      className={`group border-b border-slate-800/60 cursor-pointer transition-colors hover:bg-slate-800/40 ${isAlert ? 'bg-red-950/20' : ''}`}
      onClick={() => setExpanded(e => !e)}
    >
      <div className="flex items-start gap-2 px-3 py-2 min-w-0">
        {/* Level */}
        <span className={`flex-shrink-0 w-12 text-[0.6rem] font-black uppercase tracking-wider text-right ${LEVEL_COLORS[entry.level]}`}>
          {entry.level}
        </span>

        {/* Timestamp */}
        <span className="flex-shrink-0 text-[0.6rem] font-mono text-slate-600 w-[120px]">
          {entry.timestamp.split(' ')[1]?.split('.')[0] ?? ''}
        </span>

        {/* Event type icon */}
        <Icon className={`flex-shrink-0 h-3 w-3 mt-0.5 ${EVENT_COLORS[entry.eventType]}`} />

        {/* Subsystem */}
        <span className="flex-shrink-0 text-[0.58rem] font-mono text-slate-600 w-[180px] truncate hidden lg:block">
          {entry.subsystem}
        </span>

        {/* Process */}
        <span className="flex-shrink-0 text-[0.58rem] font-mono text-slate-500 w-[90px] truncate hidden xl:block">
          {entry.process}[{entry.pid}]
        </span>

        {/* Message */}
        <span
          className={`flex-1 min-w-0 text-[0.68rem] font-mono leading-relaxed truncate ${
            isAlert ? 'text-red-300' : 'text-slate-300'
          }`}
          dangerouslySetInnerHTML={{ __html: msgWithHighlight }}
        />

        <ChevronDown className={`flex-shrink-0 h-3 w-3 text-slate-600 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-4 pb-3 pt-1 border-t border-slate-800/40 bg-slate-900/30">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-2">
            {[
              { label: 'Subsystem',  value: entry.subsystem },
              { label: 'Category',   value: entry.category },
              { label: 'Process',    value: `${entry.process}[${entry.pid}]` },
              { label: 'Event Type', value: entry.eventType },
              { label: 'Level',      value: entry.level },
              { label: 'Timestamp',  value: entry.timestamp },
            ].map(f => (
              <div key={f.label}>
                <p className="text-[0.55rem] font-bold uppercase tracking-wider text-slate-600">{f.label}</p>
                <p className="text-[0.65rem] font-mono text-slate-400 mt-0.5 break-all">{f.value}</p>
              </div>
            ))}
          </div>
          <div>
            <p className="text-[0.55rem] font-bold uppercase tracking-wider text-slate-600 mb-0.5">Full Message</p>
            <p className="text-[0.65rem] font-mono text-slate-300 leading-relaxed break-words">{entry.message}</p>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Analysis Panel ────────────────────────────────────────────────────────────

function AnalysisPanel({ analysis, loading }: { analysis: MacLogAnalysis | null; loading: boolean }) {
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="relative">
          <div className="h-12 w-12 rounded-full border-2 border-violet-500/30 animate-spin border-t-violet-500" />
          <Sparkles className="absolute inset-0 m-auto h-5 w-5 text-violet-400" />
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold text-slate-300">AI Analyzing Logs…</p>
          <p className="text-xs text-slate-500 mt-1">Reading {100} log entries · Detecting patterns</p>
        </div>
      </div>
    )
  }

  if (!analysis) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Sparkles className="h-10 w-10 text-slate-600" />
        <p className="text-sm font-semibold text-slate-400">No Analysis Yet</p>
        <p className="text-xs text-slate-600 text-center max-w-xs">
          Load device logs first, then click <strong className="text-slate-400">Analyze with AI</strong> to get a human-readable health report.
        </p>
      </div>
    )
  }

  const health = HEALTH_CONFIG[analysis.healthStatus]
  const HealthIcon = health.icon

  return (
    <div className="p-4 space-y-4 overflow-y-auto h-full">
      {/* Header: health status */}
      <div className={`rounded-xl border px-4 py-3 ${health.bg}`}>
        <div className="flex items-center gap-2 mb-1">
          <HealthIcon className={`h-4 w-4 ${health.color}`} />
          <span className={`text-sm font-bold ${health.color}`}>
            {health.label} — {analysis.aiPowered ? 'AI Analysis' : 'Rule-Based Analysis'}
          </span>
          {analysis.aiPowered && (
            <span className="ml-auto rounded-full bg-violet-500/20 border border-violet-500/30 px-2 py-0.5 text-[0.6rem] font-bold text-violet-400">
              GPT-4o
            </span>
          )}
        </div>
        <p className="text-xs text-slate-300 leading-relaxed">{analysis.executiveSummary}</p>
      </div>

      {/* Event breakdown */}
      <div className="rounded-xl border border-slate-700/60 bg-slate-800/30 overflow-hidden">
        <div className="px-4 py-2.5 border-b border-slate-700/50">
          <p className="text-[0.65rem] font-bold uppercase tracking-wider text-slate-500">Log Distribution — {analysis.analyzedLogCount} entries analyzed</p>
        </div>
        <div className="grid grid-cols-4 divide-x divide-slate-700/50">
          {Object.entries(analysis.eventBreakdown).map(([type, count]) => {
            const Icon = EVENT_ICONS[type as EventType] ?? Info
            return (
              <div key={type} className="px-3 py-2 text-center">
                <Icon className={`h-3.5 w-3.5 mx-auto mb-1 ${EVENT_COLORS[type as EventType] ?? 'text-slate-500'}`} />
                <p className="text-sm font-black text-slate-200">{count}</p>
                <p className="text-[0.55rem] text-slate-600 uppercase tracking-wider">{type}</p>
              </div>
            )
          })}
        </div>
      </div>

      {/* Issues */}
      {analysis.issues.length > 0 && (
        <div className="space-y-2">
          <p className="text-[0.65rem] font-bold uppercase tracking-wider text-slate-500 px-1">
            Issues Detected ({analysis.issues.length})
          </p>
          {analysis.issues.map((issue, i) => {
            const sev = SEVERITY_CONFIG[issue.severity]
            return (
              <div key={i} className={`rounded-xl border px-4 py-3 ${sev.bg}`}>
                <div className="flex items-start gap-2">
                  <span className={`mt-1.5 h-2 w-2 rounded-full flex-shrink-0 ${sev.dot}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className={`text-xs font-bold ${sev.text}`}>{issue.title}</p>
                      <span className={`rounded-full px-1.5 py-0.5 text-[0.55rem] font-black uppercase ${sev.bg} ${sev.text} border ${sev.bg}`}>
                        {issue.severity}
                      </span>
                    </div>
                    <p className="text-[0.68rem] text-slate-400 leading-relaxed">{issue.description}</p>
                    <div className="mt-2 rounded-lg bg-slate-900/50 border border-slate-700/50 px-3 py-2">
                      <p className="text-[0.6rem] font-bold text-slate-500 mb-0.5">Recommendation</p>
                      <p className="text-[0.65rem] text-slate-300 leading-relaxed">{issue.recommendation}</p>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Recommendations */}
      {analysis.recommendations.length > 0 && (
        <div className="rounded-xl border border-slate-700/60 bg-slate-800/30 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-700/50">
            <p className="text-[0.65rem] font-bold uppercase tracking-wider text-slate-500">
              Action Items
            </p>
          </div>
          <div className="px-4 py-3 space-y-2">
            {analysis.recommendations.map((rec, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="flex-shrink-0 h-4 w-4 rounded-full bg-orange-500/20 border border-orange-500/30 flex items-center justify-center">
                  <span className="text-[0.55rem] font-black text-orange-400">{i + 1}</span>
                </span>
                <p className="text-[0.68rem] text-slate-300 leading-relaxed">{rec}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Key events */}
      {analysis.keyEvents.length > 0 && (
        <div className="rounded-xl border border-slate-700/60 bg-slate-900/50 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-700/50">
            <p className="text-[0.65rem] font-bold uppercase tracking-wider text-slate-500">Key Log Events</p>
          </div>
          <div className="p-3 space-y-1.5">
            {analysis.keyEvents.map((ev, i) => (
              <p key={i} className="font-mono text-[0.6rem] text-amber-400 leading-relaxed break-all">{ev}</p>
            ))}
          </div>
        </div>
      )}

      <p className="text-center text-[0.6rem] text-slate-600">
        Analysis generated {new Date(analysis.analyzedAt).toLocaleString()} ·{' '}
        {analysis.aiPowered ? 'Powered by OpenAI GPT-4o-mini' : 'Rule-based analysis (OpenAI not configured)'}
      </p>
    </div>
  )
}

// ── Main Drawer ───────────────────────────────────────────────────────────────

interface DeviceLogDrawerProps {
  device: ApiDevice
  onClose: () => void
}

export function DeviceLogDrawer({ device, onClose }: DeviceLogDrawerProps) {
  const [tab, setTab]                   = useState<DrawerTab>('raw')
  const [logResult, setLogResult]       = useState<MacLogResult | null>(null)
  const [analysis, setAnalysis]         = useState<MacLogAnalysis | null>(null)
  const [loading, setLoading]           = useState(false)
  const [analyzing, setAnalyzing]       = useState(false)
  const [search, setSearch]             = useState('')
  const [levelFilter, setLevelFilter]   = useState<LogLevel | 'all'>('all')
  const [eventFilter, setEventFilter]   = useState<EventType | 'all'>('all')
  const [logLimit, setLogLimit]         = useState(100)
  const [copied, setCopied]             = useState(false)
  const { showToast } = useToast()
  const logRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const result = await macLogsApi.getLogs(device.id || device.serialNumber || device.deviceName, logLimit)
      setLogResult(result)
      setAnalysis(null)
    } catch (err) {
      showToast('Failed to load device logs', 'error')
    } finally {
      setLoading(false)
    }
  }, [device, logLimit, showToast])

  useEffect(() => { void load() }, [load])

  const handleAnalyze = async () => {
    if (!logResult) return
    setAnalyzing(true)
    setTab('analysis')
    try {
      const deviceContext: Record<string, string> = {
        deviceName:      device.deviceName,
        serialNumber:    device.serialNumber ?? '',
        user:            device.user ?? '',
        platform:        device.platform ?? 'macOS',
        osVersion:       device.osVersion ?? '',
        model:           device.model ?? '',
        complianceState: device.complianceState ?? '',
        encryptionStatus: device.encryptionStatus ?? '',
        firewallStatus:  device.firewallStatus ?? '',
        antivirusStatus: device.antivirusStatus ?? '',
        managementSource: device.managementSource ?? '',
      }
      const result = await macLogsApi.analyze(
        device.id || device.serialNumber || device.deviceName,
        logResult.logs,
        deviceContext,
      )
      setAnalysis(result)
    } catch (err) {
      showToast('AI analysis failed — check OpenAI configuration', 'error')
      setTab('raw')
    } finally {
      setAnalyzing(false)
    }
  }

  // Filter logs
  const filteredLogs = (logResult?.logs ?? []).filter(l => {
    if (levelFilter !== 'all' && l.level !== levelFilter) return false
    if (eventFilter !== 'all' && l.eventType !== eventFilter) return false
    if (search && !l.message.toLowerCase().includes(search.toLowerCase()) &&
        !l.subsystem.toLowerCase().includes(search.toLowerCase()) &&
        !l.process.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  // Export
  const exportTxt = () => {
    const lines = filteredLogs.map(logLineText).join('\n')
    const header = [
      `# Mac Device Log Export`,
      `# Device: ${device.deviceName} (${device.serialNumber ?? ''})`,
      `# User: ${device.user ?? ''}`,
      `# OS: macOS ${device.osVersion ?? ''}`,
      `# Exported: ${new Date().toISOString()}`,
      `# Total entries: ${filteredLogs.length}`,
      `${'─'.repeat(120)}`,
      '',
    ].join('\n')
    const blob = new Blob([header + lines], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${device.deviceName}_logs_${new Date().toISOString().split('T')[0]}.txt`
    a.click()
    URL.revokeObjectURL(url)
    showToast('Log file exported', 'success')
  }

  const exportCsv = () => {
    const header = 'timestamp,level,subsystem,category,process,pid,eventType,message\n'
    const rows = filteredLogs.map(l =>
      [l.timestamp, l.level, l.subsystem, l.category, l.process, l.pid, l.eventType,
        `"${l.message.replace(/"/g, '""')}"`].join(',')
    ).join('\n')
    const blob = new Blob([header + rows], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${device.deviceName}_logs_${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
    showToast('CSV exported', 'success')
  }

  const copyToClipboard = async () => {
    const text = filteredLogs.map(logLineText).join('\n')
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const errorCount   = (logResult?.logs ?? []).filter(l => l.level === 'error' || l.level === 'fault').length
  const warnCount    = (logResult?.logs ?? []).filter(l => l.level === 'info' && l.message.toLowerCase().includes('warn')).length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}>
      <div
        className="relative w-full flex flex-col rounded-2xl overflow-hidden shadow-2xl"
        style={{
          maxWidth: '1100px',
          height: 'min(90vh, 860px)',
          background: '#0F1117',
          border: '1px solid rgba(148,163,184,0.12)',
        }}
      >
        {/* ── Top accent ──────────────────────────────────────────────────── */}
        <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: 'linear-gradient(90deg,#6366f1,#8b5cf6,#F46C00)' }} />

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-slate-800/80 flex-shrink-0">
          <div className="grid h-8 w-8 place-items-center rounded-xl bg-slate-800 border border-slate-700/60">
            <Terminal className="h-4 w-4 text-slate-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-bold text-slate-100">{device.deviceName}</p>
              <span className="rounded-full bg-slate-800 border border-slate-700/60 px-2 py-0.5 text-[0.6rem] font-mono text-slate-500">
                {device.serialNumber ?? 'N/A'}
              </span>
              <span className="rounded-full bg-slate-800 border border-slate-700/60 px-2 py-0.5 text-[0.6rem] font-mono text-slate-500">
                macOS {device.osVersion}
              </span>
              {errorCount > 0 && (
                <span className="rounded-full bg-red-500/20 border border-red-500/30 px-2 py-0.5 text-[0.6rem] font-bold text-red-400">
                  {errorCount} error{errorCount > 1 ? 's' : ''}
                </span>
              )}
            </div>
            <p className="text-[0.62rem] text-slate-600 mt-0.5">{device.user} · {device.managementSource} · {logResult?.total ?? 0} log entries</p>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handleAnalyze()}
              disabled={analyzing || loading || !logResult}
              className="inline-flex items-center gap-1.5 rounded-full border border-violet-500/40 bg-violet-500/15 px-3 py-1.5 text-xs font-bold text-violet-300 hover:bg-violet-500/25 disabled:opacity-40 transition"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {analyzing ? 'Analyzing…' : 'Analyze with AI'}
            </button>
            <button type="button" onClick={() => void load()} disabled={loading}
              className="rounded-full p-2 border border-slate-700/60 text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition disabled:opacity-40">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button type="button" onClick={onClose}
              className="rounded-full p-2 border border-slate-700/60 text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* ── Tab bar ──────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-5 py-2 border-b border-slate-800/60 flex-shrink-0">
          <div className="flex gap-1">
            {([
              { id: 'raw' as DrawerTab,      label: 'Raw Logs',    icon: Terminal },
              { id: 'analysis' as DrawerTab, label: 'AI Analysis', icon: Sparkles },
            ]).map(t => (
              <button key={t.id} type="button" onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  tab === t.id ? 'bg-slate-700/60 text-slate-200' : 'text-slate-500 hover:text-slate-300'
                }`}>
                <t.icon className="h-3 w-3" />
                {t.label}
                {t.id === 'analysis' && analysis && (
                  <span className={`rounded-full px-1.5 py-0.5 text-[0.55rem] font-black ${
                    HEALTH_CONFIG[analysis.healthStatus].bg
                  } ${HEALTH_CONFIG[analysis.healthStatus].color}`}>
                    {analysis.healthStatus}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Export buttons — only in raw tab */}
          {tab === 'raw' && (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 rounded-lg border border-slate-700/60 bg-slate-800/50 px-1 py-1">
                <select
                  value={logLimit}
                  onChange={e => setLogLimit(Number(e.target.value))}
                  className="bg-transparent text-[0.65rem] font-semibold text-slate-400 focus:outline-none cursor-pointer pr-1"
                >
                  {[50, 100, 200, 500].map(n => (
                    <option key={n} value={n} className="bg-slate-900">{n} entries</option>
                  ))}
                </select>
              </div>
              <button type="button" onClick={() => void copyToClipboard()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700/60 bg-slate-800/50 px-2.5 py-1.5 text-[0.65rem] font-semibold text-slate-400 hover:text-slate-200 transition">
                {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
              <button type="button" onClick={exportTxt}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700/60 bg-slate-800/50 px-2.5 py-1.5 text-[0.65rem] font-semibold text-slate-400 hover:text-slate-200 transition">
                <FileText className="h-3 w-3" />TXT
              </button>
              <button type="button" onClick={exportCsv}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700/60 bg-slate-800/50 px-2.5 py-1.5 text-[0.65rem] font-semibold text-slate-400 hover:text-slate-200 transition">
                <Download className="h-3 w-3" />CSV
              </button>
            </div>
          )}
        </div>

        {/* ── Raw log filters ───────────────────────────────────────────────── */}
        {tab === 'raw' && (
          <div className="flex flex-wrap items-center gap-2 px-5 py-2 border-b border-slate-800/40 flex-shrink-0">
            {/* Search */}
            <div className="relative flex-1 min-w-[160px] max-w-[260px]">
              <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-600" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Filter logs…"
                className="w-full bg-slate-800/60 border border-slate-700/50 rounded-lg pl-7 pr-3 py-1.5 text-xs text-slate-300 placeholder-slate-600 focus:outline-none focus:border-violet-500/50"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2">
                  <X className="h-3 w-3 text-slate-600 hover:text-slate-400" />
                </button>
              )}
            </div>

            {/* Level filter */}
            <div className="flex gap-1">
              {(['all', 'fault', 'error', 'info', 'debug'] as const).map(lv => (
                <button key={lv} type="button" onClick={() => setLevelFilter(lv)}
                  className={`rounded-lg px-2 py-1 text-[0.6rem] font-bold uppercase tracking-wider transition ${
                    levelFilter === lv
                      ? lv === 'all' ? 'bg-slate-700 text-slate-200'
                        : lv === 'fault' || lv === 'error' ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                        : lv === 'info' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : 'bg-slate-700 text-slate-300'
                      : 'text-slate-600 hover:text-slate-400'
                  }`}>
                  {lv}
                </button>
              ))}
            </div>

            {/* Event type filter */}
            <div className="flex gap-1 flex-wrap">
              {(['all', 'mdm', 'security', 'system', 'app', 'network', 'kandji'] as const).map(et => {
                const Icon = et === 'all' ? Filter : EVENT_ICONS[et]
                return (
                  <button key={et} type="button" onClick={() => setEventFilter(et)}
                    className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[0.6rem] font-semibold transition ${
                      eventFilter === et ? 'bg-slate-700 text-slate-200' : 'text-slate-600 hover:text-slate-400'
                    }`}>
                    <Icon className="h-2.5 w-2.5" />
                    {et === 'all' ? 'All Types' : EVENT_FILTER_LABELS[et]}
                  </button>
                )
              })}
            </div>

            {/* Result count */}
            <span className="ml-auto text-[0.6rem] text-slate-600 flex-shrink-0">
              {filteredLogs.length} / {logResult?.total ?? 0} entries
            </span>
          </div>
        )}

        {/* ── Content ──────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-hidden">
          {tab === 'raw' && (
            <div ref={logRef} className="h-full overflow-y-auto font-mono">
              {/* Column headers */}
              <div className="sticky top-0 z-10 flex items-center gap-2 px-3 py-1.5 border-b border-slate-700/60" style={{ background: '#0d1117' }}>
                <span className="w-12 text-[0.55rem] font-black uppercase tracking-wider text-slate-600 text-right">LEVEL</span>
                <span className="w-[120px] text-[0.55rem] font-black uppercase tracking-wider text-slate-600">TIME</span>
                <span className="w-3 text-[0.55rem] font-black uppercase tracking-wider text-slate-600">T</span>
                <span className="w-[180px] text-[0.55rem] font-black uppercase tracking-wider text-slate-600 hidden lg:block">SUBSYSTEM</span>
                <span className="w-[90px] text-[0.55rem] font-black uppercase tracking-wider text-slate-600 hidden xl:block">PROCESS</span>
                <span className="flex-1 text-[0.55rem] font-black uppercase tracking-wider text-slate-600">MESSAGE</span>
              </div>

              {loading && (
                <div className="flex items-center justify-center py-20 gap-3">
                  <RefreshCw className="h-5 w-5 animate-spin text-slate-600" />
                  <span className="text-sm text-slate-500">Loading device logs…</span>
                </div>
              )}

              {!loading && filteredLogs.length === 0 && (
                <div className="flex items-center justify-center py-20 gap-3 text-slate-600">
                  <AlertCircle className="h-5 w-5" />
                  <span className="text-sm">No log entries match the current filters</span>
                </div>
              )}

              {!loading && filteredLogs.map(entry => (
                <LogRow key={entry.id} entry={entry} highlight={search} />
              ))}
            </div>
          )}

          {tab === 'analysis' && (
            <AnalysisPanel analysis={analysis} loading={analyzing} />
          )}
        </div>
      </div>
    </div>
  )
}
