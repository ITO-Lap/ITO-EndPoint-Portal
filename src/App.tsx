import AppShell from './components/AppShell'
import { StatCard } from './components/StatCard'
import { DeviceSummary } from './components/DeviceSummary'
import { ComplianceDetails } from './components/ComplianceDetails'
import { RunbookCard } from './components/RunbookCard'
import { ComplianceDonut } from './components/ComplianceDonut'
import { IssueCategories } from './components/IssueCategories'
import { RecentActivity } from './components/RecentActivity'
import {
  statCards,
  deviceSummary,
  complianceDetailRows,
  runbookData,
  complianceSegments,
  issueCategories,
  recentActivity,
} from './data/dashboardData'

function App() {
  return (
    <AppShell>
      <div className="space-y-6 w-full">
        <div className="grid gap-4 xl:grid-cols-5 lg:grid-cols-3 md:grid-cols-2 sm:grid-cols-1 w-full">
          {statCards.map((card) => (
            <div key={card.title} className="min-w-0">
              <StatCard data={card} />
            </div>
          ))}
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.8fr_1fr_0.95fr] lg:grid-cols-1 w-full auto-rows-max">
          <div className="min-w-0">
            <DeviceSummary device={deviceSummary} />
          </div>
          <div className="min-w-0">
            <ComplianceDetails rows={complianceDetailRows} />
          </div>
          <div className="min-w-0">
            <RunbookCard data={runbookData} />
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr_0.95fr] lg:grid-cols-1 w-full auto-rows-max">
          <div className="min-w-0">
            <ComplianceDonut segments={complianceSegments} />
          </div>
          <div className="min-w-0">
            <IssueCategories categories={issueCategories} />
          </div>
          <div className="min-w-0">
            <RecentActivity items={recentActivity} />
          </div>
        </div>
      </div>
    </AppShell>
  )
}

export default App
