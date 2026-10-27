import type { AppRecord, DeployedPackage, InstallSource } from './types.js'

// Install-source classification for apps that survived the native-app exclusion. Derived from Intune
// packages and their assignments — it describes how the app is made available, not how a particular
// device received it. The Endpoint Central self-service portal cannot be read with the current
// connection, so only the Intune Company Portal is recognised as "self-service".

export interface AssignmentLite { intent: string }
/** packageId -> assignments, or 'unavailable' when they could not be read. */
export type AssignmentIndex = Record<string, AssignmentLite[] | 'unavailable'>

// Graph assignment intents that surface the app in the Company Portal for users to install themselves.
const SELF_SERVICE_INTENTS = new Set(['available', 'availableWithoutEnrollment'])

export function classifyInstallSource(record: AppRecord, assignments: AssignmentIndex): AppRecord {
  const pkgs: DeployedPackage[] = record.packages
  if (!pkgs.length) {
    return { ...record, installSource: 'manual', installSourceBasis: 'none',
      installSourceReason: 'No matching package in the Intune app catalog — installed outside managed deployment (user or vendor installer).' }
  }
  // Strongest evidence first: a strong-identifier package beats a name-only candidate.
  const strong = pkgs.filter(p => p.matchBasis !== 'name')
  const basisPkgs = strong.length ? strong : pkgs
  const basis = (strong[0]?.matchBasis ?? 'name') as AppRecord['installSourceBasis']
  const lowConfidence = basis === 'name'

  const offered = basisPkgs.find(p => {
    const a = assignments[p.packageId]
    return Array.isArray(a) && a.some(x => SELF_SERVICE_INTENTS.has(x.intent))
  })
  const unreadable = basisPkgs.some(p => assignments[p.packageId] === 'unavailable' || assignments[p.packageId] === undefined)

  let source: InstallSource = 'custom'
  let reason: string
  if (offered) {
    source = 'self-service'
    reason = `Intune package "${offered.displayName || offered.packageId}" is offered to users through the Company Portal (available intent).`
  } else {
    const names = basisPkgs.slice(0, 2).map(p => `"${p.displayName || p.packageId}"`).join(', ')
    reason = `Packaged by IT in Intune (${names}) and not offered for self-service${unreadable ? ' — assignments could not be fully read, so a self-service offer cannot be ruled out' : ''}.`
  }
  if (lowConfidence) reason += ' Matched to the package by name only (low confidence).'
  return { ...record, installSource: source, installSourceBasis: basis, installSourceReason: reason }
}

export const INSTALL_SOURCE_LABEL: Record<InstallSource, string> = { custom: 'Custom', 'self-service': 'Self-service', manual: 'Manual' }
