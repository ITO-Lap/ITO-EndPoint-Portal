import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { PillarDeviceList, PosturePillar, PosturePillarDevice, SecurityPostureResult } from '../../api'

vi.mock('../../api', () => ({
  api: {
    fetchSecurityPosture: vi.fn(), fetchPillarDevices: vi.fn(),
    fetchEndpointProtectionCoverage: vi.fn(() => new Promise(() => {})), refreshEndpointProtectionCoverage: vi.fn(),
  },
}))
vi.mock('../../components/security/EndpointProtectionCoverage', () => ({ EndpointProtectionCoverage: () => <div>coverage stub</div> }))

import { api } from '../../api'
import { SecurityPosturePage } from '../SecurityPosturePage'

const fetchPosture = vi.mocked(api.fetchSecurityPosture)
const fetchDevices = vi.mocked(api.fetchPillarDevices)

const PATCH_A = 'KB5094125 — 2026-06 Cumulative Update for Windows 11'
const PATCH_B = 'Microsoft Edge 150.0.1'

const base = { description: 'desc', scope: 'Windows & macOS', weight: 0.25, byPlatform: [], bySource: [], topFindings: [] }

const encryption: PosturePillar = {
  ...base, id: 'encryption', label: 'Disk Encryption', inScope: 10, assessed: 8, passing: 6, failing: 2, notReported: 2, scorePct: 75,
  byPlatform: [{ key: 'Windows', assessed: 8, passing: 6, failing: 2, notReported: 2 }],
  bySource: [{ key: 'Microsoft Intune', assessed: 8, passing: 6, failing: 2, notReported: 2 }],
}
const patching: PosturePillar = {
  ...base, id: 'patching', label: 'Critical Patching', inScope: 10, assessed: 4, passing: 1, failing: 3, notReported: 6, scorePct: 25,
  byPlatform: [
    { key: 'Windows', assessed: 2, passing: 0, failing: 2, notReported: 3 },
    { key: 'macOS', assessed: 2, passing: 1, failing: 1, notReported: 3 },
  ],
  bySource: [{ key: 'Microsoft Intune', assessed: 3, passing: 0, failing: 3, notReported: 2 }, { key: 'ManageEngine', assessed: 1, passing: 1, failing: 0, notReported: 4 }],
  topFindings: [{ label: PATCH_A, devices: 2 }, { label: PATCH_B, devices: 1 }],
}
const nothing: PosturePillar = { ...base, id: 'compliance', label: 'MDM Compliance', inScope: 5, assessed: 0, passing: 0, failing: 0, notReported: 5, scorePct: null, unavailableReason: 'No native verdict.' }

function result(): SecurityPostureResult {
  return { generatedAt: '2026-10-12T10:00:00Z', source: 'all', deviceCount: 10, sourceCounts: { intune: 8, manageengine: 2 },
    pillars: [encryption, patching, nothing], overall: { score: 50, assessedPillars: 2, totalPillars: 3 } }
}

const row = (over: Partial<PosturePillarDevice> = {}): PosturePillarDevice => ({
  id: '1', deviceName: 'WIN-ALPHA', user: 'alpha@zinnia.com', platform: 'Windows', source: 'Microsoft Intune', serialNumber: 'S1', status: 'fail', detail: 'BitLocker Off', ...over,
})
const list = (rows: PosturePillarDevice[], over: Partial<PillarDeviceList> = {}): PillarDeviceList => ({ total: rows.length, page: 1, pageSize: 25, totalPages: 1, rows, ...over })

beforeEach(() => {
  fetchPosture.mockReset(); fetchPosture.mockResolvedValue(result())
  fetchDevices.mockReset(); fetchDevices.mockResolvedValue(list([row(), row({ id: '2', deviceName: 'WIN-BETA' })]))
})

const openPillar = async (name: RegExp) => {
  render(<SecurityPosturePage />)
  await userEvent.click(await screen.findByRole('button', { name }))
  return screen.findByRole('region', { name: /details$/ })
}
const lastParams = () => fetchDevices.mock.calls.at(-1)![1]

describe('tiles', () => {
  it('show live counts and never the old hardcoded demo figures', async () => {
    render(<SecurityPosturePage />)
    expect(await screen.findByRole('button', { name: /Disk Encryption: 75%/ })).toBeInTheDocument()
    expect(screen.queryByText('447')).not.toBeInTheDocument()
    expect(screen.queryByText(/estimated from mock/i)).not.toBeInTheDocument()
  })

  it('Critical Patching tile names the most common missing critical patches', async () => {
    render(<SecurityPosturePage />)
    const tile = await screen.findByRole('button', { name: /Critical Patching: 25%/ })
    expect(within(tile).getByText('Top missing critical patches')).toBeInTheDocument()
    expect(within(tile).getByText(PATCH_A)).toBeInTheDocument()
    expect(within(tile).getByText(PATCH_B)).toBeInTheDocument()
    const encTile = screen.getByRole('button', { name: /Disk Encryption: 75%/ })
    expect(within(encTile).queryByText('Top missing critical patches')).not.toBeInTheDocument()
  })

  it('renders N/A (not 0%) for a pillar with nothing assessed', async () => {
    render(<SecurityPosturePage />)
    const tile = await screen.findByRole('button', { name: /MDM Compliance: no data/ })
    expect(within(tile).getByText('N/A')).toBeInTheDocument()
  })
})

