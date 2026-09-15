import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { useLocalStorage } from './hooks/useLocalStorage'
import { ToastProvider, useToast } from './components/ui/ToastProvider'
import { Header } from './components/layout/Header'
import { Sidebar } from './components/layout/Sidebar'
import { DashboardContent } from './components/dashboard/DashboardContent'
import { PlaceholderPage } from './components/layout/PlaceholderPage'
import { DeviceLookupPage } from './components/devices/DeviceLookupPage'
import { UsersPage } from './pages/UsersPage'
import { UserIntelligencePage } from './pages/UserIntelligencePage'
import { ProfilePage } from './pages/ProfilePage'
import { SettingsPage } from './components/settings/SettingsPage'
import { DocsPage } from './pages/DocsPage'
import { SourceModal } from './components/devices/SourceModal'
import { ReportsPage } from './components/reports/ReportsPage'
import { FilteredDevicesPage } from './components/devices/FilteredDevicesPage'
import { OpenIssuesPage } from './components/issues/OpenIssuesPage'
import { RunbooksPage } from './pages/RunbooksPage'
import { ActivityLogPage } from './pages/ActivityLogPage'
import { RemoteScriptsPage } from './pages/RemoteScriptsPage'
import { SecurityPosturePage } from './pages/SecurityPosturePage'
import { VulnerabilitiesPage } from './pages/VulnerabilitiesPage'
import { KandjiMacPage } from './pages/KandjiMacPage'
import { MacFleetReportsPage } from './pages/MacFleetReportsPage'
import { EntraIntelligenceDashboard } from './components/entra/EntraIntelligenceDashboard'
import { IntuneDevicesPage } from './pages/IntuneDevicesPage'
import { WindowsDevicesPage } from './pages/WindowsDevicesPage'
import { ManageEngineDevicesPage } from './pages/ManageEngineDevicesPage'
import { AutomationPage } from './components/automation/AutomationPage'
import { EDRPage } from './pages/EDRPage'
import { SmartDiagnosticsPage } from './pages/SmartDiagnosticsPage'
import { IntelligenceDashboardPage } from './pages/IntelligenceDashboardPage'
import { ComplianceIntelPage } from './pages/ComplianceIntelPage'
import { AppDeploymentPage } from './pages/AppDeploymentPage'
import { PolicyConflictPage } from './pages/PolicyConflictPage'
import { RiskScoringPage } from './pages/RiskScoringPage'
import { ReportBuilderPage } from './pages/ReportBuilderPage'
import { ScheduledReportsPage } from './pages/ScheduledReportsPage'
import { MultiTenantPage } from './pages/MultiTenantPage'
import { AuditLogPage } from './pages/AuditLogPage'
import { RoleActivityAuditPage } from './pages/RoleActivityAuditPage'
import { SecurityPoliciesPage } from './pages/SecurityPoliciesPage'
import { api, apiDeviceToDeviceData } from './api'
import { useStats } from './hooks/useStats'
import { useActivity } from './hooks/useActivity'
import { useNotifications } from './hooks/useNotifications'
import type { ConnectedSource, DeviceData, AppUser } from './types'
import {
  getRunbookForDevice,
} from './data/dashboardData'
import {
  Laptop2, AlertTriangle, ShieldCheck, ShieldAlert, ClipboardList, Monitor, Apple, Lock,
} from 'lucide-react'
import { ZinniaBadge } from './components/ui/ZinniaLogo'
import type { StatCardData, UserToolRole } from './types'
import { canAccess } from './lib/permissions'
import { NavVisibilityProvider } from './context/NavVisibilityContext'

function OfflineBanner({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex items-center gap-3 bg-red-600 px-4 py-2 text-white text-xs font-medium">
      <span className="flex items-center gap-1.5">
        <svg className="h-3.5 w-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        </svg>
        Server unreachable — showing last known data.
      </span>
      <button
        type="button"
        onClick={onRetry}
        className="ml-auto flex-shrink-0 rounded border border-white/40 bg-white/10 px-2.5 py-0.5 text-xs font-semibold hover:bg-white/20 transition"
      >
        Retry
      </button>
    </div>
  )
}

