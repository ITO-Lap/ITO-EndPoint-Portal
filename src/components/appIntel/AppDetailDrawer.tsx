import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, RefreshCw, AlertCircle, Package, Copy, ExternalLink, Send } from 'lucide-react'
import { appIntelApi, PROVIDER_LABEL } from '../../api/appIntel'
import type { AppDetail, AppRequestRecord, AppRow, RequestKind } from '../../api/appIntel'
import { createPackage, hasPackager, intentToText } from '../../lib/packagingHandoff'
import { ConfidenceBadge, InstallSourceBadge, PackagingBadge, ProviderBadge, SeverityBadge, StatusBadge } from './badges'
import { RequestDialog } from './RequestDialog'
import { formatTime } from './format'

interface Props {
  row: AppRow
  onClose: () => void
  /** Creating a Jira request / Slack message is limited to admins; others see the lifecycle read-only. */
  canWrite?: boolean
  /** Called after a request is created so the list row can show it. */
  onRequested?: (record: AppRequestRecord) => void
}

const PACKAGING_STATUSES = ['Package required', 'Repackage required', 'Update available — existing package']
const fmtDate = (iso: string): string => new Date(iso).toLocaleString()

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-[0.65rem] font-bold uppercase tracking-wide text-slate-500">{title}</h3>
      {children}
    </section>
  )
}

