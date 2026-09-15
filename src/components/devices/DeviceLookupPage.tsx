import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import {
  Search, X, ChevronUp, ChevronDown, ChevronsUpDown, Download,
  Laptop2, Monitor, Copy, RefreshCw, ExternalLink, Shield,
  ShieldAlert, AlertTriangle, CheckCircle2, Clock,
  Filter, ChevronLeft, ChevronRight, SlidersHorizontal, Lock, Unlock,
  Wifi, WifiOff, Bug, Zap, FileWarning, Activity, Eye,
  BarChart3, FileText,
} from 'lucide-react'
import { getRunbookForDevice } from '../../data/dashboardData'
import { api, apiDeviceToDeviceData } from '../../api'
import { useToast } from '../ui/ToastProvider'
import type { DeviceData, SecurityProfile, SecurityEvent } from '../../types'
import { useColumnResize } from '../../hooks/useColumnResize'

// ─── type helpers ────────────────────────────────────────────────────────────

type SortKey = 'deviceName' | 'user' | 'platform' | 'managementSource' | 'complianceState' | 'lastCheckIn' | 'riskScore'
type SortDir = 'asc' | 'desc' | null
type DrawerTab = 'overview' | 'security' | 'events'

function complianceOrder(s: string) {
  if (s === 'Non-Compliant') return 0
  if (s === 'Warning') return 1
  return 2
}

function riskColor(score: number) {
  if (score >= 80) return { bar: 'bg-red-500', text: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200', label: 'Critical' }
  if (score >= 60) return { bar: 'bg-orange-500', text: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-200', label: 'High' }
  if (score >= 35) return { bar: 'bg-amber-500', text: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200', label: 'Medium' }
  return { bar: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200', label: 'Low' }
}

const PLATFORM_ICONS: Record<string, typeof Laptop2> = { macOS: Monitor, Windows: Laptop2 }

function PlatformIcon({ platform, className = 'h-3.5 w-3.5' }: { platform: string; className?: string }) {
  const Icon = PLATFORM_ICONS[platform] ?? Laptop2
  return <Icon className={className} aria-hidden />
}

// ─── shared badge components ─────────────────────────────────────────────────

function ComplianceBadge({ state }: { state: string }) {
  const cfg =
    state === 'Compliant'
      ? { color: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle2 }
      : state === 'Warning'
      ? { color: 'bg-amber-50 text-amber-700 border-amber-200', icon: AlertTriangle }
      : { color: 'bg-red-50 text-red-700 border-red-200', icon: ShieldAlert }
  const Icon = cfg.icon
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.68rem] font-semibold ${cfg.color}`}>
      <Icon className="h-3 w-3" />{state}
    </span>
  )
}

function SeverityBadge({ severity }: { severity: string }) {
  const cfg = severity === 'High' ? 'bg-red-50 text-red-700 border-red-200'
    : severity === 'Medium' ? 'bg-amber-50 text-amber-700 border-amber-200'
    : 'bg-emerald-50 text-emerald-700 border-emerald-200'
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[0.68rem] font-semibold ${cfg}`}>{severity}</span>
}

function EncryptionBadge({ status }: { status: string }) {
  const isOff = !(/encrypt|on|luks|enabled/i.test(status) && !/off|pending|not /i.test(status))
  const Icon = isOff ? Unlock : Lock
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.68rem] font-medium ${
      isOff ? 'bg-red-50 text-red-700 border-red-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'
    }`}><Icon className="h-3 w-3" />{status}</span>
  )
}

function RiskScoreBadge({ score }: { score: number }) {
  const c = riskColor(score)
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[0.68rem] font-bold ${c.bg} ${c.border} ${c.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${c.bar}`} />
      {score} · {c.label}
    </span>
  )
}

// ─── Security Aggregate Bar ──────────────────────────────────────────────────

