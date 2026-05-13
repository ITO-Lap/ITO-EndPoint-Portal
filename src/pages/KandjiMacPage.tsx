import { useState, useEffect, useMemo } from 'react'
import {
  Apple, ArrowLeft, RefreshCw, Shield, Lock, ShieldCheck, ShieldAlert,
  AlertTriangle, Package, CheckCircle, XCircle, Search, X,
  Flame, ClipboardList, Layers, LayoutGrid, BookMarked, Info,
} from 'lucide-react'
import { api } from '../api'
import type { ApiDevice, LibraryApp } from '../api'
import { DeviceDetailPanel } from '../components/devices/DeviceDetailPanel'
import { useColumnResize } from '../hooks/useColumnResize'

// ─── Fallback mock library apps (shown when Kandji isn't configured) ───────────

const MOCK_LIBRARY_APPS: LibraryApp[] = [
  { id: '1',  name: 'CrowdStrike Falcon',          category: 'Auto App',   active: true,  enforcement: 'Continuous'    },
  { id: '2',  name: 'Google Chrome',               category: 'Auto App',   active: true,  enforcement: 'Install Once'  },
  { id: '3',  name: 'Slack',                       category: 'Auto App',   active: true,  enforcement: 'Install Once'  },
  { id: '4',  name: '1Password',                   category: 'VPP App',    active: true,  enforcement: 'Install Once'  },
  { id: '5',  name: 'Zoom',                        category: 'Auto App',   active: true,  enforcement: 'Install Once'  },
  { id: '6',  name: 'Microsoft 365 Apps',          category: 'VPP App',    active: true,  enforcement: 'Continuous'    },
  { id: '7',  name: 'Security Hardening Profile',  category: 'Profile',    active: true,  enforcement: 'Continuous'    },
  { id: '8',  name: 'FileVault Enforcement',       category: 'Profile',    active: true,  enforcement: 'Continuous'    },
  { id: '9',  name: 'Firewall Policy',             category: 'Profile',    active: true,  enforcement: 'Continuous'    },
  { id: '10', name: 'Okta Device Trust',           category: 'Profile',    active: true,  enforcement: 'Continuous'    },
  { id: '11', name: 'Wi-Fi Configuration',         category: 'Profile',    active: true,  enforcement: 'Continuous'    },
  { id: '12', name: 'Patch Compliance Check',      category: 'Script',     active: true,  enforcement: 'Continuous'    },
  { id: '13', name: 'macOS Update Enforcer',       category: 'Script',     active: true,  enforcement: 'Run Once'      },
  { id: '14', name: 'Rosetta 2',                   category: 'Auto App',   active: true,  enforcement: 'Install Once'  },
  { id: '15', name: 'Visual Studio Code',          category: 'Custom App', active: true,  enforcement: 'Install Once'  },
  { id: '16', name: 'Figma',                       category: 'VPP App',    active: true,  enforcement: 'Install Once'  },
  { id: '17', name: 'IT Self-Service Portal',      category: 'Web App',    active: true,  enforcement: 'No Enforcement'},
  { id: '18', name: 'Xcode CLI Tools',             category: 'Custom App', active: false, enforcement: 'Install Once'  },
  { id: '19', name: 'Printer Configuration',       category: 'Printer',    active: true,  enforcement: 'No Enforcement'},
  { id: '20', name: 'Notion',                      category: 'VPP App',    active: true,  enforcement: 'Install Once'  },
]

// ─── Column definitions ────────────────────────────────────────────────────────

const DEVICE_COLS = [
  { key: 'device',     label: 'Device',             min: 120, default: 200 },
  { key: 'user',       label: 'User',               min:  80, default: 140 },
  { key: 'model',      label: 'Model',              min:  80, default: 140 },
  { key: 'macos',      label: 'macOS',              min:  80, default: 100 },
  { key: 'blueprint',  label: 'Blueprint / Policy', min: 100, default: 180 },
  { key: 'checkin',    label: 'Last Check-in',      min: 100, default: 140 },
  { key: 'filevault',  label: 'FileVault',          min:  80, default: 100 },
  { key: 'compliance', label: 'Compliance',         min:  80, default: 110 },
  { key: 'actions',    label: '',                   min:  40, default:  50, noResize: true },
] as const
type DColKey = typeof DEVICE_COLS[number]['key']

const SECURITY_COLS = [
  { key: 'device',   label: 'Device',           min: 120, default: 180 },
  { key: 'user',     label: 'User',             min:  80, default: 130 },
  { key: 'fv',       label: 'FileVault',        min:  70, default:  90 },
  { key: 'edr',      label: 'EDR Agent',        min:  80, default: 120 },
  { key: 'fw',       label: 'Firewall',         min:  70, default:  90 },
  { key: 'policies', label: 'Applied Policies', min: 100, default: 160 },
  { key: 'checkin',  label: 'Last Check-in',    min: 100, default: 140 },
  { key: 'risk',     label: 'Risk',             min:  60, default:  80 },
  { key: 'actions',  label: '',                 min:  40, default:  50, noResize: true },
] as const
type SColKey = typeof SECURITY_COLS[number]['key']

const APP_COLS = [
  { key: 'name',        label: 'Name',        min: 120, default: 280 },
  { key: 'category',    label: 'Category',    min:  80, default: 130 },
  { key: 'enforcement', label: 'Enforcement', min:  80, default: 130 },
  { key: 'status',      label: 'Status',      min:  60, default:  90, noResize: true },
] as const
type AColKey = typeof APP_COLS[number]['key']

// ─── Types ─────────────────────────────────────────────────────────────────────

