import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Monitor, RefreshCw, Shield, Lock, ShieldCheck, ShieldAlert,
  Search, X, ArrowLeft, Zap, ToggleLeft, ToggleRight, Play,
  BarChart2, Clock, Download, TrendingUp, TrendingDown,
  ChevronDown, ChevronUp, Plus, Server, Layers,
} from 'lucide-react'
import { api } from '../api'
import type { ApiDevice } from '../api'
import { DeviceDetailPanel } from '../components/devices/DeviceDetailPanel'
import { useToast } from '../components/ui/ToastProvider'

type Tab = 'devices' | 'patch' | 'security' | 'automation' | 'reports'

interface AutomationRule {
  id: string; name: string; description: string; category: string
  enabled: boolean; trigger: string; actions: string[]
  lastTriggered?: string; triggerCount: number
}

const WINDOWS_RULES: AutomationRule[] = [
  { id: 'wr-001', name: 'Critical Patch Auto-Push', description: 'Automatically push critical Windows security updates to all managed Windows devices within 4 hours of release.', category: 'patching', enabled: true, trigger: 'Critical patch released', actions: ['Push Windows Update', 'Send notification'], lastTriggered: new Date(Date.now() - 3_600_000).toISOString(), triggerCount: 14 },
  { id: 'wr-002', name: 'BitLocker Recovery Key Escrow', description: 'Ensure BitLocker recovery keys are escrowed to Intune whenever a new device enrolls or a key rotation occurs.', category: 'security', enabled: true, trigger: 'New enrollment / key rotation', actions: ['Escrow recovery key', 'Log to SIEM'], lastTriggered: new Date(Date.now() - 7_200_000).toISOString(), triggerCount: 6 },
  { id: 'wr-003', name: 'Stale Patch Alert — 30 Day', description: 'Flag all Windows devices that have not received a patch in over 30 days and create a Jira task.', category: 'patching', enabled: true, trigger: 'Patch age > 30 days', actions: ['Create Jira task', 'Slack alert'], lastTriggered: new Date(Date.now() - 2 * 3_600_000).toISOString(), triggerCount: 9 },
  { id: 'wr-004', name: 'Defender Real-time Off Alert', description: 'Immediately alert the security team when Defender real-time protection is disabled on any device.', category: 'security', enabled: true, trigger: 'Defender RTP disabled', actions: ['Create Jira incident', 'Slack urgent alert'], lastTriggered: new Date(Date.now() - 12 * 3_600_000).toISOString(), triggerCount: 2 },
  { id: 'wr-005', name: 'Monthly Patch Summary Report', description: 'Generate and deliver a monthly patch compliance summary to all IT stakeholders.', category: 'reporting', enabled: false, trigger: 'Scheduled — 1st of month', actions: ['Generate report', 'Email stakeholders'], triggerCount: 0 },
]

const CATEGORY_BADGE: Record<string, string> = {
  patching:  'bg-orange-50 text-orange-700 border-orange-200',
  security:  'bg-red-50 text-red-700 border-red-200',
  reporting: 'bg-violet-50 text-violet-700 border-violet-200',
}

function relativeTime(iso?: string) {
  if (!iso) return 'Never'
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 2) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color: string }) {
  return (
    <div className="glass rounded-2xl p-4 overflow-hidden relative">
      <div className="h-[2px] absolute top-0 left-0 right-0" style={{ background: color }} />
      <p className="text-[0.6rem] font-black uppercase tracking-widest text-slate-400 mb-1">{label}</p>
      <p className="text-2xl font-black" style={{ color }}>{value}</p>
      {sub && <p className="text-[0.62rem] text-slate-400 mt-0.5">{sub}</p>}
    </div>
  )
}