describe('details panel', () => {
  it('opens on the failing devices by default and fetches them from the server', async () => {
    const panel = await openPillar(/Critical Patching: 25%/)
    expect(await within(panel).findByText('WIN-ALPHA')).toBeInTheDocument()
    expect(fetchDevices).toHaveBeenCalledWith('patching', expect.objectContaining({ source: 'all', status: 'fail', page: 1 }))
    expect(within(panel).getByText('Failing', { selector: 'span.normal-case' })).toBeInTheDocument()
  })

  it('Finding lists the actual missing patches, collapsing long lists', async () => {
    const items = ['KB1 — Patch one', 'KB2 — Patch two', 'KB3 — Patch three', 'KB4 — Patch four', 'KB5 — Patch five']
    fetchDevices.mockResolvedValue(list([row({ detail: '5 critical, 0 important patches missing', items })]))
    const panel = await openPillar(/Critical Patching: 25%/)
    const cell = await within(panel).findByText('5 critical, 0 important patches missing')
    const finding = cell.parentElement!
    expect(within(finding).queryByText('KB1 — Patch one')).not.toBeInTheDocument()
    await userEvent.click(within(finding).getByRole('button', { name: 'Show 5 missing critical patches' }))
    expect(within(finding).getByText('KB1 — Patch one')).toBeInTheDocument()
    expect(within(finding).getByText('KB3 — Patch three')).toBeInTheDocument()
    expect(within(finding).queryByText('KB4 — Patch four')).not.toBeInTheDocument()
    await userEvent.click(within(finding).getByRole('button', { name: '+2 more' }))
    expect(within(finding).getByText('KB5 — Patch five')).toBeInTheDocument()
    await userEvent.click(within(finding).getByRole('button', { name: 'Show fewer' }))
    expect(within(finding).queryByText('KB5 — Patch five')).not.toBeInTheDocument()
  })

  it('clicking a platform failing number shows that platform’s failing devices', async () => {
    const panel = await openPillar(/Critical Patching: 25%/)
    await userEvent.click(within(panel).getByRole('button', { name: 'macOS: 1 failing — show devices' }))
    await waitFor(() => expect(lastParams()).toMatchObject({ platform: 'macOS', status: 'fail' }))
    expect(within(panel).getByText('macOS · Failing')).toBeInTheDocument()
    expect(within(panel).getByRole('button', { name: 'macOS: 1 failing — show devices' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('clicking passing and not-reported numbers shows those devices', async () => {
    const panel = await openPillar(/Critical Patching: 25%/)
    await userEvent.click(within(panel).getByRole('button', { name: 'macOS: 1 passing — show devices' }))
    await waitFor(() => expect(lastParams()).toMatchObject({ platform: 'macOS', status: 'pass' }))
    await userEvent.click(within(panel).getByRole('button', { name: 'Windows: 3 not reported — show devices' }))
    await waitFor(() => expect(lastParams()).toMatchObject({ platform: 'Windows', status: 'unknown' }))
    expect(within(panel).getByText('Windows · Not reported')).toBeInTheDocument()
  })

  it('clicking a management-source number filters by source', async () => {
    const panel = await openPillar(/Critical Patching: 25%/)
    await userEvent.click(within(panel).getByRole('button', { name: 'Microsoft Intune: 3 failing — show devices' }))
    await waitFor(() => expect(lastParams()).toMatchObject({ sourceKey: 'Microsoft Intune', status: 'fail' }))
    expect(lastParams()).not.toHaveProperty('platform')
  })

  it('a zero count is not clickable', async () => {
    const panel = await openPillar(/Critical Patching: 25%/)
    expect(within(panel).getByRole('button', { name: 'ManageEngine: 0 failing — show devices' })).toBeDisabled()
  })

  it('the stat tiles and the row label switch the segment too, and Reset filter restores the default', async () => {
    const panel = await openPillar(/Critical Patching: 25%/)
    await userEvent.click(within(panel).getByRole('button', { name: 'Show 6 not reported devices' }))
    await waitFor(() => expect(lastParams()).toMatchObject({ status: 'unknown' }))
    await userEvent.click(within(panel).getByRole('button', { name: 'Windows: show all 5 in-scope devices' }))
    await waitFor(() => expect(lastParams()).toMatchObject({ platform: 'Windows' }))
    expect(lastParams()).not.toHaveProperty('status')
    await userEvent.click(within(panel).getByRole('button', { name: 'Reset filter' }))
    await waitFor(() => expect(lastParams()).toMatchObject({ status: 'fail' }))
    expect(lastParams()).not.toHaveProperty('platform')
  })

  it('clicking a top finding searches for that patch', async () => {
    const panel = await openPillar(/Critical Patching: 25%/)
    await userEvent.click(within(panel).getByRole('button', { name: new RegExp(`${PATCH_A}.*show devices`) }))
    await waitFor(() => expect(lastParams()).toMatchObject({ q: PATCH_A, status: 'fail' }))
    expect(within(panel).getByRole('searchbox', { name: 'Search devices' })).toHaveValue(PATCH_A)
  })

  it('searches server-side after a short debounce', async () => {
    const panel = await openPillar(/Disk Encryption: 75%/)
    await userEvent.type(within(panel).getByRole('searchbox', { name: 'Search devices' }), 'beta')
    await waitFor(() => expect(lastParams()).toMatchObject({ q: 'beta', page: 1 }))
  })

  it('pages through results', async () => {
    fetchDevices.mockResolvedValue(list([row()], { total: 60, totalPages: 3 }))
    const panel = await openPillar(/Disk Encryption: 75%/)
    await userEvent.click(await within(panel).findByRole('button', { name: 'Next' }))
    await waitFor(() => expect(lastParams()).toMatchObject({ page: 2 }))
  })

  it('shows the empty states', async () => {
    fetchDevices.mockResolvedValue(list([]))
    const panel = await openPillar(/Disk Encryption: 75%/)
    expect(await within(panel).findByText(/No failing devices — every assessed device passes/)).toBeInTheDocument()
    await userEvent.click(within(panel).getByRole('button', { name: 'Windows: 6 passing — show devices' }))
    expect(await within(panel).findByText('No devices match this filter.')).toBeInTheDocument()
  })

  it('shows an error with Retry when the device list fails', async () => {
    fetchDevices.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(list([row()]))
    const panel = await openPillar(/Disk Encryption: 75%/)
    expect(await within(panel).findByRole('alert')).toHaveTextContent('could not be loaded')
    await userEvent.click(within(panel).getByRole('button', { name: 'Retry' }))
    expect(await within(panel).findByText('WIN-ALPHA')).toBeInTheDocument()
  })

  it('explains why a pillar is unavailable', async () => {
    render(<SecurityPosturePage />)
    await userEvent.click(await screen.findByRole('button', { name: /MDM Compliance: no data/ }))
    expect(await screen.findByText('No native verdict.')).toBeInTheDocument()
  })

  it('opens from the keyboard and closes again', async () => {
    render(<SecurityPosturePage />)
    const tile = await screen.findByRole('button', { name: /Disk Encryption: 75%/ })
    tile.focus()
    await userEvent.keyboard('{Enter}')
    expect(await screen.findByRole('region', { name: 'Disk Encryption details' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Close Disk Encryption details' }))
    expect(screen.queryByRole('region', { name: 'Disk Encryption details' })).not.toBeInTheDocument()
  })
})

describe('page', () => {
  it('Top Risks come from the live pillars and link to the devices', async () => {
    render(<SecurityPosturePage />)
    await userEvent.click(await screen.findByRole('button', { name: /2 devices without disk encryption enabled/ }))
    await userEvent.click(screen.getByRole('button', { name: 'View 2 devices' }))
    expect(await screen.findByRole('region', { name: 'Disk Encryption details' })).toBeInTheDocument()
  })

  it('switching source requests that source and resets the open details', async () => {
    render(<SecurityPosturePage />)
    await userEvent.click(await screen.findByRole('button', { name: /Disk Encryption: 75%/ }))
    await userEvent.click(screen.getByRole('tab', { name: /ManageEngine/ }))
    await waitFor(() => expect(fetchPosture).toHaveBeenCalledWith('manageengine', false))
    expect(screen.queryByRole('region', { name: 'Disk Encryption details' })).not.toBeInTheDocument()
  })

  it('passes the active source to the device list', async () => {
    render(<SecurityPosturePage />)
    await userEvent.click(await screen.findByRole('tab', { name: /ManageEngine/ }))
    await userEvent.click(await screen.findByRole('button', { name: /Disk Encryption: 75%/ }))
    await waitFor(() => expect(fetchDevices).toHaveBeenCalledWith('encryption', expect.objectContaining({ source: 'manageengine' })))
  })

  it('shows an error with Retry when the posture cannot be loaded', async () => {
    fetchPosture.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(result())
    render(<SecurityPosturePage />)
    expect(await screen.findByRole('alert')).toHaveTextContent('could not be loaded')
    await userEvent.click(within(screen.getByRole('alert')).getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('button', { name: /Disk Encryption: 75%/ })).toBeInTheDocument()
  })

  it('labels the CIS table as static reference values', async () => {
    render(<SecurityPosturePage />)
    expect(await screen.findByText(/Static reference values — not calculated from your fleet/)).toBeInTheDocument()
  })
})
