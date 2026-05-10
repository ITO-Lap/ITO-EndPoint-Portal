import { useState, useCallback, useMemo } from 'react'
import { useLocalStorage } from './hooks/useLocalStorage'
import { ToastProvider, useToast } from './components/ui/ToastProvider'
import { Header } from './components/layout/Header'
import { Sidebar } from './components/layout/Sidebar'
import { DashboardContent } from './components/dashboard/DashboardContent'
import { PlaceholderPage } from './components/layout/PlaceholderPage'
import { DeviceLookupPage } from './components/devices/DeviceLookupPage'
import { UsersPage } from './pages/UsersPage'
import { ProfilePage } from './pages/ProfilePage'
import { SettingsPage } from './components/settings/SettingsPage'
import { DocsPage } from './pages/DocsPage'
import { SignInPage } from './components/auth/SignInPage'
import { SourceModal } from './components/devices/SourceModal'
import { api, apiDeviceToDeviceData } from './api'
import { useStats } from './hooks/useStats'
import { useActivity } from './hooks/useActivity'
import { useNotifications } from './hooks/useNotifications'
import type { ConnectedSource, DeviceData } from './types'
import {
  statCards as baseStatCards,
  deviceSummary,
  getRunbookForDevice,
  issueCategories,
  complianceSegments as baseComplianceSegments,
  searchDevices,
} from './data/dashboardData'

const DEFAULT_NOTIFICATIONS = [
  { id: '1', message: 'Device LAPTOP-8F7G2Q1 is now compliant', read: false },
  { id: '2', message: 'New security patch available for 3 devices', read: false },
  { id: '3', message: 'BitLocker policy enforcement completed', read: false },
]

const PAGE_META: Record<string, { description: string }> = {
  'Device Lookup': { description: 'Search and inspect individual managed devices across all connected sources.' },
  'Users': { description: 'Browse and manage user accounts, roles, and device assignments.' },
  'Runbooks': { description: 'Manage and execute automated runbooks and remediation workflows.' },
  'Diagnostics': { description: 'Run diagnostic checks and view device health telemetry.' },
  'Reports & Analytics': { description: 'Generate compliance reports and view trend analytics.' },
  'Activity Log': { description: 'Full audit trail of all device events, policy changes, and remediation actions.' },
  'Settings': { description: 'Configure integrations, notification preferences, and account settings.' },
}

