import { BookOpen } from 'lucide-react'
import { navItems, connectedSources } from '../data/dashboardData'
import { Badge } from './Badge'

interface SidebarProps {
  isOpen?: boolean
  onClose?: () => void
}

export function Sidebar({ isOpen = true, onClose }: SidebarProps) {
  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 xl:hidden" onClick={onClose} />
      )}
      <aside className={`flex min-h-screen w-[260px] flex-col border-r border-slate-900/20 bg-gradient-to-b from-[#041a3c] via-[#031a34] to-[#021630] px-5 py-6 text-slate-100 transition-transform duration-300 xl:translate-x-0 ${
        isOpen ? 'translate-x-0' : '-translate-x-full'
      } fixed left-0 top-0 z-50 h-full overflow-y-auto xl:static xl:z-auto xl:h-auto`}>
      <div className="mb-10 flex items-center gap-3 rounded-[28px] bg-gradient-to-br from-sky-600 to-blue-700 p-4 shadow-[0_24px_70px_-40px_rgba(14,165,233,0.9)]">
        <div className="grid h-12 w-12 place-items-center rounded-3xl bg-white/10 text-sky-100 shadow-lg shadow-slate-950/20">
          <BookOpen className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-white">Endpoint AI Copilot</h1>
          <p className="mt-1 text-xs text-slate-300">Smart. Fast. Reliable.</p>
        </div>
      </div>

      <nav className="space-y-2 text-sm font-medium">
        {navItems.map((item) => {
          const Icon = item.icon
          return (
            <button
              key={item.title}
              type="button"
              className={`group flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition ${
                item.active
                  ? 'bg-sky-500 text-white shadow-[0_18px_60px_-48px_rgba(14,165,233,0.65)]'
                  : 'text-slate-300 hover:bg-slate-900/70 hover:text-white'
              }`}
            >
              <span
                className={`grid h-10 w-10 place-items-center rounded-2xl ${
                  item.active
                    ? 'bg-sky-600 text-white'
                    : 'bg-slate-900 text-slate-400 group-hover:bg-slate-800/90 group-hover:text-white'
                }`}
              >
                <Icon className="h-5 w-5" />
              </span>
              <span>{item.title}</span>
            </button>
          )
        })}
      </nav>

      <div className="mt-auto rounded-2xl border border-slate-800/70 bg-[#07172b] p-5 text-white shadow-[0_30px_60px_-40px_rgba(7,18,43,0.9)]">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm font-semibold">Connected Sources</p>
          <Badge label="Live" variant="green" className="text-[0.65rem] py-1 px-2" />
        </div>
        <div className="space-y-3">
          {connectedSources.map((source) => {
            const Icon = source.icon
            return (
              <div key={source.name} className="flex items-center justify-between rounded-3xl bg-slate-950/95 px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                <div className="flex items-center gap-3">
                  <div className="grid h-10 w-10 place-items-center rounded-2xl bg-slate-900 text-cyan-300">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">{source.name}</p>
                    <p className="text-xs text-slate-400">{source.label}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                  <p className="text-xs text-slate-300">Connected</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </aside>
    </>
  )
}