function SecurityAggregate({ devices }: { devices: DeviceData[] }) {
  const withSec = devices.filter(d => d.security)
  const avgRisk = withSec.length
    ? Math.round(withSec.reduce((s, d) => s + (d.security?.riskScore ?? 0), 0) / withSec.length)
    : 0
  const edrActive = withSec.filter(d => d.security?.edrStatus === 'Active').length
  const criticalVulns = withSec.reduce((s, d) => s + (d.security?.vulnerabilities.critical ?? 0), 0)
  const highVulns = withSec.reduce((s, d) => s + (d.security?.vulnerabilities.high ?? 0), 0)
  const totalPatches = withSec.reduce((s, d) => s + (d.security?.missingPatches ?? 0), 0)
  const unauthorizedTotal = withSec.reduce((s, d) => s + (d.security?.unauthorizedApps.length ?? 0), 0)
  const firewallOff = withSec.filter(d => !d.security?.firewallEnabled).length
  const avgC = riskColor(avgRisk)

  const tiles = [
    {
      label: 'Avg Risk Score',
      value: avgRisk.toString(),
      sub: avgC.label,
      icon: Shield,
      color: avgC.text,
      bg: avgC.bg,
      border: avgC.border,
      bar: avgC.bar,
      barPct: avgRisk,
    },
    {
      label: 'EDR Coverage',
      value: `${edrActive}/${withSec.length}`,
      sub: edrActive === withSec.length ? 'All active' : `${withSec.length - edrActive} inactive`,
      icon: Activity,
      color: edrActive === withSec.length ? 'text-emerald-700' : 'text-red-700',
      bg: edrActive === withSec.length ? 'bg-emerald-50' : 'bg-red-50',
      border: edrActive === withSec.length ? 'border-emerald-200' : 'border-red-200',
      bar: edrActive === withSec.length ? 'bg-emerald-500' : 'bg-red-500',
      barPct: Math.round((edrActive / Math.max(withSec.length, 1)) * 100),
    },
    {
      label: 'Critical Vulns',
      value: criticalVulns.toString(),
      sub: `${highVulns} high severity`,
      icon: Bug,
      color: criticalVulns > 0 ? 'text-red-700' : 'text-emerald-700',
      bg: criticalVulns > 0 ? 'bg-red-50' : 'bg-emerald-50',
      border: criticalVulns > 0 ? 'border-red-200' : 'border-emerald-200',
      bar: criticalVulns > 0 ? 'bg-red-500' : 'bg-emerald-500',
      barPct: Math.min(100, criticalVulns * 25),
    },
    {
      label: 'Missing Patches',
      value: totalPatches.toString(),
      sub: `across ${withSec.filter(d => (d.security?.missingPatches ?? 0) > 0).length} devices`,
      icon: FileWarning,
      color: totalPatches > 5 ? 'text-orange-700' : totalPatches > 0 ? 'text-amber-700' : 'text-emerald-700',
      bg: totalPatches > 5 ? 'bg-orange-50' : totalPatches > 0 ? 'bg-amber-50' : 'bg-emerald-50',
      border: totalPatches > 5 ? 'border-orange-200' : totalPatches > 0 ? 'border-amber-200' : 'border-emerald-200',
      bar: totalPatches > 5 ? 'bg-orange-500' : totalPatches > 0 ? 'bg-amber-500' : 'bg-emerald-500',
      barPct: Math.min(100, totalPatches * 6),
    },
    {
      label: 'Firewall Off',
      value: firewallOff.toString(),
      sub: firewallOff === 0 ? 'All protected' : `${firewallOff} device${firewallOff > 1 ? 's' : ''} exposed`,
      icon: Zap,
      color: firewallOff > 0 ? 'text-red-700' : 'text-emerald-700',
      bg: firewallOff > 0 ? 'bg-red-50' : 'bg-emerald-50',
      border: firewallOff > 0 ? 'border-red-200' : 'border-emerald-200',
      bar: firewallOff > 0 ? 'bg-red-500' : 'bg-emerald-500',
      barPct: Math.round((firewallOff / Math.max(withSec.length, 1)) * 100),
    },
    {
      label: 'Unauthorized Apps',
      value: unauthorizedTotal.toString(),
      sub: `on ${withSec.filter(d => (d.security?.unauthorizedApps.length ?? 0) > 0).length} device${withSec.filter(d => (d.security?.unauthorizedApps.length ?? 0) > 0).length !== 1 ? 's' : ''}`,
      icon: Eye,
      color: unauthorizedTotal > 0 ? 'text-orange-700' : 'text-emerald-700',
      bg: unauthorizedTotal > 0 ? 'bg-orange-50' : 'bg-emerald-50',
      border: unauthorizedTotal > 0 ? 'border-orange-200' : 'border-emerald-200',
      bar: unauthorizedTotal > 0 ? 'bg-orange-500' : 'bg-emerald-500',
      barPct: Math.min(100, unauthorizedTotal * 15),
    },
  ]

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-900/5 px-4 py-3">
      <div className="flex items-center gap-2 mb-3">
        <Shield className="h-4 w-4 text-orange-600" />
        <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wide">Security Posture Overview</h2>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {tiles.map(t => {
          const Icon = t.icon
          return (
            <div key={t.label} className={`rounded-xl border ${t.border} ${t.bg} px-3 py-2.5`}>
              <div className="flex items-center justify-between mb-1.5">
                <Icon className={`h-3.5 w-3.5 ${t.color}`} />
                <span className={`text-base font-bold leading-none ${t.color}`}>{t.value}</span>
              </div>
              <p className="text-[0.6rem] font-semibold text-slate-500 uppercase tracking-wide mb-1">{t.label}</p>
              <div className="h-1 w-full rounded-full bg-white/60">
                <div className={`h-1 rounded-full transition-all ${t.bar}`} style={{ width: `${t.barPct}%` }} />
              </div>
              <p className={`text-[0.6rem] mt-1 font-medium ${t.color}`}>{t.sub}</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Security Report Modal ───────────────────────────────────────────────────

function SecurityReportModal({ devices, open, onClose }: { devices: DeviceData[]; open: boolean; onClose: () => void }) {
  const { notify } = useToast()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])

  useEffect(() => { if (open) ref.current?.focus() }, [open])

  const handleExport = () => {
    const headers = ['Device', 'User', 'Platform', 'Source', 'Compliance', 'Risk Score', 'Risk Level', 'EDR Status', 'EDR Product', 'Firewall', 'VPN', 'Missing Patches', 'Critical Vulns', 'High Vulns', 'Medium Vulns', 'Low Vulns', 'Unauthorized Apps', 'Last Security Scan']
    const rows = devices.map(d => {
      const s = d.security
      return [
        d.deviceName, d.user, d.platform, d.managementSource, d.complianceState,
        s?.riskScore ?? 'N/A', s?.riskLevel ?? 'N/A', s?.edrStatus ?? 'N/A', s?.edrProduct ?? 'N/A',
        s ? (s.firewallEnabled ? 'Enabled' : 'Disabled') : 'N/A',
        s ? (s.vpnCompliant ? 'Compliant' : 'Non-Compliant') : 'N/A',
        s?.missingPatches ?? 'N/A',
        s?.vulnerabilities.critical ?? 0, s?.vulnerabilities.high ?? 0,
        s?.vulnerabilities.medium ?? 0, s?.vulnerabilities.low ?? 0,
        s?.unauthorizedApps.join('; ') ?? '',
        s?.lastSecurityScan ?? 'N/A',
      ]
    })
    const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'security-report.csv'
    a.click()
    URL.revokeObjectURL(url)
    notify('success', 'Exported', 'Security report downloaded as CSV')
  }

  const sorted = [...devices].sort((a, b) => (b.security?.riskScore ?? 0) - (a.security?.riskScore ?? 0))

  const vulnTotals = devices.reduce((acc, d) => {
    acc.critical += d.security?.vulnerabilities.critical ?? 0
    acc.high += d.security?.vulnerabilities.high ?? 0
    acc.medium += d.security?.vulnerabilities.medium ?? 0
    acc.low += d.security?.vulnerabilities.low ?? 0
    return acc
  }, { critical: 0, high: 0, medium: 0, low: 0 })

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px] cursor-pointer" onClick={onClose} aria-hidden />
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal
        aria-label="Security Report"
        className="relative z-10 w-full max-w-4xl max-h-[90vh] flex flex-col bg-white rounded-2xl shadow-2xl shadow-slate-950/25 outline-none overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-[#141408] to-[#1e1e06]">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-white/10 p-2.5">
              <BarChart3 className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Security Endpoint Report</h2>
              <p className="text-[0.68rem] text-slate-300">Generated {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} · {devices.length} devices</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExport}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 border border-white/20 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-white/50"
            >
              <Download className="h-3.5 w-3.5" />
              Export CSV
            </button>
            <button type="button" onClick={onClose} className="rounded-full p-1.5 text-slate-300 hover:bg-white/10 hover:text-white transition">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Vulnerability summary */}
          <div>
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-3">Vulnerability Summary</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Critical', count: vulnTotals.critical, color: 'bg-red-500', bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700' },
                { label: 'High', count: vulnTotals.high, color: 'bg-orange-500', bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700' },
                { label: 'Medium', count: vulnTotals.medium, color: 'bg-amber-500', bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700' },
                { label: 'Low', count: vulnTotals.low, color: 'bg-slate-400', bg: 'bg-slate-50', border: 'border-slate-200', text: 'text-slate-600' },
              ].map(v => (
                <div key={v.label} className={`rounded-xl border ${v.border} ${v.bg} px-4 py-3 flex items-center justify-between`}>
                  <div>
                    <p className={`text-xl font-bold ${v.text}`}>{v.count}</p>
                    <p className="text-[0.65rem] text-slate-500 font-medium">{v.label}</p>
                  </div>
                  <span className={`h-2.5 w-2.5 rounded-full ${v.color}`} />
                </div>
              ))}
            </div>
          </div>

          {/* Per-device risk table */}
          <div>
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-3">Device Risk Profile</h3>
            <div className="rounded-xl border border-slate-200 overflow-hidden">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    {['Device', 'Risk Score', 'EDR', 'Firewall', 'VPN', 'Patches', 'Vulns (C/H/M/L)', 'Unauth. Apps'].map(h => (
                      <th key={h} className="px-3 py-2 text-[0.65rem] font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sorted.map(d => {
                    const s = d.security
                    const rc = riskColor(s?.riskScore ?? 0)
                    return (
                      <tr key={d.deviceName} className="hover:bg-slate-50 transition">
                        <td className="px-3 py-2.5">
                          <div>
                            <p className="text-xs font-semibold text-slate-800">{d.deviceName}</p>
                            <p className="text-[0.6rem] text-slate-400 truncate max-w-[130px]">{d.user}</p>
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2 min-w-[90px]">
                            <div className="flex-1 h-1.5 rounded-full bg-slate-100">
                              <div className={`h-1.5 rounded-full ${rc.bar}`} style={{ width: `${s?.riskScore ?? 0}%` }} />
                            </div>
                            <span className={`text-xs font-bold w-6 text-right ${rc.text}`}>{s?.riskScore ?? '—'}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={`inline-flex items-center gap-1 text-[0.65rem] font-semibold ${s?.edrStatus === 'Active' ? 'text-emerald-700' : 'text-red-600'}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${s?.edrStatus === 'Active' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                            {s?.edrStatus ?? '—'}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          {s ? (
                            s.firewallEnabled
                              ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                              : <X className="h-3.5 w-3.5 text-red-500" />
                          ) : '—'}
                        </td>
                        <td className="px-3 py-2.5">
                          {s ? (
                            s.vpnCompliant
                              ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                              : <X className="h-3.5 w-3.5 text-red-500" />
                          ) : '—'}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={`text-xs font-bold ${(s?.missingPatches ?? 0) > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                            {s?.missingPatches ?? 0}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="text-[0.68rem] text-slate-600 font-mono">
                            {s ? `${s.vulnerabilities.critical}/${s.vulnerabilities.high}/${s.vulnerabilities.medium}/${s.vulnerabilities.low}` : '—'}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={`text-xs font-bold ${(s?.unauthorizedApps.length ?? 0) > 0 ? 'text-orange-600' : 'text-slate-400'}`}>
                            {s?.unauthorizedApps.length ?? 0}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Unauthorized apps */}
          {devices.some(d => (d.security?.unauthorizedApps.length ?? 0) > 0) && (
            <div>
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-3">Unauthorized Applications Detected</h3>
              <div className="space-y-2">
                {devices.filter(d => (d.security?.unauthorizedApps.length ?? 0) > 0).map(d => (
                  <div key={d.deviceName} className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-3">
                    <p className="text-xs font-semibold text-slate-800 mb-1.5">{d.deviceName} <span className="font-normal text-slate-500">— {d.user}</span></p>
                    <div className="flex flex-wrap gap-1.5">
                      {d.security!.unauthorizedApps.map(app => (
                        <span key={app} className="rounded-full border border-orange-300 bg-white px-2 py-0.5 text-[0.68rem] font-medium text-orange-700">{app}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Drawer tabs ─────────────────────────────────────────────────────────────

function RiskGauge({ score }: { score: number }) {
  const c = riskColor(score)
  const pct = score / 100
  const R = 52, cx = 64, cy = 64
  const circ = 2 * Math.PI * R
  const arc = circ * 0.75
  const filled = arc * pct
  const gap = arc - filled
  return (
    <div className="flex flex-col items-center">
      <div className="relative w-32 h-20">
        <svg viewBox="0 0 128 80" className="w-full h-full">
          <path
            d={`M ${cx - R} ${cy} A ${R} ${R} 0 1 1 ${cx + R * Math.cos(Math.PI * 0.25)} ${cy + R * Math.sin(Math.PI * 0.25)}`}
            fill="none" stroke="#e2e8f0" strokeWidth="10" strokeLinecap="round"
          />
          <path
            d={`M ${cx - R} ${cy} A ${R} ${R} 0 1 1 ${cx + R * Math.cos(Math.PI * 0.25)} ${cy + R * Math.sin(Math.PI * 0.25)}`}
            fill="none"
            stroke={score >= 80 ? '#ef4444' : score >= 60 ? '#f97316' : score >= 35 ? '#f59e0b' : '#22c55e'}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={`${filled} ${gap + circ * 0.25}`}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-end pb-1">
          <span className={`text-xl font-black ${c.text}`}>{score}</span>
          <span className="text-[0.6rem] text-slate-400 font-semibold uppercase tracking-wide">/100</span>
        </div>
      </div>
      <span className={`rounded-full border px-3 py-0.5 text-[0.68rem] font-bold ${c.bg} ${c.border} ${c.text}`}>{c.label} Risk</span>
    </div>
  )
}

function VulnBar({ label, count, max, color }: { label: string; count: number; max: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-14 text-[0.65rem] text-slate-500 text-right flex-shrink-0">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-slate-100">
        <div className={`h-2 rounded-full ${color} transition-all`} style={{ width: max > 0 ? `${(count / max) * 100}%` : '0%' }} />
      </div>
      <span className="w-5 text-[0.68rem] font-bold text-slate-700 text-right">{count}</span>
    </div>
  )
}

function EventIcon({ type }: { type: SecurityEvent['type'] }) {
  const cfg = {
    Critical: { icon: ShieldAlert, color: 'text-red-600', bg: 'bg-red-100' },
    Alert: { icon: AlertTriangle, color: 'text-orange-600', bg: 'bg-orange-100' },
    Warning: { icon: FileWarning, color: 'text-amber-600', bg: 'bg-amber-100' },
    Info: { icon: CheckCircle2, color: 'text-orange-600', bg: 'bg-orange-100' },
  }[type]
  const Icon = cfg.icon
  return (
    <div className={`rounded-full p-1.5 flex-shrink-0 ${cfg.bg}`}>
      <Icon className={`h-3 w-3 ${cfg.color}`} />
    </div>
  )
}

function deriveAssignedPolicies(device: DeviceData): string[] {
  const base = ['Endpoint Compliance Baseline', 'Security Configuration Policy']
  if (device.platform === 'macOS') base.push('FileVault Encryption Policy', 'ManageEngine Configuration Profile: Corporate Mac')
  else if (device.platform === 'Windows') base.push('BitLocker Encryption Policy', 'Windows Update Ring – Production')
  if (device.managementSource === 'Microsoft Intune') base.push('Intune Compliance Policy v2', 'Conditional Access – MFA Required')
  if (device.managementSource === 'ManageEngine' && device.platform === 'macOS') base.push('ManageEngine Auto-Assign Profile')
  if (device.complianceState !== 'Compliant') base.push('Remediation Enforcement Policy')
  return base
}

function deriveRecentFailures(device: DeviceData): { event: string; time: string; severity: string }[] {
  if (device.complianceState === 'Compliant') return []
  const failures: { event: string; time: string; severity: string }[] = []
  if (device.policyFailed && device.policyFailed !== '—') {
    failures.push({ event: `Policy check failed: ${device.policyFailed}`, time: device.lastDetected || 'Recently', severity: device.severity })
  }
  if (device.primaryIssue && device.primaryIssue !== '—') {
    failures.push({ event: `Compliance issue detected: ${device.primaryIssue}`, time: device.firstDetected || 'Detected earlier', severity: device.severity })
  }
  const encryptionOk = !!device.encryptionStatus && /encrypt|on|luks|enabled/i.test(device.encryptionStatus) && !/off|pending|not /i.test(device.encryptionStatus)
  if (!encryptionOk) {
    failures.push({ event: 'Encryption not enabled — disk is unprotected', time: 'Ongoing', severity: 'High' })
  }
  return failures
}

function OverviewTab({ device, onCopy }: { device: DeviceData; onCopy: (v: string, l: string) => void }) {
  const runbook = getRunbookForDevice(device)
  const assignedPolicies = deriveAssignedPolicies(device)
  const recentFailures = deriveRecentFailures(device)

  return (
    <div className="space-y-5">
      <Section title="Device Identity" icon={Laptop2}>
        <InfoGrid rows={[
          { label: 'Device Name', value: device.deviceName, copy: true },
          { label: 'Serial Number', value: device.serialNumber, copy: true },
          { label: 'Platform', value: device.platform },
          { label: 'OS Version', value: device.osVersion },
          { label: 'User / Owner', value: device.user, copy: true },
          { label: 'Management', value: device.managementSource },
          { label: 'Last Check-in', value: device.lastCheckIn },
        ]} onCopy={onCopy} />
      </Section>

      <Section title="Compliance Details" icon={Shield}>
        <div className="flex flex-wrap gap-2 mb-3">
          <ComplianceBadge state={device.complianceState} />
          <EncryptionBadge status={device.encryptionStatus} />
          <SeverityBadge severity={device.severity} />
        </div>
        <InfoGrid rows={[
          { label: 'Primary Issue', value: device.primaryIssue },
          { label: 'Policy Failed', value: device.policyFailed },
          { label: 'Confidence', value: device.confidence },
          { label: 'Issue Source', value: device.issueSource },
        ]} onCopy={onCopy} />
      </Section>

      {/* Assigned Policies */}
      <Section title="Assigned Policies" icon={FileText}>
        <div className="space-y-1.5">
          {assignedPolicies.map(policy => (
            <div key={policy} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <CheckCircle2 className="h-3 w-3 text-emerald-500 flex-shrink-0" />
              <span className="text-[0.72rem] text-slate-700">{policy}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* Recent Failures */}
      {recentFailures.length > 0 && (
        <Section title="Recent Failures" icon={AlertTriangle}>
          <div className="space-y-2">
            {recentFailures.map((f, i) => (
              <div key={i} className={`flex items-start gap-2.5 rounded-xl border px-3 py-2.5 ${
                f.severity === 'High' || f.severity === 'Critical' ? 'border-red-200 bg-red-50'
                : f.severity === 'Medium' ? 'border-amber-200 bg-amber-50'
                : 'border-slate-200 bg-slate-50'
              }`}>
                <AlertTriangle className={`h-3.5 w-3.5 flex-shrink-0 mt-0.5 ${
                  f.severity === 'High' || f.severity === 'Critical' ? 'text-red-500' : 'text-amber-500'
                }`} />
                <div className="min-w-0 flex-1">
                  <p className="text-[0.72rem] font-medium text-slate-800 leading-snug">{f.event}</p>
                  <p className="text-[0.62rem] text-slate-400 mt-0.5">{f.time}</p>
                </div>
                <span className={`flex-shrink-0 rounded-full border px-1.5 py-0.5 text-[0.6rem] font-bold ${
                  f.severity === 'High' || f.severity === 'Critical' ? 'bg-red-100 text-red-700 border-red-200'
                  : 'bg-amber-100 text-amber-700 border-amber-200'
                }`}>{f.severity}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {runbook.runbookName !== 'No Action Required' ? (
        <Section title="Recommended Next Action" icon={CheckCircle2}>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 mb-3">
            <p className="text-xs font-semibold text-slate-800">{runbook.runbookName}</p>
            <div className="mt-0.5 flex gap-3 text-[0.65rem] text-slate-500">
              <span>Automation: <span className="font-medium text-slate-700">{runbook.automation}</span></span>
              <span>Escalation: <span className="font-medium text-slate-700">{runbook.escalation}</span></span>
            </div>
          </div>
          <ol className="space-y-1.5 pl-1">
            {runbook.steps.map((step, i) => (
              <li key={i} className="flex items-start gap-2.5 text-[0.72rem] text-slate-700">
                <span className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-orange-100 text-[0.6rem] font-bold text-orange-700">{i + 1}</span>
                {step}
              </li>
            ))}
          </ol>
        </Section>
      ) : (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 flex items-center gap-2.5">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0" />
          <p className="text-xs font-medium text-emerald-700">Device is fully compliant — no action required.</p>
        </div>
      )}
    </div>
  )
}

function SecurityTab({ security }: { security: SecurityProfile }) {
  const rc = riskColor(security.riskScore)
  const maxVuln = Math.max(security.vulnerabilities.critical, security.vulnerabilities.high, security.vulnerabilities.medium, security.vulnerabilities.low, 1)

  return (
    <div className="space-y-5">
      {/* Risk score gauge */}
      <div className={`rounded-2xl border ${rc.border} ${rc.bg} px-4 py-4 flex flex-col sm:flex-row items-center gap-4`}>
        <RiskGauge score={security.riskScore} />
        <div className="flex-1 grid grid-cols-2 gap-2 w-full">
          {[
            { label: 'EDR Status', value: security.edrStatus, good: security.edrStatus === 'Active' },
            { label: 'Firewall', value: security.firewallEnabled ? 'Enabled' : 'Disabled', good: security.firewallEnabled },
            { label: 'VPN', value: security.vpnCompliant ? 'Compliant' : 'Non-Compliant', good: security.vpnCompliant },
            { label: 'Patches Missing', value: security.missingPatches.toString(), good: security.missingPatches === 0 },
          ].map(item => (
            <div key={item.label} className="rounded-xl bg-white/60 border border-white/80 px-3 py-2">
              <p className="text-[0.6rem] text-slate-500 font-semibold uppercase tracking-wide">{item.label}</p>
              <p className={`text-xs font-bold mt-0.5 ${item.good ? 'text-emerald-700' : 'text-red-700'}`}>{item.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* EDR info */}
      <Section title="Endpoint Detection & Response" icon={Activity}>
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-slate-800">{security.edrProduct}</p>
            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.65rem] font-semibold ${
              security.edrStatus === 'Active' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'
            }`}>
              <span className={`h-1.5 w-1.5 rounded-full ${security.edrStatus === 'Active' ? 'bg-emerald-500' : 'bg-red-500'}`} />
              {security.edrStatus}
            </span>
          </div>
          <p className="text-[0.68rem] text-slate-500">Last security scan: <span className="font-medium text-slate-700">{security.lastSecurityScan}</span></p>
        </div>
      </Section>

      {/* Vulnerabilities */}
      <Section title="Vulnerability Breakdown" icon={Bug}>
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 space-y-2.5">
          <VulnBar label="Critical" count={security.vulnerabilities.critical} max={maxVuln} color="bg-red-500" />
          <VulnBar label="High" count={security.vulnerabilities.high} max={maxVuln} color="bg-orange-500" />
          <VulnBar label="Medium" count={security.vulnerabilities.medium} max={maxVuln} color="bg-amber-500" />
          <VulnBar label="Low" count={security.vulnerabilities.low} max={maxVuln} color="bg-slate-400" />
        </div>
        <p className="text-[0.65rem] text-slate-500 mt-1.5 text-right">
          Total: {security.vulnerabilities.critical + security.vulnerabilities.high + security.vulnerabilities.medium + security.vulnerabilities.low} findings
        </p>
      </Section>

      {/* Unauthorized apps */}
      <Section title="Unauthorized Applications" icon={Eye}>
        {security.unauthorizedApps.length === 0 ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0" />
            <p className="text-xs font-medium text-emerald-700">No unauthorized applications detected</p>
          </div>
        ) : (
          <div className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-3">
            <p className="text-[0.65rem] text-orange-700 font-semibold mb-2">{security.unauthorizedApps.length} app{security.unauthorizedApps.length > 1 ? 's' : ''} flagged for review</p>
            <div className="flex flex-wrap gap-1.5">
              {security.unauthorizedApps.map(app => (
                <span key={app} className="rounded-full border border-orange-300 bg-white px-2 py-0.5 text-[0.68rem] font-medium text-orange-700">{app}</span>
              ))}
            </div>
          </div>
        )}
      </Section>

      {/* Network */}
      <Section title="Network & Access" icon={Wifi}>
        <div className="grid grid-cols-2 gap-2">
          <div className={`rounded-xl border px-3 py-2 flex items-center gap-2 ${security.firewallEnabled ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}`}>
            {security.firewallEnabled ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 flex-shrink-0" /> : <X className="h-3.5 w-3.5 text-red-600 flex-shrink-0" />}
            <div>
              <p className="text-[0.6rem] text-slate-500">Firewall</p>
              <p className={`text-xs font-semibold ${security.firewallEnabled ? 'text-emerald-700' : 'text-red-700'}`}>{security.firewallEnabled ? 'Enabled' : 'Disabled'}</p>
            </div>
          </div>
          <div className={`rounded-xl border px-3 py-2 flex items-center gap-2 ${security.vpnCompliant ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}`}>
            {security.vpnCompliant ? <Wifi className="h-3.5 w-3.5 text-emerald-600 flex-shrink-0" /> : <WifiOff className="h-3.5 w-3.5 text-red-600 flex-shrink-0" />}
            <div>
              <p className="text-[0.6rem] text-slate-500">VPN Status</p>
              <p className={`text-xs font-semibold ${security.vpnCompliant ? 'text-emerald-700' : 'text-red-700'}`}>{security.vpnCompliant ? 'Compliant' : 'Non-Compliant'}</p>
            </div>
          </div>
        </div>
      </Section>
    </div>
  )
}

function EventsTab({ events }: { events: SecurityEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="rounded-full bg-slate-100 p-3 mb-2">
          <CheckCircle2 className="h-5 w-5 text-slate-400" />
        </div>
        <p className="text-sm font-medium text-slate-600">No security events recorded</p>
      </div>
    )
  }
  return (
    <div className="space-y-2">
      {events.map((ev, i) => (
        <div key={i} className={`flex items-start gap-3 rounded-xl border px-3 py-3 ${
          ev.type === 'Critical' ? 'border-red-200 bg-red-50'
          : ev.type === 'Alert' ? 'border-orange-200 bg-orange-50'
          : ev.type === 'Warning' ? 'border-amber-200 bg-amber-50'
          : 'border-slate-200 bg-slate-50'
        }`}>
          <EventIcon type={ev.type} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-0.5">
              <span className={`text-[0.62rem] font-bold uppercase tracking-wide ${
                ev.type === 'Critical' ? 'text-red-700'
                : ev.type === 'Alert' ? 'text-orange-700'
                : ev.type === 'Warning' ? 'text-amber-700'
                : 'text-orange-700'
              }`}>{ev.type}</span>
              <span className="text-[0.62rem] text-slate-400">{ev.time}</span>
            </div>
            <p className="text-[0.72rem] text-slate-700 leading-snug">{ev.description}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Detail Drawer ────────────────────────────────────────────────────────────

function DetailDrawer({
  device, onClose, onSyncNow, onViewDashboard,
}: {
  device: DeviceData | null
  onClose: () => void
  onSyncNow: (device: DeviceData) => void
  onViewDashboard: (deviceName: string) => void
}) {
  const { notify } = useToast()
  const [activeTab, setActiveTab] = useState<DrawerTab>('overview')
  const [syncLoading, setSyncLoading] = useState(false)
  const drawerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])

  useEffect(() => { if (device) { drawerRef.current?.focus(); setActiveTab('overview') } }, [device])

  const handleSync = async () => {
    if (!device) return
    setSyncLoading(true)
    await new Promise(r => setTimeout(r, 1200))
    setSyncLoading(false)
    onSyncNow(device)
  }

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => notify('success', 'Copied', `${label} copied to clipboard`))
      .catch(() => notify('error', 'Error', 'Failed to copy'))
  }

  const tabs: { id: DrawerTab; label: string; badge?: number }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'security', label: 'Security Profile' },
    { id: 'events', label: 'Events', badge: device?.security?.recentEvents.filter(e => e.type === 'Critical' || e.type === 'Alert').length },
  ]

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-[2px] cursor-pointer transition-opacity duration-200 ${device ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={drawerRef}
        tabIndex={-1}
        role="dialog"
        aria-modal
        aria-label={device ? `Device details: ${device.deviceName}` : 'Device details'}
        className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-[540px] flex-col bg-white shadow-2xl shadow-slate-950/20 transition-transform duration-300 ease-out outline-none ${device ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {device && (
          <>
            {/* Header */}
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 bg-gradient-to-r from-[#141408] to-[#1e1e06] px-5 py-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="rounded-xl bg-white/10 p-2.5 flex-shrink-0">
                  <PlatformIcon platform={device.platform} className="h-5 w-5 text-white" />
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-white text-sm leading-tight truncate">{device.deviceName}</p>
                  <p className="text-[0.68rem] text-slate-300 truncate mt-0.5">{device.user}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {device.security && <RiskScoreBadge score={device.security.riskScore} />}
                <button type="button" onClick={onClose} aria-label="Close panel" className="rounded-full p-1.5 text-slate-300 hover:bg-white/10 hover:text-white transition">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-slate-100 bg-slate-50 px-4">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`relative flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold transition focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-orange-300 ${
                    activeTab === tab.id
                      ? 'text-orange-700 border-b-2 border-orange-600 -mb-px bg-white'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {tab.label}
                  {(tab.badge ?? 0) > 0 && (
                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[0.55rem] font-bold text-white">
                      {tab.badge}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {activeTab === 'overview' && <OverviewTab device={device} onCopy={copyToClipboard} />}
              {activeTab === 'security' && device.security && <SecurityTab security={device.security} />}
              {activeTab === 'security' && !device.security && (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <Shield className="h-8 w-8 text-slate-300 mb-2" />
                  <p className="text-sm text-slate-500">No security profile available</p>
                </div>
              )}
              {activeTab === 'events' && <EventsTab events={device.security?.recentEvents ?? []} />}
            </div>

            {/* Footer */}
            <div className="border-t border-slate-100 bg-slate-50 px-5 py-3 flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={handleSync}
                disabled={syncLoading}
                className="inline-flex items-center gap-1.5 rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-orange-700 disabled:opacity-60 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-orange-300"
              >
                {syncLoading ? (
                  <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-30" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : <RefreshCw className="h-3 w-3" />}
                {syncLoading ? 'Syncing…' : 'Sync Now'}
              </button>
              <button
                type="button"
                onClick={() => { onViewDashboard(device.deviceName); onClose() }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-orange-300"
              >
                <ExternalLink className="h-3 w-3" />
                View in Dashboard
              </button>
              <button
                type="button"
                onClick={() => copyToClipboard(device.serialNumber, 'Serial number')}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-orange-300"
              >
                <Copy className="h-3 w-3" />
                Copy Serial
              </button>
              <button type="button" onClick={onClose} className="ml-auto text-xs text-slate-400 hover:text-slate-600 focus-visible:ring-2 focus-visible:ring-orange-300 rounded">
                Close
              </button>
            </div>
          </>
        )}
      </div>
    </>
  )
}

// ─── shared sub-components ────────────────────────────────────────────────────

function Section({ title, icon: Icon, children }: { title: string; icon: typeof Shield; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2.5">
        <Icon className="h-3.5 w-3.5 text-orange-600 flex-shrink-0" />
        <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wide">{title}</h3>
      </div>
      {children}
    </div>
  )
}

function InfoGrid({ rows, onCopy }: {
  rows: { label: string; value: string; copy?: boolean }[]
  onCopy: (text: string, label: string) => void
}) {
  return (
    <dl className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-slate-50 px-3">
      {rows.map(row => (
        <div key={row.label} className="group flex items-center justify-between gap-3 py-2">
          <dt className="text-[0.68rem] text-slate-500 flex-shrink-0 w-[44%]">{row.label}</dt>
          <dd className="flex items-center gap-1 min-w-0 justify-end">
            <span className="text-[0.72rem] font-medium text-slate-800 text-right break-all">{row.value}</span>
            {row.copy && (
              <button type="button" onClick={() => onCopy(row.value, row.label)} aria-label={`Copy ${row.label}`}
                className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 rounded p-0.5 text-slate-400 hover:text-orange-600 hover:bg-orange-50 transition flex-shrink-0"
              >
                <Copy className="h-2.5 w-2.5" />
              </button>
            )}
          </dd>
        </div>
      ))}
    </dl>
  )
}

// ─── Column definitions ───────────────────────────────────────────────────────

const LOOKUP_COLS = [
  { key: 'deviceName',       label: 'Device',        min: 120, default: 190 },
  { key: 'user',             label: 'User',          min:  80, default: 150 },
  { key: 'platform',         label: 'Platform',      min:  70, default:  90 },
  { key: 'managementSource', label: 'Source',        min:  80, default: 130 },
  { key: 'complianceState',  label: 'Compliance',    min:  90, default: 120 },
  { key: 'encryption',       label: 'Encryption',    min:  80, default: 110 },
  { key: 'riskScore',        label: 'Risk Score',    min:  70, default:  90 },
  { key: 'edr',              label: 'EDR',           min:  70, default:  90 },
  { key: 'lastCheckIn',      label: 'Last Check-in', min: 100, default: 140 },
  { key: 'actions',          label: '',              min:  60, default:  80, noResize: true },
] as const
type LColKey = typeof LOOKUP_COLS[number]['key']

// ─── Sort header ──────────────────────────────────────────────────────────────

function SortTh({ label, sortKey, currentKey, currentDir, onSort, width, onStartResize }: {
  label: string
  sortKey: SortKey
  currentKey: SortKey | null
  currentDir: SortDir
  onSort: (key: SortKey) => void
  width?: number
  onStartResize?: (e: React.MouseEvent) => void
}) {
  const active = currentKey === sortKey
  const Icon = active ? (currentDir === 'asc' ? ChevronUp : ChevronDown) : ChevronsUpDown
  return (
    <th
      scope="col"
      className="relative whitespace-nowrap px-3 py-2.5 text-left text-[0.68rem] font-semibold uppercase tracking-wide text-slate-500 cursor-pointer select-none hover:text-slate-700 transition group overflow-hidden"
      style={width ? { width } : undefined}
      onClick={() => onSort(sortKey)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <Icon className={`h-3 w-3 transition ${active ? 'text-orange-600' : 'text-slate-300 group-hover:text-slate-400'}`} />
      </span>
      {onStartResize && (
        <span
          className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-orange-400/50 active:bg-orange-500 transition-colors"
          onMouseDown={onStartResize}
          onClick={e => e.stopPropagation()}
        />
      )}
    </th>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 10

export function DeviceLookupPage({
  onViewInDashboard,
  initialDeviceName,
}: {
  onViewInDashboard?: (deviceName: string) => void
  initialDeviceName?: string
}) {
  const { notify } = useToast()
  const { widths: lw, startResize: lResize, totalWidth: lTotal } = useColumnResize<LColKey>(LOOKUP_COLS, 'device-lookup')
  const [allDevices, setAllDevices] = useState<DeviceData[]>([])
  const [devicesLoading, setDevicesLoading] = useState(true)

  useEffect(() => {
    setDevicesLoading(true)
    api.fetchAllDevicesRaw({ limit: 2000 })
      .then(({ devices }) => setAllDevices(devices.map(apiDeviceToDeviceData)))
      .catch(() => {})
      .finally(() => setDevicesLoading(false))
  }, [])

  const [query, setQuery] = useState(initialDeviceName ?? '')
  const [complianceFilter, setComplianceFilter] = useState('All')
  const [platformFilter, setPlatformFilter] = useState('All')
  const [sourceFilter, setSourceFilter] = useState('All')
  const [riskFilter, setRiskFilter] = useState('All')
  const [sortKey, setSortKey] = useState<SortKey | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>(null)
  const [page, setPage] = useState(1)
  const [selectedDevice, setSelectedDevice] = useState<DeviceData | null>(null)

  // Auto-open detail drawer when arriving from activity feed
  useEffect(() => {
    if (!initialDeviceName || allDevices.length === 0) return
    const match = allDevices.find(d =>
      d.deviceName.toLowerCase() === initialDeviceName.toLowerCase()
    )
    if (match) setSelectedDevice(match)
  }, [initialDeviceName, allDevices])
  const [syncingIds, setSyncingIds] = useState<Set<string>>(new Set())
  const [reportOpen, setReportOpen] = useState(false)

  const platforms = useMemo(() => ['All', ...Array.from(new Set(allDevices.map(d => d.platform)))], [allDevices])
  const sources = useMemo(() => ['All', ...Array.from(new Set(allDevices.map(d => d.managementSource)))], [allDevices])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return allDevices.filter(d => {
      if (complianceFilter !== 'All' && d.complianceState !== complianceFilter) return false
      if (platformFilter !== 'All' && d.platform !== platformFilter) return false
      if (sourceFilter !== 'All' && d.managementSource !== sourceFilter) return false
      if (riskFilter !== 'All' && d.security?.riskLevel !== riskFilter) return false
      if (q) return d.deviceName.toLowerCase().includes(q) || d.user.toLowerCase().includes(q) || d.serialNumber.toLowerCase().includes(q) || d.osVersion.toLowerCase().includes(q)
      return true
    })
  }, [allDevices, query, complianceFilter, platformFilter, sourceFilter, riskFilter])

  const sorted = useMemo(() => {
    if (!sortKey || !sortDir) return filtered
    return [...filtered].sort((a, b) => {
      if (sortKey === 'complianceState') {
        const diff = complianceOrder(a.complianceState) - complianceOrder(b.complianceState)
        return sortDir === 'asc' ? diff : -diff
      }
      if (sortKey === 'riskScore') {
        const diff = (a.security?.riskScore ?? 0) - (b.security?.riskScore ?? 0)
        return sortDir === 'asc' ? diff : -diff
      }
      const av = (a[sortKey] as string).toLowerCase()
      const bv = (b[sortKey] as string).toLowerCase()
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })
  }, [filtered, sortKey, sortDir])

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const paginated = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const handleSort = useCallback((key: SortKey) => {
    setSortKey(prev => {
      if (prev !== key) { setSortDir('asc'); return key }
      setSortDir(d => d === 'asc' ? 'desc' : d === 'desc' ? null : 'asc')
      return key
    })
    setPage(1)
  }, [])

  const clearFilters = () => { setQuery(''); setComplianceFilter('All'); setPlatformFilter('All'); setSourceFilter('All'); setRiskFilter('All'); setPage(1) }
  const hasFilters = !!(query || complianceFilter !== 'All' || platformFilter !== 'All' || sourceFilter !== 'All' || riskFilter !== 'All')

  const handleSyncNow = useCallback(async (device: DeviceData) => {
    setSyncingIds(prev => new Set(prev).add(device.deviceName))
    await new Promise(r => setTimeout(r, 1200))
    setSyncingIds(prev => { const next = new Set(prev); next.delete(device.deviceName); return next })
    notify('success', 'Sync Complete', `${device.deviceName} has been synchronized`)
  }, [notify])

  const handleExportCSV = () => {
    const headers = ['Device Name', 'User', 'Serial', 'Platform', 'OS', 'Source', 'Compliance', 'Encryption', 'Risk Score', 'Risk Level', 'EDR', 'Firewall', 'Missing Patches', 'Last Check-in']
    const rows = sorted.map(d => [
      d.deviceName, d.user, d.serialNumber, d.platform, d.osVersion, d.managementSource,
      d.complianceState, d.encryptionStatus,
      d.security?.riskScore ?? '', d.security?.riskLevel ?? '', d.security?.edrStatus ?? '',
      d.security ? (d.security.firewallEnabled ? 'Enabled' : 'Disabled') : '',
      d.security?.missingPatches ?? '', d.lastCheckIn,
    ])
    const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'devices.csv'; a.click()
    URL.revokeObjectURL(url)
    notify('success', 'Export', `${sorted.length} devices exported to CSV`)
  }

  return (
    <>
      <div className="space-y-4 w-full">

        {/* Page header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Device Lookup</h1>
            <p className="mt-0.5 text-sm text-slate-500">
              {devicesLoading ? 'Loading devices…' : `${allDevices.length} devices across ${sources.length - 1} management source${sources.length - 1 !== 1 ? 's' : ''}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setReportOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-orange-300"
            >
              <FileText className="h-3.5 w-3.5" />
              Security Report
            </button>
            <button
              type="button"
              onClick={handleExportCSV}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-orange-300"
            >
              <Download className="h-3.5 w-3.5" />
              Export CSV
            </button>
          </div>
        </div>

        {/* Security Aggregate */}
        <SecurityAggregate devices={allDevices} />

        {/* Toolbar */}
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm shadow-slate-900/5">
          <div className="flex flex-wrap gap-2.5 items-center">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search by device name, user, serial…"
                value={query}
                onChange={e => { setQuery(e.target.value); setPage(1) }}
                className="h-8 w-full rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-8 text-xs text-slate-800 placeholder:text-slate-400 transition focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-400/20"
              />
              {query && (
                <button type="button" onClick={() => { setQuery(''); setPage(1) }} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:text-slate-600 transition">
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            {/* Platform */}
            <div className="relative">
              <SlidersHorizontal className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400" />
              <select value={platformFilter} onChange={e => { setPlatformFilter(e.target.value); setPage(1) }}
                className="h-8 appearance-none rounded-lg border border-slate-200 bg-slate-50 pl-7 pr-6 text-xs text-slate-700 transition focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-400/20 cursor-pointer">
                {platforms.map(p => <option key={p} value={p}>{p === 'All' ? 'All Platforms' : p}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400" />
            </div>

            {/* Source */}
            <div className="relative">
              <Filter className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400" />
              <select value={sourceFilter} onChange={e => { setSourceFilter(e.target.value); setPage(1) }}
                className="h-8 appearance-none rounded-lg border border-slate-200 bg-slate-50 pl-7 pr-6 text-xs text-slate-700 transition focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-400/20 cursor-pointer">
                {sources.map(s => <option key={s} value={s}>{s === 'All' ? 'All Sources' : s}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400" />
            </div>

            {/* Risk level */}
            <div className="relative">
              <Shield className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400" />
              <select value={riskFilter} onChange={e => { setRiskFilter(e.target.value); setPage(1) }}
                className="h-8 appearance-none rounded-lg border border-slate-200 bg-slate-50 pl-7 pr-6 text-xs text-slate-700 transition focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-400/20 cursor-pointer">
                {['All', 'Critical', 'High', 'Medium', 'Low'].map(r => <option key={r} value={r}>{r === 'All' ? 'All Risk Levels' : `${r} Risk`}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400" />
            </div>

            {hasFilters && (
              <button type="button" onClick={clearFilters} className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 transition focus-visible:ring-2 focus-visible:ring-orange-300 rounded">
                <X className="h-3 w-3" /> Clear
              </button>
            )}
          </div>

          {/* Compliance pills */}
          <div className="mt-2.5 flex gap-1.5 flex-wrap">
            {['All', 'Compliant', 'Warning', 'Non-Compliant'].map(f => {
              const active = complianceFilter === f
              const count = f === 'All' ? filtered.length : filtered.filter(d => d.complianceState === f).length
              return (
                <button key={f} type="button" onClick={() => { setComplianceFilter(f); setPage(1) }}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold transition focus-visible:ring-2 focus-visible:ring-orange-300 ${
                    active
                      ? f === 'Compliant' ? 'bg-emerald-600 border-emerald-600 text-white'
                        : f === 'Warning' ? 'bg-amber-500 border-amber-500 text-white'
                        : f === 'Non-Compliant' ? 'bg-red-600 border-red-600 text-white'
                        : 'bg-orange-600 border-orange-600 text-white'
                      : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                  }`}>
                  {f}
                  <span className={`rounded-full px-1.5 py-px text-[0.6rem] font-bold ${active ? 'bg-white/20' : 'bg-slate-100 text-slate-500'}`}>{count}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Table */}
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-900/5 overflow-hidden">
          {paginated.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center px-4">
              <div className="rounded-full bg-slate-100 p-4 mb-3">
                <Search className="h-6 w-6 text-slate-400" />
              </div>
              <p className="text-sm font-semibold text-slate-700">No devices found</p>
              <p className="text-xs text-slate-500 mt-1">Try adjusting your search or filters</p>
              <button type="button" onClick={clearFilters} className="mt-3 text-xs text-orange-600 hover:text-orange-700 font-medium underline underline-offset-2">Clear all filters</button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="text-left border-collapse" style={{ tableLayout: 'fixed', width: lTotal }}>
                <colgroup>
                  {LOOKUP_COLS.map(col => <col key={col.key} style={{ width: lw[col.key] }} />)}
                </colgroup>
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <SortTh label="Device" sortKey="deviceName" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} width={lw['deviceName']} onStartResize={e => lResize('deviceName', e)} />
                    <SortTh label="User" sortKey="user" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} width={lw['user']} onStartResize={e => lResize('user', e)} />
                    <SortTh label="Platform" sortKey="platform" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} width={lw['platform']} onStartResize={e => lResize('platform', e)} />
                    <SortTh label="Source" sortKey="managementSource" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} width={lw['managementSource']} onStartResize={e => lResize('managementSource', e)} />
                    <SortTh label="Compliance" sortKey="complianceState" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} width={lw['complianceState']} onStartResize={e => lResize('complianceState', e)} />
                    <th scope="col" className="relative px-3 py-2.5 text-left text-[0.68rem] font-semibold uppercase tracking-wide text-slate-500 overflow-hidden" style={{ width: lw['encryption'] }}>
                      Encryption
                      <span
                        className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-orange-400/50 active:bg-orange-500 transition-colors"
                        onMouseDown={e => lResize('encryption', e)}
                        onClick={e => e.stopPropagation()}
                      />
                    </th>
                    <SortTh label="Risk Score" sortKey="riskScore" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} width={lw['riskScore']} onStartResize={e => lResize('riskScore', e)} />
                    <th scope="col" className="relative px-3 py-2.5 text-left text-[0.68rem] font-semibold uppercase tracking-wide text-slate-500 overflow-hidden" style={{ width: lw['edr'] }}>
                      EDR
                      <span
                        className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-orange-400/50 active:bg-orange-500 transition-colors"
                        onMouseDown={e => lResize('edr', e)}
                        onClick={e => e.stopPropagation()}
                      />
                    </th>
                    <SortTh label="Last Check-in" sortKey="lastCheckIn" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} width={lw['lastCheckIn']} onStartResize={e => lResize('lastCheckIn', e)} />
                    <th scope="col" className="relative px-3 py-2.5 text-left text-[0.68rem] font-semibold uppercase tracking-wide text-slate-500 overflow-hidden" style={{ width: lw['actions'] }}>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginated.map(device => {
                    const isSyncing = syncingIds.has(device.deviceName)
                    const rc = device.security ? riskColor(device.security.riskScore) : null
                    const alertCount = device.security?.recentEvents.filter(e => e.type === 'Critical' || e.type === 'Alert').length ?? 0
                    return (
                      <tr key={device.deviceName} onClick={() => setSelectedDevice(device)} className="group cursor-pointer hover:bg-orange-50/60 transition">
                        {/* Device */}
                        <td className="px-3 py-3 overflow-hidden">
                          <div className="flex items-center gap-2">
                            <div className={`rounded-lg p-1.5 flex-shrink-0 ${device.platform === 'macOS' ? 'bg-lime-100' : 'bg-orange-100'}`}>
                              <PlatformIcon platform={device.platform} className={`h-3.5 w-3.5 ${device.platform === 'macOS' ? 'text-lime-600' : 'text-orange-600'}`} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-semibold text-slate-900 group-hover:text-orange-700 transition truncate">{device.deviceName}</p>
                              <p className="text-[0.62rem] text-slate-400 truncate">{device.serialNumber}</p>
                            </div>
                            {alertCount > 0 && (
                              <span className="flex-shrink-0 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[0.55rem] font-bold text-white" title={`${alertCount} security alert${alertCount > 1 ? 's' : ''}`}>
                                {alertCount}
                              </span>
                            )}
                          </div>
                        </td>
                        {/* User */}
                        <td className="px-3 py-3 overflow-hidden"><p className="text-xs text-slate-700 truncate">{device.user}</p></td>
                        {/* Platform */}
                        <td className="px-3 py-3 overflow-hidden">
                          <p className="text-xs font-medium text-slate-700 truncate">{device.platform}</p>
                          <p className="text-[0.62rem] text-slate-400 truncate">{device.osVersion}</p>
                        </td>
                        {/* Source */}
                        <td className="px-3 py-3 overflow-hidden"><span className="text-xs text-slate-600 truncate block">{device.managementSource}</span></td>
                        {/* Compliance */}
                        <td className="px-3 py-3 overflow-hidden"><ComplianceBadge state={device.complianceState} /></td>
                        {/* Encryption */}
                        <td className="px-3 py-3 overflow-hidden"><EncryptionBadge status={device.encryptionStatus} /></td>
                        {/* Risk Score */}
                        <td className="px-3 py-3 overflow-hidden">
                          {device.security && rc ? (
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-1.5 rounded-full bg-slate-100">
                                <div className={`h-1.5 rounded-full ${rc.bar} transition-all`} style={{ width: `${device.security.riskScore}%` }} />
                              </div>
                              <span className={`text-xs font-bold w-5 text-right flex-shrink-0 ${rc.text}`}>{device.security.riskScore}</span>
                            </div>
                          ) : <span className="text-[0.68rem] text-slate-400">—</span>}
                        </td>
                        {/* EDR */}
                        <td className="px-3 py-3 overflow-hidden">
                          {device.security ? (
                            <span className={`inline-flex items-center gap-1 text-[0.65rem] font-semibold ${device.security.edrStatus === 'Active' ? 'text-emerald-700' : 'text-red-600'}`}>
                              <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${device.security.edrStatus === 'Active' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                              <span className="truncate">{device.security.edrStatus}</span>
                            </span>
                          ) : <span className="text-[0.68rem] text-slate-400">—</span>}
                        </td>
                        {/* Last check-in */}
                        <td className="px-3 py-3 overflow-hidden">
                          <div className="flex items-center gap-1 text-[0.68rem] text-slate-500">
                            <Clock className="h-3 w-3 text-slate-300 flex-shrink-0" />
                            <span className="truncate">{device.lastCheckIn}</span>
                          </div>
                        </td>
                        {/* Actions */}
                        <td className="px-3 py-3 overflow-hidden">
                          <div className="flex items-center gap-1.5">
                            <button type="button" onClick={e => { e.stopPropagation(); setSelectedDevice(device) }}
                              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[0.68rem] font-semibold text-slate-600 transition hover:bg-slate-50 hover:text-orange-600 focus-visible:ring-2 focus-visible:ring-orange-300">
                              Details
                            </button>
                            <button type="button" onClick={e => { e.stopPropagation(); handleSyncNow(device) }} disabled={isSyncing} aria-label="Sync device"
                              className="rounded-lg border border-slate-200 bg-white p-1 text-slate-400 transition hover:bg-slate-50 hover:text-orange-600 focus-visible:ring-2 focus-visible:ring-orange-300 disabled:opacity-50">
                              <RefreshCw className={`h-3 w-3 ${isSyncing ? 'animate-spin' : ''}`} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {sorted.length > 0 && (
            <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2.5 bg-slate-50">
              <p className="text-[0.68rem] text-slate-500">
                Showing {Math.min((page - 1) * PAGE_SIZE + 1, sorted.length)}–{Math.min(page * PAGE_SIZE, sorted.length)} of {sorted.length} device{sorted.length !== 1 ? 's' : ''}
              </p>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                  className="rounded-lg border border-slate-200 bg-white p-1 text-slate-500 transition hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-orange-300">
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                  <button key={p} type="button" onClick={() => setPage(p)}
                    className={`rounded-lg border px-2.5 py-1 text-[0.68rem] font-semibold transition focus-visible:ring-2 focus-visible:ring-orange-300 ${
                      p === page ? 'bg-orange-600 border-orange-600 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}>{p}</button>
                ))}
                <button type="button" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                  className="rounded-lg border border-slate-200 bg-white p-1 text-slate-500 transition hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-orange-300">
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Drawers & modals */}
      <DetailDrawer
        device={selectedDevice}
        onClose={() => setSelectedDevice(null)}
        onSyncNow={handleSyncNow}
        onViewDashboard={name => { onViewInDashboard?.(name) }}
      />

      <SecurityReportModal
        devices={allDevices}
        open={reportOpen}
        onClose={() => setReportOpen(false)}
      />
    </>
  )
}