function AccessDenied({ page, onBack }: { page: string; onBack: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-28 gap-5 text-center">
      <div className="grid h-16 w-16 place-items-center rounded-2xl bg-red-100">
        <Lock className="h-7 w-7 text-red-600" />
      </div>
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-slate-900">Access Restricted</h2>
        <p className="text-sm text-slate-500">You don't have permission to view <span className="font-medium text-slate-700">{page}</span>.</p>
        <p className="text-sm text-slate-400">Contact your Global Admin to request access.</p>
      </div>
      <button
        type="button"
        onClick={onBack}
        className="rounded-lg bg-orange-500 px-5 py-2 text-sm font-semibold text-white hover:bg-orange-600 transition"
      >
        Back to Dashboard
      </button>
    </div>
  )
}

// Static card templates — only icons/colors/titles, values come from live stats
const STAT_CARD_TEMPLATES: Omit<StatCardData, 'value' | 'trend' | 'trendChange'>[] = [
  { title: 'Total Devices',      icon: Laptop2,       accent: 'text-orange-700',     iconBg: 'bg-orange-100',     iconText: 'text-orange-600'     },
  { title: 'Compliant Devices',  icon: ShieldCheck,   accent: 'text-emerald-700', iconBg: 'bg-emerald-100', iconText: 'text-emerald-600' },
  { title: 'Non-Compliant',      icon: ShieldAlert,   accent: 'text-red-700',     iconBg: 'bg-red-100',     iconText: 'text-red-600'     },
  { title: 'Warning Devices',    icon: AlertTriangle, accent: 'text-amber-700',   iconBg: 'bg-amber-100',   iconText: 'text-amber-600'   },
  { title: 'Open Issues',        icon: ClipboardList, accent: 'text-orange-700',  iconBg: 'bg-orange-100',  iconText: 'text-orange-600'  },
  { title: 'Windows Devices',    icon: Monitor,       accent: 'text-orange-700',    iconBg: 'bg-orange-100',    iconText: 'text-orange-600'    },
  { title: 'Mac Devices',        icon: Apple,         accent: 'text-slate-700',   iconBg: 'bg-slate-100',   iconText: 'text-slate-600'   },
]

const CATEGORY_COLORS: Record<string, string> = {
  'Encryption / FileVault': '#ef4444',
  'Security / AV':          '#f97316',
  'OS / Patch':             '#f59e0b',
  'Device Check-in':        '#22c55e',
  'Compliance Policies':    '#f59e0b',
  'Application Issues':     '#6366f1',
  'Other':                  '#64748b',
}

const PAGE_META: Record<string, { description: string }> = {
  'Device Lookup':      { description: 'Search and inspect individual managed devices across all connected sources.' },
  'Users':              { description: 'Browse and manage user accounts, roles, and device assignments.' },
  'Runbooks':           { description: 'Manage and execute automated runbooks and remediation workflows.' },
  'Diagnostics':        { description: 'Run diagnostic checks and view device health telemetry.' },
  'Reports & Analytics':{ description: 'Generate compliance reports and view trend analytics.' },
  'Activity Log':       { description: 'Full audit trail of all device events, policy changes, and remediation actions.' },
  'Settings':           { description: 'Configure integrations, notification preferences, and account settings.' },
}

