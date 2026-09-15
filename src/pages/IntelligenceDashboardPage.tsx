import { useState, useEffect } from 'react'
import {
  Brain, Shield, GitBranch,
  FileText, Calendar, ClipboardList,
  ArrowRight, RefreshCw, TrendingUp, AlertTriangle, CheckCircle,
} from 'lucide-react'
import { intelApi } from '../api/intelligence'

interface ModuleCard {
  id: string
  title: string
  description: string
  icon: React.ElementType
  page: string
  color: string
  iconBg: string
  badge?: 'AI'
}

const MODULES: ModuleCard[] = [
  { id: 'compliance',        title: 'Compliance Intelligence', description: 'AI-generated executive summary of tenant-wide compliance posture.', icon: Shield,        page: 'Compliance Intelligence', color: 'text-emerald-600', iconBg: 'bg-emerald-100' },
  { id: 'policy-conflicts', title: 'Policy Conflicts',        description: 'Detect duplicate, stale, and conflicting configuration policies.',           icon: GitBranch,     page: 'Policy Conflicts',        color: 'text-orange-600',  iconBg: 'bg-orange-100', badge: 'AI' },
  { id: 'risk-scoring',     title: 'AI Risk Scoring',         description: 'Per-device risk scores powered by AI with actionable remediation steps.',    icon: Brain,         page: 'Risk Scoring',            color: 'text-purple-600',  iconBg: 'bg-purple-100', badge: 'AI' },
  { id: 'report-builder',   title: 'Report Builder',          description: 'Generate and download reports in PDF, Excel, CSV, and PowerPoint.',          icon: FileText,      page: 'Report Builder',          color: 'text-red-600',     iconBg: 'bg-red-100'     },
  { id: 'scheduled-reports',title: 'Scheduled Reports',       description: 'Automate report delivery on a recurring schedule to email recipients.',      icon: Calendar,      page: 'Scheduled Reports',       color: 'text-teal-600',    iconBg: 'bg-teal-100'    },
  { id: 'audit-log',        title: 'Audit Log',               description: 'Full change and access trail for compliance and security reviews.',           icon: ClipboardList, page: 'Audit Log',               color: 'text-slate-600',   iconBg: 'bg-slate-100'   },
]

interface KpiState {
  total: number; compliant: number; noncompliant: number; avgRisk: number | null; conflicts: number | null
}

export function IntelligenceDashboardPage({ onNavigate }: { onNavigate: (page: string) => void }) {
  const [aiSummary, setAiSummary]   = useState('')
  const [summaryLoading, setSumLoading] = useState(false)
  const [kpi, setKpi]               = useState<KpiState | null>(null)
  const [kpiLoading, setKpiLoading] = useState(true)

  const loadKpi = async () => {
    setKpiLoading(true)
    try {
      const data = await intelApi.devices()
      setKpi({
        total: data.count,
        compliant: data.data.filter(d => d.complianceState === 'compliant').length,
        noncompliant: data.data.filter(d => d.complianceState === 'noncompliant').length,
        avgRisk: null,
        conflicts: null,
      })
    } catch {
      // no-op — shows skeleton
    } finally {
      setKpiLoading(false)
    }
  }

  const loadSummary = async () => {
    setSumLoading(true)
    try {
      const data = await intelApi.summary()
      if (data.success) setAiSummary(data.summary)
    } catch {
      // no-op
    } finally {
      setSumLoading(false)
    }
  }

  useEffect(() => {
    loadKpi()
    loadSummary()
  }, [])

  const complianceRate = kpi && kpi.total > 0
    ? ((kpi.compliant / kpi.total) * 100).toFixed(1)
    : null

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Brain className="h-5 w-5 text-purple-600" />
          <h1 className="text-xl font-semibold text-slate-900">Endpoint Intelligence Platform</h1>
          <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-bold text-purple-700 uppercase tracking-wide">AI-Powered</span>
        </div>
        <p className="text-sm text-slate-500">
          Unified Intune intelligence — compliance, risk scoring, policy analysis, and automated executive reporting.
        </p>
      </div>

      {/* Quick KPI bar */}
      {(kpiLoading || kpi) && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'Total Devices',   value: kpi?.total,       icon: TrendingUp,    color: 'text-slate-900' },
            { label: 'Compliant',       value: kpi?.compliant,   icon: CheckCircle,   color: 'text-emerald-700' },
            { label: 'Non-Compliant',   value: kpi?.noncompliant,icon: AlertTriangle, color: 'text-red-700' },
            { label: 'Compliance Rate', value: complianceRate ? `${complianceRate}%` : null, icon: Shield, color: complianceRate && Number(complianceRate) >= 80 ? 'text-emerald-700' : 'text-red-700' },
          ].map(k => (
            <div key={k.label} className="rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm">
              <div className={`text-2xl font-bold ${k.color}`}>
                {kpiLoading ? <div className="h-7 w-12 animate-pulse rounded bg-slate-100" /> : (k.value ?? '—')}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">{k.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* AI Tenant Summary */}
      <div className="rounded-xl border border-purple-200/60 bg-purple-50/60 p-4">
        <div className="flex items-start gap-3">
          <Brain className="h-4 w-4 text-purple-600 mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-xs font-semibold text-purple-700 uppercase tracking-wide">AI Tenant Summary</span>
              <button
                onClick={loadSummary}
                disabled={summaryLoading}
                className="ml-auto rounded p-1 text-purple-400 hover:text-purple-600 hover:bg-purple-100 transition disabled:opacity-40"
              >
                <RefreshCw className={`h-3 w-3 ${summaryLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>
            {summaryLoading ? (
              <div className="space-y-1.5">
                <div className="h-3.5 w-3/4 animate-pulse rounded bg-purple-200" />
                <div className="h-3.5 w-1/2 animate-pulse rounded bg-purple-200" />
              </div>
            ) : aiSummary ? (
              <p className="text-sm text-slate-700 leading-relaxed">{aiSummary}</p>
            ) : (
              <p className="text-xs text-slate-400 italic">Set OPENAI_API_KEY to enable AI-generated summaries.</p>
            )}
          </div>
        </div>
      </div>

      {/* Module grid */}
      <div>
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Intelligence Modules</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {MODULES.map(mod => (
            <button
              key={mod.id}
              onClick={() => onNavigate(mod.page)}
              className="group text-left rounded-xl border border-slate-200/60 bg-white p-5 shadow-sm hover:shadow-md hover:border-slate-300 transition-all duration-150"
            >
              <div className="flex items-start justify-between mb-3">
                <div className={`grid h-10 w-10 place-items-center rounded-xl ${mod.iconBg}`}>
                  <mod.icon className={`h-5 w-5 ${mod.color}`} />
                </div>
                <div className="flex items-center gap-1.5">
                  {mod.badge && (
                    <span className="rounded-full bg-purple-100 px-1.5 py-0.5 text-[10px] font-bold text-purple-700">
                      {mod.badge}
                    </span>
                  )}
                  <ArrowRight className="h-4 w-4 text-slate-300 group-hover:text-slate-500 group-hover:translate-x-0.5 transition-all" />
                </div>
              </div>
              <h3 className="text-sm font-semibold text-slate-900 mb-1">{mod.title}</h3>
              <p className="text-xs text-slate-500 leading-relaxed">{mod.description}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
