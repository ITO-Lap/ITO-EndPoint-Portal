import { useState, useEffect, useRef } from 'react'
import { RefreshCw, Wifi, WifiOff, Server, Settings, Hash, BookOpen, MessageSquare, ExternalLink, X, AlertCircle, FileText, CheckCircle } from 'lucide-react'
import { api } from '../../api'
import type { JiraIssue, ConfluencePage } from '../../api'

interface SourceCount {
  intune: number
  manageEngine: number
}

interface LiveDataBarProps {
  sourceCounts: SourceCount
  countdown: number
  lastUpdated: Date | null
  onRefresh: () => void
  refreshing?: boolean
  onNavigate?: (page: string) => void
}

interface SourcePill {
  id: keyof SourceCount
  label: string
  shortLabel: string
  Icon: React.ElementType
  iconColor: string
  pillBg: string
  pillBorder: string
  pillText: string
  dotColor: string
  navigateTo: string
}

const SOURCES: SourcePill[] = [
  {
    id: 'intune',
    label: 'Microsoft Intune',
    shortLabel: 'Intune',
    Icon: Server,
    iconColor: 'text-orange-500',
    pillBg: 'bg-orange-50',
    pillBorder: 'border-orange-200',
    pillText: 'text-orange-700',
    dotColor: 'bg-orange-500',
    navigateTo: 'Managed Devices',
  },
  {
    id: 'manageEngine',
    label: 'ManageEngine',
    shortLabel: 'ME',
    Icon: Settings,
    iconColor: 'text-orange-500',
    pillBg: 'bg-orange-50',
    pillBorder: 'border-orange-200',
    pillText: 'text-orange-700',
    dotColor: 'bg-orange-500',
    navigateTo: 'Managed Devices',
  },
]

type PopoverType = 'jira' | 'confluence' | null

function formatLastUpdated(d: Date): string {
  const diffSec = Math.round((Date.now() - d.getTime()) / 1000)
  if (diffSec < 10)  return 'just now'
  if (diffSec < 60)  return `${diffSec}s ago`
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60)  return `${diffMin}m ago`
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function priorityColor(p: string) {
  if (p === 'Critical') return 'bg-red-100 text-red-700 border-red-200'
  if (p === 'High')     return 'bg-orange-100 text-orange-700 border-orange-200'
  if (p === 'Medium')   return 'bg-amber-100 text-amber-700 border-amber-200'
  return 'bg-slate-100 text-slate-600 border-slate-200'
}

function statusColor(s: string) {
  if (s === 'Done' || s === 'Closed' || s === 'Resolved') return 'text-emerald-600'
  if (s === 'In Progress') return 'text-orange-600'
  return 'text-slate-500'
}

// ─── Jira Popover ──────────────────────────────────────────────────────────────

function JiraPopover({ onClose }: { onClose: () => void }) {
  const [issues, setIssues]   = useState<JiraIssue[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    api.searchJiraIssues('')
      .then(setIssues)
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="w-80">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <div className="grid h-6 w-6 place-items-center rounded-md bg-orange-100">
            <Hash className="h-3.5 w-3.5 text-orange-600" />
          </div>
          <span className="text-xs font-bold text-slate-800">Jira — Open Issues</span>
          {!loading && !error && (
            <span className="rounded-full bg-orange-100 border border-orange-200 px-1.5 py-0.5 text-[0.6rem] font-bold text-orange-700">{issues.length}</span>
          )}
        </div>
        <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 transition">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="max-h-64 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center py-8 gap-2 text-slate-400">
            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            <span className="text-xs">Fetching issues…</span>
          </div>
        )}
        {error && (
          <div className="flex items-center gap-2 px-4 py-4 text-red-600">
            <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
            <span className="text-xs">{error}</span>
          </div>
        )}
        {!loading && !error && issues.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-slate-400 gap-1">
            <CheckCircle className="h-5 w-5 opacity-40" />
            <span className="text-xs">No open issues</span>
          </div>
        )}
        {!loading && !error && issues.map(issue => (
          <a
            key={issue.id}
            href={issue.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-start gap-3 px-4 py-2.5 border-b border-slate-50 hover:bg-slate-50 transition group"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-[0.62rem] font-bold text-orange-600 font-mono flex-shrink-0">{issue.key}</span>
                <span className={`text-[0.6rem] font-semibold ${statusColor(issue.status)}`}>{issue.status}</span>
              </div>
              <p className="text-xs text-slate-700 leading-snug line-clamp-2">{issue.summary}</p>
            </div>
            <div className="flex flex-col items-end gap-1 flex-shrink-0">
              <span className={`rounded-full border px-1.5 py-0.5 text-[0.58rem] font-bold ${priorityColor(issue.priority)}`}>{issue.priority}</span>
              <ExternalLink className="h-3 w-3 text-slate-300 group-hover:text-orange-400 transition" />
            </div>
          </a>
        ))}
      </div>

      <div className="px-4 py-2 border-t border-slate-100 bg-slate-50 rounded-b-xl">
        <span className="text-[0.6rem] text-slate-400">Showing recent open issues · Click to open in Jira</span>
      </div>
    </div>
  )
}

