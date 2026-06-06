import { useState } from 'react'
import { Search, User, Monitor, Layers, FileText, Package, Ticket, AlertTriangle, ChevronRight } from 'lucide-react'
import type { EntraRelationship } from '../../data/entraData'

const riskBg = (level: string) => {
  if (level === 'High')   return 'bg-red-500/15 text-red-400 border-red-500/30'
  if (level === 'Medium') return 'bg-amber-500/15 text-amber-400 border-amber-500/30'
  return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
}

const compBg = (c: string) =>
  c === 'Compliant'     ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
  : c === 'Non-Compliant' ? 'bg-red-500/15 text-red-400 border-red-500/30'
  : 'bg-amber-500/15 text-amber-400 border-amber-500/30'

interface Props { relationships: EntraRelationship[] }

function ResourceRow({ icon: Icon, label, items, color, chipFn }: {
  icon: React.ElementType
  label: string
  items: string[] | { name: string; compliance: string; os: string }[]
  color: string
  chipFn?: (item: string) => string
}) {
  if (!items.length) return null
  const isDevices = typeof items[0] === 'object'

  return (
    <div className="flex gap-3 py-2 border-b border-slate-800/60 last:border-0">
      {/* Connector line */}
      <div className="flex flex-col items-center pt-1 flex-shrink-0">
        <div className="h-2 w-px bg-slate-700" />
        <div className={`grid h-6 w-6 place-items-center rounded-lg ${color}`}>
          <Icon className="h-3 w-3" />
        </div>
        <div className="flex-1 w-px bg-slate-700 min-h-[4px]" />
      </div>
      <div className="min-w-0 pt-1">
        <p className="text-[0.6rem] font-bold uppercase tracking-widest text-slate-500 mb-1.5">{label}</p>
        <div className="flex flex-wrap gap-1.5">
          {isDevices
            ? (items as { name: string; compliance: string; os: string }[]).map(d => (
                <div key={d.name} className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5">
                  <div className="flex items-center gap-2">
                    <Monitor className="h-3 w-3 text-blue-400 flex-shrink-0" />
                    <span className="text-xs font-bold text-slate-200">{d.name}</span>
                    <span className={`rounded-full border px-1.5 py-0.5 text-[0.55rem] font-bold ${compBg(d.compliance)}`}>{d.compliance}</span>
                  </div>
                  <p className="text-[0.6rem] text-slate-500 mt-0.5 ml-5">{d.os}</p>
                </div>
              ))
            : (items as string[]).map(item => (
                <span key={item} className={`rounded-lg border px-2 py-1 text-[0.68rem] font-medium ${chipFn ? chipFn(item) : 'bg-slate-800 text-slate-300 border-slate-700'}`}>
                  {item}
                </span>
              ))
          }
        </div>
      </div>
    </div>
  )
}

export function EntraRelationshipExplorer({ relationships }: Props) {
  const [search, setSearch]   = useState('')
  const [selected, setSelected] = useState<EntraRelationship | null>(relationships[0] ?? null)

  const filtered = relationships.filter(r =>
    !search || r.userName.toLowerCase().includes(search.toLowerCase()) ||
    r.userUpn.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-4">
      {/* User list */}
      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search users…"
            className="h-8 w-full rounded-lg bg-slate-800 border border-slate-700 pl-8 pr-3 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-blue-500" />
        </div>
        <div className="space-y-1">
          {filtered.map(r => (
            <button key={r.userId} type="button" onClick={() => setSelected(r)}
              className={`w-full flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-left transition group ${
                selected?.userId === r.userId
                  ? 'bg-blue-500/20 border border-blue-500/40 text-slate-100'
                  : 'border border-slate-700/60 bg-slate-800/50 text-slate-400 hover:border-slate-600 hover:text-slate-200'
              }`}>
              <div className={`grid h-7 w-7 flex-shrink-0 place-items-center rounded-full text-[0.65rem] font-bold ${
                r.riskLevel === 'High' ? 'bg-red-500/20 text-red-400' : r.riskLevel === 'Medium' ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-700 text-slate-400'
              }`}>
                {r.userName.split(' ').map(n => n[0]).join('').slice(0,2)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold truncate">{r.userName}</p>
                <p className="text-[0.6rem] truncate opacity-60">{r.department}</p>
              </div>
              <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 opacity-0 group-hover:opacity-100" />
            </button>
          ))}
        </div>
      </div>

      {/* Detail pane */}
      {selected ? (
        <div className="rounded-xl border border-slate-700/60 bg-slate-900/50 p-4">
          {/* User header */}
          <div className="flex items-center gap-3 pb-3 border-b border-slate-800 mb-2">
            <div className={`grid h-10 w-10 flex-shrink-0 place-items-center rounded-full text-sm font-black ${
              selected.riskLevel === 'High' ? 'bg-red-500/20 text-red-400' : selected.riskLevel === 'Medium' ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-700 text-slate-300'
            }`}>
              {selected.userName.split(' ').map(n => n[0]).join('').slice(0,2)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-bold text-slate-100">{selected.userName}</p>
                <span className={`inline-flex rounded-full border px-2 py-0.5 text-[0.6rem] font-bold ${riskBg(selected.riskLevel)}`}>
                  {selected.riskLevel} Risk
                </span>
              </div>
              <p className="text-xs text-slate-400">{selected.userUpn}</p>
              <p className="text-[0.65rem] text-slate-500">{selected.department}</p>
            </div>
          </div>

          {/* Connected resources */}
          <div>
            <ResourceRow icon={Monitor}     label="Devices"  items={selected.devices}  color="bg-blue-500/20 text-blue-400" />
            <ResourceRow icon={Layers}      label="Groups"   items={selected.groups}   color="bg-purple-500/20 text-purple-400" />
            <ResourceRow icon={FileText}    label="Policies" items={selected.policies} color="bg-indigo-500/20 text-indigo-400" />
            <ResourceRow icon={Package}     label="Apps"     items={selected.apps}     color="bg-teal-500/20 text-teal-400" />
            {selected.tickets.length > 0 && (
              <ResourceRow icon={Ticket} label="Open Tickets" items={selected.tickets} color="bg-amber-500/20 text-amber-400"
                chipFn={() => 'bg-amber-500/15 text-amber-400 border-amber-500/30'} />
            )}
            {selected.issues.length > 0 && (
              <ResourceRow icon={AlertTriangle} label="Issues" items={selected.issues} color="bg-red-500/20 text-red-400"
                chipFn={() => 'bg-red-500/15 text-red-400 border-red-500/30'} />
            )}
            {selected.issues.length === 0 && selected.tickets.length === 0 && (
              <p className="text-xs text-emerald-400 pt-2">✓ No open issues or tickets</p>
            )}
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center rounded-xl border border-slate-700/60 bg-slate-900/40 h-48">
          <div className="text-center">
            <User className="mx-auto h-7 w-7 text-slate-600 mb-2" />
            <p className="text-sm text-slate-500">Select a user to explore relationships</p>
          </div>
        </div>
      )}
    </div>
  )
}
