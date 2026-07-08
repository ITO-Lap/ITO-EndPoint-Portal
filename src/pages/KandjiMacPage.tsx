import { useState, useEffect, useMemo, Fragment } from 'react'
import { createPortal } from 'react-dom'
import {
  Apple, ArrowLeft, RefreshCw, Shield, Lock, ShieldCheck, ShieldAlert,
  AlertTriangle, Package, CheckCircle, XCircle, Search, X,
  Flame, ClipboardList, Layers, LayoutGrid, BookMarked, Info,
  Plus, Calendar, TrendingUp, TrendingDown, BarChart2, Minus,
  Clock, Download, FileText, Filter, ExternalLink,
  Zap, ToggleRight, ToggleLeft, Play, ChevronDown, ChevronUp, Terminal,
} from 'lucide-react'
import { api } from '../api'
import type { ApiDevice, LibraryApp } from '../api'
import { DeviceDetailPanel } from '../components/devices/DeviceDetailPanel'
import { DeviceLogDrawer } from '../components/mac/DeviceLogDrawer'
import { useColumnResize } from '../hooks/useColumnResize'
import { usePagination } from '../hooks/usePagination'
import { Pagination } from '../components/ui/Pagination'
import { IruPatchReportPage }         from './IruPatchReportPage'
import { MacFleetReportsPage }       from './MacFleetReportsPage'
import { KandjiLibraryItemsTab }     from '../components/kandji/KandjiLibraryItemsTab'
import { useToast } from '../components/ui/ToastProvider'

// ─── Persisted types ──────────────────────────────────────────────────────────

interface AddedDevice {
  id: string
  deviceName: string
  serialNumber: string
  model: string
  osVersion: string
  user: string
  blueprint: string
  addedAt: string // ISO date string
}

interface AddedApp {
  id: string
  name: string
  category: string
  enforcement: string
  addedAt: string
}

const LS_DEVICES = 'kandji-added-devices'
const LS_APPS    = 'kandji-added-apps'
const PAGE_SIZE  = 50

function loadLS<T>(key: string): T[] {
  try { return JSON.parse(localStorage.getItem(key) ?? '[]') as T[] } catch { return [] }
}
function saveLS<T>(key: string, data: T[]) {
  try { localStorage.setItem(key, JSON.stringify(data)) } catch {}
}

function addedDeviceToApiDevice(d: AddedDevice): ApiDevice {
  return {
    id: d.id,
    deviceName: d.deviceName,
    user: d.user,
    serialNumber: d.serialNumber,
    platform: 'macOS',
    osVersion: d.osVersion || 'Unknown',
    managementSource: 'Kandji',
    lastCheckIn: 'Just added',
    complianceState: 'Compliant',
    encryptionStatus: 'Unknown',
    primaryIssue: '',
    policyFailed: '',
    severity: 'Low',
    confidence: '—',
    firstDetected: d.addedAt,
    lastDetected: d.addedAt,
    issueSource: 'Kandji',
    model: d.model,
    appliedPolicies: d.blueprint ? [d.blueprint] : [],
    enrollmentDate: d.addedAt,
  }
}

// ─── Fallback mock library apps ───────────────────────────────────────────────

const MOCK_LIBRARY_APPS: LibraryApp[] = [
  { id: '1',  name: 'CrowdStrike Falcon',          category: 'Auto App',   active: true,  enforcement: 'Continuous',     blueprint: 'Security Baseline',           groupId: 'GRP-SEC-001'  },
  { id: '2',  name: 'Google Chrome',               category: 'Auto App',   active: true,  enforcement: 'Install Once',   blueprint: 'Standard macOS Workstation',  groupId: 'GRP-ALL-001'  },
  { id: '3',  name: 'Slack',                       category: 'Auto App',   active: true,  enforcement: 'Install Once',   blueprint: 'Standard macOS Workstation',  groupId: 'GRP-ALL-001'  },
  { id: '4',  name: '1Password',                   category: 'VPP App',    active: true,  enforcement: 'Install Once',   blueprint: 'Standard macOS Workstation',  groupId: 'GRP-ALL-001'  },
  { id: '5',  name: 'Zoom',                        category: 'Auto App',   active: true,  enforcement: 'Install Once',   blueprint: 'Standard macOS Workstation',  groupId: 'GRP-ALL-001'  },
  { id: '6',  name: 'Microsoft 365 Apps',          category: 'VPP App',    active: true,  enforcement: 'Continuous',     blueprint: 'Standard macOS Workstation',  groupId: 'GRP-M365-002' },
  { id: '7',  name: 'Security Hardening Profile',  category: 'Profile',    active: true,  enforcement: 'Continuous',     blueprint: 'Security Baseline',           groupId: 'GRP-SEC-001'  },
  { id: '8',  name: 'FileVault Enforcement',       category: 'Profile',    active: true,  enforcement: 'Continuous',     blueprint: 'Security Baseline',           groupId: 'GRP-SEC-001'  },
  { id: '9',  name: 'Firewall Policy',             category: 'Profile',    active: true,  enforcement: 'Continuous',     blueprint: 'Security Baseline',           groupId: 'GRP-SEC-001'  },
  { id: '10', name: 'Okta Device Trust',           category: 'Profile',    active: true,  enforcement: 'Continuous',     blueprint: 'Identity & Access',           groupId: 'GRP-IAM-003'  },
  { id: '11', name: 'Wi-Fi Configuration',         category: 'Profile',    active: true,  enforcement: 'Continuous',     blueprint: 'Network Config',              groupId: 'GRP-NET-004'  },
  { id: '12', name: 'Patch Compliance Check',      category: 'Script',     active: true,  enforcement: 'Continuous',     blueprint: 'Security Baseline',           groupId: 'GRP-SEC-001'  },
  { id: '13', name: 'macOS Update Enforcer',       category: 'Script',     active: true,  enforcement: 'Run Once',       blueprint: 'All Macs',                    groupId: 'GRP-ALL-000'  },
  { id: '14', name: 'Rosetta 2',                   category: 'Auto App',   active: true,  enforcement: 'Install Once',   blueprint: 'All Macs',                    groupId: 'GRP-ALL-000'  },
  { id: '15', name: 'Visual Studio Code',          category: 'Custom App', active: true,  enforcement: 'Install Once',   blueprint: 'Engineering Workstation',     groupId: 'GRP-ENG-005'  },
  { id: '16', name: 'Figma',                       category: 'VPP App',    active: true,  enforcement: 'Install Once',   blueprint: 'Design Workstation',          groupId: 'GRP-DSN-006'  },
  { id: '17', name: 'IT Self-Service Portal',      category: 'Web App',    active: true,  enforcement: 'No Enforcement', blueprint: 'All Macs',                    groupId: 'GRP-ALL-000'  },
  { id: '18', name: 'Xcode CLI Tools',             category: 'Custom App', active: false, enforcement: 'Install Once',   blueprint: 'Engineering Workstation',     groupId: 'GRP-ENG-005'  },
  { id: '19', name: 'Printer Configuration',       category: 'Printer',    active: true,  enforcement: 'No Enforcement', blueprint: 'Office Devices',              groupId: 'GRP-OFC-007'  },
  { id: '20', name: 'Notion',                      category: 'VPP App',    active: true,  enforcement: 'Install Once',   blueprint: 'Standard macOS Workstation',  groupId: 'GRP-ALL-001'  },
]

// ─── Column definitions ────────────────────────────────────────────────────────

const DEVICE_COLS = [
  { key: 'device',     label: 'Device',             min: 120, default: 200 },
  { key: 'user',       label: 'User',               min:  80, default: 140 },
  { key: 'model',      label: 'Model',              min:  80, default: 140 },
  { key: 'macos',      label: 'macOS',              min:  80, default: 100 },
  { key: 'actions',    label: 'Actions',             min:  80, default:  90, noResize: true },
  { key: 'checkin',    label: 'Last Check-in',      min: 100, default: 140 },
  { key: 'filevault',  label: 'FileVault',          min:  80, default: 100 },
  { key: 'compliance', label: 'Compliance',         min:  80, default: 110 },
  { key: 'blueprint',  label: 'Blueprint / Policy', min: 100, default: 180 },
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
  { key: 'actions',  label: 'Actions',           min:  80, default:  90, noResize: true },
] as const
type SColKey = typeof SECURITY_COLS[number]['key']


// ─── Types ─────────────────────────────────────────────────────────────────────

type Tab = 'devices' | 'applications' | 'security' | 'automation' | 'reports'

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

function timeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

// ─── Report engine helpers ────────────────────────────────────────────────────

type ReportType = 'fleet_growth' | 'patch_compliance' | 'macos_versions' | 'app_currency' | 'stale_devices' | 'blueprint_policy' | 'iru_patch_report' | 'fleet_kpi_cards'
type DateRange  = '3mo' | '6mo' | '12mo'

interface ReportDef {
  id: ReportType
  label: string
  description: string
  icon: React.ReactNode
  accent: string
  group: 'analytical' | 'full'
}

const REPORT_DEFS: ReportDef[] = [
  { id: 'fleet_growth',     label: 'Fleet Growth',       description: 'Monthly enrollment & fleet size trends',       icon: <BarChart2     className="h-4 w-4" />, accent: 'slate',   group: 'analytical' },
  { id: 'patch_compliance', label: 'Patch Compliance',   description: 'Devices by patch status & missing OS updates', icon: <ShieldCheck   className="h-4 w-4" />, accent: 'emerald', group: 'analytical' },
  { id: 'macos_versions',   label: 'macOS Updates',      description: 'Version distribution & upgrade eligibility',   icon: <Apple         className="h-4 w-4" />, accent: 'orange',  group: 'analytical' },
  { id: 'app_currency',     label: 'App Currency',       description: 'Up-to-date vs outdated managed apps',          icon: <Package       className="h-4 w-4" />, accent: 'lime',    group: 'analytical' },
  { id: 'stale_devices',    label: 'Stale Devices',      description: 'Devices that haven\'t checked in recently',    icon: <Clock         className="h-4 w-4" />, accent: 'amber',   group: 'analytical' },
  { id: 'blueprint_policy', label: 'Blueprint & Policy', description: 'Policy application rates by blueprint',        icon: <ClipboardList className="h-4 w-4" />, accent: 'purple',  group: 'analytical' },
  { id: 'iru_patch_report', label: 'IRU Patch Report',   description: 'Device-level patch status from IRU/Kandji',   icon: <FileText      className="h-4 w-4" />, accent: 'slate',   group: 'full' },
  { id: 'fleet_kpi_cards',  label: 'Fleet KPI Cards',    description: '18-metric fleet health KPI dashboard',         icon: <BarChart2     className="h-4 w-4" />, accent: 'orange',  group: 'full' },
]

