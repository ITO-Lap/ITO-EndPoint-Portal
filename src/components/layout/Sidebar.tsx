import { useState, useEffect } from 'react'
import { Settings } from 'lucide-react'
import { navItems, connectedSources } from '../../data/dashboardData'
import { Badge } from '../ui/Badge'
import { api } from '../../api'
import type { IntegrationStatusItem } from '../../api'
import type { ConnectedSource } from '../../types'

interface SidebarProps {
  isOpen?: boolean
  onClose?: () => void
  activePage: string
  onNavSelect: (page: string) => void
  onSourceClick: (source: ConnectedSource) => void
}

function StatusDot({ configured, healthy, loading }: { configured: boolean; healthy: boolean | null; loading: boolean }) {
  if (loading) return <span className="h-1.5 w-1.5 rounded-full bg-slate-600 flex-shrink-0 animate-pulse" />
  if (!configured) return <span className="h-1.5 w-1.5 rounded-full bg-red-500 flex-shrink-0" title="Not connected" />
  if (healthy === false) return <span className="h-1.5 w-1.5 rounded-full bg-amber-400 flex-shrink-0" title="Error" />
  return <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 flex-shrink-0" title="Connected" />
}

export function Sidebar({ isOpen = true, onClose, activePage, onNavSelect, onSourceClick }: SidebarProps) {
  const [statusMap, setStatusMap] = useState<Record<string, IntegrationStatusItem>>({})
  const [statusLoading, setStatusLoading] = useState(true)

  useEffect(() => {
    api.fetchIntegrationStatus()
      .then(items => {
        const map: Record<string, IntegrationStatusItem> = {}
        items.forEach(item => { map[item.id] = item })
        setStatusMap(map)
      })
      .catch(() => {})
      .finally(() => setStatusLoading(false))
  }, [])

  const anyConfigured = Object.values(statusMap).some(s => s.configured)
  const anyError = Object.values(statusMap).some(s => s.configured && s.healthy === false)
  const liveLabel = statusLoading ? 'Checking' : anyError ? 'Issues' : anyConfigured ? 'Live' : 'Offline'
  const liveVariant = statusLoading ? 'slate' : anyError ? 'orange' : anyConfigured ? 'green' : 'red'

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 xl:hidden" onClick={onClose} />
      )}
      <aside className={`flex min-h-full w-full max-w-[268px] xl:w-[268px] xl:max-w-none flex-col border-r border-slate-900/20 bg-gradient-to-b from-[#141408] via-[#0f0f05] to-[#0a0a03] px-6 py-5 text-slate-100 transition-transform duration-300 xl:translate-x-0 ${
        isOpen ? 'translate-x-0' : '-translate-x-full'
      } fixed left-0 top-0 z-50 h-full overflow-y-auto xl:static xl:z-auto xl:h-auto`}>
        <div className="mb-7 flex items-center gap-3 rounded-2xl bg-white/8 border border-white/10 px-3 py-2.5">
          <div className="grid h-11 w-9 place-items-center flex-shrink-0">
            <svg viewBox="0 0 115 160" className="h-full w-auto" fill="none">
              <path d="M62 11C88 11 104 35 104 59C104 91 80 119 62 125C44 119 20 91 20 59C20 35 36 11 62 11Z" stroke="#E02020" strokeWidth="8" strokeLinejoin="round"/>
              <path d="M71 35C93 35 108 55 108 75C108 101 88 125 71 131C54 125 36 101 36 75C36 55 49 35 71 35Z" stroke="#F07820" strokeWidth="7" strokeLinejoin="round"/>
              <path d="M66 103C81 103 96 115 96 131C96 147 81 155 66 155C51 155 36 147 36 131C36 115 51 103 66 103Z" stroke="#F5C500" strokeWidth="6.5" strokeLinejoin="round"/>
            </svg>
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-bold text-white leading-tight tracking-tight">ITO Endpoint</h1>
            <p className="mt-0.5 text-[0.62rem] text-slate-400">Smart. Fast. Reliable.</p>
          </div>
        </div>

        <nav className="space-y-1 text-sm font-medium" aria-label="Main navigation">
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = item.title === activePage
            return (
              <button
                key={item.title}
                type="button"
                aria-current={isActive ? 'page' : undefined}
                onClick={() => { onNavSelect(item.title); onClose?.() }}
                className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition focus-visible:ring-2 focus-visible:ring-orange-300 ${
                  isActive
                    ? 'bg-gradient-to-r from-red-600 to-orange-500 text-white'
                    : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                }`}
              >
                <span className={`grid h-8 w-8 place-items-center rounded-lg flex-shrink-0 ${
                  isActive
                    ? 'bg-white/20 text-white'
                    : 'bg-slate-900/60 text-slate-500 group-hover:bg-slate-800/80 group-hover:text-slate-300'
                }`}>
                  <Icon className="h-4 w-4" />
                </span>
                <span className="text-xs">{item.title}</span>
              </button>
            )
          })}
        </nav>

        <div className="mt-auto rounded-xl border border-slate-700/60 bg-slate-950/60 p-3 text-white">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[0.65rem] font-bold uppercase tracking-widest text-slate-400">Connected Sources</p>
            <Badge label={liveLabel} variant={liveVariant as 'green' | 'orange' | 'red' | 'slate'} className="text-[0.55rem] py-0.5 px-1.5 h-fit" />
          </div>
          <div className="space-y-1">
            {connectedSources.map((source) => {
              const Icon = source.icon
              const stat = statusMap[source.integrationId]
              const configured = stat?.configured ?? false
              const healthy = stat?.healthy ?? null

              return (
                <button
                  key={source.name}
                  type="button"
                  onClick={() => onSourceClick(source)}
                  aria-label={`View details for ${source.name}`}
                  className="w-full flex items-center justify-between rounded-lg bg-slate-900/70 px-2 py-1.5 hover:bg-slate-800/80 focus-visible:ring-2 focus-visible:ring-orange-300 transition text-left group"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className={`grid h-6 w-6 place-items-center rounded-md flex-shrink-0 ${
                      !statusLoading && !configured
                        ? 'bg-slate-800/60 text-slate-600'
                        : 'bg-slate-800 text-lime-400'
                    }`}>
                      <Icon className="h-3 w-3" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={`text-[0.65rem] font-semibold leading-tight truncate ${
                        !statusLoading && !configured ? 'text-slate-500' : 'text-slate-200'
                      }`}>{source.name}</p>
                      {!statusLoading && !configured && (
                        <p className="text-[0.58rem] text-slate-600 leading-tight">Not connected</p>
                      )}
                      {!statusLoading && configured && healthy === false && (
                        <p className="text-[0.58rem] text-amber-600 leading-tight">Error — check settings</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {!statusLoading && !configured && (
                      <span
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Go to Settings to connect"
                        onClick={e => { e.stopPropagation(); onNavSelect('Settings') }}
                      >
                        <Settings className="h-2.5 w-2.5 text-slate-500 hover:text-orange-400 transition-colors" />
                      </span>
                    )}
                    <StatusDot configured={configured} healthy={healthy} loading={statusLoading} />
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </aside>
    </>
  )
}
