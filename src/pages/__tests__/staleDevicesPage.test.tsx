import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { StaleDevice, StaleListResult, SourceMeta } from '../../api/staleDevices'

vi.mock('../../api/staleDevices', async importOriginal => {
  const actual = await importOriginal<typeof import('../../api/staleDevices')>()
  return { ...actual, setStaleDevicesActor: vi.fn(), staleDevicesApi: { status: vi.fn(), sync: vi.fn(), list: vi.fn(), exportCsv: vi.fn() } }
})

import { staleDevicesApi } from '../../api/staleDevices'
import { StaleDevicesPage } from '../StaleDevicesPage'
import pageSource from '../StaleDevicesPage.tsx?raw'

const api = vi.mocked(staleDevicesApi)
const ok = (inScope = 2): SourceMeta => ({ state: 'ok', lastAttemptAt: '2026-10-20T06:00:00.000Z', lastSuccessAt: '2026-10-20T06:00:00.000Z', error: null, inScope })

const device = (over: Partial<StaleDevice> = {}): StaleDevice => ({
  canonicalDeviceId: 'win:serial:SER-0001', deviceName: 'WIN-OLD', username: 'Asha Rao', email: 'asha@zinnia.com', platform: 'Windows', osVersion: '10.0.22631',
  serialNumber: 'SER-0001', managedBy: 'Intune + Endpoint Central', intuneDeviceId: 'i-1', endpointCentralDeviceId: 'e-1',
  intuneLastSyncAt: '2026-09-10T06:00:00.000Z', endpointCentralLastCheckInAt: '2026-09-20T06:00:00.000Z', effectiveLastCheckInAt: '2026-09-20T06:00:00.000Z',
  effectiveSource: 'endpoint-central', inactiveDays: 30, staleStatus: 'stale', correlationConfidence: 'high',
  explanation: 'Stale because the latest verified check-in was 30 days ago from Endpoint Central.', reviewReasons: [],
  sourceEvidence: [
    { source: 'intune', sourceId: 'i-1', lastCheckInAt: '2026-09-10T06:00:00.000Z', state: 'stale', note: null },
    { source: 'endpoint-central', sourceId: 'e-1', lastCheckInAt: '2026-09-20T06:00:00.000Z', state: 'stale', note: null },
  ],
  possibleDuplicateOf: [], sourceDataStatus: { intune: 'ok', 'endpoint-central': 'ok' }, lastDataRefreshAt: '2026-10-20T06:00:00.000Z', ...over,
})

const result = (over: Partial<StaleListResult> = {}): StaleListResult => ({
  staleDays: 21, state: 'ready', syncedAt: '2026-10-20T06:00:00.000Z', sources: { intune: ok(), 'endpoint-central': ok() },
  summary: { staleWindows: 1, staleMacOS: 0, sourceDrift: 2, noCheckinData: 3, needsReview: 4, activeDevices: 50, totalInScope: 56 },
  rows: [device()], page: 1, pageSize: 25, total: 1, totalPages: 1, ...over,
})

beforeEach(() => {
  Object.values(api).forEach(m => m.mockReset())
  api.list.mockResolvedValue(result())
  localStorage.clear()
})

