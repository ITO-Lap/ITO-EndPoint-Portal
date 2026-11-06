// Exposure scoring + KEV deadline clock for the Windows Updates page.
// Pure functions: everything is derived from data the page already loads (missing-update rows, MSRC month views,
// CISA KEV, lifecycle). EPSS is optional and only improves the score when it was reachable.

import type { MsrcCveView, MsrcMonthView, KevEntry, LifecycleRow } from './windowsSecurityIntel.js'

export interface ExposureRow { device: string; kind: 'Feature update' | 'Security update'; kb: string; cves: string; daysMissing: number | '' }
export interface ExposureInput {
  rows: ExposureRow[]
  months: Array<MsrcMonthView | null | undefined>
  kev: KevEntry[]
  lifecycle: LifecycleRow[]
  deviceBuilds: ReadonlyMap<string, number>   // lower-cased device name -> Windows build
  targetBuild: number
  epss?: Record<string, { score: number } | null> | undefined
  now: Date
}

export type ExposureBand = 'Critical' | 'High' | 'Medium' | 'Low'
export interface ExposureReason { label: string; points: number }
export interface DeviceExposure {
  device: string; score: number; band: ExposureBand; reasons: ExposureReason[]
  missingSecurity: number; missingFeature: number; exploitedCves: string[]; maxDaysMissing: number | null
}
export type KevStatus = 'overdue' | 'due-soon' | 'on-track'
export interface KevClockItem {
  cve: string; name: string; dueDate: string; daysLeft: number; status: KevStatus; ransomware: boolean
  devices: number; deviceNames: string[]
}
export interface ExposureSummary {
  devices: DeviceExposure[]                // top N by score
  bands: Record<ExposureBand, number>
  scored: number
  kevClock: KevClockItem[]
  epssUsed: boolean
  coverage: { cvesKnown: number; note: string }
}

const MAX_DEVICES = 200
const DAY = 86_400_000
export const band = (score: number): ExposureBand => (score >= 70 ? 'Critical' : score >= 45 ? 'High' : score >= 20 ? 'Medium' : 'Low')
const osName = (v: string): string => (/^windows/i.test(v) ? v : `Windows ${v}`)
const SEV_POINTS: Record<string, number> = { Critical: 6, Important: 3, Moderate: 1, Low: 0.5 }