export function AppDetailDrawer({ row, onClose, canWrite = false, onRequested }: Props) {
  const [detail, setDetail] = useState<AppDetail | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [copied, setCopied] = useState(false)
  const seq = useRef(0)
  const [requestKind, setRequestKind] = useState<RequestKind | null>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  const load = useCallback(() => {
    const mine = ++seq.current
    appIntelApi.detail(row.key)
      .then(d => { if (mine === seq.current) { setDetail(d); setState('ready') } })
      .catch(() => { if (mine === seq.current) setState('error') })
  }, [row.key])

  useEffect(() => { load() }, [load])
  useEffect(() => { closeRef.current?.focus() }, [])
  useEffect(() => {
    // While the request dialog is open, Escape belongs to the dialog.
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && !requestKind) onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose, requestKind])

  const title = `App details — ${row.app}`
  const app = detail?.app
  const intent = detail?.packagingIntent ?? null
  const total = app ? app.installed.reduce((n, i) => n + i.deviceCount, 0) : 0
  const packagerReady = intent ? hasPackager(intent.platform) : false
  const mismatch = !!app?.latest && (app?.affectedDevices ?? 0) > 0

  return createPortal(
    <div className="fixed inset-0 flex justify-end" style={{ zIndex: 100000, background: 'rgba(15,23,42,0.35)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <aside role="dialog" aria-modal="true" aria-label={title} className="flex h-full w-full flex-col bg-white shadow-2xl sm:max-w-2xl" style={{ borderLeft: '1px solid rgba(148,163,184,0.25)' }}>
        <header className="flex items-start justify-between gap-3 px-5 pt-5 pb-3" style={{ borderBottom: '1px solid rgba(148,163,184,0.15)' }}>
          <div className="min-w-0 space-y-1.5">
            <h2 className="text-sm font-bold text-slate-800 break-words">{row.app}</h2>
            <p className="text-[0.7rem] text-slate-500">{row.publisher ?? 'Publisher not reported'} · {row.platform === 'macOS' ? 'macOS' : 'Windows'}</p>
            <StatusBadge status={app?.status ?? row.status} />
          </div>
          <div className="flex flex-shrink-0 items-center gap-2">
            <button type="button" onClick={() => { setState('loading'); load() }} aria-label="Refresh app details"
              className="grid h-8 w-8 place-items-center rounded-xl border border-slate-200 text-slate-500 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400">
              <RefreshCw className={`h-4 w-4 ${state === 'loading' ? 'animate-spin' : ''}`} />
            </button>
            <button ref={closeRef} type="button" onClick={onClose} aria-label="Close app details"
              className="grid h-8 w-8 place-items-center rounded-xl border border-slate-200 text-slate-500 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400">
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-4">
          {state === 'loading' && !detail && (
            <div aria-busy="true" className="space-y-3">{[0, 1, 2].map(i => <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-100" />)}</div>
          )}
          {state === 'error' && (
            <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
              <p className="text-xs text-red-700">The app details could not be loaded.</p>
              <button type="button" onClick={() => { setState('loading'); load() }} className="rounded-lg border border-red-200 bg-white px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-100">Retry</button>
            </div>
          )}

          {app && detail && (
            <>
              <Section title="Why this status?">
                <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-700">{app.reason}</p>
                <p className="text-xs text-slate-600"><span className="font-semibold">Recommended action:</span> {app.action}</p>
                {intent && (
                  <div className="space-y-2 rounded-xl border border-orange-200 bg-orange-50/60 px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <button type="button" disabled={!packagerReady} onClick={() => createPackage(intent)}
                        title={packagerReady ? undefined : 'No packaging workflow is connected to this build'}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400">
                        <Package className="h-3.5 w-3.5" />Create package
                      </button>
                      <button type="button" onClick={() => { void navigator.clipboard?.writeText(intentToText(intent)); setCopied(true) }}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-orange-200 bg-white px-3 py-1.5 text-xs font-semibold text-orange-700 hover:bg-orange-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400">
                        <Copy className="h-3.5 w-3.5" />{copied ? 'Copied' : 'Copy package request'}
                      </button>
                    </div>
                    <p className="text-[0.65rem] text-slate-600">
                      Pre-fills the {intent.platform === 'macOS' ? 'Homebrew package builder' : 'WinGet packager'} with {intent.sourceKind === 'winget' ? 'winget id' : 'cask'} <code>{intent.sourceId ?? 'n/a'}</code> at {intent.targetVersion}.
                      {!packagerReady && ' No packaging workflow is connected to this build, so the action is unavailable; use the copied request instead.'}
                      {' '}Building only — nothing is published or deployed automatically.
                    </p>
                  </div>
                )}
              </Section>

              <Section title="Application lifecycle">
                {detail.lifecycle ? (
                  <div className="space-y-4">
                    <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="rounded-xl border border-slate-200 px-3 py-2">
                        <dt className="text-[0.6rem] font-bold uppercase tracking-wide text-slate-400">Owner</dt>
                        <dd className="mt-0.5 text-xs text-slate-800">{detail.lifecycle.owner.name ?? <span className="text-slate-400">Not recorded</span>}</dd>
                        {detail.lifecycle.owner.note && <p className="mt-0.5 text-[0.62rem] text-slate-400">{detail.lifecycle.owner.note}</p>}
                        {detail.lifecycle.owner.source && <p className="text-[0.62rem] text-slate-400">Source: {detail.lifecycle.owner.source}</p>}
                      </div>
                      <div className="rounded-xl border border-slate-200 px-3 py-2">
                        <dt className="text-[0.6rem] font-bold uppercase tracking-wide text-slate-400">Packaging status</dt>
                        <dd className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-800"><PackagingBadge state={detail.lifecycle.packaging.state} />{detail.lifecycle.packaging.packageName && <span className="truncate" title={detail.lifecycle.packaging.packageName}>{detail.lifecycle.packaging.packageName}</span>}</dd>
                        <p className="mt-0.5 text-[0.62rem] text-slate-500">{detail.lifecycle.packaging.summary}</p>
                        {detail.lifecycle.packaging.lastModifiedAt && <p className="text-[0.62rem] text-slate-400">Package modified {formatTime(detail.lifecycle.packaging.lastModifiedAt)}</p>}
                      </div>
                      <div className="rounded-xl border border-slate-200 px-3 py-2">
                        <dt className="text-[0.6rem] font-bold uppercase tracking-wide text-slate-400">Deployment ring</dt>
                        <dd className="mt-0.5 text-xs text-slate-800">{detail.lifecycle.ring.ring ?? <span className="text-slate-400">Not identified</span>}</dd>
                        {detail.lifecycle.ring.note && <p className="mt-0.5 text-[0.62rem] text-slate-400">{detail.lifecycle.ring.note}</p>}
                        {detail.lifecycle.ring.targets.length > 0 && (
                          <ul className="mt-1 space-y-0.5 text-[0.62rem] text-slate-500">
                            {detail.lifecycle.ring.targets.slice(0, 6).map((t, i) => <li key={i}>{t.intent} → {t.groupName ?? t.target}</li>)}
                          </ul>
                        )}
                      </div>
                      <div className="rounded-xl border border-slate-200 px-3 py-2">
                        <dt className="text-[0.6rem] font-bold uppercase tracking-wide text-slate-400">Estimated impacted devices</dt>
                        <dd className="mt-0.5 text-xs text-slate-800">
                          <span className="font-semibold tabular-nums">{detail.lifecycle.impact.devicesBehind.toLocaleString()}</span> of {detail.lifecycle.impact.totalDevices.toLocaleString()}
                          {detail.lifecycle.impact.percentBehind !== null && <> ({detail.lifecycle.impact.percentBehind}%)</>}
                        </dd>
                        {detail.cve.exposedDevices > 0 && <p className="text-[0.62rem] font-semibold text-red-700">{detail.cve.exposedDevices.toLocaleString()} on a version with known CVEs</p>}
                        <p className="mt-0.5 text-[0.62rem] text-slate-400">{detail.lifecycle.impact.basis}</p>
                      </div>
                    </dl>
                  </div>
                ) : <p className="text-xs text-slate-500">Lifecycle details are not available for this sync.</p>}

                <div className="space-y-2 rounded-xl border border-slate-200 px-3 py-2">
                  <p className="text-[0.6rem] font-bold uppercase tracking-wide text-slate-400">Known CVEs</p>
                  {detail.cve.state === 'unmapped' && <p className="text-xs text-slate-500">Not checked. {detail.cve.reason}</p>}
                  {detail.cve.state === 'pending' && <p className="text-xs text-slate-500">Still being checked against NVD — reopen shortly.</p>}
                  {detail.cve.state === 'unavailable' && <p role="alert" className="text-xs text-amber-800">NVD lookup unavailable: {detail.cve.reason}</p>}
                  {(detail.cve.state === 'ok' || detail.cve.state === 'partial') && detail.cve.counts.total === 0 && <p className="text-xs text-slate-600">None found in NVD for the checked versions. {detail.cve.reason ?? ''}</p>}
                  {detail.cve.counts.total > 0 && (
                    <>
                      <p className="text-xs text-slate-700"><span className="font-semibold">{detail.cve.counts.total}</span> CVE{detail.cve.counts.total === 1 ? '' : 's'}: {detail.cve.counts.critical} critical · {detail.cve.counts.high} high · {detail.cve.counts.medium} medium · {detail.cve.counts.low} low{detail.cve.counts.knownExploited > 0 && <span className="font-semibold text-red-700"> · {detail.cve.counts.knownExploited} known exploited (CISA KEV)</span>}</p>
                      <ul className="max-h-48 space-y-1.5 overflow-y-auto">
                        {detail.cve.cves.slice(0, 15).map(c => (
                          <li key={c.id} className="text-[0.68rem] text-slate-600">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <a href={c.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-mono font-semibold text-orange-700 hover:underline">{c.id}<ExternalLink className="h-3 w-3" /></a>
                              <SeverityBadge severity={c.severity} kev={c.knownExploited} />{c.score !== null && <span className="tabular-nums text-slate-400">{c.score.toFixed(1)}</span>}
                              <span className="text-slate-400">in {c.versions.join(', ')}</span>
                            </div>
                            <p className="mt-0.5 line-clamp-2 text-slate-500">{c.summary}</p>
                          </li>
                        ))}
                      </ul>
                      {detail.cve.cves.length > 15 && <p className="text-[0.62rem] text-slate-400">+{detail.cve.cves.length - 15} more not shown</p>}
                    </>
                  )}
                  {detail.cve.state === 'partial' && detail.cve.reason && <p className="text-[0.62rem] text-amber-700">{detail.cve.reason}</p>}
                  <p className="text-[0.62rem] text-slate-400">{detail.cve.note}{detail.cve.cpe ? ` Product: ${detail.cve.cpe}.` : ''}</p>
                </div>

                <div className="space-y-1.5 rounded-xl border border-slate-200 px-3 py-2">
                  <p className="text-[0.6rem] font-bold uppercase tracking-wide text-slate-400">Latest release notes{app.latest ? ` — ${app.latest.version}` : ''}</p>
                  {app.latest?.releaseNotes?.summary && <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate-50 px-2 py-1.5 font-sans text-[0.68rem] leading-relaxed text-slate-700">{app.latest.releaseNotes.summary}</pre>}
                  {app.latest?.releaseNotes?.url && <a href={app.latest.releaseNotes.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-orange-700 hover:underline">Full release notes<ExternalLink className="h-3 w-3" /></a>}
                  {app.latest && !app.latest.releaseNotes?.summary && !app.latest.releaseNotes?.url && (
                    <p className="text-xs text-slate-500">{app.latest.releaseNotes?.unavailableReason ?? 'Release notes are not available for this version.'}
                      {app.latest.releaseNotes?.vendorUrl && <> Vendor site: <a href={app.latest.releaseNotes.vendorUrl} target="_blank" rel="noreferrer" className="font-semibold text-orange-700 hover:underline">{app.latest.releaseNotes.vendorUrl}</a>.</>}</p>
                  )}
                  {!app.latest && <p className="text-xs text-slate-500">No verified latest version, so no release notes.</p>}
                  {app.latest?.releaseNotes && <p className="text-[0.62rem] text-slate-400">Source: {app.latest.releaseNotes.source}</p>}
                </div>

                {mismatch && (
                  <div className="space-y-2 rounded-xl border border-orange-200 bg-orange-50/60 px-3 py-2.5">
                    <p className="text-[0.6rem] font-bold uppercase tracking-wide text-orange-700">Raise this mismatch</p>
                    {detail.requests.length > 0 && (
                      <ul className="space-y-0.5 text-[0.68rem] text-slate-600">
                        {detail.requests.map(r => (
                          <li key={r.id}>{r.kind === 'jira' ? 'Packaging request' : 'Slack notification'} for {r.targetVersion}
                            {r.externalKey && r.externalUrl && <> — <a href={r.externalUrl} target="_blank" rel="noreferrer" className="font-semibold text-orange-700 hover:underline">{r.externalKey}</a></>}
                            <span className="text-slate-400"> · {fmtDate(r.createdAt)} by {r.createdBy}</span></li>
                        ))}
                      </ul>
                    )}
                    {canWrite ? (
                      <div className="flex flex-wrap gap-2">
                        {PACKAGING_STATUSES.includes(app.status) && (
                          <button type="button" onClick={() => setRequestKind('jira')}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400">
                            <Package className="h-3.5 w-3.5" />Create packaging request
                          </button>
                        )}
                        <button type="button" onClick={() => setRequestKind('slack')}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-orange-200 bg-white px-3 py-1.5 text-xs font-semibold text-orange-700 hover:bg-orange-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400">
                          <Send className="h-3.5 w-3.5" />Notify in Slack
                        </button>
                      </div>
                    ) : <p className="text-[0.65rem] text-slate-500">Creating a request or Slack notification needs the IT Admin or Global Admin role.</p>}
                    <p className="text-[0.62rem] text-slate-500">You will see exactly what is sent before it goes out. Repeats for the same app and version are blocked.</p>
                  </div>
                )}
              </Section>

              <Section title="Install source">
                <div className="flex flex-wrap items-center gap-2"><InstallSourceBadge source={app.installSource} basis={app.installSourceBasis} /></div>
                <p className="text-xs leading-relaxed text-slate-600">{app.installSourceReason}</p>
                <p className="text-[0.65rem] text-slate-400">Derived from Intune packages and assignments, not from how an individual device received the app. The Endpoint Central self-service portal cannot be read with the current connection.</p>
              </Section>

              <Section title="Installed-version distribution">
                <div className="space-y-1.5">
                  {[...app.installed].sort((a, b) => b.deviceCount - a.deviceCount).map(i => (
                    <div key={`${i.provider}-${i.version}`} className="flex items-center gap-2 text-[0.7rem]">
                      <span className="w-40 flex-shrink-0 truncate font-mono text-slate-700" title={i.version}>{i.version}</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100" role="img" aria-label={`${i.version}: ${i.deviceCount} devices`}>
                        <div className="h-2 rounded-full bg-orange-400" style={{ width: `${total ? (i.deviceCount / total) * 100 : 0}%` }} />
                      </div>
                      <span className="w-10 text-right font-semibold tabular-nums text-slate-700">{i.deviceCount}</span>
                      <ProviderBadge provider={i.provider} />
                    </div>
                  ))}
                </div>
                <p className="text-[0.65rem] text-slate-400">
                  {app.affectedDevices > 0 ? `${app.affectedDevices} device(s) run a version older than the latest verified one. ` : ''}
                  Counts are per detected version; a device with several versions installed appears once per version.
                </p>
              </Section>

              <Section title={`Affected devices (${detail.devices.length})`}>
                <div className="flex gap-2">
                  {(['csv', 'xlsx'] as const).map(fmt => (
                    <button key={fmt} type="button" disabled={detail.devices.length === 0}
                      onClick={() => { void appIntelApi.exportReport({ platform: row.platform }, fmt, row.key).catch(e => window.alert(e instanceof Error ? e.message : 'Export failed.')) }}
                      className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[0.65rem] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                      Export devices ({fmt === 'csv' ? 'CSV' : 'Excel'})
                    </button>
                  ))}
                </div>
                {detail.devices.length === 0 ? (
                  <p className="text-xs text-slate-500">{detail.devicesNote ?? 'No device list is available for this app from the connected providers.'}</p>
                ) : (
                  <div className="max-h-56 overflow-y-auto rounded-xl border border-slate-100">
                    <table className="w-full text-left text-[0.7rem]">
                      <thead className="sticky top-0 bg-slate-50 text-[0.6rem] uppercase tracking-wide text-slate-400">
                        <tr><th className="px-3 py-1.5">Device</th><th className="px-3 py-1.5">User</th><th className="px-3 py-1.5">Version</th><th className="px-3 py-1.5">Source</th></tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {detail.devices.map((d, i) => (
                          <tr key={`${d.name}-${i}`}><td className="px-3 py-1.5 font-semibold text-slate-700">{d.name}</td><td className="px-3 py-1.5 text-slate-500">{d.user ?? '—'}</td><td className="px-3 py-1.5 font-mono">{d.version}</td><td className="px-3 py-1.5"><ProviderBadge provider={d.provider} /></td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {detail.devicesNote && detail.devices.length > 0 && <p className="text-[0.65rem] text-amber-700">{detail.devicesNote}</p>}
              </Section>

              <Section title="Package & deployment evidence">
                {app.packages.length === 0 ? (
                  <p className="text-xs text-slate-500">No package for this app was found in the Intune app catalog{detail.providerAsOf.intune ? '' : ' (the catalog was not read in the last sync)'}.</p>
                ) : (
                  <ul className="space-y-2">
                    {app.packages.map(p => (
                      <li key={p.packageId} className="rounded-xl border border-slate-200 px-3 py-2 text-[0.7rem] text-slate-600">
                        <p className="font-semibold text-slate-800">{p.displayName || p.packageId} <span className="font-normal text-slate-400">({p.odataType})</span></p>
                        <p>Version: <span className="font-mono">{p.version ?? 'not reported by Intune'}</span>{p.versionSource ? <span className="text-slate-400"> — {p.versionSource}</span> : null}</p>
                        <p>Matched by <strong>{p.matchBasis}</strong>{p.matchBasis === 'name' ? ' — low confidence, not a strong identifier' : ''} · modified {formatTime(p.lastModifiedAt)}</p>
                        {Array.isArray(detail.assignments[p.packageId])
                          ? <p>Assignments: {(detail.assignments[p.packageId] as Array<{ intent: string; target: string }>).map(a => `${a.intent} → ${a.target}`).join(', ') || 'none'}</p>
                          : detail.assignments[p.packageId] === 'unavailable' ? <p className="text-amber-700">Assignments could not be read.</p> : null}
                      </li>
                    ))}
                  </ul>
                )}
              </Section>

              <Section title="Latest-version source & comparison">
                {app.latest ? (
                  <div className="rounded-xl border border-slate-200 px-3 py-2 text-[0.7rem] text-slate-600">
                    <p>Latest verified version: <span className="font-mono font-semibold text-slate-800">{app.latest.version}</span></p>
                    <p>Source: {app.latest.versionSource} · checked {formatTime(app.latest.lastCheckedAt)}</p>
                    <p className="break-all">Evidence: <a href={app.latest.sourceUrl} target="_blank" rel="noreferrer" className="text-orange-700 hover:underline">{app.latest.sourceUrl}</a></p>
                    {app.latest.selfUpdating && <p className="text-violet-700">The source reports this app updates itself.</p>}
                  </div>
                ) : (
                  <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    {app.latestUnavailable ? `Unavailable — ${app.latestUnavailable.reason} (checked ${formatTime(app.latestUnavailable.lastCheckedAt)}).` : 'No verified latest-version source is mapped for this app. The latest version is never inferred from inventory.'}
                  </p>
                )}
                {app.evidence.find(e => e.label === 'Comparison') && <p className="text-xs text-slate-600"><span className="font-semibold">Comparison:</span> {app.evidence.find(e => e.label === 'Comparison')!.value}</p>}
              </Section>

              <Section title="Matching confidence & data gaps">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600"><ConfidenceBadge confidence={app.confidence} /><span>{app.confidenceReason}</span></div>
                <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1 text-[0.7rem]">
                  {([['Bundle id', app.identity.bundleId], ['winget id', app.identity.wingetId], ['Homebrew cask', app.identity.brewToken], ['Product code', app.identity.productCode]] as const).map(([k, v]) => (
                    <div key={k} className="contents"><dt className="text-slate-400">{k}</dt><dd className="font-mono text-slate-700">{v ?? '—'}</dd></div>
                  ))}
                </dl>
                {app.dataGaps.length > 0 ? (
                  <ul className="space-y-1">{app.dataGaps.map((g, i) => <li key={i} className="flex items-start gap-1.5 text-xs text-amber-800"><AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />{g}</li>)}</ul>
                ) : <p className="text-xs text-slate-500">No data gaps recorded.</p>}
              </Section>

              <Section title="Data sources & freshness">
                <div className="overflow-x-auto rounded-xl border border-slate-100">
                  <table className="w-full text-left text-[0.68rem]">
                    <thead className="bg-slate-50 text-[0.58rem] uppercase tracking-wide text-slate-400"><tr><th className="px-3 py-1.5">Value</th><th className="px-3 py-1.5">Detail</th><th className="px-3 py-1.5">Source</th><th className="px-3 py-1.5">As of</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {app.evidence.map((e, i) => (
                        <tr key={i} className="align-top"><td className="px-3 py-1.5 font-semibold text-slate-700">{e.label}</td><td className="px-3 py-1.5 text-slate-600 break-words">{e.value}</td><td className="px-3 py-1.5 text-slate-500">{e.source}</td><td className="px-3 py-1.5 whitespace-nowrap text-slate-500">{formatTime(e.asOf)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-[0.65rem] text-slate-400">
                  Inventory last synced {formatTime(detail.syncedAt)} ·{' '}
                  {(Object.keys(detail.providerAsOf) as Array<keyof typeof PROVIDER_LABEL>).map(p => `${PROVIDER_LABEL[p]}: ${formatTime(detail.providerAsOf[p])}`).join(' · ')}
                </p>
              </Section>
            </>
          )}
        </div>
      </aside>
      {requestKind && (
        <RequestDialog appKey={row.key} appName={row.app} kind={requestKind} onClose={() => setRequestKind(null)}
          onDone={record => { onRequested?.(record); load() }} />
      )}
    </div>,
    document.body,
  )
}
