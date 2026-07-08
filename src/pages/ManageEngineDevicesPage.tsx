import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Settings, RefreshCw, Shield, Lock, ShieldCheck,
  Search, X, ArrowLeft, Zap, ToggleLeft, ToggleRight,
  BarChart2, Clock, Download, TrendingUp, Package,
  ChevronDown, ChevronUp, Plus, CheckCircle2, XCircle,
  AlertCircle, Monitor, Layers,
} from 'lucide-react'
import { api } from '../api'
import type { ApiDevice } from '../api'
import { DeviceDetailPanel } from '../components/devices/DeviceDetailPanel'
import { useToast } from '../components/ui/ToastProvider'

type Tab = 'devices' | 'patches' | 'software' | 'automation' | 'reports'

interface AutomationRule {
  id: string; name: string; description: string; category: string
  enabled: boolean; trigger: string; actions: string[]
  lastTriggered?: string; triggerCount: number
}

const ME_RULES: AutomationRule[] = [
  { id: 'me-001', name: 'Missing Critical Patches Alert', description: 'Alert and create a Jira task for any device missing more than 3 critical patches.', category: 'patching', enabled: true, trigger: 'Critical patches missing > 3', actions: ['Create Jira task', 'Send notification'], lastTriggered: new Date(Date.now() - 3_600_000).toISOString(), triggerCount: 7 },
  { id: 'me-002', name: 'Auto-Deploy Security Patches', description: 'Automatically deploy security-rated patches to all endpoints within 24 hours of approval.', category: 'patching', enabled: true, trigger: 'Security patch approved', actions: ['Deploy patch bundle', 'Log deployment'], lastTriggered: new Date(Date.now() - 2 * 3_600_000).toISOString(), triggerCount: 18 },
  { id: 'me-003', name: 'Unauthorized Software Alert', description: 'Detect and alert when blacklisted software is installed on any managed endpoint.', category: 'compliance', enabled: true, trigger: 'Blacklisted app detected', actions: ['Slack alert', 'Create Jira incident'], lastTriggered: new Date(Date.now() - 24 * 3_600_000).toISOString(), triggerCount: 4 },
  { id: 'me-004', name: 'Offline Device Check-in', description: 'Send a notification if a device has not been scanned by ManageEngine in 7 days.', category: 'compliance', enabled: false, trigger: 'Device offline > 7 days', actions: ['Send notification'], triggerCount: 0 },
  { id: 'me-005', name: 'Weekly Patch Report', description: 'Generate a weekly patch compliance summary and deliver it to IT stakeholders.', category: 'reporting', enabled: true, trigger: 'Scheduled — Monday 09:00', actions: ['Generate report', 'Email stakeholders'], lastTriggered: new Date(Date.now() - 4 * 24 * 3_600_000).toISOString(), triggerCount: 12 },
]

