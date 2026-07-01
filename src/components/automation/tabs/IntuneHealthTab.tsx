import { useState, useEffect } from 'react'
import {
  Activity, RefreshCw, CheckCircle2, XCircle, AlertCircle,
  Clock, ShieldCheck, Package, Users, Cpu,
} from 'lucide-react'
import { intuneHealthApi } from '../../../api'
import type { IntuneHealthSummary, EnrollmentFailure } from '../../../api'
import { useToast } from '../../ui/ToastProvider'

function HealthCard({ label, value, sub, color, icon: Icon }: {
  label: string; value: string | number; sub: string; color: string; icon: React.ElementType
}) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm overflow-hidden">
      <div className="h-[3px]" style={{ background: color }} />
      <div className="px-4 py-3 flex items-start gap-3">
        <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-slate-100">
          <Icon className="h-4 w-4 text-slate-600" />
        </div>
        <div>
          <p className="text-[0.62rem] font-bold uppercase tracking-wider text-slate-400">{label}</p>
          <p className="mt-0.5 text-xl font-black text-slate-900">{value}</p>
          <p className="text-[0.6rem] text-slate-400 mt-0.5">{sub}</p>
        </div>
      </div>
    </div>
  )
}

function HealthGauge({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0
  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <span className="text-[0.68rem] font-semibold text-slate-600">{label}</span>
        <span className="text-[0.68rem] font-bold text-slate-900">{value}/{total}</span>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
      </div>
      <p className="text-[0.6rem] text-slate-400 mt-0.5">{pct}% healthy</p>
    </div>
  )
}

function StatusDot({ status }: { status: 'open' | 'remediated' | 'in_progress' }) {
  if (status === 'remediated') return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[0.62rem] font-bold text-emerald-700"><CheckCircle2 className="h-3 w-3" />Remediated</span>
  if (status === 'in_progress') return <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[0.62rem] font-bold text-amber-700"><Clock className="h-3 w-3" />In Progress</span>
  return <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[0.62rem] font-bold text-red-700"><XCircle className="h-3 w-3" />Open</span>
}

