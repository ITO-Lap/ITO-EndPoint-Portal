import { useEffect, useRef, useState } from 'react'
import { RefreshCw, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react'
import { syncApi, freshnessOf, formatAgo, RECORD_LABEL, type Freshness, type SyncModuleName, type SyncSource } from '../../api/sync'
import { useSyncStatus } from '../../hooks/useSyncStatus'
import { useToast } from '../ui/toastHooks'

const FRESHNESS_LABEL: Record<Freshness, string> = { fresh: 'Fresh', aging: 'Ageing', stale: 'Stale', none: 'No sync yet' }
const FRESHNESS_STYLE: Record<Freshness, string> = {
  fresh: 'bg-emerald-50 text-emerald-700', aging: 'bg-amber-50 text-amber-700', stale: 'bg-red-50 text-red-700', none: 'bg-slate-100 text-slate-600',
}

const exact = (iso: string | null): string => (iso ? new Date(iso).toLocaleString() : 'never')

function SourceRow({ s, canManage, starting, onSync }: { s: SyncSource; canManage: boolean; starting: boolean; onSync: () => void }) {
  const fresh = freshnessOf(s)
  const state = s.running ? 'Syncing…' : s.status === 'never' ? 'Waiting for first sync' : s.status === 'succeeded' ? 'Synced' : s.status === 'partial' ? 'Partial' : 'Failed'
  const unit = RECORD_LABEL[s.module] ?? 'Records'
  const tone = s.running ? 'text-sky-700' : s.status === 'failed' ? 'text-red-700' : s.status === 'partial' ? 'text-amber-700' : 'text-slate-700'
  return (
    <li className="flex min-w-0 flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50/60 p-2.5 text-xs">
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 font-semibold leading-snug text-slate-800">{s.displayName}</span>
        <span className={`flex-none rounded-full px-2 py-0.5 text-[0.65rem] font-semibold ${FRESHNESS_STYLE[fresh]}`}>{FRESHNESS_LABEL[fresh]}</span>
      </div>
      <span className={`inline-flex items-center gap-1 font-medium ${tone}`}>
        {s.running ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : s.status === 'succeeded' ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" /> : s.status === 'never' ? null : <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />}
        {state}
      </span>
      <div className="space-y-1.5 text-slate-500">
        <p title={exact(s.lastSuccessAt)} className="leading-tight">Last successful sync<span className="block text-[0.8rem] font-semibold text-slate-800">{s.lastSuccessAt ? formatAgo(s.lastSuccessAt) : 'none yet'}</span></p>
        <p className="leading-tight">{unit}<span className="block text-[0.8rem] font-semibold text-slate-800">{s.recordCount === null ? 'not available yet' : s.recordCount.toLocaleString()}</span></p>
      </div>
      {canManage && (
        <button type="button" onClick={onSync} disabled={s.running || starting} aria-label={`Sync ${s.displayName} now`}
          className="mt-auto inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[0.7rem] font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50">
          <RefreshCw className={`h-3 w-3 ${s.running ? 'animate-spin' : ''}`} aria-hidden="true" />Sync now
        </button>
      )}
    </li>
  )
}

/** Compact dashboard card: stored data is shown at once; this reports how recent it is and starts due syncs in the background. */
export function SyncStatusCard({ canManage }: { canManage: boolean }) {
  const { data, error, refresh } = useSyncStatus()
  const { notify } = useToast()
  const kicked = useRef(false)
  const [starting, setStarting] = useState<string | null>(null)

  // Once the page has its data, ask the server to start any sync that is due. It returns at once and never blocks the UI.
  useEffect(() => {
    if (!data || kicked.current) return
    kicked.current = true
    void syncApi.kick().then(() => setTimeout(refresh, 2_000)).catch(() => undefined)
  }, [data, refresh])

  if (error && !data) return <p className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-500">Sync status is not available right now.</p>
  if (!data) return null
  const stale = data.sources.filter(s => s.configured && s.stale)
  const anyRunning = data.sources.some(s => s.running)

  const syncNow = async (source: string, module: SyncModuleName) => {
    setStarting(`${source}-${module}`)
    try { await syncApi.run(source, module); notify('info', 'Sync started', 'The dashboard stays usable while it runs.'); setTimeout(refresh, 800) }
    catch (e) { notify('error', 'Could not start the sync', e instanceof Error ? e.message : 'Unknown error') }
    finally { setStarting(null) }
  }

  const sources = data.sources.filter(s => s.configured)
  return (
    <section aria-label="Data sync status" className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Data sync {anyRunning && <span className="ml-2 font-medium normal-case text-sky-700">Background sync running…</span>}</h3>
      </div>

      {stale.map(s => (
        <div key={`${s.source}-${s.module}`} role="alert" className="mt-2 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-none" aria-hidden="true" />
          <span>
            {s.displayName}: {s.status === 'partial'
              ? <>The last sync was incomplete. Displaying data from <strong>{exact(s.lastSuccessAt)}</strong>; nothing was removed.</>
              : s.lastSuccessAt ? <>Live sync failed. Displaying data from <strong>{exact(s.lastSuccessAt)}</strong>.</> : 'Live sync failed and no data has been stored yet.'}
            {/* A partial sync's note is written by the server and safe for everyone (for example, patch detail not available through the current API connection); failure detail is for administrators. */}
            {s.lastError && (s.status === 'partial' || canManage) ? <span className="block text-[0.7rem] text-amber-700/80">{s.lastError}</span> : null}
          </span>
        </div>
      ))}

      {sources.length === 0
        ? <p className="mt-2 text-xs text-slate-500">No device source is connected yet. Connect Intune or ManageEngine in Settings → Integrations.</p>
        : <ul
          // One row from tablet width up (one equal column per card); two columns on small screens, one on a phone.
          style={{ '--cols': sources.length } as React.CSSProperties}
          className="mt-3 grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 md:[grid-template-columns:repeat(var(--cols),minmax(0,1fr))]">{sources.map(s => <SourceRow key={`${s.source}-${s.module}`} s={s} canManage={canManage} starting={starting === `${s.source}-${s.module}`} onSync={() => void syncNow(s.source, s.module as SyncModuleName)} />)}</ul>}

      <p className="mt-1 text-[0.65rem] text-slate-400">
        Stored in {data.storage === 'postgres' ? 'PostgreSQL' : 'local files'}
        {data.restartRequired ? ' · a PostgreSQL change is saved and applies after the server restarts' : data.storage === 'file' ? ' · PostgreSQL can be connected later in Settings → Integrations' : ''}
      </p>
    </section>
  )
}
