import type { LucideIcon } from 'lucide-react'
import { Construction } from 'lucide-react'

export function TabComingSoon({ icon: Icon = Construction, title, description }: { icon?: LucideIcon; title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="rounded-2xl bg-slate-100 p-4 mb-4"><Icon className="h-7 w-7 text-slate-400" /></div>
      <p className="text-sm font-semibold text-slate-600">{title}</p>
      <p className="text-xs text-slate-400 mt-1.5 max-w-[320px]">{description}</p>
      <span className="mt-4 inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[0.65rem] font-semibold text-slate-500">
        Coming soon
      </span>
    </div>
  )
}