/** Days from now until a YYYY-MM-DD date (negative once passed). */
export function daysUntil(date: string, now: Date): number {
  const t = Date.parse(`${date.slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(t)) return Number.NaN
  return Math.floor((t - Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())) / DAY)
}

export function computeExposure(input: ExposureInput): ExposureSummary {
  const { rows, now } = input
  // CVE knowledge: MSRC top CVEs (with KB mapping and KEV flags), newest month wins.
  const cveInfo = new Map<string, MsrcCveView>()
  const kbIndex: Record<string, { cves: number; critical: number; exploited: number }> = {}
  for (const m of [...input.months].reverse()) {
    if (!m) continue
    for (const c of m.topCves) cveInfo.set(c.cve, c)
    Object.assign(kbIndex, m.kbIndex)
  }
  const kevByCve = new Map(input.kev.map(k => [k.cve, k]))
  for (const c of cveInfo.values()) if (c.kev && c.kevDueDate && !kevByCve.has(c.cve)) kevByCve.set(c.cve, { cve: c.cve, name: c.title, product: 'Windows', dateAdded: '', dueDate: c.kevDueDate, ransomware: c.ransomware, action: '' })

  const cvesByKb = new Map<string, string[]>()
  for (const c of cveInfo.values()) for (const kb of c.kbs) cvesByKb.set(kb, [...(cvesByKb.get(kb) ?? []), c.cve])

  const lifeByBuild = new Map(input.lifecycle.map(l => [l.build, l]))
  const byDevice = new Map<string, ExposureRow[]>()
  for (const r of rows) byDevice.set(r.device, [...(byDevice.get(r.device) ?? []), r])

  const deviceCves = new Map<string, Set<string>>()   // device -> CVEs it is exposed to (known to us)
  const scored: DeviceExposure[] = []
  for (const [device, list] of byDevice) {
    const security = list.filter(r => r.kind === 'Security update')
    const feature = list.filter(r => r.kind === 'Feature update')
    const cves = new Set<string>()
    let critical = 0, kbExploited = 0
    for (const r of security) {
      for (const id of r.cves.split(/[,\s]+/).filter(x => /^CVE-/.test(x))) cves.add(id)
      for (const id of cvesByKb.get(r.kb) ?? []) cves.add(id)
      const k = kbIndex[r.kb]
      if (k) { critical += k.critical; kbExploited += k.exploited }
    }
    deviceCves.set(device, cves)

    const reasons: ExposureReason[] = []
    const add = (label: string, points: number) => { if (points > 0) reasons.push({ label, points: Math.round(points) }) }
    const exploited = [...cves].filter(id => cveInfo.get(id)?.exploited || kevByCve.has(id))
    add(exploited.length ? `${exploited.length} actively exploited CVE${exploited.length > 1 ? 's' : ''} unpatched` : kbExploited ? 'Missing update fixes exploited CVEs' : '', exploited.length || kbExploited ? 40 : 0)
    const overdue = exploited.filter(id => { const k = kevByCve.get(id); return k && daysUntil(k.dueDate, now) < 0 })
    add(`${overdue.length} CISA KEV deadline${overdue.length > 1 ? 's' : ''} overdue`, overdue.length ? 10 : 0)
    const sevPoints = [...cves].reduce((s, id) => s + (SEV_POINTS[cveInfo.get(id)?.severity ?? ''] ?? 0), 0) + Math.max(0, critical - [...cves].filter(id => cveInfo.get(id)?.severity === 'Critical').length) * 1
    add(`Missing fixes for critical/important vulnerabilities`, Math.min(20, sevPoints))
    const maxEpss = input.epss ? Math.max(0, ...[...cves].map(id => input.epss?.[id]?.score ?? 0)) : 0
    add(`Highest exploitation probability (EPSS) ${(maxEpss * 100).toFixed(0)}%`, maxEpss * 15)
    const days = security.map(r => r.daysMissing).filter((d): d is number => typeof d === 'number')
    const maxDays = days.length ? Math.max(...days) : null
    add(`Oldest missing update ${maxDays} days`, maxDays === null ? 0 : Math.min(15, maxDays / 3))
    const build = input.deviceBuilds.get(device.toLowerCase())
    const life = build !== undefined ? lifeByBuild.get(build) : undefined
    if (life?.status === 'ended') add(`${osName(life.version)} is out of support`, 20)
    else if (life?.status === 'ending-soon') add(`${osName(life.version)} support ends in ${life.daysToEnd} days`, 8)
    else if (feature.length) add('Behind the target feature release', 5)
    else if (build !== undefined && build < input.targetBuild) add('Behind the target feature release', 5)

    const score = Math.min(100, reasons.reduce((s, r) => s + r.points, 0))
    scored.push({
      device, score, band: band(score), reasons: reasons.sort((a, b) => b.points - a.points),
      missingSecurity: security.length, missingFeature: feature.length, exploitedCves: exploited, maxDaysMissing: maxDays,
    })
  }
  scored.sort((a, b) => b.score - a.score || a.device.localeCompare(b.device))
  const bands: Record<ExposureBand, number> = { Critical: 0, High: 0, Medium: 0, Low: 0 }
  for (const d of scored) bands[d.band]++

  const kevClock: KevClockItem[] = []
  for (const [cve, k] of kevByCve) {
    const devices = [...deviceCves].filter(([, set]) => set.has(cve)).map(([d]) => d)
    const daysLeft = daysUntil(k.dueDate, now)
    if (!devices.length || Number.isNaN(daysLeft)) continue   // only CVEs that actually touch this fleet
    kevClock.push({
      cve, name: k.name, dueDate: k.dueDate.slice(0, 10), daysLeft, ransomware: k.ransomware, devices: devices.length,
      status: daysLeft < 0 ? 'overdue' : daysLeft <= 7 ? 'due-soon' : 'on-track', deviceNames: devices.sort().slice(0, 25),
    })
  }
  kevClock.sort((a, b) => a.daysLeft - b.daysLeft || b.devices - a.devices)

  return {
    devices: scored.slice(0, MAX_DEVICES), bands, scored: scored.length, kevClock, epssUsed: !!input.epss,
    coverage: {
      cvesKnown: cveInfo.size,
      note: 'CVE-level detail covers the top 100 CVEs of the latest two Patch Tuesdays; other updates are scored from per-KB totals and update age.',
    },
  }
}
