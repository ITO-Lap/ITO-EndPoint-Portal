import { useEffect, useMemo, useState } from 'react'
import { MonitorSmartphone } from 'lucide-react'
import { api } from '../../api'
import { StatCard } from './StatCard'
import { DeviceSummary } from '../devices/DeviceSummary'
import { ComplianceDetails } from '../devices/ComplianceDetails'
import { RunbookCard } from '../runbooks/RunbookCard'
import { ComplianceDonut } from './ComplianceDonut'
import { IssueCategories } from './IssueCategories'
import { PolicyDetailsModal } from './PolicyDetailsModal'
import { LiveDataBar } from './LiveDataBar'
import { AllDevicesDrawer } from '../devices/AllDevicesDrawer'
import { useToast } from '../ui/toastHooks'
import { useDashboardState } from '../../hooks/useDashboardState'
import { getComplianceRowsForDevice } from '../../data/dashboardData'
import type { StatCardData, RunbookData, ComplianceSegment, IssueCategory, DeviceData, ComplianceDetailRow } from '../../types'
import { RunbookModal } from '../runbooks/RunbookModal'
import { ActionCenter } from './ActionCenter'
import { QuickSlackSchedules } from './QuickSlackSchedules'
import { PatchPriorityPanel } from './PatchPriorityPanel'
import { ApplicationUpdatesPanel } from './ApplicationUpdatesPanel'
import { SecurityWatchRow } from './SecurityWatchRow'
import { SyncStatusCard } from './SyncStatusCard'
import { OperationalQueueTable } from './OperationalQueueTable'
import { setNotificationScheduleActor } from '../../api/notificationSchedule'
import { canEditSlackSchedules, hasPermission } from '../../lib/permissions'
import { usePermissions } from '../../context/permissionsHooks'

function NoDeviceCard() {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[200px] rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-10 text-slate-400">
      <MonitorSmartphone className="h-8 w-8 mb-3 opacity-40" />
      <p className="text-sm font-medium text-slate-500">No device selected</p>
      <p className="text-xs mt-1 text-center">Search for a device above or connect an integration in Settings.</p>
    </div>
  )
}

interface DashboardContentProps {
  statCards:            StatCardData[]
  selectedDevice:       DeviceData | null
  onDeviceChange:       (deviceName: string) => void
  onStatCardNavigate?:  (page: string) => void
  runbookData:          RunbookData | null
  aiRunbookLoading?:    boolean
  complianceSegments:   ComplianceSegment[]
  issueCategories:      IssueCategory[]
  sourceCounts?:        { intune: number; manageEngine: number }
  countdown?:           number
  lastUpdated?:         Date | null
  onRefresh?:           () => void
  onNavigate?:          (page: string) => void
  viewerRole?:          string
  userEmail?:           string
}

