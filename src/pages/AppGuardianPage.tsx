import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity, AlertTriangle, Apple, ArrowDownToLine, ArrowRight,
  CircleHelp, Clock3, FileText, Layers3, LockKeyhole, RefreshCw, Search,
  ShieldCheck, Sparkles, X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { api } from '../api'
import type { ManageEngineAppEntry } from '../api'
import { SortableHeader } from '../components/ui/SortableHeader'
import { sortRows, toggleSortDirection, type SortDirection } from '../lib/tableSorting'

type View = 'Overview' | 'My Apps'
type Props = { onBack: () => void }

function Stat({ label, value, detail, tone, icon: Icon }: {
  label: string
  value: number | string
  detail: string
  tone: 'blue' | 'green' | 'amber' | 'slate'
  icon: LucideIcon
}) {
  return (
    <article className={`ag-stat ag-${tone}`}>
      <div className="ag-stat-top"><span>{label}</span><span className="ag-stat-icon"><Icon size={17} /></span></div>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  )
}

function Status({ entry }: { entry: ManageEngineAppEntry }) {
  const label = entry.updateStatus === 'Update Available' ? 'Version drift' : entry.updateStatus === 'Up to date' ? 'Fleet-aligned' : 'Unknown'
  const tone = entry.updateStatus === 'Update Available' ? 'amber' : entry.updateStatus === 'Up to date' ? 'green' : 'slate'
  return <span className={`ag-pill ag-pill-${tone}`}><i />{label}</span>
}

function AppMark({ name }: { name: string }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'A'
  return <span className="ag-app-mark" aria-hidden="true">{initials}</span>
}

function AppDetails({ entry, onClose }: { entry: ManageEngineAppEntry; onClose: () => void }) {
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const logs = sortKey ? sortRows(entry.logs, log => {
    switch (sortKey) {
      case 'deviceName': return log.deviceName
      case 'version': return log.version
      case 'lastSeen': return Date.parse(log.lastSeen) || log.lastSeen
      default: return ''
    }
  }, sortDirection) : entry.logs
  const handleSort = (key: string) => {
    setSortDirection(direction => toggleSortDirection(sortKey, direction, key))
    setSortKey(key)
  }
  return (
    <div className="ag-modal-backdrop" onMouseDown={onClose}>
      <section className="ag-modal" role="dialog" aria-modal="true" aria-labelledby="ag-modal-title" onMouseDown={event => event.stopPropagation()}>
        <header><div><span className="ag-eyebrow">MANAGEENGINE INVENTORY</span><h2 id="ag-modal-title">{entry.name}</h2><p>{entry.platform} · {entry.deviceCount} reported devices</p></div><button type="button" aria-label="Close application details" onClick={onClose}><X size={18} /></button></header>
        <div className="ag-modal-callout"><CircleHelp size={16} /><span>These are installed versions observed across your fleet. No vendor release catalog or update action is connected here.</span></div>
        <div className="ag-modal-table-wrap"><table className="ag-table"><thead><tr>
          <SortableHeader label="DEVICE" sortKey="deviceName" activeSortKey={sortKey} direction={sortDirection} onSort={handleSort} />
          <SortableHeader label="INSTALLED VERSION" sortKey="version" activeSortKey={sortKey} direction={sortDirection} onSort={handleSort} />
          <SortableHeader label="LAST CHECK-IN" sortKey="lastSeen" activeSortKey={sortKey} direction={sortDirection} onSort={handleSort} />
        </tr></thead><tbody>{logs.map(log => <tr key={log.deviceId}><td>{log.deviceName || 'Unnamed device'}</td><td className="ag-mono">{log.version}</td><td>{log.lastSeen || 'Not reported'}</td></tr>)}</tbody></table>{entry.logs.length === 0 && <div className="ag-empty">No per-device records were returned for this application.</div>}</div>
        <footer><button type="button" className="ag-secondary" onClick={onClose}>Close</button></footer>
      </section>
    </div>
  )
}