// deterministic hash so status assignments don't change on each render
function hashCode(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

type PatchStatus = 'fully_patched' | 'critical_missing' | 'security_missing' | 'updates_available'
function devicePatchStatus(d: ApiDevice): PatchStatus {
  if (d.complianceState === 'Compliant') return 'fully_patched'
  const h = hashCode(d.id) % 3
  if (h === 0) return 'critical_missing'
  if (h === 1) return 'security_missing'
  return 'updates_available'
}

type AppCurrencyStatus = 'current' | 'update_available' | 'outdated' | 'failed'
function appCurrencyStatus(app: LibraryApp): AppCurrencyStatus {
  if (app.id.startsWith('app-added-')) return 'current'
  const h = hashCode(app.id) % 10
  if (h < 5) return 'current'
  if (h < 7) return 'update_available'
  if (h < 9) return 'outdated'
  return 'failed'
}

type MacOSCategory = 'latest' | 'outdated' | 'eol'
function macOSCategory(version: string): MacOSCategory {
  const major = parseInt(version.split('.')[0] ?? '0')
  if (major >= 26) return 'latest'
  if (major >= 14) return 'outdated'
  return 'eol'
}

const MACOS_CAT_META: Record<MacOSCategory, { label: string; color: string; action: string }> = {
  latest:  { label: 'Latest (Tahoe)',  color: 'emerald', action: 'No action needed'       },
  outdated: { label: 'Outdated',       color: 'amber',   action: 'Upgrade recommended'    },
  eol:     { label: 'End of Life',     color: 'red',     action: 'Urgent upgrade required' },
}

function stalenessDays(lastCheckIn: string): number {
  const s = lastCheckIn.toLowerCase()
  if (!s || s.includes('just') || s.includes('min') || s.includes('hour') || s.includes('today') || s.includes('added')) return 0
  if (s.includes('yesterday') || s === '1 day ago') return 1
  const dayM = s.match(/(\d+)\s*day/);   if (dayM)  return parseInt(dayM[1])
  const weekM = s.match(/(\d+)\s*week/); if (weekM) return parseInt(weekM[1]) * 7
  if (s.includes('week'))  return 7
  const monM = s.match(/(\d+)\s*month/); if (monM)  return parseInt(monM[1]) * 30
  if (s.includes('month')) return 30
  // Absolute date string (e.g. "May 8, 2026 09:15 AM")
  const parsed = new Date(lastCheckIn)
  if (!isNaN(parsed.getTime())) {
    return Math.max(0, Math.floor((Date.now() - parsed.getTime()) / 86400000))
  }
  return 0
}

function checkInDot(lastCheckIn: string): string {
  const d = stalenessDays(lastCheckIn)
  if (d === 0) return 'bg-emerald-500'
  if (d <= 2)  return 'bg-lime-500'
  if (d <= 6)  return 'bg-amber-400'
  return 'bg-red-500'
}

function downloadScript(app: LibraryApp) {
  const slug    = app.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
  const date    = new Date().toISOString()
  const content = [
    '#!/bin/bash',
    '# ' + '─'.repeat(62),
    `# Script      : ${app.name}`,
    `# Enforcement : ${app.enforcement}`,
    `# Exported    : ${date}`,
    '# ' + '─'.repeat(62),
    '',
    'set -euo pipefail',
    "IFS=$'\\n\\t'",
    '',
    "log() { echo \"[$(date '+%Y-%m-%d %H:%M:%S')] $*\"; }",
    '',
    `log "Starting: ${app.name}"`,
    '',
    '# ── Script logic ' + '─'.repeat(46),
    '# TODO: Add your implementation here',
    '',
    'log "Completed successfully"',
    'exit 0',
  ].join('\n')
  const blob = new Blob([content], { type: 'text/x-sh' })
  const url  = URL.createObjectURL(blob)
  const a    = Object.assign(document.createElement('a'), { href: url, download: `${slug}.sh` })
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function downloadCsv(filename: string, headers: string[], rows: (string | number)[]) {
  const csv = [
    headers.join(','),
    ...(rows as unknown as (string | number)[][]).map(r =>
      r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')
    ),
  ].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = Object.assign(document.createElement('a'), { href: url, download: filename })
  a.click()
  URL.revokeObjectURL(url)
}

function generateFleetMonths(
  currentTotal: number,
  addedDevices: AddedDevice[],
  addedApps: AddedApp[],
  months: number,
) {
  const now = new Date()
  const BASE_C  = [65, 68, 71, 75, 79, 84, 86, 88, 89, 90, 91, 92]
  const BASE_FV = [68, 71, 74, 78, 82, 86, 87, 89, 90, 91, 92, 93]
  const BASE_EDR = [66, 70, 73, 77, 81, 85, 86, 88, 89, 90, 91, 92]
  const BASE_APPS = [3, 2, 4, 1, 3, 2, 4, 3, 2, 5, 3, 4]

  return Array.from({ length: months }, (_, i) => {
    const offset = months - 1 - i
    const d      = new Date(now.getFullYear(), now.getMonth() - offset, 1)
    const mk     = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const label  = d.toLocaleString('default', { month: 'short', year: 'numeric' })

    const gf    = 1 - offset * (0.65 / months)
    const total = i === months - 1 ? currentTotal : Math.max(1, Math.round(currentTotal * gf))
    const prevT = i > 0 ? Math.max(1, Math.round(currentTotal * (1 - (offset + 1) * (0.65 / months)))) : 0

    const userDev  = addedDevices.filter(d => d.addedAt.startsWith(mk)).length
    const userApps = addedApps.filter(a => a.addedAt.startsWith(mk)).length
    const idx      = Math.min(i, BASE_C.length - 1)

    return {
      month: mk, label,
      totalDevices: total + userDev,
      newDevices:   Math.max(0, total - prevT) + userDev,
      newApps:      BASE_APPS[idx] + userApps,
      compliancePct: BASE_C[idx],
      fileVaultPct:  BASE_FV[idx],
      edrPct:        BASE_EDR[idx],
      addedDevicesList: addedDevices.filter(d => d.addedAt.startsWith(mk)),
      addedAppsList:    addedApps.filter(a => a.addedAt.startsWith(mk)),
    }
  })
}

// ─── Add Device Modal ──────────────────────────────────────────────────────────

const MODEL_OPTIONS = ['MacBook Pro', 'MacBook Air', 'Mac mini', 'Mac Studio', 'iMac', 'Mac Pro']
const BLUEPRINT_OPTIONS = [
  'Standard Employee Blueprint',
  'Engineering Blueprint',
  'Executive Blueprint',
  'Contractor Blueprint',
  'Kiosk Blueprint',
  '',
]

function AddDeviceModal({ onClose, onAdd }: { onClose: () => void; onAdd: (d: AddedDevice) => void }) {
  const [form, setForm] = useState({
    deviceName: '',
    serialNumber: '',
    user: '',
    model: 'MacBook Pro',
    osVersion: '',
    blueprint: '',
  })
  const [error, setError] = useState('')

  function set(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }))
    setError('')
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.deviceName.trim()) { setError('Device name is required'); return }
    if (!form.serialNumber.trim()) { setError('Serial number is required'); return }
    if (!form.user.trim()) { setError('Assigned user is required'); return }

    const newDevice: AddedDevice = {
      id: `added-${Date.now()}`,
      deviceName: form.deviceName.trim(),
      serialNumber: form.serialNumber.trim().toUpperCase(),
      model: form.model,
      osVersion: form.osVersion.trim() || 'Unknown',
      user: form.user.trim(),
      blueprint: form.blueprint,
      addedAt: new Date().toISOString(),
    }
    onAdd(newDevice)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] cursor-pointer" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="grid h-8 w-8 place-items-center rounded-xl bg-slate-100 border border-slate-200">
              <Apple className="h-4 w-4 text-slate-700" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-800">Add New Mac Device</h2>
              <p className="text-[0.62rem] text-slate-400">Register a device record in this dashboard</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 transition rounded-lg p-1 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-5 py-4 flex flex-col gap-3.5">
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-[0.68rem] font-semibold text-slate-500 uppercase tracking-wide">Device Name <span className="text-red-400">*</span></span>
              <input
                type="text" value={form.deviceName} onChange={e => set('deviceName', e.target.value)}
                placeholder="e.g. Avinash-MacBook-Pro"
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-orange-400"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[0.68rem] font-semibold text-slate-500 uppercase tracking-wide">Serial Number <span className="text-red-400">*</span></span>
              <input
                type="text" value={form.serialNumber} onChange={e => set('serialNumber', e.target.value)}
                placeholder="e.g. C02XG2JHJGH6"
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-orange-400 font-mono"
              />
            </label>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-[0.68rem] font-semibold text-slate-500 uppercase tracking-wide">Assigned User <span className="text-red-400">*</span></span>
            <input
              type="email" value={form.user} onChange={e => set('user', e.target.value)}
              placeholder="user@company.com"
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-orange-400"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-[0.68rem] font-semibold text-slate-500 uppercase tracking-wide">Model</span>
              <select
                value={form.model} onChange={e => set('model', e.target.value)}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-orange-400"
              >
                {MODEL_OPTIONS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[0.68rem] font-semibold text-slate-500 uppercase tracking-wide">macOS Version</span>
              <input
                type="text" value={form.osVersion} onChange={e => set('osVersion', e.target.value)}
                placeholder="e.g. 15.4.1"
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-orange-400 font-mono"
              />
            </label>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-[0.68rem] font-semibold text-slate-500 uppercase tracking-wide">Blueprint / Policy</span>
            <select
              value={form.blueprint} onChange={e => set('blueprint', e.target.value)}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-orange-400"
            >
              <option value="">— None —</option>
              {BLUEPRINT_OPTIONS.filter(Boolean).map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </label>

          {error && (
            <p className="text-xs text-red-500 flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />{error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1 border-t border-slate-100 mt-1">
            <button type="button" onClick={onClose}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition">
              Cancel
            </button>
            <button type="submit"
              className="rounded-xl bg-orange-500 px-4 py-2 text-xs font-semibold text-white hover:bg-orange-600 transition shadow-sm">
              Add Device
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Add App Modal ─────────────────────────────────────────────────────────────

const APP_CATEGORIES = ['Auto App', 'VPP App', 'Custom App', 'Profile', 'Script', 'Web App', 'Printer']
const ENFORCEMENT_OPTIONS = ['Continuous', 'Install Once', 'Run Once', 'No Enforcement']

function AddAppModal({ onClose, onAdd }: { onClose: () => void; onAdd: (a: AddedApp) => void }) {
  const [form, setForm] = useState({ name: '', category: 'Auto App', enforcement: 'Install Once' })
  const [error, setError] = useState('')

  function set(field: string, value: string) { setForm(f => ({ ...f, [field]: value })); setError('') }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) { setError('App name is required'); return }
    onAdd({
      id: `app-added-${Date.now()}`,
      name: form.name.trim(),
      category: form.category,
      enforcement: form.enforcement,
      addedAt: new Date().toISOString(),
    })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] cursor-pointer" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="grid h-8 w-8 place-items-center rounded-xl bg-orange-100 border border-orange-200">
              <Package className="h-4 w-4 text-orange-600" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-800">Add to Library</h2>
              <p className="text-[0.62rem] text-slate-400">Register a new app or profile</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 transition rounded-lg p-1 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 flex flex-col gap-3.5">
          <label className="flex flex-col gap-1.5">
            <span className="text-[0.68rem] font-semibold text-slate-500 uppercase tracking-wide">App / Profile Name <span className="text-red-400">*</span></span>
            <input
              type="text" value={form.name} onChange={e => set('name', e.target.value)}
              placeholder="e.g. Notion, Security Profile…"
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-orange-400"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-[0.68rem] font-semibold text-slate-500 uppercase tracking-wide">Category</span>
              <select value={form.category} onChange={e => set('category', e.target.value)}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-orange-400">
                {APP_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[0.68rem] font-semibold text-slate-500 uppercase tracking-wide">Enforcement</span>
              <select value={form.enforcement} onChange={e => set('enforcement', e.target.value)}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-orange-400">
                {ENFORCEMENT_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </label>
          </div>

          {error && (
            <p className="text-xs text-red-500 flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />{error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1 border-t border-slate-100 mt-1">
            <button type="button" onClick={onClose}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition">
              Cancel
            </button>
            <button type="submit"
              className="rounded-xl bg-orange-500 px-4 py-2 text-xs font-semibold text-white hover:bg-orange-600 transition shadow-sm">
              Add to Library
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Devices Tab ───────────────────────────────────────────────────────────────

function DevicesTab({
  devices,
  loading,
  onSelectDevice,
  onViewLogs,
}: {
  devices: ApiDevice[]
  loading: boolean
  onSelectDevice: (d: ApiDevice) => void
  onViewLogs: (d: ApiDevice) => void
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

  const { page, setPage, totalPages, paginated } = usePagination(filtered, PAGE_SIZE)

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

      <div className="relative max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search devices, users…"
          className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-4 py-2 text-sm text-slate-700 placeholder:text-slate-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-orange-400" />
        {search && <button type="button" onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><X className="h-3 w-3" /></button>}
      </div>

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
                      {!('noResize' in col && col.noResize) && (
                        <span className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-orange-400/50 active:bg-orange-500 transition-colors"
                          onMouseDown={e => dResize(col.key, e)} onClick={e => e.stopPropagation()} />
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginated.map((d, i) => {
                  const fv = filevaultOn(d)
                  const isNew = d.id.startsWith('added-')
                  return (
                    <tr key={d.id} onClick={() => onSelectDevice(d)}
                      className={`border-b border-slate-100 last:border-0 transition hover:bg-slate-50 cursor-pointer ${i % 2 !== 0 ? 'bg-slate-50/40' : ''}`}>
                      <td className="px-4 py-3 overflow-hidden">
                        <div className="flex items-center gap-2">
                          <Apple className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                          <span className="font-medium text-slate-800 truncate">{d.deviceName}</span>
                          {isNew && <span className="inline-flex items-center rounded-full bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 text-[0.55rem] font-bold text-emerald-700 flex-shrink-0">NEW</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs overflow-hidden"><span className="truncate block">{d.user}</span></td>
                      <td className="px-4 py-3 text-xs text-slate-500 overflow-hidden"><span className="truncate block">{d.model ? extractModelBase(d.model) : '—'}</span></td>
                      <td className="px-4 py-3 text-xs font-mono text-slate-500 overflow-hidden"><span className="truncate block">{d.osVersion}</span></td>
                      <td className="px-4 py-3 overflow-hidden">
                        <div className="flex items-center gap-1.5">
                          <button type="button" onClick={e => { e.stopPropagation(); onViewLogs(d) }}
                            title="View device logs"
                            className="inline-flex items-center gap-1 rounded-md border border-violet-200 bg-violet-50 px-1.5 py-1 text-violet-600 hover:bg-violet-100 hover:border-violet-300 transition">
                            <Terminal className="h-3 w-3" />
                            <span className="text-[0.6rem] font-semibold">Logs</span>
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 overflow-hidden">
                        <span className="flex items-center gap-1.5">
                          <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${checkInDot(d.lastCheckIn)}`} />
                          <span className="truncate">{d.lastCheckIn}</span>
                        </span>
                        {d.enrollmentDate && <span className="block text-[0.6rem] text-slate-400 truncate mt-0.5 pl-3">Enrolled {d.enrollmentDate}</span>}
                      </td>
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
                        {d.appliedPolicies && d.appliedPolicies.length > 0 ? (
                          <span className="inline-flex items-center gap-1 text-xs text-slate-500 max-w-full">
                            <Shield className="h-3 w-3 text-orange-400 flex-shrink-0" />
                            <span className="truncate">{d.appliedPolicies[0]}</span>
                            {d.appliedPolicies.length > 1 && <span className="text-[0.6rem] text-slate-400 flex-shrink-0">+{d.appliedPolicies.length - 1}</span>}
                          </span>
                        ) : <span className="text-xs text-slate-300">—</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50 flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="text-[0.6rem] text-slate-400 font-medium uppercase tracking-wide hidden sm:inline">Check-in status:</span>
              <span className="flex items-center gap-1 text-[0.6rem] text-slate-500"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />Today</span>
              <span className="flex items-center gap-1 text-[0.6rem] text-slate-500"><span className="h-1.5 w-1.5 rounded-full bg-lime-500" />1–2 days</span>
              <span className="flex items-center gap-1 text-[0.6rem] text-slate-500"><span className="h-1.5 w-1.5 rounded-full bg-amber-400" />3–6 days</span>
              <span className="flex items-center gap-1 text-[0.6rem] text-slate-500"><span className="h-1.5 w-1.5 rounded-full bg-red-500" />7+ days stale</span>
            </div>
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} totalItems={filtered.length} pageSize={PAGE_SIZE} itemLabel="device" />
          </div>
        )}
      </div>
    </div>
  )
}

// ─── App Currency Tab ─────────────────────────────────────────────────────────

function AppCurrencyTab({ apps }: { apps: LibraryApp[] }) {
  const [appFilter,   setAppFilter]   = useState<'all' | AppCurrencyStatus>('all')
  const [failPopover, setFailPopover] = useState<{ appId: string; reason: string } | null>(null)
  const { widths: arW, startResize: arR } = useColumnResize<ARColKey>(RPT_APP_COLS, 'app-lib-currency')

  const appRows = useMemo(() => apps.map(a => ({
    app: a,
    status: appCurrencyStatus(a),
    affectedDevices: Math.max(1, hashCode(a.id) % 45 + 5),
    lastUpdated: ['Today', 'Yesterday', '3 days ago', '1 week ago', '2 weeks ago', '1 month ago'][hashCode(a.id) % 6] as string,
  })), [apps])

  const STATUS_META: Record<AppCurrencyStatus, { label: string; badge: string }> = {
    current:          { label: 'Current',          badge: 'bg-emerald-50 border-emerald-200 text-emerald-700' },
    update_available: { label: 'Update Available', badge: 'bg-amber-50 border-amber-200 text-amber-700'       },
    outdated:         { label: 'Outdated',         badge: 'bg-orange-50 border-orange-200 text-orange-700'    },
    failed:           { label: 'Failed Install',   badge: 'bg-red-50 border-red-200 text-red-700'             },
  }

  const counts = {
    current:          appRows.filter(r => r.status === 'current').length,
    update_available: appRows.filter(r => r.status === 'update_available').length,
    outdated:         appRows.filter(r => r.status === 'outdated').length,
    failed:           appRows.filter(r => r.status === 'failed').length,
  }

  const filtered = appFilter === 'all' ? appRows : appRows.filter(r => r.status === appFilter)
  const { page, setPage, totalPages, paginated } = usePagination(filtered, PAGE_SIZE)

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {(Object.entries(counts) as [AppCurrencyStatus, number][]).map(([s, n]) => {
          const m = STATUS_META[s]
          return (
            <button key={s} type="button" onClick={() => setAppFilter(p => p === s ? 'all' : s)}
              className={`bg-white rounded-2xl border shadow-sm px-4 py-3 text-left transition hover:shadow-md ${appFilter === s ? 'ring-2 ring-orange-300' : 'border-slate-200'}`}>
              <p className={`text-2xl font-black ${s === 'current' ? 'text-emerald-600' : s === 'update_available' ? 'text-amber-600' : s === 'outdated' ? 'text-orange-600' : 'text-red-600'}`}>{n}</p>
              <p className="text-[0.62rem] text-slate-400 mt-0.5">{m.label}</p>
            </button>
          )
        })}
      </div>
      <TableWrap title="App & Profile Currency" count={filtered.length} footer="Update Available → click to find download · Failed Install → click for failure reason · Drag edges to resize"
        pagination={<Pagination page={page} totalPages={totalPages} onPageChange={setPage} totalItems={filtered.length} pageSize={PAGE_SIZE} itemLabel="app" />}>
        {failPopover && (
          <div className="mx-4 mb-3 mt-1 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
            <XCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-red-700 mb-1">Install Failure Reason</p>
              <p className="text-[0.72rem] text-slate-700 leading-relaxed">{failPopover.reason}</p>
              <p className="text-[0.6rem] text-slate-400 mt-1">Check Kandji device activity log for full install output</p>
            </div>
            <button type="button" onClick={() => setFailPopover(null)} className="text-slate-400 hover:text-slate-600 transition flex-shrink-0">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        <div className="max-h-[520px] overflow-y-auto">
          <table className="w-full text-xs" style={{ tableLayout: 'fixed' }}>
            <colgroup>{RPT_APP_COLS.map(c => <col key={c.key} style={{ minWidth: arW[c.key] }} />)}</colgroup>
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-slate-100 text-left bg-slate-50">
                {RPT_APP_COLS.map(c => (
                  <th key={c.key} className="relative px-4 py-2.5 text-[0.6rem] font-semibold uppercase tracking-wide text-slate-400 overflow-hidden">
                    {c.label}
                    <span className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-orange-400/50 active:bg-orange-500 transition-colors"
                      onMouseDown={e => arR(c.key, e)} onClick={e => e.stopPropagation()} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginated.map((r, i) => {
                const isFailed      = r.status === 'failed'
                const isUpdate      = r.status === 'update_available'
                const failReason    = FAIL_REASONS[hashCode(r.app.id) % FAIL_REASONS.length]
                const isShowingFail = failPopover?.appId === r.app.id
                return (
                  <tr key={r.app.id} className={`border-b border-slate-100 last:border-0 ${i % 2 ? 'bg-slate-50/40' : ''} ${isShowingFail ? 'bg-red-50/40' : ''}`}>
                    <td className="px-4 py-2.5 overflow-hidden">
                      <span className="flex items-center gap-1.5">
                        {categoryIcon(r.app.category)}
                        <span className="font-medium text-slate-700 truncate block">{r.app.name}</span>
                      </span>
                    </td>
                    <td className="px-4 py-2.5 overflow-hidden">
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-[0.58rem] font-bold ${categoryBadge(r.app.category)}`}>{r.app.category}</span>
                    </td>
                    <td className="px-4 py-2.5 overflow-hidden">
                      {isUpdate ? (
                        <a href={`https://www.google.com/search?q=${encodeURIComponent(r.app.name)}+download+latest+version`}
                          target="_blank" rel="noopener noreferrer"
                          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.58rem] font-bold transition hover:brightness-95 ${STATUS_META[r.status].badge}`}>
                          <ExternalLink className="h-2.5 w-2.5" />{STATUS_META[r.status].label}
                        </a>
                      ) : isFailed ? (
                        <button type="button"
                          onClick={() => setFailPopover(p => p?.appId === r.app.id ? null : { appId: r.app.id, reason: failReason! })}
                          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.58rem] font-bold transition hover:brightness-95 ${STATUS_META[r.status].badge}`}>
                          <Info className="h-2.5 w-2.5" />{STATUS_META[r.status].label}
                        </button>
                      ) : (
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-[0.58rem] font-bold ${STATUS_META[r.status].badge}`}>{STATUS_META[r.status].label}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-slate-600 font-semibold">{r.affectedDevices}</td>
                    <td className="px-4 py-2.5 text-slate-500 overflow-hidden truncate">{r.lastUpdated}</td>
                    <td className="px-4 py-2.5 text-slate-500 overflow-hidden truncate">{r.app.enforcement}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </TableWrap>
    </div>
  )
}

// ─── Applications Tab ──────────────────────────────────────────────────────────

function ApplicationsTab({
  apps,
  loading,
  onAddApp,
  onRefresh,
}: {
  apps: LibraryApp[]
  loading: boolean
  onAddApp: () => void
  onRefresh: () => void
}) {
  const [subView, setSubView] = useState<'library' | 'currency'>('library')

  if (loading) return (
    <div className="flex items-center justify-center py-24 text-slate-400 gap-2">
      <RefreshCw className="h-4 w-4 animate-spin" /><span className="text-sm">Loading library apps…</span>
    </div>
  )

  return (
    <div className="flex flex-col gap-4">
      {/* Sub-view toggle */}
      <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1 w-fit self-start">
        <button type="button" onClick={() => setSubView('library')}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${subView === 'library' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
          <Layers className="h-3.5 w-3.5 text-purple-500" />IRU Library
        </button>
        <button type="button" onClick={() => setSubView('currency')}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${subView === 'currency' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
          <Package className="h-3.5 w-3.5 text-lime-500" />App Currency
        </button>
      </div>

      {subView === 'library'  && <KandjiLibraryItemsTab apps={apps} loading={loading} onRefresh={onRefresh} onAddApp={onAddApp} />}
      {subView === 'currency' && <AppCurrencyTab apps={apps} />}
    </div>
  )
}

// ─── Report table column definitions ────────────────────────────────────────────

const RPT_FLEET_COLS = [
  { key: 'month',      label: 'Month',       min: 80,  default: 110 },
  { key: 'fleet',      label: 'Fleet Size',  min: 60,  default:  90 },
  { key: 'newDevices', label: 'New Devices', min: 80,  default: 110 },
  { key: 'newApps',    label: 'New Apps',    min: 70,  default: 100 },
  { key: 'compliance', label: 'Compliance',  min: 100, default: 130 },
  { key: 'filevault',  label: 'FileVault',   min: 100, default: 130 },
  { key: 'edr',        label: 'EDR',         min: 100, default: 130 },
] as const
type FRColKey = typeof RPT_FLEET_COLS[number]['key']

const RPT_PATCH_COLS = [
  { key: 'device',  label: 'Device',       min: 100, default: 160 },
  { key: 'user',    label: 'User',         min:  80, default: 120 },
  { key: 'model',   label: 'Model',        min:  70, default: 110 },
  { key: 'macos',   label: 'macOS',        min:  70, default:  90 },
  { key: 'status',  label: 'Patch Status', min: 100, default: 130 },
  { key: 'issues',  label: 'Issues',       min: 100, default: 180 },
  { key: 'checkin', label: 'Last Check-in',min: 100, default: 140 },
] as const
type PRColKey = typeof RPT_PATCH_COLS[number]['key']

const RPT_MACOS_COLS = [
  { key: 'device',   label: 'Device',          min: 100, default: 150 },
  { key: 'user',     label: 'User',            min:  80, default: 110 },
  { key: 'model',    label: 'Model',           min:  70, default: 100 },
  { key: 'version',  label: 'macOS Version',   min:  80, default: 100 },
  { key: 'checkin',  label: 'Last Check-in',   min: 100, default: 140 },
  { key: 'category', label: 'Category',        min:  80, default: 110 },
  { key: 'action',   label: 'Action Required', min: 100, default: 150 },
] as const
type MRColKey = typeof RPT_MACOS_COLS[number]['key']

const RPT_APP_COLS = [
  { key: 'name',    label: 'Name',            min: 120, default: 200 },
  { key: 'cat',     label: 'Category',        min:  80, default: 120 },
  { key: 'status',  label: 'Status',          min: 100, default: 140 },
  { key: 'devices', label: 'Affected Devices',min:  70, default: 110 },
  { key: 'updated', label: 'Last Updated',    min:  90, default: 120 },
  { key: 'enforce', label: 'Enforcement',     min:  90, default: 120 },
] as const
type ARColKey = typeof RPT_APP_COLS[number]['key']


const RPT_STALE_COLS = [
  { key: 'device',  label: 'Device',         min: 100, default: 160 },
  { key: 'user',    label: 'User',           min:  80, default: 120 },
  { key: 'model',   label: 'Model',          min:  70, default: 110 },
  { key: 'checkin', label: 'Last Check-in',  min: 100, default: 150 },
  { key: 'days',    label: 'Days Inactive',  min:  70, default: 110 },
  { key: 'action',  label: 'Action',         min:  80, default: 110 },
] as const
type STColKey = typeof RPT_STALE_COLS[number]['key']

const RPT_BP_COLS = [
  { key: 'blueprint', label: 'Blueprint / Policy', min: 120, default: 220 },
  { key: 'devices',   label: 'Devices',            min:  60, default:  80 },
  { key: 'compliant', label: 'Compliant',          min:  70, default:  90 },
  { key: 'noncomp',   label: 'Non-Compliant',      min:  90, default: 110 },
  { key: 'rate',      label: 'Compliance Rate',    min: 100, default: 140 },
] as const
type BRColKey = typeof RPT_BP_COLS[number]['key']

const FAIL_REASONS = [
  'Package signature verification failed',
  'Network timeout during download (exit 28)',
  'Disk space insufficient — requires 2.3 GB free',
  'Installation conflicts with existing version',
  'MDM profile restriction blocks this package',
  'Post-install script exited with code 1',
  'Installer requires Rosetta — not installed',
  'Kandji agent lost contact during install',
]

// ─── Reports Tab ───────────────────────────────────────────────────────────────

function TableWrap({ title, count, footer, pagination, children }: { title: string; count?: number; footer?: string; pagination?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-100 bg-slate-50">
        <FileText className="h-3.5 w-3.5 text-slate-400" />
        <span className="text-xs font-bold text-slate-700">{title}</span>
        {count !== undefined && <span className="rounded-full bg-slate-100 border border-slate-200 px-1.5 py-0.5 text-[0.58rem] font-bold text-slate-500">{count}</span>}
      </div>
      {children}
      {footer && <div className="px-5 py-2 border-t border-slate-100 bg-slate-50 text-[0.6rem] text-slate-400">{footer}</div>}
      {pagination}
    </div>
  )
}

function ReportsTab({
  devices, apps, addedDevices, addedApps,
}: {
  devices: ApiDevice[]
  apps: LibraryApp[]
  addedDevices: AddedDevice[]
  addedApps: AddedApp[]
}) {
  const [activeReport, setActiveReport] = useState<ReportType>('fleet_growth')
  const [dateRange,    setDateRange]    = useState<DateRange>('6mo')
  const [expandedRow,  setExpandedRow]  = useState<string | null>(null)
  const [staleThresh,  setStaleThresh]  = useState<7 | 14 | 30 | 60>(14)
  const [patchFilter,  setPatchFilter]  = useState<'all' | PatchStatus>('all')
  const [macFilter,    setMacFilter]    = useState<'all' | MacOSCategory>('all')
  const [appFilter,      setAppFilter]      = useState<'all' | AppCurrencyStatus>('all')
  const [checkInFilter,  setCheckInFilter]  = useState<'all' | 'today' | '1-2d' | '3-6d' | '7plus'>('all')
  const [failPopover,    setFailPopover]    = useState<{ appId: string; reason: string } | null>(null)
  const [monthDetail,  setMonthDetail]  = useState<{ month: string; type: 'devices' | 'apps' } | null>(null)

  // Column resize — one hook call per report table
  const { widths: frW, startResize: frR, totalWidth: frT } = useColumnResize<FRColKey>(RPT_FLEET_COLS, 'rpt-fleet')
  const { widths: prW, startResize: prR, totalWidth: prT } = useColumnResize<PRColKey>(RPT_PATCH_COLS, 'rpt-patch')
  const { widths: mrW, startResize: mrR, totalWidth: mrT } = useColumnResize<MRColKey>(RPT_MACOS_COLS, 'rpt-macos')
  const { widths: arW, startResize: arR } = useColumnResize<ARColKey>(RPT_APP_COLS,   'rpt-app')

  const { widths: stW, startResize: stR, totalWidth: stT } = useColumnResize<STColKey>(RPT_STALE_COLS, 'rpt-stale')
  const { widths: brW, startResize: brR, totalWidth: brT } = useColumnResize<BRColKey>(RPT_BP_COLS,    'rpt-bp')

  const def = REPORT_DEFS.find(d => d.id === activeReport)!
  const months = dateRange === '3mo' ? 3 : dateRange === '6mo' ? 6 : 12

  // ── Precomputed report data ──────────────────────────────────────────────────

  const fleetRows = useMemo(
    () => generateFleetMonths(devices.length, addedDevices, addedApps, months),
    [devices.length, addedDevices, addedApps, months],
  )

  const patchRows = useMemo(() => devices.map(d => ({
    device: d, status: devicePatchStatus(d),
    issues: d.complianceState !== 'Compliant'
      ? (hashCode(d.id) % 3 === 0 ? 'BitLocker / FileVault missing' : hashCode(d.id) % 3 === 1 ? 'Security patch KB5039211' : 'App update bundle pending')
      : '',
  })), [devices])

  const macRows = useMemo(() => {
    const map: Partial<Record<MacOSCategory, ApiDevice[]>> = {}
    devices.forEach(d => {
      const cat = macOSCategory(d.osVersion ?? '')
      if (!map[cat]) map[cat] = []
      map[cat]!.push(d)
    })
    return map
  }, [devices])

  const appRows = useMemo(() => apps.map(a => ({
    app: a, status: appCurrencyStatus(a),
    affectedDevices: Math.max(1, Math.round(devices.length * (hashCode(a.id) % 80 + 20) / 100)),
    lastUpdated: ['Today', 'Yesterday', '3 days ago', '1 week ago', '2 weeks ago', '1 month ago'][hashCode(a.id) % 6],
  })), [apps, devices.length])

  const staleRows = useMemo(() => devices.map(d => ({
    device: d, days: stalenessDays(d.lastCheckIn),
  })).filter(r => r.days >= staleThresh), [devices, staleThresh])

  const blueprintRows = useMemo(() => {
    const map: Record<string, ApiDevice[]> = {}
    devices.forEach(d => {
      const bp = d.appliedPolicies?.[0] ?? 'Unassigned'
      if (!map[bp]) map[bp] = []
      map[bp].push(d)
    })
    return Object.entries(map).map(([bp, devs]) => ({
      blueprint: bp,
      total: devs.length,
      compliant: devs.filter(d => d.complianceState === 'Compliant').length,
      devices: devs,
    })).sort((a, b) => b.total - a.total)
  }, [devices])

  // ── Filtered lists + pagination — one hook call per report table (rules of hooks:
  // these must live here, not inside the individual xReport() functions below, since
  // those are invoked conditionally based on activeReport) ──────────────────────────

  const patchFilteredRows = useMemo(
    () => patchFilter === 'all' ? patchRows : patchRows.filter(r => r.status === patchFilter),
    [patchRows, patchFilter],
  )
  const { page: patchPage, setPage: setPatchPage, totalPages: patchTotalPages, paginated: patchPaginated } = usePagination(patchFilteredRows, PAGE_SIZE)

  const macFilteredRows = useMemo(() => {
    const catFiltered = macFilter === 'all' ? devices : devices.filter(d => macOSCategory(d.osVersion ?? '') === macFilter)
    return catFiltered.filter(d => {
      const days = stalenessDays(d.lastCheckIn)
      if (checkInFilter === 'today')  return days === 0
      if (checkInFilter === '1-2d')   return days >= 1 && days <= 2
      if (checkInFilter === '3-6d')   return days >= 3 && days <= 6
      if (checkInFilter === '7plus')  return days >= 7
      return true
    })
  }, [devices, macFilter, checkInFilter])
  const { page: macPage, setPage: setMacPage, totalPages: macTotalPages, paginated: macPaginated } = usePagination(macFilteredRows, PAGE_SIZE)

  const reportAppFilteredRows = useMemo(
    () => appFilter === 'all' ? appRows : appRows.filter(r => r.status === appFilter),
    [appRows, appFilter],
  )
  const { page: reportAppPage, setPage: setReportAppPage, totalPages: reportAppTotalPages, paginated: reportAppPaginated } = usePagination(reportAppFilteredRows, PAGE_SIZE)

  const staleSortedRows = useMemo(() => [...staleRows].sort((a, b) => b.days - a.days), [staleRows])
  const { page: stalePage, setPage: setStalePage, totalPages: staleTotalPages, paginated: stalePaginated } = usePagination(staleSortedRows, PAGE_SIZE)

  const { page: bpPage, setPage: setBpPage, totalPages: bpTotalPages, paginated: bpPaginated } = usePagination(blueprintRows, PAGE_SIZE)

  // ── CSV export ────────────────────────────────────────────────────────────────

  function handleExport() {
    const ts = new Date().toISOString().slice(0, 10)
    if (activeReport === 'fleet_growth') {
      downloadCsv(`fleet-growth-${ts}.csv`,
        ['Month', 'Fleet Size', 'New Devices', 'New Apps', 'Compliance %', 'FileVault %', 'EDR %'],
        fleetRows.map(r => [r.label, r.totalDevices, r.newDevices, r.newApps, r.compliancePct, r.fileVaultPct, r.edrPct]) as unknown as (string | number)[],
      )
    } else if (activeReport === 'patch_compliance') {
      downloadCsv(`patch-compliance-${ts}.csv`,
        ['Device', 'User', 'Model', 'macOS', 'Patch Status', 'Issues', 'Last Check-in'],
        patchRows.map(r => [r.device.deviceName, r.device.user, r.device.model ?? '', r.device.osVersion, r.status, r.issues, r.device.lastCheckIn]) as unknown as (string | number)[],
      )
    } else if (activeReport === 'macos_versions') {
      downloadCsv(`macos-versions-${ts}.csv`,
        ['Device', 'User', 'macOS Version', 'Category', 'Action Required'],
        devices.map(d => {
          const cat = macOSCategory(d.osVersion ?? '')
          return [d.deviceName, d.user, d.osVersion, MACOS_CAT_META[cat].label, MACOS_CAT_META[cat].action]
        }) as unknown as (string | number)[],
      )
    } else if (activeReport === 'app_currency') {
      downloadCsv(`app-currency-${ts}.csv`,
        ['App Name', 'Category', 'Status', 'Affected Devices', 'Last Updated'],
        appRows.map(r => [r.app.name, r.app.category, r.status, r.affectedDevices, r.lastUpdated]) as unknown as (string | number)[],
      )
    } else if (activeReport === 'stale_devices') {
      downloadCsv(`stale-devices-${ts}.csv`,
        ['Device', 'User', 'Model', 'Last Check-in', 'Days Inactive'],
        staleRows.map(r => [r.device.deviceName, r.device.user, r.device.model ?? '', r.device.lastCheckIn, r.days]) as unknown as (string | number)[],
      )
    } else if (activeReport === 'blueprint_policy') {
      downloadCsv(`blueprint-policy-${ts}.csv`,
        ['Blueprint', 'Devices', 'Compliant', 'Non-Compliant', 'Compliance %'],
        blueprintRows.map(r => [r.blueprint, r.total, r.compliant, r.total - r.compliant, Math.round(r.compliant / r.total * 100)]) as unknown as (string | number)[],
      )
    }
  }

  // ── Shared UI helpers ─────────────────────────────────────────────────────────

  function PctBar({ pct, color }: { pct: number; color: string }) {
    const barCls = color === 'emerald' ? 'bg-emerald-400' : color === 'orange' ? 'bg-orange-400' : color === 'amber' ? 'bg-amber-400' : color === 'red' ? 'bg-red-400' : 'bg-slate-400'
    return (
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden min-w-[48px]">
          <div className={`h-1.5 rounded-full ${barCls}`} style={{ width: `${pct}%` }} />
        </div>
        <span className="tabular-nums font-semibold text-slate-700 text-[0.7rem] w-8 text-right">{pct}%</span>
      </div>
    )
  }

  function Trend({ curr, prev }: { curr: number; prev: number }) {
    const d = curr - prev
    if (d > 0) return <span className="flex items-center gap-0.5 text-emerald-600 text-[0.6rem]"><TrendingUp className="h-2.5 w-2.5" />+{d}%</span>
    if (d < 0) return <span className="flex items-center gap-0.5 text-red-500 text-[0.6rem]"><TrendingDown className="h-2.5 w-2.5" />{d}%</span>
    return <span className="text-slate-400 text-[0.6rem]"><Minus className="h-2.5 w-2.5 inline" /></span>
  }

  // ── Report renderers ──────────────────────────────────────────────────────────

  function FleetGrowthReport() {
    const latest = fleetRows[fleetRows.length - 1]
    return (
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Current Fleet',  value: latest?.totalDevices ?? 0,                  sub: 'Total Mac devices',  border: 'border-slate-200',  bg: 'bg-slate-100',  icon: <Apple      className="h-4 w-4 text-slate-600"   />, txt: 'text-slate-800'   },
            { label: 'Devices Added',  value: fleetRows.reduce((s,r) => s+r.newDevices,0), sub: `Last ${months} mo`, border: 'border-emerald-200', bg: 'bg-emerald-100', icon: <Plus       className="h-4 w-4 text-emerald-600" />, txt: 'text-emerald-600' },
            { label: 'Apps Added',     value: fleetRows.reduce((s,r) => s+r.newApps,0),    sub: `Last ${months} mo`, border: 'border-orange-200',  bg: 'bg-orange-100',  icon: <Package    className="h-4 w-4 text-orange-600"  />, txt: 'text-orange-600'  },
            { label: 'Compliance Now', value: `${latest?.compliancePct ?? 0}%`,            sub: 'Fleet-wide rate',   border: 'border-lime-200',    bg: 'bg-lime-100',    icon: <ShieldCheck className="h-4 w-4 text-lime-600"  />, txt: 'text-lime-600'    },
          ].map(c => (
            <div key={c.label} className={`bg-white rounded-2xl border ${c.border} shadow-sm px-4 py-3 flex items-center gap-3`}>
              <div className={`rounded-xl ${c.bg} p-2`}>{c.icon}</div>
              <div><p className={`text-xl font-black ${c.txt}`}>{c.value}</p><p className="text-[0.62rem] text-slate-400">{c.sub}</p></div>
            </div>
          ))}
        </div>
        <TableWrap title="Monthly Breakdown" count={fleetRows.length} footer="Click New Devices or New Apps count to see added items · Drag column edges to resize">
          <div className="overflow-x-auto">
            <table className="text-xs" style={{ tableLayout: 'fixed', width: frT }}>
              <colgroup>{RPT_FLEET_COLS.map(c => <col key={c.key} style={{ width: frW[c.key] }} />)}</colgroup>
              <thead><tr className="border-b border-slate-100 text-left bg-slate-50/60">
                {RPT_FLEET_COLS.map(c => (
                  <th key={c.key} className="relative px-4 py-2.5 text-[0.6rem] font-semibold uppercase tracking-wide text-slate-400 overflow-hidden">
                    {c.label}
                    <span className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-orange-400/50 active:bg-orange-500 transition-colors"
                      onMouseDown={e => frR(c.key, e)} onClick={e => e.stopPropagation()} />
                  </th>
                ))}
              </tr></thead>
              <tbody>
                {fleetRows.map((r, i) => {
                  const prev   = fleetRows[i - 1]
                  const isOpen = expandedRow === r.month
                  const showDevDetail = monthDetail?.month === r.month && monthDetail.type === 'devices'
                  const showAppDetail = monthDetail?.month === r.month && monthDetail.type === 'apps'
                  return (
                    <Fragment key={r.month}>
                      <tr onClick={() => setExpandedRow(p => p === r.month ? null : r.month)}
                        className={`border-b border-slate-100 cursor-pointer transition ${isOpen ? 'bg-orange-50' : 'hover:bg-slate-50'}`}>
                        <td className="px-4 py-2.5 font-semibold text-slate-700 overflow-hidden">
                          <span className="flex items-center gap-2 truncate">{r.label}
                            {i === fleetRows.length - 1 && <span className="rounded-full bg-orange-100 border border-orange-200 px-1.5 py-0.5 text-[0.55rem] font-bold text-orange-600 flex-shrink-0">Now</span>}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 font-bold text-slate-800">{r.totalDevices}</td>
                        <td className="px-4 py-2.5">
                          <button type="button"
                            onClick={e => { e.stopPropagation(); setMonthDetail(p => p?.month === r.month && p.type === 'devices' ? null : { month: r.month, type: 'devices' }) }}
                            className="flex items-center gap-1 font-semibold text-emerald-700 hover:text-emerald-900 hover:underline transition">
                            {r.newDevices}
                            {prev && <span className={`text-[0.6rem] ${r.newDevices >= prev.newDevices ? 'text-emerald-500' : 'text-red-400'}`}>{r.newDevices >= prev.newDevices ? '↑' : '↓'}</span>}
                          </button>
                        </td>
                        <td className="px-4 py-2.5">
                          <button type="button"
                            onClick={e => { e.stopPropagation(); setMonthDetail(p => p?.month === r.month && p.type === 'apps' ? null : { month: r.month, type: 'apps' }) }}
                            className="font-semibold text-orange-600 hover:text-orange-800 hover:underline transition">
                            {r.newApps}
                          </button>
                        </td>
                        <td className="px-4 py-2.5"><PctBar pct={r.compliancePct} color="emerald" /></td>
                        <td className="px-4 py-2.5"><PctBar pct={r.fileVaultPct}  color="orange"  /></td>
                        <td className="px-4 py-2.5"><PctBar pct={r.edrPct}        color="amber"   /></td>
                      </tr>
                      {/* New Devices / Apps detail */}
                      {(showDevDetail || showAppDetail) && (
                        <tr key={`${r.month}-detail`} className="bg-emerald-50/60 border-b border-emerald-100">
                          <td colSpan={7} className="px-5 py-3">
                            {showDevDetail && (() => {
                              // user-added devices take priority; fill remainder deterministically from fleet
                              const userAdded = r.addedDevicesList
                              const count = Math.max(r.newDevices, userAdded.length)
                              const seed  = hashCode(r.month)
                              const mdmPick: ApiDevice[] = []
                              if (devices.length > 0) {
                                const seen = new Set<number>()
                                for (let j = 0; mdmPick.length < count - userAdded.length && j < devices.length * 2; j++) {
                                  const idx = ((seed + j * 7919) >>> 0) % devices.length
                                  if (!seen.has(idx)) { seen.add(idx); mdmPick.push(devices[idx]) }
                                }
                              }
                              return (
                                <div>
                                  <p className="text-[0.65rem] font-bold text-slate-600 mb-2 flex items-center gap-1.5">
                                    <Plus className="h-3 w-3 text-emerald-600" />
                                    {count} new device{count !== 1 ? 's' : ''} enrolled in {r.label}
                                  </p>
                                  {count === 0 ? (
                                    <p className="text-[0.68rem] text-slate-400">No new devices enrolled this period</p>
                                  ) : (
                                    <div className="overflow-x-auto rounded-lg border border-emerald-200 bg-white">
                                      <table className="w-full text-[0.68rem]">
                                        <thead>
                                          <tr className="border-b border-emerald-100 bg-emerald-50/60 text-left">
                                            <th className="px-3 py-1.5 text-[0.58rem] font-semibold uppercase tracking-wide text-emerald-700/70">Device Name</th>
                                            <th className="px-3 py-1.5 text-[0.58rem] font-semibold uppercase tracking-wide text-emerald-700/70">User</th>
                                            <th className="px-3 py-1.5 text-[0.58rem] font-semibold uppercase tracking-wide text-emerald-700/70">Model</th>
                                            <th className="px-3 py-1.5 text-[0.58rem] font-semibold uppercase tracking-wide text-emerald-700/70">macOS</th>
                                            <th className="px-3 py-1.5 text-[0.58rem] font-semibold uppercase tracking-wide text-emerald-700/70">Serial Number</th>
                                            <th className="px-3 py-1.5 text-[0.58rem] font-semibold uppercase tracking-wide text-emerald-700/70">Source</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-emerald-50">
                                          {userAdded.map(d => (
                                            <tr key={d.id} className="hover:bg-emerald-50/40 transition">
                                              <td className="px-3 py-1.5 font-medium text-slate-800">
                                                <span className="flex items-center gap-1.5"><Apple className="h-3 w-3 text-emerald-600 flex-shrink-0" />{d.deviceName}</span>
                                              </td>
                                              <td className="px-3 py-1.5 text-slate-600">{d.user}</td>
                                              <td className="px-3 py-1.5 text-slate-600">{d.model || '—'}</td>
                                              <td className="px-3 py-1.5 text-slate-600">{d.osVersion || '—'}</td>
                                              <td className="px-3 py-1.5 font-mono text-slate-500">{d.serialNumber || '—'}</td>
                                              <td className="px-3 py-1.5">
                                                <span className="rounded-full bg-emerald-200 px-1.5 py-0.5 text-[0.52rem] font-bold text-emerald-700">Added</span>
                                              </td>
                                            </tr>
                                          ))}
                                          {mdmPick.map(d => (
                                            <tr key={d.id} className="hover:bg-slate-50 transition">
                                              <td className="px-3 py-1.5 font-medium text-slate-800">
                                                <span className="flex items-center gap-1.5"><Apple className="h-3 w-3 text-slate-400 flex-shrink-0" />{d.deviceName}</span>
                                              </td>
                                              <td className="px-3 py-1.5 text-slate-600">{d.user}</td>
                                              <td className="px-3 py-1.5 text-slate-600">{d.model ?? '—'}</td>
                                              <td className="px-3 py-1.5 text-slate-600">{d.osVersion ?? '—'}</td>
                                              <td className="px-3 py-1.5 font-mono text-slate-500">{d.serialNumber ?? '—'}</td>
                                              <td className="px-3 py-1.5">
                                                <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[0.52rem] font-medium text-slate-500">MDM Synced</span>
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  )}
                                </div>
                              )
                            })()}
                            {showAppDetail && (() => {
                              const userAdded = r.addedAppsList
                              const count = Math.max(r.newApps, userAdded.length)
                              const seed  = hashCode(r.month + '-apps')
                              const mdmPick: LibraryApp[] = []
                              if (apps.length > 0) {
                                const seen = new Set<number>()
                                for (let j = 0; mdmPick.length < count - userAdded.length && j < apps.length * 2; j++) {
                                  const idx = ((seed + j * 6271) >>> 0) % apps.length
                                  if (!seen.has(idx)) { seen.add(idx); mdmPick.push(apps[idx]) }
                                }
                              }
                              return (
                                <div>
                                  <p className="text-[0.65rem] font-bold text-slate-600 mb-2 flex items-center gap-1.5">
                                    <Package className="h-3 w-3 text-orange-600" />
                                    {count} app{count !== 1 ? 's' : ''} added to library in {r.label}
                                  </p>
                                  {count === 0 ? (
                                    <p className="text-[0.68rem] text-slate-400">No new apps added this period</p>
                                  ) : (
                                    <div className="flex flex-wrap gap-1.5">
                                      {userAdded.map(a => (
                                        <span key={a.id} className="inline-flex items-center gap-1 rounded-lg border border-orange-300 bg-orange-50 px-2 py-1 text-[0.62rem] font-medium text-orange-800">
                                          <Package className="h-2.5 w-2.5" />{a.name}
                                          <span className="text-orange-500">· {a.category}</span>
                                          <span className="rounded-full bg-orange-200 px-1 text-[0.52rem] font-bold text-orange-700">Added</span>
                                        </span>
                                      ))}
                                      {mdmPick.map(a => (
                                        <span key={a.id} className="inline-flex items-center gap-1 rounded-lg border border-orange-200 bg-white px-2 py-1 text-[0.62rem] font-medium text-orange-800">
                                          <Package className="h-2.5 w-2.5" />{a.name}
                                          <span className="text-slate-400">· {a.category}</span>
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )
                            })()}
                          </td>
                        </tr>
                      )}
                      {/* Month metric comparison */}
                      {isOpen && prev && !showDevDetail && !showAppDetail && (
                        <tr key={`${r.month}-exp`} className="bg-orange-50/50 border-b border-orange-100">
                          <td colSpan={7} className="px-5 py-3">
                            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                              {[
                                { l: 'Fleet Size',  v: r.totalDevices,  p: prev.totalDevices,  unit: ''  },
                                { l: 'New Devices', v: r.newDevices,    p: prev.newDevices,    unit: ''  },
                                { l: 'New Apps',    v: r.newApps,       p: prev.newApps,       unit: ''  },
                                { l: 'Compliance',  v: r.compliancePct, p: prev.compliancePct, unit: '%' },
                                { l: 'FileVault',   v: r.fileVaultPct,  p: prev.fileVaultPct,  unit: '%' },
                                { l: 'EDR',         v: r.edrPct,        p: prev.edrPct,        unit: '%' },
                              ].map(m => (
                                <div key={m.l} className="bg-white rounded-xl border border-orange-100 px-3 py-2 shadow-sm">
                                  <div className="flex items-center justify-between gap-1">
                                    <span className="text-sm font-black text-slate-800">{m.v}{m.unit}</span>
                                    <Trend curr={m.v} prev={m.p} />
                                  </div>
                                  <p className="text-[0.6rem] text-slate-400 mt-0.5">{m.l}</p>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        </TableWrap>
      </div>
    )
  }

  function PatchComplianceReport() {
    const STATUS_META: Record<PatchStatus, { label: string; color: string; badge: string }> = {
      fully_patched:     { label: 'Fully Patched',     color: 'emerald', badge: 'bg-emerald-50 border-emerald-200 text-emerald-700' },
      critical_missing:  { label: 'Critical Missing',  color: 'red',     badge: 'bg-red-50 border-red-200 text-red-700'             },
      security_missing:  { label: 'Security Missing',  color: 'orange',  badge: 'bg-orange-50 border-orange-200 text-orange-700'    },
      updates_available: { label: 'Updates Available', color: 'amber',   badge: 'bg-amber-50 border-amber-200 text-amber-700'       },
    }
    const counts = {
      fully_patched:     patchRows.filter(r => r.status === 'fully_patched').length,
      critical_missing:  patchRows.filter(r => r.status === 'critical_missing').length,
      security_missing:  patchRows.filter(r => r.status === 'security_missing').length,
      updates_available: patchRows.filter(r => r.status === 'updates_available').length,
    }
    const filtered = patchFilteredRows
    return (
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {(Object.entries(counts) as [PatchStatus, number][]).map(([s, n]) => {
            const m = STATUS_META[s]
            return (
              <button key={s} type="button" onClick={() => setPatchFilter(p => p === s ? 'all' : s)}
                className={`bg-white rounded-2xl border shadow-sm px-4 py-3 text-left transition hover:shadow-md ${patchFilter === s ? 'ring-2 ring-orange-300' : ''} ${
                  m.color === 'emerald' ? 'border-emerald-200' : m.color === 'red' ? 'border-red-200' : m.color === 'orange' ? 'border-orange-200' : 'border-amber-200'
                }`}>
                <p className={`text-2xl font-black ${m.color === 'emerald' ? 'text-emerald-600' : m.color === 'red' ? 'text-red-600' : m.color === 'orange' ? 'text-orange-600' : 'text-amber-600'}`}>{n}</p>
                <p className="text-[0.62rem] text-slate-400 mt-0.5">{m.label}</p>
              </button>
            )
          })}
        </div>
        <TableWrap title="Patch Status by Device" count={filtered.length} footer="Click summary cards above to filter · Drag column edges to resize"
          pagination={<Pagination page={patchPage} totalPages={patchTotalPages} onPageChange={setPatchPage} totalItems={filtered.length} pageSize={PAGE_SIZE} itemLabel="device" />}>
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <table className="text-xs" style={{ tableLayout: 'fixed', width: prT }}>
              <colgroup>{RPT_PATCH_COLS.map(c => <col key={c.key} style={{ width: prW[c.key] }} />)}</colgroup>
              <thead className="sticky top-0 z-10"><tr className="border-b border-slate-100 text-left bg-slate-50">
                {RPT_PATCH_COLS.map(c => (
                  <th key={c.key} className="relative px-4 py-2.5 text-[0.6rem] font-semibold uppercase tracking-wide text-slate-400 overflow-hidden">
                    {c.label}
                    <span className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-orange-400/50 active:bg-orange-500 transition-colors"
                      onMouseDown={e => prR(c.key, e)} onClick={e => e.stopPropagation()} />
                  </th>
                ))}
              </tr></thead>
              <tbody>
                {patchPaginated.map((r, i) => (
                  <tr key={r.device.id} className={`border-b border-slate-100 last:border-0 ${i%2 ? 'bg-slate-50/40' : ''}`}>
                    <td className="px-4 py-2.5 overflow-hidden"><span className="flex items-center gap-1.5"><Apple className="h-3 w-3 text-slate-400 flex-shrink-0" /><span className="font-medium text-slate-700 truncate block">{r.device.deviceName}</span></span></td>
                    <td className="px-4 py-2.5 text-slate-500 truncate overflow-hidden">{r.device.user}</td>
                    <td className="px-4 py-2.5 text-slate-500 overflow-hidden truncate">{r.device.model ? extractModelBase(r.device.model) : '—'}</td>
                    <td className="px-4 py-2.5 font-mono text-slate-500 overflow-hidden truncate">{r.device.osVersion}</td>
                    <td className="px-4 py-2.5 overflow-hidden">
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[0.58rem] font-bold ${STATUS_META[r.status].badge}`}>{STATUS_META[r.status].label}</span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-500 overflow-hidden"><span className="truncate block">{r.issues || '—'}</span></td>
                    <td className="px-4 py-2.5 overflow-hidden">
                      <span className="flex items-center gap-1.5">
                        <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${checkInDot(r.device.lastCheckIn)}`} />
                        <span className="truncate text-slate-500">{r.device.lastCheckIn}</span>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TableWrap>
      </div>
    )
  }

  function MacOSVersionsReport() {
    const CAT_ORDER: MacOSCategory[] = ['latest', 'outdated', 'eol']
    const filtered = macFilteredRows
    const CI_OPTS: { key: typeof checkInFilter; label: string; dot: string; active: string }[] = [
      { key: 'all',    label: 'All',       dot: 'bg-slate-400',   active: 'bg-slate-600 text-white border-slate-600'   },
      { key: 'today',  label: 'Today',     dot: 'bg-emerald-500', active: 'bg-emerald-500 text-white border-emerald-500' },
      { key: '1-2d',   label: '1–2 days',  dot: 'bg-lime-500',    active: 'bg-lime-500 text-white border-lime-500'       },
      { key: '3-6d',   label: '3–6 days',  dot: 'bg-amber-400',   active: 'bg-amber-400 text-white border-amber-400'     },
      { key: '7plus',  label: '7+ days',   dot: 'bg-red-500',     active: 'bg-red-500 text-white border-red-500'         },
    ]
    return (
      <div className="flex flex-col gap-4">
        {/* Distribution summary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {CAT_ORDER.map(cat => {
            const meta  = MACOS_CAT_META[cat]
            const count = macRows[cat]?.length ?? 0
            const pct   = devices.length > 0 ? Math.round(count / devices.length * 100) : 0
            const colors = { emerald: 'border-emerald-200 text-emerald-600 bg-emerald-100', lime: 'border-lime-200 text-lime-600 bg-lime-100', amber: 'border-amber-200 text-amber-600 bg-amber-100', red: 'border-red-200 text-red-600 bg-red-100' }
            const c = colors[meta.color as keyof typeof colors]
            return (
              <button key={cat} type="button" onClick={() => setMacFilter(p => p === cat ? 'all' : cat)}
                className={`bg-white rounded-2xl border shadow-sm px-4 py-3 text-left transition hover:shadow-md ${macFilter === cat ? 'ring-2 ring-orange-300' : ''} ${c.split(' ')[0]}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-2xl font-black ${c.split(' ')[1]}`}>{count}</span>
                  <span className={`rounded-full ${c.split(' ')[2]} px-1.5 py-0.5 text-[0.58rem] font-bold ${c.split(' ')[1]}`}>{pct}%</span>
                </div>
                <p className="text-[0.65rem] font-semibold text-slate-600">{meta.label}</p>
                <p className="text-[0.58rem] text-slate-400 mt-0.5">{meta.action}</p>
              </button>
            )
          })}
        </div>
        <TableWrap title="Devices by macOS Version" count={filtered.length} footer="Click cards above to filter by OS · Use check-in chips to filter by activity · Drag column edges to resize"
          pagination={<Pagination page={macPage} totalPages={macTotalPages} onPageChange={setMacPage} totalItems={filtered.length} pageSize={PAGE_SIZE} itemLabel="device" />}>
          {/* Check-in filter chips */}
          <div className="flex flex-wrap items-center gap-1.5 px-4 py-2.5 border-b border-slate-100 bg-white">
            <span className="text-[0.6rem] font-semibold text-slate-400 uppercase tracking-wide mr-1">Last Check-in:</span>
            {CI_OPTS.map(o => (
              <button key={o.key} type="button"
                onClick={() => setCheckInFilter(p => p === o.key ? 'all' : o.key)}
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[0.6rem] font-semibold transition ${
                  checkInFilter === o.key ? o.active : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}>
                <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${checkInFilter === o.key ? 'bg-white' : o.dot}`} />
                {o.label}
              </button>
            ))}
          </div>
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <table className="text-xs" style={{ tableLayout: 'fixed', width: mrT }}>
              <colgroup>{RPT_MACOS_COLS.map(c => <col key={c.key} style={{ width: mrW[c.key] }} />)}</colgroup>
              <thead className="sticky top-0 z-10"><tr className="border-b border-slate-100 text-left bg-slate-50">
                {RPT_MACOS_COLS.map(c => (
                  <th key={c.key} className="relative px-4 py-2.5 text-[0.6rem] font-semibold uppercase tracking-wide text-slate-400 overflow-hidden">
                    {c.label}
                    <span className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-orange-400/50 active:bg-orange-500 transition-colors"
                      onMouseDown={e => mrR(c.key, e)} onClick={e => e.stopPropagation()} />
                  </th>
                ))}
              </tr></thead>
              <tbody>
                {macPaginated.map((d, i) => {
                  const cat  = macOSCategory(d.osVersion ?? '')
                  const meta = MACOS_CAT_META[cat]
                  const badgeCls = cat === 'latest' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : cat === 'outdated' ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-red-50 border-red-200 text-red-700'
                  return (
                    <tr key={d.id} className={`border-b border-slate-100 last:border-0 ${i%2 ? 'bg-slate-50/40' : ''}`}>
                      <td className="px-4 py-2.5 overflow-hidden"><span className="flex items-center gap-1.5"><Apple className="h-3 w-3 text-slate-400 flex-shrink-0" /><span className="font-medium text-slate-700 truncate block">{d.deviceName}</span></span></td>
                      <td className="px-4 py-2.5 text-slate-500 overflow-hidden truncate">{d.user}</td>
                      <td className="px-4 py-2.5 text-slate-500 overflow-hidden truncate">{d.model ? extractModelBase(d.model) : '—'}</td>
                      <td className="px-4 py-2.5 font-mono font-bold text-slate-700 overflow-hidden truncate">{d.osVersion}</td>
                      <td className="px-4 py-2.5 overflow-hidden">
                        <span className="flex items-center gap-1.5">
                          <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${checkInDot(d.lastCheckIn)}`} />
                          <span className="truncate text-slate-500">{d.lastCheckIn}</span>
                        </span>
                      </td>
                      <td className="px-4 py-2.5 overflow-hidden"><span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[0.58rem] font-bold ${badgeCls}`}>{meta.label}</span></td>
                      <td className="px-4 py-2.5 text-slate-500 overflow-hidden truncate">{meta.action}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </TableWrap>
      </div>
    )
  }

  function AppCurrencyReport() {
    const STATUS_META: Record<AppCurrencyStatus, { label: string; badge: string }> = {
      current:          { label: 'Current',          badge: 'bg-emerald-50 border-emerald-200 text-emerald-700' },
      update_available: { label: 'Update Available', badge: 'bg-amber-50 border-amber-200 text-amber-700'       },
      outdated:         { label: 'Outdated',         badge: 'bg-orange-50 border-orange-200 text-orange-700'    },
      failed:           { label: 'Failed Install',   badge: 'bg-red-50 border-red-200 text-red-700'             },
    }
    const counts = {
      current:          appRows.filter(r => r.status === 'current').length,
      update_available: appRows.filter(r => r.status === 'update_available').length,
      outdated:         appRows.filter(r => r.status === 'outdated').length,
      failed:           appRows.filter(r => r.status === 'failed').length,
    }
    const filtered = reportAppFilteredRows
    return (
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {(Object.entries(counts) as [AppCurrencyStatus, number][]).map(([s, n]) => {
            const m = STATUS_META[s]
            return (
              <button key={s} type="button" onClick={() => setAppFilter(p => p === s ? 'all' : s)}
                className={`bg-white rounded-2xl border shadow-sm px-4 py-3 text-left transition hover:shadow-md ${appFilter === s ? 'ring-2 ring-orange-300' : 'border-slate-200'}`}>
                <p className={`text-2xl font-black ${s === 'current' ? 'text-emerald-600' : s === 'update_available' ? 'text-amber-600' : s === 'outdated' ? 'text-orange-600' : 'text-red-600'}`}>{n}</p>
                <p className="text-[0.62rem] text-slate-400 mt-0.5">{m.label}</p>
              </button>
            )
          })}
        </div>
        <TableWrap title="App & Profile Currency" count={filtered.length} footer="Update Available → click to find download · Failed Install → click for failure reason · Drag edges to resize"
          pagination={<Pagination page={reportAppPage} totalPages={reportAppTotalPages} onPageChange={setReportAppPage} totalItems={filtered.length} pageSize={PAGE_SIZE} itemLabel="app" />}>
          {/* Failure reason panel — lives outside the scroll container so it doesn't break overflow */}
          {failPopover && (
            <div className="mx-4 mb-3 mt-1 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
              <XCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-red-700 mb-1">Install Failure Reason</p>
                <p className="text-[0.72rem] text-slate-700 leading-relaxed">{failPopover.reason}</p>
                <p className="text-[0.6rem] text-slate-400 mt-1">Check Kandji device activity log for full install output</p>
              </div>
              <button type="button" onClick={() => setFailPopover(null)} className="text-slate-400 hover:text-slate-600 transition flex-shrink-0">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          <div className="max-h-96 overflow-y-auto">
            <table className="w-full text-xs" style={{ tableLayout: 'fixed' }}>
              <colgroup>{RPT_APP_COLS.map(c => <col key={c.key} style={{ minWidth: arW[c.key] }} />)}</colgroup>
              <thead className="sticky top-0 z-10"><tr className="border-b border-slate-100 text-left bg-slate-50">
                {RPT_APP_COLS.map(c => (
                  <th key={c.key} className="relative px-4 py-2.5 text-[0.6rem] font-semibold uppercase tracking-wide text-slate-400 overflow-hidden">
                    {c.label}
                    <span className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-orange-400/50 active:bg-orange-500 transition-colors"
                      onMouseDown={e => arR(c.key, e)} onClick={e => e.stopPropagation()} />
                  </th>
                ))}
              </tr></thead>
              <tbody>
                {reportAppPaginated.map((r, i) => {
                  const isFailed  = r.status === 'failed'
                  const isUpdate  = r.status === 'update_available'
                  const failReason = FAIL_REASONS[hashCode(r.app.id) % FAIL_REASONS.length]
                  const isShowingFail = failPopover?.appId === r.app.id
                  return (
                    <tr key={r.app.id} className={`border-b border-slate-100 last:border-0 ${i%2 ? 'bg-slate-50/40' : ''} ${isShowingFail ? 'bg-red-50/40' : ''}`}>
                      <td className="px-4 py-2.5 overflow-hidden"><span className="flex items-center gap-1.5">{categoryIcon(r.app.category)}<span className="font-medium text-slate-700 truncate block">{r.app.name}</span></span></td>
                      <td className="px-4 py-2.5 overflow-hidden"><span className={`inline-flex rounded-full border px-2 py-0.5 text-[0.58rem] font-bold ${categoryBadge(r.app.category)}`}>{r.app.category}</span></td>
                      <td className="px-4 py-2.5 overflow-hidden">
                        {isUpdate ? (
                          <a href={`https://www.google.com/search?q=${encodeURIComponent(r.app.name)}+download+latest+version`}
                            target="_blank" rel="noopener noreferrer"
                            title="Search for latest version"
                            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.58rem] font-bold transition hover:brightness-95 ${STATUS_META[r.status].badge}`}>
                            <ExternalLink className="h-2.5 w-2.5" />{STATUS_META[r.status].label}
                          </a>
                        ) : isFailed ? (
                          <button type="button"
                            onClick={() => setFailPopover(p => p?.appId === r.app.id ? null : { appId: r.app.id, reason: failReason })}
                            title="Click to see failure reason"
                            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.58rem] font-bold transition hover:brightness-95 cursor-pointer ${STATUS_META[r.status].badge}`}>
                            <Info className="h-2.5 w-2.5" />{STATUS_META[r.status].label}
                          </button>
                        ) : (
                          <span className={`inline-flex rounded-full border px-2 py-0.5 text-[0.58rem] font-bold ${STATUS_META[r.status].badge}`}>{STATUS_META[r.status].label}</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-slate-600 font-semibold">{r.affectedDevices}</td>
                      <td className="px-4 py-2.5 text-slate-500 overflow-hidden truncate">{r.lastUpdated}</td>
                      <td className="px-4 py-2.5 text-slate-500 overflow-hidden truncate">{r.app.enforcement}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </TableWrap>
      </div>
    )
  }

  function StaleDevicesReport() {
    const counts = {
      7:  devices.filter(d => stalenessDays(d.lastCheckIn) >= 7).length,
      14: devices.filter(d => stalenessDays(d.lastCheckIn) >= 14).length,
      30: devices.filter(d => stalenessDays(d.lastCheckIn) >= 30).length,
      60: devices.filter(d => stalenessDays(d.lastCheckIn) >= 60).length,
    }
    return (
      <div className="flex flex-col gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-5 py-3.5 flex items-center gap-3 flex-wrap">
          <Filter className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
          <span className="text-xs font-semibold text-slate-600">Inactive threshold:</span>
          {([7, 14, 30, 60] as const).map(d => (
            <button key={d} type="button" onClick={() => setStaleThresh(d)}
              className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${staleThresh === d ? 'bg-amber-500 border-amber-500 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
              {d}+ days
            </button>
          ))}
          <span className="ml-auto text-xs text-slate-400">{staleRows.length} device{staleRows.length !== 1 ? 's' : ''} inactive ≥ {staleThresh} days</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {([7, 14, 30, 60] as const).map(d => (
            <div key={d} className={`bg-white rounded-2xl border shadow-sm px-4 py-3 ${d >= 30 ? 'border-amber-200' : 'border-slate-200'}`}>
              <p className={`text-2xl font-black ${d >= 30 ? 'text-amber-600' : 'text-slate-700'}`}>{counts[d]}</p>
              <p className="text-[0.62rem] text-slate-400 mt-0.5">Inactive ≥ {d} days</p>
            </div>
          ))}
        </div>
        <TableWrap title={`Devices Inactive ≥ ${staleThresh} days`} count={staleRows.length} footer="Stale devices may need re-enrollment or manual check-in"
          pagination={staleRows.length > 0 && <Pagination page={stalePage} totalPages={staleTotalPages} onPageChange={setStalePage} totalItems={staleRows.length} pageSize={PAGE_SIZE} itemLabel="device" />}>
          {staleRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-2">
              <CheckCircle className="h-8 w-8 opacity-30" />
              <p className="text-sm">No devices inactive beyond {staleThresh} days</p>
            </div>
          ) : (
            <div className="overflow-x-auto max-h-80 overflow-y-auto">
              <table className="text-xs" style={{ tableLayout: 'fixed', width: stT }}>
                <colgroup>{RPT_STALE_COLS.map(c => <col key={c.key} style={{ width: stW[c.key] }} />)}</colgroup>
                <thead className="sticky top-0 z-10"><tr className="border-b border-slate-100 text-left bg-slate-50">
                  {RPT_STALE_COLS.map(c => (
                    <th key={c.key} className="relative px-4 py-2.5 text-[0.6rem] font-semibold uppercase tracking-wide text-slate-400 overflow-hidden">
                      {c.label}
                      <span className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-orange-400/50 active:bg-orange-500 transition-colors"
                        onMouseDown={e => stR(c.key, e)} onClick={e => e.stopPropagation()} />
                    </th>
                  ))}
                </tr></thead>
                <tbody>
                  {stalePaginated.map((r, i) => (
                    <tr key={r.device.id} className={`border-b border-slate-100 last:border-0 ${i%2 ? 'bg-slate-50/40' : ''}`}>
                      <td className="px-4 py-2.5 overflow-hidden"><span className="flex items-center gap-1.5"><Apple className="h-3 w-3 text-slate-400" /><span className="font-medium text-slate-700 truncate block">{r.device.deviceName}</span></span></td>
                      <td className="px-4 py-2.5 text-slate-500 truncate overflow-hidden">{r.device.user}</td>
                      <td className="px-4 py-2.5 text-slate-500 overflow-hidden truncate">{r.device.model ? extractModelBase(r.device.model) : '—'}</td>
                      <td className="px-4 py-2.5 overflow-hidden">
                        <span className="flex items-center gap-1.5">
                          <span className="h-1.5 w-1.5 rounded-full flex-shrink-0 bg-red-400" />
                          <span className="truncate text-slate-500">{r.device.lastCheckIn}</span>
                        </span>
                        {r.device.enrollmentDate && <span className="block text-[0.58rem] text-slate-400 truncate mt-0.5 pl-3">Enrolled {r.device.enrollmentDate}</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`font-bold ${r.days >= 30 ? 'text-amber-600' : 'text-slate-600'}`}>{r.days}d</span>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        {r.days >= 30
                          ? <span className="inline-flex items-center rounded-full bg-red-50 border border-red-200 px-2 py-0.5 text-[0.58rem] font-bold text-red-600">Re-enroll</span>
                          : <span className="inline-flex items-center rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[0.58rem] font-bold text-amber-600">Send nudge</span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TableWrap>
      </div>
    )
  }

  function BlueprintPolicyReport() {
    return (
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[
            { label: 'Blueprints',          value: blueprintRows.length, border: 'border-slate-200',  txt: 'text-slate-800'  },
            { label: 'Avg Compliance Rate', value: `${Math.round(blueprintRows.reduce((s,r) => s + Math.round(r.compliant/r.total*100), 0) / Math.max(1, blueprintRows.length))}%`, border: 'border-emerald-200', txt: 'text-emerald-600' },
            { label: 'Unassigned Devices',  value: blueprintRows.find(r => r.blueprint === 'Unassigned')?.total ?? 0, border: 'border-amber-200', txt: 'text-amber-600' },
          ].map(c => (
            <div key={c.label} className={`bg-white rounded-2xl border ${c.border} shadow-sm px-4 py-3`}>
              <p className={`text-2xl font-black ${c.txt}`}>{c.value}</p>
              <p className="text-[0.62rem] text-slate-400 mt-0.5">{c.label}</p>
            </div>
          ))}
        </div>
        <TableWrap title="Blueprint & Policy Breakdown" count={blueprintRows.length} footer="Click a row to see devices under that blueprint · Drag column edges to resize"
          pagination={<Pagination page={bpPage} totalPages={bpTotalPages} onPageChange={setBpPage} totalItems={blueprintRows.length} pageSize={PAGE_SIZE} itemLabel="blueprint" />}>
          <div className="overflow-x-auto">
            <table className="text-xs" style={{ tableLayout: 'fixed', width: brT }}>
              <colgroup>{RPT_BP_COLS.map(c => <col key={c.key} style={{ width: brW[c.key] }} />)}</colgroup>
              <thead><tr className="border-b border-slate-100 text-left bg-slate-50">
                {RPT_BP_COLS.map(c => (
                  <th key={c.key} className="relative px-4 py-2.5 text-[0.6rem] font-semibold uppercase tracking-wide text-slate-400 overflow-hidden">
                    {c.label}
                    <span className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-orange-400/50 active:bg-orange-500 transition-colors"
                      onMouseDown={e => brR(c.key, e)} onClick={e => e.stopPropagation()} />
                  </th>
                ))}
              </tr></thead>
              <tbody>
                {bpPaginated.map((r) => {
                  const pct     = Math.round(r.compliant / r.total * 100)
                  const isOpen  = expandedRow === r.blueprint
                  const nonComp = r.total - r.compliant
                  return (
                    <Fragment key={r.blueprint}>
                      <tr onClick={() => setExpandedRow(p => p === r.blueprint ? null : r.blueprint)}
                        className={`border-b border-slate-100 cursor-pointer transition ${isOpen ? 'bg-orange-50' : 'hover:bg-slate-50'}`}>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-1.5">
                            <Shield className="h-3 w-3 text-orange-400 flex-shrink-0" />
                            <span className="font-medium text-slate-700">{r.blueprint}</span>
                            {r.blueprint === 'Unassigned' && <span className="rounded-full bg-amber-100 border border-amber-200 px-1 py-0.5 text-[0.55rem] font-bold text-amber-600">No policy</span>}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 font-bold text-slate-700">{r.total}</td>
                        <td className="px-4 py-2.5 font-semibold text-emerald-600">{r.compliant}</td>
                        <td className="px-4 py-2.5 font-semibold text-red-500">{nonComp}</td>
                        <td className="px-4 py-2.5 min-w-[120px]"><PctBar pct={pct} color={pct >= 80 ? 'emerald' : pct >= 60 ? 'amber' : 'red'} /></td>
                      </tr>
                      {isOpen && (
                        <tr key={`${r.blueprint}-exp`} className="bg-orange-50/40 border-b border-orange-100">
                          <td colSpan={5} className="px-5 py-3">
                            <p className="text-[0.65rem] font-semibold text-slate-500 mb-2">{r.devices.length} device{r.devices.length!==1?'s':''} under this blueprint</p>
                            <div className="flex flex-wrap gap-1.5">
                              {r.devices.map(d => (
                                <span key={d.id} className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[0.62rem] font-medium ${d.complianceState === 'Compliant' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-600'}`}>
                                  <Apple className="h-2.5 w-2.5" />{d.deviceName}
                                </span>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        </TableWrap>
      </div>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  const isFullReport = activeReport === 'iru_patch_report' || activeReport === 'fleet_kpi_cards'
  const analyticalDefs = REPORT_DEFS.filter(d => d.group === 'analytical')
  const fullDefs       = REPORT_DEFS.filter(d => d.group === 'full')

  return (
    <div className="flex flex-col gap-5">

      {/* ── Report selector — two groups ── */}
      <div className="flex flex-col gap-4 bg-white rounded-2xl border border-slate-200 shadow-sm px-5 py-4">
        {/* Analytical reports */}
        <div>
          <p className="text-[0.6rem] font-semibold text-slate-400 uppercase tracking-wide mb-2.5">Analytical Reports</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2">
            {analyticalDefs.map(d => {
              const isActive = activeReport === d.id
              return (
                <button key={d.id} type="button" onClick={() => { setActiveReport(d.id); setExpandedRow(null) }}
                  className={`flex flex-col gap-1.5 rounded-xl border px-3 py-3 text-left transition shadow-sm hover:shadow-md ${
                    isActive ? 'border-orange-400 bg-orange-50 ring-2 ring-orange-200' : 'border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white'
                  }`}>
                  <div className={`rounded-lg p-1.5 w-fit ${isActive ? 'bg-orange-100 text-orange-600' : 'bg-white text-slate-500 border border-slate-200'}`}>{d.icon}</div>
                  <p className={`text-[0.65rem] font-bold leading-tight ${isActive ? 'text-orange-700' : 'text-slate-700'}`}>{d.label}</p>
                  <p className="text-[0.58rem] text-slate-400 leading-tight hidden sm:block">{d.description}</p>
                </button>
              )
            })}
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-slate-100" />

        {/* Full-page reports */}
        <div>
          <p className="text-[0.6rem] font-semibold text-slate-400 uppercase tracking-wide mb-2.5">Full Report Views</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {fullDefs.map(d => {
              const isActive = activeReport === d.id
              return (
                <button key={d.id} type="button" onClick={() => { setActiveReport(d.id); setExpandedRow(null) }}
                  className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition shadow-sm hover:shadow-md ${
                    isActive ? 'border-orange-400 bg-orange-50 ring-2 ring-orange-200' : 'border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white'
                  }`}>
                  <div className={`rounded-lg p-2 flex-shrink-0 ${isActive ? 'bg-orange-100 text-orange-600' : 'bg-white text-slate-500 border border-slate-200'}`}>{d.icon}</div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <p className={`text-xs font-bold ${isActive ? 'text-orange-700' : 'text-slate-700'}`}>{d.label}</p>
                      <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[0.55rem] font-bold text-slate-500 uppercase tracking-wide">Full Page</span>
                    </div>
                    <p className="text-[0.62rem] text-slate-400 mt-0.5">{d.description}</p>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Controls bar — hidden for full-page reports */}
      {!isFullReport && (
        <div className="flex items-center gap-3 flex-wrap bg-white rounded-2xl border border-slate-200 shadow-sm px-4 py-2.5">
          <div className="flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5 text-slate-400" />
            <span className="text-xs font-semibold text-slate-600 mr-1">Period:</span>
            {(['3mo', '6mo', '12mo'] as DateRange[]).map(r => (
              <button key={r} type="button" onClick={() => setDateRange(r)}
                className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition ${dateRange === r ? 'bg-orange-500 border-orange-500 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
                {r === '3mo' ? '3 months' : r === '6mo' ? '6 months' : '12 months'}
              </button>
            ))}
          </div>
          <div className="h-4 w-px bg-slate-200 hidden sm:block" />
          <div className="flex items-center gap-1">
            <span className="text-slate-400">{def.icon}</span>
            <span className="text-xs font-semibold text-slate-700">{def.label}</span>
            <span className="text-xs text-slate-400">— {def.description}</span>
          </div>
          <button type="button" onClick={handleExport}
            className="ml-auto flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition shadow-sm">
            <Download className="h-3.5 w-3.5" />Export CSV
          </button>
        </div>
      )}

      {/* Active analytical report */}
      {activeReport === 'fleet_growth'     && FleetGrowthReport()}
      {activeReport === 'patch_compliance' && PatchComplianceReport()}
      {activeReport === 'macos_versions'   && MacOSVersionsReport()}
      {activeReport === 'app_currency'     && AppCurrencyReport()}
      {activeReport === 'stale_devices'    && StaleDevicesReport()}
      {activeReport === 'blueprint_policy' && BlueprintPolicyReport()}

      {/* Active full-page report */}
      {activeReport === 'iru_patch_report' && <IruPatchReportPage />}
      {activeReport === 'fleet_kpi_cards'  && <MacFleetReportsPage />}

    </div>
  )
}

// ─── Security Tab ──────────────────────────────────────────────────────────────

type GapFilter = 'filevault' | 'edr' | 'firewall' | 'compliance' | null

function SecurityTab({
  devices,
  loading,
  onSelectDevice,
  onViewLogs,
}: {
  devices: ApiDevice[]
  loading: boolean
  onSelectDevice: (d: ApiDevice) => void
  onViewLogs: (d: ApiDevice) => void
}) {
  const { widths: sw, startResize: sResize, totalWidth: sTotal } = useColumnResize<SColKey>(SECURITY_COLS, 'kandji-security')
  const [search, setSearch] = useState('')
  const [riskFilter, setRiskFilter] = useState<'All' | 'At Risk' | 'Secure'>('All')
  const [gapFilter, setGapFilter] = useState<GapFilter>(null)

  const total = devices.length

  const secStats = useMemo(() => ({
    filevaultOn:  devices.filter(d => filevaultOn(d)).length,
    edrActive:    devices.filter(d => !!edrLabel(d)).length,
    firewallOn:   devices.filter(d => firewallEnabled(d)).length,
    compliant:    devices.filter(d => d.complianceState === 'Compliant').length,
    noFileVault:  devices.filter(d => !filevaultOn(d)).length,
    noEdr:        devices.filter(d => !edrLabel(d)).length,
    noFirewall:   devices.filter(d => !firewallEnabled(d)).length,
    nonCompliant: devices.filter(d => d.complianceState !== 'Compliant').length,
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

  const { page, setPage, totalPages, paginated } = usePagination(filtered, PAGE_SIZE)

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
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {metricBar('FileVault Encryption', secStats.filevaultOn, total, 'emerald', <Lock className="h-3.5 w-3.5 text-emerald-500" />)}
        {metricBar('EDR / CrowdStrike', secStats.edrActive, total, 'orange', <Shield className="h-3.5 w-3.5 text-orange-500" />)}
        {metricBar('macOS Firewall', secStats.firewallOn, total, 'amber', <Flame className="h-3.5 w-3.5 text-amber-500" />)}
        {metricBar('MDM Compliance', secStats.compliant, total, 'emerald', <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />)}
      </div>

      {total > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-5 py-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[0.6rem] font-semibold text-slate-400 uppercase tracking-wide">Security Gaps — click to filter devices</p>
            {gapFilter && (
              <button type="button" onClick={() => setGapFilter(null)} className="flex items-center gap-1 text-[0.65rem] font-medium text-slate-500 hover:text-slate-700 transition">
                <X className="h-3 w-3" />Clear filter
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {secStats.noFileVault > 0 && (
              <button type="button" onClick={() => toggleGap('filevault')}
                className={`flex items-center gap-2 rounded-xl border px-3 py-2 transition-all ${gapFilter === 'filevault' ? 'border-red-400 bg-red-100 ring-2 ring-red-200 shadow-sm' : 'border-red-200 bg-red-50 hover:bg-red-100 hover:border-red-300'}`}>
                <Lock className="h-3.5 w-3.5 text-red-500" />
                <span className="text-xs font-semibold text-red-700">{secStats.noFileVault} without FileVault</span>
                {gapFilter === 'filevault' && <X className="h-3 w-3 text-red-400 ml-1" />}
              </button>
            )}
            {secStats.noEdr > 0 && (
              <button type="button" onClick={() => toggleGap('edr')}
                className={`flex items-center gap-2 rounded-xl border px-3 py-2 transition-all ${gapFilter === 'edr' ? 'border-orange-400 bg-orange-100 ring-2 ring-orange-200 shadow-sm' : 'border-orange-200 bg-orange-50 hover:bg-orange-100 hover:border-orange-300'}`}>
                <Shield className="h-3.5 w-3.5 text-orange-500" />
                <span className="text-xs font-semibold text-orange-700">{secStats.noEdr} without EDR</span>
                {gapFilter === 'edr' && <X className="h-3 w-3 text-orange-400 ml-1" />}
              </button>
            )}
            {secStats.noFirewall > 0 && (
              <button type="button" onClick={() => toggleGap('firewall')}
                className={`flex items-center gap-2 rounded-xl border px-3 py-2 transition-all ${gapFilter === 'firewall' ? 'border-amber-400 bg-amber-100 ring-2 ring-amber-200 shadow-sm' : 'border-amber-200 bg-amber-50 hover:bg-amber-100 hover:border-amber-300'}`}>
                <Flame className="h-3.5 w-3.5 text-amber-500" />
                <span className="text-xs font-semibold text-amber-700">{secStats.noFirewall} without Firewall</span>
                {gapFilter === 'firewall' && <X className="h-3 w-3 text-amber-400 ml-1" />}
              </button>
            )}
            {secStats.nonCompliant > 0 && (
              <button type="button" onClick={() => toggleGap('compliance')}
                className={`flex items-center gap-2 rounded-xl border px-3 py-2 transition-all ${gapFilter === 'compliance' ? 'border-red-400 bg-red-100 ring-2 ring-red-200 shadow-sm' : 'border-red-200 bg-red-50 hover:bg-red-100 hover:border-red-300'}`}>
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
                      {!('noResize' in col && col.noResize) && (
                        <span className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-orange-400/50 active:bg-orange-500 transition-colors"
                          onMouseDown={e => sResize(col.key, e)} onClick={e => e.stopPropagation()} />
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginated.map((d, i) => {
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
                        <div className="flex items-center gap-1.5">
                          <button type="button" onClick={e => { e.stopPropagation(); onViewLogs(d) }}
                            title="View device logs"
                            className="inline-flex items-center gap-1 rounded-md border border-violet-200 bg-violet-50 px-1.5 py-1 text-violet-600 hover:bg-violet-100 hover:border-violet-300 transition">
                            <Terminal className="h-3 w-3" />
                            <span className="text-[0.6rem] font-semibold">Logs</span>
                          </button>
                          <button type="button" onClick={e => { e.stopPropagation(); onSelectDevice(d) }}
                            title="Device details"
                            className="inline-flex items-center gap-1 rounded-md border border-orange-200 bg-orange-50 px-1.5 py-1 text-orange-600 hover:bg-orange-100 hover:border-orange-300 transition">
                            <Info className="h-3 w-3" />
                            <span className="text-[0.6rem] font-semibold">Info</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} totalItems={filtered.length} pageSize={PAGE_SIZE} itemLabel="device" />
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Mac Automation Tab ────────────────────────────────────────────────────────

const MAC_AUTOMATION_RULES = [
  { id: 'ma-001', name: 'FileVault Auto-Remediation', description: 'Trigger the FileVault enforcement runbook automatically when a Mac reports disk encryption as disabled.', category: 'security', enabled: true, trigger: 'FileVault turns Off', actions: ['Execute FileVault runbook', 'Send in-app notification'], lastTriggered: new Date(Date.now() - 2_700_000).toISOString(), triggerCount: 11 },
  { id: 'ma-002', name: 'Stale Mac Alert (7 days)', description: 'Alert the IT team and create a Jira task when a Mac has not checked into Kandji for 7+ days.', category: 'compliance', enabled: true, trigger: 'Device offline > 7 days', actions: ['Create Jira task', 'Slack alert'], lastTriggered: new Date(Date.now() - 24 * 3_600_000).toISOString(), triggerCount: 5 },
  { id: 'ma-003', name: 'macOS Version Enforcement', description: 'Nudge users on End-of-Life or severely outdated macOS versions with an in-app alert and Slack DM.', category: 'patching', enabled: true, trigger: 'macOS version = EOL or N-2+', actions: ['Send notification', 'Slack DM to user'], lastTriggered: new Date(Date.now() - 3 * 3_600_000).toISOString(), triggerCount: 19 },
  { id: 'ma-004', name: 'CrowdStrike Health Monitor', description: 'Create a Jira security incident if the CrowdStrike EDR agent becomes inactive on any managed Mac.', category: 'security', enabled: true, trigger: 'CrowdStrike status → Inactive', actions: ['Create Jira incident', 'Slack urgent alert'], lastTriggered: new Date(Date.now() - 48 * 3_600_000).toISOString(), triggerCount: 2 },
  { id: 'ma-005', name: 'New Mac Onboarding', description: 'Automatically run onboarding scripts and push the welcome blueprint when a new Mac enrolls in Kandji.', category: 'compliance', enabled: false, trigger: 'New device enrollment', actions: ['Run onboarding script', 'Assign blueprint'], triggerCount: 0 },
]

const MAC_CATEGORY_BADGE: Record<string, string> = {
  security:   'bg-red-50 text-red-700 border-red-200',
  compliance: 'bg-blue-50 text-blue-700 border-blue-200',
  patching:   'bg-orange-50 text-orange-700 border-orange-200',
}

function macRelTime(iso?: string) {
  if (!iso) return 'Never'
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 2)  return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function MacAutomationTab() {
  const { notify }  = useToast()
  const [rules, setRules]   = useState(MAC_AUTOMATION_RULES)
  const [expanded, setExpanded] = useState<string | null>(null)

  const toggle = (id: string) => {
    setRules(prev => prev.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r))
    const rule = rules.find(r => r.id === id)
    if (rule) notify('success', 'Rule Updated', `"${rule.name}" ${rule.enabled ? 'disabled' : 'enabled'}`)
  }

  const runTest = (id: string) => {
    const rule = rules.find(r => r.id === id)
    if (!rule) return
    notify('info', 'Test Triggered', `Running test for "${rule.name}"…`)
    setTimeout(() => notify('success', 'Test Complete', `"${rule.name}" — all actions passed`), 1800)
  }

  const active = rules.filter(r => r.enabled).length

  return (
    <div className="space-y-4">
      {/* KPI row */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total Rules', value: rules.length, color: '#F46C00' },
          { label: 'Active',      value: active,       color: '#10B981' },
          { label: 'Inactive',    value: rules.length - active, color: '#94A3B8' },
        ].map(s => (
          <div key={s.label} className="glass rounded-2xl overflow-hidden relative p-4">
            <div className="h-[2px] absolute top-0 left-0 right-0" style={{ background: s.color }} />
            <p className="text-[0.6rem] font-black uppercase tracking-widest text-slate-400">{s.label}</p>
            <p className="text-2xl font-black mt-1" style={{ color: s.color }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Rules */}
      <div className="space-y-3">
        {rules.map(rule => (
          <div key={rule.id} className="glass rounded-2xl overflow-hidden">
            <div className="h-[2px]" style={{ background: rule.enabled ? 'linear-gradient(90deg,#F46C00,#FB471F)' : '#E2E8F0' }} />
            <div className="px-5 py-4">
              <div className="flex items-start gap-3">
                <div className="mt-1 h-2 w-2 flex-shrink-0 rounded-full" style={{ background: rule.enabled ? '#10B981' : '#CBD5E1' }} />
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <p className="text-sm font-bold text-slate-700">{rule.name}</p>
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[0.6rem] font-bold capitalize ${MAC_CATEGORY_BADGE[rule.category] ?? 'bg-slate-50 text-slate-500 border-slate-200'}`}>{rule.category}</span>
                  </div>
                  <p className="text-[0.72rem] text-slate-500 leading-relaxed">{rule.description}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 border border-slate-200 px-2.5 py-1 text-[0.62rem] font-semibold text-slate-600">
                      <Clock className="h-2.5 w-2.5 text-slate-400" />{rule.trigger}
                    </span>
                    {rule.actions.map(a => (
                      <span key={a} className="inline-flex rounded-full bg-[#F46C00]/8 border border-[#F46C00]/20 px-2.5 py-1 text-[0.62rem] font-semibold text-[#F46C00]">{a}</span>
                    ))}
                  </div>
                </div>
                <button type="button" onClick={() => toggle(rule.id)} className="flex-shrink-0">
                  {rule.enabled ? <ToggleRight className="h-8 w-8 text-emerald-500" /> : <ToggleLeft className="h-8 w-8 text-slate-300" />}
                </button>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex gap-4 text-[0.62rem] text-slate-400">
                  <span>Last triggered: <strong className="text-slate-600">{macRelTime(rule.lastTriggered)}</strong></span>
                  <span>Total runs: <strong className="text-slate-600">{rule.triggerCount}</strong></span>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setExpanded(e => e === rule.id ? null : rule.id)}
                    className="flex items-center gap-1 rounded-full border border-slate-200 glass px-3 py-1 text-[0.62rem] font-semibold text-slate-500 water-glow-sm">
                    {expanded === rule.id ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    {expanded === rule.id ? 'Less' : 'Details'}
                  </button>
                  <button type="button" onClick={() => runTest(rule.id)} disabled={!rule.enabled}
                    className="flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[0.62rem] font-bold text-emerald-700 hover:bg-emerald-100 transition disabled:opacity-40 water-glow-sm">
                    <Play className="h-2.5 w-2.5" />Test Run
                  </button>
                </div>
              </div>
              {expanded === rule.id && (
                <div className="mt-3 border-t border-slate-100 pt-3 text-[0.68rem] text-slate-500 space-y-1">
                  <p><strong className="text-slate-600">Trigger:</strong> {rule.trigger}</p>
                  <p><strong className="text-slate-600">Actions:</strong> {rule.actions.join(' → ')}</p>
                  <p><strong className="text-slate-600">Category:</strong> {rule.category}</p>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="glass rounded-2xl p-4 text-center">
        <Apple className="mx-auto h-6 w-6 text-slate-300 mb-2" />
        <p className="text-xs text-slate-500 mb-2">Create advanced macOS automation rules in the full Automation Engine.</p>
        <button type="button" className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold text-white water-glow"
          style={{ background: 'linear-gradient(135deg,#F46C00,#FB471F)' }}>
          <Plus className="h-3.5 w-3.5" />Open Automation Engine
        </button>
      </div>
    </div>
  )
}

// ─── KPI Drill-down Modal ─────────────────────────────────────────────────────

function KpiDrillModal({
  title, icon, devices, accent, onClose, onSelectDevice,
}: {
  title: string
  icon: React.ReactNode
  devices: ApiDevice[]
  accent: string
  onClose: () => void
  onSelectDevice: (d: ApiDevice) => void
}) {
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    if (!q) return devices
    return devices.filter(d =>
      d.deviceName.toLowerCase().includes(q) ||
      d.user.toLowerCase().includes(q) ||
      (d.model ?? '').toLowerCase().includes(q) ||
      (d.osVersion ?? '').toLowerCase().includes(q)
    )
  }, [devices, search])

  const { page, setPage, totalPages, paginated } = usePagination(filtered, PAGE_SIZE)

  function handleExport() {
    const headers = ['Device', 'User', 'Model', 'macOS', 'FileVault', 'EDR', 'Compliance']
    const rows = filtered.map(d => [
      d.deviceName, d.user, d.model ?? '', d.osVersion ?? '',
      filevaultOn(d) ? 'On' : 'Off',
      edrLabel(d) || 'None',
      d.complianceState,
    ])
    downloadCsv(`${title.replace(/\s+/g, '-').toLowerCase()}-${new Date().toISOString().slice(0,10)}.csv`, headers, rows as unknown as (string|number)[])
  }

  const accentRing = accent === 'emerald' ? 'focus:ring-emerald-300' : accent === 'red' ? 'focus:ring-red-300' : accent === 'orange' ? 'focus:ring-orange-300' : 'focus:ring-slate-300'

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm cursor-pointer" />
      <div className="relative bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl max-h-[80vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100 bg-slate-50 flex-shrink-0">
          <div className="rounded-xl bg-slate-100 p-2 flex-shrink-0">{icon}</div>
          <div className="flex-1">
            <p className="font-bold text-slate-800 text-sm">{title}</p>
            <p className="text-[0.62rem] text-slate-400">{devices.length} device{devices.length !== 1 ? 's' : ''}</p>
          </div>
          <button type="button" onClick={handleExport}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-orange-300 hover:bg-orange-50 hover:text-orange-700 transition mr-1">
            <Download className="h-3.5 w-3.5" />Export CSV
          </button>
          <button type="button" onClick={onClose}
            className="rounded-xl border border-slate-200 p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition flex-shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>
        {/* Search */}
        <div className="px-6 py-3 border-b border-slate-100 flex-shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search by device, user, model, OS…"
              className={`w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-4 py-2 text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 ${accentRing} focus:border-transparent`} />
            {search && <button type="button" onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><X className="h-3 w-3" /></button>}
          </div>
        </div>
        {/* Table */}
        <div className="flex-1 overflow-auto">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-slate-400 gap-2">
              <Apple className="h-7 w-7 opacity-30" /><p className="text-sm">No devices match</p>
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 z-10">
                <tr>
                  {['Device', 'User', 'Model', 'macOS', 'FileVault', 'EDR', 'Compliance'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-[0.6rem] font-semibold uppercase tracking-wide text-slate-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginated.map((d, i) => (
                  <tr key={d.id} onClick={() => onSelectDevice(d)}
                    className={`border-b border-slate-100 last:border-0 cursor-pointer transition-colors hover:bg-orange-50/60 ${i % 2 !== 0 ? 'bg-slate-50/40' : ''}`}>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <Apple className="h-3 w-3 text-slate-400 flex-shrink-0" />
                        <span className="font-medium text-slate-800 truncate max-w-[140px]">{d.deviceName}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-slate-500 truncate max-w-[120px]">{d.user}</td>
                    <td className="px-4 py-2.5 text-slate-500 truncate max-w-[100px]">{extractModelBase(d.model)}</td>
                    <td className="px-4 py-2.5 font-mono text-slate-500">{d.osVersion}</td>
                    <td className="px-4 py-2.5">
                      {filevaultOn(d)
                        ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[0.6rem] font-bold text-emerald-700"><CheckCircle className="h-2.5 w-2.5" />On</span>
                        : <span className="inline-flex items-center gap-1 rounded-full bg-red-50 border border-red-200 px-2 py-0.5 text-[0.6rem] font-bold text-red-600"><XCircle className="h-2.5 w-2.5" />Off</span>
                      }
                    </td>
                    <td className="px-4 py-2.5">
                      {edrLabel(d)
                        ? <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 border border-orange-200 px-2 py-0.5 text-[0.6rem] font-bold text-orange-700"><Shield className="h-2.5 w-2.5" />{edrLabel(d)}</span>
                        : <span className="text-slate-300">None</span>
                      }
                    </td>
                    <td className="px-4 py-2.5">
                      {d.complianceState === 'Compliant'
                        ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[0.6rem] font-bold text-emerald-700"><ShieldCheck className="h-2.5 w-2.5" />Compliant</span>
                        : d.complianceState === 'Warning'
                        ? <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[0.6rem] font-bold text-amber-700"><AlertTriangle className="h-2.5 w-2.5" />Warning</span>
                        : <span className="inline-flex items-center gap-1 rounded-full bg-red-50 border border-red-200 px-2 py-0.5 text-[0.6rem] font-bold text-red-600"><ShieldAlert className="h-2.5 w-2.5" />Non-Compliant</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {filtered.length > 0 && (
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} totalItems={filtered.length} pageSize={PAGE_SIZE} itemLabel="device" />
        )}
        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between flex-shrink-0">
          <span className="text-[0.65rem] text-slate-400">click a row to view details</span>
          <button type="button" onClick={onClose}
            className="rounded-xl bg-orange-500 px-4 py-2 text-xs font-semibold text-white hover:bg-orange-600 transition shadow-sm">
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'devices',      label: 'Devices',     icon: <Apple     className="h-3.5 w-3.5" /> },
  { id: 'applications', label: 'App Library', icon: <Package   className="h-3.5 w-3.5" /> },
  { id: 'security',     label: 'Security',    icon: <Shield    className="h-3.5 w-3.5" /> },
  { id: 'automation',   label: 'Automation',  icon: <Zap       className="h-3.5 w-3.5" /> },
  { id: 'reports',      label: 'Reports',     icon: <BarChart2 className="h-3.5 w-3.5" /> },
]

export function KandjiMacPage({ onBack, onViewDevice: _onViewDevice }: Props) {
  const [tab, setTab]                     = useState<Tab>('devices')
  const [devices, setDevices]             = useState<ApiDevice[]>([])
  const [kandjiApps, setKandjiApps]       = useState<LibraryApp[]>([])
  const [loadingDevices, setLoadingDevices] = useState(true)
  const [loadingApps, setLoadingApps]     = useState(true)
  const [usingMockApps, setUsingMockApps] = useState(false)
  const [panelDevice, setPanelDevice]     = useState<ApiDevice | null>(null)
  const [logDevice, setLogDevice]         = useState<ApiDevice | null>(null)
  const [showAddDevice, setShowAddDevice] = useState(false)
  const [showAddApp, setShowAddApp]       = useState(false)
  const [kpiModal, setKpiModal]           = useState<{ title: string; icon: React.ReactNode; devices: ApiDevice[]; accent: string } | null>(null)

  // Persisted additions (localStorage)
  const [addedDevices, setAddedDevices]   = useState<AddedDevice[]>(() => loadLS<AddedDevice>(LS_DEVICES))
  const [addedApps, setAddedApps]         = useState<AddedApp[]>(() => loadLS<AddedApp>(LS_APPS))

  function handleAddDevice(d: AddedDevice) {
    const next = [d, ...addedDevices]
    setAddedDevices(next)
    saveLS(LS_DEVICES, next)
  }

  function handleAddApp(a: AddedApp) {
    const next = [a, ...addedApps]
    setAddedApps(next)
    saveLS(LS_APPS, next)
  }

  function handleRemoveDevice(id: string) {
    const next = addedDevices.filter(d => d.id !== id)
    setAddedDevices(next)
    saveLS(LS_DEVICES, next)
  }

  function handleRemoveApp(id: string) {
    const next = addedApps.filter(a => a.id !== id)
    setAddedApps(next)
    saveLS(LS_APPS, next)
  }

  // Merge added devices/apps into fetched data
  const allDevices: ApiDevice[] = useMemo(() => {
    const added = addedDevices.map(addedDeviceToApiDevice)
    return [...added, ...devices]
  }, [devices, addedDevices])

  const allApps: LibraryApp[] = useMemo(() => {
    const added: LibraryApp[] = addedApps.map(a => ({
      id: a.id, name: a.name, category: a.category, enforcement: a.enforcement, active: true,
    }))
    return [...added, ...kandjiApps]
  }, [kandjiApps, addedApps])

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
    const total        = allDevices.length
    const filevaultOn_ = allDevices.filter(d => filevaultOn(d)).length
    const edrActive    = allDevices.filter(d => !!edrLabel(d)).length
    const compliant    = allDevices.filter(d => d.complianceState === 'Compliant').length
    const warning      = allDevices.filter(d => d.complianceState === 'Warning').length
    const nonCompliant = allDevices.filter(d => d.complianceState === 'Non-Compliant').length
    return { total, filevaultOn: filevaultOn_, edrActive, compliant, warning, nonCompliant }
  }, [allDevices])

  const isLoading = loadingDevices && loadingApps

  // Recently added — last 3 of each
  const recentDevices = addedDevices.slice(0, 3)
  const recentApps    = addedApps.slice(0, 3)
  const hasRecent     = recentDevices.length > 0 || recentApps.length > 0

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
          <button type="button" onClick={() => setShowAddDevice(true)}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm hover:bg-slate-50 hover:border-orange-300 hover:text-orange-600 transition">
            <Plus className="h-3.5 w-3.5" />Add Device
          </button>
          <button type="button" onClick={fetchAll}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium text-slate-500 shadow-sm transition ${isLoading ? 'border-orange-300 bg-orange-50 animate-pulse' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin text-orange-500' : ''}`} />Refresh
          </button>
        </div>
      </div>

      {/* ── Overview stat cards — each clickable, opens drill-down modal ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
        <button type="button" disabled={loadingDevices}
          onClick={() => setKpiModal({ title: 'All Mac Devices', icon: <Apple className="h-4 w-4 text-slate-600" />, devices: allDevices, accent: 'slate' })}
          className="bg-white rounded-2xl border border-slate-200 shadow-sm px-4 py-3 flex items-center gap-3 text-left w-full transition hover:shadow-md hover:border-slate-400 disabled:cursor-default group">
          <div className="rounded-xl bg-slate-100 p-2 flex-shrink-0 group-hover:bg-slate-200 transition"><Apple className="h-4 w-4 text-slate-600" /></div>
          <div><p className="text-2xl font-black text-slate-800">{loadingDevices ? '—' : stats.total.toLocaleString()}</p><p className="text-[0.62rem] text-slate-400 font-medium">Total Macs</p></div>
        </button>
        <button type="button" disabled={loadingDevices}
          onClick={() => setKpiModal({ title: 'FileVault Enabled', icon: <Lock className="h-4 w-4 text-emerald-600" />, devices: allDevices.filter(d => filevaultOn(d)), accent: 'emerald' })}
          className="bg-white rounded-2xl border border-emerald-200 shadow-sm px-4 py-3 flex items-center gap-3 text-left w-full transition hover:shadow-md hover:border-emerald-400 disabled:cursor-default group">
          <div className="rounded-xl bg-emerald-100 p-2 flex-shrink-0 group-hover:bg-emerald-200 transition"><Lock className="h-4 w-4 text-emerald-600" /></div>
          <div>
            <p className="text-2xl font-black text-emerald-600">{loadingDevices ? '—' : stats.total > 0 ? `${Math.round(stats.filevaultOn / stats.total * 100)}%` : '—'}</p>
            <p className="text-[0.62rem] text-slate-400 font-medium">FileVault On</p>
          </div>
        </button>
        <button type="button" disabled={loadingDevices}
          onClick={() => setKpiModal({ title: 'EDR Active', icon: <Shield className="h-4 w-4 text-orange-600" />, devices: allDevices.filter(d => !!edrLabel(d)), accent: 'orange' })}
          className="bg-white rounded-2xl border border-orange-200 shadow-sm px-4 py-3 flex items-center gap-3 text-left w-full transition hover:shadow-md hover:border-orange-400 disabled:cursor-default group">
          <div className="rounded-xl bg-orange-100 p-2 flex-shrink-0 group-hover:bg-orange-200 transition"><Shield className="h-4 w-4 text-orange-600" /></div>
          <div>
            <p className="text-2xl font-black text-orange-600">{loadingDevices ? '—' : stats.total > 0 ? `${Math.round(stats.edrActive / stats.total * 100)}%` : '—'}</p>
            <p className="text-[0.62rem] text-slate-400 font-medium">EDR Active</p>
          </div>
        </button>
        <button type="button" disabled={loadingDevices}
          onClick={() => setKpiModal({ title: 'Compliant Devices', icon: <ShieldCheck className="h-4 w-4 text-emerald-600" />, devices: allDevices.filter(d => d.complianceState === 'Compliant'), accent: 'emerald' })}
          className="bg-white rounded-2xl border border-emerald-200 shadow-sm px-4 py-3 flex items-center gap-3 text-left w-full transition hover:shadow-md hover:border-emerald-400 disabled:cursor-default group">
          <div className="rounded-xl bg-emerald-100 p-2 flex-shrink-0 group-hover:bg-emerald-200 transition"><ShieldCheck className="h-4 w-4 text-emerald-600" /></div>
          <div>
            <p className="text-2xl font-black text-emerald-600">{loadingDevices ? '—' : stats.compliant.toLocaleString()}</p>
            <p className="text-[0.62rem] text-slate-400 font-medium">Compliant</p>
          </div>
        </button>
        <button type="button" disabled={loadingDevices}
          onClick={() => setKpiModal({ title: 'Needs Attention', icon: <ShieldAlert className="h-4 w-4 text-red-600" />, devices: allDevices.filter(d => d.complianceState !== 'Compliant'), accent: 'red' })}
          className="bg-white rounded-2xl border border-red-200 shadow-sm px-4 py-3 flex items-center gap-3 text-left w-full transition hover:shadow-md hover:border-red-400 disabled:cursor-default group">
          <div className="rounded-xl bg-red-100 p-2 flex-shrink-0 group-hover:bg-red-200 transition"><ShieldAlert className="h-4 w-4 text-red-600" /></div>
          <div>
            <p className="text-2xl font-black text-red-600">{loadingDevices ? '—' : (stats.warning + stats.nonCompliant).toLocaleString()}</p>
            <p className="text-[0.62rem] text-slate-400 font-medium">Needs Attention</p>
          </div>
        </button>
      </div>

      {/* ── Recently Added ── */}
      {hasRecent && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 px-5 py-3.5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-[0.6rem] font-bold text-emerald-700 uppercase tracking-wide">Recently Added</span>
              <span className="rounded-full bg-emerald-100 border border-emerald-200 px-1.5 py-0.5 text-[0.55rem] font-bold text-emerald-700">
                {addedDevices.length + addedApps.length}
              </span>
            </div>
            <button type="button"
              onClick={() => { setAddedDevices([]); setAddedApps([]); saveLS(LS_DEVICES, []); saveLS(LS_APPS, []) }}
              className="text-[0.62rem] text-slate-400 hover:text-red-500 transition font-medium">
              Clear all
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Recent Devices */}
            {recentDevices.length > 0 && (
              <div>
                <p className="text-[0.58rem] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Devices</p>
                <div className="flex flex-col gap-1">
                  {recentDevices.map(d => (
                    <div key={d.id} className="flex items-center gap-2.5 bg-white rounded-xl border border-emerald-100 px-3 py-2 shadow-sm group">
                      <Apple className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-slate-700 truncate">{d.deviceName}</p>
                        <p className="text-[0.6rem] text-slate-400 truncate">{d.user} · {d.model}</p>
                      </div>
                      <span className="text-[0.6rem] text-slate-400 flex-shrink-0">{timeAgo(d.addedAt)}</span>
                      <button type="button" onClick={() => handleRemoveDevice(d.id)}
                        className="text-slate-300 hover:text-red-400 transition opacity-0 group-hover:opacity-100 flex-shrink-0">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                  {addedDevices.length > 3 && (
                    <button type="button" onClick={() => setTab('devices')}
                      className="text-[0.62rem] text-emerald-600 hover:text-emerald-800 font-medium px-1">
                      +{addedDevices.length - 3} more — view in Devices tab
                    </button>
                  )}
                </div>
              </div>
            )}
            {/* Recent Apps */}
            {recentApps.length > 0 && (
              <div>
                <p className="text-[0.58rem] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Apps</p>
                <div className="flex flex-col gap-1">
                  {recentApps.map(a => (
                    <div key={a.id} className="flex items-center gap-2.5 bg-white rounded-xl border border-emerald-100 px-3 py-2 shadow-sm group">
                      {categoryIcon(a.category)}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-slate-700 truncate">{a.name}</p>
                        <p className="text-[0.6rem] text-slate-400">{a.category} · {a.enforcement}</p>
                      </div>
                      <span className="text-[0.6rem] text-slate-400 flex-shrink-0">{timeAgo(a.addedAt)}</span>
                      <button type="button" onClick={() => handleRemoveApp(a.id)}
                        className="text-slate-300 hover:text-red-400 transition opacity-0 group-hover:opacity-100 flex-shrink-0">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                  {addedApps.length > 3 && (
                    <button type="button" onClick={() => setTab('applications')}
                      className="text-[0.62rem] text-emerald-600 hover:text-emerald-800 font-medium px-1">
                      +{addedApps.length - 3} more — view in Applications tab
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Tab bar ── */}
      <div className="flex gap-1 bg-slate-100 rounded-2xl p-1 w-fit">
        {TABS.map(t => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all ${
              tab === t.id ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}>
            {t.icon}{t.label}
            {t.id === 'reports' && <span className="rounded-full bg-orange-100 border border-orange-200 px-1.5 py-0.5 text-[0.55rem] font-bold text-orange-600">6mo</span>}
          </button>
        ))}
      </div>

      {/* ── Tab content ── */}
      {tab === 'devices'      && <DevicesTab      devices={allDevices} loading={loadingDevices} onSelectDevice={setPanelDevice} onViewLogs={setLogDevice} />}
      {tab === 'applications' && <ApplicationsTab apps={allApps} loading={loadingApps} onAddApp={() => setShowAddApp(true)} onRefresh={fetchAll} />}
      {tab === 'security'     && <SecurityTab     devices={allDevices} loading={loadingDevices} onSelectDevice={setPanelDevice} onViewLogs={setLogDevice} />}
      {tab === 'automation'   && <MacAutomationTab />}
      {tab === 'reports'      && <ReportsTab      devices={allDevices} apps={allApps} addedDevices={addedDevices} addedApps={addedApps} />}

      {/* ── Device log drawer ── */}
      {logDevice && (
        <DeviceLogDrawer device={logDevice} onClose={() => setLogDevice(null)} />
      )}

      {/* ── Device detail panel ── */}
      {panelDevice && (
        <>
          <div className="fixed inset-0 z-30 bg-black/30 backdrop-blur-[1px] cursor-pointer" onClick={() => setPanelDevice(null)} aria-hidden />
          <div className="fixed right-0 top-0 bottom-0 z-40 w-full max-w-[600px] shadow-2xl border-l border-slate-200 overflow-hidden flex flex-col">
            <DeviceDetailPanel device={panelDevice} onBack={() => setPanelDevice(null)} backLabel="Mac Devices" />
          </div>
        </>
      )}

      {/* ── Modals ── */}
      {showAddDevice && <AddDeviceModal onClose={() => setShowAddDevice(false)} onAdd={handleAddDevice} />}
      {showAddApp    && <AddAppModal    onClose={() => setShowAddApp(false)}    onAdd={handleAddApp}    />}

      {/* ── KPI Drill-down Modal ── */}
      {kpiModal && createPortal(
        <KpiDrillModal
          title={kpiModal.title}
          icon={kpiModal.icon}
          devices={kpiModal.devices}
          accent={kpiModal.accent}
          onClose={() => setKpiModal(null)}
          onSelectDevice={d => { setKpiModal(null); setPanelDevice(d) }}
        />,
        document.body
      )}

    </div>
  )
}
