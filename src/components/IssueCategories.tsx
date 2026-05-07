import type { IssueCategory } from '../types'
import { DashboardCard } from './DashboardCard'

interface IssueCategoriesProps {
  categories: IssueCategory[]
}

export function IssueCategories({ categories }: IssueCategoriesProps) {
  const maxValue = Math.max(...categories.map((item) => item.value))

  return (
    <DashboardCard title="Top Issue Categories">
      <div className="space-y-2 min-w-0 w-full">
        {categories.map((category) => (
          <div key={category.label} className="space-y-1.5 min-w-0">
            <div className="flex items-center justify-between gap-2 min-w-0">
              <p className="text-xs font-medium text-slate-700 min-w-0 break-words">{category.label}</p>
              <p className="text-xs font-semibold text-slate-900 flex-shrink-0 tabular-nums">{category.value.toLocaleString()}</p>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full transition-all"
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