// ─── Confluence Popover ────────────────────────────────────────────────────────

function ConfluencePopover({ onClose }: { onClose: () => void }) {
  const [pages, setPages]     = useState<ConfluencePage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const [search, setSearch]   = useState('')

  useEffect(() => {
    api.searchConfluence(search)
      .then(setPages)
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [])

  const handleSearch = (q: string) => {
    setSearch(q)
    setLoading(true)
    setError(null)
    api.searchConfluence(q)
      .then(setPages)
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }

  return (
    <div className="w-96">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <div className="grid h-6 w-6 place-items-center rounded-md bg-teal-100">
            <BookOpen className="h-3.5 w-3.5 text-teal-600" />
          </div>
          <span className="text-xs font-bold text-slate-800">Confluence — Knowledge Base</span>
          {!loading && !error && (
            <span className="rounded-full bg-teal-100 border border-teal-200 px-1.5 py-0.5 text-[0.6rem] font-bold text-teal-700">{pages.length}</span>
          )}
        </div>
        <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 transition">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Search */}
      <div className="px-4 py-2 border-b border-slate-100">
        <input
          type="text"
          value={search}
          onChange={e => handleSearch(e.target.value)}
          placeholder="Search articles…"
          className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-300 focus:border-teal-400"
        />
      </div>

      <div className="max-h-64 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center py-8 gap-2 text-slate-400">
            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            <span className="text-xs">Searching…</span>
          </div>
        )}
        {error && (
          <div className="flex items-center gap-2 px-4 py-4 text-red-600">
            <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
            <span className="text-xs">{error}</span>
          </div>
        )}
        {!loading && !error && pages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-slate-400 gap-1">
            <FileText className="h-5 w-5 opacity-40" />
            <span className="text-xs">No articles found</span>
          </div>
        )}
        {!loading && !error && pages.map(page => (
          <a
            key={page.id}
            href={page.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-start gap-3 px-4 py-2.5 border-b border-slate-50 hover:bg-slate-50 transition group"
          >
            <FileText className="h-3.5 w-3.5 text-teal-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="rounded bg-teal-50 border border-teal-100 px-1 py-0.5 text-[0.58rem] font-bold text-teal-600">{page.space}</span>
                {page.lastModified && (
                  <span className="text-[0.58rem] text-slate-400">{page.lastModified.slice(0, 10)}</span>
                )}
              </div>
              <p className="text-xs font-medium text-slate-800 leading-snug">{page.title}</p>
              {page.excerpt && (
                <p className="text-[0.62rem] text-slate-500 leading-snug mt-0.5 line-clamp-2">{page.excerpt}</p>
              )}
            </div>
            <ExternalLink className="h-3 w-3 text-slate-300 group-hover:text-teal-400 transition flex-shrink-0 mt-0.5" />
          </a>
        ))}
      </div>

      <div className="px-4 py-2 border-t border-slate-100 bg-slate-50 rounded-b-xl">
        <span className="text-[0.6rem] text-slate-400">IT runbooks &amp; knowledge base · Click to open in Confluence</span>
      </div>
    </div>
  )
}

// ─── Popover wrapper ───────────────────────────────────────────────────────────

