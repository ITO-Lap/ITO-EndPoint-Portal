import { useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { StatCard } from './StatCard'
import { DeviceSummary } from '../devices/DeviceSummary'
import { ComplianceDetails } from '../devices/ComplianceDetails'
import { RunbookCard } from '../runbooks/RunbookCard'
import { ComplianceDonut } from './ComplianceDonut'
import { IssueCategories } from './IssueCategories'
import { RecentActivity } from './RecentActivity'
import { PolicyDetailsModal } from './PolicyDetailsModal'
import { LiveDataBar } from './LiveDataBar'
import { AllDevicesDrawer } from '../devices/AllDevicesDrawer'
import { useToast } from '../ui/ToastProvider'
import { useDashboardState } from '../../hooks/useDashboardState'
import { getComplianceRowsForDevice } from '../../data/dashboardData'
import type { StatCardData, RunbookData, ComplianceSegment, IssueCategory, ActivityItem, DeviceData, ComplianceDetailRow } from '../../types'
import { RunbookModal } from '../runbooks/RunbookModal'
import { ActivityListModal } from './ActivityListModal'

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 border border-sky-200 pl-2.5 pr-1.5 py-1 text-xs font-medium text-sky-700">
      {label}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${label} filter`}
        className="rounded-full p-0.5 hover:bg-sky-200 focus-visible:ring-1 focus-visible:ring-sky-400 transition"
      >
        <X className="h-2.5 w-2.5" />
      </button>
    </span>
  )
}

interface DashboardContentProps {
  statCards: StatCardData[]
  selectedDevice: DeviceData
  onDeviceChange: (deviceName: string) => void
  runbookData: RunbookData
  complianceSegments: ComplianceSegment[]
  issueCategories: IssueCategory[]
  recentActivityItems: ActivityItem[]
  isMockData?: boolean
  sourceCounts?: { intune: number; kandji: number; manageEngine: number }
  countdown?: number
  lastUpdated?: Date | null
  onRefresh?: () => void
}

export function DashboardContent({
  statCards,
  selectedDevice,
  onDeviceChange,
  runbookData,
  complianceSegments,
  issueCategories,
  recentActivityItems,
  isMockData = true,
  sourceCounts = { intune: 0, kandji: 0, manageEngine: 0 },
  countdown = 30,
  lastUpdated = null,
  onRefresh,
}: DashboardContentProps) {
  const { notify } = useToast()
  const [automationLoading, setAutomationLoading] = useState(false)
  const [syncLoading, setSyncLoading] = useState(false)
  const [selectedFilters, setSelectedFilters] = useState<string[]>([])
  const [activeStatCard, setActiveStatCard] = useState<string | null>(null)
  const [selectedDonutLabel, setSelectedDonutLabel] = useState<string | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [policyRow, setPolicyRow] = useState<ComplianceDetailRow | null>(null)
  const [allDevicesOpen, setAllDevicesOpen] = useState(false)

  const {
    runbookModalOpen,
    activityModalOpen,
    setRunbookModalOpen,
    setActivityModalOpen,
  } = useDashboardState()

  const currentComplianceRows = useMemo(() => {
    return getComplianceRowsForDevice(selectedDevice)
  }, [selectedDevice])

  const handleActivityRowClick = (deviceName: string) => {
    setActivityModalOpen(false)
    onDeviceChange(deviceName)
  }

  const handleStartAutomation = async () => {
    setAutomationLoading(true)
    await new Promise(resolve => setTimeout(resolve, 1500))
    setAutomationLoading(false)
    notify('success', 'Automation Started', 'Device automation has been initiated successfully')
    setRunbookModalOpen(false)
  }

  const handleSyncNow = async () => {
    setSyncLoading(true)
    await new Promise(resolve => setTimeout(resolve, 1000))
    setSyncLoading(false)
    notify('success', 'Sync Complete', 'Device data has been synchronized successfully')
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
      setAllDevicesOpen(true)
      return
    }
    const next = activeStatCard === cardTitle ? null : cardTitle
    setActiveStatCard(next)
    if (next) {
      notify('info', 'Filter Active', `Showing: ${next}`)
    }
  }

  const handleDonutSegmentClick = (label: string) => {
    const next = selectedDonutLabel === label ? null : label
    setSelectedDonutLabel(next)
    if (next) notify('info', 'Filter', `Compliance filter: ${next}`)
  }

  const handleCategoryClick = (label: string) => {
    const next = selectedCategory === label ? null : label
    setSelectedCategory(next)
    if (next) notify('info', 'Filter', `Filtering by: ${label}`)
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
    setActiveStatCard(null)
    setSelectedDonutLabel(null)
    setSelectedCategory(null)
  }

  // Merge all active filters: manual pills + stat card + donut segment
  const effectiveStatusFilter = useMemo(() => {
    const filters = new Set<string>(selectedFilters)
    if (activeStatCard === 'Compliant Devices') filters.add('Compliant')
    if (activeStatCard === 'Non-Compliant') filters.add('Non-Compliant')
    if (selectedDonutLabel) filters.add(selectedDonutLabel)
    return filters
  }, [selectedFilters, activeStatCard, selectedDonutLabel])

  const filteredActivities = useMemo(() => {
    if (effectiveStatusFilter.size === 0) return recentActivityItems
    return recentActivityItems.filter(item =>
      [...effectiveStatusFilter].some(f => item.status.toLowerCase().includes(f.toLowerCase()))
    )
  }, [recentActivityItems, effectiveStatusFilter])

  return (
    <>
      <div className="space-y-4 w-full">

        {/* Live data status bar */}
        <LiveDataBar
          isMockData={isMockData}
          sourceCounts={sourceCounts}
          countdown={countdown}
          lastUpdated={lastUpdated}
          onRefresh={onRefresh ?? (() => {})}
        />

        <div className="grid gap-3 sm:gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-5 w-full">
          {statCards.map((card) => (
            <div key={card.title} className="min-w-0 h-full">
              <StatCard
                data={card}
                onClick={() => handleStatCardClick(card.title)}
                selected={activeStatCard === card.title}
              />
            </div>
          ))}
        </div>

        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)_minmax(0,0.95fr)] w-full auto-rows-max">
          <div className="min-w-0 h-full md:col-span-2 lg:col-span-1">
            <DeviceSummary
              device={selectedDevice}
              onSyncNow={handleSyncNow}
              syncLoading={syncLoading}
              onCopy={handleCopy}
            />
          </div>
          <div className="min-w-0 h-full">
            <ComplianceDetails
              rows={currentComplianceRows}
              onRowClick={(row) => setPolicyRow(row)}
            />
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
          <span className="text-xs font-medium text-slate-500 flex-shrink-0">Filter:</span>

          {/* Quick-filter pills */}
          {['All', 'Non-Compliant', 'Warning', 'Compliant'].map((filter) => {
            const isAll = filter === 'All'
            const isActive = isAll
              ? selectedFilters.length === 0 && !activeStatCard && !selectedDonutLabel && !selectedCategory
              : selectedFilters.includes(filter)
            return (
              <button
                key={filter}
                onClick={() => isAll ? clearFilters() : handleFilterToggle(filter)}
                className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium transition border focus-visible:ring-2 focus-visible:ring-sky-300 ${
                  isActive
                    ? 'bg-sky-100 text-sky-700 border-sky-200'
                    : 'bg-white text-slate-500 hover:bg-slate-50 border-slate-200'
                }`}
              >
                {filter}
              </button>
            )
          })}

          {/* Active source-filter chips with individual dismiss */}
          {activeStatCard && (
            <FilterChip label={activeStatCard} onRemove={() => setActiveStatCard(null)} />
          )}
          {selectedDonutLabel && (
            <FilterChip label={selectedDonutLabel} onRemove={() => setSelectedDonutLabel(null)} />
          )}
          {selectedCategory && (
            <FilterChip label={selectedCategory} onRemove={() => setSelectedCategory(null)} />
          )}

          {/* Clear all — only shown when something is active */}
          {(selectedFilters.length > 0 || activeStatCard || selectedDonutLabel || selectedCategory) && (
            <button
              onClick={clearFilters}
              className="text-xs text-slate-400 hover:text-slate-600 font-medium underline underline-offset-2 focus-visible:ring-2 focus-visible:ring-sky-300 rounded"
            >
              Clear all
            </button>
          )}
        </div>

        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)_minmax(0,0.95fr)] w-full auto-rows-max">
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

      <PolicyDetailsModal
        open={policyRow !== null}
        onClose={() => setPolicyRow(null)}
        device={selectedDevice}
      />

      <AllDevicesDrawer
        open={allDevicesOpen}
        onClose={() => setAllDevicesOpen(false)}
        onViewDevice={onDeviceChange}
        isMockData={isMockData}
        sourceCounts={sourceCounts}
      />
    </>
  )
}
