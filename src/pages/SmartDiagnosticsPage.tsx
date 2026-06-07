import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Stethoscope, Search, RefreshCw, ChevronDown, AlertTriangle, FileText,
} from 'lucide-react'
import { smartDiagnosticsApi } from '../api/index'
import { DeviceHealthCard } from '../components/smart-diagnostics/DeviceHealthCard'
import { DiagnosticScoreCard } from '../components/smart-diagnostics/DiagnosticScoreCard'
import { ApplicationFailureTable } from '../components/smart-diagnostics/ApplicationFailureTable'
import { EventLogViewer } from '../components/smart-diagnostics/EventLogViewer'
import { AIRecommendationPanel } from '../components/smart-diagnostics/AIRecommendationPanel'
import { ExportReportButton } from '../components/smart-diagnostics/ExportReportButton'
import type {
  DiagnosticDevice, DeviceHealthReport, ApplicationFailureReport,
  EventLogEntry, AIRecommendation,
} from '../types'

type Tab = 'app-failures' | 'event-logs' | 'ai-analysis'

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'app-failures', label: 'App Failures',  icon: AlertTriangle },
  { id: 'event-logs',   label: 'Event Logs',    icon: FileText },
  { id: 'ai-analysis',  label: 'AI Analysis',   icon: Stethoscope },
]

function useDeviceData(deviceId: string | null) {
  const [health,    setHealth]    = useState<{ device: DiagnosticDevice; report: DeviceHealthReport } | null>(null)
  const [failures,  setFailures]  = useState<ApplicationFailureReport[]>([])
  const [logs,      setLogs]      = useState<EventLogEntry[]>([])
  const [loading,   setLoading]   = useState(false)

  useEffect(() => {
    if (!deviceId) return
    setLoading(true)
    setHealth(null)
    setFailures([])
    setLogs([])
    Promise.all([
      smartDiagnosticsApi.getHealth(deviceId),
      smartDiagnosticsApi.getAppFailures(deviceId),
      smartDiagnosticsApi.getLogs(deviceId),
    ]).then(([h, f, l]) => {
      setHealth(h)
      setFailures(f)
      setLogs(l)
    }).catch(console.error).finally(() => setLoading(false))
  }, [deviceId])

  return { health, failures, logs, loading }
}

