import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import {
  RefreshCw, Download, Zap, Apple, Info,
  ChevronDown, ChevronUp,
} from 'lucide-react'
import { api } from '../api'
import type { ApiDevice } from '../api'
import { KpiModal } from '../components/reports/KpiModal'
import type { KpiId, KpiFilterOpts } from '../lib/kpiConfig'
import {
  KPI_CONFIGS, KPI_GROUPS, KPI_IDS_BY_GROUP,
  CURRENT_MACOS, isHealthy, isEol, isNearEol, isActive,
  daysSinceCheckIn, versionsBehind,
} from '../lib/kpiConfig'
import { generateKpiExcel } from '../lib/kpiExport'
import { useToast } from '../components/ui/ToastProvider'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props { onBack?: () => void }

type TimeRange = '7d' | '30d' | '90d' | '6mo' | 'all'
type StaleThreshold = 7 | 14 | 30 | 60 | 90

const STALE_OPTIONS: StaleThreshold[] = [7, 14, 30, 60, 90]

// ── Section header ────────────────────────────────────────────────────────────

function SectionHeader({ title, count, onToggle, open }: {
  title: string; count: number; onToggle: () => void; open: boolean
}) {
  return (
    <button type="button" onClick={onToggle}
      className="w-full flex items-center justify-between group"
    >
      <div className="flex items-center gap-2">
        <span className="text-xs font-black uppercase tracking-[0.15em] text-slate-500">{title}</span>
        <span className="rounded-full bg-slate-100 border border-slate-200 px-2 py-0.5 text-[0.6rem] font-bold text-slate-500">
          {count} cards
        </span>
      </div>
      {open
        ? <ChevronUp   className="h-3.5 w-3.5 text-slate-400" />
        : <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
      }
    </button>
  )
}

// ── Single KPI Card ───────────────────────────────────────────────────────────

function KpiCard({ kpiId, devices, opts, onClick, loading }: {
  kpiId: KpiId
  devices: ApiDevice[]
  opts: KpiFilterOpts
  onClick: (id: KpiId) => void
  loading: boolean
}) {
  const config    = KPI_CONFIGS[kpiId]
  const kpiValue  = useMemo(() => config.getValue(devices, opts), [config, devices, opts])
  const kpiCount  = useMemo(() => config.filterFn(devices, opts).length, [config, devices, opts])

  return (
    <button
      type="button"
      onClick={() => onClick(kpiId)}
      disabled={loading}
      aria-label={`View ${config.title} details`}
      className="relative text-left rounded-2xl glass overflow-hidden transition-all water-glow-card focus-visible:outline-none group disabled:cursor-wait"
      style={{ minHeight: '100px' }}
    >
      {/* Accent top bar */}
      <div className="absolute top-0 left-0 right-0 h-[3px]"
        style={{ background: `linear-gradient(90deg, ${config.accentColor}88, ${config.accentColor})` }} />

      {/* Ambient bloom on hover */}
      <div className="pointer-events-none absolute -top-6 -right-6 h-20 w-20 rounded-full blur-2xl opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ background: `${config.accentColor}22` }} />

      <div className="relative px-4 py-3.5">
        {/* Group badge */}
        <div className="flex items-center justify-between mb-2">
          <p className="text-[0.55rem] font-black uppercase tracking-[0.15em] text-slate-400">{config.group}</p>
          {config.isInfoCard && (
            <span title="Informational — click to see devices">
              <Info className="h-3 w-3 text-slate-300" />
            </span>
          )}
        </div>

        {/* Title */}
        <p className="text-[0.72rem] font-bold text-slate-700 leading-snug mb-2">{config.title}</p>

        {/* Value */}
        <p className="text-2xl font-black mono-num leading-none"
          style={{ color: loading ? '#CBD5E1' : config.accentColor }}>
          {loading ? '—' : String(kpiValue)}
        </p>

        {/* Device count sub-label (for score cards) */}
        {typeof kpiValue === 'string' && kpiValue.includes('%') && (
          <p className="text-[0.6rem] text-slate-400 mt-0.5">
            {kpiCount.toLocaleString()} of {devices.length.toLocaleString()} devices
          </p>
        )}
        {typeof kpiValue !== 'string' && !config.isInfoCard && (
          <p className="text-[0.6rem] text-slate-400 mt-0.5">
            {devices.length > 0
              ? `${((kpiCount / devices.length) * 100).toFixed(1)}% of fleet`
              : 'No data'}
          </p>
        )}

        {/* Click hint */}
        <p className="text-[0.55rem] text-slate-300 mt-2 group-hover:text-[#7C5CFC] transition-colors">
          Click to view details →
        </p>
      </div>
    </button>
  )
}