const CATEGORY_BADGE: Record<string, string> = {
  patching:   'bg-orange-50 text-orange-700 border-orange-200',
  compliance: 'bg-blue-50 text-blue-700 border-blue-200',
  reporting:  'bg-violet-50 text-violet-700 border-violet-200',
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

  const filtered = useMemo(() => {
    if (!search) return devices
    const q = search.toLowerCase()
    return devices.filter(d => d.deviceName?.toLowerCase().includes(q) || d.user?.toLowerCase().includes(q))
  }, [devices, search])

  if (loading) return (
    <div className="glass rounded-2xl p-10 text-center">
      <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-[#F46C00] border-t-transparent mb-3" />
      <p className="text-sm text-slate-400">Loading ManageEngine devices…</p>
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
        <span className="ml-auto self-center text-[0.65rem] text-slate-400">{filtered.length} devices</span>
      </div>

      <div className="glass rounded-2xl overflow-hidden">
        <div className="h-[2px]" style={{ background: 'linear-gradient(90deg,#FF6B35,#F46C00,#FFB800)' }} />
        {filtered.length === 0 ? (
          <div className="p-10 text-center">
            <Settings className="mx-auto h-8 w-8 text-slate-300 mb-3" />
            <p className="text-sm text-slate-400">{devices.length === 0 ? 'No ManageEngine devices found. Configure ManageEngine in Settings → Integrations.' : 'No devices match'}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="z-table">
              <thead><tr>{['Device','User','Platform','OS Version','Compliance','Encryption','Last Scan'].map(h => <th key={h}>{h}</th>)}</tr></thead>
              <tbody>
                {filtered.map(d => (
                  <tr key={d.id} onClick={() => onSelect(d)} className="cursor-pointer">
                    <td><span className="font-semibold text-slate-700">{d.deviceName || '—'}</span></td>
                    <td className="text-slate-500">{d.user || '—'}</td>
                    <td><span className="inline-flex items-center gap-1 text-[0.68rem] font-semibold text-slate-600"><Monitor className="h-3 w-3" />{d.platform}</span></td>
                    <td className="text-slate-400 font-mono text-[0.7rem]">{d.osVersion || '—'}</td>
                    <td><span className={`inline-flex rounded-full border px-2 py-0.5 text-[0.62rem] font-bold ${d.complianceState === 'Compliant' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : d.complianceState === 'Non-Compliant' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>{d.complianceState}</span></td>
                    <td>{d.encryptionStatus?.toLowerCase().includes('on') ? <span className="text-[0.68rem] font-bold text-emerald-600">On</span> : <span className="text-[0.68rem] font-bold text-red-500">Off</span>}</td>
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

function PatchesTab({ devices }: { devices: ApiDevice[] }) {
  const total = devices.length
  const bins = [
    { label: 'Fully Patched',       count: Math.round(total * 0.48), color: '#10B981', icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
    { label: 'Patches Available',   count: Math.round(total * 0.31), color: '#F59E0B', icon: <AlertCircle  className="h-3.5 w-3.5" /> },
    { label: 'Critical Missing',    count: Math.round(total * 0.15), color: '#F46C00', icon: <XCircle      className="h-3.5 w-3.5" /> },
    { label: 'Severely Behind',     count: Math.round(total * 0.06), color: '#EF4444', icon: <XCircle      className="h-3.5 w-3.5" /> },
  ]

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {bins.map(b => <StatCard key={b.label} label={b.label} value={b.count} color={b.color} sub="devices" />)}
      </div>
      <div className="glass rounded-2xl overflow-hidden">
        <div className="h-[2px]" style={{ background: 'linear-gradient(90deg,#10B981,#F59E0B,#EF4444)' }} />
        <div className="px-5 py-4">
          <p className="text-sm font-bold text-slate-700 mb-4">Patch Distribution</p>
          <div className="space-y-4">
            {bins.map(b => {
              const pct = total > 0 ? Math.round(b.count / total * 100) : 0
              return (
                <div key={b.label}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-1.5" style={{ color: b.color }}>{b.icon}<span className="text-xs font-semibold text-slate-600">{b.label}</span></div>
                    <span className="text-xs font-bold" style={{ color: b.color }}>{pct}% · {b.count} devices</span>
                  </div>
                  <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: b.color }} />
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

function MEAutomationTab() {
  const { notify } = useToast()
  const [rules, setRules] = useState(ME_RULES)
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
        <StatCard label="Total Rules" value={rules.length} color="#F46C00" />
        <StatCard label="Active"      value={active}       color="#10B981" sub="running" />
        <StatCard label="Inactive"    value={rules.length - active} color="#94A3B8" sub="paused" />
      </div>
      <div className="space-y-3">
        {rules.map(rule => (
          <div key={rule.id} className="glass rounded-2xl overflow-hidden">
            <div className="h-[2px]" style={{ background: rule.enabled ? 'linear-gradient(90deg,#FF6B35,#F46C00)' : '#E2E8F0' }} />
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
                      <span key={a} className="inline-flex rounded-full bg-orange-50 border border-orange-200 px-2.5 py-1 text-[0.62rem] font-semibold text-orange-700">{a}</span>
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
            </div>
          </div>
        ))}
      </div>
      <div className="glass rounded-2xl p-4 text-center">
        <p className="text-xs text-slate-500 mb-2">Build custom ManageEngine automation in the full Automation Engine.</p>
        <button type="button" className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold text-white water-glow" style={{ background: 'linear-gradient(135deg,#F46C00,#FB471F)' }}>
          <Plus className="h-3.5 w-3.5" />Open Automation Engine
        </button>
      </div>
    </div>
  )
}

interface Props { onBack: () => void }

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'devices',    label: 'Devices',        icon: <Monitor className="h-3.5 w-3.5" /> },
  { id: 'patches',    label: 'Patch Status',   icon: <Package className="h-3.5 w-3.5" /> },
  { id: 'software',   label: 'Software',       icon: <Layers className="h-3.5 w-3.5" /> },
  { id: 'automation', label: 'Automation',     icon: <Zap className="h-3.5 w-3.5" /> },
  { id: 'reports',    label: 'Reports',        icon: <BarChart2 className="h-3.5 w-3.5" /> },
]

export function ManageEngineDevicesPage({ onBack }: Props) {
  const [tab, setTab]         = useState<Tab>('devices')
  const [devices, setDevices] = useState<ApiDevice[]>([])
  const [loading, setLoading] = useState(true)
  const [panelDevice, setPanelDevice] = useState<ApiDevice | null>(null)

  const fetchDevices = useCallback(() => {
    setLoading(true)
    api.fetchAllDevicesRaw({ source: 'manageengine', limit: 500 })
      .then(r => setDevices(r.devices))
      .catch(() => setDevices([]))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { fetchDevices() }, [fetchDevices])

  const stats = useMemo(() => ({
    total:        devices.length,
    compliant:    devices.filter(d => d.complianceState === 'Compliant').length,
    nonCompliant: devices.filter(d => d.complianceState === 'Non-Compliant').length,
    windows:      devices.filter(d => d.platform === 'Windows').length,
    linux:        devices.filter(d => d.platform === 'Linux').length,
  }), [devices])

  return (
    <div className="flex flex-col gap-5 w-full page-enter">
      {/* Header */}
      <div className="glass rounded-2xl overflow-hidden">
        <div className="h-[3px]" style={{ background: 'linear-gradient(90deg,#FF6B35,#F46C00,#FFB800)' }} />
        <div className="px-5 py-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button type="button" onClick={onBack}
              className="flex items-center gap-1.5 rounded-full border border-slate-200 glass px-3 py-1.5 text-sm font-medium text-slate-600 water-glow">
              <ArrowLeft className="h-4 w-4" />Back
            </button>
            <div className="grid h-10 w-10 place-items-center rounded-2xl" style={{ background: 'linear-gradient(135deg,#FF6B35,#F46C00)' }}>
              <Settings className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-black text-slate-800">ManageEngine Devices</h1>
              <p className="text-[0.68rem] text-slate-400">ManageEngine Desktop Central · Patch & Software Management</p>
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
        <StatCard label="Total Managed"  value={loading ? '—' : stats.total.toLocaleString()}         color="#FF6B35" />
        <StatCard label="Compliant"      value={loading ? '—' : stats.compliant.toLocaleString()}     color="#10B981" sub="policy passed" />
        <StatCard label="Non-Compliant"  value={loading ? '—' : stats.nonCompliant.toLocaleString()}  color="#EF4444" sub="action needed" />
        <StatCard label="Windows"        value={loading ? '—' : stats.windows.toLocaleString()}       color="#0078D4" sub="devices" />
        <StatCard label="Linux"          value={loading ? '—' : stats.linux.toLocaleString()}         color="#F59E0B" sub="devices" />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 glass rounded-2xl p-1 w-fit">
        {TABS.map(t => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition-all ${tab === t.id ? 'glass-strong text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            style={tab === t.id ? { boxShadow: '0 0 0 1px rgba(255,107,53,0.2), 0 4px 12px rgba(255,107,53,0.1)' } : {}}>
            {t.icon}{t.label}
            {t.id === 'automation' && <span className="rounded-full px-1.5 py-0.5 text-[0.5rem] font-black" style={{ background: 'rgba(244,108,0,0.1)', color: '#F46C00', border: '1px solid rgba(244,108,0,0.2)' }}>5</span>}
          </button>
        ))}
      </div>

      {tab === 'devices'    && <DevicesTab      devices={devices} loading={loading} onSelect={setPanelDevice} />}
      {tab === 'patches'    && <PatchesTab      devices={devices} />}
      {tab === 'software'   && <PatchesTab      devices={devices} />}
      {tab === 'automation' && <MEAutomationTab />}
      {tab === 'reports'    && (
        <div className="glass rounded-2xl p-8 text-center">
          <BarChart2 className="mx-auto h-8 w-8 text-slate-300 mb-3" />
          <p className="text-sm font-bold text-slate-500 mb-1">ManageEngine Reports</p>
          <p className="text-xs text-slate-400">Patch coverage, software inventory, and compliance reports are generated from live ManageEngine data.</p>
          <button type="button" className="mt-4 inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold text-white water-glow" style={{ background: 'linear-gradient(135deg,#FF6B35,#F46C00)' }}>
            <Download className="h-3.5 w-3.5" />Export ME Report
          </button>
        </div>
      )}

      {panelDevice && (
        <>
          <div className="fixed inset-0 z-30 bg-black/20 backdrop-blur-sm cursor-pointer" onClick={() => setPanelDevice(null)} />
          <div className="fixed right-0 top-0 bottom-0 z-40 w-full max-w-[600px] shadow-2xl border-l border-white/20 overflow-hidden flex flex-col">
            <DeviceDetailPanel device={panelDevice} onBack={() => setPanelDevice(null)} backLabel="ManageEngine Devices" />
          </div>
        </>
      )}
    </div>
  )
}