describe('StaleDevicesPage', () => {
  it('shows the summary counts, live status and required columns', async () => {
    render(<StaleDevicesPage onBack={() => {}} viewerRole="IT Admin" />)
    await screen.findByText('WIN-OLD')
    expect(screen.getByText('Live data')).toBeInTheDocument()
    for (const h of ['Device name', 'Username', 'Email ID', 'Last check-in', 'Inactive for', 'OS platform', 'OS version', 'Managed by', 'Serial number']) expect(screen.getByRole('columnheader', { name: new RegExp(h) })).toBeInTheDocument()
    expect(screen.getByText('30 days')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Source drift/ })).toHaveTextContent('2')
    expect(screen.getByRole('tablist', { name: 'Stale device views' }).children).toHaveLength(5)
  })

  it('formats timestamps in the Asia/Kolkata zone by default', async () => {
    render(<StaleDevicesPage onBack={() => {}} />)
    await screen.findByText('WIN-OLD')
    expect(screen.getAllByText(/20 Sep\w* 2026.*11:30/).length).toBeGreaterThan(0) // 06:00 UTC = 11:30 IST
  })

  it('switches tab and queries the server with that view, search and page', async () => {
    render(<StaleDevicesPage onBack={() => {}} />)
    await screen.findByText('WIN-OLD')
    await userEvent.click(screen.getByRole('tab', { name: 'Source drift' }))
    await waitFor(() => expect(api.list).toHaveBeenLastCalledWith(expect.objectContaining({ view: 'drift', page: 1 })))
    await userEvent.type(screen.getByRole('searchbox', { name: /Search devices/ }), 'SER-0001')
    await waitFor(() => expect(api.list).toHaveBeenLastCalledWith(expect.objectContaining({ q: 'SER-0001' })))
  })

  it('opens a drawer with the stale explanation, per-source timestamps and both device IDs', async () => {
    render(<StaleDevicesPage onBack={() => {}} />)
    await userEvent.click(await screen.findByRole('button', { name: 'View details for WIN-OLD' }))
    const dlg = screen.getByRole('dialog', { name: /Device details — WIN-OLD/ })
    expect(within(dlg).getByText(/Stale because the latest verified check-in was 30 days ago from Endpoint Central/)).toBeInTheDocument()
    expect(within(dlg).getByText('EFFECTIVE')).toBeInTheDocument()
    expect(within(dlg).getByText('i-1')).toBeInTheDocument()
    expect(within(dlg).getByText('e-1')).toBeInTheDocument()
  })

  it('surfaces a failed source and warns in the drawer instead of implying data is complete', async () => {
    api.list.mockResolvedValue(result({ sources: { intune: ok(), 'endpoint-central': { ...ok(0), state: 'error', error: 'MDM 503' } }, rows: [device({ staleStatus: 'needs_review', sourceDataStatus: { intune: 'ok', 'endpoint-central': 'error' } })] }))
    render(<StaleDevicesPage onBack={() => {}} />)
    expect(await screen.findByText('Live — partial (source error)')).toBeInTheDocument()
    expect(screen.getByText(/Last refresh failed/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'View details for WIN-OLD' }))
    expect(screen.getByRole('alert')).toHaveTextContent(/Endpoint Central could not be read/)
  })

  it('says nothing is simulated when no source is configured', async () => {
    const off: SourceMeta = { state: 'not_configured', lastAttemptAt: null, lastSuccessAt: null, error: null, inScope: 0 }
    api.list.mockResolvedValue(result({ sources: { intune: off, 'endpoint-central': off }, rows: [], total: 0, syncedAt: null }))
    render(<StaleDevicesPage onBack={() => {}} />)
    expect(await screen.findByText(/Nothing is simulated/)).toBeInTheDocument()
    expect(screen.getAllByText('Not configured').length).toBeGreaterThan(0)
  })

  it('offers CSV export to admins only, and exports the current filters', async () => {
    const { unmount } = render(<StaleDevicesPage onBack={() => {}} viewerRole="Helpdesk" />)
    await screen.findByText('WIN-OLD')
    expect(screen.queryByRole('button', { name: /Export CSV/ })).not.toBeInTheDocument()
    unmount()
    render(<StaleDevicesPage onBack={() => {}} viewerRole="IT Admin" />)
    await screen.findByText('WIN-OLD')
    await userEvent.click(screen.getByRole('tab', { name: 'macOS' }))
    await userEvent.click(screen.getByRole('button', { name: /Export CSV/ }))
    expect(api.exportCsv).toHaveBeenCalledWith(expect.objectContaining({ view: 'macos' }), 'Asia/Kolkata')
  })

  it('has no mutating device action', () => {
    expect(pageSource).not.toMatch(/\b(Retire|Wipe|Delete|Unmanage|Restart|Remediate)\b/)
  })
})
