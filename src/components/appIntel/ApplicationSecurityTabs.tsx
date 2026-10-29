// One "Application Security & Compliance" area over the two existing application pages. The pages keep their
// own routes (and role permissions); this strip is how users move between them without hunting the sidebar.

const TABS = [
  { page: 'ManageEngine App Inventory', label: 'Application Inventory & Verified Updates' },
  { page: 'App Guardian', label: 'Mac Apps (App Guardian)' },
] as const

export function ApplicationSecurityTabs({ active, onNavigate }: { active: typeof TABS[number]['page']; onNavigate?: ((page: string) => void) | undefined }) {
  if (!onNavigate) return null
  return (
    <nav aria-label="Application Security & Compliance" className="flex flex-wrap items-center gap-2">
      <span className="text-[0.65rem] font-black uppercase tracking-wider text-slate-400">Application Security &amp; Compliance</span>
      <div className="flex gap-1 glass rounded-2xl p-1 w-fit">
        {TABS.map(t => (
          <button key={t.page} type="button" aria-current={t.page === active ? 'page' : undefined} onClick={() => { if (t.page !== active) onNavigate(t.page) }}
            className={`rounded-xl px-4 py-2 text-xs font-bold transition-all ${t.page === active ? 'is-selected' : 'text-slate-500 hover:text-slate-700'}`}>
            {t.label}
          </button>
        ))}
      </div>
    </nav>
  )
}
