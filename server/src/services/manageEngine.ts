import type { Device } from '../types.js'
import type { RuntimeManageEngineConfig } from '../store/integrationStore.js'
import { getManageEngineConfig } from '../store/integrationStore.js'

interface MEComputer {
  resource_id: string | number
  name: string
  email_id?: string
  serial_number?: string
  os_platform?: string
  os_version?: string
  last_contact_time?: string | number
  agent_status?: string
}

interface MEResponse {
  message_response: {
    computers: MEComputer[]
  }
}

function mapMEDevice(d: MEComputer): Device {
  const platform = d.os_platform?.toLowerCase()
  const mappedPlatform: Device['platform'] =
    platform?.includes('mac') ? 'macOS' : platform?.includes('linux') ? 'Linux' : 'Windows'

  const isManaged = d.agent_status === 'managed'
  const lastContactRaw = d.last_contact_time
  const lastCheckIn = lastContactRaw
    ? new Date(typeof lastContactRaw === 'number' ? lastContactRaw : Number(lastContactRaw)).toLocaleString()
    : 'Unknown'

  return {
    id:               String(d.resource_id),
    deviceName:       d.name,
    user:             d.email_id ?? 'Unknown',
    serialNumber:     d.serial_number ?? 'Unknown',
    platform:         mappedPlatform,
    osVersion:        d.os_version ?? 'Unknown',
    managementSource: 'ManageEngine',
    lastCheckIn,
    complianceState:  isManaged ? 'Compliant' : 'Warning',
    encryptionStatus: 'Unknown',
    primaryIssue:     isManaged ? 'None' : 'Agent not managed',
    policyFailed:     isManaged ? 'None' : 'Agent Management Policy',
    severity:         'Low',
    confidence:       '70%',
    firstDetected:    'N/A',
    lastDetected:     lastCheckIn,
    issueSource:      'ManageEngine',
  }
}

export async function getManageEngineDevices(cfg?: RuntimeManageEngineConfig): Promise<Device[]> {
  const config = cfg ?? getManageEngineConfig()
  if (!config) throw new Error('ManageEngine credentials not configured')

  const port = config.port ?? '8443'
  const baseUrl = config.serverUrl.replace(/\/$/, '')
  const res = await fetch(`${baseUrl}:${port}/api/1.0/computers?restype=computer&count=100`, {
    headers: { Authorization: config.apiKey },
  })
  if (!res.ok) throw new Error(`ManageEngine API error: ${res.status} ${res.statusText}`)

  const data = await res.json() as MEResponse
  return data.message_response.computers.map(mapMEDevice)
}

export function isManageEngineConfigured(): boolean {
  return !!getManageEngineConfig()
}
