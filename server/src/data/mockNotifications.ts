import type { Notification } from '../types.js'

export const mockNotifications: Notification[] = [
  {
    id: '1',
    message: 'Device LAPTOP-8F7G2Q1 is now compliant',
    type: 'success',
    read: false,
    createdAt: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
  },
  {
    id: '2',
    message: 'New security patch available for 3 devices',
    type: 'warning',
    read: false,
    createdAt: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
  },
  {
    id: '3',
    message: 'BitLocker policy enforcement completed',
    type: 'success',
    read: false,
    createdAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
  },
]