function Popover({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  return (
    <div ref={ref}
      className="absolute top-full mt-1.5 left-0 z-50 rounded-xl border border-slate-200 bg-white shadow-xl shadow-slate-900/10 overflow-hidden">
      {children}
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────

export function LiveDataBar({
  sourceCounts,
  countdown,
  lastUpdated,
  onRefresh,
  refreshing = false,
  onNavigate,
}: LiveDataBarProps) {
  const [activePopover, setActivePopover] = useState<PopoverType>(null)

  const connectedSources = SOURCES.filter(s => sourceCounts[s.id] > 0).length

  function togglePopover(type: PopoverType) {
    setActivePopover(prev => prev === type ? null : type)
  }

  return (
    <div className="flex flex-wrap items-center gap-2 sm:gap-3 rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50/80 to-orange-50/60 px-4 py-2.5 shadow-sm shadow-slate-900/5">

      {/* LIVE badge */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <Wifi className="h-3.5 w-3.5 text-emerald-600" />
        <span className="text-[0.7rem] font-bold text-emerald-700 uppercase tracking-wide">Live</span>
        <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-100 border border-emerald-200 px-1.5 py-0.5 text-[0.6rem] font-semibold text-emerald-700">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          {connectedSources} {connectedSources === 1 ? 'source' : 'sources'}
        </span>
      </div>

      <div className="h-3.5 w-px bg-slate-300 flex-shrink-0 hidden sm:block" />

      {/* MDM device count pills — clickable to navigate to source page */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {SOURCES.map(s => {
          const count = sourceCounts[s.id]
          const Icon = s.Icon
          return (
            <button
              key={s.id}
              type="button"
              title={`${s.label}: ${count.toLocaleString()} devices — click to view`}
              onClick={() => {
                try { window.localStorage.setItem('managedDevicesView', JSON.stringify(s.id === 'intune' ? 'intune' : 'mac')) } catch { /* ignore */ }
                onNavigate?.(s.navigateTo)
              }}
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.65rem] font-semibold transition ${s.pillBg} ${s.pillBorder} ${s.pillText} ${onNavigate ? 'hover:brightness-95 hover:shadow-sm cursor-pointer' : 'cursor-default'}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${count > 0 ? s.dotColor : 'bg-slate-300'}`} />
              <Icon className={`h-2.5 w-2.5 ${count > 0 ? s.iconColor : 'text-slate-400'} hidden sm:block`} />
              <span className="hidden sm:inline">{s.shortLabel}</span>
              <span className="font-bold">{count.toLocaleString()}</span>
            </button>
          )
        })}
      </div>

      <div className="h-3.5 w-px bg-slate-300 flex-shrink-0 hidden lg:block" />

      {/* ── Integration pills (Jira / Confluence / Slack) ── */}
      <div className="hidden lg:flex items-center gap-1.5 relative">

        {/* Jira */}
        <div className="relative">
          <button
            type="button"
            onClick={() => togglePopover('jira')}
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.65rem] font-semibold transition ${
              activePopover === 'jira'
                ? 'is-selected'
                : 'bg-orange-50 border-orange-200 text-orange-700 hover:bg-orange-100 hover:border-orange-300'
            }`}
            title="Jira — view open issues"
          >
            <Hash className="h-2.5 w-2.5" />
            <span>Jira</span>
          </button>
          {activePopover === 'jira' && (
            <Popover onClose={() => setActivePopover(null)}>
              <JiraPopover onClose={() => setActivePopover(null)} />
            </Popover>
          )}
        </div>

        {/* Confluence */}
        <div className="relative">
          <button
            type="button"
            onClick={() => togglePopover('confluence')}
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.65rem] font-semibold transition ${
              activePopover === 'confluence'
                ? 'bg-teal-100 border-teal-400 text-teal-700 ring-1 ring-teal-200'
                : 'bg-teal-50 border-teal-200 text-teal-700 hover:bg-teal-100 hover:border-teal-300'
            }`}
            title="Confluence — search knowledge base"
          >
            <BookOpen className="h-2.5 w-2.5" />
            <span>Confluence</span>
          </button>
          {activePopover === 'confluence' && (
            <Popover onClose={() => setActivePopover(null)}>
              <ConfluencePopover onClose={() => setActivePopover(null)} />
            </Popover>
          )}
        </div>

        {/* Slack — direct link to Activity Log */}
        <button
          type="button"
          onClick={() => onNavigate?.('Activity Log')}
          className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.65rem] font-semibold transition bg-purple-50 border-purple-200 text-purple-700 hover:bg-purple-100 hover:border-purple-300"
          title="Slack — view audit activity log"
        >
          <MessageSquare className="h-2.5 w-2.5" />
          <span>Slack</span>
        </button>

      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Last updated + countdown */}
      <div className="hidden sm:flex items-center gap-2 flex-shrink-0">
        {lastUpdated && (
          <span className="text-[0.62rem] text-slate-400">
            Updated {formatLastUpdated(lastUpdated)}
          </span>
        )}
        <span
          title={`Auto-refresh in ${countdown}s`}
          className="inline-flex items-center gap-1 rounded-full bg-slate-100 border border-slate-200 px-2 py-0.5 text-[0.62rem] font-mono font-semibold text-slate-500"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-orange-400 animate-pulse" />
          {countdown}s
        </span>
      </div>

      {/* Refresh button */}
      <button
        type="button"
        onClick={onRefresh}
        disabled={refreshing}
        title="Refresh now"
        className={`flex-shrink-0 inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[0.68rem] font-semibold text-slate-600 disabled:opacity-50 transition shadow-sm ${refreshing ? 'border-orange-300 bg-orange-50 animate-pulse' : 'border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300'}`}
      >
        <RefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin text-orange-500' : ''}`} />
        <span className="hidden sm:inline">{refreshing ? 'Refreshing…' : 'Refresh'}</span>
      </button>

      {/* No-source fallback */}
      {connectedSources === 0 && (
        <div className="flex items-center gap-1.5 ml-1">
          <WifiOff className="h-3 w-3 text-amber-500" />
          <span className="text-[0.65rem] text-amber-600 font-medium">Push credentials in Settings to activate</span>
        </div>
      )}
    </div>
  )
}
