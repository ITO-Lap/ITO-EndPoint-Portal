import { useState, useEffect } from 'react'
import { Package, RefreshCw, XCircle, Search } from 'lucide-react'
import { intelApi } from '../api/intelligence'
import type { MobileApp } from '../api/intelligence'

const APP_TYPE_LABELS: Record<string, string> = {
  '#microsoft.graph.windowsStoreApp':         'Windows Store',
  '#microsoft.graph.win32LobApp':             'Win32 LOB',
  '#microsoft.graph.microsoftStoreForBusinessApp': 'MS Store for Business',
  '#microsoft.graph.iosStoreApp':             'iOS Store',
  '#microsoft.graph.androidStoreApp':         'Android Store',
  '#microsoft.graph.webApp':                  'Web App',
  '#microsoft.graph.officeSuiteApp':          'Office Suite',
  '#microsoft.graph.windowsUniversalAppX':    'MSIX / AppX',
  '#microsoft.graph.macOSDmgApp':             'macOS DMG',
  '#microsoft.graph.macOSPkgApp':             'macOS PKG',
}

function appTypeLabel(type: string): string {
  return APP_TYPE_LABELS[type] ?? type.split('.').pop() ?? 'Unknown'
}

export function AppDeploymentPage({ onBack }: { onBack: () => void }) {
  const [apps, setApps]         = useState<MobileApp[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [search, setSearch]     = useState('')

  const load = async () => {
    setLoading(true); setError(null)
    try {
      const res = await intelApi.apps()
      if (res.success) setApps(res.data)
      else setError('Failed to load apps — ensure Intune is configured.')
    } catch {
      setError('Network error loading app data.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const filtered = apps.filter(a =>
    !search || a.displayName.toLowerCase().includes(search.toLowerCase()) ||
    (a.publisher ?? '').toLowerCase().includes(search.toLowerCase())
  )

  const byType = apps.reduce<Record<string, number>>((acc, a) => {
    const t = appTypeLabel(a['@odata.type'] ?? '')
    acc[t] = (acc[t] ?? 0) + 1
    return acc
  }, {})

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1 text-sm text-slate-400">
            <button onClick={onBack} className="hover:text-slate-600 transition">← Back</button>
            <span>/</span>
            <span className="text-slate-700 font-medium flex items-center gap-1.5">
              <Package className="h-4 w-4 text-blue-500" /> App Deployment
            </span>
          </div>
          <p className="text-xs text-slate-500">All assigned Microsoft Intune managed apps and their deployment metadata.</p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 transition"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Stats + type breakdown */}
      {!loading && apps.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm text-center">
            <div className="text-2xl font-bold text-slate-900">{apps.length}</div>
            <div className="text-xs text-slate-500 mt-0.5">Total Apps</div>
          </div>
          <div className="rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm text-center">
            <div className="text-2xl font-bold text-blue-700">{apps.filter(a => a.isFeatured).length}</div>
            <div className="text-xs text-slate-500 mt-0.5">Featured</div>
          </div>
          <div className="rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm text-center">
            <div className="text-2xl font-bold text-slate-700">{Object.keys(byType).length}</div>
            <div className="text-xs text-slate-500 mt-0.5">App Types</div>
          </div>
          <div className="rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm text-center">
            <div className="text-2xl font-bold text-slate-700">{new Set(apps.map(a => a.publisher).filter(Boolean)).size}</div>
            <div className="text-xs text-slate-500 mt-0.5">Publishers</div>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-center">
          <XCircle className="h-8 w-8 text-red-400 mx-auto mb-2" />
          <p className="text-sm font-medium text-red-700">{error}</p>
          <button onClick={load} className="mt-3 rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white">Retry</button>
        </div>
      )}

      {/* App table */}
      {!loading && !error && (
        <div className="rounded-xl border border-slate-200/60 bg-white shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3">
            <h2 className="text-sm font-semibold text-slate-900 flex-1">Assigned Apps</h2>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search apps…"
                className="h-8 rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-3 text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none focus:border-orange-400"
              />
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-400">
              {apps.length === 0 ? 'No apps found — ensure DeviceManagementApps.Read.All permission is granted.' : 'No apps match your search.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 text-left text-slate-500 font-semibold">
                    <th className="px-5 py-3">App Name</th>
                    <th className="px-4 py-3">Publisher</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Featured</th>
                    <th className="px-4 py-3">Last Modified</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map(app => (
                    <tr key={app.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-5 py-3 font-medium text-slate-800">{app.displayName}</td>
                      <td className="px-4 py-3 text-slate-500">{app.publisher || '—'}</td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                          {appTypeLabel(app['@odata.type'] ?? '')}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {app.isFeatured
                          ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">Featured</span>
                          : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-slate-400">
                        {app.lastModifiedDateTime ? new Date(app.lastModifiedDateTime).toLocaleDateString() : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
