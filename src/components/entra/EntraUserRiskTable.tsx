import { AlertTriangle, Shield, CheckCircle2, User } from 'lucide-react'
import type { EntraUser } from '../../data/entraData'
import { usePagination } from '../../hooks/usePagination'
import { Pagination } from '../ui/Pagination'

const PAGE_SIZE = 25

const riskChip = (level: EntraUser['riskLevel']) => {
  switch (level) {
    case 'High':   return 'bg-red-500/15 text-red-400 border-red-500/30'
    case 'Medium': return 'bg-amber-500/15 text-amber-400 border-amber-500/30'
    case 'Low':    return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
    default:       return 'bg-slate-500/15 text-slate-400 border-slate-500/30'
  }
}

const riskIcon = (level: EntraUser['riskLevel']) => {
  if (level === 'High')   return <AlertTriangle className="h-3.5 w-3.5 text-red-400" />
  if (level === 'Medium') return <Shield className="h-3.5 w-3.5 text-amber-400" />
  return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
}

interface Props { users: EntraUser[] }

export function EntraUserRiskTable({ users }: Props) {
  const sorted = [...users].sort((a, b) => {
    const order = { High: 0, Medium: 1, Low: 2, None: 3 }
    return (order[a.riskLevel] ?? 4) - (order[b.riskLevel] ?? 4)
  })

  const { page, setPage, totalPages, paginated } = usePagination(sorted, PAGE_SIZE)

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-700/60">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-slate-800/80 border-b border-slate-700">
            <th className="px-4 py-2.5 text-left text-[0.6rem] font-bold uppercase tracking-wider text-slate-400">User</th>
            <th className="px-4 py-2.5 text-left text-[0.6rem] font-bold uppercase tracking-wider text-slate-400">Department</th>
            <th className="px-4 py-2.5 text-left text-[0.6rem] font-bold uppercase tracking-wider text-slate-400">Risk Level</th>
            <th className="px-4 py-2.5 text-left text-[0.6rem] font-bold uppercase tracking-wider text-slate-400">Risk Factors</th>
            <th className="px-4 py-2.5 text-left text-[0.6rem] font-bold uppercase tracking-wider text-slate-400">MFA</th>
            <th className="px-4 py-2.5 text-left text-[0.6rem] font-bold uppercase tracking-wider text-slate-400">Last Sign-In</th>
          </tr>
        </thead>
        <tbody>
          {paginated.map((user, i) => (
            <tr key={user.id}
              className={`border-b border-slate-800 hover:bg-slate-800/60 transition-colors ${i % 2 === 0 ? 'bg-slate-900/40' : 'bg-slate-900/20'}`}>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <div className={`grid h-7 w-7 place-items-center rounded-full text-[0.65rem] font-bold flex-shrink-0 ${
                    user.riskLevel === 'High' ? 'bg-red-500/20 text-red-400' : user.riskLevel === 'Medium' ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-700 text-slate-400'
                  }`}>
                    {user.displayName.split(' ').map(n => n[0]).join('').slice(0, 2)}
                  </div>
                  <div>
                    <p className="font-semibold text-slate-200">{user.displayName}</p>
                    <p className="text-[0.6rem] text-slate-500 truncate max-w-[150px]">{user.upn}</p>
                  </div>
                </div>
              </td>
              <td className="px-4 py-3 text-slate-400">{user.department}</td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-1.5">
                  {riskIcon(user.riskLevel)}
                  <span className={`inline-flex rounded-full border px-2 py-0.5 text-[0.6rem] font-bold ${riskChip(user.riskLevel)}`}>
                    {user.riskLevel}
                  </span>
                </div>
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap gap-1">
                  {user.riskFactors.slice(0, 2).map(f => (
                    <span key={f} className="rounded bg-slate-700 px-1.5 py-0.5 text-[0.58rem] text-slate-300">{f}</span>
                  ))}
                  {user.riskFactors.length > 2 && (
                    <span className="rounded bg-slate-700 px-1.5 py-0.5 text-[0.58rem] text-slate-400">+{user.riskFactors.length - 2}</span>
                  )}
                  {user.riskFactors.length === 0 && <span className="text-slate-600">—</span>}
                </div>
              </td>
              <td className="px-4 py-3">
                <span className={`inline-flex rounded-full border px-2 py-0.5 text-[0.6rem] font-bold ${
                  user.mfaStatus === 'Enabled'
                    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                    : 'bg-red-500/15 text-red-400 border-red-500/30'
                }`}>{user.mfaStatus}</span>
              </td>
              <td className="px-4 py-3 text-slate-400 text-[0.68rem]">
                {new Date(user.lastSignIn).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} totalItems={sorted.length} pageSize={PAGE_SIZE} itemLabel="user" />
    </div>
  )
}
