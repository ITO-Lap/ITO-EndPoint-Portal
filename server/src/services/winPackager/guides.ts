// Publishing guides. These only DESCRIBE what to enter in Intune / Endpoint Central; nothing here publishes,
// assigns or deploys anything.

import type { PackageJob } from './types.js'

export interface GuideItem { label: string; value: string; copy?: boolean }
export interface GuideSection { title: string; items: GuideItem[]; notes?: string[] }
export interface PublishingGuide {
  ready: boolean
  /** Shown when the package has not passed Windows validation. */
  banner?: string
  intune: GuideSection[]
  endpointCentral: GuideSection[]
  endpointCentralApi: { configured: boolean; message: string }
}

const RETURN_TYPE: Record<string, string> = { success: 'Success', softReboot: 'Soft reboot', hardReboot: 'Hard reboot', retry: 'Retry', failed: 'Failed' }
const RESTART: Record<string, string> = { none: 'No specific action', allow: 'App install may force a device restart', force: 'Intune will force a mandatory device restart', 'intune-decides': 'Determine behavior based on return codes' }

/** Direct Endpoint Central publishing is only claimed when a separate software-distribution API host is configured AND verified. */
export function endpointCentralApiStatus(env: NodeJS.ProcessEnv = process.env): { configured: boolean; message: string } {
  const configured = !!env['ENDPOINT_CENTRAL_SOFTWARE_API_URL']?.trim() && env['ENDPOINT_CENTRAL_SOFTWARE_API_VERIFIED'] === 'true'
  return configured
    ? { configured: true, message: 'A software-distribution API host is configured. Publishing still requires explicit engineer confirmation and is not performed by this guide.' }
    : { configured: false, message: 'Endpoint Central publishing API not configured — use guided manual publishing.' }
}

export function buildGuide(job: PackageJob, env: NodeJS.ProcessEnv = process.env): PublishingGuide {
  const c = job.config
  const out = job.output
  const validated = job.validation?.outcome === 'validated'
  const banner = validated ? undefined : job.validation?.outcome === 'failed'
    ? 'Windows validation FAILED. Do not publish until the failure is resolved.'
    : 'Package Created / Windows Installation Not Tested. Pilot on a test device before any wider assignment.'
  const endpointCentralApi = endpointCentralApiStatus(env)

  if (!c || !out) {
    return { ready: false, banner: 'Create the package first — the guide needs the final values.', intune: [], endpointCentral: [], endpointCentralApi }
  }

  const detectionText = c.detection.type === 'msi-product-code'
    ? `Rules format: Manually configure detection rules → MSI → MSI product code ${c.detection.value}${c.detection.minVersion ? ` · MSI product version check: Greater than or equal to ${c.detection.minVersion}` : ''}`
    : 'Rules format: Use a custom detection script → upload detection.ps1 (Run script as 32-bit: No; Enforce signature check: No)'
  const returnCodes = c.returnCodes.map(r => `${r.code} → ${RETURN_TYPE[r.type] ?? r.type}`).join('\n')

  const intune: GuideSection[] = [
    { title: 'Start', items: [{ label: 'Path', value: 'Intune admin center → Apps → All apps → Create → App type: Windows app (Win32)' }, { label: 'App package file', value: out.fileName, copy: true }] },
    { title: 'App information', items: [
      { label: 'Name', value: c.appName, copy: true }, { label: 'Description', value: c.description || `${c.appName} ${c.version}`, copy: true },
      { label: 'Publisher', value: c.publisher, copy: true }, { label: 'App version', value: c.version, copy: true },
    ] },
    { title: 'Program', items: [
      { label: 'Install command', value: c.installCommand, copy: true }, { label: 'Uninstall command', value: c.uninstallCommand, copy: true },
      { label: 'Installation time required (mins)', value: '60' }, { label: 'Install behavior', value: c.installBehavior === 'system' ? 'System' : 'User' },
      { label: 'Device restart behavior', value: RESTART[c.restartBehavior] ?? c.restartBehavior },
      { label: 'Return codes', value: returnCodes, copy: true },
    ] },
    { title: 'Requirements', items: [
      { label: 'Operating system architecture', value: c.architecture === 'arm64' ? 'ARM64' : c.architecture === 'x86' ? '32-bit' : '64-bit' },
      { label: 'Minimum operating system', value: c.minimumOs, copy: true },
    ] },
    { title: 'Detection rules', items: [{ label: 'Rule', value: detectionText, copy: true }, ...(c.detection.type !== 'msi-product-code' ? [{ label: 'Script file', value: 'detection.ps1' }] : [])] },
    { title: 'Dependencies', items: [{ label: 'Dependencies', value: c.dependencies || 'None recorded', copy: !!c.dependencies }] },
    { title: 'Supersedence', items: [{ label: 'Notes', value: c.supersedenceNotes || 'None recorded', copy: !!c.supersedenceNotes }] },
    { title: 'Assignments', items: [{ label: 'Notes', value: c.assignmentNotes || 'None recorded', copy: !!c.assignmentNotes }],
      notes: ['Assign to a small pilot group first (Available for enrolled devices or a single test device group).', 'Do not assign "Required" to all devices until the pilot succeeds.'] },
    { title: 'Monitoring and troubleshooting', items: [
      { label: 'Install status', value: 'Apps → All apps → ' + c.appName + ' → Device install status / User install status' },
      { label: 'Client logs', value: 'C:\\ProgramData\\Microsoft\\IntuneManagementExtension\\Logs\\IntuneManagementExtension.log', copy: true },
      { label: 'Per-device', value: 'Devices → the device → Managed Apps (check install state and error code)' },
    ] },
  ]

  const endpointCentral: GuideSection[] = [
    { title: 'Package', items: [{ label: 'Source file', value: c.setupFile, copy: true }, { label: 'Path', value: 'Endpoint Central → Software Deployment → Software Packages → Add Package → Windows' }] },
    { title: 'Commands', items: [{ label: 'Installation command', value: c.installCommand, copy: true }, { label: 'Uninstallation command', value: c.uninstallCommand, copy: true }] },
    { title: 'Detection', items: [{ label: 'Detection criteria', value: c.detection.type === 'msi-product-code' ? `MSI product code ${c.detection.value}` : `${c.detection.type}${c.detection.value ? ` — ${c.detection.value}` : ''}`, copy: true }] },
    { title: 'Deployment', items: [
      { label: 'Execution context', value: c.installBehavior === 'system' ? 'System account' : 'Logged-on user' },
      { label: 'Target computer group', value: 'Create a small pilot computer group first' },
      { label: 'Self Service Portal', value: 'Enable only after a successful pilot' },
    ], notes: ['Pilot on a small group before wider deployment.'] },
    { title: 'Monitoring', items: [{ label: 'Status', value: 'Software Deployment → Deployment Status → check Succeeded / Failed / Yet to apply per computer' }] },
  ]

  return { ready: true, ...(banner ? { banner } : {}), intune, endpointCentral, endpointCentralApi }
}