type Tab = 'devices' | 'applications' | 'security'

interface Props {
  onBack: () => void
  onViewDevice?: (deviceName: string) => void
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function extractModelBase(model?: string): string {
  if (!model) return 'Mac'
  const m = model.match(/^(MacBook Pro|MacBook Air|Mac mini|Mac Pro|Mac Studio|iMac|MacBook)/i)
  return m?.[1] ?? model.split('(')[0].trim()
}

function extractMajorMinor(osVersion?: string): string {
  const m = (osVersion ?? '').match(/(\d+\.\d+)/)
  return m?.[1] ?? osVersion ?? 'Unknown'
}

function filevaultOn(d: ApiDevice): boolean {
  return (d.encryptionStatus ?? '').toLowerCase().includes('on')
}

function edrLabel(d: ApiDevice): string {
  const av = d.antivirusStatus
  if (!av || av === '—' || av === 'None') return ''
  return av
}

function firewallEnabled(d: ApiDevice): boolean {
  return d.firewallStatus === 'Enabled'
}

function categoryIcon(cat: string): React.ReactNode {
  switch (cat) {
    case 'Auto App':   return <Package    className="h-3.5 w-3.5 text-orange-500" />
    case 'Custom App': return <Layers     className="h-3.5 w-3.5 text-amber-500"  />
    case 'VPP App':    return <LayoutGrid className="h-3.5 w-3.5 text-lime-600"   />
    case 'Script':     return <ClipboardList className="h-3.5 w-3.5 text-slate-500" />
    case 'Profile':    return <Shield     className="h-3.5 w-3.5 text-orange-500" />
    case 'Web App':    return <BookMarked className="h-3.5 w-3.5 text-slate-400"  />
    default:           return <Package    className="h-3.5 w-3.5 text-slate-400"  />
  }
}

const CATEGORY_COLORS: Record<string, string> = {
  'Auto App':   'bg-orange-100 text-orange-700 border-orange-200',
  'Custom App': 'bg-amber-100 text-amber-700 border-amber-200',
  'VPP App':    'bg-lime-100 text-lime-700 border-lime-200',
  'Script':     'bg-slate-100 text-slate-600 border-slate-200',
  'Profile':    'bg-orange-50 text-orange-600 border-orange-200',
  'Web App':    'bg-slate-50 text-slate-500 border-slate-200',
  'Printer':    'bg-slate-50 text-slate-500 border-slate-200',
}

function categoryBadge(cat: string): string {
  return CATEGORY_COLORS[cat] ?? 'bg-slate-50 text-slate-500 border-slate-200'
}

function metricBar(label: string, value: number, total: number, color: string, icon: React.ReactNode) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0
  const barColor =
    color === 'emerald' ? 'bg-emerald-500' :
    color === 'orange'  ? 'bg-orange-500'  :
    color === 'amber'   ? 'bg-amber-500'   :
    color === 'red'     ? 'bg-red-500'     : 'bg-slate-400'
  const textColor =
    color === 'emerald' ? 'text-emerald-600' :
    color === 'orange'  ? 'text-orange-600'  :
    color === 'amber'   ? 'text-amber-600'   :
    color === 'red'     ? 'text-red-600'     : 'text-slate-600'
  const borderColor =
    color === 'emerald' ? 'border-emerald-200' :
    color === 'orange'  ? 'border-orange-200'  :
    color === 'amber'   ? 'border-amber-200'   :
    color === 'red'     ? 'border-red-200'     : 'border-slate-200'
  return (
    <div key={label} className={`bg-white rounded-2xl border ${borderColor} shadow-sm px-4 py-4 flex flex-col gap-3`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-xs font-semibold text-slate-700">{label}</span>
        </div>
        <span className={`text-lg font-black ${textColor}`}>{pct}%</span>
      </div>
      <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
        <div className={`h-2 rounded-full ${barColor} transition-all duration-700`} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-[0.65rem] text-slate-400">
        <span className={`font-semibold ${textColor}`}>{value.toLocaleString()}</span> of {total.toLocaleString()} devices
      </p>
    </div>
  )
}

// ─── Devices Tab ───────────────────────────────────────────────────────────────

function DevicesTab({
  devices,
  loading,
  onSelectDevice,
}: {
  devices: ApiDevice[]
  loading: boolean
  onSelectDevice: (d: ApiDevice) => void
}) {
  const { widths: dw, startResize: dResize, totalWidth: dTotal } = useColumnResize<DColKey>(DEVICE_COLS, 'kandji-devices')
  const [search, setSearch] = useState('')
  const [activeModel, setActiveModel] = useState<string | null>(null)
  const [activeOS, setActiveOS] = useState<string | null>(null)
  const [activeCompliance, setActiveCompliance] = useState<string | null>(null)

  const modelBreakdown = useMemo(() => {
    const map: Record<string, number> = {}
    devices.forEach(d => { const k = extractModelBase(d.model); map[k] = (map[k] ?? 0) + 1 })
    return Object.entries(map).sort((a, b) => b[1] - a[1]).map(([key, count]) => ({ key, count }))
  }, [devices])

  const osBreakdown = useMemo(() => {
    const map: Record<string, number> = {}
    devices.forEach(d => { const k = extractMajorMinor(d.osVersion); map[k] = (map[k] ?? 0) + 1 })
    return Object.entries(map).sort((a, b) => b[1] - a[1]).map(([key, count]) => ({ key, count }))
  }, [devices])

  const complianceBreakdown = useMemo(() => {
    const map: Record<string, number> = {}
    devices.forEach(d => { map[d.complianceState] = (map[d.complianceState] ?? 0) + 1 })
    return Object.entries(map).sort().map(([key, count]) => ({ key, count }))
  }, [devices])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return devices.filter(d => {
      if (activeModel && extractModelBase(d.model) !== activeModel) return false
      if (activeOS && extractMajorMinor(d.osVersion) !== activeOS) return false
      if (activeCompliance && d.complianceState !== activeCompliance) return false
      if (q && !d.deviceName.toLowerCase().includes(q) && !d.user.toLowerCase().includes(q) && !(d.osVersion ?? '').toLowerCase().includes(q)) return false
      return true
    })
  }, [devices, search, activeModel, activeOS, activeCompliance])

  if (loading) return (
    <div className="flex items-center justify-center py-24 text-slate-400 gap-2">
      <RefreshCw className="h-4 w-4 animate-spin" /><span className="text-sm">Loading devices…</span>
    </div>
  )

  function Chips({ label, items, active, onToggle }: {
    label: string; items: { key: string; count: number }[]; active: string | null; onToggle: (k: string) => void
  }) {
    if (!items.length) return null
    return (
      <div>
        <p className="text-[0.6rem] font-semibold text-slate-400 uppercase tracking-wide mb-2">{label}</p>
        <div className="flex flex-wrap gap-1.5">
          {items.map(({ key, count }) => {
            const isA = active === key
            return (
              <button key={key} type="button" onClick={() => onToggle(key)}
                className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition ${isA ? 'border-orange-400 bg-orange-50 text-orange-700 ring-1 ring-orange-200' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
                {key}
                <span className={`rounded-full px-1 text-[0.58rem] font-bold ${isA ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-500'}`}>{count}</span>
              </button>
            )
          })}
          {active && <button type="button" onClick={() => onToggle(active)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-400 hover:bg-slate-50 transition">Clear ×</button>}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Filter chips */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-5 py-4 flex flex-col gap-4">
        <Chips label="By Model" items={modelBreakdown} active={activeModel} onToggle={k => setActiveModel(p => p === k ? null : k)} />
        <Chips label="By macOS Version" items={osBreakdown} active={activeOS} onToggle={k => setActiveOS(p => p === k ? null : k)} />
        <Chips label="By Compliance" items={complianceBreakdown} active={activeCompliance} onToggle={k => setActiveCompliance(p => p === k ? null : k)} />
        {(activeModel || activeOS || activeCompliance) && (
          <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
            <span className="text-xs text-slate-500">{filtered.length} of {devices.length} devices</span>
            <button type="button" onClick={() => { setActiveModel(null); setActiveOS(null); setActiveCompliance(null) }} className="text-xs font-medium text-orange-600 hover:text-orange-700">Clear all</button>
          </div>
        )}
      </div>

      {/* Search */}
      <div className="relative max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search devices, users…"
          className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-4 py-2 text-sm text-slate-700 placeholder:text-slate-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-orange-400" />
        {search && <button type="button" onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><X className="h-3 w-3" /></button>}
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-2">
            <Apple className="h-8 w-8 opacity-30" /><p className="text-sm">No devices match filters</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="text-sm" style={{ tableLayout: 'fixed', width: dTotal }}>
              <colgroup>
                {DEVICE_COLS.map(col => <col key={col.key} style={{ width: dw[col.key] }} />)}
              </colgroup>
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-left">
                  {DEVICE_COLS.map(col => (
                    <th key={col.key} className="relative px-4 py-3 text-[0.6rem] font-semibold uppercase tracking-wide text-slate-400 whitespace-nowrap overflow-hidden" style={{ width: dw[col.key] }}>
                      {col.label}
                      {!col.noResize && (
                        <span
                          className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-orange-400/50 active:bg-orange-500 transition-colors"
                          onMouseDown={e => dResize(col.key, e)}
                          onClick={e => e.stopPropagation()}
                        />
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((d, i) => {
                  const fv = filevaultOn(d)
                  return (
                    <tr key={d.id} onClick={() => onSelectDevice(d)}
                      className={`border-b border-slate-100 last:border-0 transition hover:bg-slate-50 cursor-pointer ${i % 2 !== 0 ? 'bg-slate-50/40' : ''}`}>
                      <td className="px-4 py-3 overflow-hidden">
                        <div className="flex items-center gap-2">
                          <Apple className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                          <span className="font-medium text-slate-800 truncate">{d.deviceName}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs overflow-hidden"><span className="truncate block">{d.user}</span></td>
                      <td className="px-4 py-3 text-xs text-slate-500 overflow-hidden"><span className="truncate block">{d.model ? extractModelBase(d.model) : '—'}</span></td>
                      <td className="px-4 py-3 text-xs font-mono text-slate-500 overflow-hidden"><span className="truncate block">{d.osVersion}</span></td>
                      <td className="px-4 py-3 overflow-hidden">
                        {d.appliedPolicies && d.appliedPolicies.length > 0 ? (
                          <span className="inline-flex items-center gap-1 text-xs text-slate-500 max-w-full">
                            <Shield className="h-3 w-3 text-orange-400 flex-shrink-0" />
                            <span className="truncate">{d.appliedPolicies[0]}</span>
                            {d.appliedPolicies.length > 1 && <span className="text-[0.6rem] text-slate-400 flex-shrink-0">+{d.appliedPolicies.length - 1}</span>}
                          </span>
                        ) : <span className="text-xs text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 overflow-hidden"><span className="truncate block">{d.lastCheckIn}</span></td>
                      <td className="px-4 py-3 overflow-hidden">
                        {fv
                          ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[0.6rem] font-bold text-emerald-700"><CheckCircle className="h-2.5 w-2.5" />On</span>
                          : <span className="inline-flex items-center gap-1 rounded-full bg-red-50 border border-red-200 px-2 py-0.5 text-[0.6rem] font-bold text-red-600"><XCircle className="h-2.5 w-2.5" />Off</span>
                        }
                      </td>
                      <td className="px-4 py-3 overflow-hidden">
                        {d.complianceState === 'Compliant'
                          ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[0.6rem] font-bold text-emerald-700"><ShieldCheck className="h-2.5 w-2.5" />Compliant</span>
                          : d.complianceState === 'Warning'
                          ? <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[0.6rem] font-bold text-amber-700"><AlertTriangle className="h-2.5 w-2.5" />Warning</span>
                          : <span className="inline-flex items-center gap-1 rounded-full bg-red-50 border border-red-200 px-2 py-0.5 text-[0.6rem] font-bold text-red-600"><ShieldAlert className="h-2.5 w-2.5" />Non-Compliant</span>
                        }
                      </td>
                      <td className="px-4 py-3 overflow-hidden">
                        <button type="button" onClick={e => { e.stopPropagation(); onSelectDevice(d) }}
                          className="rounded-lg p-1 hover:bg-orange-50 text-slate-400 hover:text-orange-600 transition">
                          <Info className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50 text-xs text-slate-400">
              Showing {filtered.length.toLocaleString()} of {devices.length.toLocaleString()} Mac devices
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Applications Tab ──────────────────────────────────────────────────────────

function ApplicationsTab({ apps, loading }: { apps: LibraryApp[]; loading: boolean }) {
  const { widths: aw, startResize: aResize, totalWidth: aTotal } = useColumnResize<AColKey>(APP_COLS, 'kandji-apps')
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [activeStatus, setActiveStatus] = useState<'All' | 'Active' | 'Inactive'>('All')

  const categories = useMemo(() => {
    const map: Record<string, number> = {}
    apps.forEach(a => { map[a.category] = (map[a.category] ?? 0) + 1 })
    return Object.entries(map).sort((a, b) => b[1] - a[1]).map(([key, count]) => ({ key, count }))
  }, [apps])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return apps.filter(a => {
      if (activeCategory && a.category !== activeCategory) return false
      if (activeStatus === 'Active' && !a.active) return false
      if (activeStatus === 'Inactive' && a.active) return false
      if (q && !a.name.toLowerCase().includes(q) && !a.category.toLowerCase().includes(q)) return false
      return true
    })
  }, [apps, search, activeCategory, activeStatus])

  if (loading) return (
    <div className="flex items-center justify-center py-24 text-slate-400 gap-2">
      <RefreshCw className="h-4 w-4 animate-spin" /><span className="text-sm">Loading library apps…</span>
    </div>
  )

  const activeCount = apps.filter(a => a.active).length
  const inactiveCount = apps.length - activeCount

  return (
    <div className="flex flex-col gap-4">
      {/* Summary bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-4 py-3 flex items-center gap-3">
          <div className="rounded-xl bg-orange-100 p-2"><Package className="h-4 w-4 text-orange-600" /></div>
          <div><p className="text-lg font-black text-slate-800">{apps.length}</p><p className="text-[0.62rem] text-slate-400 font-medium">Total Items</p></div>
        </div>
        <div className="bg-white rounded-2xl border border-emerald-200 shadow-sm px-4 py-3 flex items-center gap-3">
          <div className="rounded-xl bg-emerald-100 p-2"><CheckCircle className="h-4 w-4 text-emerald-600" /></div>
          <div><p className="text-lg font-black text-emerald-600">{activeCount}</p><p className="text-[0.62rem] text-slate-400 font-medium">Active</p></div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-4 py-3 flex items-center gap-3">
          <div className="rounded-xl bg-slate-100 p-2"><XCircle className="h-4 w-4 text-slate-500" /></div>
          <div><p className="text-lg font-black text-slate-500">{inactiveCount}</p><p className="text-[0.62rem] text-slate-400 font-medium">Inactive</p></div>
        </div>
        <div className="bg-white rounded-2xl border border-lime-200 shadow-sm px-4 py-3 flex items-center gap-3">
          <div className="rounded-xl bg-lime-100 p-2"><Layers className="h-4 w-4 text-lime-600" /></div>
          <div><p className="text-lg font-black text-lime-600">{categories.length}</p><p className="text-[0.62rem] text-slate-400 font-medium">Categories</p></div>
        </div>
      </div>

      {/* Category chips + filters */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-5 py-4 flex flex-col gap-4">
        <div>
          <p className="text-[0.6rem] font-semibold text-slate-400 uppercase tracking-wide mb-2">By Category</p>
          <div className="flex flex-wrap gap-1.5">
            {categories.map(({ key, count }) => {
              const isA = activeCategory === key
              return (
                <button key={key} type="button" onClick={() => setActiveCategory(p => p === key ? null : key)}
                  className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition ${isA ? 'border-orange-400 bg-orange-50 text-orange-700 ring-1 ring-orange-200' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
                  {categoryIcon(key)}{key}
                  <span className={`rounded-full px-1 text-[0.58rem] font-bold ${isA ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-500'}`}>{count}</span>
                </button>
              )
            })}
            {activeCategory && <button type="button" onClick={() => setActiveCategory(null)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-400 hover:bg-slate-50">Clear ×</button>}
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search apps, profiles, scripts…"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-4 py-2 text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-orange-400" />
            {search && <button type="button" onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><X className="h-3 w-3" /></button>}
          </div>
          <div className="flex rounded-xl border border-slate-200 bg-slate-50 overflow-hidden text-xs">
            {(['All', 'Active', 'Inactive'] as const).map(s => (
              <button key={s} type="button" onClick={() => setActiveStatus(s)}
                className={`px-3 py-2 font-medium transition ${activeStatus === s ? 'bg-orange-500 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>{s}</button>
            ))}
          </div>
          <span className="text-xs text-slate-400 ml-auto">{filtered.length} item{filtered.length !== 1 ? 's' : ''}</span>
        </div>
      </div>

      {/* Apps table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 text-slate-400 gap-2">
            <Package className="h-7 w-7 opacity-30" /><p className="text-sm">No items match your filters</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="text-sm" style={{ tableLayout: 'fixed', width: aTotal }}>
              <colgroup>
                {APP_COLS.map(col => <col key={col.key} style={{ width: aw[col.key] }} />)}
              </colgroup>
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-left">
                  {APP_COLS.map(col => (
                    <th key={col.key} className="relative px-4 py-3 text-[0.6rem] font-semibold uppercase tracking-wide text-slate-400 overflow-hidden" style={{ width: aw[col.key] }}>
                      {col.label}
                      {!col.noResize && (
                        <span
                          className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-orange-400/50 active:bg-orange-500 transition-colors"
                          onMouseDown={e => aResize(col.key, e)}
                          onClick={e => e.stopPropagation()}
                        />
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((app, i) => (
                  <tr key={app.id} className={`border-b border-slate-100 last:border-0 ${i % 2 !== 0 ? 'bg-slate-50/40' : ''}`}>
                    <td className="px-4 py-3 overflow-hidden">
                      <div className="flex items-center gap-2">
                        {categoryIcon(app.category)}
                        <span className="font-medium text-slate-800 text-xs truncate">{app.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 overflow-hidden">
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[0.6rem] font-bold ${categoryBadge(app.category)}`}>
                        {app.category}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 overflow-hidden"><span className="truncate block">{app.enforcement}</span></td>
                    <td className="px-4 py-3 overflow-hidden">
                      {app.active
                        ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[0.6rem] font-bold text-emerald-700"><CheckCircle className="h-2.5 w-2.5" />Active</span>
                        : <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 border border-slate-200 px-2 py-0.5 text-[0.6rem] font-bold text-slate-500"><XCircle className="h-2.5 w-2.5" />Inactive</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50 text-xs text-slate-400">
              {filtered.length} of {apps.length} library items
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Security Tab ──────────────────────────────────────────────────────────────

type GapFilter = 'filevault' | 'edr' | 'firewall' | 'compliance' | null

function SecurityTab({
  devices,
  loading,
  onSelectDevice,
}: {
  devices: ApiDevice[]
  loading: boolean
  onSelectDevice: (d: ApiDevice) => void
}) {
  const { widths: sw, startResize: sResize, totalWidth: sTotal } = useColumnResize<SColKey>(SECURITY_COLS, 'kandji-security')
  const [search, setSearch] = useState('')
  const [riskFilter, setRiskFilter] = useState<'All' | 'At Risk' | 'Secure'>('All')
  const [gapFilter, setGapFilter] = useState<GapFilter>(null)

  const total = devices.length

  const secStats = useMemo(() => ({
    filevaultOn:   devices.filter(d => filevaultOn(d)).length,
    edrActive:     devices.filter(d => !!edrLabel(d)).length,
    firewallOn:    devices.filter(d => firewallEnabled(d)).length,
    compliant:     devices.filter(d => d.complianceState === 'Compliant').length,
    noFileVault:   devices.filter(d => !filevaultOn(d)).length,
    noEdr:         devices.filter(d => !edrLabel(d)).length,
    noFirewall:    devices.filter(d => !firewallEnabled(d)).length,
    nonCompliant:  devices.filter(d => d.complianceState !== 'Compliant').length,
  }), [devices])

  function isAtRisk(d: ApiDevice): boolean {
    return !filevaultOn(d) || !edrLabel(d) || d.complianceState !== 'Compliant'
  }

  function matchesGap(d: ApiDevice, gap: GapFilter): boolean {
    if (!gap) return true
    if (gap === 'filevault')  return !filevaultOn(d)
    if (gap === 'edr')        return !edrLabel(d)
    if (gap === 'firewall')   return !firewallEnabled(d)
    if (gap === 'compliance') return d.complianceState !== 'Compliant'
    return true
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return devices.filter(d => {
      if (riskFilter === 'At Risk' && !isAtRisk(d)) return false
      if (riskFilter === 'Secure' && isAtRisk(d)) return false
      if (!matchesGap(d, gapFilter)) return false
      if (q && !d.deviceName.toLowerCase().includes(q) && !d.user.toLowerCase().includes(q)) return false
      return true
    })
  }, [devices, search, riskFilter, gapFilter])

  function toggleGap(gap: GapFilter) {
    setGapFilter(prev => prev === gap ? null : gap)
    setRiskFilter('All')
  }

  if (loading) return (
    <div className="flex items-center justify-center py-24 text-slate-400 gap-2">
      <RefreshCw className="h-4 w-4 animate-spin" /><span className="text-sm">Loading security data…</span>
    </div>
  )

  const GAP_LABEL: Record<NonNullable<GapFilter>, string> = {
    filevault:  'No FileVault',
    edr:        'No EDR',
    firewall:   'No Firewall',
    compliance: 'Non-Compliant',
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Security metric bars */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {metricBar('FileVault Encryption', secStats.filevaultOn, total, 'emerald', <Lock className="h-3.5 w-3.5 text-emerald-500" />)}
        {metricBar('EDR / CrowdStrike', secStats.edrActive, total, 'orange', <Shield className="h-3.5 w-3.5 text-orange-500" />)}
        {metricBar('macOS Firewall', secStats.firewallOn, total, 'amber', <Flame className="h-3.5 w-3.5 text-amber-500" />)}
        {metricBar('MDM Compliance', secStats.compliant, total, 'emerald', <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />)}
      </div>

      {/* Risk summary chips — clickable to filter the table */}
      {total > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-5 py-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[0.6rem] font-semibold text-slate-400 uppercase tracking-wide">Security Gaps — click to filter devices</p>
            {gapFilter && (
              <button type="button" onClick={() => setGapFilter(null)}
                className="flex items-center gap-1 text-[0.65rem] font-medium text-slate-500 hover:text-slate-700 transition">
                <X className="h-3 w-3" />Clear filter
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {secStats.noFileVault > 0 && (
              <button type="button" onClick={() => toggleGap('filevault')}
                className={`flex items-center gap-2 rounded-xl border px-3 py-2 transition-all ${
                  gapFilter === 'filevault'
                    ? 'border-red-400 bg-red-100 ring-2 ring-red-200 shadow-sm'
                    : 'border-red-200 bg-red-50 hover:bg-red-100 hover:border-red-300'
                }`}>
                <Lock className="h-3.5 w-3.5 text-red-500" />
                <span className="text-xs font-semibold text-red-700">{secStats.noFileVault} without FileVault</span>
                {gapFilter === 'filevault' && <X className="h-3 w-3 text-red-400 ml-1" />}
              </button>
            )}
            {secStats.noEdr > 0 && (
              <button type="button" onClick={() => toggleGap('edr')}
                className={`flex items-center gap-2 rounded-xl border px-3 py-2 transition-all ${
                  gapFilter === 'edr'
                    ? 'border-orange-400 bg-orange-100 ring-2 ring-orange-200 shadow-sm'
                    : 'border-orange-200 bg-orange-50 hover:bg-orange-100 hover:border-orange-300'
                }`}>
                <Shield className="h-3.5 w-3.5 text-orange-500" />
                <span className="text-xs font-semibold text-orange-700">{secStats.noEdr} without EDR</span>
                {gapFilter === 'edr' && <X className="h-3 w-3 text-orange-400 ml-1" />}
              </button>
            )}
            {secStats.noFirewall > 0 && (
              <button type="button" onClick={() => toggleGap('firewall')}
                className={`flex items-center gap-2 rounded-xl border px-3 py-2 transition-all ${
                  gapFilter === 'firewall'
                    ? 'border-amber-400 bg-amber-100 ring-2 ring-amber-200 shadow-sm'
                    : 'border-amber-200 bg-amber-50 hover:bg-amber-100 hover:border-amber-300'
                }`}>
                <Flame className="h-3.5 w-3.5 text-amber-500" />
                <span className="text-xs font-semibold text-amber-700">{secStats.noFirewall} without Firewall</span>
                {gapFilter === 'firewall' && <X className="h-3 w-3 text-amber-400 ml-1" />}
              </button>
            )}
            {secStats.nonCompliant > 0 && (
              <button type="button" onClick={() => toggleGap('compliance')}
                className={`flex items-center gap-2 rounded-xl border px-3 py-2 transition-all ${
                  gapFilter === 'compliance'
                    ? 'border-red-400 bg-red-100 ring-2 ring-red-200 shadow-sm'
                    : 'border-red-200 bg-red-50 hover:bg-red-100 hover:border-red-300'
                }`}>
                <ShieldAlert className="h-3.5 w-3.5 text-red-500" />
                <span className="text-xs font-semibold text-red-700">{secStats.nonCompliant} non-compliant</span>
                {gapFilter === 'compliance' && <X className="h-3 w-3 text-red-400 ml-1" />}
              </button>
            )}
            {secStats.noFileVault === 0 && secStats.noEdr === 0 && secStats.nonCompliant === 0 && (
              <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
                <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
                <span className="text-xs font-semibold text-emerald-700">No security gaps detected</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search devices…"
            className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-4 py-2 text-xs text-slate-700 placeholder:text-slate-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-orange-400" />
          {search && <button type="button" onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><X className="h-3 w-3" /></button>}
        </div>
        <div className="flex rounded-xl border border-slate-200 bg-slate-50 overflow-hidden text-xs">
          {(['All', 'At Risk', 'Secure'] as const).map(f => (
            <button key={f} type="button" onClick={() => { setRiskFilter(f); setGapFilter(null) }}
              className={`px-3 py-2 font-medium transition ${riskFilter === f && !gapFilter ? (f === 'At Risk' ? 'bg-red-500 text-white' : 'bg-orange-500 text-white') : 'text-slate-600 hover:bg-slate-100'}`}>{f}</button>
          ))}
        </div>
        {gapFilter && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-800 px-2.5 py-1 text-[0.65rem] font-semibold text-white">
            Filtered: {GAP_LABEL[gapFilter]}
          </span>
        )}
        <span className="text-xs text-slate-400 ml-auto">{filtered.length} device{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Security table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-2">
            <ShieldCheck className="h-7 w-7 opacity-30" /><p className="text-sm">No devices match filters</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="text-sm" style={{ tableLayout: 'fixed', width: sTotal }}>
              <colgroup>
                {SECURITY_COLS.map(col => <col key={col.key} style={{ width: sw[col.key] }} />)}
              </colgroup>
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-left">
                  {SECURITY_COLS.map(col => (
                    <th key={col.key} className="relative px-4 py-3 text-[0.6rem] font-semibold uppercase tracking-wide text-slate-400 whitespace-nowrap overflow-hidden" style={{ width: sw[col.key] }}>
                      {col.label}
                      {!col.noResize && (
                        <span
                          className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-orange-400/50 active:bg-orange-500 transition-colors"
                          onMouseDown={e => sResize(col.key, e)}
                          onClick={e => e.stopPropagation()}
                        />
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((d, i) => {
                  const fv  = filevaultOn(d)
                  const edr = edrLabel(d)
                  const fw  = firewallEnabled(d)
                  const atRisk = !fv || !edr || d.complianceState !== 'Compliant'
                  const policyCount = d.appliedPolicies?.length ?? 0

                  return (
                    <tr key={d.id} onClick={() => onSelectDevice(d)}
                      className={`border-b border-slate-100 last:border-0 transition hover:bg-slate-50 cursor-pointer ${i % 2 !== 0 ? 'bg-slate-50/40' : ''}`}>
                      <td className="px-4 py-3 overflow-hidden">
                        <div className="flex items-center gap-2">
                          <Apple className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                          <span className="font-medium text-slate-800 text-xs truncate">{d.deviceName}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 overflow-hidden"><span className="truncate block">{d.user}</span></td>
                      <td className="px-4 py-3 overflow-hidden">
                        {fv
                          ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[0.6rem] font-bold text-emerald-700"><CheckCircle className="h-2.5 w-2.5" />On</span>
                          : <span className="inline-flex items-center gap-1 rounded-full bg-red-50 border border-red-200 px-2 py-0.5 text-[0.6rem] font-bold text-red-600"><XCircle className="h-2.5 w-2.5" />Off</span>
                        }
                      </td>
                      <td className="px-4 py-3 overflow-hidden">
                        {edr
                          ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[0.6rem] font-bold text-emerald-700"><CheckCircle className="h-2.5 w-2.5" /><span className="truncate">{edr}</span></span>
                          : <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 border border-orange-200 px-2 py-0.5 text-[0.6rem] font-bold text-orange-600"><AlertTriangle className="h-2.5 w-2.5" />Not detected</span>
                        }
                      </td>
                      <td className="px-4 py-3 overflow-hidden">
                        {fw
                          ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[0.6rem] font-bold text-emerald-700"><CheckCircle className="h-2.5 w-2.5" />Enabled</span>
                          : <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[0.6rem] font-bold text-amber-600"><AlertTriangle className="h-2.5 w-2.5" />Unknown</span>
                        }
                      </td>
                      <td className="px-4 py-3 overflow-hidden">
                        {policyCount > 0
                          ? <span className="inline-flex items-center gap-1 text-xs text-slate-600"><Shield className="h-3 w-3 text-orange-400 flex-shrink-0" />{policyCount} polic{policyCount !== 1 ? 'ies' : 'y'}</span>
                          : <span className="text-xs text-slate-300">—</span>
                        }
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 overflow-hidden"><span className="truncate block">{d.lastCheckIn}</span></td>
                      <td className="px-4 py-3 overflow-hidden">
                        {atRisk
                          ? <span className="inline-flex items-center gap-1 rounded-full bg-red-50 border border-red-200 px-2 py-0.5 text-[0.6rem] font-bold text-red-600"><AlertTriangle className="h-2.5 w-2.5" />At Risk</span>
                          : <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[0.6rem] font-bold text-emerald-700"><CheckCircle className="h-2.5 w-2.5" />Secure</span>
                        }
                      </td>
                      <td className="px-4 py-3 overflow-hidden">
                        <button type="button" onClick={e => { e.stopPropagation(); onSelectDevice(d) }}
                          className="rounded-lg p-1 hover:bg-orange-50 text-slate-400 hover:text-orange-600 transition">
                          <Info className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50 text-xs text-slate-400">
              {filtered.length.toLocaleString()} of {devices.length.toLocaleString()} Mac devices
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'devices',      label: 'Devices',      icon: <Apple        className="h-3.5 w-3.5" /> },
  { id: 'applications', label: 'Applications', icon: <Package      className="h-3.5 w-3.5" /> },
  { id: 'security',     label: 'Security',     icon: <Shield       className="h-3.5 w-3.5" /> },
]

export function KandjiMacPage({ onBack, onViewDevice }: Props) {
  const [tab, setTab] = useState<Tab>('devices')
  const [devices, setDevices] = useState<ApiDevice[]>([])
  const [kandjiApps, setKandjiApps] = useState<LibraryApp[]>([])
  const [loadingDevices, setLoadingDevices] = useState(true)
  const [loadingApps, setLoadingApps] = useState(true)
  const [usingMockApps, setUsingMockApps] = useState(false)
  const [panelDevice, setPanelDevice] = useState<ApiDevice | null>(null)

  const fetchAll = () => {
    setLoadingDevices(true)
    setLoadingApps(true)

    api.fetchAllDevicesRaw({ platform: 'macOS', limit: 500 })
      .then(r => setDevices(r.devices))
      .catch(() => setDevices([]))
      .finally(() => setLoadingDevices(false))

    api.fetchKandjiApps()
      .then(apps => { setKandjiApps(apps); setUsingMockApps(false) })
      .catch(() => { setKandjiApps(MOCK_LIBRARY_APPS); setUsingMockApps(true) })
      .finally(() => setLoadingApps(false))
  }

  useEffect(() => { fetchAll() }, [])

  const stats = useMemo(() => {
    const total = devices.length
    const filevaultOn_ = devices.filter(d => filevaultOn(d)).length
    const edrActive = devices.filter(d => !!edrLabel(d)).length
    const compliant = devices.filter(d => d.complianceState === 'Compliant').length
    const warning = devices.filter(d => d.complianceState === 'Warning').length
    const nonCompliant = devices.filter(d => d.complianceState === 'Non-Compliant').length
    return { total, filevaultOn: filevaultOn_, edrActive, compliant, warning, nonCompliant }
  }, [devices])

  const isLoading = loadingDevices && loadingApps

  return (
    <div className="flex flex-col gap-5 w-full">

      {/* ── Header ── */}
      <div className="flex items-center gap-3 flex-wrap">
        <button type="button" onClick={onBack}
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 shadow-sm hover:bg-slate-50 hover:border-slate-300 transition">
          <ArrowLeft className="h-4 w-4" />Dashboard
        </button>
        <div className="flex items-center gap-2.5">
          <div className="grid h-9 w-9 place-items-center rounded-2xl bg-slate-100 border border-slate-200">
            <Apple className="h-5 w-5 text-slate-700" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Mac Devices</h1>
            <p className="text-xs text-slate-500 mt-0.5">Managed by Kandji — device, application & security reports</p>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {usingMockApps && (
            <span className="hidden sm:inline-flex items-center rounded-full bg-amber-50 border border-amber-200 px-2.5 py-0.5 text-[0.65rem] font-semibold text-amber-700">
              Demo library data — configure Kandji for live
            </span>
          )}
          <button type="button" onClick={fetchAll}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium text-slate-500 shadow-sm transition ${isLoading ? 'border-orange-300 bg-orange-50 animate-pulse' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin text-orange-500' : ''}`} />Refresh
          </button>
        </div>
      </div>

      {/* ── Overview stat cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-4 py-3 flex items-center gap-3">
          <div className="rounded-xl bg-slate-100 p-2"><Apple className="h-4 w-4 text-slate-600" /></div>
          <div><p className="text-2xl font-black text-slate-800">{loadingDevices ? '—' : stats.total.toLocaleString()}</p><p className="text-[0.62rem] text-slate-400 font-medium">Total Macs</p></div>
        </div>
        <div className="bg-white rounded-2xl border border-emerald-200 shadow-sm px-4 py-3 flex items-center gap-3">
          <div className="rounded-xl bg-emerald-100 p-2"><Lock className="h-4 w-4 text-emerald-600" /></div>
          <div>
            <p className="text-2xl font-black text-emerald-600">{loadingDevices ? '—' : stats.total > 0 ? `${Math.round(stats.filevaultOn / stats.total * 100)}%` : '—'}</p>
            <p className="text-[0.62rem] text-slate-400 font-medium">FileVault On</p>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-orange-200 shadow-sm px-4 py-3 flex items-center gap-3">
          <div className="rounded-xl bg-orange-100 p-2"><Shield className="h-4 w-4 text-orange-600" /></div>
          <div>
            <p className="text-2xl font-black text-orange-600">{loadingDevices ? '—' : stats.total > 0 ? `${Math.round(stats.edrActive / stats.total * 100)}%` : '—'}</p>
            <p className="text-[0.62rem] text-slate-400 font-medium">EDR Active</p>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-emerald-200 shadow-sm px-4 py-3 flex items-center gap-3">
          <div className="rounded-xl bg-emerald-100 p-2"><ShieldCheck className="h-4 w-4 text-emerald-600" /></div>
          <div>
            <p className="text-2xl font-black text-emerald-600">{loadingDevices ? '—' : stats.compliant.toLocaleString()}</p>
            <p className="text-[0.62rem] text-slate-400 font-medium">Compliant</p>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-red-200 shadow-sm px-4 py-3 flex items-center gap-3">
          <div className="rounded-xl bg-red-100 p-2"><ShieldAlert className="h-4 w-4 text-red-600" /></div>
          <div>
            <p className="text-2xl font-black text-red-600">{loadingDevices ? '—' : (stats.warning + stats.nonCompliant).toLocaleString()}</p>
            <p className="text-[0.62rem] text-slate-400 font-medium">Needs Attention</p>
          </div>
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div className="flex gap-1 bg-slate-100 rounded-2xl p-1 w-fit">
        {TABS.map(t => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all ${
              tab === t.id
                ? 'bg-white text-slate-800 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* ── Tab content ── */}
      {tab === 'devices'      && <DevicesTab      devices={devices} loading={loadingDevices} onSelectDevice={setPanelDevice} />}
      {tab === 'applications' && <ApplicationsTab apps={kandjiApps} loading={loadingApps} />}
      {tab === 'security'     && <SecurityTab     devices={devices} loading={loadingDevices} onSelectDevice={setPanelDevice} />}

      {/* ── Device detail panel (overlay) ── */}
      {panelDevice && (
        <>
          <div
            className="fixed inset-0 z-30 bg-black/30 backdrop-blur-[1px]"
            onClick={() => setPanelDevice(null)}
            aria-hidden
          />
          <div className="fixed right-0 top-0 bottom-0 z-40 w-full max-w-[600px] shadow-2xl border-l border-slate-200 overflow-hidden flex flex-col">
            <DeviceDetailPanel
              device={panelDevice}
              onBack={() => setPanelDevice(null)}
              backLabel="Mac Devices"
            />
          </div>
        </>
      )}

    </div>
  )
}
