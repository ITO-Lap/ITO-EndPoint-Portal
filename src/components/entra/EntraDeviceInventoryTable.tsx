import { useState, useMemo } from 'react'
import { Search, X, ChevronLeft, ChevronRight, ChevronDown, ChevronUp } from 'lucide-react'
import type { EntraDevice } from '../../data/entraData'

const complianceChip = (state: EntraDevice['complianceState']) => {
  switch (state) {
    case 'Compliant':       return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
    case 'Non-Compliant':   return 'bg-red-500/15 text-red-400 border-red-500/30'
    case 'In Grace Period': return 'bg-amber-500/15 text-amber-400 border-amber-500/30'
    default:                return 'bg-slate-500/15 text-slate-400 border-slate-500/30'
  }
}

const encryptionChip = (s: EntraDevice['encryptionState']) =>
  s === 'Encrypted' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' : 'bg-red-500/15 text-red-400 border-red-500/30'

const defenderChip = (s: EntraDevice['defenderState']) =>
  s === 'Active' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
    : s === 'Inactive' ? 'bg-red-500/15 text-red-400 border-red-500/30'
    : 'bg-slate-500/15 text-slate-400 border-slate-500/30'

const PAGE_SIZE = 5

interface Props { devices: EntraDevice[] }

export function EntraDeviceInventoryTable({ devices }: Props) {
  const [search, setSearch]   = useState('')
  const [page, setPage]       = useState(1)
  const [sortKey, setSortKey] = useState<keyof EntraDevice>('daysSinceCheckIn')
  const [sortDir, setSortDir] = useState<'asc'|'desc'>('desc')

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return devices
      .filter(d => !q || d.deviceName.toLowerCase().includes(q) || d.primaryUser.toLowerCase().includes(q) || d.upn.toLowerCase().includes(q))
      .sort((a, b) => {
        const av = a[sortKey] ?? ''; const bv = b[sortKey] ?? ''
        const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true })
        return sortDir === 'asc' ? cmp : -cmp
      })
  }, [devices, search, sortKey, sortDir])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const curPage    = Math.min(page, totalPages)
  const pageRows   = filtered.slice((curPage - 1) * PAGE_SIZE, curPage * PAGE_SIZE)

  const handleSort = (key: keyof EntraDevice) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const SortIndicator = ({ col }: { col: keyof EntraDevice }) =>
    sortKey === col
      ? sortDir === 'asc' ? <ChevronUp className="h-3 w-3 text-blue-400 inline ml-1" /> : <ChevronDown className="h-3 w-3 text-blue-400 inline ml-1" />
      : <ChevronDown className="h-3 w-3 text-slate-600 inline ml-1 opacity-40" />

  return (
    <div>
      {/* Search */}
      <div className="relative mb-3 max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
        <input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
          placeholder="Search devices or users…"
          className="h-8 w-full rounded-lg bg-slate-800 border border-slate-700 pl-8 pr-8 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-blue-500" />
        {search && <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2"><X className="h-3.5 w-3.5 text-slate-500" /></button>}
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-700/60">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-800/80 border-b border-slate-700">
              {([
                ['deviceName',      'Device Name'],
                ['primaryUser',     'Primary User'],
                ['os',              'OS'],
                ['osVersion',       'OS Version'],
                ['ownership',       'Ownership'],
                ['complianceState', 'Compliance'],
                ['daysSinceCheckIn','Last Check-In'],
                ['encryptionState', 'Encryption'],
                ['defenderState',   'Defender'],
                ['joinType',        'Join Type'],
              ] as [keyof EntraDevice, string][]).map(([k, lbl]) => (
                <th key={k} onClick={() => handleSort(k)}
                  className="px-3 py-2.5 text-left text-[0.6rem] font-bold uppercase tracking-wider text-slate-400 cursor-pointer select-none whitespace-nowrap hover:text-slate-200">
                  {lbl}<SortIndicator col={k} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((d, i) => (
              <tr key={d.id}
                className={`border-b border-slate-800 hover:bg-slate-800/60 transition-colors ${i % 2 === 0 ? 'bg-slate-900/40' : 'bg-slate-900/20'}`}>
                <td className="px-3 py-2.5 font-bold text-slate-200 whitespace-nowrap">{d.deviceName}</td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  <div className="text-slate-300 font-medium">{d.primaryUser}</div>
                  <div className="text-[0.6rem] text-slate-500 truncate max-w-[130px]">{d.upn}</div>
                </td>
                <td className="px-3 py-2.5 text-slate-400 whitespace-nowrap">{d.os}</td>
                <td className="px-3 py-2.5 text-slate-400 whitespace-nowrap font-mono text-[0.68rem]">{d.osVersion}</td>
                <td className="px-3 py-2.5">
                  <span className={`inline-flex rounded-full border px-2 py-0.5 text-[0.6rem] font-bold ${d.ownership === 'Corporate' ? 'bg-blue-500/15 text-blue-400 border-blue-500/30' : 'bg-slate-500/15 text-slate-400 border-slate-500/30'}`}>
                    {d.ownership}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <span className={`inline-flex rounded-full border px-2 py-0.5 text-[0.6rem] font-bold whitespace-nowrap ${complianceChip(d.complianceState)}`}>
                    {d.complianceState}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-slate-400 whitespace-nowrap">
                  <span className={d.daysSinceCheckIn > 10 ? 'text-red-400' : d.daysSinceCheckIn > 5 ? 'text-amber-400' : 'text-emerald-400'}>
                    {d.daysSinceCheckIn}d ago
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <span className={`inline-flex rounded-full border px-2 py-0.5 text-[0.6rem] font-bold whitespace-nowrap ${encryptionChip(d.encryptionState)}`}>
                    {d.encryptionState}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <span className={`inline-flex rounded-full border px-2 py-0.5 text-[0.6rem] font-bold whitespace-nowrap ${defenderChip(d.defenderState)}`}>
                    {d.defenderState}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap text-[0.62rem]">{d.joinType}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between mt-3 text-xs text-slate-500">
        <span>{filtered.length} devices · Page {curPage}/{totalPages}</span>
        <div className="flex gap-1">
          <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={curPage === 1}
            className="grid h-7 w-7 place-items-center rounded-lg border border-slate-700 bg-slate-800 text-slate-400 hover:text-slate-200 disabled:opacity-30 transition">
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={curPage === totalPages}
            className="grid h-7 w-7 place-items-center rounded-lg border border-slate-700 bg-slate-800 text-slate-400 hover:text-slate-200 disabled:opacity-30 transition">
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}
