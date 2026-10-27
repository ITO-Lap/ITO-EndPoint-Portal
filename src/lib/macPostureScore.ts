/**
 * Device Security Posture score for Macs — PROJECT-CALCULATED.
 *
 * This is NOT a ManageEngine (or Intune) compliance verdict. ManageEngine does not expose an
 * overall compliance result through its documented API; this score is derived here from the
 * individual signals that are available. Always label it "project-calculated" in the UI.
 *
 * Signals (weights sum to 100). A signal whose source value is unknown is EXCLUDED from the score
 * (not counted as a failure), and the score reports how much of the weight was actually assessed.
 */

import type { ApiDevice, ManageEngineFleetProfileResult } from '../api'

export const POSTURE_LABEL = 'Project-calculated posture score — not a ManageEngine compliance verdict'
export const POSTURE_TITLE = 'Device Security Posture Score'
/** Below this share of assessed weight the score is withheld rather than guessed. */
export const MIN_COVERAGE = 0.5

export type PostureSignalId = 'filevault' | 'passcode' | 'osVersion' | 'mdmManagement' | 'profiles'
export type PostureBand = 'Strong' | 'Fair' | 'At risk' | 'Insufficient data'

export interface PostureSignal {
  id: PostureSignalId
  label: string
  weight: number
  /** 0..1, or null when the source did not report this signal. */
  earned: number | null
  detail: string
}

export interface MacPostureScore {
  /** 0..100, or null when too little data was reported. */
  score: number | null
  band: PostureBand
  /** Share of total weight that could be assessed (0..1). */
  coverage: number
  signals: PostureSignal[]
}

export const POSTURE_WEIGHTS: Record<PostureSignalId, number> = {
  filevault: 30,
  passcode: 20,
  osVersion: 20,
  mdmManagement: 15,
  profiles: 15,
}

// ManageEngine MDM profile status codes, verified from the remarks the API returns for each:
// 6 = "Successfully applied the policy"; 7 = payload error; 3 = re-association in progress;
// 16 = device locked, will apply on unlock; 18 = no remark. Only 6 is treated as applied.
const PROFILE_APPLIED = '6'

export function bandFor(score: number | null): PostureBand {
  if (score === null) return 'Insufficient data'
  if (score >= 85) return 'Strong'
  if (score >= 70) return 'Fair'
  return 'At risk'
}

export function majorVersion(osVersion: string | undefined): number | null {
  const m = /^(\d+)(?:\.\d+)*$/.exec(osVersion ?? '')
  return m ? parseInt(m[1]!, 10) : null
}

/**
 * Apple skipped macOS 16–25 (15 Sequoia was followed by 26 Tahoe), so raw major numbers overstate
 * how far behind a Mac is. Map majors onto consecutive release positions: …14→14, 15→15, 26→16, 27→17.
 */
export function releaseOrdinal(major: number): number {
  return major >= 26 ? major - 10 : major
}

function checkInAgeDays(lastCheckIn: string): number | null {
  const rel = /(\d+)\s+(minute|hour|day|week|month)s?\s+ago/i.exec(lastCheckIn ?? '')
  if (rel) {
    const n = parseInt(rel[1]!, 10)
    const unit = rel[2]!.toLowerCase()
    return unit === 'month' ? n * 30 : unit === 'week' ? n * 7 : unit === 'day' ? n : 0
  }
  const t = Date.parse(lastCheckIn)
  return Number.isNaN(t) ? null : Math.max(0, Math.floor((Date.now() - t) / 86_400_000))
}

function fileVaultSignal(d: ApiDevice): PostureSignal {
  const v = (d.encryptionStatus ?? '').trim().toLowerCase()
  const base = { id: 'filevault' as const, label: 'FileVault', weight: POSTURE_WEIGHTS.filevault }
  if (/\b(not encrypted|disabled|off|false)\b/.test(v)) return { ...base, earned: 0, detail: 'FileVault is off' }
  if (/\b(encrypted|enabled|on|true)\b/.test(v)) return { ...base, earned: 1, detail: 'FileVault is on' }
  return { ...base, earned: null, detail: 'Not reported' }
}

function passcodeSignal(d: ApiDevice, informative: boolean): PostureSignal {
  const base = { id: 'passcode' as const, label: 'Passcode', weight: POSTURE_WEIGHTS.passcode }
  if (d.passcodeStatus === 'Present') return { ...base, earned: 1, detail: 'Passcode is set' }
  if (d.passcodeStatus === 'Missing' && !informative) {
    // Verified against the tenant: ManageEngine returns passcode_present=false for every Mac, whether or not
    // it is encrypted. A value that never varies cannot distinguish devices, so it is not scored.
    return { ...base, earned: null, detail: 'Not reliably reported (MDM reports no passcode for every Mac in this fleet)' }
  }
  if (d.passcodeStatus === 'Missing') return { ...base, earned: 0, detail: 'No passcode set' }
  return { ...base, earned: null, detail: 'Not reported' }
}

