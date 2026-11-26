import { useState, useEffect, useMemo } from 'react'
import { ShieldCheck, ShieldAlert, ShieldX, RefreshCw, X, Laptop2, Apple, Clock, Download } from 'lucide-react'
import { api } from '../../api'
import type { EndpointProtectionCoverageResult, EndpointProtectionScanning, PlatformCoverage, MissingAgentDevice, CoverageHealth } from '../../api'
import { SortableHeader } from '../ui/SortableHeader'
import { sortRows, toggleSortDirection, type SortDirection } from '../../lib/tableSorting'

const HEALTH_META: Record<CoverageHealth, { label: string; color: string; bg: string; border: string; icon: React.ReactNode }> = {
  Healthy:  { label: 'Healthy',  color: '#10B981', bg: 'bg-emerald-50', border: 'border-emerald-200', icon: <ShieldCheck className="h-4 w-4" /> },
  Warning:  { label: 'Warning',  color: '#818CF8', bg: 'bg-amber-50',   border: 'border-amber-200',   icon: <ShieldAlert className="h-4 w-4" /> },
  Critical: { label: 'Critical', color: '#EF4444', bg: 'bg-red-50',     border: 'border-red-200',     icon: <ShieldX className="h-4 w-4" /> },
}

function RingProgress({ pct, color, label }: { pct: number | null; color: string; label: string }) {
  const size = 64, stroke = 7
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const dash = pct === null ? 0 : (pct / 100) * circumference
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#F1F5F9" strokeWidth={stroke} />
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth={stroke}
            strokeDasharray={`${dash} ${circumference - dash}`} strokeLinecap="round" />
        </svg>
        <div className="absolute inset-0 grid place-items-center">
          <span className="text-sm font-black text-slate-700">{pct === null ? 'N/A' : `${pct}%`}</span>
        </div>
      </div>
      <span className="text-[0.62rem] font-semibold text-slate-500">{label}</span>
    </div>
  )
}

function downloadCsv(filename: string, rows: MissingAgentDevice[]) {
  const headers = ['Device Name', 'Primary User', 'Connector', 'Last Sync']
  const body = rows.map(d => [d.deviceName, d.primaryUser, d.connector, d.lastSync])
  const csv = [headers, ...body].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = Object.assign(document.createElement('a'), { href: url, download: filename })
  a.click()
  URL.revokeObjectURL(url)
}

