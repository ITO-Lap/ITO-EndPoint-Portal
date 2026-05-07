import type { Device } from '../types.js'

interface KandjiDevice {
  device_id: string
  device_name: string
  serial_number: string
  platform: string
  os_version: string
  last_check_in: string
  filevault_enabled: boolean
  mdm_enabled: boolean
  assigned_user?: {
    email?: string
  }
}

function mapKandjiDevice(d: KandjiDevice): Device {
  const hasEncryptionIssue = !d.filevault_enabled
  const compliance: Device['complianceState'] = hasEncryptionIssue ? 'Warning' : 'Compliant'

  return {
    id: d.device_id,
    deviceName: d.device_name,
    user: d.assigned_user?.email ?? 'Unknown',
    serialNumber: d.serial_number,
    platform: 'macOS',
    osVersion: d.os_version,
    managementSource: 'Kandji',
    lastCheckIn: new Date(d.last_check_in).toLocaleString(),
    complianceState: compliance,
    encryptionStatus: d.filevault_enabled ? 'FileVault On' : 'FileVault Off',
    primaryIssue: hasEncryptionIssue ? 'FileVault encryption not enabled' : 'None',
    policyFailed: hasEncryptionIssue ? 'Security - FileVault Policy' : 'None',
    severity: 'Low',
    confidence: '72%',
    firstDetected: 'N/A',
    lastDetected: new Date(d.last_check_in).toLocaleString(),
    issueSource: 'Kandji',
  }
}

export async function getKandjiDevices(): Promise<Device[]> {
  const apiUrl = process.env.KANDJI_API_URL
  const apiToken = process.env.KANDJI_API_TOKEN

  if (!apiUrl || !apiToken) throw new Error('Kandji credentials not configured')

  const res = await fetch(`${apiUrl}/api/v1/devices?limit=100`, {
    headers: {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
    },
  })
  if (!res.ok) throw new Error(`Kandji API error: ${res.status} ${res.statusText}`)

  const data = await res.json() as KandjiDevice[]
  return data.map(mapKandjiDevice)
}

export function isKandjiConfigured(): boolean {
  return !!(process.env.KANDJI_API_URL && process.env.KANDJI_API_TOKEN)
}
