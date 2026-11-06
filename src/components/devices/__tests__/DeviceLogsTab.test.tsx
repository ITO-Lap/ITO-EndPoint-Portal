import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'

vi.mock('../../../api/deviceLogs', () => ({
  deviceLogsApi: {
    get: vi.fn(async () => ({
      device: { id: 'd1', name: 'PC-1', platform: 'Windows', source: 'Microsoft Intune', user: 'a@b.c', serialNumber: 'S1', osVersion: '10.0.1' },
      generatedAt: '2026-11-06T00:00:00Z',
      entries: [
        { time: '2026-11-05T09:00:00Z', category: 'Compliance', event: 'Compliance state', status: 'Non-Compliant', detail: 'OS out of date', source: 'Microsoft Intune' },
        { time: '', category: 'App', event: 'Chrome', status: 'Installed', detail: '130.0', source: 'Microsoft Intune' },
      ],
      sections: [{ name: 'Intune action history', ok: false, count: 0, error: 'Graph refused (403)' }],
    })),
    download: vi.fn(async () => undefined),
    requestDiagnostics: vi.fn(),
    diagnosticsStatus: vi.fn(),
  },
}))

import { DeviceLogsTab } from '../DeviceLogsTab'
import { deviceLogsApi } from '../../../api/deviceLogs'
import type { ApiDevice } from '../../../api'

const device = (o: Partial<ApiDevice> = {}) => ({ id: 'd1', deviceName: 'PC-1', platform: 'Windows', managementSource: 'Microsoft Intune', ...o }) as ApiDevice

describe('DeviceLogsTab', () => {
  beforeEach(() => vi.clearAllMocks())

  it('lists entries, surfaces a failed section and filters by category', async () => {
    render(<DeviceLogsTab d={device()} />)
    expect(await screen.findByText('Compliance state')).toBeTruthy()
    expect(screen.getByText(/Graph refused \(403\)/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /^App \(1\)/ }))
    expect(screen.queryByText('Compliance state')).toBeNull()
    expect(screen.getByText('Chrome')).toBeTruthy()
  })

  it('exports Excel and CSV', async () => {
    render(<DeviceLogsTab d={device()} />)
    await screen.findByText('Compliance state')
    fireEvent.click(screen.getByRole('button', { name: /Export Excel/ }))
    await waitFor(() => expect((screen.getByRole('button', { name: /Export CSV/ }) as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(screen.getByRole('button', { name: /Export CSV/ }))
    await waitFor(() => expect(deviceLogsApi.download).toHaveBeenCalledTimes(2))
    expect(vi.mocked(deviceLogsApi.download).mock.calls.map(c => c[1])).toEqual(['excel', 'csv'])
  })

  it('offers diagnostics for Intune Windows only', async () => {
    const { unmount } = render(<DeviceLogsTab d={device()} />)
    expect(await screen.findByRole('button', { name: /Collect diagnostics/ })).toBeTruthy()
    unmount()
    render(<DeviceLogsTab d={device({ platform: 'macOS', managementSource: 'ManageEngine' })} />)
    await screen.findByText('Compliance state')
    expect(screen.queryByRole('button', { name: /Collect diagnostics/ })).toBeNull()
    expect(screen.getByText(/not exposed by the ManageEngine API/)).toBeTruthy()
  })
})
