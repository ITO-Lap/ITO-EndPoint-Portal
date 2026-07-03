import { useState, useEffect, useMemo, type ReactNode } from 'react'
import {
  FileSpreadsheet, RefreshCw, Download, Search, X,
  Users, Calendar, Package, BarChart2, CheckCircle2,
  XCircle, AlertCircle, ChevronLeft, ChevronRight,
  Building2, User,
} from 'lucide-react'
import { intelApi } from '../api/intelligence'
import type { DeviceReportData, DeviceReportDevice } from '../api/intelligence'

const PAGE_SIZE = 50

function ComplianceBadge({ state }: { state: string }) {
  if (state === 'compliant') return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 border border-emerald-200">
      <CheckCircle2 className="h-3 w-3" /> Compliant
    </span>
  )
  if (state === 'noncompliant') return (
    <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 border border-red-200">
      <XCircle className="h-3 w-3" /> Non-Compliant
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-600 border border-slate-200">
      <AlertCircle className="h-3 w-3" /> {state || 'Unknown'}
    </span>
  )
}

function StatCard({ icon, bg, label, value }: { icon: ReactNode; bg: string; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-4 flex items-center gap-3">
      <div className={`${bg} rounded-lg p-2.5 flex-shrink-0`}>{icon}</div>
      <div className="min-w-0">
        <p className="text-xs text-slate-500 truncate">{label}</p>
        <p className="text-xl font-bold text-slate-900 leading-tight">{value}</p>
      </div>
    </div>
  )
}