export function SmartDiagnosticsPage() {
  // Device search dropdown state
  const [search, setSearch]               = useState('')
  const [debouncedSearch, setDebounced]   = useState('')
  const [searchResults, setSearchResults] = useState<DiagnosticDevice[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [totalFound, setTotalFound]       = useState(0)
  const [deviceListOpen, setDeviceListOpen] = useState(false)

  // Selected device state
  const [selected, setSelected]   = useState<DiagnosticDevice | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>('app-failures')
  const [aiRec, setAiRec]         = useState<AIRecommendation | null>(null)
  const [analyzing, setAnalyzing] = useState(false)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load initial 50 devices on mount
  useEffect(() => {
    setSearchLoading(true)
    smartDiagnosticsApi.getDevices('', 50)
      .then(d => {
        setSearchResults(d)
        setTotalFound(d.length)
        if (d.length > 0 && !selected) setSelected(d[0])
      })
      .catch(console.error)
      .finally(() => setSearchLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Debounce search input → server fetch
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setDebounced(search), 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [search])

  useEffect(() => {
    if (!deviceListOpen) return
    setSearchLoading(true)
    smartDiagnosticsApi.getDevices(debouncedSearch, 60)
      .then(d => { setSearchResults(d); setTotalFound(d.length) })
      .catch(console.error)
      .finally(() => setSearchLoading(false))
  }, [debouncedSearch, deviceListOpen])

  const { health, failures, logs, loading: dataLoading } = useDeviceData(selected?.id ?? null)

  const report     = health?.report ?? null
  const liveDevice = health?.device ?? selected

  const handleAnalyze = useCallback(async () => {
    if (!selected?.id) return
    setAnalyzing(true)
    try {
      const rec = await smartDiagnosticsApi.analyze(selected.id)
      setAiRec(rec)
    } catch (e) {
      console.error(e)
    } finally {
      setAnalyzing(false)
    }
  }, [selected?.id])

  const selectDevice = (d: DiagnosticDevice) => {
    setSelected(d)
    setAiRec(null)
    setDeviceListOpen(false)
    setSearch('')
  }

  const openDropdown = () => {
    setDeviceListOpen(true)
    setSearch('')
  }

  return (
    <div className="space-y-5 p-6">
      {/* Page header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-orange-100 border border-orange-200">
            <Stethoscope className="h-5 w-5 text-orange-600" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900 leading-tight">Smart Diagnostics</h1>
            <p className="text-[0.65rem] text-slate-500">AI-powered device health analysis &amp; remediation</p>
          </div>
        </div>

        {liveDevice && (
          <ExportReportButton
            device={liveDevice}
            report={report}
            failures={failures}
            logs={logs}
            aiRec={aiRec}
          />
        )}
      </div>

      {/* Device selector */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-900/5 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-xs font-semibold text-slate-500 whitespace-nowrap">Selected Device</p>

          <div className="relative">
            <button
              type="button"
              onClick={openDropdown}
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-100 transition min-w-[240px] justify-between"
            >
              <span className="truncate">{selected?.deviceName ?? 'Select a device…'}</span>
              <ChevronDown className={`h-3.5 w-3.5 flex-shrink-0 text-slate-400 transition-transform ${deviceListOpen ? 'rotate-180' : ''}`} />
            </button>

            {deviceListOpen && (
              <>
                <button
                  type="button"
                  aria-hidden
                  className="fixed inset-0 z-10"
                  onClick={() => setDeviceListOpen(false)}
                />
                <div className="absolute left-0 z-20 mt-1 w-96 rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-900/10 overflow-hidden">
                  {/* Search input */}
                  <div className="p-2 border-b border-slate-100">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                      {searchLoading && (
                        <RefreshCw className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400 animate-spin" />
                      )}
                      <input
                        type="text"
                        placeholder="Search by device name, user, source…"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="w-full rounded-xl bg-slate-50 border border-slate-100 pl-8 pr-8 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-orange-300"
                        autoFocus
                      />
                    </div>
                    {totalFound > 0 && (
                      <p className="text-[0.6rem] text-slate-400 mt-1 px-1">
                        {searchResults.length < totalFound
                          ? `Showing ${searchResults.length} of ${totalFound.toLocaleString()} — refine your search`
                          : `${totalFound.toLocaleString()} device${totalFound !== 1 ? 's' : ''} found`}
                      </p>
                    )}
                  </div>

                  {/* Results list */}
                  <div className="max-h-72 overflow-y-auto">
                    {searchResults.length === 0 && !searchLoading ? (
                      <p className="py-8 text-center text-xs text-slate-400">No devices match</p>
                    ) : searchResults.map(d => (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => selectDevice(d)}
                        className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 transition ${d.id === selected?.id ? 'bg-orange-50' : ''}`}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-slate-900 truncate">{d.deviceName}</p>
                          <p className="text-[0.65rem] text-slate-500 truncate">{d.user} · {d.platform} · {d.managementSource}</p>
                        </div>
                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                          <span className={`text-[0.6rem] font-semibold rounded-full px-2 py-0.5 border ${
                            d.complianceState === 'Compliant'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : d.complianceState === 'Warning'
                              ? 'bg-amber-50 text-amber-700 border-amber-200'
                              : 'bg-red-50 text-red-700 border-red-200'
                          }`}>
                            {d.complianceState}
                          </span>
                          <span className="text-[0.58rem] text-slate-400">Risk: {d.riskScore}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Selected device metadata */}
          {selected && (
            <div className="flex items-center gap-4 text-[0.65rem] text-slate-500 flex-wrap">
              <span>{selected.platform} · {selected.osVersion}</span>
              <span>{selected.managementSource}</span>
              <span>Last sync: {selected.lastSync}</span>
            </div>
          )}
        </div>
      </div>

      {/* Empty state if no device loaded yet */}
      {!selected && !searchLoading && (
        <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4">
          <div className="grid h-16 w-16 place-items-center rounded-2xl bg-orange-50 border border-orange-200">
            <Stethoscope className="h-8 w-8 text-orange-400" />
          </div>
          <p className="text-sm font-semibold text-slate-700">Search for a device above to begin</p>
        </div>
      )}

      {/* Device Health Card */}
      {liveDevice && (
        <DeviceHealthCard device={liveDevice} loading={dataLoading} />
      )}

      {/* Diagnostic Score Cards */}
      {report && (
        <div>
          <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-slate-500 mb-3">
            Diagnostic Categories — Overall Score: {report.overallScore}/100
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
            {report.categories.map(cat => (
              <DiagnosticScoreCard key={cat.name} category={cat} />
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      {liveDevice && (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-900/5 overflow-hidden">
          <div className="flex border-b border-slate-100">
            {TABS.map(tab => {
              const Icon = tab.icon
              const active = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-5 py-3.5 text-xs font-semibold transition border-b-2 ${
                    active
                      ? 'border-orange-500 text-orange-600 bg-orange-50/50'
                      : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {tab.label}
                  {tab.id === 'app-failures' && failures.length > 0 && (
                    <span className="rounded-full bg-orange-100 text-orange-700 px-1.5 py-0.5 text-[0.6rem] font-bold">
                      {failures.length}
                    </span>
                  )}
                  {tab.id === 'event-logs' && logs.length > 0 && (
                    <span className="rounded-full bg-blue-100 text-blue-700 px-1.5 py-0.5 text-[0.6rem] font-bold">
                      {logs.length}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          <div className="p-5">
            {activeTab === 'app-failures' && (
              <ApplicationFailureTable failures={failures} loading={dataLoading} />
            )}
            {activeTab === 'event-logs' && (
              <EventLogViewer logs={logs} loading={dataLoading} />
            )}
            {activeTab === 'ai-analysis' && (
              <AIRecommendationPanel
                recommendation={aiRec}
                onAnalyze={handleAnalyze}
                analyzing={analyzing}
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}
