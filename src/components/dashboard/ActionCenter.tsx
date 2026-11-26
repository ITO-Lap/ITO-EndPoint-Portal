import { useEffect, useState } from 'react'
import { AlertTriangle, Clock, ShieldAlert, Package, RefreshCw, ChevronRight } from 'lucide-react'
import { api } from '../../api'
import { staleDevicesApi } from '../../api/staleDevices'
import { appIntelApi } from '../../api/appIntel'

interface ActionCenterCardData {
  title: string
  value: number | null
  description: string
  icon: typeof AlertTriangle
  tone: 'red' | 'amber' | 'orange' | 'blue'
  sources: string[]
  page: string
}

const TONE_STYLES: Record<ActionCenterCardData['tone'], { bg: string; border: string; icon: string; value: string }> = {
  red:    { bg: 'bg-red-50',    border: 'border-red-100',    icon: 'bg-red-100 text-red-600',       value: 'text-red-700' },
  amber:  { bg: 'bg-amber-50',  border: 'border-amber-100',  icon: 'bg-amber-100 text-amber-600',   value: 'text-amber-700' },
  orange: { bg: 'bg-indigo-50', border: 'border-indigo-100', icon: 'bg-indigo-100 text-indigo-600', value: 'text-indigo-700' },
  blue:   { bg: 'bg-sky-50',    border: 'border-sky-100',    icon: 'bg-sky-100 text-sky-600',       value: 'text-sky-700' },
}

function Card({ data, loading, onNavigate }: { data: ActionCenterCardData; loading: boolean; onNavigate?: (page: string) => void }) {
  const Icon = data.icon
  const styles = TONE_STYLES[data.tone]
  return (
    <button
      type="button"
      onClick={() => onNavigate?.(data.page)}
      className={`group flex flex-col rounded-2xl border ${styles.border} ${styles.bg} p-4 text-left transition hover:shadow-md`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className={`grid h-8 w-8 flex-shrink-0 place-items-center rounded-xl ${styles.icon}`}>
          <Icon className="h-4 w-4" />
        </div>
        <ChevronRight className="h-3.5 w-3.5 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-500" />
      </div>
      <p className="mt-2 text-xs font-semibold text-slate-700">{data.title}</p>
      <p className={`mt-0.5 text-3xl font-black ${styles.value}`}>
        {loading ? <RefreshCw className="h-6 w-6 animate-spin text-slate-300" /> : (data.value ?? '—')}
      </p>
      <p className="mt-1 text-[0.68rem] text-slate-500">{data.description}</p>
      <div className="mt-2 flex flex-wrap gap-1">
        {data.sources.map(s => (
          <span key={s} className="rounded-full bg-white/70 px-2 py-0.5 text-[0.6rem] font-medium text-slate-500 border border-slate-200/60">{s}</span>
        ))}
      </div>
    </button>
  )
}

interface ActionCenterProps {
  onNavigate?: (page: string) => void
}

export function ActionCenter({ onNavigate }: ActionCenterProps) {
  const [loading, setLoading] = useState(true)
  const [actionableCount, setActionableCount] = useState<number | null>(null)
  const [staleCount, setStaleCount] = useState<number | null>(null)
  const [missingCriticalPatches, setMissingCriticalPatches] = useState<number | null>(null)
  const [appUpdates, setAppUpdates] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const [queue, stale, patches, updatesWin, updatesMac] = await Promise.allSettled([
        api.fetchOperationalQueue(),
        staleDevicesApi.list({ view: 'stale', page: 1, pageSize: 1 }),
        api.fetchPatchPrioritySummary(),
        appIntelApi.summary('windows'),
        appIntelApi.summary('macOS'),
      ])
      if (cancelled) return
      if (queue.status === 'fulfilled') setActionableCount(queue.value.rows.length)
      if (stale.status === 'fulfilled') setStaleCount(stale.value.summary.staleWindows + stale.value.summary.staleMacOS)
      if (patches.status === 'fulfilled') setMissingCriticalPatches(patches.value.configured ? patches.value.windows.critical + patches.value.macos.critical : 0)
      const winUpdates = updatesWin.status === 'fulfilled' ? updatesWin.value.summary?.updateAvailable ?? 0 : 0
      const macUpdates = updatesMac.status === 'fulfilled' ? updatesMac.value.summary?.updateAvailable ?? 0 : 0
      if (updatesWin.status === 'fulfilled' || updatesMac.status === 'fulfilled') setAppUpdates(winUpdates + macUpdates)
      setLoading(false)
    }
    void load()
    return () => { cancelled = true }
  }, [])

  const cards: ActionCenterCardData[] = [
    { title: 'Critical actions', value: actionableCount, description: 'Devices need immediate attention (security, compliance or patching).', icon: AlertTriangle, tone: 'red', sources: ['Intune + Endpoint Central'], page: 'Patch Operations' },
    { title: 'Stale devices', value: staleCount, description: 'Not checked in for more than 14 days.', icon: Clock, tone: 'amber', sources: ['Intune'], page: 'Stale Devices' },
    { title: 'Missing critical patches', value: missingCriticalPatches, description: 'Devices missing critical security patches.', icon: ShieldAlert, tone: 'orange', sources: ['Intune', 'Endpoint Central'], page: 'Patch Operations' },
    { title: 'Application updates available', value: appUpdates, description: 'Devices with pending application updates.', icon: Package, tone: 'blue', sources: ['Intune', 'Endpoint Central'], page: 'ManageEngine App Inventory' },
  ]

  return (
    <div className="rounded-2xl border border-slate-200/60 bg-white shadow-sm p-4">
      <div className="mb-3 flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-red-500" />
        <h2 className="text-sm font-bold text-slate-900">Action Center</h2>
        <span className="text-xs text-slate-400">Key actions that need your attention across Intune and Endpoint Central</span>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(card => <Card key={card.title} data={card} loading={loading} onNavigate={onNavigate} />)}
      </div>
    </div>
  )
}
