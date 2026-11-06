// Fleet-side view for the Windows Updates page: which Windows client devices miss a Feature or Security update,
// which builds the fleet is on, and how that lines up with Microsoft's lifecycle and the latest security release.

import { isPatchApiConfigured } from './endpointCentralPatch.js'
import { buildLabel, collectWindowsUpdateRows, featureTargetBuild, isClientBuild, windowsBuildOf, type WindowsUpdateReportRow } from './windowsUpdateReport.js'
import { computeExposure, type ExposureSummary } from './windowsExposure.js'
import { getEpss } from './cveDetails.js'
import { peekWindowsIntel, warmWindowsIntel, type MsrcMonthView } from './windowsSecurityIntel.js'

export interface TopMissingUpdate {
  update: string; kind: 'Feature update' | 'Security update'; kb: string; severity: string; devices: number
  cves: string[]; releasedAt: string; maxDaysMissing: number | null; urgentDevices: number
  msrc: { cves: number; critical: number; exploited: number } | null
}
export interface FleetBuildDevice { name: string; osVersion: string }
export interface FleetBuild { build: number; deviceList: FleetBuildDevice[]; label: string; devices: number; status: 'current' | 'behind' | 'ahead'; endOfServicing: Array<{ edition: string; date: string }>; lifecycle: 'supported' | 'ending-soon' | 'ended' | 'unknown' }
export interface WindowsFleetSummary {
  generatedAt: string
  configured: boolean
  error?: string
  warnings: string[]
  target: { build: number; label: string; newerReleaseAvailable: { version: string; build: number } | null }
  devicesChecked: number
  devicesAffected: number
  totals: { updates: number; feature: number; security: number; urgent: number; high: number; normal: number }
  topUpdates: TopMissingUpdate[]
  builds: FleetBuild[]
  rows: WindowsUpdateReportRow[]
  exposure: ExposureSummary | null
}

const ROW_CAP = 3000

export function summarizeTopUpdates(rows: WindowsUpdateReportRow[], month: MsrcMonthView | null, limit = 15): TopMissingUpdate[] {
  const groups = new Map<string, WindowsUpdateReportRow[]>()
  for (const r of rows) groups.set(`${r.kind}|${r.kb || r.update}`, [...(groups.get(`${r.kind}|${r.kb || r.update}`) ?? []), r])
  return [...groups.values()].map(list => {
    const first = list[0]!
    const cves = [...new Set(list.flatMap(r => r.cves.split(/[,\s]+/).filter(Boolean)))]
    const days = list.map(r => r.daysMissing).filter((d): d is number => typeof d === 'number')
    const ms = first.kb ? month?.kbIndex[first.kb] : undefined
    return {
      update: first.update, kind: first.kind, kb: first.kb, severity: first.severity, devices: new Set(list.map(r => r.device)).size,
      cves, releasedAt: first.releasedAt, maxDaysMissing: days.length ? Math.max(...days) : null,
      urgentDevices: new Set(list.filter(r => r.priority === 'P1 Urgent').map(r => r.device)).size,
      msrc: ms ? { cves: ms.cves, critical: ms.critical, exploited: ms.exploited } : null,
    }
  }).sort((a, b) => b.urgentDevices - a.urgentDevices || b.devices - a.devices).slice(0, limit)
}