function osSignal(d: ApiDevice, newestMajor: number | null): PostureSignal {
  const base = { id: 'osVersion' as const, label: 'OS version', weight: POSTURE_WEIGHTS.osVersion }
  const major = majorVersion(d.osVersion)
  if (major === null || newestMajor === null) return { ...base, earned: null, detail: 'Not reported' }
  const behind = releaseOrdinal(newestMajor) - releaseOrdinal(major)
  const earned = behind <= 0 ? 1 : behind === 1 ? 0.6 : behind === 2 ? 0.3 : 0
  return { ...base, earned, detail: behind <= 0 ? `macOS ${d.osVersion} (newest major in this fleet)` : `macOS ${d.osVersion} — ${behind} release${behind > 1 ? 's' : ''} behind the newest in this fleet` }
}

function mdmSignal(d: ApiDevice): PostureSignal {
  const base = { id: 'mdmManagement' as const, label: 'Active MDM management', weight: POSTURE_WEIGHTS.mdmManagement }
  const age = checkInAgeDays(d.lastCheckIn)
  if (age === null) return { ...base, earned: null, detail: 'No check-in reported' }
  if (age <= 7) return { ...base, earned: 1, detail: `Checked in ${age}d ago` }
  if (age <= 30) return { ...base, earned: 0.5, detail: `Last check-in ${age}d ago` }
  return { ...base, earned: 0, detail: `Last check-in ${age}d ago` }
}

function profilesSignal(result: ManageEngineFleetProfileResult | undefined): PostureSignal {
  const base = { id: 'profiles' as const, label: 'Assigned profiles applied', weight: POSTURE_WEIGHTS.profiles }
  const profiles = result?.snapshot?.profiles
  if (!result || result.unavailable || !profiles) return { ...base, earned: null, detail: 'Not reported' }
  if (profiles.length === 0) return { ...base, earned: null, detail: 'No profiles assigned' }
  const applied = profiles.filter(p => p.status === PROFILE_APPLIED).length
  return { ...base, earned: applied / profiles.length, detail: `${applied} of ${profiles.length} profiles applied` }
}

export function computeMacPosture(
  d: ApiDevice,
  ctx: { newestMajor: number | null; profileResult?: ManageEngineFleetProfileResult; passcodeInformative?: boolean },
): MacPostureScore {
  const signals = [fileVaultSignal(d), passcodeSignal(d, ctx.passcodeInformative ?? true), osSignal(d, ctx.newestMajor), mdmSignal(d), profilesSignal(ctx.profileResult)]
  const assessed = signals.filter(s => s.earned !== null)
  const assessedWeight = assessed.reduce((n, s) => n + s.weight, 0)
  const totalWeight = signals.reduce((n, s) => n + s.weight, 0)
  const coverage = assessedWeight / totalWeight
  const score = coverage < MIN_COVERAGE
    ? null
    : Math.round((assessed.reduce((n, s) => n + s.weight * (s.earned as number), 0) / assessedWeight) * 100)
  return { score, band: bandFor(score), coverage, signals }
}

/** Attach a posture score to every device. Profile results are optional and keyed by device id. */
export function attachPosture(devices: ApiDevice[], profileResults: Record<string, ManageEngineFleetProfileResult> = {}): ApiDevice[] {
  const majors = devices.map(d => majorVersion(d.osVersion)).filter((m): m is number => m !== null)
  const newestMajor = majors.length ? Math.max(...majors) : null
  // If no Mac anywhere reports a passcode, the MDM flag is non-discriminating and is excluded from scoring.
  const passcodeInformative = devices.some(d => d.passcodeStatus === 'Present')
  return devices.map(d => ({ ...d, posture: computeMacPosture(d, { newestMajor, profileResult: profileResults[d.id], passcodeInformative }) }))
}

export function fleetPostureAverage(devices: ApiDevice[]): { average: number | null; scored: number } {
  const scores = devices.map(d => d.posture?.score).filter((s): s is number => typeof s === 'number')
  return { average: scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : null, scored: scores.length }
}

export function postureBreakdownText(p: MacPostureScore | undefined): string {
  if (!p) return 'Not calculated'
  return p.signals.map(s => `${s.label}: ${s.earned === null ? 'n/a' : `${Math.round(s.earned * s.weight)}/${s.weight}`}`).join(' · ')
}
