import { useMemo, useState } from 'react'
import { StatCard } from './StatCard'
import { DeviceSummary } from './DeviceSummary'
import { ComplianceDetails } from './ComplianceDetails'
import { RunbookCard } from './RunbookCard'
import { ComplianceDonut } from './ComplianceDonut'
import { IssueCategories } from './IssueCategories'
import { RecentActivity } from './RecentActivity'
import { useToast } from './ToastProvider'
import { useDashboardState } from '../hooks/useDashboardState'
import { getComplianceRowsForDevice } from '../data/dashboardData'
import type { StatCardData, RunbookData, ComplianceSegment, IssueCategory, ActivityItem, DeviceData } from '../types'
import { RunbookModal } from './RunbookModal'
import { ActivityListModal } from './ActivityListModal'

interface DashboardContentProps {
  statCards: StatCardData[]
  initialDevice: DeviceData
  runbookData: RunbookData
  complianceSegments: ComplianceSegment[]
  issueCategories: IssueCategory[]
  recentActivityItems: ActivityItem[]
}

export function DashboardContent({
  statCards,
  initialDevice,
  runbookData,
  complianceSegments,
  issueCategories,
  recentActivityItems,
}: DashboardContentProps) {
  const { notify } = useToast()
  const [automationLoading, setAutomationLoading] = useState(false)
  const [syncLoading, setSyncLoading] = useState(false)
  const [selectedFilters, setSelectedFilters] = useState<string[]>([])
  const {
    selectedDevice,
    runbookModalOpen,
    activityModalOpen,
    setSelectedDevice,
    setRunbookModalOpen,
    setActivityModalOpen,
  } = useDashboardState(initialDevice)

  // Get compliance rows for selected device
  const currentComplianceRows = useMemo(() => {
    return getComplianceRowsForDevice(selectedDevice)
  }, [selectedDevice])

  const handleActivityRowClick = (device: DeviceData) => {
    setSelectedDevice(device)
    setActivityModalOpen(false)
    notify('success', 'Device Selected', `Viewing ${device.deviceName}`)
  }

  const handleStartAutomation = async () => {
    setAutomationLoading(true)
    // Simulate automation for 1.5 seconds
    await new Promise(resolve => setTimeout(resolve, 1500))
    setAutomationLoading(false)
    notify('success', 'Automation Started', 'Device automation has been initiated successfully')
    setRunbookModalOpen(false)
  }

  const handleSyncNow = async () => {
    setSyncLoading(true)
    // Simulate sync for 1 second
    await new Promise(resolve => setTimeout(resolve, 1000))
    setSyncLoading(false)
    notify('success', 'Sync Complete', 'Device data has been synchronized successfully')
  }

  const handleFilterToggle = (filter: string) => {
    setSelectedFilters((prev: string[]) => 
      prev.includes(filter) 
        ? prev.filter((f: string) => f !== filter)
        : [...prev, filter]
    )
  }

  const clearFilters = () => {
    setSelectedFilters([])
  }

  // Filter activities based on selected filters
  const filteredActivities = useMemo(() => {
    if (selectedFilters.length === 0) return recentActivityItems
    return recentActivityItems.filter(item => 
      selectedFilters.some((filter: string) => item.status.toLowerCase().includes(filter.toLowerCase()))
    )
  }, [recentActivityItems, selectedFilters])

  return (
    <>
      <div className="space-y-4 w-full">
        <div className="grid gap-3 sm:gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-5 w-full">
          {statCards.map((card) => (
            <div key={card.title} className="min-w-0 h-full">
              <StatCard data={card} />
            </div>
          ))}
        </div>

        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)_minmax(0,0.95fr)] w-full auto-rows-max">
          <div className="min-w-0 h-full md:col-span-2 lg:col-span-1">
            <DeviceSummary device={selectedDevice} onSyncNow={handleSyncNow} syncLoading={syncLoading} />
          </div>
          <div className="min-w-0 h-full">
            <ComplianceDetails rows={currentComplianceRows} />
          </div>
          <div className="min-w-0 h-full">
            <RunbookCard
              data={runbookData}
              onViewRunbook={() => setRunbookModalOpen(true)}
              onCopySteps={() => {
                navigator.clipboard.writeText(runbookData.steps.join('\n')).then(() => {
                  notify('success', 'Copied', 'Runbook steps copied to clipboard')
                }).catch(() => {
                  notify('error', 'Error', 'Failed to copy to clipboard')
                })
              }}
            />
          </div>
        </div>

        {/* Filter Section */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-slate-500">Filter activity:</span>
          {['All', 'Warning', 'Compliant'].map((filter) => (
            <button
              key={filter}
              onClick={() => filter === 'All' ? clearFilters() : handleFilterToggle(filter)}
              className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition border ${
                (filter === 'All' && selectedFilters.length === 0) || selectedFilters.includes(filter)
                  ? 'bg-sky-100 text-sky-700 border-sky-200'
                  : 'bg-white text-slate-600 hover:bg-slate-50 border-slate-200'
              }`}
            >
              {filter}
            </button>
          ))}
          {selectedFilters.length > 0 && (
            <button
              onClick={clearFilters}
              className="text-xs text-slate-400 hover:text-slate-600 font-medium focus-visible:ring-2 focus-visible:ring-sky-300 rounded"
            >
              Clear
            </button>
          )}
        </div>

        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)_minmax(0,0.95fr)] w-full auto-rows-max">
          <div className="min-w-0 h-full">
            <ComplianceDonut segments={complianceSegments} />
          </div>
          <div className="min-w-0 h-full">
            <IssueCategories categories={issueCategories} />
          </div>
          <div className="min-w-0 h-full md:col-span-2 lg:col-span-1">
            <RecentActivity
              items={filteredActivities}
              onViewAll={() => setActivityModalOpen(true)}
              onRowClick={handleActivityRowClick}
            />
          </div>
        </div>
      </div>

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
        onStartAutomation={handleStartAutomation}
        automationLoading={automationLoading}
      />

      <ActivityListModal
        open={activityModalOpen}
        onClose={() => setActivityModalOpen(false)}
        items={recentActivityItems}
        onSelectDevice={handleActivityRowClick}
      />
    </>
  )
}