export async function getWindowsFleetSummary(force = false): Promise<WindowsFleetSummary> {
  const target = featureTargetBuild()
  const base: WindowsFleetSummary = {
    generatedAt: new Date().toISOString(), configured: isPatchApiConfigured(), warnings: [],
    target: { build: target, label: buildLabel(target), newerReleaseAvailable: null },
    devicesChecked: 0, devicesAffected: 0, totals: { updates: 0, feature: 0, security: 0, urgent: 0, high: 0, normal: 0 },
    topUpdates: [], builds: [], rows: [], exposure: null,
  }
  if (!base.configured) return { ...base, warnings: ['ManageEngine / Endpoint Central Patch Manager is not configured, so missing Security updates cannot be listed.'] }
  try {
    const { intune, rows } = await collectWindowsUpdateRows(force)
    if (intune.error) base.warnings.push(`Windows builds could not be read from Intune (${intune.error}); Feature updates and the build breakdown are incomplete.`)
    // Never wait on the slow Microsoft fetch here: use cached intel if present, otherwise warm it in the background.
    const intel = peekWindowsIntel()
    if (!intel) { warmWindowsIntel(); base.warnings.push('Microsoft lifecycle and risk context is still loading; refresh in a minute to see support status and CVE counts.') }
    const lifeByBuild = new Map((intel?.lifecycle ?? []).map(l => [l.build, l]))
    const newest = intel?.newestFeatureRelease
    if (newest && newest.build > target) base.target.newerReleaseAvailable = { version: newest.version, build: newest.build }

    const counts = new Map<number, number>()
    const lists = new Map<number, FleetBuildDevice[]>()
    for (const d of intune.devices) {
      if (!/windows/i.test(d.operatingSystem)) continue
      const b = windowsBuildOf(d.osVersion)
      if (b !== null && isClientBuild(b)) {
        counts.set(b, (counts.get(b) ?? 0) + 1)
        lists.set(b, [...(lists.get(b) ?? []), { name: d.deviceName, osVersion: d.osVersion }])
      }
    }
    const builds: FleetBuild[] = [...counts].map(([build, devices]) => {
      const life = lifeByBuild.get(build)
      return {
        build, label: life?.version ?? buildLabel(build), devices, deviceList: (lists.get(build) ?? []).sort((a, b) => a.name.localeCompare(b.name)).slice(0, 1000), status: build === target ? 'current' as const : build < target ? 'behind' as const : 'ahead' as const,
        endOfServicing: life?.endOfServicing ?? [], lifecycle: life?.status ?? 'unknown' as const,
      }
    }).sort((a, b) => b.build - a.build)

    // Exposure score + KEV clock. EPSS is best-effort (2.5 s cap) so the page never waits on FIRST.org.
    let exposure: ExposureSummary | null = null
    if (intel) {
      const months = [intel.latestRelease, intel.previousRelease]
      const kbs = new Set(rows.map(r => r.kb).filter(Boolean))
      const ids = [...new Set(months.flatMap(m => m?.topCves ?? []).filter(c => c.kbs.some(k => kbs.has(k))).map(c => c.cve))].slice(0, 100)
      const epss = ids.length ? await Promise.race([getEpss(ids).catch(() => undefined), new Promise<undefined>(r => setTimeout(() => r(undefined), 2500))]) : undefined
      const deviceBuilds = new Map<string, number>()
      for (const d of intune.devices) { const b = windowsBuildOf(d.osVersion); if (b !== null) deviceBuilds.set(d.deviceName.toLowerCase(), b) }
      exposure = computeExposure({ rows, months, kev: intel.kevRecent, lifecycle: intel.lifecycle, deviceBuilds, targetBuild: target, epss, now: new Date() })
    }

    return {
      ...base, exposure, devicesChecked: [...counts.values()].reduce((a, b) => a + b, 0), devicesAffected: new Set(rows.map(r => r.device)).size,
      totals: {
        updates: rows.length, feature: rows.filter(r => r.kind === 'Feature update').length, security: rows.filter(r => r.kind === 'Security update').length,
        urgent: rows.filter(r => r.priority === 'P1 Urgent').length, high: rows.filter(r => r.priority === 'P2 High').length, normal: rows.filter(r => r.priority === 'P3 Normal').length,
      },
      topUpdates: summarizeTopUpdates(rows, intel?.latestRelease ?? null), builds, rows: rows.slice(0, ROW_CAP),
      ...(rows.length > ROW_CAP ? { warnings: [...base.warnings, `Showing the first ${ROW_CAP} of ${rows.length} rows; use the scheduled Windows Update report for the full list.`] } : {}),
    }
  } catch (e) {
    return { ...base, error: e instanceof Error ? e.message : 'Windows update data request failed' }
  }
}
