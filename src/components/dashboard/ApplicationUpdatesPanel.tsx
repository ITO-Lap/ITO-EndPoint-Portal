import { useEffect, useState } from 'react'
import { Package, RefreshCw } from 'lucide-react'
import { appIntelApi } from '../../api/appIntel'
import type { AppRow } from '../../api/appIntel'

interface ApplicationUpdatesPanelProps {
  onViewAll?: () => void
}

export function ApplicationUpdatesPanel({ onViewAll }: ApplicationUpdatesPanelProps) {
  const [state, setState] = useState<'loading' | 'ready' | 'empty' | 'error'>('loading')
  const [apps, setApps] = useState<AppRow[]>([])

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [windows, macos] = await Promise.all([
          appIntelApi.list({ platform: 'windows', updateAvailable: '1', sortKey: 'affected', sortDir: 'desc', pageSize: 5 }),
          appIntelApi.list({ platform: 'macOS', updateAvailable: '1', sortKey: 'affected', sortDir: 'desc', pageSize: 5 }),
        ])
        if (cancelled) return
        const merged = [...windows.rows, ...macos.rows].sort((a, b) => b.affectedDevices - a.affectedDevices).slice(0, 3)
        setApps(merged)
        setState(merged.length === 0 ? 'empty' : 'ready')
      } catch {
        if (!cancelled) setState('error')
      }
    }
    void load()
    return () => { cancelled = true }
  }, [])

  return (
    <div className="rounded-2xl border border-slate-200/60 bg-white shadow-sm p-4 h-full flex flex-col">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Package className="h-4 w-4 text-indigo-600" />
          <h2 className="text-sm font-bold text-slate-900">Application updates ready</h2>
        </div>
        {onViewAll && <button onClick={onViewAll} className="text-xs font-medium text-sky-600 hover:underline">View all applications →</button>}
      </div>

      {state === 'loading' && <div className="flex flex-1 items-center justify-center py-6"><RefreshCw className="h-4 w-4 animate-spin text-slate-300" /></div>}
      {state === 'error' && <p className="flex-1 text-xs text-red-500">Couldn't load application data.</p>}
      {state === 'empty' && <p className="flex-1 text-xs text-slate-400">No pending application updates.</p>}

      {state === 'ready' && (
        <div className="flex-1 space-y-2.5">
          {apps.map(app => {
            const currentVersion = app.installedVersions[0]?.version ?? '—'
            return (
              <div key={app.key} className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-800 truncate">{app.app}</p>
                  <p className="text-[0.68rem] text-slate-500 truncate">{app.publisher ?? 'Unknown publisher'}</p>
                </div>
                <div className="flex-shrink-0 text-right">
                  <p className="text-[0.68rem] font-mono text-slate-600">{currentVersion} → {app.latestVerifiedVersion ?? '—'}</p>
                  <p className="text-[0.65rem] text-slate-400">{app.affectedDevices} device{app.affectedDevices !== 1 ? 's' : ''}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
