import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { AlertTriangle, CalendarPlus, ChevronLeft, ChevronRight, Download, ExternalLink, Loader2, RefreshCw, X } from 'lucide-react'
import { Modal } from '../components/ui/Modal'
import { windowsUpdatesApi, type WuCve, type WuCveDetail, type WuEpss, type WuFleet, type WuFleetBuild, type WuBand, type WuKevClock, type WuIntel, type WuLifecycle, type WuMonth, type WuRow, type WuTopUpdate } from '../api/windowsUpdates'

type Tab = 'exposure' | 'risk' | 'security' | 'upcoming' | 'devices'
const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'exposure', label: 'Fleet exposure' }, { id: 'risk', label: 'Risk & deadlines' }, { id: 'security', label: 'Security releases' },
  { id: 'upcoming', label: 'Upcoming & lifecycle' }, { id: 'devices', label: 'Devices' },
]

type KindFilter = 'all' | 'Security update' | 'Feature update'
type PriorityFilter = 'all' | WuRow['priority']
type CveFilter = 'all' | 'critical' | 'exploited' | 'kev' | 'likely' | 'disclosed'
type SortKey = 'priority' | 'device' | 'update' | 'kind' | 'severity' | 'days'

type Drill =
  | { type: 'devices-affected' }
  | { type: 'update'; update: WuTopUpdate }
  | { type: 'device'; name: string }
  | { type: 'build'; build: WuFleetBuild; fixed?: { kb: string; build: string } }
  | { type: 'lifecycle'; row: WuLifecycle }
  | { type: 'patch-tuesday' }
  | { type: 'kev'; item: WuKevClock }

const SEV: Record<string, string> = {
  Critical: 'bg-red-50 text-red-700 border-red-200', Important: 'bg-orange-50 text-orange-700 border-orange-200',
  Moderate: 'bg-amber-50 text-amber-700 border-amber-200', Low: 'bg-slate-50 text-slate-600 border-slate-200',
}
const PRIORITY: Record<string, string> = { 'P1 Urgent': 'bg-red-100 text-red-700', 'P2 High': 'bg-orange-100 text-orange-700', 'P3 Normal': 'bg-slate-100 text-slate-600' }
const BAND: Record<WuBand, string> = { Critical: 'bg-red-100 text-red-700', High: 'bg-orange-100 text-orange-700', Medium: 'bg-amber-100 text-amber-700', Low: 'bg-emerald-100 text-emerald-700' }
const BAND_BAR: Record<WuBand, string> = { Critical: 'bg-red-500', High: 'bg-orange-500', Medium: 'bg-amber-400', Low: 'bg-emerald-500' }
const KEV_STATUS = { overdue: { cls: 'bg-red-100 text-red-700', label: 'Overdue' }, 'due-soon': { cls: 'bg-orange-100 text-orange-700', label: 'Due soon' }, 'on-track': { cls: 'bg-emerald-100 text-emerald-700', label: 'On track' } } as const
const kevWhen = (d: number): string => (d < 0 ? `${-d} day${d === -1 ? '' : 's'} overdue` : d === 0 ? 'due today' : `${d} day${d === 1 ? '' : 's'} left`)
const PRIORITY_RANK: Record<string, number> = { 'P1 Urgent': 0, 'P2 High': 1, 'P3 Normal': 2 }
const SEV_RANK: Record<string, number> = { Critical: 0, Important: 1, Moderate: 2, Low: 3, '': 4 }
const LIFE: Record<string, { label: string; cls: string }> = {
  supported: { label: 'Supported', cls: 'bg-emerald-100 text-emerald-700' }, 'ending-soon': { label: 'Ending soon', cls: 'bg-amber-100 text-amber-700' },
  ended: { label: 'Out of support', cls: 'bg-red-100 text-red-700' }, unknown: { label: 'Unknown', cls: 'bg-slate-100 text-slate-500' },
}
const lifeOf = (k: string) => LIFE[k] ?? LIFE['unknown']!

const fmtDate = (v: string | null | undefined): string => {
  if (!v) return '—'
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}
const cell = (v: string | number): string => `"${String(v).replace(/"/g, '""')}"`
const cveList = (s: string): string[] => s.split(/[,\s]+/).filter(x => /^CVE-\d{4}-\d{4,}$/.test(x))
const days = (r: WuRow): number => (r.daysMissing === '' ? -1 : r.daysMissing)