export function AppGuardianPage({ onBack }: Props) {
  const [apps, setApps] = useState<ManageEngineAppEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [view, setView] = useState<View>('Overview')
  const [query, setQuery] = useState('')
  const [selectedApp, setSelectedApp] = useState<ManageEngineAppEntry | null>(null)
  const [lastLoaded, setLastLoaded] = useState<Date | null>(null)
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const inventory = await api.fetchManageEngineAppsInventory()
      setApps(inventory.macos)
      setLastLoaded(new Date())
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load the ManageEngine application inventory.')
      setApps([])
    } finally {
      setLoading(false)
    }
  }, [])

  // Initial load — loading is already true and error empty on first render.
  useEffect(() => {
    let cancelled = false
    api.fetchManageEngineAppsInventory()
      .then(inventory => {
        if (cancelled) return
        setApps(inventory.macos)
        setLastLoaded(new Date())
      })
      .catch((caught: unknown) => {
        if (cancelled) return
        setError(caught instanceof Error ? caught.message : 'Could not load the ManageEngine application inventory.')
        setApps([])
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const filteredApps = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase()
    if (!needle) return apps
    return apps.filter(app => `${app.name} ${app.appId} ${app.installedVersions.join(' ')}`.toLocaleLowerCase().includes(needle))
  }, [apps, query])
  const sortedApps = sortKey ? sortRows(filteredApps, app => {
    switch (sortKey) {
      case 'name': return app.name
      case 'versions': return app.installedVersions.join(', ')
      case 'baseline': return app.latestVersion
      case 'devices': return app.deviceCount
      case 'status': return app.updateStatus
      default: return ''
    }
  }, sortDirection) : filteredApps
  const handleSort = (key: string) => {
    setSortDirection(direction => toggleSortDirection(sortKey, direction, key))
    setSortKey(key)
  }

  const deviceCount = useMemo(() => apps.reduce((sum, app) => sum + app.deviceCount, 0), [apps])
  const driftCount = apps.filter(app => app.updateStatus === 'Update Available').length
  const unknownCount = apps.filter(app => app.updateStatus === 'Unknown').length
  const alignedCount = apps.filter(app => app.updateStatus === 'Up to date').length

  return (
    <div className="app-guardian page-enter">
      <header className="ag-header">
        <div className="ag-heading-lockup">
          <div className="ag-brand-icon"><ShieldCheck size={22} /></div>
          <div><span className="ag-eyebrow">ENDPOINT MANAGEMENT / APPLICATIONS</span><h1>App Guardian</h1><p>Mac application inventory and fleet version visibility</p></div>
        </div>
        <div className="ag-header-actions"><span className="ag-live-label"><i />ManageEngine API</span><button type="button" className="ag-refresh" onClick={() => void load()} disabled={loading}><RefreshCw size={15} className={loading ? 'ag-spin' : ''} />Refresh</button><button type="button" className="ag-back" onClick={onBack}><ArrowRight size={14} />Dashboard</button></div>
      </header>

      <div className="ag-trust-note"><LockKeyhole size={15} /><div><strong>Inventory only</strong><span>Fleet-observed versions are not vendor update availability. Installs require an approved source and signature-validation service, which are not connected to this API.</span></div><span className="ag-note-tag">NO INSTALL ACTIONS</span></div>

      <div className="ag-data-line"><span><i />{error ? 'API unavailable' : 'Live inventory'}</span><span><Clock3 size={13} />{lastLoaded ? `Fetched ${lastLoaded.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Waiting for first fetch'}</span><button type="button" onClick={() => void load()} disabled={loading} aria-label="Refresh inventory"><RefreshCw size={14} /></button></div>

      {error ? (
        <section className="ag-error" role="alert"><AlertTriangle size={19} /><div><strong>ManageEngine inventory could not be loaded</strong><span>{error}</span><small>Check the ManageEngine integration in Settings, then retry.</small></div><button type="button" onClick={() => void load()}>Retry</button></section>
      ) : (
        <>
          <section className="ag-stats" aria-label="Mac application inventory summary">
            <Stat label="Mac applications" value={loading ? '—' : apps.length} detail="Distinct applications reported" tone="blue" icon={Layers3} />
            <Stat label="Reported installs" value={loading ? '—' : deviceCount} detail="App-device records in this view" tone="green" icon={Apple} />
            <Stat label="Fleet version drift" value={loading ? '—' : driftCount} detail="Multiple observed versions" tone="amber" icon={Activity} />
            <Stat label="Version unknown" value={loading ? '—' : unknownCount} detail="Inventory did not report version" tone="slate" icon={CircleHelp} />
          </section>

          <section className="ag-panel">
            <div className="ag-panel-heading"><div><span className="ag-eyebrow">MACOS APPLICATIONS</span><h2>{view === 'Overview' ? 'Inventory overview' : 'My Apps'}</h2><p>{view === 'Overview' ? `${alignedCount} apps have one observed version across reporting Macs.` : 'Search installed Mac applications and inspect device-level version records.'}</p></div><div className="ag-view-switch" role="group" aria-label="App Guardian view">{(['Overview', 'My Apps'] as const).map(item => <button type="button" key={item} className={view === item ? 'selected' : ''} onClick={() => setView(item)}>{item}</button>)}</div></div>

            <div className="ag-toolbar"><label className="ag-search"><Search size={15} /><input aria-label="Search Mac apps" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search app name, bundle ID, or version" />{query && <button type="button" aria-label="Clear search" onClick={() => setQuery('')}><X size={14} /></button>}</label><span className="ag-result-count">{loading ? 'Loading…' : `${filteredApps.length} application${filteredApps.length === 1 ? '' : 's'}`}</span></div>

            {loading ? <div className="ag-loading" role="status"><span className="ag-spinner" />Loading Mac application inventory…</div> : filteredApps.length === 0 ? <div className="ag-empty"><Layers3 size={22} /><strong>{query ? 'No matching applications' : 'No Mac applications reported'}</strong><span>{query ? 'Adjust the search or clear it to see the full inventory.' : 'Connect ManageEngine and sync an enrolled Mac to populate this view.'}</span>{query && <button type="button" onClick={() => setQuery('')}>Clear search</button>}</div> : (
              <div className="ag-table-wrap"><table className="ag-table"><thead><tr>
                <SortableHeader label="APPLICATION" sortKey="name" activeSortKey={sortKey} direction={sortDirection} onSort={handleSort} />
                <SortableHeader label="OBSERVED VERSIONS" sortKey="versions" activeSortKey={sortKey} direction={sortDirection} onSort={handleSort} />
                <SortableHeader label="FLEET BASELINE" sortKey="baseline" activeSortKey={sortKey} direction={sortDirection} onSort={handleSort} />
                <SortableHeader label="DEVICES" sortKey="devices" activeSortKey={sortKey} direction={sortDirection} onSort={handleSort} />
                <SortableHeader label="FLEET STATUS" sortKey="status" activeSortKey={sortKey} direction={sortDirection} onSort={handleSort} />
                <th><span className="sr-only">Details</span></th>
              </tr></thead><tbody>{sortedApps.map(app => <tr key={app.appId}><td><div className="ag-app-cell"><AppMark name={app.name} /><div><strong>{app.name}</strong><small>{app.appId}</small></div></div></td><td><div className="ag-version-list">{app.installedVersions.slice(0, 3).map(version => <span key={version}>{version}</span>)}{app.installedVersions.length > 3 && <span>+{app.installedVersions.length - 3} more</span>}</div></td><td className="ag-mono">{app.latestVersion}</td><td>{app.deviceCount}</td><td><Status entry={app} /></td><td><button type="button" className="ag-detail-button" onClick={() => setSelectedApp(app)}><FileText size={13} />Details</button></td></tr>)}</tbody></table></div>
            )}
            <footer className="ag-panel-footer"><span><Sparkles size={13} />Recommendations and installs are not enabled from this inventory endpoint.</span><span>Source: ManageEngine Endpoint Central</span></footer>
          </section>
        </>
      )}

      <div className="ag-next-step"><div><div className="ag-next-icon"><ArrowDownToLine size={17} /></div><div><strong>Verified updates are a separate workflow</strong><span>Vendor release feeds, admin approval policies, package signing checks, and a privileged install helper are required before update actions can be enabled.</span></div></div><span className="ag-build-tag">{loading ? 'SYNCING' : `${alignedCount} FLEET-ALIGNED`}</span></div>

      {selectedApp && <AppDetails entry={selectedApp} onClose={() => setSelectedApp(null)} />}
    </div>
  )
}