// ── AI Insights — inline dropdown (merged into header) ────────────────────────

// ── AI Insights — proper React component with internal dropdown state ──────────
// Must be rendered as <AiInsightsButton /> — never called as a plain function.

/**
 * AiInsightsButton — always visible; analyses your macOS fleet in real time
 * and surfaces actionable recommendations.
 *
 * Shows a fleet health summary + any warnings (patches, stale, EOL, OS gaps).
 * Clicking opens a dropdown; the button is always rendered when devices load.
 */
function AiInsightsButton({ devices, opts }: { devices: ApiDevice[]; opts: KpiFilterOpts }) {
  const [open, setOpen] = useState(false)
  const ref             = useRef<HTMLDivElement>(null)

  // ── Compute all insights regardless of fleet health ───────────────────────
  const { insights, allClear } = useMemo(() => {
    if (!devices.length) return { insights: [], allClear: false }

    const total       = devices.length
    const compliant   = devices.filter(d => d.complianceState === 'Compliant').length
    const pct         = Math.round(compliant / total * 100)
    const critPatch   = devices.filter(d => d.severity === 'Critical' && d.complianceState !== 'Compliant')
    const highPatch   = devices.filter(d => d.severity === 'High'     && d.complianceState !== 'Compliant')
    const stale       = devices.filter(d => daysSinceCheckIn(d.lastCheckIn) > (opts.staleThresholdDays ?? 30))
    const eolDevices  = devices.filter(d => isEol(d))
    const nearEol     = devices.filter(d => isNearEol(d))
    const v1behind    = devices.filter(d => versionsBehind(d.osVersion) === 1)
    const v2behind    = devices.filter(d => versionsBehind(d.osVersion) >= 2)
    const nonCompliant= devices.filter(d => d.complianceState === 'Non-Compliant')
    const warnings    = devices.filter(d => d.complianceState === 'Warning')

    const result: { type: 'Critical'|'High'|'Opportunity'|'Healthy'; text: string; action: string }[] = []

    // ── Fleet health summary (always first) ──────────────────────────────────
    if (pct >= 95) {
      result.push({ type: 'Healthy', text: `Excellent! ${pct}% of your ${total.toLocaleString()} macOS devices are fully compliant — your fleet is in great shape.`, action: 'Keep maintaining your current patch and update schedules.' })
    } else if (pct >= 80) {
      result.push({ type: 'Healthy', text: `${pct}% compliance across ${total.toLocaleString()} devices. ${nonCompliant.length} devices need attention, ${warnings.length} have warnings.`, action: 'Review the Non-Compliant and Warning KPI cards below.' })
    } else {
      result.push({ type: 'High', text: `Fleet compliance is ${pct}% across ${total.toLocaleString()} devices. ${nonCompliant.length} non-compliant, ${warnings.length} warning.`, action: 'Prioritise the Non-Compliant Devices KPI for immediate remediation.' })
    }

    // ── Critical patches ─────────────────────────────────────────────────────
    if (critPatch.length > 0) {
      result.push({ type: 'Critical', text: `${critPatch.length} device${critPatch.length > 1 ? 's are' : ' is'} missing critical security patches with potential CVE 9.0+ exposure.`, action: 'Deploy emergency patches to critical devices immediately via your MDM.' })
    } else if (highPatch.length > 0) {
      result.push({ type: 'High', text: `${highPatch.length} device${highPatch.length > 1 ? 's have' : ' has'} high-severity patch gaps that should be addressed within 7 days.`, action: 'Schedule a patch deployment for high-severity devices this week.' })
    }

    // ── Stale check-ins ──────────────────────────────────────────────────────
    if (stale.length > 0) {
      result.push({ type: 'High', text: `${stale.length} device${stale.length > 1 ? 's have' : ' has'} not checked in for over ${opts.staleThresholdDays ?? 30} days — possible loss or connectivity failure.`, action: 'Send check-in reminders; escalate devices offline > 60 days.' })
    }

    // ── EOL / Near EOL ───────────────────────────────────────────────────────
    if (eolDevices.length > 0) {
      result.push({ type: 'High', text: `${eolDevices.length} device${eolDevices.length > 1 ? 's are' : ' is'} past Apple End-of-Life and receiving no security updates.`, action: `Submit hardware replacement budget (~$${(eolDevices.length * 1499).toLocaleString()} est.) and retire these devices.` })
    } else if (nearEol.length > 0) {
      result.push({ type: 'Opportunity', text: `${nearEol.length} device${nearEol.length > 1 ? 's are' : ' is'} approaching End-of-Life within 90 days.`, action: 'Plan replacement procurement now to avoid security coverage gaps.' })
    }

    // ── macOS currency ───────────────────────────────────────────────────────
    if (v2behind.length > 0) {
      result.push({ type: 'Opportunity', text: `${v2behind.length} device${v2behind.length > 1 ? 's are' : ' is'} running macOS 2+ major versions behind ${CURRENT_MACOS.name} — missing significant security improvements.`, action: `Upgrading to ${CURRENT_MACOS.version} would improve fleet compliance by ~${Math.max(5, Math.round(v2behind.length / total * 15))}%.` })
    } else if (v1behind.length > 0) {
      result.push({ type: 'Opportunity', text: `${v1behind.length} device${v1behind.length > 1 ? 's are' : ' is'} one macOS version behind. Consider scheduling an upgrade in your next maintenance window.`, action: `Schedule a ${CURRENT_MACOS.name} upgrade campaign for ${v1behind.length} eligible devices.` })
    }

    const warnings_ = result.filter(r => r.type !== 'Healthy')
    const allClear  = warnings_.length === 0

    return { insights: result, allClear }
  }, [devices, opts])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Always render (no null return) — button shows even when fleet is healthy
  const warningCount = insights.filter(i => i.type !== 'Healthy').length
  const buttonColor  = allClear ? '#10B981' : warningCount > 0 ? '#7C5CFC' : '#7C5CFC'

  const typeConfig = {
    Critical:    { bg: '#FEF2F2', border: '#FECACA', dot: '#EF4444', label: 'CRITICAL'     },
    High:        { bg: '#FFFBEB', border: '#FDE68A', dot: '#F59E0B', label: 'HIGH'         },
    Opportunity: { bg: '#EFF6FF', border: '#BFDBFE', dot: '#3B82F6', label: 'OPPORTUNITY'  },
    Healthy:     { bg: '#F0FDF4', border: '#BBF7D0', dot: '#10B981', label: 'HEALTHY'      },
  }

  return (
    <div ref={ref} className="relative">
      {/* Trigger button */}
      <button type="button" onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition-all"
        style={{
          background:  open ? `${buttonColor}10` : 'rgba(255,255,255,0.7)',
          borderColor: open ? `${buttonColor}50` : 'rgba(148,163,184,0.25)',
          color: buttonColor,
        }}>
        <Zap className="h-3.5 w-3.5" />
        <span>AI Insights</span>
        {warningCount > 0
          ? <span className="rounded-full px-1.5 py-0.5 text-[0.55rem] font-black"
              style={{ background: `${buttonColor}15` }}>{warningCount} action{warningCount > 1 ? 's' : ''}</span>
          : <span className="rounded-full px-1.5 py-0.5 text-[0.55rem] font-black"
              style={{ background: '#10B98115', color: '#10B981' }}>All Clear</span>
        }
        {open ? <ChevronUp className="h-3 w-3 opacity-60" /> : <ChevronDown className="h-3 w-3 opacity-60" />}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-[440px] rounded-2xl border border-slate-200 bg-white shadow-xl z-[9999] overflow-hidden"
          style={{ boxShadow: '0 16px 48px rgba(0,0,0,0.14), 0 0 0 1px rgba(148,163,184,0.15)' }}>

          {/* Header strip */}
          <div className="h-[2.5px]" style={{ background: 'linear-gradient(90deg, #7C5CFC, #06B6D4)' }} />
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/60">
            <div className="flex items-center gap-2">
              <Zap className="h-3.5 w-3.5 text-[#7C5CFC]" />
              <p className="text-xs font-black text-slate-700">AI Fleet Insights</p>
            </div>
            <p className="text-[0.65rem] text-slate-400 mt-0.5 leading-relaxed">
              Real-time analysis of your macOS fleet — compliance status, patch gaps, device lifecycle risks, and recommended actions based on live device data.
            </p>
          </div>

          {/* Insights */}
          <div className="p-3 space-y-2 max-h-72 overflow-y-auto">
            {insights.length === 0 ? (
              <p className="text-center text-xs text-slate-400 py-4">Loading fleet analysis…</p>
            ) : (
              insights.map((ins, i) => {
                const tc = typeConfig[ins.type]
                return (
                  <div key={i} className="rounded-xl border p-3"
                    style={{ background: tc.bg, borderColor: tc.border }}>
                    <div className="flex items-start gap-2">
                      <div className="mt-1 h-2 w-2 flex-shrink-0 rounded-full" style={{ background: tc.dot }} />
                      <div>
                        <span className="text-[0.55rem] font-black uppercase tracking-widest mr-2"
                          style={{ color: tc.dot }}>{tc.label}</span>
                        <span className="text-xs text-slate-700 leading-relaxed">{ins.text}</span>
                        <p className="text-xs font-semibold mt-1.5" style={{ color: tc.dot }}>
                          ► {ins.action}
                        </p>
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50/60">
            <p className="text-[0.6rem] text-slate-400">
              Analysis based on {devices.length.toLocaleString()} managed macOS devices · Updates on Refresh
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function MacFleetReportsPage({ onBack }: Props) {
  const { notify } = useToast()

  const [devices,      setDevices]      = useState<ApiDevice[]>([])
  const [loading,      setLoading]      = useState(true)
  const [lastUpdated,  setLastUpdated]  = useState<Date | null>(null)
  const [openKpi,      setOpenKpi]      = useState<KpiId | null>(null)
  const [timeRange,    setTimeRange]    = useState<TimeRange>('all')
  const [staleThresh,  setStaleThresh]  = useState<StaleThreshold>(30)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())

  const kpiOpts: KpiFilterOpts = { staleThresholdDays: staleThresh }

  // Fetch all macOS devices
  const fetchDevices = useCallback(() => {
    setLoading(true)
    api.fetchAllDevicesRaw({ platform: 'macOS', limit: 500 })
      .then(r => {
        setDevices(r.devices)
        setLastUpdated(new Date())
      })
      .catch(() => {
        setDevices([])
        notify('error', 'Fetch Failed', 'Could not load device data. Check your MDM connection in Settings.')
      })
      .finally(() => setLoading(false))
  }, [notify])

  useEffect(() => { fetchDevices() }, [fetchDevices])

  const toggleGroup = (group: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev)
      next.has(group) ? next.delete(group) : next.add(group)
      return next
    })
  }

  // ── Export all KPIs summary ────────────────────────────────────────────────
  const handleExportAll = () => {
    if (!devices.length) { notify('info', 'No Data', 'No devices to export.'); return }
    try {
      generateKpiExcel({
        kpiId: 'total-devices',
        allDevices: devices,
        appliedFilters: `Platform: macOS | Stale Threshold: ${staleThresh}d`,
        generatedBy: 'Mac Fleet Reports',
        opts: kpiOpts,
      })
      notify('success', 'Export Started', 'Fleet summary export downloading…')
    } catch {
      notify('error', 'Export Failed', 'Could not generate the export file.')
    }
  }

  // ── Open KPI modal ─────────────────────────────────────────────────────────
  const openKpiModal = (id: KpiId) => setOpenKpi(id)

  const appliedFilters = `Platform: macOS${timeRange !== 'all' ? ` | Last ${timeRange}` : ''} | Stale threshold: ${staleThresh}d`

  return (
    <div className="flex flex-col gap-5 w-full page-enter">

      {/* ── Single combined header row ── */}
      <div className="glass rounded-2xl overflow-hidden">
        <div className="h-[3px]" style={{ background: 'linear-gradient(90deg, #FFC600 0%, #F46C00 50%, #FB471F 100%)' }} />
        <div className="px-5 py-3.5 flex flex-wrap items-center gap-3">

          {/* Left — icon + title */}
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-2xl"
              style={{ background: 'linear-gradient(135deg, #141408, #1e1d10)' }}>
              <Apple className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base font-black text-slate-800 leading-tight">Mac Fleet Reports</h1>
              <p className="text-[0.65rem] text-slate-400 truncate">
                macOS endpoint health, patch compliance &amp; lifecycle for{' '}
                {loading ? '…' : devices.length.toLocaleString()} managed devices
              </p>
            </div>
          </div>

          {/* Right — all controls on the same row */}
          <div className="flex flex-wrap items-center gap-2 flex-shrink-0">

            {/* AI Insights — proper React component, not a function call */}
            {!loading && devices.length > 0 && (
              <AiInsightsButton devices={devices} opts={kpiOpts} />
            )}

            {/* Stale threshold selector */}
            <div className="flex items-center gap-1 text-[0.68rem] text-slate-500">
              <span>Stale:</span>
              <select value={staleThresh}
                onChange={e => setStaleThresh(Number(e.target.value) as StaleThreshold)}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[0.68rem] text-slate-700 focus:outline-none">
                {STALE_OPTIONS.map(d => <option key={d} value={d}>{d}d</option>)}
              </select>
            </div>

            <button type="button" onClick={fetchDevices} disabled={loading}
              className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition disabled:opacity-50">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-[#F46C00]' : ''}`} />
              {lastUpdated
                ? `Updated ${lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                : 'Refresh'}
            </button>

            <button type="button" onClick={handleExportAll} disabled={loading || !devices.length}
              className="flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-bold text-white transition disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #F46C00, #FB471F)' }}>
              <Download className="h-3.5 w-3.5" />Export All
            </button>
          </div>
        </div>
      </div>

      {/* ── KPI Groups ── */}
      {KPI_GROUPS.map(group => {
        const ids       = KPI_IDS_BY_GROUP[group]
        const isOpen    = !collapsedGroups.has(group)
        return (
          <div key={group} className="space-y-3">
            <SectionHeader
              title={group}
              count={ids.length}
              onToggle={() => toggleGroup(group)}
              open={isOpen}
            />

            {isOpen && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                {ids.map(kpiId => (
                  <KpiCard
                    key={kpiId}
                    kpiId={kpiId}
                    devices={devices}
                    opts={kpiOpts}
                    onClick={openKpiModal}
                    loading={loading}
                  />
                ))}
              </div>
            )}
          </div>
        )
      })}

      {/* ── Empty state ── */}
      {!loading && devices.length === 0 && (
        <div className="glass rounded-2xl p-10 text-center">
          <Apple className="mx-auto h-10 w-10 text-slate-300 mb-4" />
          <p className="text-sm font-bold text-slate-600 mb-1">No macOS Devices Found</p>
          <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
            Connect Kandji, Intune, or ManageEngine in Settings → Integrations to populate this report with your macOS fleet data.
          </p>
        </div>
      )}

      {/* ── KPI Modal ── */}
      {openKpi && (
        <KpiModal
          kpiId={openKpi}
          allDevices={devices}
          appliedFilters={appliedFilters}
          generatedBy="Mac Fleet Reports"
          loading={loading}
          opts={kpiOpts}
          onClose={() => setOpenKpi(null)}
        />
      )}
    </div>
  )
}
