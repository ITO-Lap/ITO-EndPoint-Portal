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
      <aside className={`flex min-h-full w-full max-w-[268px] xl:w-[268px] xl:max-w-none flex-col border-r border-slate-900/20 bg-gradient-to-b from-[#041a3c] via-[#031a34] to-[#021630] px-6 py-5 text-slate-100 transition-transform duration-300 xl:translate-x-0 ${
        isOpen ? 'translate-x-0' : '-translate-x-full'
      } fixed left-0 top-0 z-50 h-full overflow-y-auto xl:static xl:z-auto xl:h-auto`}>
      <div className="mb-7 flex items-center gap-3 rounded-2xl bg-gradient-to-br from-sky-500 to-blue-700 px-3 py-2.5">
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-white/15 text-white flex-shrink-0">
          <BookOpen className="h-4.5 w-4.5" />
        </div>
        <div className="min-w-0">
          <h1 className="text-sm font-bold text-white leading-tight tracking-tight">ITO Endpoint</h1>
          <p className="mt-0.5 text-[0.62rem] text-sky-200/80">Smart. Fast. Reliable.</p>
        </div>
      </div>

      <nav className="space-y-1 text-sm font-medium">
        {navItems.map((item) => {
          const Icon = item.icon
          return (
            <button
              key={item.title}
              type="button"
              className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition ${
                item.active
                  ? 'bg-sky-500 text-white'
                  : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
              }`}
            >
              <span
                className={`grid h-8 w-8 place-items-center rounded-lg flex-shrink-0 ${
                  item.active
                    ? 'bg-white/20 text-white'
                    : 'bg-slate-900/60 text-slate-500 group-hover:bg-slate-800/80 group-hover:text-slate-300'
                }`}
              >
                <Icon className="h-4 w-4" />
              </span>
              <span className="text-xs">{item.title}</span>
            </button>
          )
        })}
      </nav>

      <div className="mt-auto rounded-xl border border-slate-700/60 bg-slate-950/60 p-3 text-white">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[0.65rem] font-bold uppercase tracking-widest text-slate-400">Connected Sources</p>
          <Badge label="Live" variant="green" className="text-[0.55rem] py-0.5 px-1.5 h-fit" />
        </div>
        <div className="space-y-1">
          {connectedSources.map((source) => {
            const Icon = source.icon
            return (
              <div key={source.name} className="flex items-center justify-between rounded-lg bg-slate-900/70 px-2 py-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="grid h-6 w-6 place-items-center rounded-md bg-slate-800 text-cyan-400 flex-shrink-0">
                    <Icon className="h-3 w-3" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[0.65rem] font-semibold text-slate-200 leading-tight">{source.name}</p>
                  </div>
                </div>
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
              </div>
            )
          })}
        </div>
      </div>
    </aside>
    </>
  )
}