export function DashboardContent({
  statCards,
  selectedDevice,
  onDeviceChange,
  onStatCardNavigate,
  runbookData,
  aiRunbookLoading = false,
  complianceSegments,
  issueCategories,
  sourceCounts = { intune: 0, manageEngine: 0 },
  countdown = 30,
  lastUpdated = null,
  onRefresh,
  onNavigate,
  viewerRole = 'Global Admin',
  userEmail,
}: DashboardContentProps) {
  const { notify } = useToast()
  const permissions = usePermissions()

  useEffect(() => { setNotificationScheduleActor(viewerRole, userEmail ?? 'unknown@zinnia.com') }, [viewerRole, userEmail])
  const [syncLoading, setSyncLoading] = useState(false)
  const [selectedDonutLabel, setSelectedDonutLabel] = useState<string | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [policyRow, setPolicyRow] = useState<ComplianceDetailRow | null>(null)
  const [allDevicesOpen, setAllDevicesOpen] = useState(false)
  const [drawerFilter, setDrawerFilter] = useState<{ compliance: '' | 'Compliant' | 'Warning' | 'Non-Compliant'; issueCategory: string | null }>({ compliance: '', issueCategory: null })

  const {
    runbookModalOpen,
    setRunbookModalOpen,
  } = useDashboardState()

  const currentComplianceRows = useMemo(() => {
    return selectedDevice ? getComplianceRowsForDevice(selectedDevice) : []
  }, [selectedDevice])

  const handleSyncNow = async () => {
    const sourceId: 'intune' | 'manageengine' =
      (selectedDevice?.managementSource ?? '').toLowerCase().includes('intune') ? 'intune' : 'manageengine'
    const sourceLabel = sourceId === 'intune' ? 'Intune' : 'ManageEngine'
    setSyncLoading(true)
    try {
      const result = await api.syncIntegration(sourceId)
      if (result.error) {
        notify('error', 'Sync Failed', result.error)
      } else {
        notify('success', 'Sync Complete', `${sourceLabel} re-synced ${result.deviceCount} device${result.deviceCount === 1 ? '' : 's'}`)
        onRefresh?.()
      }
    } catch (err) {
      notify('error', 'Sync Failed', err instanceof Error ? err.message : 'Could not reach the sync endpoint')
    } finally {
      setSyncLoading(false)
    }
  }

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => {
      notify('success', 'Copied', `${label} copied to clipboard`)
    }).catch(() => {
      notify('error', 'Error', 'Failed to copy to clipboard')
    })
  }

  const handleStatCardClick = (cardTitle: string) => {
    if (cardTitle === 'Total Devices') {
      setDrawerFilter({ compliance: '', issueCategory: null }); setAllDevicesOpen(true)
      return
    }
    const pageMap: Record<string, string> = {
      'Mac Devices':        'Managed Devices',
    }
    const page = pageMap[cardTitle]
    if (page && onStatCardNavigate) {
      if (cardTitle === 'Mac Devices') {
        try { window.localStorage.setItem('managedDevicesView', JSON.stringify('mac')) } catch { /* ignore */ }
      }
      onStatCardNavigate(page)
    }
  }

  // Clicking a status or category opens the device list already filtered to it (counts match the card).
  const handleDonutSegmentClick = (label: string) => {
    if (label !== 'Compliant' && label !== 'Warning' && label !== 'Non-Compliant') return
    setSelectedDonutLabel(label); setSelectedCategory(null)
    setDrawerFilter({ compliance: label, issueCategory: null }); setAllDevicesOpen(true)
  }

  const handleCategoryClick = (label: string) => {
    setSelectedCategory(label); setSelectedDonutLabel(null)
    setDrawerFilter({ compliance: '', issueCategory: label }); setAllDevicesOpen(true)
  }

  return (
    <>
      <div className="space-y-4 w-full">

        {/* Live data status bar */}
        <LiveDataBar
          sourceCounts={sourceCounts}
          countdown={countdown}
          lastUpdated={lastUpdated}
          onRefresh={onRefresh ?? (() => {})}
          onNavigate={onNavigate}
        />

        <SyncStatusCard canManage={hasPermission(viewerRole, permissions, 'sync.manage')} />

        {/* Endpoint Command Center — Action Center, quick widgets, security watch, operational queue */}
        <ActionCenter onNavigate={onNavigate} />

        <div className="grid gap-4 grid-cols-1 lg:grid-cols-3 w-full">
          <QuickSlackSchedules canEdit={canEditSlackSchedules(viewerRole, permissions)} onViewAll={() => onNavigate?.('Scheduled Reports')} />
          <PatchPriorityPanel onViewAll={() => onNavigate?.('Patch Operations')} />
          <ApplicationUpdatesPanel onViewAll={() => onNavigate?.('ManageEngine App Inventory')} />
        </div>

        <SecurityWatchRow onNavigate={onNavigate} />

        <OperationalQueueTable onViewDevice={onDeviceChange} />

        <div className="grid gap-2.5 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 xl:grid-cols-7 w-full">
          {statCards.map((card) => (
            <div key={card.title} className="min-w-0 h-full">
              <StatCard
                data={card}
                onClick={() => handleStatCardClick(card.title)}
              />
            </div>
          ))}
        </div>

        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)_minmax(0,0.95fr)] w-full auto-rows-max">
          <div className="min-w-0 h-full md:col-span-2 lg:col-span-1">
            {selectedDevice ? (
              <DeviceSummary
                device={selectedDevice}
                onSyncNow={handleSyncNow}
                syncLoading={syncLoading}
                onCopy={handleCopy}
              />
            ) : (
              <NoDeviceCard />
            )}
          </div>
          <div className="min-w-0 h-full">
            <ComplianceDetails
              rows={currentComplianceRows}
              onRowClick={(row) => setPolicyRow(row)}
            />
          </div>
          <div className="min-w-0 h-full">
            {runbookData ? (
              <RunbookCard
                data={runbookData}
                aiLoading={aiRunbookLoading}
                onViewRunbook={() => setRunbookModalOpen(true)}
                onCopySteps={() => {
                  navigator.clipboard.writeText(runbookData.steps.join('\n')).then(() => {
                    notify('success', 'Copied', 'Runbook steps copied to clipboard')
                  }).catch(() => {
                    notify('error', 'Error', 'Failed to copy to clipboard')
                  })
                }}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full min-h-[160px] rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-8 text-slate-400">
                <p className="text-sm font-medium text-slate-500">No runbook</p>
                <p className="text-xs mt-1">Select a device to see recommended steps.</p>
              </div>
            )}
          </div>
        </div>

        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 w-full auto-rows-max">
          <div className="min-w-0 h-full">
            <ComplianceDonut
              segments={complianceSegments}
              onSegmentClick={handleDonutSegmentClick}
              selectedLabel={selectedDonutLabel}
            />
          </div>
          <div className="min-w-0 h-full">
            <IssueCategories
              categories={issueCategories}
              onCategoryClick={handleCategoryClick}
              selectedCategory={selectedCategory}
            />
          </div>
        </div>
      </div>

      {runbookData && (
        <RunbookModal
          open={runbookModalOpen}
          onClose={() => setRunbookModalOpen(false)}
          runbookData={runbookData}
          onCopySteps={() => {
            navigator.clipboard.writeText(runbookData.steps.join('\n')).then(() => {
              notify('success', 'Copied', 'Runbook steps copied to clipboard')
            }).catch(() => {
              notify('error', 'Error', 'Failed to copy to clipboard')
            })
          }}
        />
      )}

      {selectedDevice && (
        <PolicyDetailsModal
          open={policyRow !== null}
          onClose={() => setPolicyRow(null)}
          device={selectedDevice}
        />
      )}

      <AllDevicesDrawer
        open={allDevicesOpen}
        onClose={() => { setAllDevicesOpen(false); setSelectedDonutLabel(null); setSelectedCategory(null) }}
        onViewDevice={onDeviceChange}
        sourceCounts={sourceCounts}
        initialCompliance={drawerFilter.compliance}
        initialIssueCategory={drawerFilter.issueCategory}
      />
    </>
  )
}
