import type { AppUser, UserDetails, UserHealthScore } from '../../types'

// Deterministic, rule-based score — not an OpenAI call. Keeps every page load
// instant; real GPT-generated narrative analysis lives in the AI Insights tab.
export function computeHealthScore(user: AppUser, details: UserDetails | null): UserHealthScore {
  let score = 100
  const reasons: string[] = []
  const warnings: string[] = []

  if (user.mfaEnabled) {
    reasons.push('MFA enabled')
  } else {
    score -= 20
    warnings.push('MFA is not enabled')
  }

  const devices = details?.devices ?? []
  const nonCompliant = devices.filter(d => d.complianceState === 'Non-Compliant').length
  const warningDevices = devices.filter(d => d.complianceState === 'Warning').length
  if (devices.length > 0 && nonCompliant === 0 && warningDevices === 0) {
    reasons.push(`${devices.length} compliant device${devices.length !== 1 ? 's' : ''}`)
  }
  if (nonCompliant > 0) {
    score -= 15 * nonCompliant
    warnings.push(`${nonCompliant} non-compliant device${nonCompliant !== 1 ? 's' : ''}`)
  }
  if (warningDevices > 0) {
    score -= 10 * warningDevices
    warnings.push(`${warningDevices} device${warningDevices !== 1 ? 's' : ''} in warning state`)
  }

  const highRiskSignIns = (details?.signIns ?? []).filter(s => {
    const risk = s.riskLevelDuringSignIn?.toLowerCase()
    return risk === 'high' || risk === 'medium'
  })
  if (highRiskSignIns.length > 0) {
    score -= 10
    warnings.push(`${highRiskSignIns.length} elevated-risk sign-in${highRiskSignIns.length !== 1 ? 's' : ''} recently`)
  }

  if (user.status === 'Active') {
    reasons.push('Active account')
  } else {
    score -= 10
    warnings.push(`Account is ${user.status.toLowerCase()}`)
  }

  return { score: Math.max(0, Math.min(100, score)), reasons, warnings }
}