export function IntuneDeviceReportPage({ onBack }: { onBack: () => void }) {
  const [data, setData]         = useState<DeviceReportData | null>(null)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [search, setSearch]     = useState('')
  const [page, setPage]         = useState(1)
  const [ownerFilter, setOwnerFilter] = useState<'all' | 'company' | 'personal'>('all')

  useEffect(() => {
    let cancelled = false
    intelApi.deviceReport()
      .then(res => {
        if (cancelled) return
        if (res.success) setData(res)
        else setError('Failed to load device report')
        setLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setError('Failed to connect to server')
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  const filtered: DeviceReportDevice[] = useMemo(() => {
    if (!data) return []
    let items = data.devices
    if (ownerFilter !== 'all') items = items.filter(d => d.ownerType === ownerFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      items = items.filter(d =>
        d.deviceName?.toLowerCase().includes(q) ||
        d.userPrincipalName?.toLowerCase().includes(q) ||
        d.serialNumber?.toLowerCase().includes(q) ||
        d.model?.toLowerCase().includes(q)
      )
    }
    return items
  }, [data, search, ownerFilter])

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const pageItems  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  async function handleExport() {
    setExporting(true)
    try {
      await intelApi.deviceReportExport()
    } catch {
      // silently fail — could add toast here
    } finally {
      setExporting(false)
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center py-32">
      <div className="flex flex-col items-center gap-3">
        <RefreshCw className="h-6 w-6 animate-spin text-orange-500" />
        <p className="text-sm text-slate-500">Loading device report…</p>
      </div>
    </div>
  )

  if (error || !data) return (
    <div className="flex flex-col items-center justify-center py-32 gap-4">
      <p className="text-red-600 font-medium">{error ?? 'Unknown error'}</p>
      <button onClick={onBack} className="text-sm text-orange-600 hover:underline">← Back</button>
    </div>
  )

  const m1 = data.newDevicesByMonth[0]
  const m2 = data.newDevicesByMonth[1]
  const a1 = data.appsByMonth[0]
  const a2 = data.appsByMonth[1]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition"
          >
            <ChevronLeft className="h-4 w-4" /> Back
          </button>
          <div className="h-4 w-px bg-slate-200" />
          <FileSpreadsheet className="h-5 w-5 text-orange-500 flex-shrink-0" />
          <div>
            <h1 className="text-lg font-semibold text-slate-900 leading-tight">Intune Device Report</h1>
            <p className="text-xs text-slate-500">
              Microsoft Intune · {data.totalDevices.toLocaleString()} devices
              {data.cached && <span className="ml-1 text-slate-400">(cached)</span>}
            </p>
          </div>
        </div>
        <button
          onClick={handleExport}
          disabled={exporting}
          className="flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-60 transition shadow-sm"
        >
          {exporting
            ? <><RefreshCw className="h-4 w-4 animate-spin" /> Exporting…</>
            : <><Download className="h-4 w-4" /> Export to Excel</>
          }
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<BarChart2 className="h-5 w-5 text-orange-600" />}
          bg="bg-orange-50"
          label="Total Devices"
          value={data.totalDevices.toLocaleString()}
        />
        <StatCard
          icon={<Calendar className="h-5 w-5 text-blue-600" />}
          bg="bg-blue-50"
          label={`New — ${m1?.label ?? '–'}`}
          value={(m1?.count ?? 0).toLocaleString()}
        />
        <StatCard
          icon={<Calendar className="h-5 w-5 text-indigo-600" />}
          bg="bg-indigo-50"
          label={`New — ${m2?.label ?? '–'}`}
          value={(m2?.count ?? 0).toLocaleString()}
        />
        <StatCard
          icon={<Package className="h-5 w-5 text-violet-600" />}
          bg="bg-violet-50"
          label="App Changes (2 months)"
          value={((a1?.total ?? 0) + (a2?.total ?? 0)).toLocaleString()}
        />
      </div>

      {/* New Enrollments by Month */}
      <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
          <Calendar className="h-4 w-4 text-orange-500" />
          <h2 className="text-sm font-semibold text-slate-800">New Enrollments by Month</h2>
          <span className="ml-auto text-xs text-slate-400">Last 2 complete months</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wide">
              <tr>
                <th className="px-5 py-3 text-left">Month</th>
                <th className="px-5 py-3 text-right">Devices Enrolled</th>
                <th className="px-5 py-3 text-left">Trend vs Prior Month</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {[m1, m2].map((m, i) => m ? (
                <tr key={m.key} className="hover:bg-slate-50 transition">
                  <td className="px-5 py-3 font-medium text-slate-800">{m.label}</td>
                  <td className="px-5 py-3 text-right">
                    <span className="text-lg font-bold text-orange-600">{m.count.toLocaleString()}</span>
                  </td>
                  <td className="px-5 py-3">
                    {i === 0 && m1 && m2 ? (
                      <span className={`text-xs font-medium ${m1.count >= m2.count ? 'text-emerald-600' : 'text-red-500'}`}>
                        {m1.count >= m2.count ? '↑' : '↓'} {Math.abs(m1.count - m2.count)} vs {m2.label}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">–</span>
                    )}
                  </td>
                </tr>
              ) : null)}
            </tbody>
          </table>
        </div>
      </section>

      {/* App Activity by Month */}
      <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
          <Package className="h-4 w-4 text-violet-500" />
          <h2 className="text-sm font-semibold text-slate-800">App Activity by Month</h2>
          <span className="ml-auto text-xs text-slate-400">Last 2 complete months</span>
        </div>
        {(a1?.total === 0 && a2?.total === 0) ? (
          <div className="px-5 py-8 text-center">
            <Package className="h-8 w-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-500 font-medium">No app data available</p>
            <p className="text-xs text-slate-400 mt-1">
              Requires <code className="bg-slate-100 px-1 rounded text-slate-600">DeviceManagementApps.Read.All</code> in Azure App Registration
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                <tr>
                  <th className="px-5 py-3 text-left">Month</th>
                  <th className="px-5 py-3 text-right">Apps Added</th>
                  <th className="px-5 py-3 text-right">Apps Updated</th>
                  <th className="px-5 py-3 text-right">Total Activity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {[a1, a2].map(a => a ? (
                  <tr key={a.key} className="hover:bg-slate-50 transition">
                    <td className="px-5 py-3 font-medium text-slate-800">{a.label}</td>
                    <td className="px-5 py-3 text-right text-emerald-600 font-semibold">{a.added.toLocaleString()}</td>
                    <td className="px-5 py-3 text-right text-amber-600 font-semibold">{a.updated.toLocaleString()}</td>
                    <td className="px-5 py-3 text-right font-bold text-slate-800">{a.total.toLocaleString()}</td>
                  </tr>
                ) : null)}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Device Inventory */}
      <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3 flex-wrap">
          <Users className="h-4 w-4 text-orange-500 flex-shrink-0" />
          <h2 className="text-sm font-semibold text-slate-800">Device Inventory</h2>
          <span className="text-xs text-slate-400">{filtered.length.toLocaleString()} devices</span>
          <div className="ml-auto flex items-center gap-2 flex-wrap">
            <select
              value={ownerFilter}
              onChange={e => { setOwnerFilter(e.target.value as typeof ownerFilter); setPage(1) }}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-400"
            >
              <option value="all">All Owners</option>
              <option value="company">Company</option>
              <option value="personal">Personal</option>
            </select>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Search device, user, serial…"
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1) }}
                className="rounded-lg border border-slate-200 bg-white pl-8 pr-8 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-400 w-52"
              />
              {search && (
                <button onClick={() => { setSearch(''); setPage(1) }} className="absolute right-2 top-1/2 -translate-y-1/2">
                  <X className="h-3.5 w-3.5 text-slate-400 hover:text-slate-600" />
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left">Device Name</th>
                <th className="px-4 py-3 text-left">Owner (Email)</th>
                <th className="px-4 py-3 text-left">Owner Type</th>
                <th className="px-4 py-3 text-left">OS</th>
                <th className="px-4 py-3 text-left">Compliance</th>
                <th className="px-4 py-3 text-left">Encrypted</th>
                <th className="px-4 py-3 text-left">Enrolled</th>
                <th className="px-4 py-3 text-left">Last Sync</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pageItems.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-400">
                    No devices match your search
                  </td>
                </tr>
              ) : pageItems.map((d: DeviceReportDevice) => (
                <tr key={d.id} className="hover:bg-slate-50 transition">
                  <td className="px-4 py-2.5 font-medium text-slate-800 whitespace-nowrap">
                    {d.deviceName || '–'}
                  </td>
                  <td className="px-4 py-2.5 text-slate-600 max-w-[220px] truncate" title={d.userPrincipalName}>
                    {d.userPrincipalName || '–'}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium border ${
                      d.ownerType === 'company'
                        ? 'bg-blue-50 text-blue-700 border-blue-200'
                        : 'bg-slate-50 text-slate-600 border-slate-200'
                    }`}>
                      {d.ownerType === 'company'
                        ? <><Building2 className="h-3 w-3" /> Company</>
                        : d.ownerType === 'personal'
                          ? <><User className="h-3 w-3" /> Personal</>
                          : d.ownerType || '–'
                      }
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap text-xs">{d.operatingSystem || '–'}</td>
                  <td className="px-4 py-2.5"><ComplianceBadge state={d.complianceState} /></td>
                  <td className="px-4 py-2.5">
                    <span className={`text-xs font-semibold ${d.isEncrypted ? 'text-emerald-600' : 'text-red-500'}`}>
                      {d.isEncrypted ? '✓ Yes' : '✗ No'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-500 text-xs whitespace-nowrap">
                    {d.enrolledDateTime
                      ? new Date(d.enrolledDateTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                      : '–'
                    }
                  </td>
                  <td className="px-4 py-2.5 text-slate-500 text-xs whitespace-nowrap">
                    {d.lastSyncDateTime
                      ? new Date(d.lastSyncDateTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                      : '–'
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>
              Showing {((page - 1) * PAGE_SIZE + 1).toLocaleString()}–{Math.min(page * PAGE_SIZE, filtered.length).toLocaleString()} of {filtered.length.toLocaleString()}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1 rounded hover:bg-slate-100 disabled:opacity-40 transition"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="px-2">Page {page} of {totalPages}</span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-1 rounded hover:bg-slate-100 disabled:opacity-40 transition"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
