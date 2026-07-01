import { useState, useEffect } from 'react'
import {
  RefreshCw, CheckCircle2, AlertTriangle, XCircle,
  ShieldCheck, FileKey, Package, RotateCcw, Play,
} from 'lucide-react'
import { intuneHealthApi } from '../../../api'
import type { PolicyValidation, CertExpiry, AppFailure } from '../../../api'
import { useToast } from '../../ui/ToastProvider'

function reltime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60_000)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function certStatusBadge(status: CertExpiry['status']) {
  switch (status) {
    case 'expired':       return 'bg-red-100 text-red-700 border-red-200'
    case 'critical':      return 'bg-red-100 text-red-700 border-red-200'
    case 'expiring_soon': return 'bg-amber-100 text-amber-700 border-amber-200'
    default:              return 'bg-emerald-100 text-emerald-700 border-emerald-200'
  }
}

function certStatusLabel(status: CertExpiry['status'], days: number) {
  if (status === 'expired')       return `Expired ${Math.abs(days)}d ago`
  if (status === 'critical')      return `Expires in ${days}d — CRITICAL`
  if (status === 'expiring_soon') return `Expires in ${days}d`
  return `Valid — ${days}d remaining`
}

function policyStatusIcon(status: PolicyValidation['status']) {
  if (status === 'healthy')  return <CheckCircle2 className="h-4 w-4 text-emerald-500" />
  if (status === 'critical') return <XCircle className="h-4 w-4 text-red-500" />
  return <AlertTriangle className="h-4 w-4 text-amber-500" />
}

function appStatusBadge(status: AppFailure['status']) {
  switch (status) {
    case 'failed':        return 'bg-red-100 text-red-700 border border-red-200'
    case 'pending_retry': return 'bg-amber-100 text-amber-700 border border-amber-200'
    default:              return 'bg-emerald-100 text-emerald-700 border border-emerald-200'
  }
}

type ActiveSection = 'policies' | 'certs' | 'apps'

