import { LogIn } from 'lucide-react'
import type { UserDetails } from '../../types'
import { TabLoading, EmptyTabState } from './shared'
import { usePagination } from '../../hooks/usePagination'
import { Pagination } from '../ui/Pagination'

const PAGE_SIZE = 20

function last14DayBuckets(signIns: UserDetails['signIns']) {
  const days: { key: string; label: string; success: number; failed: number }[] = []
  const now = new Date()
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)
    days.push({ key: d.toISOString().slice(0, 10), label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), success: 0, failed: 0 })
  }
  const byKey = new Map(days.map(d => [d.key, d]))
  for (const s of signIns) {
    const key = s.createdDateTime.slice(0, 10)
    const bucket = byKey.get(key)
    if (!bucket) continue
    if (s.status.errorCode !== 0) bucket.failed++
    else bucket.success++
  }
  return days
}

function TrendChart({ signIns }: { signIns: UserDetails['signIns'] }) {
  const days = last14DayBuckets(signIns)
  const max = Math.max(1, ...days.map(d => d.success + d.failed))
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-slate-700">Sign-in Trend (last 14 days)</p>
        <div className="flex items-center gap-3 text-[0.62rem] text-slate-400">
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" />Success</span>
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-500" />Failed</span>
        </div>
      </div>
      <div className="flex items-end gap-1 h-28">
        {days.map(d => (
          <div key={d.key} className="flex-1 flex flex-col items-center justify-end gap-0.5 h-full group relative">
            <div className="w-full flex flex-col justify-end h-full">
              {d.failed > 0 && <div className="w-full bg-red-500 rounded-t-sm" style={{ height: `${(d.failed / max) * 100}%` }} />}
              {d.success > 0 && <div className={`w-full bg-emerald-500 ${d.failed === 0 ? 'rounded-t-sm' : ''}`} style={{ height: `${(d.success / max) * 100}%` }} />}
              {d.success === 0 && d.failed === 0 && <div className="w-full h-0.5 bg-slate-100" />}
            </div>
            <span className="text-[0.5rem] text-slate-400 whitespace-nowrap">{d.label}</span>
            <div className="pointer-events-none absolute bottom-full mb-1 hidden group-hover:block rounded bg-slate-900 px-1.5 py-0.5 text-[0.6rem] text-white whitespace-nowrap z-10">
              {d.success} success, {d.failed} failed
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function CountryBreakdown({ signIns }: { signIns: UserDetails['signIns'] }) {
  const counts = new Map<string, number>()
  for (const s of signIns) {
    const country = s.location?.countryOrRegion || 'Unknown'
    counts.set(country, (counts.get(country) ?? 0) + 1)
  }
  const rows = [...counts.entries()].sort((a, b) => b[1] - a[1])
  if (rows.length === 0) return null
  const max = rows[0][1]
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-semibold text-slate-700 mb-3">Sign-ins by Country</p>
      <div className="space-y-2">
        {rows.map(([country, count]) => (
          <div key={country} className="flex items-center gap-2">
            <span className="text-[0.68rem] text-slate-600 w-24 truncate flex-shrink-0">{country}</span>
            <div className="flex-1 h-2 rounded-full bg-slate-100">
              <div className="h-2 rounded-full bg-orange-500" style={{ width: `${(count / max) * 100}%` }} />
            </div>
            <span className="text-[0.65rem] font-semibold text-slate-500 w-6 text-right flex-shrink-0">{count}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function SignInHistoryTable({ signIns }: { signIns: UserDetails['signIns'] }) {
  const { page, setPage, totalPages, paginated } = usePagination(signIns, PAGE_SIZE)

  return (
    <div className="space-y-2">
      <p className="text-[0.62rem] text-slate-400 uppercase font-bold tracking-wide px-1">Interactive Sign-in History</p>
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Application</th>
                <th className="px-4 py-3 text-left">Time</th>
                <th className="px-4 py-3 text-left">IP Address</th>
                <th className="px-4 py-3 text-left">Location</th>
                <th className="px-4 py-3 text-left">MFA Method</th>
                <th className="px-4 py-3 text-left">Risk Level</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginated.map(s => {
                const failed = s.status.errorCode !== 0
                const riskColor = s.riskLevelDuringSignIn === 'high' ? 'text-red-600'
                  : s.riskLevelDuringSignIn === 'medium' ? 'text-amber-600' : 'text-slate-500'
                const loc = s.location ? `${s.location.city}, ${s.location.countryOrRegion}` : null
                return (
                  <tr key={s.id} className="hover:bg-slate-50 transition">
                    <td className="px-4 py-2.5 align-top">
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[0.65rem] font-bold whitespace-nowrap ${failed ? 'bg-red-100 border-red-200 text-red-700' : 'bg-emerald-100 border-emerald-200 text-emerald-700'}`}>
                        {failed ? 'Failed' : 'Success'}
                      </span>
                      {failed && s.status.failureReason && (
                        <p className="text-[0.62rem] text-red-600 mt-1 max-w-[180px]">{s.status.failureReason}</p>
                      )}
                    </td>
                    <td className="px-4 py-2.5 align-top">
                      <p className="font-medium text-slate-800 max-w-[180px] truncate" title={s.appDisplayName || undefined}>{s.appDisplayName || '—'}</p>
                      {s.clientAppUsed && <p className="text-[0.62rem] text-slate-400 mt-0.5">{s.clientAppUsed}</p>}
                    </td>
                    <td className="px-4 py-2.5 align-top text-slate-500 text-xs whitespace-nowrap">{new Date(s.createdDateTime).toLocaleString()}</td>
                    <td className="px-4 py-2.5 align-top text-slate-600 text-xs whitespace-nowrap">{s.ipAddress || '—'}</td>
                    <td className="px-4 py-2.5 align-top text-slate-600 text-xs max-w-[160px] truncate" title={loc || undefined}>{loc || '—'}</td>
                    <td className="px-4 py-2.5 align-top text-slate-600 text-xs whitespace-nowrap">{s.mfaDetail?.authMethod || '—'}</td>
                    <td className="px-4 py-2.5 align-top text-xs font-semibold whitespace-nowrap">
                      {s.riskLevelDuringSignIn && s.riskLevelDuringSignIn !== 'none'
                        ? <span className={riskColor}>{s.riskLevelDuringSignIn}</span>
                        : <span className="text-slate-400 font-normal">—</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <Pagination page={page} totalPages={totalPages} onPageChange={setPage}
          totalItems={signIns.length} pageSize={PAGE_SIZE} itemLabel="sign-in" />
      </div>
    </div>
  )
}

export function SignInAnalyticsTab({ details, loading }: { details: UserDetails | null; loading: boolean }) {
  if (loading) return <TabLoading />
  if (!details || details.signIns.length === 0) {
    return <EmptyTabState icon={LogIn} title="No sign-in logs" subtitle="No recent sign-in activity found for this user." />
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TrendChart signIns={details.signIns} />
        <CountryBreakdown signIns={details.signIns} />
      </div>

      <SignInHistoryTable signIns={details.signIns} />
    </div>
  )
}
