import { useState, useEffect, useCallback } from 'react'
import { ShieldCheck, ShieldAlert, ShieldX, RefreshCw, X, Laptop2, Apple, Clock, Download } from 'lucide-react'
import { api } from '../../api'
import type { EndpointProtectionCoverageResult, PlatformCoverage, MissingAgentDevice, CoverageHealth } from '../../api'

const HEALTH_META: Record<CoverageHealth, { label: string; color: string; bg: string; border: string; icon: React.ReactNode }> = {
  Healthy:  { label: 'Healthy',  color: '#10B981', bg: 'bg-emerald-50', border: 'border-emerald-200', icon: <ShieldCheck className="h-4 w-4" /> },
  Warning:  { label: 'Warning',  color: '#F59E0B', bg: 'bg-amber-50',   border: 'border-amber-200',   icon: <ShieldAlert className="h-4 w-4" /> },
  Critical: { label: 'Critical', color: '#EF4444', bg: 'bg-red-50',     border: 'border-red-200',     icon: <ShieldX className="h-4 w-4" /> },
}

function RingProgress({ pct, color, label }: { pct: number; color: string; label: string }) {
  const size = 64, stroke = 7
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const dash = (pct / 100) * circumference
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#F1F5F9" strokeWidth={stroke} />
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth={stroke}
            strokeDasharray={`${dash} ${circumference - dash}`} strokeLinecap="round" />
        </svg>
        <div className="absolute inset-0 grid place-items-center">
          <span className="text-sm font-black text-slate-700">{pct}%</span>
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
  const agentLabel = agent === 'zscaler' ? 'Zscaler' : 'CrowdStrike Falcon'

  useEffect(() => {
    api.fetchDevicesMissingAgent(platform, agent).then(setDevices).catch(() => setDevices([]))
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
          {devices === null ? (
            <div className="p-8 text-center text-sm text-slate-400">Loading…</div>
          ) : devices.length === 0 ? (
            <div className="p-8 text-center">
              <ShieldCheck className="mx-auto h-6 w-6 text-emerald-400 mb-2" />
              <p className="text-sm text-slate-500 font-semibold">No devices missing {agentLabel} — full coverage.</p>
            </div>
          ) : (
            <table className="z-table">
              <thead><tr>{['Device', 'Primary User', 'Connector', 'Last Sync'].map(h => <th key={h}>{h}</th>)}</tr></thead>
              <tbody>
                {devices.map(d => (
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
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    setError(false)
    api.fetchEndpointProtectionCoverage().then(setData).catch(() => setError(true)).finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const refresh = () => {
    setRefreshing(true)
    api.refreshEndpointProtectionCoverage().then(setData).catch(() => setError(true)).finally(() => setRefreshing(false))
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-4 py-4">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-sm font-bold text-slate-700">Endpoint Protection Coverage</p>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[0.58rem] font-bold text-emerald-700">● Live</span>
          </div>
          <p className="text-[0.65rem] text-slate-400 flex items-center gap-1 mt-0.5">
            <Clock className="h-3 w-3" />
            {data ? `Scanned ${new Date(data.scanTime).toLocaleString()} · ${(data.scanDurationMs / 1000).toFixed(1)}s` : 'Scanning physical Windows and macOS devices…'}
          </p>
        </div>
        <button type="button" onClick={refresh}
          className="flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1.5 text-[0.68rem] font-semibold text-slate-500 hover:bg-slate-50">
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing || loading ? 'animate-spin text-[#6366F1]' : ''}`} />Refresh Scan
        </button>
      </div>

      {error ? (
        <p className="text-sm text-slate-400 text-center py-6">Could not load endpoint protection coverage.</p>
      ) : loading || !data ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[0, 1].map(i => <div key={i} className="h-40 rounded-2xl bg-slate-50 animate-pulse" />)}
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
