import { useState, useCallback } from 'react'
import { ToastProvider, useToast } from './components/ToastProvider'
import { Header } from './components/Header'
import { Sidebar } from './components/Sidebar'
import { DashboardContent } from './components/DashboardContent'
import { searchDevices } from './data/dashboardData'
import type { NotificationItem } from './types'
import {
  statCards,
  deviceSummary,
  runbookData,
  complianceSegments,
  issueCategories,
  recentActivity,
} from './data/dashboardData'

function AppContent() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [searchInput, setSearchInput] = useState('')
  const [searchLoading, setSearchLoading] = useState(false)
  const [notificationOpen, setNotificationOpen] = useState(false)
  const [notifications, setNotifications] = useState<NotificationItem[]>([
    { id: '1', message: 'Device LAPTOP-8F7G2Q1 is now compliant', read: false },
    { id: '2', message: 'New security patch available for 3 devices', read: false },
    { id: '3', message: 'BitLocker policy enforcement completed', read: false },
  ])
  const { notify } = useToast()

  const handleSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      notify('info', 'Search', 'Please enter a search query')
      return
    }

    setSearchLoading(true)
    // Simulate loading for 500ms
    await new Promise(resolve => setTimeout(resolve, 500))

    const found = searchDevices(query.trim())
    if (found) {
      notify('success', 'Device Found', `Found device: ${found.deviceName}`)
      setSearchInput('')
    } else {
      notify('error', 'Not Found', 'No device found matching your search')
    }
    setSearchLoading(false)
  }, [notify])

  const handleNotificationToggle = useCallback(() => {
    setNotificationOpen((prev) => !prev)
  }, [])

  const handleMarkAllNotificationsRead = useCallback(() => {
    setNotifications((current) =>
      current.map((n) => ({ ...n, read: true }))
    )
  }, [])

  return (
    <div className="min-h-full bg-slate-100 text-slate-900 overflow-x-hidden w-full">
      <div className="w-full min-h-full">
        <div className="grid min-h-full grid-cols-1 xl:grid-cols-[minmax(0,268px)_minmax(0,1fr)]">
          <Sidebar isOpen={isMobileMenuOpen} onClose={() => setIsMobileMenuOpen(false)} />
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
              onMarkAllNotificationsRead={handleMarkAllNotificationsRead}
            />
            <main className="flex-1 bg-[#f6f8fb] px-4 py-4 sm:px-5 sm:py-5 lg:px-6 lg:py-6 xl:px-6 xl:py-6 overflow-x-hidden w-full">
              <div className="mx-auto w-full max-w-[1600px]">
                <DashboardContent
                  statCards={statCards}
                  initialDevice={deviceSummary}
                    runbookData={runbookData}
                    complianceSegments={complianceSegments}
                    issueCategories={issueCategories}
                    recentActivityItems={recentActivity}
                />
                <footer className="mt-6 text-center text-xs text-slate-500">© 2026 ITO Endpoint. All rights reserved.</footer>
              </div>
            </main>
          </div>
        </div>
      </div>
    </div>
  )
}

function App() {
  return (
    <ToastProvider>
      <AppContent />
    </ToastProvider>
  )
}

export default App