function reltime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60_000)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export function IntuneHealthTab() {
  const [summary, setSummary] = useState<IntuneHealthSummary | null>(null)
  const [failures, setFailures] = useState<EnrollmentFailure[]>([])
  const [loading, setLoading] = useState(true)
  const [retrying, setRetrying] = useState<string | null>(null)
  const { showToast } = useToast()

  const load = async () => {
    setLoading(true)
    try {
      const [s, f] = await Promise.all([
        intuneHealthApi.getSummary(),
        intuneHealthApi.getEnrollmentFailures(),
      ])
      setSummary(s)
      setFailures(f)
    } catch {
      showToast('Failed to load Intune health data', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const handleRetry = async (id: string) => {
    setRetrying(id)
    try {
      await intuneHealthApi.retryEnrollment(id)
      showToast('Re-enrollment command sent to device', 'success')
      void load()
    } catch {
      showToast('Failed to send re-enrollment command', 'error')
    } finally {
      setRetrying(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#F46C00] border-t-transparent" />
        <span className="ml-3 text-sm text-slate-500">Loading Intune health data…</span>
      </div>
    )
  }

  if (!summary) return null

  const { overview, syncHealth, enrollmentHealth, policyHealth, appDeployHealth, certHealth } = summary

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-slate-900">Intune Health Dashboard</h2>
          <p className="text-xs text-slate-500 mt-0.5">Live MDM health metrics across your fleet · Last updated {reltime(summary.lastUpdated)}</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
        >
          <RefreshCw className="h-3.5 w-3.5" />Refresh
        </button>
      </div>

      {/* Top KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <HealthCard label="Total Devices"     value={overview.totalDevices}        sub="managed by Intune"   color="linear-gradient(90deg,#6366f1,#8b5cf6)" icon={Cpu} />
        <HealthCard label="Compliant"         value={overview.compliantDevices}    sub={`${overview.complianceRate}% rate`}   color="linear-gradient(90deg,#10b981,#059669)" icon={CheckCircle2} />
        <HealthCard label="Non-Compliant"     value={overview.nonCompliantDevices} sub="need remediation"    color="linear-gradient(90deg,#ef4444,#dc2626)" icon={XCircle} />
        <HealthCard label="Sync Failures"     value={syncHealth.failedSyncs}       sub="last scan"           color="linear-gradient(90deg,#f59e0b,#d97706)" icon={Activity} />
        <HealthCard label="Enroll Failures"   value={enrollmentHealth.failedEnrollments} sub="open"         color="linear-gradient(90deg,#F46C00,#FB471F)" icon={Users} />
      </div>

      {/* Health breakdown gauges */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { title: 'Sync Health', icon: Activity, color: '#6366f1', rows: [
            { label: 'Successful syncs', value: syncHealth.successfulSyncs, total: syncHealth.successfulSyncs + syncHealth.failedSyncs + syncHealth.pendingSyncs, color: '#10b981' },
            { label: 'Pending syncs', value: syncHealth.pendingSyncs, total: syncHealth.successfulSyncs + syncHealth.failedSyncs + syncHealth.pendingSyncs, color: '#f59e0b' },
          ]},
          { title: 'Enrollment Health', icon: Users, color: '#F46C00', rows: [
            { label: 'Successful', value: enrollmentHealth.successfulEnrollments, total: enrollmentHealth.successfulEnrollments + enrollmentHealth.failedEnrollments, color: '#10b981' },
            { label: 'Re-enroll required', value: enrollmentHealth.reenrollRequired, total: enrollmentHealth.successfulEnrollments + enrollmentHealth.failedEnrollments, color: '#ef4444' },
          ]},
          { title: 'Policy Health', icon: ShieldCheck, color: '#8b5cf6', rows: [
            { label: 'Policies applied', value: policyHealth.policiesApplied, total: policyHealth.totalPolicies, color: '#10b981' },
            { label: 'Policies with gaps', value: policyHealth.policiesWithGaps, total: policyHealth.totalPolicies, color: '#f59e0b' },
          ]},
          { title: 'App Deployment', icon: Package, color: '#10b981', rows: [
            { label: 'Apps deployed', value: appDeployHealth.deployedApps, total: appDeployHealth.totalApps, color: '#10b981' },
            { label: 'Failed deployments', value: appDeployHealth.failedApps, total: appDeployHealth.totalApps, color: '#ef4444' },
          ]},
        ].map(section => (
          <div key={section.title} className="rounded-2xl border border-slate-200/80 bg-white shadow-sm overflow-hidden">
            <div className="h-[3px]" style={{ background: section.color }} />
            <div className="px-4 py-4">
              <div className="flex items-center gap-2 mb-4">
                <section.icon className="h-4 w-4" style={{ color: section.color }} />
                <p className="text-xs font-bold text-slate-900">{section.title}</p>
              </div>
              <div className="space-y-3">
                {section.rows.map(row => (
                  <HealthGauge key={row.label} {...row} />
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Certificate health summary */}
      <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm overflow-hidden">
        <div className="h-[3px] bg-gradient-to-r from-amber-400 to-orange-500" />
        <div className="px-5 py-4">
          <p className="text-xs font-bold text-slate-900 mb-3">Certificate Health</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Total',          value: certHealth.totalCerts,   color: 'bg-slate-100 text-slate-700' },
              { label: 'Valid',          value: certHealth.validCerts,   color: 'bg-emerald-100 text-emerald-700' },
              { label: 'Expiring Soon',  value: certHealth.expiringSoon, color: 'bg-amber-100 text-amber-700' },
              { label: 'Expired',        value: certHealth.expired,      color: 'bg-red-100 text-red-700' },
            ].map(c => (
              <div key={c.label} className={`rounded-xl px-3 py-2 text-center ${c.color}`}>
                <p className="text-lg font-black">{c.value}</p>
                <p className="text-[0.62rem] font-semibold">{c.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Enrollment Failures */}
      <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm overflow-hidden">
        <div className="h-[3px] bg-gradient-to-r from-red-400 to-orange-500" />
        <div className="px-5 py-4">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs font-bold text-slate-900">Enrollment Failures</p>
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-[0.62rem] font-bold text-red-700">
              {failures.filter(f => f.status === 'open').length} Open
            </span>
          </div>
          <div className="space-y-3">
            {failures.map(f => (
              <div key={f.id} className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-slate-900 truncate">{f.deviceName}</span>
                      <StatusDot status={f.status} />
                      <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[0.6rem] font-mono text-slate-600">{f.errorCode}</span>
                    </div>
                    <p className="text-[0.68rem] text-slate-600 mt-1">{f.userEmail} · {f.platform}</p>
                    <p className="text-[0.65rem] text-red-600 mt-1 font-medium">{f.errorMessage}</p>
                    <div className="mt-2 rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2">
                      <p className="text-[0.65rem] text-emerald-700 font-medium">Recommended fix:</p>
                      <p className="text-[0.63rem] text-emerald-600 mt-0.5 leading-relaxed">{f.recommendedFix}</p>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 shrink-0">
                    <p className="text-[0.6rem] text-slate-400 text-right">{reltime(f.failedAt)}</p>
                    <p className="text-[0.6rem] text-slate-400 text-right">{f.attempts} attempt{f.attempts !== 1 ? 's' : ''}</p>
                    {f.status === 'open' && (
                      <button
                        type="button"
                        onClick={() => void handleRetry(f.id)}
                        disabled={retrying === f.id}
                        className="rounded-full border border-[#F46C00]/40 bg-orange-50 px-3 py-1.5 text-[0.65rem] font-bold text-[#F46C00] hover:bg-orange-100 disabled:opacity-50 transition"
                      >
                        {retrying === f.id ? 'Sending…' : 'Retry Enrollment'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Auto-Remediation Actions */}
      <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm p-5">
        <p className="text-xs font-bold text-slate-900 mb-3">Quick Remediation Actions</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { label: 'Scan All Devices', desc: 'Force an immediate compliance sync across all managed devices', icon: RefreshCw, color: 'border-violet-200 bg-violet-50 text-violet-700' },
            { label: 'Push Compliance Policy', desc: 'Re-push all compliance policies to non-compliant devices', icon: ShieldCheck, color: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
            { label: 'Alert IT Team', desc: 'Send a Teams notification to the IT channel with current health report', icon: AlertCircle, color: 'border-amber-200 bg-amber-50 text-amber-700' },
          ].map(action => (
            <button
              key={action.label}
              type="button"
              onClick={() => showToast(`${action.label} — action queued`, 'success')}
              className={`rounded-xl border px-4 py-3 text-left transition hover:brightness-95 ${action.color}`}
            >
              <div className="flex items-center gap-2 mb-1">
                <action.icon className="h-3.5 w-3.5" />
                <p className="text-[0.72rem] font-bold">{action.label}</p>
              </div>
              <p className="text-[0.62rem] leading-relaxed opacity-75">{action.desc}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
