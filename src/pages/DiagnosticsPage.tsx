import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { useColumnResize } from '../hooks/useColumnResize'
import {
  Activity, Search, RefreshCw, ChevronDown, X,
  HardDrive, Cpu, Wifi, Battery, Shield, Package,
  CheckCircle2, AlertTriangle, XCircle, HelpCircle,
  Monitor, Zap, Clock, Info, BarChart3,
  Server, Settings, ShieldCheck, Hash, MessageSquare,
  Globe, TrendingUp, Copy, Check,
  Layers, AlertCircle, Radio, BookOpen, Apple,
} from 'lucide-react'
import { api } from '../api'
import type { ApiDevice, ApiStats, IntegrationStatusItem } from '../api'

// ─── Types ─────────────────────────────────────────────────────────────────────

type DiagStatus   = 'Healthy' | 'Warning' | 'Critical' | 'Unknown'
type DiagSeverity = 'None' | 'Low' | 'Medium' | 'High' | 'Critical'
type PageTab      = 'infrastructure' | 'device' | 'fleet'

interface DiagResult {
  id: string
  category: string
  icon: typeof HardDrive
  status: DiagStatus
  issue: string
  likelyCause: string
  confidence: number
  severity: DiagSeverity
  action: string
  details?: string
}

interface FleetCategorySummary {
  category: string
  icon: typeof HardDrive
  critical: number
  warning: number
  healthy: number
  unknown: number
  total: number
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function statusCfg(s: DiagStatus) {
  switch (s) {
    case 'Healthy':  return { color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200', dot: 'bg-emerald-500', icon: CheckCircle2 }
    case 'Warning':  return { color: 'text-amber-700',   bg: 'bg-amber-50',   border: 'border-amber-200',   dot: 'bg-amber-500',   icon: AlertTriangle }
    case 'Critical': return { color: 'text-red-700',     bg: 'bg-red-50',     border: 'border-red-200',     dot: 'bg-red-500',     icon: XCircle }
    default:         return { color: 'text-slate-500',   bg: 'bg-slate-50',   border: 'border-slate-200',   dot: 'bg-slate-400',   icon: HelpCircle }
  }
}

function severityColor(s: DiagSeverity) {
  switch (s) {
    case 'Critical': return 'text-red-700 bg-red-50 border-red-200'
    case 'High':     return 'text-orange-700 bg-orange-50 border-orange-200'
    case 'Medium':   return 'text-amber-700 bg-amber-50 border-amber-200'
    case 'Low':      return 'text-slate-600 bg-slate-50 border-slate-200'
    default:         return 'text-emerald-700 bg-emerald-50 border-emerald-200'
  }
}

function confidenceBar(pct: number) {
  if (pct >= 85) return 'bg-emerald-500'
  if (pct >= 65) return 'bg-amber-500'
  return 'bg-slate-400'
}

function formatLatency(ms: number | null): string {
  if (ms === null) return '—'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function timeSince(iso: string | null): string {
  if (!iso) return 'Never'
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1)   return 'just now'
  if (mins < 60)  return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)   return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

// ─── Diagnostic engine ─────────────────────────────────────────────────────────

function runDiagnostics(device: ApiDevice): DiagResult[] {
  const primaryIssue = (device.primaryIssue ?? '').toLowerCase()
  const policyFailed = (device.policyFailed ?? '').toLowerCase()
  const encryption   = (device.encryptionStatus ?? '').toLowerCase()

  // Disk & Encryption
  let diskStatus: DiagStatus = 'Healthy', diskSeverity: DiagSeverity = 'None', diskConf = 92
  let diskIssue = 'Storage within acceptable range, encryption active'
  let diskCause = 'No anomalies detected', diskAction = 'No action required'
  const encryptionOk = /encrypt|on|luks|enabled/i.test(encryption) && !/off|pending|not |disabled/i.test(encryption)
  if (!encryptionOk) {
    diskStatus = 'Critical'; diskSeverity = 'High'; diskConf = 97
    diskIssue = 'Disk encryption is NOT enabled'
    diskCause = `Encryption reported as "${device.encryptionStatus}"`
    diskAction = device.platform === 'macOS' ? 'Enable FileVault via System Settings → Privacy & Security' : 'Enable BitLocker via Intune compliance policy or Group Policy'
  } else if (device.freeStorage) {
    const freeGB = parseFloat(device.freeStorage), totalGB = parseFloat(device.totalStorage ?? '100')
    const freePct = (freeGB / totalGB) * 100
    if (freePct < 10) { diskStatus = 'Critical'; diskSeverity = 'High'; diskConf = 88; diskIssue = `Critical low disk: ${device.freeStorage} free of ${device.totalStorage}`; diskCause = 'Accumulated logs, temp files, or large app data'; diskAction = 'Run Disk Cleanup; consider storage expansion' }
    else if (freePct < 20) { diskStatus = 'Warning'; diskSeverity = 'Medium'; diskConf = 82; diskIssue = `Low disk space: ${device.freeStorage} free of ${device.totalStorage}`; diskCause = 'Growing application or user data'; diskAction = 'Schedule cleanup; monitor usage trend' }
  }

  // OS Patch
  let patchStatus: DiagStatus = 'Healthy', patchSeverity: DiagSeverity = 'None', patchConf = 90
  let patchIssue = 'OS is current — all patches applied', patchCause = 'Patch compliance verified', patchAction = 'Continue scheduled patch cycles'
  if (primaryIssue.includes('os') || primaryIssue.includes('patch') || primaryIssue.includes('update') || policyFailed.includes('os') || policyFailed.includes('update')) {
    patchStatus = 'Critical'; patchSeverity = 'High'; patchConf = 95
    patchIssue = `OS not current: ${device.primaryIssue}`
    patchCause = 'Pending updates not applied; device may miss patch windows'
    patchAction = device.managementSource === 'Kandji' ? 'Force OS update via Kandji Enforcement policy' : 'Assign OS update compliance policy in Intune; force check-in'
  } else if (device.complianceState === 'Warning') {
    patchStatus = 'Warning'; patchSeverity = 'Low'; patchConf = 72
    patchIssue = 'OS patch status pending verification'
    patchCause = 'Device has not recently checked in with MDM'
    patchAction = 'Force MDM check-in; verify patch policy assignment'
  }

  // Security
  let secStatus: DiagStatus = 'Healthy', secSeverity: DiagSeverity = 'None', secConf = 88
  let secIssue = 'Security controls properly configured', secCause = 'All security policies applied', secAction = 'Continue scheduled security scans'
  const firewall  = (device.firewallStatus  ?? '').toLowerCase()
  const antivirus = (device.antivirusStatus ?? '').toLowerCase()
  const secBoot   = (device.secureBoot      ?? '').toLowerCase()
  if (firewall.includes('off') || firewall.includes('disabled') || antivirus.includes('off') || antivirus.includes('not detected')) {
    secStatus = 'Critical'; secSeverity = 'Critical'; secConf = 96
    secIssue = 'Critical security control disabled'
    secCause = `Firewall: ${device.firewallStatus ?? 'Unknown'} · AV: ${device.antivirusStatus ?? 'Unknown'}`
    secAction = 'Re-enable firewall and AV immediately; push security policy from MDM'
  } else if (primaryIssue.includes('antivirus') || primaryIssue.includes('firewall') || primaryIssue.includes('security') || policyFailed.includes('security')) {
    secStatus = 'Warning'; secSeverity = 'High'; secConf = 90
    secIssue = `Security policy failed: ${device.primaryIssue}`
    secCause = 'Security configuration drift or policy not applied'
    secAction = 'Remediate via security policy re-push from MDM console'
  } else if (secBoot === 'disabled' || secBoot === 'off') {
    secStatus = 'Warning'; secSeverity = 'Medium'; secConf = 85
    secIssue = 'Secure Boot is disabled'; secCause = 'Boot security not enforced'; secAction = 'Enable Secure Boot in BIOS/UEFI settings'
  }

  // Network
  let netStatus: DiagStatus = 'Healthy', netSeverity: DiagSeverity = 'None', netConf = 80
  let netIssue = 'Device connectivity normal — MDM check-ins current', netCause = 'Recent MDM check-in confirms reachability', netAction = 'No action required'
  const lastCI = new Date(device.lastCheckIn)
  const hoursSince = isNaN(lastCI.getTime()) ? 0 : (Date.now() - lastCI.getTime()) / 3_600_000
  if (primaryIssue.includes('check-in') || primaryIssue.includes('offline') || policyFailed.includes('check-in')) {
    netStatus = 'Critical'; netSeverity = 'High'; netConf = 89
    netIssue = 'Device has missed MDM check-ins'; netCause = 'Device offline, network-blocked, or MDM agent failed'; netAction = 'Verify device is online; restart MDM agent; check firewall rules'
  } else if (hoursSince > 72) {
    netStatus = 'Warning'; netSeverity = 'Medium'; netConf = 78
    netIssue = `No MDM check-in for ${Math.round(hoursSince / 24)} day(s)`; netCause = 'Device powered off or MDM agent issue'; netAction = 'Contact user; push remote MDM sync'
  } else if (hoursSince > 24) {
    netStatus = 'Warning'; netSeverity = 'Low'; netConf = 65
    netIssue = `Last check-in ${Math.round(hoursSince)}h ago`; netCause = 'Possible connectivity interruption'; netAction = 'Monitor for next scheduled check-in'
  }

  // Apps
  let appStatus: DiagStatus = 'Healthy', appSeverity: DiagSeverity = 'None', appConf = 85
  let appIssue = 'All managed apps installed successfully', appCause = 'No deployment failures', appAction = 'Continue scheduled app compliance checks'
  let appDetails: string | undefined
  const failedApps = (device.apps ?? []).filter(a => a.status === 'Failed' || a.status === 'Pending')
  if (failedApps.length > 0 || primaryIssue.includes('app') || policyFailed.includes('app')) {
    appStatus = failedApps.length >= 3 ? 'Critical' : 'Warning'
    appSeverity = failedApps.length >= 3 ? 'High' : 'Medium'; appConf = 83
    appIssue = failedApps.length > 0 ? `${failedApps.length} app(s) failed or pending` : `App issue: ${device.primaryIssue}`
    appCause = failedApps.length > 0 ? `Affected: ${failedApps.map(a => a.name).join(', ')}` : 'App deployment policy not fulfilled'
    appAction = 'Retry from MDM; check Company Portal for errors'
    appDetails = failedApps.map(a => a.name).join(', ') || undefined
  }

  // RAM
  let ramStatus: DiagStatus = 'Unknown', ramSeverity: DiagSeverity = 'None', ramConf = 60
  let ramIssue = 'Memory data not available from MDM', ramCause = 'Real-time RAM metrics require agent reporting', ramAction = 'Deploy monitoring agent or use remote diagnostics tool'
  if (device.totalMemory) {
    const gb = parseFloat(device.totalMemory); ramStatus = 'Healthy'
    if (gb < 4) { ramStatus = 'Critical'; ramSeverity = 'High'; ramConf = 88; ramIssue = `Critical low RAM: ${device.totalMemory}`; ramCause = 'Insufficient memory for enterprise workloads'; ramAction = 'Upgrade RAM or migrate to higher-spec device' }
    else if (gb < 8) { ramStatus = 'Warning'; ramSeverity = 'Medium'; ramConf = 78; ramIssue = `RAM below minimum: ${device.totalMemory}`; ramCause = 'Memory pressure under typical workload'; ramAction = 'Monitor performance; plan hardware refresh' }
    else { ramIssue = `RAM adequate: ${device.totalMemory}`; ramCause = 'Meets recommended requirements'; ramAction = 'No action required'; ramConf = 90 }
  }

  // CPU
  let cpuStatus: DiagStatus, cpuSeverity: DiagSeverity = 'None', cpuConf: number
  let cpuIssue: string, cpuCause: string, cpuAction = 'No action required'
  if (device.processor) {
    cpuStatus = 'Healthy'; cpuConf = 75
    if (/core i3|celeron|pentium|atom/i.test(device.processor)) {
      cpuStatus = 'Warning'; cpuSeverity = 'Low'; cpuConf = 72
      cpuIssue = `Low-performance CPU: ${device.processor}`; cpuCause = 'May not meet OS + managed app requirements'; cpuAction = 'Flag for hardware refresh; monitor user experience'
    } else { cpuIssue = `Processor: ${device.processor}`; cpuCause = 'CPU supports required workloads' }
  } else { cpuStatus = 'Unknown'; cpuConf = 55; cpuIssue = 'CPU info not reported by MDM'; cpuCause = 'Hardware inventory not collected'; cpuAction = 'Enable hardware inventory in MDM policy' }

  // Battery
  let batStatus: DiagStatus = 'Unknown', batSeverity: DiagSeverity = 'None', batConf = 50
  let batIssue = 'Battery health not available from MDM', batCause = 'Battery telemetry requires native OS agent', batAction = 'Use manufacturer diagnostics tool'
  if (device.platform === 'Windows') { batStatus = 'Healthy'; batConf = 62; batIssue = 'Run powercfg /batteryreport for detailed battery health'; batCause = 'Battery health requires Windows powercfg reporting'; batAction = 'Run: powercfg /batteryreport and review wear level' }
  else if (device.platform === 'macOS') { batStatus = 'Healthy'; batConf = 60; batIssue = 'Battery managed by macOS / Kandji'; batCause = 'Visible via Apple System Information'; batAction = 'Apple Menu → About This Mac → System Report → Power' }

  return [
    { id: 'disk',     category: 'Disk & Encryption', icon: HardDrive,  status: diskStatus,  issue: diskIssue,  likelyCause: diskCause,  confidence: diskConf,  severity: diskSeverity,  action: diskAction                   },
    { id: 'os',       category: 'OS Patch Status',    icon: Cpu,        status: patchStatus, issue: patchIssue, likelyCause: patchCause, confidence: patchConf, severity: patchSeverity, action: patchAction                  },
    { id: 'security', category: 'Security Posture',   icon: Shield,     status: secStatus,   issue: secIssue,   likelyCause: secCause,   confidence: secConf,   severity: secSeverity,   action: secAction                    },
    { id: 'network',  category: 'Network & Check-in', icon: Wifi,       status: netStatus,   issue: netIssue,   likelyCause: netCause,   confidence: netConf,   severity: netSeverity,   action: netAction                    },
    { id: 'apps',     category: 'Application Health', icon: Package,    status: appStatus,   issue: appIssue,   likelyCause: appCause,   confidence: appConf,   severity: appSeverity,   action: appAction, details: appDetails },
    { id: 'ram',      category: 'Memory / RAM',        icon: BarChart3,  status: ramStatus,   issue: ramIssue,   likelyCause: ramCause,   confidence: ramConf,   severity: ramSeverity,   action: ramAction                    },
    { id: 'cpu',      category: 'CPU Performance',    icon: Zap,        status: cpuStatus,   issue: cpuIssue,   likelyCause: cpuCause,   confidence: cpuConf,   severity: cpuSeverity,   action: cpuAction                    },
    { id: 'battery',  category: 'Battery Health',     icon: Battery,    status: batStatus,   issue: batIssue,   likelyCause: batCause,   confidence: batConf,   severity: batSeverity,   action: batAction                    },
  ]
}

// ─── Source metadata ────────────────────────────────────────────────────────────

const SOURCE_META: Record<string, { Icon: typeof Server; iconBg: string; iconColor: string; description: string }> = {
  intune:       { Icon: Server,       iconBg: 'bg-orange-100', iconColor: 'text-orange-600',  description: 'Windows & mobile MDM' },
  kandji:       { Icon: Apple,        iconBg: 'bg-slate-100',  iconColor: 'text-slate-700',   description: 'macOS device management' },
  manageengine: { Icon: Settings,     iconBg: 'bg-amber-100',  iconColor: 'text-amber-700',   description: 'On-prem endpoint management' },
  entra:        { Icon: ShieldCheck,  iconBg: 'bg-lime-100',   iconColor: 'text-lime-700',    description: 'Identity & access signals' },
  slack:        { Icon: MessageSquare,iconBg: 'bg-purple-100', iconColor: 'text-purple-600',  description: 'Workspace audit logs' },
  jira:         { Icon: Hash,         iconBg: 'bg-orange-100', iconColor: 'text-orange-600',  description: 'Issue & ticket management' },
  confluence:   { Icon: BookOpen,     iconBg: 'bg-teal-100',   iconColor: 'text-teal-600',    description: 'Knowledge base integration' },
}

// ─── Infrastructure Health Tab ─────────────────────────────────────────────────

function InfrastructureTab() {
  const [integrations, setIntegrations] = useState<IntegrationStatusItem[]>([])
  const [stats, setStats]               = useState<ApiStats | null>(null)
  const [loading, setLoading]           = useState(true)
  const [refreshing, setRefreshing]     = useState(false)
  const [lastRefresh, setLastRefresh]   = useState<Date | null>(null)

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    try {
      const [intData, statsData] = await Promise.allSettled([
        api.fetchIntegrationStatus(),
        api.fetchStats(),
      ])
      if (intData.status === 'fulfilled')   setIntegrations(intData.value)
      if (statsData.status === 'fulfilled') setStats(statsData.value)
      setLastRefresh(new Date())
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const configured = integrations.filter(i => i.configured)
  const healthy    = integrations.filter(i => i.configured && i.healthy !== false)
  const errored    = integrations.filter(i => i.configured && i.healthy === false)

  const overallHealth: DiagStatus = errored.length > 0 ? 'Critical' : configured.length === 0 ? 'Unknown' : 'Healthy'
  const osc = statusCfg(overallHealth)

  return (
    <div className="space-y-5">

      {/* Live status banner */}
      <div className={`flex flex-col sm:flex-row items-start sm:items-center gap-4 rounded-2xl border ${osc.border} ${osc.bg} px-5 py-4`}>
        <div className="flex items-center gap-3">
          <div className={`rounded-xl p-2.5 bg-white/60 border ${osc.border}`}>
            <Radio className={`h-5 w-5 ${osc.color}`} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className={`text-sm font-bold ${osc.color}`}>Infrastructure {overallHealth}</p>
              {loading && <RefreshCw className="h-3.5 w-3.5 animate-spin text-slate-400" />}
            </div>
            <p className="text-[0.68rem] text-slate-500 mt-0.5">
              {configured.length} of {integrations.length} sources configured · {healthy.length} healthy
              {lastRefresh && ` · Updated ${timeSince(lastRefresh.toISOString())}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:ml-auto flex-wrap">
          {errored.length > 0 && <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-[0.65rem] font-bold text-red-700"><XCircle className="h-3 w-3" />{errored.length} Error{errored.length > 1 ? 's' : ''}</span>}
          {healthy.length > 0 && <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[0.65rem] font-bold text-emerald-700"><CheckCircle2 className="h-3 w-3" />{healthy.length} Healthy</span>}
          <button type="button" onClick={() => load(true)}
            className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${refreshing ? 'border-orange-300 bg-orange-50 animate-pulse' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin text-orange-500' : ''}`} />Refresh
          </button>
        </div>
      </div>

      {/* Fleet pulse cards */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Total Devices',    value: stats.total.toLocaleString(),      icon: Layers,       border: 'border-slate-200',   text: 'text-slate-800',    bg: 'bg-slate-100',    ic: 'text-slate-600'    },
            { label: 'Compliant',        value: stats.compliant.toLocaleString(),  icon: ShieldCheck,  border: 'border-emerald-200', text: 'text-emerald-700',  bg: 'bg-emerald-100',  ic: 'text-emerald-600'  },
            { label: 'Non-Compliant',    value: stats.nonCompliant.toLocaleString(),icon: XCircle,     border: 'border-red-200',     text: 'text-red-700',      bg: 'bg-red-100',      ic: 'text-red-600'      },
            { label: 'Warning',          value: stats.warning.toLocaleString(),    icon: AlertTriangle,border: 'border-amber-200',   text: 'text-amber-700',    bg: 'bg-amber-100',    ic: 'text-amber-600'    },
          ].map(c => {
            const Icon = c.icon
            return (
              <div key={c.label} className={`bg-white rounded-2xl border ${c.border} shadow-sm px-4 py-3 flex items-center gap-3`}>
                <div className={`rounded-xl ${c.bg} p-2 flex-shrink-0`}><Icon className={`h-4 w-4 ${c.ic}`} /></div>
                <div><p className={`text-xl font-black ${c.text}`}>{c.value}</p><p className="text-[0.62rem] text-slate-400 font-medium">{c.label}</p></div>
              </div>
            )
          })}
        </div>
      )}

      {/* Integration health cards */}
      <div>
        <p className="text-[0.65rem] font-bold text-slate-400 uppercase tracking-widest mb-3">Connected Source Health</p>
        {loading ? (
          <div className="flex items-center gap-2 justify-center py-12 text-slate-400">
            <RefreshCw className="h-4 w-4 animate-spin" /><span className="text-sm">Loading integration status…</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            {integrations.map(item => {
              const meta = SOURCE_META[item.id] ?? { Icon: Globe, iconBg: 'bg-slate-100', iconColor: 'text-slate-500', description: '' }
              const Icon = meta.Icon
              const isHealthy  = item.configured && item.healthy !== false
              const isError    = item.configured && item.healthy === false
              const isUnconfig = !item.configured
              const statusLabel = isUnconfig ? 'Not configured' : isError ? 'Error' : 'Healthy'
              const cardBorder  = isError ? 'border-red-200' : isHealthy ? 'border-emerald-200' : 'border-slate-200'
              const dotColor    = isError ? 'bg-red-500' : isHealthy ? 'bg-emerald-500' : 'bg-slate-300'
              const badgeCls    = isError ? 'bg-red-50 border-red-200 text-red-700' : isHealthy ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-slate-50 border-slate-200 text-slate-500'

              return (
                <div key={item.id} className={`rounded-2xl border ${cardBorder} bg-white shadow-sm px-4 py-3.5 flex flex-col gap-3`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className={`rounded-xl ${meta.iconBg} p-2 flex-shrink-0`}>
                        <Icon className={`h-4 w-4 ${meta.iconColor}`} />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-800 leading-tight">{item.name}</p>
                        <p className="text-[0.6rem] text-slate-400 leading-tight mt-0.5">{meta.description}</p>
                      </div>
                    </div>
                    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.58rem] font-bold flex-shrink-0 ${badgeCls}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${dotColor} ${isHealthy ? 'animate-pulse' : ''}`} />{statusLabel}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[0.62rem]">
                    <div className="rounded-lg bg-slate-50 border border-slate-100 px-2 py-1.5">
                      <p className="text-slate-400 font-medium">Devices</p>
                      <p className="font-bold text-slate-700 mt-0.5">{item.deviceCount !== null ? item.deviceCount.toLocaleString() : '—'}</p>
                    </div>
                    <div className="rounded-lg bg-slate-50 border border-slate-100 px-2 py-1.5">
                      <p className="text-slate-400 font-medium">Last Sync</p>
                      <p className="font-bold text-slate-700 mt-0.5">{timeSince(item.lastSyncAt)}</p>
                    </div>
                    <div className="rounded-lg bg-slate-50 border border-slate-100 px-2 py-1.5">
                      <p className="text-slate-400 font-medium">Latency</p>
                      <p className={`font-bold mt-0.5 ${item.latencyMs && item.latencyMs > 3000 ? 'text-amber-600' : 'text-slate-700'}`}>{formatLatency(item.latencyMs)}</p>
                    </div>
                    <div className="rounded-lg bg-slate-50 border border-slate-100 px-2 py-1.5">
                      <p className="text-slate-400 font-medium">Status</p>
                      <p className={`font-bold mt-0.5 ${isError ? 'text-red-600' : isHealthy ? 'text-emerald-600' : 'text-slate-400'}`}>{isUnconfig ? 'Inactive' : isError ? 'Degraded' : 'Live'}</p>
                    </div>
                  </div>

                  {item.error && (
                    <div className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-2">
                      <p className="text-[0.6rem] font-semibold text-red-700 uppercase mb-0.5">Error</p>
                      <p className="text-[0.65rem] text-red-600 leading-snug">{item.error}</p>
                    </div>
                  )}
                  {isUnconfig && (
                    <p className="text-[0.62rem] text-slate-400 italic">Configure credentials in Settings to activate</p>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Source comparison table */}
      {!loading && integrations.filter(i => i.configured && i.deviceCount !== null && i.deviceCount > 0).length > 0 && (
        <div>
          <p className="text-[0.65rem] font-bold text-slate-400 uppercase tracking-widest mb-3">MDM Source Comparison</p>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-left">
                  {['Source', 'Status', 'Devices', 'Last Sync', 'Latency', 'Health Score'].map(h => (
                    <th key={h} className="px-4 py-3 text-[0.6rem] font-semibold uppercase tracking-wide text-slate-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {integrations.filter(i => ['intune', 'kandji', 'manageengine'].includes(i.id)).map((item, idx) => {
                  const meta = SOURCE_META[item.id]
                  const Icon = meta?.Icon ?? Globe
                  const healthScore = !item.configured ? 0 : item.healthy === false ? 40 : item.latencyMs && item.latencyMs > 5000 ? 70 : 98
                  const scoreColor  = healthScore >= 90 ? 'text-emerald-600' : healthScore >= 70 ? 'text-amber-600' : 'text-red-600'
                  return (
                    <tr key={item.id} className={`border-b border-slate-100 last:border-0 ${idx % 2 !== 0 ? 'bg-slate-50/40' : ''}`}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className={`rounded-lg p-1.5 ${meta?.iconBg ?? 'bg-slate-100'}`}><Icon className={`h-3.5 w-3.5 ${meta?.iconColor ?? 'text-slate-500'}`} /></div>
                          <span className="font-semibold text-slate-700">{item.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.6rem] font-bold ${item.configured && item.healthy !== false ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : item.configured ? 'bg-red-50 border-red-200 text-red-700' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${item.configured && item.healthy !== false ? 'bg-emerald-500' : item.configured ? 'bg-red-500' : 'bg-slate-300'}`} />
                          {item.configured ? (item.healthy !== false ? 'Live' : 'Error') : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-700">{item.deviceCount !== null ? item.deviceCount.toLocaleString() : '—'}</td>
                      <td className="px-4 py-3 text-slate-500">{timeSince(item.lastSyncAt)}</td>
                      <td className="px-4 py-3 text-slate-500">{formatLatency(item.latencyMs)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 rounded-full bg-slate-100 max-w-[60px]">
                            <div className={`h-1.5 rounded-full ${healthScore >= 90 ? 'bg-emerald-500' : healthScore >= 70 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${healthScore}%` }} />
                          </div>
                          <span className={`text-xs font-bold ${scoreColor}`}>{healthScore}%</span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* System alerts */}
      {errored.length > 0 && (
        <div>
          <p className="text-[0.65rem] font-bold text-slate-400 uppercase tracking-widest mb-3">Active Alerts</p>
          <div className="space-y-2">
            {errored.map(item => (
              <div key={item.id} className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-bold text-red-800">{item.name} — Integration Error</p>
                  <p className="text-[0.68rem] text-red-600 mt-0.5">{item.error ?? 'Unknown error — check credentials in Settings'}</p>
                </div>
                <span className="ml-auto text-[0.6rem] text-red-400 flex-shrink-0">{timeSince(item.lastSyncAt)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  )
}

// ─── Column definitions ────────────────────────────────────────────────────────

const DIAG_COLS = [
  { key: 'category',   label: 'Category',   min:  80, default: 160 },
  { key: 'status',     label: 'Status',     min:  70, default:  90 },
  { key: 'issues',     label: 'Issues',     min: 100, default: 220 },
  { key: 'severity',   label: 'Severity',   min:  70, default:  90 },
  { key: 'confidence', label: 'Confidence', min:  70, default:  90 },
] as const
type DiagColKey = typeof DIAG_COLS[number]['key']

const FLEET_HEAT_COLS = [
  { key: 'category',     label: 'Category',     min:  80, default: 160 },
  { key: 'distribution', label: 'Distribution', min: 100, default: 200 },
  { key: 'critical',     label: 'Critical',     min:  60, default:  80 },
  { key: 'warning',      label: 'Warning',      min:  60, default:  80 },
  { key: 'healthy',      label: 'Healthy',      min:  60, default:  80 },
  { key: 'risk',         label: 'Risk',         min:  60, default:  80 },
] as const
type FHeatColKey = typeof FLEET_HEAT_COLS[number]['key']

const FLEET_DEVICES_COLS = [
  { key: 'device',     label: 'Device',     min:  80, default: 160 },
  { key: 'user',       label: 'User',       min:  80, default: 120 },
  { key: 'platform',   label: 'Platform',   min:  60, default:  90 },
  { key: 'source',     label: 'Source',     min:  70, default: 110 },
  { key: 'compliance', label: 'Compliance', min:  70, default:  90 },
  { key: 'issues',     label: 'Issues Found', min: 80, default: 120 },
] as const
type FDevColKey = typeof FLEET_DEVICES_COLS[number]['key']

// ─── Device Diagnostics Tab ────────────────────────────────────────────────────

function DeviceDiagnosticsTab() {
  const [allDevices, setAllDevices] = useState<ApiDevice[]>([])
  const [loading, setLoading]       = useState(true)
  const [query, setQuery]           = useState('')
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [selectedDevice, setSelectedDevice] = useState<ApiDevice | null>(null)
  const [running, setRunning]       = useState(false)
  const [results, setResults]       = useState<DiagResult[] | null>(null)
  const [statusFilter, setStatusFilter] = useState<DiagStatus | 'All'>('All')
  const [copied, setCopied]         = useState(false)
  const [recentDevices, setRecentDevices] = useState<ApiDevice[]>([])
  const dropRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    api.fetchAllDevicesRaw({ limit: 500 })
      .then(({ devices }) => setAllDevices(devices))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setDropdownOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return allDevices.slice(0, 8)
    return allDevices.filter(d => d.deviceName.toLowerCase().includes(q) || d.user.toLowerCase().includes(q) || d.serialNumber.toLowerCase().includes(q)).slice(0, 10)
  }, [allDevices, query])

  const handleSelect = (device: ApiDevice) => {
    setSelectedDevice(device); setQuery(device.deviceName); setDropdownOpen(false); setResults(null)
  }

  const handleRun = async () => {
    if (!selectedDevice) return
    setRunning(true); setResults(null)
    await new Promise(r => setTimeout(r, 1400))
    const res = runDiagnostics(selectedDevice)
    setResults(res); setRunning(false)
    setRecentDevices(prev => [selectedDevice, ...prev.filter(d => d.id !== selectedDevice.id)].slice(0, 5))
  }

  const visibleResults = useMemo(() => {
    if (!results) return []
    return statusFilter === 'All' ? results : results.filter(r => r.status === statusFilter)
  }, [results, statusFilter])

  const handleCopyReport = () => {
    if (!results || !selectedDevice) return
    const lines = [
      `DEVICE DIAGNOSTIC REPORT`,
      `========================`,
      `Device:    ${selectedDevice.deviceName}`,
      `User:      ${selectedDevice.user}`,
      `Serial:    ${selectedDevice.serialNumber}`,
      `Platform:  ${selectedDevice.platform} ${selectedDevice.osVersion}`,
      `Source:    ${selectedDevice.managementSource}`,
      `Generated: ${new Date().toLocaleString()}`,
      ``,
      ...results.map(r => [`[${r.status.toUpperCase()}] ${r.category}`, `  Issue:  ${r.issue}`, `  Cause:  ${r.likelyCause}`, `  Action: ${r.action}`, ``].join('\n')),
    ].join('\n')
    navigator.clipboard.writeText(lines).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
  }

  const { widths: diagW, startResize: diagResize, totalWidth: diagTotal } = useColumnResize<DiagColKey>(DIAG_COLS, 'diag-device')

  const counts = results ? {
    Critical: results.filter(r => r.status === 'Critical').length,
    Warning:  results.filter(r => r.status === 'Warning').length,
    Healthy:  results.filter(r => r.status === 'Healthy').length,
    Unknown:  results.filter(r => r.status === 'Unknown').length,
  } : null

  const overall: DiagStatus = !counts ? 'Unknown' : counts.Critical > 0 ? 'Critical' : counts.Warning > 0 ? 'Warning' : 'Healthy'

  return (
    <div className="space-y-5">

      {/* Device selector */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm px-5 py-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-slate-800">Target Device</p>
            <p className="text-[0.68rem] text-slate-400 mt-0.5">Search any managed device across all connected MDM sources</p>
          </div>
          {selectedDevice && !running && results && (
            <div className="flex items-center gap-2">
              <button type="button" onClick={handleCopyReport}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition shadow-sm">
                {copied ? <><Check className="h-3.5 w-3.5 text-emerald-500" />Copied!</> : <><Copy className="h-3.5 w-3.5" />Copy Report</>}
              </button>
              <button type="button" onClick={handleRun}
                className="inline-flex items-center gap-1.5 rounded-xl bg-orange-600 hover:bg-orange-700 px-3 py-1.5 text-xs font-semibold text-white transition shadow-sm">
                <RefreshCw className="h-3.5 w-3.5" />Re-run
              </button>
            </div>
          )}
        </div>

        <div ref={dropRef} className="relative flex gap-3 flex-col sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              placeholder={loading ? 'Loading devices…' : 'Search by device name, user, or serial number…'}
              value={query}
              onChange={e => { setQuery(e.target.value); setDropdownOpen(true); setSelectedDevice(null); setResults(null) }}
              onFocus={() => setDropdownOpen(true)}
              disabled={loading}
              className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-8 text-xs text-slate-800 placeholder:text-slate-400 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-400/20 disabled:opacity-60"
            />
            {query && (
              <button type="button" onClick={() => { setQuery(''); setSelectedDevice(null); setResults(null) }} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
            {dropdownOpen && filtered.length > 0 && !selectedDevice && (
              <div className="absolute left-0 right-0 top-full mt-1 z-20 rounded-xl border border-slate-200 bg-white shadow-lg divide-y divide-slate-100 overflow-hidden max-h-64 overflow-y-auto">
                {!query.trim() && <div className="px-3 py-2 bg-slate-50 border-b border-slate-100"><p className="text-[0.6rem] font-semibold text-slate-400 uppercase tracking-wide">Recent / All Devices</p></div>}
                {filtered.map(d => (
                  <button key={d.id} type="button" onClick={() => handleSelect(d)} className="flex items-center gap-3 w-full px-3 py-2.5 hover:bg-orange-50 transition text-left">
                    <div className={`rounded-lg p-1.5 flex-shrink-0 ${d.platform === 'macOS' ? 'bg-slate-100' : d.platform === 'Windows' ? 'bg-orange-100' : 'bg-lime-100'}`}>
                      {d.platform === 'macOS' ? <Apple className="h-3.5 w-3.5 text-slate-600" /> : <Monitor className="h-3.5 w-3.5 text-orange-600" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-slate-800 truncate">{d.deviceName}</p>
                      <p className="text-[0.62rem] text-slate-400 truncate">{d.user} · {d.platform} · {d.managementSource}</p>
                    </div>
                    <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[0.58rem] font-bold border ${d.complianceState === 'Compliant' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : d.complianceState === 'Warning' ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
                      {d.complianceState}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <button type="button" onClick={handleRun} disabled={!selectedDevice || running}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-600 hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed px-5 py-2 text-sm font-semibold text-white transition whitespace-nowrap shadow-sm">
            {running ? <><RefreshCw className="h-4 w-4 animate-spin" />Running…</> : <><Activity className="h-4 w-4" />Run Diagnostics</>}
          </button>
        </div>

        {/* Selected device strip */}
        {selectedDevice && !running && (
          <div className="flex items-center gap-3 rounded-xl border border-orange-200 bg-orange-50 px-4 py-2.5 flex-wrap">
            <div className={`rounded-lg p-1.5 flex-shrink-0 ${selectedDevice.platform === 'macOS' ? 'bg-slate-200' : 'bg-orange-200'}`}>
              {selectedDevice.platform === 'macOS' ? <Apple className="h-3.5 w-3.5 text-slate-700" /> : <Monitor className="h-3.5 w-3.5 text-orange-700" />}
            </div>
            <div>
              <p className="text-xs font-bold text-slate-800">{selectedDevice.deviceName}</p>
              <p className="text-[0.62rem] text-slate-500">{selectedDevice.user} · {selectedDevice.serialNumber}</p>
            </div>
            <div className="flex items-center gap-3 ml-auto flex-wrap text-[0.62rem] text-slate-500">
              <span>{selectedDevice.platform} {selectedDevice.osVersion}</span>
              <span className="hidden sm:inline">·</span>
              <span className="hidden sm:inline">{selectedDevice.managementSource}</span>
              <span>·</span>
              <span className={`font-semibold ${selectedDevice.complianceState === 'Compliant' ? 'text-emerald-600' : selectedDevice.complianceState === 'Warning' ? 'text-amber-600' : 'text-red-600'}`}>{selectedDevice.complianceState}</span>
            </div>
          </div>
        )}

        {/* Recent devices */}
        {recentDevices.length > 0 && !selectedDevice && (
          <div>
            <p className="text-[0.6rem] font-semibold text-slate-400 uppercase tracking-wide mb-2">Recently Diagnosed</p>
            <div className="flex flex-wrap gap-1.5">
              {recentDevices.map(d => (
                <button key={d.id} type="button" onClick={() => handleSelect(d)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[0.65rem] font-medium text-slate-600 hover:bg-orange-50 hover:border-orange-200 transition">
                  <Clock className="h-2.5 w-2.5 text-slate-400" />{d.deviceName}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Running animation */}
      {running && (
        <div className="rounded-2xl border border-orange-200 bg-gradient-to-br from-orange-50 to-amber-50 px-5 py-10 flex flex-col items-center gap-4">
          <div className="relative">
            <div className="h-14 w-14 rounded-full border-4 border-orange-100 border-t-orange-500 animate-spin" />
            <Activity className="absolute inset-0 m-auto h-6 w-6 text-orange-600" />
          </div>
          <div className="text-center">
            <p className="text-sm font-bold text-orange-800">Analyzing {selectedDevice?.deviceName}…</p>
            <p className="text-xs text-orange-500 mt-1">Running 8 diagnostic categories</p>
          </div>
          <div className="flex flex-wrap justify-center gap-2 max-w-sm">
            {['Disk & Encryption', 'OS Patches', 'Security', 'Network', 'Apps', 'RAM', 'CPU', 'Battery'].map((c, i) => (
              <span key={c} className="inline-flex items-center gap-1 rounded-full bg-white/70 border border-orange-200 px-2.5 py-1 text-[0.6rem] font-semibold text-orange-700 animate-pulse" style={{ animationDelay: `${i * 150}ms` }}>
                <span className="h-1 w-1 rounded-full bg-orange-400" />{c}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Results */}
      {results && !running && counts && (
        <div className="space-y-4">

          {/* Overall summary */}
          <div className={`rounded-2xl border ${statusCfg(overall).border} ${statusCfg(overall).bg} px-5 py-4 flex flex-col sm:flex-row items-start sm:items-center gap-4`}>
            <div className="flex items-center gap-3">
              <div className={`rounded-xl p-2.5 bg-white/60 border ${statusCfg(overall).border}`}>
                <Activity className={`h-5 w-5 ${statusCfg(overall).color}`} />
              </div>
              <div>
                <p className={`text-sm font-bold ${statusCfg(overall).color}`}>Overall Health: {overall}</p>
                <p className="text-[0.68rem] text-slate-500 mt-0.5">{results.length} categories analyzed · {selectedDevice?.deviceName}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 sm:ml-auto flex-wrap">
              {counts.Critical > 0 && <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-[0.65rem] font-bold text-red-700">{counts.Critical} Critical</span>}
              {counts.Warning  > 0 && <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[0.65rem] font-bold text-amber-700">{counts.Warning} Warning</span>}
              {counts.Healthy  > 0 && <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[0.65rem] font-bold text-emerald-700">{counts.Healthy} Healthy</span>}
            </div>
          </div>

          {/* Device metadata strip */}
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm px-5 py-3">
            <div className="flex items-center gap-5 flex-wrap text-[0.68rem] text-slate-600">
              {[
                { icon: Clock,    label: 'Last Check-in', value: selectedDevice?.lastCheckIn ?? '—' },
                { icon: Shield,   label: 'Compliance',    value: selectedDevice?.complianceState ?? '—' },
                { icon: HardDrive,label: 'Storage',       value: selectedDevice?.freeStorage && selectedDevice?.totalStorage ? `${selectedDevice.freeStorage} / ${selectedDevice.totalStorage}` : '—' },
                { icon: BarChart3, label: 'RAM',          value: selectedDevice?.totalMemory ?? '—' },
                { icon: Zap,      label: 'CPU',           value: selectedDevice?.processor ?? '—' },
                { icon: Wifi,     label: 'IP',            value: selectedDevice?.ipAddress ?? '—' },
              ].map(({ icon: Icon, label, value }) => (
                <div key={label} className="flex items-center gap-1.5">
                  <Icon className="h-3 w-3 text-slate-400 flex-shrink-0" />
                  <span className="text-slate-400">{label}:</span>
                  <span className={`font-semibold text-slate-800 truncate max-w-[160px] ${label === 'Compliance' ? (value === 'Compliant' ? 'text-emerald-600' : value === 'Warning' ? 'text-amber-600' : 'text-red-600') : ''}`}>{value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Status filter */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[0.65rem] font-semibold text-slate-400 uppercase tracking-wide mr-1">Filter:</span>
            {(['All', 'Critical', 'Warning', 'Healthy', 'Unknown'] as const).map(f => {
              const active = statusFilter === f
              const n = f === 'All' ? results.length : counts[f as keyof typeof counts] ?? 0
              const activeCls = f === 'Critical' ? 'bg-red-600 border-red-600 text-white' : f === 'Warning' ? 'bg-amber-500 border-amber-500 text-white' : f === 'Healthy' ? 'bg-emerald-600 border-emerald-600 text-white' : f === 'Unknown' ? 'bg-slate-500 border-slate-500 text-white' : 'bg-orange-600 border-orange-600 text-white'
              return (
                <button key={f} type="button" onClick={() => setStatusFilter(f)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.65rem] font-semibold transition ${active ? activeCls : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                  {f}<span className={`rounded-full px-1.5 py-px text-[0.58rem] font-bold ${active ? 'bg-white/20' : 'bg-slate-100 text-slate-500'}`}>{n}</span>
                </button>
              )
            })}
          </div>

          {/* Diagnostic table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="text-left border-collapse" style={{ tableLayout: 'fixed', width: diagTotal }}>
                <colgroup>
                  {DIAG_COLS.map(col => (
                    <col key={col.key} style={{ width: diagW[col.key] }} />
                  ))}
                </colgroup>
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-3 py-2.5 text-[0.6rem] font-semibold text-slate-400 uppercase tracking-wide relative overflow-hidden" style={{ width: diagW['category'] }}>
                      Category
                      <span
                        className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-orange-400/50 active:bg-orange-500 transition-colors"
                        onMouseDown={e => diagResize('category', e)}
                        onClick={e => e.stopPropagation()}
                      />
                    </th>
                    <th className="px-3 py-2.5 text-[0.6rem] font-semibold text-slate-400 uppercase tracking-wide relative overflow-hidden" style={{ width: diagW['status'] }}>
                      Status
                      <span
                        className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-orange-400/50 active:bg-orange-500 transition-colors"
                        onMouseDown={e => diagResize('status', e)}
                        onClick={e => e.stopPropagation()}
                      />
                    </th>
                    <th className="px-3 py-2.5 text-[0.6rem] font-semibold text-slate-400 uppercase tracking-wide relative overflow-hidden" style={{ width: diagW['issues'] }}>
                      Issues
                      <span
                        className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-orange-400/50 active:bg-orange-500 transition-colors"
                        onMouseDown={e => diagResize('issues', e)}
                        onClick={e => e.stopPropagation()}
                      />
                    </th>
                    <th className="px-3 py-2.5 text-[0.6rem] font-semibold text-slate-400 uppercase tracking-wide relative overflow-hidden" style={{ width: diagW['severity'] }}>
                      Severity
                      <span
                        className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-orange-400/50 active:bg-orange-500 transition-colors"
                        onMouseDown={e => diagResize('severity', e)}
                        onClick={e => e.stopPropagation()}
                      />
                    </th>
                    <th className="px-3 py-2.5 text-[0.6rem] font-semibold text-slate-400 uppercase tracking-wide relative overflow-hidden" style={{ width: diagW['confidence'] }}>
                      Confidence
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visibleResults.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-12 text-center">
                        <div className="flex flex-col items-center gap-2">
                          <CheckCircle2 className="h-8 w-8 text-slate-300" />
                          <p className="text-sm text-slate-500">No diagnostics match this filter</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    visibleResults.map((r, i) => {
                      const sc = statusCfg(r.status)
                      const CategoryIcon = r.icon
                      return (
                        <tr key={r.id} className={`transition-colors hover:bg-slate-50/70 ${i % 2 !== 0 ? 'bg-slate-50/30' : ''}`}>
                          <td className="px-3 py-3">
                            <div className="flex items-center gap-2">
                              <div className={`rounded-lg p-1.5 ${sc.bg} border ${sc.border} flex-shrink-0`}>
                                <CategoryIcon className={`h-3.5 w-3.5 ${sc.color}`} />
                              </div>
                              <span className="text-xs font-semibold text-slate-700 truncate">{r.category}</span>
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.6rem] font-bold ${sc.bg} ${sc.border} ${sc.color}`}>
                              <span className={`h-1.5 w-1.5 rounded-full ${sc.dot}`} />{r.status}
                            </span>
                          </td>
                          <td className="px-3 py-3">
                            <p className="text-xs text-slate-600 truncate" title={r.issue}>{r.issue}</p>
                          </td>
                          <td className="px-3 py-3">
                            {r.severity !== 'None' ? (
                              <span className={`rounded-full border px-2 py-0.5 text-[0.6rem] font-semibold ${severityColor(r.severity)}`}>{r.severity}</span>
                            ) : (
                              <span className="text-[0.65rem] text-slate-300">—</span>
                            )}
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-1.5 rounded-full bg-slate-100 max-w-[48px]">
                                <div className={`h-1.5 rounded-full ${confidenceBar(r.confidence)}`} style={{ width: `${r.confidence}%` }} />
                              </div>
                              <span className="text-[0.65rem] font-bold text-slate-600">{r.confidence}%</span>
                            </div>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!results && !running && (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 flex flex-col items-center justify-center py-16 text-center px-6">
          <div className="rounded-2xl bg-white border border-slate-200 p-4 mb-4 shadow-sm">
            <Activity className="h-8 w-8 text-slate-300" />
          </div>
          <p className="text-sm font-semibold text-slate-600">Select a device and run diagnostics</p>
          <p className="text-xs text-slate-400 mt-1 max-w-xs leading-relaxed">
            8 health checks: Disk & Encryption · OS Patches · Security Posture · Network · Application Health · Memory · CPU · Battery
          </p>
        </div>
      )}
    </div>
  )
}

// ─── Fleet Health Scan Tab ─────────────────────────────────────────────────────

type ScanResult = { device: ApiDevice; results: DiagResult[] }

function CategoryDetailPanel({ category, allResults, onClose }: {
  category: string
  allResults: ScanResult[]
  onClose: () => void
}) {
  const rows = allResults
    .map(({ device, results }) => ({ device, diag: results.find(r => r.category === category) }))
    .filter((x): x is { device: ApiDevice; diag: DiagResult } => !!x.diag)
    .sort((a, b) => {
      const order = { Critical: 0, Warning: 1, Unknown: 2, Healthy: 3 }
      return (order[a.diag.status] ?? 3) - (order[b.diag.status] ?? 3)
    })

  const Icon = rows[0]?.diag?.icon ?? HardDrive

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 bg-slate-50 border-b border-slate-200">
        <div className="flex items-center gap-2.5">
          <div className="rounded-lg bg-white border border-slate-200 p-1.5 shadow-sm">
            <Icon className="h-4 w-4 text-slate-600" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-800">{category}</p>
            <p className="text-[0.62rem] text-slate-400">{rows.length} device{rows.length !== 1 ? 's' : ''} scanned</p>
          </div>
        </div>
        <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="divide-y divide-slate-100 max-h-[420px] overflow-y-auto">
        {rows.map(({ device: d, diag }) => {
          const sc = statusCfg(diag.status)
          const StatusIcon = sc.icon
          return (
            <div key={d.id} className={`px-5 py-3.5 ${diag.status === 'Healthy' ? '' : sc.bg + '/30'}`}>
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 mt-0.5">
                  {d.platform === 'macOS' ? <Apple className="h-4 w-4 text-slate-400" /> : <Monitor className="h-4 w-4 text-slate-400" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-0.5">
                    <span className="text-xs font-semibold text-slate-800 truncate">{d.deviceName}</span>
                    <span className="text-[0.62rem] text-slate-400 truncate">{d.user}</span>
                    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.58rem] font-bold ${sc.bg} ${sc.border} ${sc.color}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${sc.dot}`} />{diag.status}
                    </span>
                    {diag.severity !== 'None' && (
                      <span className={`rounded-full border px-2 py-0.5 text-[0.58rem] font-semibold ${severityColor(diag.severity)}`}>{diag.severity}</span>
                    )}
                  </div>
                  <p className="text-[0.68rem] text-slate-600 leading-snug">{diag.issue}</p>
                  {diag.status !== 'Healthy' && (
                    <div className="mt-1.5 grid grid-cols-1 sm:grid-cols-2 gap-1">
                      <div className="rounded-lg bg-white border border-slate-100 px-2.5 py-1.5">
                        <p className="text-[0.55rem] font-semibold uppercase tracking-wide text-slate-400 mb-0.5">Likely Cause</p>
                        <p className="text-[0.65rem] text-slate-600 leading-snug">{diag.likelyCause}</p>
                      </div>
                      <div className="rounded-lg bg-orange-50 border border-orange-100 px-2.5 py-1.5">
                        <p className="text-[0.55rem] font-semibold uppercase tracking-wide text-orange-500 mb-0.5">Action</p>
                        <p className="text-[0.65rem] text-slate-700 font-medium leading-snug">{diag.action}</p>
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex-shrink-0">
                  <StatusIcon className={`h-4 w-4 ${sc.color}`} />
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function DeviceDetailPanel({ entry, onClose }: { entry: ScanResult; onClose: () => void }) {
  const { device: d, results } = entry
  const sorted = [...results].sort((a, b) => {
    const order = { Critical: 0, Warning: 1, Unknown: 2, Healthy: 3 }
    return (order[a.status] ?? 3) - (order[b.status] ?? 3)
  })

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 bg-slate-50 border-b border-slate-200">
        <div className="flex items-center gap-2.5">
          <div className="rounded-lg bg-white border border-slate-200 p-1.5 shadow-sm">
            {d.platform === 'macOS' ? <Apple className="h-4 w-4 text-slate-600" /> : <Monitor className="h-4 w-4 text-slate-600" />}
          </div>
          <div>
            <p className="text-sm font-bold text-slate-800">{d.deviceName}</p>
            <p className="text-[0.62rem] text-slate-400">{d.user} · {d.platform} · {d.managementSource}</p>
          </div>
        </div>
        <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-0 divide-y sm:divide-y-0 divide-slate-100">
        {sorted.map(diag => {
          const sc = statusCfg(diag.status)
          const CatIcon = diag.icon
          const StatusIcon = sc.icon
          return (
            <div key={diag.id} className={`px-4 py-3.5 border-b border-slate-100 last:border-b-0 ${diag.status !== 'Healthy' ? sc.bg + '/20' : ''}`}>
              <div className="flex items-start gap-2.5">
                <div className={`rounded-lg p-1.5 flex-shrink-0 ${sc.bg} border ${sc.border}`}>
                  <CatIcon className={`h-3.5 w-3.5 ${sc.color}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                    <span className="text-[0.7rem] font-bold text-slate-800">{diag.category}</span>
                    <StatusIcon className={`h-3 w-3 ${sc.color}`} />
                    <span className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[0.55rem] font-bold ${sc.bg} ${sc.border} ${sc.color}`}>
                      {diag.status}
                    </span>
                  </div>
                  <p className="text-[0.65rem] text-slate-600 leading-snug">{diag.issue}</p>
                  {diag.status !== 'Healthy' && (
                    <div className="mt-1.5 space-y-1">
                      <div className="flex items-start gap-1.5">
                        <Info className="h-3 w-3 flex-shrink-0 mt-0.5 text-slate-400" />
                        <p className="text-[0.62rem] text-slate-500 leading-snug">{diag.likelyCause}</p>
                      </div>
                      <div className="flex items-start gap-1.5">
                        <CheckCircle2 className="h-3 w-3 flex-shrink-0 mt-0.5 text-orange-500" />
                        <p className="text-[0.62rem] font-semibold text-slate-700 leading-snug">{diag.action}</p>
                      </div>
                      {diag.details && (
                        <p className="text-[0.6rem] text-amber-700 font-medium bg-amber-50 rounded px-2 py-1 border border-amber-100">{diag.details}</p>
                      )}
                    </div>
                  )}
                  <div className="mt-1.5 flex items-center gap-1">
                    <div className="h-1 w-12 rounded-full bg-slate-100 overflow-hidden">
                      <div className={`h-full rounded-full ${confidenceBar(diag.confidence)}`} style={{ width: `${diag.confidence}%` }} />
                    </div>
                    <span className="text-[0.55rem] text-slate-400">{diag.confidence}% confidence</span>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function FleetScanTab() {
  const [devices, setDevices]         = useState<ApiDevice[]>([])
  const [scanning, setScanning]       = useState(false)
  const [scanned, setScanned]         = useState(false)
  const [progress, setProgress]       = useState(0)
  const [categoryData, setCategoryData]   = useState<FleetCategorySummary[]>([])
  const [criticalDevices, setCriticalDevices] = useState<{ device: ApiDevice; critCount: number }[]>([])
  const [allResults, setAllResults]   = useState<ScanResult[]>([])
  const [loading, setLoading]         = useState(true)

  // Interactive selection state
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null)
  const [expandedDevice, setExpandedDevice]     = useState<string | null>(null)

  useEffect(() => {
    api.fetchAllDevicesRaw({ limit: 200 })
      .then(({ devices: d }) => setDevices(d))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const handleScan = async () => {
    if (devices.length === 0) return
    setScanning(true); setScanned(false); setProgress(0)
    setCategoryData([]); setCriticalDevices([]); setAllResults([])
    setExpandedCategory(null); setExpandedDevice(null)

    const sample = devices.slice(0, Math.min(devices.length, 50))
    const scanResults: ScanResult[] = []

    for (let i = 0; i < sample.length; i++) {
      await new Promise(r => setTimeout(r, 30))
      scanResults.push({ device: sample[i], results: runDiagnostics(sample[i]) })
      setProgress(Math.round(((i + 1) / sample.length) * 100))
    }

    setAllResults(scanResults)

    // Aggregate by category
    const cats: Record<string, FleetCategorySummary> = {}
    for (const { results } of scanResults) {
      for (const r of results) {
        if (!cats[r.category]) cats[r.category] = { category: r.category, icon: r.icon, critical: 0, warning: 0, healthy: 0, unknown: 0, total: 0 }
        cats[r.category][r.status.toLowerCase() as 'critical' | 'warning' | 'healthy' | 'unknown']++
        cats[r.category].total++
      }
    }
    setCategoryData(Object.values(cats).sort((a, b) => (b.critical + b.warning) - (a.critical + a.warning)))

    // Top devices with issues
    const critical = scanResults
      .map(({ device, results }) => ({ device, critCount: results.filter(r => r.status === 'Critical' || r.status === 'Warning').length }))
      .filter(d => d.critCount > 0)
      .sort((a, b) => b.critCount - a.critCount)
      .slice(0, 10)
    setCriticalDevices(critical)

    setScanning(false); setScanned(true)
  }

  const { widths: heatW, startResize: heatResize, totalWidth: heatTotal } = useColumnResize<FHeatColKey>(FLEET_HEAT_COLS, 'fleet-heat')
  const { widths: fdevW, startResize: fdevResize, totalWidth: fdevTotal } = useColumnResize<FDevColKey>(FLEET_DEVICES_COLS, 'fleet-devices')

  const totalScanned = Math.round((progress / 100) * Math.min(devices.length, 50))
  const fleetCritical = categoryData.reduce((s, c) => s + c.critical, 0)
  const fleetWarning  = categoryData.reduce((s, c) => s + c.warning, 0)
  const fleetHealthy  = categoryData.reduce((s, c) => s + c.healthy, 0)

  return (
    <div className="space-y-5">

      {/* Scan launcher */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm px-5 py-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div>
            <p className="text-sm font-bold text-slate-800">Fleet Health Scan</p>
            <p className="text-[0.68rem] text-slate-400 mt-0.5">
              {loading ? 'Loading device inventory…' : `${devices.length} devices available — scans up to 50 across all MDM sources`}
            </p>
          </div>
          <button type="button" onClick={handleScan} disabled={scanning || loading || devices.length === 0}
            className={`sm:ml-auto inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition shadow-sm disabled:opacity-50 disabled:cursor-not-allowed ${scanning ? 'bg-orange-500 animate-pulse' : 'bg-orange-600 hover:bg-orange-700'}`}>
            {scanning ? <><RefreshCw className="h-4 w-4 animate-spin" />Scanning…</> : scanned ? <><RefreshCw className="h-4 w-4" />Re-scan Fleet</> : <><Globe className="h-4 w-4" />Start Fleet Scan</>}
          </button>
        </div>

        {/* Progress bar */}
        {scanning && (
          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between text-[0.65rem] text-slate-500">
              <span>Analyzing {totalScanned} of {Math.min(devices.length, 50)} devices…</span>
              <span className="font-bold text-orange-600">{progress}%</span>
            </div>
            <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
              <div className="h-2 rounded-full bg-orange-500 transition-all duration-300 animate-pulse" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}
      </div>

      {/* Scan results */}
      {scanned && !scanning && (
        <div className="space-y-5">

          {/* Summary stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white rounded-2xl border border-red-200 shadow-sm px-4 py-3 flex items-center gap-3">
              <div className="rounded-xl bg-red-100 p-2"><XCircle className="h-4 w-4 text-red-600" /></div>
              <div><p className="text-xl font-black text-red-600">{fleetCritical}</p><p className="text-[0.62rem] text-slate-400 font-medium">Critical Findings</p></div>
            </div>
            <div className="bg-white rounded-2xl border border-amber-200 shadow-sm px-4 py-3 flex items-center gap-3">
              <div className="rounded-xl bg-amber-100 p-2"><AlertTriangle className="h-4 w-4 text-amber-600" /></div>
              <div><p className="text-xl font-black text-amber-600">{fleetWarning}</p><p className="text-[0.62rem] text-slate-400 font-medium">Warnings</p></div>
            </div>
            <div className="bg-white rounded-2xl border border-emerald-200 shadow-sm px-4 py-3 flex items-center gap-3">
              <div className="rounded-xl bg-emerald-100 p-2"><CheckCircle2 className="h-4 w-4 text-emerald-600" /></div>
              <div><p className="text-xl font-black text-emerald-600">{fleetHealthy}</p><p className="text-[0.62rem] text-slate-400 font-medium">Healthy Checks</p></div>
            </div>
          </div>

          {/* Category heat map */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <p className="text-[0.65rem] font-bold text-slate-400 uppercase tracking-widest">Issue Heat Map by Category</p>
              <span className="text-[0.6rem] text-slate-400 italic">Click any row to see per-device breakdown</span>
            </div>
            <div className="space-y-2">
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="text-left border-collapse" style={{ tableLayout: 'fixed', width: heatTotal }}>
                    <colgroup>
                      {FLEET_HEAT_COLS.map(col => (
                        <col key={col.key} style={{ width: heatW[col.key] }} />
                      ))}
                    </colgroup>
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-left">
                        <th className="px-4 py-3 text-[0.6rem] font-semibold uppercase tracking-wide text-slate-400 relative overflow-hidden" style={{ width: heatW['category'] }}>
                          Category
                          <span className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-orange-400/50 active:bg-orange-500 transition-colors" onMouseDown={e => heatResize('category', e)} onClick={e => e.stopPropagation()} />
                        </th>
                        <th className="px-4 py-3 text-[0.6rem] font-semibold uppercase tracking-wide text-slate-400 relative overflow-hidden" style={{ width: heatW['distribution'] }}>
                          Distribution
                          <span className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-orange-400/50 active:bg-orange-500 transition-colors" onMouseDown={e => heatResize('distribution', e)} onClick={e => e.stopPropagation()} />
                        </th>
                        <th className="px-4 py-3 text-[0.6rem] font-semibold uppercase tracking-wide text-slate-400 text-center relative overflow-hidden" style={{ width: heatW['critical'] }}>
                          Critical
                          <span className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-orange-400/50 active:bg-orange-500 transition-colors" onMouseDown={e => heatResize('critical', e)} onClick={e => e.stopPropagation()} />
                        </th>
                        <th className="px-4 py-3 text-[0.6rem] font-semibold uppercase tracking-wide text-slate-400 text-center relative overflow-hidden" style={{ width: heatW['warning'] }}>
                          Warning
                          <span className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-orange-400/50 active:bg-orange-500 transition-colors" onMouseDown={e => heatResize('warning', e)} onClick={e => e.stopPropagation()} />
                        </th>
                        <th className="px-4 py-3 text-[0.6rem] font-semibold uppercase tracking-wide text-slate-400 text-center relative overflow-hidden" style={{ width: heatW['healthy'] }}>
                          Healthy
                          <span className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-orange-400/50 active:bg-orange-500 transition-colors" onMouseDown={e => heatResize('healthy', e)} onClick={e => e.stopPropagation()} />
                        </th>
                        <th className="px-4 py-3 text-[0.6rem] font-semibold uppercase tracking-wide text-slate-400 text-right relative overflow-hidden" style={{ width: heatW['risk'] }}>
                          Risk
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {categoryData.map((cat, i) => {
                        const Icon = cat.icon
                        const critPct = Math.round((cat.critical / cat.total) * 100)
                        const warnPct = Math.round((cat.warning  / cat.total) * 100)
                        const healPct = Math.round((cat.healthy  / cat.total) * 100)
                        const risk = critPct > 30 ? 'High' : critPct > 10 || warnPct > 40 ? 'Medium' : 'Low'
                        const riskCls = risk === 'High' ? 'text-red-600 bg-red-50 border-red-200' : risk === 'Medium' ? 'text-amber-600 bg-amber-50 border-amber-200' : 'text-emerald-600 bg-emerald-50 border-emerald-200'
                        const isExpanded = expandedCategory === cat.category
                        return (
                          <tr
                            key={cat.category}
                            className={`border-b border-slate-100 last:border-0 cursor-pointer transition-colors select-none ${isExpanded ? 'bg-orange-50/60' : i % 2 !== 0 ? 'bg-slate-50/40 hover:bg-orange-50/30' : 'hover:bg-orange-50/30'}`}
                            onClick={() => setExpandedCategory(isExpanded ? null : cat.category)}
                          >
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <div className={`rounded-lg p-1.5 transition-colors ${isExpanded ? 'bg-orange-100' : 'bg-slate-100'}`}>
                                  <Icon className={`h-3.5 w-3.5 ${isExpanded ? 'text-orange-600' : 'text-slate-600'}`} />
                                </div>
                                <span className={`font-semibold truncate ${isExpanded ? 'text-orange-700' : 'text-slate-700'}`}>{cat.category}</span>
                                <ChevronDown className={`h-3 w-3 flex-shrink-0 transition-transform text-slate-400 ${isExpanded ? 'rotate-180 text-orange-500' : ''}`} />
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex h-2 rounded-full overflow-hidden bg-slate-100 gap-px">
                                {critPct > 0 && <div className="bg-red-500 h-full" style={{ width: `${critPct}%` }} />}
                                {warnPct > 0 && <div className="bg-amber-400 h-full" style={{ width: `${warnPct}%` }} />}
                                {healPct > 0 && <div className="bg-emerald-400 h-full" style={{ width: `${healPct}%` }} />}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-center"><span className="font-bold text-red-600">{cat.critical}</span></td>
                            <td className="px-4 py-3 text-center"><span className="font-bold text-amber-600">{cat.warning}</span></td>
                            <td className="px-4 py-3 text-center"><span className="font-bold text-emerald-600">{cat.healthy}</span></td>
                            <td className="px-4 py-3 text-right"><span className={`rounded-full border px-2 py-0.5 text-[0.6rem] font-bold ${riskCls}`}>{risk}</span></td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Category detail panel — inline below table */}
              {expandedCategory && (
                <CategoryDetailPanel
                  category={expandedCategory}
                  allResults={allResults}
                  onClose={() => setExpandedCategory(null)}
                />
              )}
            </div>
          </div>

          {/* Devices needing attention */}
          {criticalDevices.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <p className="text-[0.65rem] font-bold text-slate-400 uppercase tracking-widest">Devices Needing Immediate Attention</p>
                <span className="text-[0.6rem] text-slate-400 italic">Click any row to see full diagnostic breakdown</span>
              </div>
              <div className="space-y-2">
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="text-left border-collapse text-xs" style={{ tableLayout: 'fixed', width: fdevTotal }}>
                      <colgroup>
                        {FLEET_DEVICES_COLS.map(col => (
                          <col key={col.key} style={{ width: fdevW[col.key] }} />
                        ))}
                      </colgroup>
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-left">
                          <th className="px-4 py-3 text-[0.6rem] font-semibold uppercase tracking-wide text-slate-400 relative overflow-hidden" style={{ width: fdevW['device'] }}>
                            Device
                            <span className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-orange-400/50 active:bg-orange-500 transition-colors" onMouseDown={e => fdevResize('device', e)} onClick={e => e.stopPropagation()} />
                          </th>
                          <th className="px-4 py-3 text-[0.6rem] font-semibold uppercase tracking-wide text-slate-400 relative overflow-hidden" style={{ width: fdevW['user'] }}>
                            User
                            <span className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-orange-400/50 active:bg-orange-500 transition-colors" onMouseDown={e => fdevResize('user', e)} onClick={e => e.stopPropagation()} />
                          </th>
                          <th className="px-4 py-3 text-[0.6rem] font-semibold uppercase tracking-wide text-slate-400 relative overflow-hidden" style={{ width: fdevW['platform'] }}>
                            Platform
                            <span className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-orange-400/50 active:bg-orange-500 transition-colors" onMouseDown={e => fdevResize('platform', e)} onClick={e => e.stopPropagation()} />
                          </th>
                          <th className="px-4 py-3 text-[0.6rem] font-semibold uppercase tracking-wide text-slate-400 relative overflow-hidden" style={{ width: fdevW['source'] }}>
                            Source
                            <span className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-orange-400/50 active:bg-orange-500 transition-colors" onMouseDown={e => fdevResize('source', e)} onClick={e => e.stopPropagation()} />
                          </th>
                          <th className="px-4 py-3 text-[0.6rem] font-semibold uppercase tracking-wide text-slate-400 relative overflow-hidden" style={{ width: fdevW['compliance'] }}>
                            Compliance
                            <span className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-orange-400/50 active:bg-orange-500 transition-colors" onMouseDown={e => fdevResize('compliance', e)} onClick={e => e.stopPropagation()} />
                          </th>
                          <th className="px-4 py-3 text-[0.6rem] font-semibold uppercase tracking-wide text-slate-400 relative overflow-hidden" style={{ width: fdevW['issues'] }}>
                            Issues Found
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {criticalDevices.map(({ device: d, critCount }, i) => {
                          const isExpanded = expandedDevice === d.id
                          return (
                            <tr
                              key={d.id}
                              className={`border-b border-slate-100 last:border-0 cursor-pointer transition-colors select-none ${isExpanded ? 'bg-orange-50/60' : i % 2 !== 0 ? 'bg-slate-50/40 hover:bg-orange-50/30' : 'hover:bg-orange-50/30'}`}
                              onClick={() => setExpandedDevice(isExpanded ? null : d.id)}
                            >
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  {d.platform === 'macOS' ? <Apple className="h-3.5 w-3.5 text-slate-400" /> : <Monitor className="h-3.5 w-3.5 text-slate-400" />}
                                  <span className={`font-semibold truncate ${isExpanded ? 'text-orange-700' : 'text-slate-800'}`}>{d.deviceName}</span>
                                  <ChevronDown className={`h-3 w-3 flex-shrink-0 transition-transform text-slate-400 ${isExpanded ? 'rotate-180 text-orange-500' : ''}`} />
                                </div>
                              </td>
                              <td className="px-4 py-3 text-slate-500 truncate">{d.user}</td>
                              <td className="px-4 py-3 text-slate-500">{d.platform}</td>
                              <td className="px-4 py-3 text-slate-500 truncate">{d.managementSource}</td>
                              <td className="px-4 py-3">
                                <span className={`rounded-full border px-2 py-0.5 text-[0.6rem] font-bold ${d.complianceState === 'Compliant' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : d.complianceState === 'Warning' ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-red-50 border-red-200 text-red-700'}`}>{d.complianceState}</span>
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-1.5">
                                  <div className="flex gap-0.5">
                                    {Array.from({ length: Math.min(critCount, 8) }).map((_, j) => (
                                      <span key={j} className={`h-2.5 w-1.5 rounded-sm ${j < 3 ? 'bg-red-500' : 'bg-amber-400'}`} />
                                    ))}
                                  </div>
                                  <span className="text-[0.65rem] font-bold text-slate-600">{critCount} issue{critCount !== 1 ? 's' : ''}</span>
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Device detail panel — inline below table */}
                {expandedDevice && (() => {
                  const entry = allResults.find(r => r.device.id === expandedDevice)
                  return entry ? (
                    <DeviceDetailPanel entry={entry} onClose={() => setExpandedDevice(null)} />
                  ) : null
                })()}
              </div>
            </div>
          )}

        </div>
      )}

      {/* Empty state */}
      {!scanned && !scanning && (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 flex flex-col items-center justify-center py-16 text-center px-6">
          <div className="rounded-2xl bg-white border border-slate-200 p-4 mb-4 shadow-sm">
            <Globe className="h-8 w-8 text-slate-300" />
          </div>
          <p className="text-sm font-semibold text-slate-600">Start a fleet-wide diagnostic scan</p>
          <p className="text-xs text-slate-400 mt-1 max-w-xs leading-relaxed">
            Analyzes up to 50 devices across all MDM sources. Produces a category heat map, risk scores, and a list of devices needing immediate attention.
          </p>
        </div>
      )}
    </div>
  )
}

// ─── Main Page ──────────────────────────────────────────────────────────────────

const TABS: { id: PageTab; label: string; icon: typeof Activity; description: string }[] = [
  { id: 'infrastructure', label: 'Infrastructure Health', icon: Radio,     description: 'Live status of all connected sources' },
  { id: 'device',         label: 'Device Diagnostics',   icon: Activity,   description: '8-category analysis for any device' },
  { id: 'fleet',          label: 'Fleet Scan',           icon: TrendingUp, description: 'Aggregate health across all devices' },
]

export function DiagnosticsPage() {
  const [activeTab, setActiveTab] = useState<PageTab>('infrastructure')

  return (
    <div className="space-y-5 w-full">

      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Diagnostics</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Live infrastructure health · Per-device 8-category analysis · Fleet-wide risk scanning
          </p>
        </div>
        <div className="sm:ml-auto flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[0.65rem] font-bold text-emerald-700">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />Live Monitoring
          </span>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-slate-100 rounded-2xl p-1 w-full sm:w-fit">
        {TABS.map(t => {
          const Icon = t.icon
          return (
            <button key={t.id} type="button" onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all whitespace-nowrap ${activeTab === t.id ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              <Icon className="h-3.5 w-3.5" />{t.label}
            </button>
          )
        })}
      </div>

      {/* Tab content */}
      {activeTab === 'infrastructure' && <InfrastructureTab />}
      {activeTab === 'device'         && <DeviceDiagnosticsTab />}
      {activeTab === 'fleet'          && <FleetScanTab />}

    </div>
  )
}