function AppContent({ viewerRole, displayName, userEmail }: { viewerRole: string; displayName?: string; userEmail?: string }) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [activePage, setActivePage] = useLocalStorage('activePage', 'Dashboard')
  const [searchInput, setSearchInput] = useState('')
  const [searchLoading, setSearchLoading] = useState(false)
  const [notificationOpen, setNotificationOpen] = useState(false)
  const [selectedDevice, setSelectedDevice] = useState<DeviceData | null>(null)
  const [selectedSource, setSelectedSource] = useState<ConnectedSource | null>(null)
  const [deviceLookupTarget, setDeviceLookupTarget] = useState<string | undefined>(undefined)
  const [selectedIntelUser, setSelectedIntelUser] = useState<AppUser | null>(null)
  const { notify } = useToast()

  // Reset scroll position whenever the active page changes — the app has no
  // router/URL-per-page, so the browser never does this automatically.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [activePage])

  const { stats, offline, countdown, lastUpdated, refresh: refreshStats } = useStats()
  const { items: activityItems } = useActivity()
  const { notifications, markAllRead } = useNotifications()

  // Auto-select first non-compliant device when live data first arrives
  const autoLoaded = useRef(false)
  useEffect(() => {
    if (!stats || stats.total === 0 || autoLoaded.current) return
    autoLoaded.current = true
    api.fetchDevices().then(devices => {
      if (devices.length === 0) return
      const first = devices.find(d => d.complianceState !== 'Compliant') ?? devices[0]
      setSelectedDevice(apiDeviceToDeviceData(first))
    }).catch(() => {})
  }, [stats])

  const liveStatCards = useMemo((): StatCardData[] => {
    const vals = stats
      ? [stats.total, stats.compliant, stats.nonCompliant, stats.warning, stats.nonCompliant + stats.warning, stats.windows, stats.mac]
      : [0, 0, 0, 0, 0, 0, 0]
    return STAT_CARD_TEMPLATES.map((tmpl, i) => ({
      ...tmpl,
      value: vals[i].toLocaleString(),
      trend: '',
      trendChange: '',
    }))
  }, [stats])

  const liveComplianceSegments = useMemo(() => {
    if (!stats || stats.total === 0) return []
    const t = stats.total
    return [
      { label: 'Compliant',     value: stats.compliant,    percent: `${((stats.compliant    / t) * 100).toFixed(1)}%`, color: '#22c55e' },
      { label: 'Warning',       value: stats.warning,      percent: `${((stats.warning       / t) * 100).toFixed(1)}%`, color: '#f59e0b' },
      { label: 'Non-Compliant', value: stats.nonCompliant, percent: `${((stats.nonCompliant  / t) * 100).toFixed(1)}%`, color: '#ef4444' },
    ]
  }, [stats])

  const liveIssueCategories = useMemo(() => {
    if (!stats?.issueCategories?.length) return []
    return stats.issueCategories.map(c => ({
      label: c.label,
      value: c.value,
      color: CATEGORY_COLORS[c.label] ?? '#64748b',
    }))
  }, [stats])

  const liveRunbookData = useMemo(() => {
    return selectedDevice ? getRunbookForDevice(selectedDevice) : null
  }, [selectedDevice])

  const handleDeviceSelect = useCallback(async (deviceName: string) => {
    setSearchLoading(true)
    try {
      const [apiResult] = await Promise.allSettled([
        api.fetchDevices(deviceName),
        new Promise<void>(resolve => setTimeout(resolve, 500)),
      ])

      if (apiResult.status === 'fulfilled' && apiResult.value.length > 0) {
        const found = apiResult.value.find(d => d.deviceName === deviceName) ?? apiResult.value[0]
        setSelectedDevice(apiDeviceToDeviceData(found))
        notify('success', 'Device Found', `Viewing ${found.deviceName}`)
        setActivePage('Dashboard')
        return
      }

      notify('error', 'Not Found', `No device found matching "${deviceName}"`)
    } finally {
      setSearchLoading(false)
    }
  }, [notify])

  const handleSearch = useCallback(async (query: string) => {
    const trimmed = query.trim()
    if (!trimmed) {
      notify('info', 'Search', 'Please enter a device name, user email, or serial number')
      return
    }
    if (trimmed.length > 120) {
      notify('error', 'Invalid Search', 'Search query is too long')
      return
    }
    if (!/^[\w@.\-\s]+$/.test(trimmed)) {
      notify('error', 'Invalid Search', 'Search contains unsupported characters')
      return
    }
    await handleDeviceSelect(trimmed)
    setSearchInput('')
  }, [handleDeviceSelect, notify])

  const handleActivityDeviceClick = useCallback((deviceName: string) => {
    setDeviceLookupTarget(deviceName)
    setActivePage('Device Lookup')
  }, [setActivePage])

  const handleNotificationToggle = useCallback(() => {
    setNotificationOpen((prev) => !prev)
  }, [])

  const handleMarkAllRead = useCallback(async () => {
    await markAllRead()
    notify('success', 'Notifications', 'All notifications marked as read')
  }, [markAllRead, notify])

  return (
    <div className="min-h-full bg-slate-100 text-slate-900 overflow-x-hidden w-full">
      <div className="w-full min-h-full">
        <div className="grid min-h-full grid-cols-1 xl:grid-cols-[minmax(0,268px)_minmax(0,1fr)]">
          <Sidebar
            isOpen={isMobileMenuOpen}
            onClose={() => setIsMobileMenuOpen(false)}
            activePage={activePage}
            onNavSelect={setActivePage}
            onSourceClick={setSelectedSource}
            viewerRole={viewerRole as UserToolRole}
          />
          <div className="flex min-h-full flex-col w-full">
            {offline && <OfflineBanner onRetry={refreshStats} />}
            <Header
              onMenuToggle={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              onSearch={handleSearch}
              searchValue={searchInput}
              onSearchChange={setSearchInput}
              searchLoading={searchLoading}
              notificationOpen={notificationOpen}
              notifications={notifications}
              onNotificationToggle={handleNotificationToggle}
              onMarkAllNotificationsRead={handleMarkAllRead}
              onProfileNav={setActivePage}
              viewerRole={viewerRole}
              displayName={displayName}
              userEmail={userEmail}
            />
            <main className="flex-1 px-4 py-4 sm:px-5 sm:py-5 lg:px-6 lg:py-6 xl:px-6 xl:py-6 overflow-x-hidden w-full glass-bg">
              <div className="mx-auto w-full max-w-[1600px]">
                {!canAccess(viewerRole as UserToolRole, activePage) ? (
                  <AccessDenied page={activePage} onBack={() => setActivePage('Dashboard')} />
                ) : activePage === 'Dashboard' ? (
                  <DashboardContent
                    statCards={liveStatCards}
                    selectedDevice={selectedDevice}
                    onDeviceChange={handleDeviceSelect}
                    onActivityDeviceClick={handleActivityDeviceClick}
                    onStatCardNavigate={setActivePage}
                    runbookData={liveRunbookData}
                    aiRunbookLoading={false}
                    complianceSegments={liveComplianceSegments}
                    issueCategories={liveIssueCategories}
                    recentActivityItems={activityItems}
                    sourceCounts={stats?.sources ?? { intune: 0, kandji: 0, manageEngine: 0 }}
                    countdown={countdown}
                    lastUpdated={lastUpdated}
                    onRefresh={refreshStats}
                    onNavigate={setActivePage}
                  />
                ) : activePage === 'Compliant Devices' ? (
                  <FilteredDevicesPage
                    filter="Compliant"
                    onBack={() => setActivePage('Dashboard')}
                    onViewDevice={async (deviceName) => {
                      await handleDeviceSelect(deviceName)
                      setActivePage('Dashboard')
                    }}
                  />
                ) : activePage === 'Non-Compliant Devices' ? (
                  <FilteredDevicesPage
                    filter="Non-Compliant"
                    onBack={() => setActivePage('Dashboard')}
                    onViewDevice={async (deviceName) => {
                      await handleDeviceSelect(deviceName)
                      setActivePage('Dashboard')
                    }}
                  />
                ) : activePage === 'Warning Devices' ? (
                  <FilteredDevicesPage
                    filter="Warning"
                    onBack={() => setActivePage('Dashboard')}
                    onViewDevice={async (deviceName) => {
                      await handleDeviceSelect(deviceName)
                      setActivePage('Dashboard')
                    }}
                  />
                ) : activePage === 'Mac Devices' ? (
                  <KandjiMacPage
                    onBack={() => setActivePage('Dashboard')}
                    onViewDevice={async (deviceName) => {
                      await handleDeviceSelect(deviceName)
                      setActivePage('Dashboard')
                    }}
                  />
                ) : activePage === 'Intune Devices' ? (
                  <IntuneDevicesPage viewerRole={viewerRole as UserToolRole} userEmail={userEmail} onBack={() => setActivePage('Dashboard')} />
                ) : activePage === 'Windows Devices' ? (
                  <WindowsDevicesPage onBack={() => setActivePage('Dashboard')} />
                ) : activePage === 'ManageEngine Devices' ? (
                  <ManageEngineDevicesPage onBack={() => setActivePage('Dashboard')} />
                ) : activePage === 'Mac Fleet Reports' ? (
                  <MacFleetReportsPage onBack={() => setActivePage('Dashboard')} />
                ) : activePage === 'Entra Intelligence' ? (
                  <EntraIntelligenceDashboard />
                ) : activePage === 'Diagnostics' ? (
                  <SmartDiagnosticsPage />
                ) : activePage === 'Open Issues' ? (
                  <OpenIssuesPage
                    onBack={() => setActivePage('Dashboard')}
                    onViewDevice={async (deviceName) => {
                      await handleDeviceSelect(deviceName)
                      setActivePage('Dashboard')
                    }}
                  />
                ) : activePage === 'Device Lookup' ? (
                  <DeviceLookupPage
                    initialDeviceName={deviceLookupTarget}
                    onViewInDashboard={async (deviceName) => {
                      setDeviceLookupTarget(undefined)
                      await handleDeviceSelect(deviceName)
                      setActivePage('Dashboard')
                    }}
                  />
                ) : activePage === 'Users' ? (
                  <UsersPage
                    viewerRole={viewerRole as import('./types').UserToolRole}
                    onOpenUser={u => { setSelectedIntelUser(u); setActivePage('User Intelligence') }}
                  />
                ) : activePage === 'User Intelligence' && selectedIntelUser ? (
                  <UserIntelligencePage
                    user={selectedIntelUser}
                    onBack={() => { setSelectedIntelUser(null); setActivePage('Users') }}
                    onViewDevice={async (deviceName) => {
                      await handleDeviceSelect(deviceName)
                      setActivePage('Dashboard')
                    }}
                  />
                ) : activePage === 'Profile' ? (
                  <ProfilePage />
                ) : activePage === 'Settings' ? (
                  <SettingsPage viewerRole={viewerRole as import('./types').UserToolRole} />
                ) : activePage === 'Documentation' ? (
                  <DocsPage />
                ) : activePage === 'Reports & Analytics' ? (
                  <ReportsPage />
                ) : activePage === 'Runbooks' ? (
                  <RunbooksPage viewerRole={viewerRole} userName={displayName || userEmail || 'admin'} />
                ) : activePage === 'Activity Log' ? (
                  <ActivityLogPage />
                ) : activePage === 'Remote Scripts' ? (
                  <RemoteScriptsPage />
                ) : activePage === 'Security Posture' ? (
                  <SecurityPosturePage />
                ) : activePage === 'Vulnerabilities' ? (
                  <VulnerabilitiesPage />
                ) : activePage === 'Role Activity Audit' ? (
                  <RoleActivityAuditPage viewerRole={viewerRole as UserToolRole} userEmail={userEmail} onBack={() => setActivePage('Dashboard')} />
                ) : activePage === 'Security Policies' ? (
                  <SecurityPoliciesPage viewerRole={viewerRole as UserToolRole} userEmail={userEmail} onBack={() => setActivePage('Dashboard')} />
                ) : activePage === 'Automation' ? (
                  <AutomationPage viewerRole={viewerRole} />
                ) : activePage === 'EDR' ? (
                  <EDRPage />

                // ── Intelligence Platform pages ────────────────────────────────
                ) : activePage === 'Intelligence Hub' ? (
                  <IntelligenceDashboardPage onNavigate={setActivePage} />
                ) : activePage === 'Compliance Intelligence' ? (
                  <ComplianceIntelPage onBack={() => setActivePage('Intelligence Hub')} />
                ) : activePage === 'App Deployment' ? (
                  <AppDeploymentPage onBack={() => setActivePage('Intelligence Hub')} />
                ) : activePage === 'Policy Conflicts' ? (
                  <PolicyConflictPage onBack={() => setActivePage('Intelligence Hub')} />
                ) : activePage === 'Risk Scoring' ? (
                  <RiskScoringPage onBack={() => setActivePage('Intelligence Hub')} />
                ) : activePage === 'Report Builder' ? (
                  <ReportBuilderPage onBack={() => setActivePage('Intelligence Hub')} />
                ) : activePage === 'Scheduled Reports' ? (
                  <ScheduledReportsPage onBack={() => setActivePage('Intelligence Hub')} />
                ) : activePage === 'Multi-Tenant' ? (
                  <MultiTenantPage onBack={() => setActivePage('Intelligence Hub')} />
                ) : activePage === 'Audit Log' ? (
                  <AuditLogPage onBack={() => setActivePage('Intelligence Hub')} />

                ) : (
                  <PlaceholderPage
                    title={activePage}
                    description={PAGE_META[activePage]?.description ?? `Manage ${activePage.toLowerCase()} across your endpoint environment.`}
                  />
                )}
                <footer className="mt-6 flex flex-col items-center gap-2">
                  <ZinniaBadge />
                  <p className="text-[0.62rem] text-slate-400">© 2026 Zinnia Technologies · ITO Endpoint · All rights reserved.</p>
                </footer>
              </div>
            </main>
          </div>
        </div>
      </div>

      <SourceModal
        open={selectedSource !== null}
        source={selectedSource}
        onClose={() => setSelectedSource(null)}
      />
    </div>
  )
}

function App() {
  return (
    <ToastProvider>
      <NavVisibilityProvider>
        <AppContent viewerRole="Global Admin" displayName="Admin" userEmail="admin@zinnia.com" />
      </NavVisibilityProvider>
    </ToastProvider>
  )
}

export default App