function MissingDevicesModal({ platform, agent, onClose }: { platform: 'Windows' | 'macOS'; agent: 'zscaler' | 'crowdstrike'; onClose: () => void }) {
  const [devices, setDevices] = useState<MissingAgentDevice[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const agentLabel = agent === 'zscaler' ? 'Zscaler' : 'CrowdStrike Falcon'
  const sortedDevices = useMemo(() => !devices || !sortKey ? devices : sortRows(devices, device => {
    switch (sortKey) {
      case 'deviceName': return device.deviceName
      case 'primaryUser': return device.primaryUser
      case 'connector': return device.connector
      case 'lastSync': return Date.parse(device.lastSync) || device.lastSync
      default: return ''
    }
  }, sortDirection), [devices, sortKey, sortDirection])
  const handleSort = (key: string) => {
    setSortDirection(direction => toggleSortDirection(sortKey, direction, key))
    setSortKey(key)
  }

  useEffect(() => {
    api.fetchDevicesMissingAgent(platform, agent).then(setDevices).catch((e: unknown) => setLoadError(e instanceof Error && e.message ? e.message : 'Could not load this list.'))
  }, [platform, agent])

  return (
    <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="glass-strong rounded-2xl w-full max-w-lg max-h-[70vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 flex items-center justify-between border-b border-slate-100 flex-shrink-0">
          <div>
            <p className="text-sm font-black text-slate-800">{platform} devices missing {agentLabel}</p>
            <p className="text-[0.65rem] text-slate-400">{devices?.length ?? '—'} device{devices?.length === 1 ? '' : 's'} need remediation</p>
          </div>
          <div className="flex items-center gap-2">
            {devices && devices.length > 0 && (
              <button type="button" onClick={() => downloadCsv(`missing-${agent}-${platform.toLowerCase()}.csv`, devices)}
                className="flex items-center gap-1.5 rounded-full border border-slate-200 px-2.5 py-1 text-[0.65rem] font-semibold text-slate-500">
                <Download className="h-3 w-3" />Export
              </button>
            )}
            <button type="button" onClick={onClose} aria-label="Close"><X className="h-4 w-4 text-slate-400" /></button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loadError ? (
            <div role="alert" className="p-8 text-center text-sm text-amber-700">{loadError}</div>
          ) : devices === null ? (
            <div className="p-8 text-center text-sm text-slate-400">Loading…</div>
          ) : devices.length === 0 ? (
            <div className="p-8 text-center">
              <ShieldCheck className="mx-auto h-6 w-6 text-emerald-400 mb-2" />
              <p className="text-sm text-slate-500 font-semibold">No devices missing {agentLabel} — full coverage.</p>
            </div>
          ) : (
            <table className="z-table">
              <thead><tr>
                <SortableHeader label="Device" sortKey="deviceName" activeSortKey={sortKey} direction={sortDirection} onSort={handleSort} />
                <SortableHeader label="Primary User" sortKey="primaryUser" activeSortKey={sortKey} direction={sortDirection} onSort={handleSort} />
                <SortableHeader label="Connector" sortKey="connector" activeSortKey={sortKey} direction={sortDirection} onSort={handleSort} />
                <SortableHeader label="Last Sync" sortKey="lastSync" activeSortKey={sortKey} direction={sortDirection} onSort={handleSort} />
              </tr></thead>
              <tbody>
                {sortedDevices?.map(d => (
                  <tr key={d.deviceId}>
                    <td className="font-semibold text-slate-700">{d.deviceName || '—'}</td>
                    <td className="text-slate-500">{d.primaryUser || '—'}</td>
                    <td className="text-slate-500">{d.connector}</td>
                    <td className="text-[0.68rem] text-slate-400">{d.lastSync || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

function PlatformCard({ coverage, icon, accent }: { coverage: PlatformCoverage; icon: React.ReactNode; accent: string }) {
  const [drilldown, setDrilldown] = useState<'zscaler' | 'crowdstrike' | null>(null)
  const meta = HEALTH_META[coverage.health]

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="h-[3px]" style={{ background: accent }} />
      <div className="px-4 py-3.5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-xl text-white" style={{ background: accent }}>{icon}</div>
            <div>
              <p className="text-sm font-black text-slate-800">{coverage.platform}</p>
              <p className="text-[0.62rem] text-slate-400">{coverage.totalDevices.toLocaleString()} physical devices</p>
            </div>
          </div>
          <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[0.65rem] font-bold ${meta.bg} ${meta.border}`} style={{ color: meta.color }}>
            {meta.icon}{meta.label}
          </span>
        </div>

        <div className="flex items-center justify-around py-2 border-y border-slate-100">
          <RingProgress pct={coverage.falconCoveragePct} color="#EF4444" label="Falcon" />
          <RingProgress pct={coverage.zscalerCoveragePct} color="#0EA5E9" label="Zscaler" />
        </div>
        {coverage.inventoryUnavailableDevices > 0 && (
          <p className="mt-2 text-[0.62rem] text-amber-700" role="status">
            Inventory unavailable for {coverage.inventoryUnavailableDevices} device{coverage.inventoryUnavailableDevices === 1 ? '' : 's'}; excluded from coverage.
          </p>
        )}

        <div className="grid grid-cols-2 gap-2 mt-3">
          <button type="button" onClick={() => coverage.falconMissing > 0 && setDrilldown('crowdstrike')} disabled={coverage.falconMissing === 0}
            className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-left disabled:opacity-50 enabled:hover:bg-slate-100">
            <p className="text-base font-black text-slate-800">{coverage.falconMissing}</p>
            <p className="text-[0.6rem] text-slate-400 font-medium">Missing Falcon{coverage.falconMissing > 0 ? ' — view →' : ''}</p>
          </button>
          <button type="button" onClick={() => coverage.zscalerMissing > 0 && setDrilldown('zscaler')} disabled={coverage.zscalerMissing === 0}
            className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-left disabled:opacity-50 enabled:hover:bg-slate-100">
            <p className="text-base font-black text-slate-800">{coverage.zscalerMissing}</p>
            <p className="text-[0.6rem] text-slate-400 font-medium">Missing Zscaler{coverage.zscalerMissing > 0 ? ' — view →' : ''}</p>
          </button>
        </div>
      </div>
      {drilldown && <MissingDevicesModal platform={coverage.platform} agent={drilldown} onClose={() => setDrilldown(null)} />}
    </div>
  )
}

export function EndpointProtectionCoverage() {
  const [data, setData] = useState<EndpointProtectionCoverageResult | null>(null)
  const [scanning, setScanning] = useState<EndpointProtectionScanning | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(false)

  const [retry, setRetry] = useState(0)
  // The first scan of a large fleet takes minutes: show its progress and poll until it lands. A stale result is shown
  // straight away and replaced when the background refresh finishes.
  useEffect(() => {
    let live = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const tick = () => {
      api.fetchEndpointProtectionCoverage().then(res => {
        if (!live) return
        setError(false)
        if ('scanning' in res) { setScanning(res); timer = setTimeout(tick, 4000); return }
        setScanning(null); setData(res); setLoading(false)
        if (res.stale) timer = setTimeout(tick, 6000)
      }).catch(() => { if (live) { setError(true); setLoading(false) } })
    }
    tick()
    return () => { live = false; if (timer) clearTimeout(timer) }
  }, [retry])

  const refresh = () => {
    setRefreshing(true)
    api.refreshEndpointProtectionCoverage().then(res => { setError(false); setData(res) }).catch(() => setError(true)).finally(() => setRefreshing(false))
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-4 py-4">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-sm font-bold text-slate-700">Endpoint Protection Coverage</p>
            <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 border border-sky-200 px-2 py-0.5 text-[0.58rem] font-bold text-sky-700">MDM app inventory</span>
          </div>
          <p className="text-[0.65rem] text-slate-400 flex items-center gap-1 mt-0.5">
            <Clock className="h-3 w-3" />
            {data ? `${data.stale ? 'Last scan' : 'Scanned'} ${new Date(data.scanTime).toLocaleString()} · ${(data.scanDurationMs / 1000).toFixed(1)}s${data.stale ? ' · refreshing in the background…' : ''}` : 'Scanning physical Windows and macOS devices…'}
          </p>
        </div>
        <button type="button" onClick={refresh}
          className="flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1.5 text-[0.68rem] font-semibold text-slate-500 hover:bg-slate-50">
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing || loading ? 'animate-spin text-[#6366F1]' : ''}`} />Refresh Scan
        </button>
      </div>

      {error && !data ? (
        <div role="alert" className="py-6 text-center">
          <p className="text-sm text-slate-500">Could not load endpoint protection coverage.</p>
          <button type="button" onClick={() => { setLoading(true); setRetry(n => n + 1) }} className="mt-2 rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50">Try again</button>
        </div>
      ) : !data ? (
        <div className="rounded-2xl bg-slate-50 px-4 py-6" role="status">
          {scanning?.progress && scanning.progress.total > 0 ? (
            <>
              <p className="text-sm font-semibold text-slate-700">Scanning {scanning.progress.done.toLocaleString()} of {scanning.progress.total.toLocaleString()} devices ({Math.round((scanning.progress.done / scanning.progress.total) * 100)}%)</p>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-[#6366F1] transition-all" style={{ width: `${(scanning.progress.done / scanning.progress.total) * 100}%` }} /></div>
            </>
          ) : <p className="text-sm font-semibold text-slate-700">{loading ? 'Loading coverage…' : 'Starting the fleet scan…'}</p>}
          <p className="mt-1 text-[0.65rem] text-slate-400">The first scan reads every device's installed apps and can take a few minutes. Results appear here automatically — you don't need to refresh.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <PlatformCard coverage={data.windows} icon={<Laptop2 className="h-4 w-4" />} accent="#0078D4" />
          <PlatformCard coverage={data.macos} icon={<Apple className="h-4 w-4" />} accent="#10B981" />
        </div>
      )}
    </div>
  )
}