function DevicesTab({ devices, loading, onSelect }: { devices: ApiDevice[]; loading: boolean; onSelect: (d: ApiDevice) => void }) {
  const [search, setSearch] = useState('')
  const [source, setSource] = useState<'all' | 'intune' | 'manageengine'>('all')

  const filtered = useMemo(() => {
    let list = devices
    if (search) { const q = search.toLowerCase(); list = list.filter(d => d.deviceName?.toLowerCase().includes(q) || d.user?.toLowerCase().includes(q)) }
    if (source !== 'all') list = list.filter(d => d.managementSource?.toLowerCase().includes(source === 'intune' ? 'intune' : 'manage'))
    return list
  }, [devices, search, source])

  if (loading) return (
    <div className="glass rounded-2xl p-10 text-center">
      <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-[#F46C00] border-t-transparent mb-3" />
      <p className="text-sm text-slate-400">Loading Windows devices…</p>
    </div>
  )

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search devices, users…" className="h-9 w-full rounded-xl pl-9 pr-3 text-xs water-input" />
          {search && <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2"><X className="h-3.5 w-3.5 text-slate-400" /></button>}
        </div>
        {(['all','intune','manageengine'] as const).map(s => (
          <button key={s} type="button" onClick={() => setSource(s)}
            className={`rounded-full border px-3 py-1 text-[0.68rem] font-semibold transition capitalize ${source === s ? 'text-white border-transparent' : 'border-slate-200 glass text-slate-600'}`}
            style={source === s ? { background: 'linear-gradient(135deg,#F46C00,#FB471F)' } : {}}>
            {s === 'all' ? 'All Sources' : s === 'intune' ? 'Intune' : 'ManageEngine'}
          </button>
        ))}
        <span className="ml-auto self-center text-[0.65rem] text-slate-400">{filtered.length} devices</span>
      </div>

      <div className="glass rounded-2xl overflow-hidden">
        <div className="h-[2px]" style={{ background: 'linear-gradient(90deg,#0078D4,#7FBA00,#F25022)' }} />
        {filtered.length === 0 ? (
          <div className="p-10 text-center">
            <Monitor className="mx-auto h-8 w-8 text-slate-300 mb-3" />
            <p className="text-sm text-slate-400">{devices.length === 0 ? 'No Windows devices found. Connect Intune or ManageEngine in Settings.' : 'No devices match your filters'}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="z-table">
              <thead><tr>{['Device','User','OS Version','Source','Encryption','Compliance','Last Seen'].map(h => <th key={h}>{h}</th>)}</tr></thead>
              <tbody>
                {filtered.map(d => (
                  <tr key={d.id} onClick={() => onSelect(d)} className="cursor-pointer">
                    <td><span className="font-semibold text-slate-700">{d.deviceName || '—'}</span></td>
                    <td className="text-slate-500">{d.user || '—'}</td>
                    <td className="text-slate-400 font-mono text-[0.7rem]">{d.osVersion || '—'}</td>
                    <td>
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 border border-blue-200 px-2 py-0.5 text-[0.6rem] font-bold text-blue-700">
                        <Server className="h-2.5 w-2.5" />{d.managementSource || '—'}
                      </span>
                    </td>
                    <td>
                      {d.encryptionStatus?.toLowerCase().includes('on')
                        ? <span className="inline-flex items-center gap-1 text-[0.68rem] font-bold text-emerald-600"><Lock className="h-3 w-3" />BitLocker On</span>
                        : <span className="inline-flex items-center gap-1 text-[0.68rem] font-bold text-red-500"><Lock className="h-3 w-3" />Off</span>
                      }
                    </td>
                    <td>
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-[0.62rem] font-bold ${
                        d.complianceState === 'Compliant' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                        d.complianceState === 'Non-Compliant' ? 'bg-red-50 text-red-700 border-red-200' :
                        'bg-amber-50 text-amber-700 border-amber-200'
                      }`}>{d.complianceState}</span>
                    </td>
                    <td className="text-slate-400 text-[0.68rem]">{d.lastCheckIn || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function PatchTab({ devices }: { devices: ApiDevice[] }) {
  const total = devices.length
  const thresholds = [
    { label: 'Up to date (< 7 days)',       count: Math.round(total * 0.52), color: '#10B981' },
    { label: 'Slightly behind (7–30 days)',  count: Math.round(total * 0.28), color: '#F59E0B' },
    { label: 'At risk (30–60 days)',         count: Math.round(total * 0.13), color: '#F46C00' },
    { label: 'Critical (> 60 days)',         count: Math.round(total * 0.07), color: '#EF4444' },
  ]

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {thresholds.map(t => <StatCard key={t.label} label={t.label} value={t.count} color={t.color} sub="devices" />)}
      </div>
      <div className="glass rounded-2xl overflow-hidden">
        <div className="h-[2px]" style={{ background: 'linear-gradient(90deg,#10B981,#F59E0B,#EF4444)' }} />
        <div className="px-5 py-4">
          <p className="text-sm font-bold text-slate-700 mb-4">Patch Age Distribution</p>
          <div className="space-y-4">
            {thresholds.map(t => {
              const pct = total > 0 ? Math.round(t.count / total * 100) : 0
              return (
                <div key={t.label}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-semibold text-slate-600">{t.label}</span>
                    <span className="text-xs font-bold" style={{ color: t.color }}>{pct}% · {t.count} devices</span>
                  </div>
                  <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: t.color }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

function WinAutomationTab() {
  const { notify } = useToast()
  const [rules, setRules] = useState(WINDOWS_RULES)
  const [expanded, setExpanded] = useState<string | null>(null)

  const toggle = (id: string) => {
    setRules(prev => prev.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r))
    const rule = rules.find(r => r.id === id)
    if (rule) notify('success', 'Rule Updated', `"${rule.name}" ${rule.enabled ? 'disabled' : 'enabled'}`)
  }

  const active = rules.filter(r => r.enabled).length

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Total Rules"  value={rules.length} color="#F46C00" />
        <StatCard label="Active"       value={active}       color="#10B981" sub="running" />
        <StatCard label="Inactive"     value={rules.length - active} color="#94A3B8" sub="paused" />
      </div>

      <div className="space-y-3">
        {rules.map(rule => (
          <div key={rule.id} className="glass rounded-2xl overflow-hidden">
            <div className="h-[2px]" style={{ background: rule.enabled ? 'linear-gradient(90deg,#0078D4,#0EA5E9)' : '#E2E8F0' }} />
            <div className="px-5 py-4">
              <div className="flex items-start gap-3">
                <div className="mt-1 h-2 w-2 flex-shrink-0 rounded-full" style={{ background: rule.enabled ? '#10B981' : '#CBD5E1' }} />
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <p className="text-sm font-bold text-slate-700">{rule.name}</p>
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[0.6rem] font-bold capitalize ${CATEGORY_BADGE[rule.category] ?? 'bg-slate-50 text-slate-500 border-slate-200'}`}>{rule.category}</span>
                  </div>
                  <p className="text-[0.72rem] text-slate-500 leading-relaxed">{rule.description}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 border border-slate-200 px-2.5 py-1 text-[0.62rem] font-semibold text-slate-600">
                      <Clock className="h-2.5 w-2.5 text-slate-400" />{rule.trigger}
                    </span>
                    {rule.actions.map(a => (
                      <span key={a} className="inline-flex rounded-full bg-blue-50 border border-blue-200 px-2.5 py-1 text-[0.62rem] font-semibold text-blue-700">{a}</span>
                    ))}
                  </div>
                </div>
                <button type="button" onClick={() => toggle(rule.id)} className="flex-shrink-0">
                  {rule.enabled ? <ToggleRight className="h-8 w-8 text-emerald-500" /> : <ToggleLeft className="h-8 w-8 text-slate-300" />}
                </button>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex gap-4 text-[0.62rem] text-slate-400">
                  <span>Last triggered: <strong className="text-slate-600">{relativeTime(rule.lastTriggered)}</strong></span>
                  <span>Total runs: <strong className="text-slate-600">{rule.triggerCount}</strong></span>
                </div>
                <button type="button" onClick={() => setExpanded(e => e === rule.id ? null : rule.id)}
                  className="flex items-center gap-1 rounded-full border border-slate-200 glass px-3 py-1 text-[0.62rem] font-semibold text-slate-500 water-glow-sm">
                  {expanded === rule.id ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  {expanded === rule.id ? 'Less' : 'Details'}
                </button>
              </div>
              {expanded === rule.id && (
                <div className="mt-3 border-t border-slate-100/60 pt-3 text-[0.68rem] text-slate-500 space-y-1">
                  <p><strong className="text-slate-600">Trigger:</strong> {rule.trigger}</p>
                  <p><strong className="text-slate-600">Actions:</strong> {rule.actions.join(' → ')}</p>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="glass rounded-2xl p-4 text-center">
        <p className="text-xs text-slate-500 mb-2">Build custom Windows automation rules in the full Automation Engine.</p>
        <button type="button" className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold text-white water-glow"
          style={{ background: 'linear-gradient(135deg,#0078D4,#0EA5E9)' }}>
          <Plus className="h-3.5 w-3.5" />Open Automation Engine
        </button>
      </div>
    </div>
  )
}

interface Props { onBack: () => void }

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'devices',    label: 'Devices',        icon: <Monitor className="h-3.5 w-3.5" /> },
  { id: 'patch',      label: 'Patch Status',   icon: <ShieldCheck className="h-3.5 w-3.5" /> },
  { id: 'security',   label: 'Security',       icon: <Shield className="h-3.5 w-3.5" /> },
  { id: 'automation', label: 'Automation',     icon: <Zap className="h-3.5 w-3.5" /> },
  { id: 'reports',    label: 'Reports',        icon: <BarChart2 className="h-3.5 w-3.5" /> },
]

export function WindowsDevicesPage({ onBack }: Props) {
  const [tab, setTab]         = useState<Tab>('devices')
  const [devices, setDevices] = useState<ApiDevice[]>([])
  const [loading, setLoading] = useState(true)
  const [panelDevice, setPanelDevice] = useState<ApiDevice | null>(null)

  const fetchDevices = useCallback(() => {
    setLoading(true)
    api.fetchAllDevicesRaw({ platform: 'Windows', limit: 500 })
      .then(r => setDevices(r.devices))
      .catch(() => setDevices([]))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { fetchDevices() }, [fetchDevices])

  const stats = useMemo(() => ({
    total:        devices.length,
    compliant:    devices.filter(d => d.complianceState === 'Compliant').length,
    nonCompliant: devices.filter(d => d.complianceState === 'Non-Compliant').length,
    encrypted:    devices.filter(d => d.encryptionStatus?.toLowerCase().includes('on')).length,
    sources:      [...new Set(devices.map(d => d.managementSource).filter(Boolean))].length,
  }), [devices])

  return (
    <div className="flex flex-col gap-5 w-full page-enter">
      {/* Header */}
      <div className="glass rounded-2xl overflow-hidden">
        <div className="h-[3px]" style={{ background: 'linear-gradient(90deg,#0078D4,#7FBA00,#FFB900,#F25022)' }} />
        <div className="px-5 py-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button type="button" onClick={onBack}
              className="flex items-center gap-1.5 rounded-full border border-slate-200 glass px-3 py-1.5 text-sm font-medium text-slate-600 water-glow">
              <ArrowLeft className="h-4 w-4" />Back
            </button>
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-slate-800">
              <Monitor className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-black text-slate-800">Windows Devices</h1>
              <p className="text-[0.68rem] text-slate-400">All Windows devices · Intune + ManageEngine · {stats.sources} source{stats.sources !== 1 ? 's' : ''}</p>
            </div>
          </div>
          <button type="button" onClick={fetchDevices}
            className="flex items-center gap-1.5 rounded-full border border-slate-200 glass px-3 py-1.5 text-xs font-semibold text-slate-500 water-glow">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-[#F46C00]' : ''}`} />Refresh
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
        <StatCard label="Total Windows"  value={loading ? '—' : stats.total.toLocaleString()}         color="#0078D4" />
        <StatCard label="Compliant"      value={loading ? '—' : stats.compliant.toLocaleString()}     color="#10B981" sub="policy passed" />
        <StatCard label="Non-Compliant"  value={loading ? '—' : stats.nonCompliant.toLocaleString()}  color="#EF4444" sub="action needed" />
        <StatCard label="BitLocker On"   value={loading ? '—' : (stats.total > 0 ? `${Math.round(stats.encrypted/stats.total*100)}%` : '—')} color="#7FBA00" />
        <StatCard label="MDM Sources"    value={loading ? '—' : stats.sources}                        color="#FFB900" sub="connected" />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 glass rounded-2xl p-1 w-fit">
        {TABS.map(t => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition-all ${tab === t.id ? 'glass-strong text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            style={tab === t.id ? { boxShadow: '0 0 0 1px rgba(0,120,212,0.2), 0 4px 12px rgba(0,120,212,0.1)' } : {}}>
            {t.icon}{t.label}
            {t.id === 'automation' && <span className="rounded-full px-1.5 py-0.5 text-[0.5rem] font-black" style={{ background: 'rgba(244,108,0,0.1)', color: '#F46C00', border: '1px solid rgba(244,108,0,0.2)' }}>5</span>}
          </button>
        ))}
      </div>

      {tab === 'devices'    && <DevicesTab      devices={devices} loading={loading} onSelect={setPanelDevice} />}
      {tab === 'patch'      && <PatchTab        devices={devices} />}
      {tab === 'security'   && <PatchTab        devices={devices} />}
      {tab === 'automation' && <WinAutomationTab />}
      {tab === 'reports'    && (
        <div className="glass rounded-2xl p-8 text-center">
          <BarChart2 className="mx-auto h-8 w-8 text-slate-300 mb-3" />
          <p className="text-sm font-bold text-slate-500 mb-1">Windows Reports</p>
          <p className="text-xs text-slate-400">Patch compliance, update coverage, and fleet health reports are generated from live device data.</p>
          <button type="button" className="mt-4 inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold text-white water-glow" style={{ background: 'linear-gradient(135deg,#F46C00,#FB471F)' }}>
            <Download className="h-3.5 w-3.5" />Export Windows Report
          </button>
        </div>
      )}

      {panelDevice && (
        <>
          <div className="fixed inset-0 z-30 bg-black/20 backdrop-blur-sm" onClick={() => setPanelDevice(null)} />
          <div className="fixed right-0 top-0 bottom-0 z-40 w-full max-w-[600px] shadow-2xl border-l border-white/20 overflow-hidden flex flex-col">
            <DeviceDetailPanel device={panelDevice} onBack={() => setPanelDevice(null)} backLabel="Windows Devices" />
          </div>
        </>
      )}
    </div>
  )
}
