import { useState, useEffect, useCallback } from 'react'
import {
  LayoutGrid, Laptop2, LogIn, Users2, ShieldCheck, Layers, Sparkles, FileBarChart,
} from 'lucide-react'
import { api } from '../api'
import type { AppUser, UserDetails, UserIntelligenceTab } from '../types'
import { useToast } from '../components/ui/ToastProvider'
import { IntelligenceHeader } from '../components/user-intelligence/IntelligenceHeader'
import { OverviewTab } from '../components/user-intelligence/OverviewTab'
import { DevicesTab } from '../components/user-intelligence/DevicesTab'
import { SignInAnalyticsTab } from '../components/user-intelligence/SignInAnalyticsTab'
import { TabComingSoon } from '../components/user-intelligence/TabComingSoon'
import { computeHealthScore } from '../components/user-intelligence/healthScore'

const EMPTY_DETAILS: UserDetails = { signIns: [], roles: [], groups: [], apps: [], licenses: [], devices: [] }

const TABS: { id: UserIntelligenceTab; label: string; icon: React.ElementType }[] = [
  { id: 'overview',     label: 'Overview',          icon: LayoutGrid },
  { id: 'devices',      label: 'Devices',           icon: Laptop2 },
  { id: 'signins',      label: 'Sign-in Analytics', icon: LogIn },
  { id: 'groups-roles', label: 'Groups & Roles',    icon: Users2 },
  { id: 'security',     label: 'Security',          icon: ShieldCheck },
  { id: 'intune',       label: 'Intune',            icon: Layers },
  { id: 'ai-insights',  label: 'AI Insights',       icon: Sparkles },
  { id: 'reports',      label: 'Report Center',     icon: FileBarChart },
]

export function UserIntelligencePage({
  user, onBack, onViewDevice,
}: {
  user: AppUser
  onBack: () => void
  onViewDevice: (deviceName: string) => void
}) {
  const { notify } = useToast()
  const [activeTab, setActiveTab] = useState<UserIntelligenceTab>('overview')
  const [details, setDetails] = useState<UserDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback((isRefresh: boolean) => {
    if (isRefresh) { setRefreshing(true) } else { setLoading(true) }
    api.fetchUserDetails(user.id, user.email)
      .then(setDetails)
      .catch(() => setDetails(EMPTY_DETAILS))
      .finally(() => { setLoading(false); setRefreshing(false) })
  }, [user.id, user.email])

  useEffect(() => { load(false) }, [load])

  const handleRefresh = () => {
    load(true)
    notify('info', 'Refreshing', 'Reloading live data for this user…')
  }

  const handleExport = () => setActiveTab('reports')

  const health = computeHealthScore(user, details)

  return (
    <div className="space-y-4 w-full">
      <IntelligenceHeader
        user={user}
        details={details}
        health={health}
        onBack={onBack}
        onRefresh={handleRefresh}
        onExport={handleExport}
        refreshing={refreshing}
      />

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-900/5 overflow-hidden">
        <div className="flex overflow-x-auto border-b border-slate-100 bg-slate-50 px-1">
          {TABS.map(tab => {
            const Icon = tab.icon
            const active = activeTab === tab.id
            const count = tab.id === 'devices' ? details?.devices.length
              : tab.id === 'signins' ? details?.signIns.length
              : undefined
            return (
              <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)}
                className={`relative flex items-center gap-1.5 px-3.5 py-2.5 text-[0.72rem] font-semibold whitespace-nowrap transition focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-orange-300 ${
                  active ? 'text-orange-700 border-b-2 border-orange-600 -mb-px bg-white' : 'text-slate-500 hover:text-slate-700'
                }`}>
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
                {typeof count === 'number' && count > 0 && (
                  <span className={`flex h-4 min-w-4 px-1 items-center justify-center rounded-full text-[0.55rem] font-bold ${active ? 'bg-orange-600 text-white' : 'bg-slate-200 text-slate-600'}`}>{count}</span>
                )}
              </button>
            )
          })}
        </div>

        <div className="p-4">
          {activeTab === 'overview' && <OverviewTab user={user} details={details} loading={loading} health={health} />}
          {activeTab === 'devices' && <DevicesTab details={details} loading={loading} onViewDevice={onViewDevice} />}
          {activeTab === 'signins' && <SignInAnalyticsTab details={details} loading={loading} />}
          {activeTab === 'groups-roles' && (
            <TabComingSoon icon={Users2} title="Groups & Roles" description="Security groups, Microsoft 365 groups, dynamic groups, directory roles, and PIM eligible/active role assignments." />
          )}
          {activeTab === 'security' && (
            <TabComingSoon icon={ShieldCheck} title="Security" description="Authentication method breakdown, password age, Identity Protection alerts, and Conditional Access diagnostics." />
          )}
          {activeTab === 'intune' && (
            <TabComingSoon icon={Layers} title="Intune" description="Compliance policies, configuration profiles, update rings, and Autopilot enrollment detail for this user's devices." />
          )}
          {activeTab === 'ai-insights' && (
            <TabComingSoon icon={Sparkles} title="AI Insights" description="GPT-generated root-cause analysis, policy conflict detection, and recommended remediation steps for this user." />
          )}
          {activeTab === 'reports' && (
            <TabComingSoon icon={FileBarChart} title="Report Center" description="Export an executive summary, device report, compliance report, or sign-in report as PDF, Excel, CSV, or PowerPoint." />
          )}
        </div>
      </div>
    </div>
  )
}
