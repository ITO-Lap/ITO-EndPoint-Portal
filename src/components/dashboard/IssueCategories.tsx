import type { IssueCategory } from '../../types'
import { DashboardCard } from '../ui/DashboardCard'

interface IssueCategoriesProps {
  categories: IssueCategory[]
  onCategoryClick?: (label: string) => void
  selectedCategory?: string | null
}

export function IssueCategories({ categories, onCategoryClick, selectedCategory }: IssueCategoriesProps) {
  const maxValue = Math.max(...categories.map((item) => item.value))

  return (
    <DashboardCard title="Top Issue Categories">
      <div className="space-y-2 min-w-0 w-full">
        {categories.map((category) => {
          const isSelected = selectedCategory === category.label
          return (
            <button
              key={category.label}
              type="button"
              onClick={() => onCategoryClick?.(category.label)}
              aria-pressed={isSelected}
              className={`w-full text-left space-y-1.5 min-w-0 rounded-lg px-2 py-1.5 -mx-2 transition focus-visible:ring-2 focus-visible:ring-indigo-300 ${
                isSelected
                  ? 'bg-indigo-50 ring-1 ring-indigo-200'
                  : 'hover:bg-slate-50'
              } ${onCategoryClick ? 'cursor-pointer' : 'cursor-default'}`}
            >
              <div className="flex items-center justify-between gap-2 min-w-0">
                <p className={`text-xs font-medium min-w-0 break-words ${isSelected ? 'text-indigo-700' : 'text-slate-700'}`}>
                  {category.label}
                </p>
                <p className="text-xs font-semibold text-slate-900 flex-shrink-0 tabular-nums">{category.value.toLocaleString()}</p>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.round((category.value / maxValue) * 100)}%`,
                    backgroundColor: category.color,
                    opacity: isSelected ? 1 : 0.8,
                  }}
                />
              </div>
            </button>
          )
        })}
      </div>
    </DashboardCard>
  )
}
