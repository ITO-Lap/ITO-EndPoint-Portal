import type { ActivityItem } from '../types.js'

export const mockActivity: ActivityItem[] = [
  {
    id: '1',
    deviceName: 'LAPTOP-8F7G2Q1',
    message: 'BitLocker encryption issue detected',
    status: 'Non-Compliant',
    timestamp: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
  },
  {
    id: '2',
    deviceName: 'MAC-9C2K7L3',
    message: 'FileVault encryption pending',
    status: 'Warning',
    timestamp: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
  },
  {
    id: '3',
    deviceName: 'USER2-WIN-01',
    message: 'All compliance policies passed',
    status: 'Compliant',
    timestamp: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
  },
  {
    id: '4',
    deviceName: 'LAPTOP-77H2KJ9',
    message: 'Policy compliance failure — Encryption',
    status: 'Non-Compliant',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
  },
  {
    id: '5',
    deviceName: 'MAC-8K3M1N2',
    message: 'Kandji sync completed successfully',
    status: 'Compliant',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 25).toISOString(),
  },
  {
    id: '6',
    deviceName: 'WIN-DESK-004',
    message: 'OS update required — critical patch missing',
    status: 'Warning',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 26).toISOString(),
  },
]
