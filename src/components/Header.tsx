import { Bell, ChevronDown, Menu, Moon, Search } from 'lucide-react'

interface HeaderProps {
  onMenuToggle?: () => void
}

export function Header({ onMenuToggle }: HeaderProps) {
  return (
    <header className="sticky top-0 z-20 border-b border-slate-900/10 bg-[#071f49] px-4 md:px-6 lg:px-8 py-3 text-slate-100 shadow-sm shadow-slate-950/10 overflow-x-hidden w-full">
      <div className="flex flex-col gap-3 xl:gap-4 xl:flex-row xl:items-center xl:justify-between w-full min-w-0">
        <div className="flex w-full items-center gap-2 xl:gap-4 xl:max-w-[950px] min-w-0">
          {/* Mobile menu button */}
          <button
            type="button"
            className="xl:hidden flex-shrink-0 p-2 text-slate-300 hover:text-white"
            onClick={onMenuToggle}
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="relative flex-1 min-w-0 w-full">
            <div className="pointer-events-none absolute inset-y-0 left-4 flex items-center flex-shrink-0">
              <Search className="h-4 w-4 text-slate-400" />
            </div>
            <input
              type="text"
              aria-label="Search devices"
              placeholder="Search by Device Name, User Email or Serial Number..."
              className="h-12 w-full rounded-3xl border border-slate-800/90 bg-slate-950/90 py-0 pl-12 pr-14 xl:pr-40 text-sm text-slate-100 placeholder:text-slate-500 transition focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
            />
            <button className="absolute right-1.5 top-1.5 inline-flex h-9 items-center gap-1 xl:gap-2 rounded-2xl bg-sky-600 px-3 xl:px-4 text-xs xl:text-sm font-semibold text-white transition hover:bg-sky-700 flex-shrink-0">
              <Search className="h-4 w-4" />
              <span className="hidden sm:inline">Search</span>
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 xl:gap-4 justify-end flex-shrink-0">
          <button
            type="button"
            className="relative rounded-3xl border border-slate-800/80 bg-slate-950/90 p-3 text-slate-300 transition hover:border-slate-600 hover:text-white flex-shrink-0"
          >
            <Bell className="h-5 w-5" />
            <span className="absolute -right-1 -top-1 grid h-4 w-4 place-items-center rounded-full bg-red-500 text-[0.65rem] font-semibold text-white">
              3
            </span>
          </button>
          <button
            type="button"
            className="rounded-3xl border border-slate-800/90 bg-slate-950/90 p-3 text-slate-300 transition hover:border-slate-600 hover:text-white flex-shrink-0"
          >
            <Moon className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-3 rounded-3xl border border-slate-800/90 bg-slate-950/90 px-4 py-3 text-slate-100 shadow-sm shadow-slate-950/10 flex-shrink-0">
            <div className="grid h-9 w-9 place-items-center rounded-full bg-slate-800 text-sky-300 font-semibold flex-shrink-0">AV</div>
            <div className="hidden sm:block">
              <p className="text-sm font-semibold">Admin</p>
              <p className="text-xs text-slate-400">Global Admin</p>
            </div>
            <ChevronDown className="h-4 w-4 text-slate-400" />
          </div>
        </div>
      </div>
    </header>
  )
}