export function ComplianceIntelTab() {
  const [policies, setPolicies]   = useState<PolicyValidation[]>([])
  const [certs, setCerts]         = useState<CertExpiry[]>([])
  const [apps, setApps]           = useState<AppFailure[]>([])
  const [loading, setLoading]     = useState(true)
  const [section, setSection]     = useState<ActiveSection>('policies')
  const [expandedId, setExpanded] = useState<string | null>(null)
  const [actionId, setActionId]   = useState<string | null>(null)
  const { showToast } = useToast()

  const load = async () => {
    setLoading(true)
    try {
      const [p, c, a] = await Promise.all([
        intuneHealthApi.getPolicyValidation(),
        intuneHealthApi.getCertExpiry(),
        intuneHealthApi.getAppFailures(),
      ])
      setPolicies(p)
      setCerts(c)
      setApps(a)
    } catch {
      showToast('Failed to load compliance data', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const handleRenewCert = async (id: string) => {
    setActionId(id)
    try {
      await intuneHealthApi.renewCert(id)
      showToast('Certificate renewal initiated via SCEP profile', 'success')
    } catch {
      showToast('Cert renewal failed', 'error')
    } finally {
      setActionId(null)
    }
  }

  const handleRetryApp = async (id: string) => {
    setActionId(id)
    try {
      await intuneHealthApi.retryAppDeployment(id)
      showToast('App deployment retry queued', 'success')
    } catch {
      showToast('App retry failed', 'error')
    } finally {
      setActionId(null)
    }
  }

  const sections: { id: ActiveSection; label: string; icon: React.ElementType; count: number; color: string }[] = [
    { id: 'policies', label: 'Policy Validation', icon: ShieldCheck, count: policies.filter(p => p.status !== 'healthy').length, color: '#8b5cf6' },
    { id: 'certs',    label: 'Cert Monitor',      icon: FileKey,    count: certs.filter(c => c.status !== 'valid').length,          color: '#f59e0b' },
    { id: 'apps',     label: 'App Failures',      icon: Package,    count: apps.length,                                             color: '#ef4444' },
  ]

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#F46C00] border-t-transparent" />
        <span className="ml-3 text-sm text-slate-500">Loading compliance intelligence…</span>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Section tabs */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 bg-slate-100/80 rounded-full p-1">
          {sections.map(s => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSection(s.id)}
              className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-bold transition ${
                section === s.id ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <s.icon className="h-3.5 w-3.5" style={section === s.id ? { color: s.color } : {}} />
              {s.label}
              {s.count > 0 && (
                <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[0.6rem] font-black text-white leading-none">{s.count}</span>
              )}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
        >
          <RefreshCw className="h-3.5 w-3.5" />Refresh
        </button>
      </div>

      {/* ── Policy Validation ─────────────────────────────────────────────── */}
      {section === 'policies' && (
        <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm overflow-hidden">
          <div className="h-[3px] bg-gradient-to-r from-violet-400 to-purple-500" />
          <div className="px-5 py-4">
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs font-bold text-slate-900">Intune Policy Assignment Validation</p>
              <div className="flex gap-2">
                {(['healthy', 'warning', 'critical'] as const).map(s => (
                  <span key={s} className={`rounded-full px-2 py-0.5 text-[0.62rem] font-bold ${
                    s === 'healthy' ? 'bg-emerald-100 text-emerald-700' : s === 'warning' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
                  }`}>
                    {policies.filter(p => p.status === s).length} {s}
                  </span>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              {policies.map(p => (
                <div key={p.id} className="rounded-xl border border-slate-100 overflow-hidden">
                  <div
                    className="flex items-start justify-between gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50 transition"
                    onClick={() => setExpanded(expandedId === p.id ? null : p.id)}
                  >
                    <div className="flex items-start gap-3">
                      {policyStatusIcon(p.status)}
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-900">{p.policyName}</span>
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[0.6rem] font-semibold text-slate-600">{p.policyType}</span>
                          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[0.6rem] font-semibold text-blue-700">{p.platform}</span>
                        </div>
                        <p className="text-[0.62rem] text-slate-500 mt-0.5">
                          {p.assignedDevices} assigned · {p.compliantDevices} compliant · {p.nonCompliantDevices} non-compliant
                          {p.devicesWithGap > 0 ? ` · ${p.devicesWithGap} with gaps` : ''}
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[0.6rem] text-slate-400">Evaluated {reltime(p.lastEvaluated)}</p>
                      <div className="mt-1 h-1.5 w-24 rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.round((p.compliantDevices / (p.assignedDevices || 1)) * 100)}%`,
                            background: p.status === 'healthy' ? '#10b981' : p.status === 'critical' ? '#ef4444' : '#f59e0b',
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  {expandedId === p.id && p.gaps.length > 0 && (
                    <div className="border-t border-slate-100 bg-slate-50 px-4 py-3">
                      <p className="text-[0.65rem] font-bold text-slate-700 mb-2">Assignment Gaps</p>
                      <div className="space-y-2">
                        {p.gaps.map((g, i) => (
                          <div key={i} className="flex items-start gap-2">
                            <AlertTriangle className="h-3 w-3 text-amber-500 mt-0.5 shrink-0" />
                            <div>
                              <span className="text-[0.65rem] font-bold text-slate-800">{g.deviceName}</span>
                              <span className="text-[0.62rem] text-slate-500 ml-2">{g.issue}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Certificate Monitoring ────────────────────────────────────────── */}
      {section === 'certs' && (
        <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm overflow-hidden">
          <div className="h-[3px] bg-gradient-to-r from-amber-400 to-orange-500" />
          <div className="px-5 py-4">
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs font-bold text-slate-900">Certificate Expiry Monitor</p>
              <div className="flex gap-2">
                {(['expired', 'critical', 'expiring_soon', 'valid'] as const).map(s => (
                  <span key={s} className={`rounded-full border px-2 py-0.5 text-[0.62rem] font-bold ${certStatusBadge(s)}`}>
                    {certs.filter(c => c.status === s).length} {s.replace('_', ' ')}
                  </span>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              {certs
                .sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry)
                .map(c => (
                  <div key={c.id} className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-slate-900 truncate">{c.certName}</span>
                          <span className={`rounded-full border px-2 py-0.5 text-[0.6rem] font-bold ${certStatusBadge(c.status)}`}>
                            {certStatusLabel(c.status, c.daysUntilExpiry)}
                          </span>
                        </div>
                        <p className="text-[0.62rem] text-slate-500 mt-0.5">
                          {c.deviceName} · {c.userEmail} · {c.certType} · {c.issuer}
                        </p>
                        <div className="flex items-center gap-3 mt-1">
                          <span className={`text-[0.6rem] font-semibold ${c.autoRenew ? 'text-emerald-600' : 'text-red-600'}`}>
                            Auto-renew: {c.autoRenew ? 'Enabled' : 'Disabled'}
                          </span>
                          {c.expiresAt && (
                            <span className="text-[0.6rem] text-slate-400">Expires: {new Date(c.expiresAt).toLocaleDateString()}</span>
                          )}
                        </div>
                      </div>
                      {(c.status === 'expired' || c.status === 'critical' || c.status === 'expiring_soon') && (
                        <button
                          type="button"
                          onClick={() => void handleRenewCert(c.id)}
                          disabled={actionId === c.id}
                          className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-[0.65rem] font-bold text-amber-700 hover:bg-amber-100 disabled:opacity-50 transition shrink-0"
                        >
                          <RotateCcw className="h-3 w-3" />
                          {actionId === c.id ? 'Renewing…' : 'Renew Now'}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* ── App Deployment Failures ───────────────────────────────────────── */}
      {section === 'apps' && (
        <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm overflow-hidden">
          <div className="h-[3px] bg-gradient-to-r from-red-400 to-pink-500" />
          <div className="px-5 py-4">
            <p className="text-xs font-bold text-slate-900 mb-4">App Deployment Failures</p>

            <div className="space-y-3">
              {apps.map(a => (
                <div key={a.id} className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-slate-900">{a.appName}</span>
                        <span className="text-[0.6rem] text-slate-500">v{a.appVersion}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[0.6rem] font-bold ${appStatusBadge(a.status)}`}>
                          {a.status.replace('_', ' ')}
                        </span>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[0.6rem] font-semibold text-slate-600">{a.deploymentType}</span>
                      </div>
                      <p className="text-[0.62rem] text-slate-500 mt-0.5">{a.deviceName} · {a.userEmail} · {a.platform}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="rounded bg-red-50 border border-red-100 px-1.5 py-0.5 font-mono text-[0.6rem] text-red-700">{a.errorCode}</span>
                        <span className="text-[0.62rem] text-red-600 font-medium">{a.errorMessage}</span>
                      </div>
                      <div className="mt-2 rounded-lg bg-blue-50 border border-blue-100 px-3 py-2">
                        <p className="text-[0.62rem] font-semibold text-blue-700">Recommended fix:</p>
                        <p className="text-[0.6rem] text-blue-600 mt-0.5 leading-relaxed">{a.recommendedFix}</p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <p className="text-[0.6rem] text-slate-400">{reltime(a.failedAt)}</p>
                      <p className="text-[0.6rem] text-slate-400">{a.retryCount} retries</p>
                      <button
                        type="button"
                        onClick={() => void handleRetryApp(a.id)}
                        disabled={actionId === a.id}
                        className="inline-flex items-center gap-1.5 rounded-full border border-[#F46C00]/40 bg-orange-50 px-3 py-1.5 text-[0.65rem] font-bold text-[#F46C00] hover:bg-orange-100 disabled:opacity-50 transition"
                      >
                        <Play className="h-3 w-3" />
                        {actionId === a.id ? 'Queuing…' : 'Retry Deploy'}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              {apps.length === 0 && (
                <div className="py-10 text-center">
                  <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-400 mb-2" />
                  <p className="text-xs font-semibold text-slate-600">No app deployment failures</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
