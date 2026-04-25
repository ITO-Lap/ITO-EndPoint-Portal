import type { IssueCategory } from '../types'
import { DashboardCard } from './DashboardCard'

interface IssueCategoriesProps {
  categories: IssueCategory[]
}

export function IssueCategories({ categories }: IssueCategoriesProps) {
  const maxValue = Math.max(...categories.map((item) => item.value))

  return (
    <DashboardCard title="Top Issue Categories">
      <div className="space-y-4 min-w-0 w-full">
        {categories.map((category) => (
          <div key={category.label} className="space-y-3 rounded-3xl border border-slate-200/80 bg-slate-50 p-4 min-w-0">
            <div className="flex items-center justify-between gap-3 min-w-0">
              <p className="text-sm font-semibold text-slate-900 min-w-0 truncate">{category.label}</p>
              <p className="text-sm font-semibold text-slate-900 flex-shrink-0">{category.value}</p>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.round((category.value / maxValue) * 100)}%`,
                  backgroundColor: category.color,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </DashboardCard>
  )
}
