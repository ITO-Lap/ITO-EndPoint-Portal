import { describe, it, expect } from 'vitest'
import { findMatchingDevices } from '../automationEngine.js'
import type { AutomationRule, Device } from '../../types.js'

const dev = (id: string, serial: string, source: Device['managementSource'], daysAgo = 0, platform: Device['platform'] = 'Windows'): Device => ({
  id, deviceName: id, user: 'u', serialNumber: serial, platform, osVersion: '1', managementSource: source,
  lastCheckIn: new Date(Date.now() - daysAgo * 86_400_000).toISOString(), complianceState: 'Compliant', encryptionStatus: 'On',
  primaryIssue: '', policyFailed: '', severity: 'Low', confidence: '', firstDetected: '', lastDetected: '', issueSource: '',
} as Device)

const rule = (type: 'agent_missing' | 'agent_stale', source: AutomationRule['conditions']['source'], config: Record<string, number> = {}): AutomationRule => ({
  id: 'r', name: 'r', description: '', category: 'compliance', enabled: true, trigger: { type, config },
  conditions: { platform: 'Windows', source, severity: 'all', complianceState: 'all' }, actions: [], triggerCount: 0, createdAt: '', createdBy: '',
})

describe('dual-agent triggers', () => {
  const devices = [
    dev('both-i', 'AAA', 'Microsoft Intune'), dev('both-e', 'AAA', 'ManageEngine'),
    dev('only-intune', 'BBB', 'Microsoft Intune'), dev('only-ec', 'CCC', 'ManageEngine'),
    dev('no-serial', '', 'Microsoft Intune'),
  ]

  it('agent_missing flags an Intune device that has no Endpoint Central record', () => {
    expect(findMatchingDevices(rule('agent_missing', 'intune'), devices).map(d => d.id)).toEqual(['only-intune'])
  })
  it('agent_missing flags an Endpoint Central device that is not in Intune', () => {
    expect(findMatchingDevices(rule('agent_missing', 'manageengine'), devices).map(d => d.id)).toEqual(['only-ec'])
  })
  it('raises nothing when one source returned no devices (avoids a false fleet-wide alert)', () => {
    expect(findMatchingDevices(rule('agent_missing', 'intune'), devices.filter(d => d.managementSource === 'Microsoft Intune'))).toEqual([])
  })
  it('agent_stale flags the silent side only while the other side still reports', () => {
    const list = [
      dev('i-silent', 'DDD', 'Microsoft Intune', 10), dev('e-live', 'DDD', 'ManageEngine', 0),
      dev('i-old', 'EEE', 'Microsoft Intune', 10), dev('e-old', 'EEE', 'ManageEngine', 10),
    ]
    expect(findMatchingDevices(rule('agent_stale', 'all', { days: 7 }), list).map(d => d.id)).toEqual(['i-silent'])
  })
})