function AppContent({ onSignOut, viewerRole }: { onSignOut: () => void; viewerRole: string }) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [activePage, setActivePage] = useLocalStorage('activePage', 'Dashboard')
  const [searchInput, setSearchInput] = useState('')
  const [searchLoading, setSearchLoading] = useState(false)
  const [notificationOpen, setNotificationOpen] = useState(false)
  const [selectedDevice, setSelectedDevice] = useState<DeviceData>(deviceSummary)
  const [selectedSource, setSelectedSource] = useState<ConnectedSource | null>(null)
  const { notify } = useToast()

  const { stats, countdown, lastUpdated, refresh: refreshStats } = useStats()
  const { items: activityItems } = useActivity()
  const { notifications, markAllRead } = useNotifications(DEFAULT_NOTIFICATIONS)

  const liveStatCards = useMemo(() => {
    if (!stats) return baseStatCards
    const counts = [
      stats.total,
      stats.compliant,
      stats.nonCompliant,
      stats.mac,
      stats.nonCompliant + stats.warning,
    ]
    return baseStatCards.map((card, i) => ({ ...card, value: counts[i].toLocaleString() }))
  }, [stats])

  const liveComplianceSegments = useMemo(() => {
    if (!stats) return baseComplianceSegments
    const t = stats.total || 1
    return [
      { label: 'Compliant', value: stats.compliant, percent: `${((stats.compliant / t) * 100).toFixed(1)}%`, color: '#22c55e' },
      { label: 'Warning', value: stats.warning, percent: `${((stats.warning / t) * 100).toFixed(1)}%`, color: '#f59e0b' },
      { label: 'Non-Compliant', value: stats.nonCompliant, percent: `${((stats.nonCompliant / t) * 100).toFixed(1)}%`, color: '#ef4444' },
    ]
  }, [stats])

  const handleDeviceSelect = useCallback(async (deviceName: string) => {
    setSearchLoading(true)
    try {
      // Race the API call against a 500ms minimum — whichever is longer wins,
      // ensuring the loading state is always visible even on fast responses.
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

      // Server offline or returned empty — fall back to local mock data
      const local = searchDevices(deviceName)
      if (local) {
        setSelectedDevice(local)
        notify('success', 'Device Found', `Viewing ${local.deviceName}`)
        setActivePage('Dashboard')
      } else {
        notify('error', 'Not Found', `No device found matching "${deviceName}"`)
      }
    } finally {
      setSearchLoading(false)
    }
  }, [notify])

  const handleSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      notify('info', 'Search', 'Please enter a device name, user email, or serial number')
      return
    }
    await handleDeviceSelect(query.trim())
    setSearchInput('')
  }, [handleDeviceSelect, notify])

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
          />
          <div className="flex min-h-full flex-col w-full">
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
              onSignOut={onSignOut}
              viewerRole={viewerRole}
            />
            <main className="flex-1 bg-[#f6f8fb] px-4 py-4 sm:px-5 sm:py-5 lg:px-6 lg:py-6 xl:px-6 xl:py-6 overflow-x-hidden w-full">
              <div className="mx-auto w-full max-w-[1600px]">
                {activePage === 'Dashboard' ? (
                  <DashboardContent
                    statCards={liveStatCards}
                    selectedDevice={selectedDevice}
                    onDeviceChange={handleDeviceSelect}
                    runbookData={getRunbookForDevice(selectedDevice)}
                    complianceSegments={liveComplianceSegments}
                    issueCategories={issueCategories}
                    recentActivityItems={activityItems}
                    isMockData={stats?.mock ?? true}
                    sourceCounts={stats?.sources ?? { intune: 0, kandji: 0, manageEngine: 0 }}
                    countdown={countdown}
                    lastUpdated={lastUpdated}
                    onRefresh={refreshStats}
                  />
                ) : activePage === 'Device Lookup' ? (
                  <DeviceLookupPage
                    onViewInDashboard={async (deviceName) => {
                      await handleDeviceSelect(deviceName)
                      setActivePage('Dashboard')
                    }}
                  />
                ) : activePage === 'Users' ? (
                  <UsersPage viewerRole={viewerRole as import('./types').UserToolRole} />
                ) : activePage === 'Profile' ? (
                  <ProfilePage />
                ) : activePage === 'Settings' ? (
                  <SettingsPage />
                ) : activePage === 'Documentation' ? (
                  <DocsPage />
                ) : (
                  <PlaceholderPage
                    title={activePage}
                    description={PAGE_META[activePage]?.description ?? `Manage ${activePage.toLowerCase()} across your endpoint environment.`}
                  />
                )}
                <footer className="mt-6 text-center text-xs text-slate-500">© 2026 ITO Endpoint. All rights reserved.</footer>
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

function AuthGate() {
  const [isAuthenticated, setIsAuthenticated] = useLocalStorage('ito_auth', false)
  const [viewerRole, setViewerRole] = useLocalStorage('ito_role', 'Global Admin')
  const [justSignedOut, setJustSignedOut] = useState(false)

  const handleSignIn = useCallback((role: string) => {
    setIsAuthenticated(true)
    setViewerRole(role)
    setJustSignedOut(false)
  }, [setIsAuthenticated, setViewerRole])

  const handleSignOut = useCallback(() => {
    setIsAuthenticated(false)
    setJustSignedOut(true)
  }, [setIsAuthenticated])

  if (!isAuthenticated) {
    return <SignInPage onSignIn={handleSignIn} justSignedOut={justSignedOut} />
  }

  return <AppContent onSignOut={handleSignOut} viewerRole={viewerRole} />
}

function App() {
  return (
    <ToastProvider>
      <AuthGate />
    </ToastProvider>
  )
}

export default App
