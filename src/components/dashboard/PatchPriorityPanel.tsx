import { useEffect, useState } from 'react'
import { Wrench, RefreshCw } from 'lucide-react'
import { api } from '../../api'
import type { PatchPrioritySummaryResponse } from '../../api'

type PatchPlatform = 'windows' | 'macos'

interface PatchPriorityPanelProps {
  onViewAll?: () => void
}

export function PatchPriorityPanel({ onViewAll }: PatchPriorityPanelProps) {
  const [state, setState] = useState<'loading' | 'ready' | 'unconfigured' | 'error'>('loading')
  const [summary, setSummary] = useState<PatchPrioritySummaryResponse | null>(null)
  const [platform, setPlatform] = useState<PatchPlatform>('windows')

  useEffect(() => {
    let cancelled = false
    api.fetchPatchPrioritySummary()
      .then(res => {
        if (cancelled) return
        setSummary(res)
        setState(res.configured ? 'ready' : 'unconfigured')
      })
      .catch(() => { if (!cancelled) setState('error') })
    return () => { cancelled = true }
  }, [])

  const counts = summary ? summary[platform] : null
  const topPatches = summary ? summary.topPatches[platform] : []

  return (
    <div className="rounded-2xl border border-slate-200/60 bg-white shadow-sm p-4 h-full flex flex-col">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wrench className="h-4 w-4 text-sky-600" />
          <h2 className="text-sm font-bold text-slate-900">Patch priority</h2>
        </div>
        {onViewAll && <button onClick={onViewAll} className="text-xs font-medium text-sky-600 hover:underline">View all patches →</button>}
      </div>

      <div className="flex gap-1.5 mb-3">
        {(['windows', 'macos'] as const).map(p => (
          <button
            key={p} type="button" onClick={() => setPlatform(p)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${platform === p ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
          >
            {p === 'windows' ? 'Windows' : 'macOS'}
          </button>
        ))}
      </div>

      {state === 'loading' && (
        <div className="flex flex-1 items-center justify-center py-6"><RefreshCw className="h-4 w-4 animate-spin text-slate-300" /></div>
      )}

      {state === 'error' && <p className="flex-1 text-xs text-red-500">Couldn't load patch data.</p>}
      {state === 'unconfigured' && <p className="flex-1 text-xs text-slate-400">Endpoint Central patch management isn't configured.</p>}

      {state === 'ready' && counts && (
        <div className="flex-1 space-y-3">
          <div className="flex items-center gap-4 text-xs">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-red-500" />Critical <strong className="text-slate-800">{counts.critical}</strong></span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-400" />High <strong className="text-slate-800">{counts.high}</strong></span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-slate-400" />Other <strong className="text-slate-800">{counts.other}</strong></span>
          </div>

          <div>
            <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-slate-400 mb-1.5">Top missing patches ({platform === 'windows' ? 'Windows' : 'macOS'})</p>
            {topPatches.length === 0 ? (
              <p className="text-xs text-slate-400">No missing critical patches found.</p>
            ) : (
              <div className="space-y-1.5">
                {topPatches.map(patch => (
                  <div key={`${patch.kb}-${patch.name}`} className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate text-slate-700">{patch.name}</span>
                    <div className="flex flex-shrink-0 items-center gap-2">
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-[0.62rem] font-semibold text-red-700">{patch.severity}</span>
                      <span className="text-slate-500">{patch.deviceCount} device{patch.deviceCount !== 1 ? 's' : ''}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
