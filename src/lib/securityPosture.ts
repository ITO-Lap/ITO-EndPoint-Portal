import type { PosturePillar, PosturePillarDevice } from '../api'

export type RiskSeverity = 'Critical' | 'High' | 'Medium' | 'Low'

export interface PostureRisk {
  pillarId: PosturePillar['id']
  severity: RiskSeverity
  title: string
  count: number
}

const RISK_TITLES: Record<PosturePillar['id'], (n: number, scope: string) => string> = {
  encryption: n => `${n.toLocaleString()} device${n === 1 ? '' : 's'} without disk encryption enabled`,
  patching:   n => `${n.toLocaleString()} device${n === 1 ? '' : 's'} missing critical patches`,
  compliance: n => `${n.toLocaleString()} device${n === 1 ? '' : 's'} failing MDM compliance`,
  checkin:    n => `${n.toLocaleString()} device${n === 1 ? '' : 's'} not checked in for over 7 days`,
}

/** Severity from the share of ASSESSED devices that fail (patching and encryption weigh one level higher). */
export function riskSeverity(p: Pick<PosturePillar, 'id' | 'failing' | 'assessed'>): RiskSeverity {
  const share = p.assessed ? p.failing / p.assessed : 0
  const base = share >= 0.25 ? 3 : share >= 0.10 ? 2 : share >= 0.03 ? 1 : 0
  const bump = p.id === 'patching' || p.id === 'encryption' ? 1 : 0
  const level = Math.min(3, base + (base > 0 ? bump : 0))
  return (['Low', 'Medium', 'High', 'Critical'] as const)[level]!
}

const SEVERITY_RANK: Record<RiskSeverity, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 }

/** Top risks come from the live pillars — one per pillar that has failing devices. */
export function deriveRisks(pillars: PosturePillar[]): PostureRisk[] {
  return pillars
    .filter(p => p.failing > 0)
    .map(p => ({ pillarId: p.id, severity: riskSeverity(p), title: RISK_TITLES[p.id](p.failing, p.scope), count: p.failing }))
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || b.count - a.count)
}

export function scoreBand(score: number | null): 'good' | 'fair' | 'poor' | 'none' {
  if (score === null) return 'none'
  return score >= 90 ? 'good' : score >= 70 ? 'fair' : 'poor'
}

const csvCell = (v: string): string => {
  // Neutralise spreadsheet formula injection from device-supplied strings, then quote.
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v
  return `"${safe.replace(/"/g, '""')}"`
}

export function devicesToCsv(devices: PosturePillarDevice[]): string {
  const statusLabel = { pass: 'Passing', fail: 'Failing', unknown: 'Not reported' } as const
  const rows = [['Device Name', 'User', 'Platform', 'Source', 'Serial Number', 'Status', 'Finding', 'Missing Items'],
    ...devices.map(d => [d.deviceName, d.user, d.platform, d.source, d.serialNumber, statusLabel[d.status], d.detail, (d.items ?? []).join(' | ')])]
  return rows.map(r => r.map(csvCell).join(',')).join('\n')
}

export type SegmentStatus = 'pass' | 'fail' | 'unknown'

/** Human description of the active drill-down filter, e.g. "Windows · Failing". */
export function describeSegment(seg: { platform?: string | undefined; sourceKey?: string | undefined; status?: SegmentStatus | undefined }): string {
  const status = seg.status === 'pass' ? 'Passing' : seg.status === 'fail' ? 'Failing' : seg.status === 'unknown' ? 'Not reported' : 'All in-scope'
  return [seg.platform, seg.sourceKey, status].filter(Boolean).join(' · ')
}
