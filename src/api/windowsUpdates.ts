// Windows Updates page — frontend HTTP client for /api/windows-updates/*.

const SERVER = import.meta.env.VITE_API_URL ?? ''

export type WuSeverity = 'Critical' | 'Important' | 'Moderate' | 'Low' | 'Unrated'

export interface WuRow {
  priority: 'P1 Urgent' | 'P2 High' | 'P3 Normal'; action: string; device: string; operatingSystem: string
  kind: 'Feature update' | 'Security update'; update: string; kb: string; severity: string; cves: string
  releasedAt: string; daysMissing: number | ''; rebootRequired: string; lastScan: string
}
export interface WuTopUpdate {
  update: string; kind: 'Feature update' | 'Security update'; kb: string; severity: string; devices: number; cves: string[]
  releasedAt: string; maxDaysMissing: number | null; urgentDevices: number; msrc: { cves: number; critical: number; exploited: number } | null
}
export interface WuFleetBuild { build: number; deviceList: Array<{ name: string; osVersion: string }>; label: string; devices: number; status: 'current' | 'behind' | 'ahead'; endOfServicing: Array<{ edition: string; date: string }>; lifecycle: 'supported' | 'ending-soon' | 'ended' | 'unknown' }
export type WuBand = 'Critical' | 'High' | 'Medium' | 'Low'
export interface WuDeviceExposure { device: string; score: number; band: WuBand; reasons: Array<{ label: string; points: number }>; missingSecurity: number; missingFeature: number; exploitedCves: string[]; maxDaysMissing: number | null }
export interface WuKevClock { cve: string; name: string; dueDate: string; daysLeft: number; status: 'overdue' | 'due-soon' | 'on-track'; ransomware: boolean; devices: number; deviceNames: string[] }
export interface WuExposure { devices: WuDeviceExposure[]; bands: Record<WuBand, number>; scored: number; kevClock: WuKevClock[]; epssUsed: boolean; coverage: { cvesKnown: number; note: string } }
export interface WuFleet {
  generatedAt: string; configured: boolean; error?: string; warnings: string[]
  target: { build: number; label: string; newerReleaseAvailable: { version: string; build: number } | null }
  devicesChecked: number; devicesAffected: number
  totals: { updates: number; feature: number; security: number; urgent: number; high: number; normal: number }
  topUpdates: WuTopUpdate[]; builds: WuFleetBuild[]; rows: WuRow[]; exposure: WuExposure | null
}

export interface WuCve {
  cve: string; title: string; impact: string; severity: WuSeverity; cvss: number | null; exploited: boolean; disclosed: boolean
  exploitability: string; kbs: string[]; kev: boolean; kevDueDate: string | null; ransomware: boolean
}
export interface WuMonth {
  id: string; title: string; releasedAt: string
  totals: { cves: number; critical: number; important: number; exploited: number; publiclyDisclosed: number; exploitationMoreLikely: number; inKev: number }
  byImpact: Array<{ impact: string; count: number }>
  topCves: WuCve[]
  builds: Array<{ product: string; kb: string; fixedBuild: string }>
}
export interface WuLifecycle { version: string; build: number; releaseDate: string; endOfServicing: Array<{ edition: string; date: string }>; latestBuild: string; status: 'supported' | 'ending-soon' | 'ended'; daysToEnd: number }
export interface WuKev { cve: string; name: string; product: string; dateAdded: string; dueDate: string; ransomware: boolean; action: string }
export interface WuIntel {
  generatedAt: string
  upcoming: { nextPatchTuesday: { date: string; daysAway: number }; nextOptionalPreview: { date: string; daysAway: number }; note: string }
  latestRelease: WuMonth | null; previousRelease: WuMonth | null
  earlyRelease: { id: string; title: string; releasedAt: string; advisories: number; windowsAdvisories: number } | null
  kevRecent: WuKev[]; lifecycle: WuLifecycle[]; upcomingEndOfServicing: WuLifecycle[]
  newestFeatureRelease: { version: string; build: number; releaseDate: string } | null
  sources: Array<{ name: string; url: string; ok: boolean; error?: string; fetchedAt: string; stale?: boolean }>
}

export interface WuCveDetail {
  cve: string; fetchedAt: string
  nvd: { description: string; status: string; published: string; lastModified: string
    cvss: { version: string; score: number; severity: string; vector: string; source: string } | null
    cwes: string[]; references: Array<{ url: string; source: string; tags: string[] }> } | null
  nvdStatus: 'ok' | 'not_found' | 'error'; nvdError?: string
  epss: { score: number; percentile: number; date: string } | null
  links: Array<{ label: string; url: string }>
}
export type WuEpss = Record<string, { score: number; percentile: number; date: string } | null>

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${SERVER}${path}`)
  const body = await res.json().catch(() => null) as { success?: boolean; data?: T; error?: string } | null
  if (!res.ok || !body?.success) throw new Error(body?.error ?? `${path}: ${res.status}`)
  return body.data as T
}

export const windowsUpdatesApi = {
  fleet: (refresh = false) => get<WuFleet>(`/api/windows-updates/fleet${refresh ? '?refresh=1' : ''}`),
  cve: (id: string) => get<WuCveDetail>(`/api/windows-updates/cve/${encodeURIComponent(id)}`),
  epss: (ids: string[]) => get<WuEpss>(`/api/windows-updates/epss?cves=${ids.map(encodeURIComponent).join(',')}`),
  intel: (refresh = false) => get<WuIntel>(`/api/windows-updates/intel${refresh ? '?refresh=1' : ''}`),
}