function download(name: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = Object.assign(document.createElement('a'), { href: url, download: name })
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
}
function exportRowsCsv(rows: WuRow[]): void {
  const head = ['Priority', 'Recommended Action', 'Device', 'Operating System', 'Update Type', 'Missing Update', 'KB', 'Severity', 'CVEs', 'Released', 'Days Missing', 'Reboot Required', 'Last Scan']
  const lines = rows.map(r => [r.priority, r.action, r.device, r.operatingSystem, r.kind, r.update, r.kb, r.severity, r.cves, r.releasedAt, r.daysMissing, r.rebootRequired, r.lastScan].map(cell).join(','))
  download(`windows-updates-${new Date().toISOString().slice(0, 10)}.csv`, [head.map(cell).join(','), ...lines].join('\r\n'), 'text/csv;charset=utf-8')
}
function downloadIcs(title: string, isoDate: string): void {
  const d = isoDate.replace(/-/g, '')
  const next = new Date(Date.parse(isoDate) + 86_400_000).toISOString().slice(0, 10).replace(/-/g, '')
  download(`${title.toLowerCase().replace(/\W+/g, '-')}.ics`, ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ITO Endpoint//Windows Updates//EN', 'BEGIN:VEVENT', `UID:${d}-${title.replace(/\W+/g, '')}@ito-endpoint`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`, `DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${next}`, `SUMMARY:${title}`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n'), 'text/calendar')
}

// ── Small building blocks ────────────────────────────────────────────────────────

function Card({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3"><h2 className="font-bold text-slate-800">{title}</h2>{right}</div>
      {children}
    </section>
  )
}
function Kpi({ label, value, tone = 'text-slate-900', hint, onClick, active }: { label: string; value: ReactNode; tone?: string; hint?: string; onClick?: () => void; active?: boolean }) {
  const body = <><p className="flex items-center justify-between text-xs font-semibold text-slate-500">{label}{onClick && <ChevronRight className="h-3.5 w-3.5 text-slate-300 group-hover:text-orange-500" />}</p><p className={`mt-1 text-2xl font-bold ${tone}`}>{value}</p>{hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}</>
  return onClick
    ? <button type="button" onClick={onClick} aria-pressed={active} className={`group w-full rounded-2xl border bg-white p-4 text-left transition hover:border-orange-300 hover:shadow-sm ${active ? 'border-orange-400 ring-2 ring-orange-100' : 'border-slate-200'}`}>{body}</button>
    : <div className="rounded-2xl border border-slate-200 bg-white p-4">{body}</div>
}
const Pill = ({ cls, children, onClick, title }: { cls: string; children: ReactNode; onClick?: () => void; title?: string }) => onClick
  ? <button type="button" title={title} onClick={e => { e.stopPropagation(); onClick() }} className={`inline-flex rounded-full px-2 py-0.5 text-[0.68rem] font-semibold transition hover:ring-2 hover:ring-orange-200 ${cls}`}>{children}</button>
  : <span className={`inline-flex rounded-full px-2 py-0.5 text-[0.68rem] font-semibold ${cls}`}>{children}</span>
const Loading = ({ what }: { what: string }) => <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> {what}</div>
const ErrorBox = ({ msg }: { msg: string }) => <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{msg}</div>
const Th = ({ children, onClick, sorted }: { children: ReactNode; onClick?: () => void; sorted?: 'asc' | 'desc' | undefined }) => (
  <th className="px-4 py-2.5 font-semibold">{onClick ? <button type="button" onClick={onClick} className="inline-flex items-center gap-1 hover:text-slate-800">{children}<span className="text-[0.6rem] text-orange-500">{sorted === 'asc' ? '▲' : sorted === 'desc' ? '▼' : ''}</span></button> : children}</th>
)
const rowCls = 'cursor-pointer align-top transition hover:bg-orange-50/40'
const CveChip = ({ id, onOpen }: { id: string; onOpen: (id: string) => void }) => (
  <button type="button" onClick={e => { e.stopPropagation(); onOpen(id) }} className="rounded-md bg-sky-50 px-1.5 py-0.5 font-mono text-[0.68rem] font-semibold text-sky-700 hover:bg-sky-100">{id}</button>
)
const FilterChip = ({ children, onClear }: { children: ReactNode; onClear: () => void }) => (
  <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-700">{children}<button type="button" aria-label="Clear filter" onClick={onClear}><X className="h-3 w-3" /></button></span>
)

// ── CVE table + detail ───────────────────────────────────────────────────────────

function CveTable({ cves, epss, onOpen }: { cves: WuCve[]; epss: WuEpss; onOpen: (cve: string) => void }) {
  return (
    <div className="overflow-x-auto"><table className="w-full min-w-[860px] text-left text-xs"><thead className="bg-slate-50 text-slate-500"><tr><Th>CVE</Th><Th>Risk signals</Th><Th>Severity</Th><Th>CVSS</Th><Th>EPSS (30-day)</Th><Th>Impact</Th><Th>Fix (KB)</Th></tr></thead><tbody className="divide-y divide-slate-100">
      {cves.map(c => {
        const e = epss[c.cve]
        return (
          <tr key={c.cve} onClick={() => onOpen(c.cve)} className={rowCls}>
            <td className="px-4 py-3"><span className="inline-flex items-center gap-1 font-mono font-semibold text-sky-700">{c.cve}</span><p className="mt-0.5 max-w-xs text-slate-500">{c.title}</p></td>
            <td className="px-4 py-3"><div className="flex flex-wrap gap-1">
              {c.exploited && <Pill cls="bg-red-600 text-white">Exploited (Microsoft)</Pill>}
              {c.kev && <Pill cls="bg-red-100 text-red-700">CISA KEV{c.kevDueDate ? ` · due ${fmtDate(c.kevDueDate)}` : ''}</Pill>}
              {c.ransomware && <Pill cls="bg-purple-100 text-purple-700">Ransomware use</Pill>}
              {c.disclosed && <Pill cls="bg-amber-100 text-amber-700">Publicly disclosed</Pill>}
              {c.exploitability === 'Exploitation More Likely' && <Pill cls="bg-orange-100 text-orange-700">Exploitation more likely</Pill>}
              {!c.exploited && !c.kev && !c.disclosed && c.exploitability !== 'Exploitation More Likely' && <span className="text-slate-400">{c.exploitability || 'No known exploitation'}</span>}
            </div></td>
            <td className="px-4 py-3"><span className={`rounded-full border px-2 py-0.5 font-semibold ${SEV[c.severity] ?? SEV['Low']}`}>{c.severity}</span></td>
            <td className="px-4 py-3 font-semibold text-slate-700">{c.cvss ?? '—'}</td>
            <td className="px-4 py-3 text-slate-600">{e ? <span title={`Among the ${(100 - e.percentile * 100).toFixed(1)}% most likely to be exploited`}><span className="font-semibold text-slate-800">{(e.score * 100).toFixed(1)}%</span><span className="text-slate-400"> · p{Math.round(e.percentile * 100)}</span></span> : <span className="text-slate-400">—</span>}</td>
            <td className="px-4 py-3 text-slate-600">{c.impact}</td>
            <td className="px-4 py-3 font-mono text-slate-600" onClick={e2 => e2.stopPropagation()}>{c.kbs.slice(0, 3).map(kb => <a key={kb} href={`https://support.microsoft.com/help/${kb.slice(2)}`} target="_blank" rel="noreferrer" className="mr-1.5 text-sky-700 hover:underline">{kb}</a>)}{c.kbs.length > 3 ? `+${c.kbs.length - 3}` : ''}</td>
          </tr>
        )
      })}
      {!cves.length && <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">No CVEs match this filter.</td></tr>}
    </tbody></table></div>
  )
}

function CveDetailModal({ id, known, detail, error, loading, onClose }: { id: string; known: WuCve | null; detail: WuCveDetail | null; error: string | null; loading: boolean; onClose: () => void }) {
  const n = detail?.nvd
  return (
    <Modal open title={id} description={known?.title ?? n?.description.slice(0, 110)} onClose={onClose} size="lg">
      <div className="space-y-4 text-sm">
        {known && <div className="flex flex-wrap gap-1.5">
          <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${SEV[known.severity] ?? SEV['Low']}`}>{known.severity}</span>
          {known.exploited && <Pill cls="bg-red-600 text-white">Exploited (Microsoft)</Pill>}
          {known.kev && <Pill cls="bg-red-100 text-red-700">CISA KEV{known.kevDueDate ? ` · due ${fmtDate(known.kevDueDate)}` : ''}</Pill>}
          {known.ransomware && <Pill cls="bg-purple-100 text-purple-700">Ransomware use</Pill>}
          {known.disclosed && <Pill cls="bg-amber-100 text-amber-700">Publicly disclosed</Pill>}
          {known.kbs.map(kb => <a key={kb} href={`https://support.microsoft.com/help/${kb.slice(2)}`} target="_blank" rel="noreferrer" className="rounded-full bg-sky-50 px-2 py-0.5 font-mono text-[0.68rem] font-semibold text-sky-700 hover:bg-sky-100">{kb}</a>)}
        </div>}
        {loading && <div className="flex items-center gap-2 text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Looking up NIST NVD and FIRST EPSS…</div>}
        {error && <ErrorBox msg={error} />}
        {detail && <>
          {detail.nvdStatus === 'ok' && n && <>
            <p className="leading-relaxed text-slate-700">{n.description}</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <Kpi label="CVSS (NVD)" value={n.cvss ? `${n.cvss.score} ${n.cvss.severity}` : '—'} hint={n.cvss ? `v${n.cvss.version} · ${n.cvss.source}` : 'Not scored'} />
              <Kpi label="EPSS (30-day exploit probability)" value={detail.epss ? `${(detail.epss.score * 100).toFixed(1)}%` : '—'} hint={detail.epss ? `${Math.round(detail.epss.percentile * 100)}th percentile · FIRST` : 'EPSS unavailable'} />
              <Kpi label="NVD status" value={n.status || '—'} hint={`Published ${fmtDate(n.published)} · modified ${fmtDate(n.lastModified)}`} />
            </div>
            {n.cvss?.vector && <p className="break-all rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs text-slate-600">{n.cvss.vector}</p>}
            {n.cwes.length > 0 && <p className="text-xs text-slate-600"><b>Weakness:</b> {n.cwes.map(w => <a key={w} href={`https://cwe.mitre.org/data/definitions/${w.slice(4)}.html`} target="_blank" rel="noreferrer" className="mr-2 font-mono text-sky-700 hover:underline">{w}</a>)}</p>}
            {n.references.length > 0 && <div><p className="mb-1 text-xs font-semibold text-slate-600">Advisories & references</p><ul className="space-y-1 text-xs">{n.references.map(r => <li key={r.url} className="flex flex-wrap items-center gap-2"><a href={r.url} target="_blank" rel="noreferrer" className="break-all text-sky-700 hover:underline">{r.url}</a>{r.tags.map(t => <Pill key={t} cls={t === 'Exploit' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'}>{t}</Pill>)}</li>)}</ul></div>}
          </>}
          {detail.nvdStatus === 'not_found' && <p className="rounded-lg bg-slate-50 px-3 py-2 text-slate-600">NIST NVD has no record for this CVE yet. Use the Microsoft advisory below.</p>}
          {detail.nvdStatus === 'error' && <ErrorBox msg={detail.nvdError ?? 'NIST NVD could not be reached.'} />}
          {detail.nvdStatus !== 'ok' && detail.epss && <p className="text-xs text-slate-600">EPSS: {(detail.epss.score * 100).toFixed(1)}% chance of exploitation in 30 days ({Math.round(detail.epss.percentile * 100)}th percentile).</p>}
          <div><p className="mb-1 text-xs font-semibold text-slate-600">Look it up elsewhere</p><div className="flex flex-wrap gap-2">{detail.links.map(l => <a key={l.url} href={l.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50">{l.label}<ExternalLink className="h-3 w-3" /></a>)}</div></div>
        </>}
      </div>
    </Modal>
  )
}

// ── Lifecycle ────────────────────────────────────────────────────────────────────

const revisionOf = (v: string): number => Number(v.split('.')[3] ?? NaN)

/** Devices on one Windows build; with a fixed build, shows which already have that month's fix. */
function BuildDevices({ build, fixed, onOpen }: { build: WuFleetBuild; fixed: { kb: string; build: string } | undefined; onOpen: (name: string) => void }) {
  const [q, setQ] = useState('')
  const [show, setShow] = useState<'all' | 'patched' | 'unpatched'>('all')
  const target = fixed ? revisionOf(fixed.build) : NaN
  const rows = build.deviceList.map(d => { const rev = revisionOf(d.osVersion); return { ...d, patched: Number.isNaN(target) || Number.isNaN(rev) ? null : rev >= target } })
  const patched = rows.filter(r => r.patched === true).length
  const shown = rows.filter(r => (show === 'all' || (show === 'patched' ? r.patched === true : r.patched === false)) && (!q || r.name.toLowerCase().includes(q.toLowerCase())))
  if (!rows.length) return <p className="text-xs text-slate-500">No device list is available for this build.</p>
  return (
    <div className="space-y-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-semibold text-slate-800">{rows.length} device{rows.length === 1 ? '' : 's'}{build.devices > rows.length ? ` (showing first ${rows.length})` : ''}{fixed && !Number.isNaN(target) ? ` · ${patched} on ${fixed.kb} or newer · ${rows.length - patched} not yet` : ''}</p>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search device" className="ml-auto rounded-lg border border-slate-200 px-2 py-1" />
        {fixed && !Number.isNaN(target) && (['all', 'patched', 'unpatched'] as const).map(k => <button key={k} type="button" onClick={() => setShow(k)} className={`rounded-full border px-2.5 py-1 font-semibold ${show === k ? 'border-orange-300 bg-orange-50 text-orange-700' : 'border-slate-200 text-slate-600'}`}>{k === 'all' ? 'All' : k === 'patched' ? 'Patched' : 'Not yet'}</button>)}
      </div>
      <div className="max-h-72 overflow-auto rounded-xl border border-slate-200"><table className="w-full text-left"><thead className="sticky top-0 bg-slate-50 text-slate-500"><tr><Th>Device</Th><Th>OS version</Th>{fixed && <Th>{fixed.kb}</Th>}</tr></thead><tbody className="divide-y divide-slate-100">
        {shown.map(d => <tr key={d.name} onClick={() => onOpen(d.name)} className={rowCls}><td className="px-3 py-2 font-semibold text-slate-800">{d.name}</td><td className="px-3 py-2 font-mono text-slate-600">{d.osVersion}</td>{fixed && <td className="px-3 py-2">{d.patched === null ? <span className="text-slate-400">—</span> : <Pill cls={d.patched ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-700'}>{d.patched ? 'Patched' : 'Missing'}</Pill>}</td>}</tr>)}
        {!shown.length && <tr><td colSpan={3} className="px-3 py-4 text-center text-slate-500">No devices match.</td></tr>}
      </tbody></table></div>
    </div>
  )
}

function LifecycleTable({ rows, fleetByBuild, onOpen }: { rows: WuLifecycle[]; fleetByBuild: Map<number, WuFleetBuild>; onOpen: (r: WuLifecycle) => void }) {
  return (
    <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-xs"><thead className="bg-slate-50 text-slate-500"><tr><Th>Version</Th><Th>Build</Th><Th>Released</Th><Th>End of servicing</Th><Th>Your devices</Th><Th>Status</Th></tr></thead><tbody className="divide-y divide-slate-100">
      {rows.map(r => {
        const f = fleetByBuild.get(r.build)
        return (
          <tr key={r.version} onClick={() => onOpen(r)} className={rowCls}>
            <td className="px-4 py-3 font-semibold text-slate-800">{r.version}</td><td className="px-4 py-3 font-mono text-slate-600">{r.latestBuild}</td><td className="px-4 py-3 text-slate-600">{fmtDate(r.releaseDate)}</td>
            <td className="px-4 py-3 text-slate-600">{r.endOfServicing.map(e => <div key={e.edition}>{e.edition}: {fmtDate(e.date)}</div>)}</td>
            <td className="px-4 py-3 font-semibold text-slate-800">{f ? f.devices : <span className="font-normal text-slate-400">0</span>}</td>
            <td className="px-4 py-3"><Pill cls={lifeOf(r.status).cls}>{lifeOf(r.status).label}</Pill>{r.status !== 'ended' && <span className="ml-2 text-slate-400">{r.daysToEnd} days to next end date</span>}</td>
          </tr>
        )
      })}
    </tbody></table></div>
  )
}

function lifecycleAdvice(r: WuLifecycle, devices: number): string {
  if (r.status === 'ended') return `${r.version} no longer receives security updates.${devices ? ` ${devices} of your devices still run it: upgrade them to the current release as a priority.` : ''}`
  if (r.status === 'ending-soon') return `${r.version} reaches its next end of servicing in ${r.daysToEnd} days.${devices ? ` Plan the upgrade for the ${devices} devices on it before then.` : ''}`
  return `${r.version} is fully supported.${devices ? ` ${devices} of your devices run it.` : ''}`
}

// ── Page ─────────────────────────────────────────────────────────────────────────

export function WindowsUpdatesPage({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState<Tab>('exposure')
  const [fleet, setFleet] = useState<WuFleet | null>(null)
  const [intel, setIntel] = useState<WuIntel | null>(null)
  const [fleetErr, setFleetErr] = useState<string | null>(null)
  const [intelErr, setIntelErr] = useState<string | null>(null)
  const [loadingFleet, setLoadingFleet] = useState(true)
  const [loadingIntel, setLoadingIntel] = useState(true)
  // Devices tab
  const [kind, setKind] = useState<KindFilter>('all')
  const [priority, setPriority] = useState<PriorityFilter>('all')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'priority', dir: 'asc' })
  // Security tab
  const [cveFilter, setCveFilter] = useState<CveFilter>('all')
  const [impact, setImpact] = useState<string | null>(null)
  const [cveLimit, setCveLimit] = useState(25)
  const [epss, setEpss] = useState<WuEpss>({})
  // Drill-downs
  const [drill, setDrill] = useState<Drill | null>(null)
  const [riskBand, setRiskBand] = useState<'all' | WuBand>('all')
  const [openedCve, setOpenedCve] = useState<string | null>(null)
  const [cveDetail, setCveDetail] = useState<WuCveDetail | null>(null)
  const [cveErr, setCveErr] = useState<string | null>(null)
  const [cveLoading, setCveLoading] = useState(false)

  const loadFleet = useCallback(async (refresh = false) => {
    setLoadingFleet(true); setFleetErr(null)
    try { setFleet(await windowsUpdatesApi.fleet(refresh)) } catch (e) { setFleetErr(e instanceof Error ? e.message : 'Could not load fleet data') } finally { setLoadingFleet(false) }
  }, [])
  const loadIntel = useCallback(async (refresh = false) => {
    setLoadingIntel(true); setIntelErr(null)
    try { setIntel(await windowsUpdatesApi.intel(refresh)) } catch (e) { setIntelErr(e instanceof Error ? e.message : 'Could not load Microsoft intelligence') } finally { setLoadingIntel(false) }
  }, [])
  useEffect(() => { void loadFleet(); void loadIntel() }, [loadFleet, loadIntel])
  // The fleet view is served without waiting for Microsoft data; once that arrives, reload it to add support status and CVE context.
  const fleetNeedsIntel = !!fleet?.warnings.some(w => w.includes('still loading'))
  useEffect(() => { if (intel && fleetNeedsIntel) void loadFleet() }, [intel, fleetNeedsIntel, loadFleet])

  const latest = intel?.latestRelease ?? null
  const topIds = latest?.topCves.map(c => c.cve).join(',') ?? ''
  useEffect(() => { if (topIds) windowsUpdatesApi.epss(topIds.split(',').slice(0, 100)).then(setEpss).catch(() => undefined) }, [topIds])

  const knownCves = useMemo(() => new Map((latest?.topCves ?? []).map(c => [c.cve, c])), [latest])
  const openCve = useCallback(async (id: string) => {
    setOpenedCve(id); setCveDetail(null); setCveErr(null); setCveLoading(true)
    try { setCveDetail(await windowsUpdatesApi.cve(id)) } catch (e) { setCveErr(e instanceof Error ? e.message : 'Could not look up this CVE') } finally { setCveLoading(false) }
  }, [])

  const goDevices = (f: { kind?: KindFilter; priority?: PriorityFilter; search?: string }) => {
    setKind(f.kind ?? 'all'); setPriority(f.priority ?? 'all'); setSearch(f.search ?? ''); setTab('devices'); setDrill(null)
  }
  const toggleSort = (key: SortKey) => setSort(s => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }))

  const rows = useMemo(() => {
    const q = search.toLowerCase()
    const list = (fleet?.rows ?? []).filter(r => (kind === 'all' || r.kind === kind) && (priority === 'all' || r.priority === priority) && (!q || `${r.device} ${r.update} ${r.kb} ${r.cves}`.toLowerCase().includes(q)))
    const dir = sort.dir === 'asc' ? 1 : -1
    const key = (r: WuRow): number | string => sort.key === 'priority' ? PRIORITY_RANK[r.priority] ?? 9 : sort.key === 'severity' ? SEV_RANK[r.severity] ?? 5 : sort.key === 'days' ? days(r) : sort.key === 'device' ? r.device.toLowerCase() : sort.key === 'update' ? r.update.toLowerCase() : r.kind
    return [...list].sort((a, b) => { const x = key(a), y = key(b); return (x < y ? -1 : x > y ? 1 : 0) * dir })
  }, [fleet, kind, priority, search, sort])

  const deviceSummary = useMemo(() => {
    const map = new Map<string, { device: string; os: string; updates: number; worst: string; days: number }>()
    for (const r of fleet?.rows ?? []) {
      const e = map.get(r.device) ?? { device: r.device, os: r.operatingSystem, updates: 0, worst: 'P3 Normal', days: -1 }
      e.updates++
      if ((PRIORITY_RANK[r.priority] ?? 9) < (PRIORITY_RANK[e.worst] ?? 9)) e.worst = r.priority
      e.days = Math.max(e.days, days(r))
      map.set(r.device, e)
    }
    return [...map.values()].sort((a, b) => (PRIORITY_RANK[a.worst] ?? 9) - (PRIORITY_RANK[b.worst] ?? 9) || b.updates - a.updates)
  }, [fleet])

  const cves = useMemo(() => {
    const list = (latest?.topCves ?? []).filter(c => (cveFilter === 'all' || (cveFilter === 'critical' && c.severity === 'Critical') || (cveFilter === 'exploited' && c.exploited) || (cveFilter === 'kev' && c.kev) || (cveFilter === 'likely' && c.exploitability === 'Exploitation More Likely') || (cveFilter === 'disclosed' && c.disclosed)) && (!impact || c.impact === impact))
    return list
  }, [latest, cveFilter, impact])
  const setCveTile = (f: CveFilter) => { setCveFilter(f); setCveLimit(25) }

  const fleetByBuild = useMemo(() => new Map((fleet?.builds ?? []).map(b => [b.build, b])), [fleet])
  const lifeByBuild = useMemo(() => new Map((intel?.lifecycle ?? []).map(l => [l.build, l])), [intel])
  const busy = loadingFleet || loadingIntel

  const rowsFor = (u: WuTopUpdate) => (fleet?.rows ?? []).filter(r => r.kind === u.kind && (u.kb ? r.kb === u.kb : r.update === u.update))

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <button type="button" onClick={onBack} className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800"><ChevronLeft className="h-3.5 w-3.5" /> Dashboard</button>
          <h1 className="text-xl font-bold text-slate-900">Windows Updates</h1>
          <p className="mt-1 text-sm text-slate-500">Security and feature updates missing on your Windows fleet, with Microsoft MSRC, CISA and lifecycle risk context. Click any number, tile, row or CVE to drill in.</p>
        </div>
        <button type="button" onClick={() => { void loadFleet(true); void loadIntel(true) }} disabled={busy} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} /> Refresh data</button>
      </div>

      <div role="tablist" className="flex flex-wrap gap-1 border-b border-slate-200">
        {TABS.map(t => <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold transition ${tab === t.id ? 'border-orange-500 text-orange-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>{t.label}</button>)}
      </div>

      {(tab === 'exposure' || tab === 'risk' || tab === 'devices') && (fleetErr ? <ErrorBox msg={fleetErr} /> : loadingFleet && !fleet ? <Loading what="Reading Endpoint Central and Intune…" /> : fleet && <>
        {fleet.error && <ErrorBox msg={fleet.error} />}
        {fleet.warnings.filter(w => !(intel && w.includes('still loading'))).map(w => <div key={w} className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{w}</div>)}

        {tab === 'exposure' && <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label="Devices affected" value={fleet.devicesAffected} hint={`of ${fleet.devicesChecked} Windows client devices · click for the list`} onClick={() => setDrill({ type: 'devices-affected' })} />
            <Kpi label="Missing security updates" value={fleet.totals.security} tone="text-red-600" hint="device × update pairs · click to filter" onClick={() => goDevices({ kind: 'Security update' })} />
            <Kpi label="Missing feature updates" value={fleet.totals.feature} tone="text-orange-600" hint={`target ${fleet.target.label} · click to filter`} onClick={() => goDevices({ kind: 'Feature update' })} />
            <Kpi label="Urgent (P1)" value={fleet.totals.urgent} tone={fleet.totals.urgent ? 'text-red-600' : 'text-slate-900'} hint={`${fleet.totals.high} high · ${fleet.totals.normal} normal · click to filter`} onClick={() => goDevices({ priority: 'P1 Urgent' })} />
          </div>
          {fleet.target.newerReleaseAvailable && <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">Feature updates are measured against <b>{fleet.target.label}</b> (build {fleet.target.build}). Microsoft has since released <b>{fleet.target.newerReleaseAvailable.version}</b> (build {fleet.target.newerReleaseAvailable.build}). Set <code className="rounded bg-white px-1">WINDOWS_FEATURE_TARGET_BUILD={fleet.target.newerReleaseAvailable.build}</code> on the server to track it.</div>}
          <Card title="Most widely missing updates" right={<span className="text-xs text-slate-500">Ranked by urgent devices, then devices affected · click a row for details</span>}>
            <div className="overflow-x-auto"><table className="w-full min-w-[860px] text-left text-xs"><thead className="bg-slate-50 text-slate-500"><tr><Th>Update</Th><Th>Type</Th><Th>Devices</Th><Th>Severity</Th><Th>Microsoft risk context</Th><Th>Oldest gap</Th></tr></thead><tbody className="divide-y divide-slate-100">
              {fleet.topUpdates.map(u => (
                <tr key={`${u.kind}-${u.kb || u.update}`} onClick={() => setDrill({ type: 'update', update: u })} className={rowCls}>
                  <td className="px-4 py-3"><p className="font-semibold text-slate-800">{u.update}</p><p className="font-mono text-slate-400">{u.kb || '—'}{u.releasedAt ? ` · released ${u.releasedAt}` : ''}</p></td>
                  <td className="px-4 py-3"><Pill cls="bg-slate-100 text-slate-600" title="Filter devices by this type" onClick={() => goDevices({ kind: u.kind })}>{u.kind}</Pill></td>
                  <td className="px-4 py-3"><span className="font-semibold text-slate-800">{u.devices}</span>{u.urgentDevices > 0 && <span className="ml-1 text-red-600">({u.urgentDevices} urgent)</span>}</td>
                  <td className="px-4 py-3">{u.severity ? <span className={`rounded-full border px-2 py-0.5 font-semibold ${SEV[u.severity] ?? SEV['Low']}`}>{u.severity}</span> : <span className="text-slate-400">—</span>}</td>
                  <td className="px-4 py-3 text-slate-600">{u.msrc ? <>{u.msrc.cves} CVEs fixed · {u.msrc.critical} critical{u.msrc.exploited > 0 && <span className="ml-1 font-semibold text-red-600">· {u.msrc.exploited} exploited</span>}</> : u.cves.length ? `${u.cves.length} CVEs` : <span className="text-slate-400">No MSRC match</span>}</td>
                  <td className="px-4 py-3 text-slate-600">{u.maxDaysMissing !== null ? `${u.maxDaysMissing} days` : '—'}</td>
                </tr>
              ))}
              {!fleet.topUpdates.length && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">No missing Windows Feature or Security updates were reported.</td></tr>}
            </tbody></table></div>
          </Card>
          <Card title="Windows versions in your fleet" right={<span className="text-xs text-slate-500">Click a row for lifecycle and guidance</span>}>
            <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-left text-xs"><thead className="bg-slate-50 text-slate-500"><tr><Th>Version</Th><Th>Build</Th><Th>Devices</Th><Th>vs target</Th><Th>Microsoft support</Th></tr></thead><tbody className="divide-y divide-slate-100">
              {fleet.builds.map(b => (
                <tr key={b.build} onClick={() => setDrill({ type: 'build', build: b })} className={rowCls}><td className="px-4 py-3 font-semibold text-slate-800">{b.label}</td><td className="px-4 py-3 font-mono text-slate-600">{b.build}</td><td className="px-4 py-3 font-semibold text-slate-800">{b.devices}</td>
                  <td className="px-4 py-3"><Pill cls={b.status === 'behind' ? 'bg-orange-100 text-orange-700' : 'bg-emerald-100 text-emerald-700'}>{b.status === 'behind' ? 'Behind target' : b.status === 'current' ? 'On target' : 'Ahead of target'}</Pill></td>
                  <td className="px-4 py-3"><Pill cls={lifeOf(b.lifecycle).cls}>{lifeOf(b.lifecycle).label}</Pill>{b.endOfServicing.map(e => <span key={e.edition} className="ml-2 text-slate-400">{e.edition}: {fmtDate(e.date)}</span>)}</td></tr>
              ))}
              {!fleet.builds.length && <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">No Windows builds were reported by Intune.</td></tr>}
            </tbody></table></div>
          </Card>
        </>}

        {tab === 'risk' && (fleet.exposure ? (() => {
          const ex = fleet.exposure
          const total = Math.max(1, ex.scored)
          return <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {(['Critical', 'High', 'Medium', 'Low'] as WuBand[]).map(b => <Kpi key={b} label={`${b} exposure`} value={ex.bands[b]} tone={b === 'Critical' && ex.bands[b] ? 'text-red-600' : 'text-slate-900'} hint={`${Math.round(ex.bands[b] / total * 100)}% of scored devices · click to list`} onClick={() => setRiskBand(riskBand === b ? 'all' : b)} active={riskBand === b} />)}
            </div>
            <Card title="CISA KEV deadline clock" right={<span className="text-xs text-slate-500">Actively exploited Windows CVEs that still affect your devices · click a row for the devices</span>}>
              <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-xs"><thead className="bg-slate-50 text-slate-500"><tr><Th>CVE</Th><Th>Vulnerability</Th><Th>Deadline</Th><Th>Status</Th><Th>Devices still exposed</Th></tr></thead><tbody className="divide-y divide-slate-100">
                {ex.kevClock.map(k => <tr key={k.cve} onClick={() => setDrill({ type: 'kev', item: k })} className={rowCls}>
                  <td className="px-4 py-3 font-mono font-semibold text-sky-700">{k.cve}{k.ransomware && <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">Ransomware</span>}</td>
                  <td className="px-4 py-3 text-slate-700">{k.name}</td><td className="px-4 py-3 text-slate-600">{fmtDate(k.dueDate)}<p className="text-slate-400">{kevWhen(k.daysLeft)}</p></td>
                  <td className="px-4 py-3"><Pill cls={KEV_STATUS[k.status].cls}>{KEV_STATUS[k.status].label}</Pill></td><td className="px-4 py-3 font-semibold text-slate-800">{k.devices}</td></tr>)}
                {!ex.kevClock.length && <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">None of your devices are missing a fix for a CVE in CISA's Known Exploited Vulnerabilities catalog.</td></tr>}
              </tbody></table></div>
            </Card>
            <Card title="Device exposure ranking" right={<span className="text-xs text-slate-500">{riskBand === 'all' ? `Top ${ex.devices.length} of ${ex.scored} devices` : `${riskBand} only`} · score 0–100, click a row for why</span>}>
              <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-xs"><thead className="bg-slate-50 text-slate-500"><tr><Th>Device</Th><Th>Score</Th><Th>Top reasons</Th><Th>Missing</Th></tr></thead><tbody className="divide-y divide-slate-100">
                {ex.devices.filter(d => riskBand === 'all' || d.band === riskBand).slice(0, 100).map(d => <tr key={d.device} onClick={() => setDrill({ type: 'device', name: d.device })} className={rowCls}>
                  <td className="px-4 py-3 font-semibold text-slate-800">{d.device}</td>
                  <td className="px-4 py-3"><div className="flex items-center gap-2"><div className="h-1.5 w-16 rounded-full bg-slate-100"><div className={`h-1.5 rounded-full ${BAND_BAR[d.band]}`} style={{ width: `${d.score}%` }} /></div><Pill cls={BAND[d.band]}>{d.score} · {d.band}</Pill></div></td>
                  <td className="px-4 py-3 text-slate-600">{d.reasons.slice(0, 2).map(r => r.label).join(' · ') || '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{d.missingSecurity} security{d.missingFeature ? ` · ${d.missingFeature} feature` : ''}</td></tr>)}
              </tbody></table></div>
            </Card>
            <p className="text-xs text-slate-500">Score = exploited/KEV exposure (40) + overdue KEV deadlines (10) + severity (20) + exploitation probability{ex.epssUsed ? ' (EPSS, 15)' : ' (EPSS unavailable right now)'} + update age (15) + support status (20), capped at 100. {ex.coverage.note}</p>
          </>
        })() : <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">{fleet.configured ? (fleet.error ? 'Risk scoring is unavailable because the fleet data could not be read (see the message above).' : 'Risk scoring needs the Microsoft/CISA data, which is still loading. Refresh in a minute.') : 'Risk scoring needs Endpoint Central Patch Manager data, which is not available (see the message above).'}</div>)}

        {tab === 'devices' && (
          <Card title="Devices missing updates" right={<div className="flex flex-wrap items-center gap-2">
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search device, KB, CVE…" className="w-52 rounded-lg border border-slate-200 px-3 py-1.5 text-xs" />
            <select value={kind} onChange={e => setKind(e.target.value as KindFilter)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs"><option value="all">All types</option><option value="Security update">Security</option><option value="Feature update">Feature</option></select>
            <select value={priority} onChange={e => setPriority(e.target.value as PriorityFilter)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs"><option value="all">All priorities</option><option value="P1 Urgent">P1 Urgent</option><option value="P2 High">P2 High</option><option value="P3 Normal">P3 Normal</option></select>
            <button type="button" disabled={!rows.length} onClick={() => exportRowsCsv(rows)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40"><Download className="h-3 w-3" /> Export CSV</button>
          </div>}>
            {(kind !== 'all' || priority !== 'all' || search) && <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-2 text-xs text-slate-500">Filters:
              {kind !== 'all' && <FilterChip onClear={() => setKind('all')}>{kind}</FilterChip>}
              {priority !== 'all' && <FilterChip onClear={() => setPriority('all')}>{priority}</FilterChip>}
              {search && <FilterChip onClear={() => setSearch('')}>“{search}”</FilterChip>}
              <span>{rows.length} of {fleet.rows.length} rows</span></div>}
            <div className="overflow-x-auto"><table className="w-full min-w-[960px] text-left text-xs"><thead className="bg-slate-50 text-slate-500"><tr>
              <Th onClick={() => toggleSort('priority')} sorted={sort.key === 'priority' ? sort.dir : undefined}>Priority</Th><Th onClick={() => toggleSort('device')} sorted={sort.key === 'device' ? sort.dir : undefined}>Device</Th>
              <Th onClick={() => toggleSort('update')} sorted={sort.key === 'update' ? sort.dir : undefined}>Missing update</Th><Th onClick={() => toggleSort('kind')} sorted={sort.key === 'kind' ? sort.dir : undefined}>Type</Th>
              <Th onClick={() => toggleSort('severity')} sorted={sort.key === 'severity' ? sort.dir : undefined}>Severity</Th><Th onClick={() => toggleSort('days')} sorted={sort.key === 'days' ? sort.dir : undefined}>Days missing</Th><Th>Recommended action</Th></tr></thead><tbody className="divide-y divide-slate-100">
              {rows.slice(0, 500).map((r, i) => (
                <tr key={`${r.device}-${r.kb || r.update}-${i}`} onClick={() => setDrill({ type: 'device', name: r.device })} className={rowCls}>
                  <td className="px-4 py-3"><Pill cls={PRIORITY[r.priority] ?? ''} title="Filter by this priority" onClick={() => setPriority(r.priority)}>{r.priority}</Pill></td>
                  <td className="px-4 py-3"><p className="font-semibold text-slate-800">{r.device}</p><p className="text-slate-400">{r.operatingSystem}</p></td>
                  <td className="px-4 py-3"><p className="text-slate-800">{r.update}</p><div className="mt-0.5 flex flex-wrap items-center gap-1"><span className="font-mono text-slate-400">{r.kb}</span>{cveList(r.cves).slice(0, 3).map(id => <CveChip key={id} id={id} onOpen={openCve} />)}</div></td>
                  <td className="px-4 py-3"><Pill cls="bg-slate-100 text-slate-600" title="Filter by this type" onClick={() => setKind(r.kind)}>{r.kind}</Pill></td>
                  <td className="px-4 py-3 text-slate-600">{r.severity || '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{r.daysMissing === '' ? '—' : r.daysMissing}</td>
                  <td className="px-4 py-3 text-slate-600">{r.action}</td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">No devices match.</td></tr>}
            </tbody></table></div>
            {rows.length > 500 && <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">Showing 500 of {rows.length}. Export CSV for the full list.</p>}
          </Card>
        )}
      </>)}

      {tab === 'security' && (intelErr ? <ErrorBox msg={intelErr} /> : loadingIntel && !intel ? <Loading what="Fetching Microsoft MSRC and CISA data (the first load can take about a minute)…" /> : intel && (latest ? <>
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700"><b>{latest.title}</b> · released {fmtDate(latest.releasedAt)} · Windows 10/11 client CVEs only. Click a tile or an impact bar to filter the CVE list.</div>
        <MonthTiles month={latest} previous={intel.previousRelease} filter={cveFilter} onFilter={setCveTile} />
        <Card title="Vulnerability impact breakdown" right={impact ? <FilterChip onClear={() => setImpact(null)}>{impact}</FilterChip> : <span className="text-xs text-slate-500">Click a bar to filter</span>}>
          <div className="space-y-1 p-3">{latest.byImpact.map(i => { const max = Math.max(1, ...latest.byImpact.map(x => x.count)); return (
            <button key={i.impact} type="button" onClick={() => { setImpact(impact === i.impact ? null : i.impact); setCveLimit(25) }} aria-pressed={impact === i.impact} className={`flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-xs transition hover:bg-orange-50/60 ${impact === i.impact ? 'bg-orange-50' : ''}`}><span className="w-44 shrink-0 text-left text-slate-600">{i.impact}</span><div className="h-2 flex-1 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-sky-500" style={{ width: `${(i.count / max) * 100}%` }} /></div><span className="w-10 text-right font-semibold text-slate-700">{i.count}</span></button>
          ) })}</div>
        </Card>
        <Card title="Highest-risk CVEs this release" right={<span className="text-xs text-slate-500">Ranked: exploited → CISA KEV → disclosed → severity → CVSS · click a row for NVD/EPSS details</span>}>
          {(cveFilter !== 'all' || impact) && <p className="border-b border-slate-100 px-4 py-2 text-xs text-slate-500">Showing {cves.length} of the {latest.topCves.length} highest-risk CVEs that match{cveFilter !== 'all' ? ` “${cveFilter}”` : ''}{impact ? ` · ${impact}` : ''}. Tile totals count every Windows CVE this month.</p>}
          <CveTable cves={cves.slice(0, cveLimit)} epss={epss} onOpen={openCve} />
          {cves.length > cveLimit && <div className="border-t border-slate-100 px-4 py-2"><button type="button" onClick={() => setCveLimit(l => l + 25)} className="text-xs font-semibold text-orange-600 hover:underline">Show 25 more ({cves.length - cveLimit} remaining)</button></div>}
        </Card>
        <Card title="Fixed build per Windows version" right={<span className="text-xs text-slate-500">Click a KB to open Microsoft's article · click a device count to list the devices</span>}>
          <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-left text-xs"><thead className="bg-slate-50 text-slate-500"><tr><Th>Windows version</Th><Th>Update (KB)</Th><Th>Fixed build</Th><Th>Your devices</Th></tr></thead><tbody className="divide-y divide-slate-100">
            {latest.builds.filter(b => /x64/.test(b.product)).map(b => { const build = Number(b.fixedBuild.split('.')[2]); const f = fleetByBuild.get(build); return (
              <tr key={b.product + b.kb} className="hover:bg-slate-50"><td className="px-4 py-3 text-slate-800">{b.product.replace(/ for x64-based Systems/, '')}</td><td className="px-4 py-3 font-mono"><a href={`https://support.microsoft.com/help/${b.kb.slice(2)}`} target="_blank" rel="noreferrer" className="text-sky-700 hover:underline">{b.kb}</a></td><td className="px-4 py-3 font-mono text-slate-600">{b.fixedBuild}</td>
                <td className="px-4 py-3">{f ? <button type="button" onClick={() => setDrill({ type: 'build', build: f, fixed: { kb: b.kb, build: b.fixedBuild } })} className="font-semibold text-sky-700 hover:underline" title="List these devices">{f.devices} devices</button> : <span className="text-slate-400">0</span>}</td></tr>
            ) })}
          </tbody></table></div>
        </Card>
        <Card title="Recently added to CISA Known Exploited Vulnerabilities (Windows)" right={<span className="text-xs text-slate-500">Federal remediation deadlines are a good priority signal</span>}>
          <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-left text-xs"><thead className="bg-slate-50 text-slate-500"><tr><Th>CVE</Th><Th>Name</Th><Th>Added</Th><Th>Due</Th><Th>Ransomware</Th></tr></thead><tbody className="divide-y divide-slate-100">
            {intel.kevRecent.map(k => <tr key={k.cve} onClick={() => void openCve(k.cve)} className={rowCls}><td className="px-4 py-3 font-mono font-semibold text-sky-700">{k.cve}</td><td className="px-4 py-3 text-slate-600">{k.name}</td><td className="px-4 py-3 text-slate-600">{fmtDate(k.dateAdded)}</td><td className="px-4 py-3 text-slate-600">{fmtDate(k.dueDate)}</td><td className="px-4 py-3">{k.ransomware ? <Pill cls="bg-purple-100 text-purple-700">Known</Pill> : <span className="text-slate-400">Unknown</span>}</td></tr>)}
            {!intel.kevRecent.length && <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-500">No Windows entries available (source unreachable or none listed).</td></tr>}
          </tbody></table></div>
        </Card>
      </> : <ErrorBox msg="Microsoft MSRC data is unavailable right now. See the data source status below." />))}

      {tab === 'upcoming' && (intelErr ? <ErrorBox msg={intelErr} /> : loadingIntel && !intel ? <Loading what="Fetching Microsoft lifecycle data…" /> : intel && <>
        <div className="grid gap-3 md:grid-cols-3">
          <Kpi label="Next Patch Tuesday" value={fmtDate(intel.upcoming.nextPatchTuesday.date)} hint={`${intel.upcoming.nextPatchTuesday.daysAway === 0 ? 'Today' : `in ${intel.upcoming.nextPatchTuesday.daysAway} days`} · click to plan`} onClick={() => setDrill({ type: 'patch-tuesday' })} />
          <Kpi label="Next optional preview" value={fmtDate(intel.upcoming.nextOptionalPreview.date)} hint={`in ${intel.upcoming.nextOptionalPreview.daysAway} days · click to add to calendar`} onClick={() => downloadIcs('Windows optional non-security preview', intel.upcoming.nextOptionalPreview.date)} />
          {intel.newestFeatureRelease
            ? <Kpi label="Newest feature release" value={intel.newestFeatureRelease.version} hint={`build ${intel.newestFeatureRelease.build} · released ${fmtDate(intel.newestFeatureRelease.releaseDate)} · click for details`} onClick={() => { const r = intel.lifecycle.find(l => l.build === intel.newestFeatureRelease?.build); if (r) setDrill({ type: 'lifecycle', row: r }) }} />
            : <Kpi label="Newest feature release" value="—" hint="Not available" />}
        </div>
        <p className="text-xs text-slate-500">{intel.upcoming.note} Release dates above are computed from that cadence, not announced by Microsoft. Upcoming feature releases are published at <a className="text-sky-700 hover:underline" href="https://learn.microsoft.com/windows/release-health/" target="_blank" rel="noreferrer">Windows release health</a>.</p>
        {intel.earlyRelease && <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700"><b>{intel.earlyRelease.title}</b> was published {fmtDate(intel.earlyRelease.releasedAt)} ahead of Patch Tuesday: {intel.earlyRelease.advisories} advisories, {intel.earlyRelease.windowsAdvisories === 0 ? 'none affecting Windows 10/11 yet' : `${intel.earlyRelease.windowsAdvisories} affecting Windows 10/11`}. <a className="ml-1 inline-flex items-center gap-1 text-sky-700 hover:underline" href={`https://msrc.microsoft.com/update-guide/releaseNote/${intel.earlyRelease.id}`} target="_blank" rel="noreferrer">Release notes<ExternalLink className="h-3 w-3" /></a></div>}
        <Card title="Upcoming end of servicing" right={<span className="text-xs text-slate-500">Next 180 days · click a row</span>}>
          {intel.upcomingEndOfServicing.length ? <LifecycleTable rows={intel.upcomingEndOfServicing} fleetByBuild={fleetByBuild} onOpen={row => setDrill({ type: 'lifecycle', row })} /> : <p className="px-4 py-6 text-sm text-slate-500">No Windows 10/11 version reaches end of servicing in the next 180 days.</p>}
        </Card>
        <Card title="Windows 10 / 11 servicing lifecycle" right={<span className="text-xs text-slate-500">Click a row for guidance</span>}><LifecycleTable rows={intel.lifecycle} fleetByBuild={fleetByBuild} onOpen={row => setDrill({ type: 'lifecycle', row })} /></Card>
      </>)}

      {drill?.type === 'devices-affected' && (
        <Modal open title="Devices affected" description={`${deviceSummary.length} Windows client devices miss at least one update`} onClose={() => setDrill(null)} size="lg">
          <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="text-slate-500"><tr><Th>Device</Th><Th>Worst priority</Th><Th>Updates missing</Th><Th>Oldest gap</Th></tr></thead><tbody className="divide-y divide-slate-100">
            {deviceSummary.slice(0, 200).map(d => <tr key={d.device} onClick={() => setDrill({ type: 'device', name: d.device })} className={rowCls}><td className="px-4 py-2.5"><p className="font-semibold text-slate-800">{d.device}</p><p className="text-slate-400">{d.os}</p></td><td className="px-4 py-2.5"><Pill cls={PRIORITY[d.worst] ?? ''}>{d.worst}</Pill></td><td className="px-4 py-2.5 font-semibold text-slate-800">{d.updates}</td><td className="px-4 py-2.5 text-slate-600">{d.days >= 0 ? `${d.days} days` : '—'}</td></tr>)}
          </tbody></table></div>
          {deviceSummary.length > 200 && <p className="mt-2 text-xs text-slate-500">Showing 200 of {deviceSummary.length}. Use the Devices tab for filtering and export.</p>}
          <button type="button" onClick={() => goDevices({})} className="mt-3 text-xs font-semibold text-orange-600 hover:underline">Open the Devices tab →</button>
        </Modal>
      )}

      {drill?.type === 'update' && (() => {
        const u = drill.update, list = rowsFor(u), cv = u.cves
        return (
          <Modal open title={u.update} description={`${u.kind}${u.kb ? ` · ${u.kb}` : ''}`} onClose={() => setDrill(null)} size="lg">
            <div className="space-y-4 text-sm">
              <div className="grid gap-3 sm:grid-cols-3">
                <Kpi label="Devices missing it" value={u.devices} hint={`${u.urgentDevices} urgent`} />
                <Kpi label="Severity" value={u.severity || '—'} hint={u.releasedAt ? `released ${u.releasedAt}` : 'Release date not reported'} />
                <Kpi label="Oldest gap" value={u.maxDaysMissing !== null ? `${u.maxDaysMissing} days` : '—'} hint={u.msrc ? `MSRC: ${u.msrc.cves} CVEs · ${u.msrc.critical} critical${u.msrc.exploited ? ` · ${u.msrc.exploited} exploited` : ''}` : 'No MSRC match'} />
              </div>
              {u.kb && <a href={`https://support.microsoft.com/help/${u.kb.slice(2)}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-sky-700 hover:underline">Microsoft article for {u.kb}<ExternalLink className="h-3 w-3" /></a>}
              {cv.length > 0 && <div><p className="mb-1 text-xs font-semibold text-slate-600">CVEs fixed ({cv.length}) — click for NVD & EPSS details</p><div className="flex flex-wrap gap-1.5">{cv.slice(0, 40).map(id => <CveChip key={id} id={id} onOpen={openCve} />)}{cv.length > 40 && <span className="text-xs text-slate-400">+{cv.length - 40} more</span>}</div></div>}
              <div><p className="mb-1 text-xs font-semibold text-slate-600">Devices ({list.length})</p>
                <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-100"><table className="w-full text-left text-xs"><tbody className="divide-y divide-slate-100">
                  {list.slice(0, 200).map((r, i) => <tr key={`${r.device}-${i}`} onClick={() => setDrill({ type: 'device', name: r.device })} className={rowCls}><td className="px-3 py-2 font-semibold text-slate-800">{r.device}</td><td className="px-3 py-2"><Pill cls={PRIORITY[r.priority] ?? ''}>{r.priority}</Pill></td><td className="px-3 py-2 text-slate-500">{r.daysMissing === '' ? '—' : `${r.daysMissing} days`}</td></tr>)}
                </tbody></table></div></div>
              <div className="flex flex-wrap gap-3"><button type="button" onClick={() => goDevices({ search: u.kb || u.update })} className="text-xs font-semibold text-orange-600 hover:underline">Filter the Devices tab for this update →</button>
                <button type="button" onClick={() => exportRowsCsv(list)} className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:underline"><Download className="h-3 w-3" /> Export these devices</button></div>
            </div>
          </Modal>
        )
      })()}

      {drill?.type === 'device' && (() => {
        const list = (fleet?.rows ?? []).filter(r => r.device === drill.name)
        return (
          <Modal open title={drill.name} description={`${list.length} missing update${list.length === 1 ? '' : 's'} · ${list[0]?.operatingSystem ?? ''}`} onClose={() => setDrill(null)} size="lg">
            <div className="space-y-3">
              {(() => { const x = fleet?.exposure?.devices.find(e => e.device === drill.name); return x && <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs"><div className="flex items-center gap-2"><Pill cls={BAND[x.band]}>{x.score} · {x.band} exposure</Pill><span className="text-slate-500">Why this score</span></div><ul className="mt-2 space-y-1 text-slate-700">{x.reasons.map(r => <li key={r.label} className="flex justify-between gap-3"><span>{r.label}</span><span className="font-semibold">+{r.points}</span></li>)}</ul></div> })()}
              {list.map((r, i) => (
                <div key={`${r.kb}-${i}`} className="rounded-xl border border-slate-200 p-3 text-xs">
                  <div className="flex flex-wrap items-center gap-2"><Pill cls={PRIORITY[r.priority] ?? ''}>{r.priority}</Pill><span className="font-semibold text-slate-800">{r.update}</span></div>
                  <p className="mt-1 text-slate-500">{r.kind}{r.kb ? ` · ${r.kb}` : ''}{r.severity ? ` · ${r.severity}` : ''}{r.releasedAt ? ` · released ${r.releasedAt}` : ''}{r.daysMissing !== '' ? ` · missing ${r.daysMissing} days` : ''} · reboot {r.rebootRequired || 'unknown'} · last scan {r.lastScan || '—'}</p>
                  {cveList(r.cves).length > 0 && <div className="mt-1.5 flex flex-wrap gap-1">{cveList(r.cves).slice(0, 20).map(id => <CveChip key={id} id={id} onOpen={openCve} />)}</div>}
                  <p className="mt-1.5 text-slate-700"><b>Recommended:</b> {r.action}</p>
                </div>
              ))}
              {!list.length && <p className="text-sm text-slate-500">No missing updates found for this device in the current data.</p>}
              <button type="button" onClick={() => goDevices({ search: drill.name })} className="text-xs font-semibold text-orange-600 hover:underline">Show only this device in the Devices tab →</button>
            </div>
          </Modal>
        )
      })()}

      {drill?.type === 'kev' && (() => {
        const k = drill.item
        return (
          <Modal open title={k.cve} description={`${k.name} · CISA deadline ${fmtDate(k.dueDate)} (${kevWhen(k.daysLeft)})`} onClose={() => setDrill(null)} size="lg">
            <div className="space-y-3 text-xs">
              <div className="flex flex-wrap items-center gap-2"><Pill cls={KEV_STATUS[k.status].cls}>{KEV_STATUS[k.status].label}</Pill>{k.ransomware && <Pill cls="bg-red-100 text-red-700">Known ransomware use</Pill>}<button type="button" onClick={() => openCve(k.cve)} className="font-semibold text-sky-700 hover:underline">Open CVE details →</button></div>
              <p className="font-semibold text-slate-800">{k.devices} device{k.devices === 1 ? '' : 's'} still exposed{k.devices > k.deviceNames.length ? ` (showing ${k.deviceNames.length})` : ''}</p>
              <div className="flex flex-wrap gap-1.5">{k.deviceNames.map(n => <button key={n} type="button" onClick={() => setDrill({ type: 'device', name: n })} className="rounded-full border border-slate-200 bg-white px-2.5 py-1 font-semibold text-slate-700 hover:border-orange-300 hover:text-orange-600">{n}</button>)}</div>
            </div>
          </Modal>
        )
      })()}

      {drill?.type === 'build' && (() => {
        const b = drill.build, life = lifeByBuild.get(b.build)
        return (
          <Modal open title={b.label} description={`Build ${b.build} · ${b.devices} of your devices`} onClose={() => setDrill(null)} size="lg">
            <div className="space-y-3 text-sm">
              <div className="flex flex-wrap gap-2"><Pill cls={b.status === 'behind' ? 'bg-orange-100 text-orange-700' : 'bg-emerald-100 text-emerald-700'}>{b.status === 'behind' ? 'Behind target' : b.status === 'current' ? 'On target' : 'Ahead of target'}</Pill><Pill cls={lifeOf(b.lifecycle).cls}>{lifeOf(b.lifecycle).label}</Pill></div>
              {life ? <><p className="text-slate-700">{lifecycleAdvice(life, b.devices)}</p><LifecycleTable rows={[life]} fleetByBuild={fleetByBuild} onOpen={() => undefined} /></> : <p className="text-slate-600">Microsoft lifecycle data has no entry for build {b.build}; check Windows release health for its support dates.</p>}
              <BuildDevices build={b} fixed={drill.fixed} onOpen={name => setDrill({ type: 'device', name })} />
              {b.status === 'behind' && <button type="button" onClick={() => goDevices({ kind: 'Feature update' })} className="text-xs font-semibold text-orange-600 hover:underline">See devices missing the feature update →</button>}
            </div>
          </Modal>
        )
      })()}

      {drill?.type === 'lifecycle' && (() => {
        const r = drill.row, f = fleetByBuild.get(r.build)
        return (
          <Modal open title={r.version} description={`Build ${r.latestBuild} · released ${fmtDate(r.releaseDate)}`} onClose={() => setDrill(null)} size="lg">
            <div className="space-y-3 text-sm">
              <Pill cls={lifeOf(r.status).cls}>{lifeOf(r.status).label}</Pill>
              <p className="text-slate-700">{lifecycleAdvice(r, f?.devices ?? 0)}</p>
              <ul className="space-y-1 text-xs text-slate-600">{r.endOfServicing.map(e => { const d = Math.round((Date.parse(e.date) - Date.now()) / 86_400_000); return <li key={e.edition}><b>{e.edition}:</b> {fmtDate(e.date)} — {d >= 0 ? `${d} days remaining` : `ended ${-d} days ago`}</li> })}</ul>
              <div className="flex flex-wrap gap-3 text-xs">
                {f && <button type="button" onClick={() => setDrill({ type: 'build', build: f })} className="font-semibold text-orange-600 hover:underline">{f.devices} of your devices →</button>}
                {r.endOfServicing.filter(e => Date.parse(e.date) > Date.now()).slice(0, 1).map(e => <button key={e.date} type="button" onClick={() => downloadIcs(`${r.version} end of servicing (${e.edition})`, e.date)} className="inline-flex items-center gap-1 font-semibold text-slate-600 hover:underline"><CalendarPlus className="h-3 w-3" /> Add end date to calendar</button>)}
                <a href="https://learn.microsoft.com/windows/release-health/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-sky-700 hover:underline">Windows release health<ExternalLink className="h-3 w-3" /></a>
              </div>
            </div>
          </Modal>
        )
      })()}

      {drill?.type === 'patch-tuesday' && intel && (
        <Modal open title="Next Patch Tuesday" description={`${fmtDate(intel.upcoming.nextPatchTuesday.date)} · ${intel.upcoming.nextPatchTuesday.daysAway === 0 ? 'today' : `in ${intel.upcoming.nextPatchTuesday.daysAway} days`}`} onClose={() => setDrill(null)} size="lg">
          <div className="space-y-3 text-sm text-slate-700">
            <p>{intel.upcoming.note}</p>
            {latest && <p>Last release (<b>{latest.title}</b>) fixed <b>{latest.totals.cves}</b> Windows CVEs, <b>{latest.totals.critical}</b> critical, <b>{latest.totals.exploited}</b> exploited when released. Expect a similar volume.</p>}
            {fleet && <p>Today <b>{fleet.devicesAffected}</b> devices already miss updates ({fleet.totals.urgent} urgent). Clearing that backlog before the release keeps the next cycle manageable.</p>}
            <div className="flex flex-wrap gap-3 text-xs">
              <button type="button" onClick={() => downloadIcs('Windows Patch Tuesday', intel.upcoming.nextPatchTuesday.date)} className="inline-flex items-center gap-1 font-semibold text-orange-600 hover:underline"><CalendarPlus className="h-3 w-3" /> Add to calendar</button>
              <a href="https://msrc.microsoft.com/update-guide/releaseNote" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-sky-700 hover:underline">Microsoft release notes<ExternalLink className="h-3 w-3" /></a>
              {intel.earlyRelease && <button type="button" onClick={() => { setDrill(null); setTab('security') }} className="font-semibold text-slate-600 hover:underline">View latest release →</button>}
            </div>
          </div>
        </Modal>
      )}

      {openedCve && <CveDetailModal id={openedCve} known={knownCves.get(openedCve) ?? null} detail={cveDetail} error={cveErr} loading={cveLoading} onClose={() => setOpenedCve(null)} />}

      {intel && <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs font-semibold text-slate-600">Data sources</p><ul className="mt-2 space-y-1 text-xs">
        {intel.sources.map(s => <li key={s.name} className="flex flex-wrap items-center gap-2"><span className={`h-2 w-2 rounded-full ${s.ok ? 'bg-emerald-500' : 'bg-red-500'}`} /><a href={s.url} target="_blank" rel="noreferrer" className="text-slate-700 hover:underline">{s.name}</a>{s.stale && <span className="text-amber-600">showing cached data</span>}{!s.ok && <span className="text-red-600">{s.error}</span>}</li>)}
      </ul><p className="mt-2 text-[0.68rem] text-slate-400">Microsoft MSRC, CISA KEV and lifecycle cached for 6 hours; NIST NVD and FIRST EPSS looked up per CVE and cached for 24 hours · fetched {fmtDate(intel.generatedAt)}</p></div>}
    </div>
  )
}

function MonthTiles({ month, previous, filter, onFilter }: { month: WuMonth; previous: WuMonth | null; filter: CveFilter; onFilter: (f: CveFilter) => void }) {
  const delta = (a: number, b: number | undefined) => (b === undefined ? '' : `${a - b >= 0 ? '+' : ''}${a - b} vs ${previous?.id}`)
  const t = month.totals, p = previous?.totals
  const toggle = (f: CveFilter) => onFilter(filter === f ? 'all' : f)
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <Kpi label="Windows CVEs fixed" value={t.cves} hint={delta(t.cves, p?.cves) || 'click to show all'} onClick={() => onFilter('all')} active={filter === 'all'} />
      <Kpi label="Critical" value={t.critical} tone="text-red-600" hint={delta(t.critical, p?.critical)} onClick={() => toggle('critical')} active={filter === 'critical'} />
      <Kpi label="Exploited (Microsoft)" value={t.exploited} tone={t.exploited ? 'text-red-600' : 'text-slate-900'} hint={delta(t.exploited, p?.exploited)} onClick={() => toggle('exploited')} active={filter === 'exploited'} />
      <Kpi label="In CISA KEV" value={t.inKev} tone={t.inKev ? 'text-red-600' : 'text-slate-900'} hint="Known exploited in the wild" onClick={() => toggle('kev')} active={filter === 'kev'} />
      <Kpi label="Exploitation more likely" value={t.exploitationMoreLikely} tone="text-orange-600" hint={`${t.publiclyDisclosed} publicly disclosed`} onClick={() => toggle('likely')} active={filter === 'likely'} />
    </div>
  )
}
