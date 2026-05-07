import type { Runbook } from '../types.js'

export const mockRunbooks: Runbook[] = [
  {
    id: '1',
    name: 'Enable BitLocker and Sync Device',
    description: 'Enable BitLocker encryption and sync the device with Intune',
    steps: [
      'Verify BitLocker encryption is disabled.',
      'Enable BitLocker via Intune policy.',
      'Ensure device is online and connected.',
      'Trigger device sync.',
      'Confirm compliance after next check-in.',
    ],
    prerequisites: [
      'Device must be running Windows 10 or later',
      'TPM 2.0 or compatible module required',
      'Local administrative access needed',
      'Stable network connection required',
    ],
    expectedResult:
      'After completing these steps, the device will have BitLocker encryption enabled and will sync with the management source. The compliance status should update to "Compliant" after the next check-in cycle.',
    automationAvailable: true,
    escalationNeeded: false,
  },
  {
    id: '2',
    name: 'Enable FileVault on macOS',
    description: 'Enable FileVault encryption on macOS devices',
    steps: [
      'Check current FileVault status',
      'Enable FileVault through System Preferences',
      'Store recovery key securely',
      'Sync device with Kandji',
      'Verify encryption status',
    ],
    prerequisites: [
      'macOS 10.13 or later',
      'Administrative privileges',
      'Stable internet connection',
    ],
    expectedResult: 'FileVault encryption will be enabled and device will be marked as compliant.',
    automationAvailable: true,
    escalationNeeded: false,
  },
]
