import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ApiDevice, PatchSystemStatus, MissingPatchesResponse } from '../../../api'

vi.mock('../../../api', () => ({
  api: { fetchMissingPatches: vi.fn(), fetchAllDevicesRaw: vi.fn(), fetchPatchSystems: vi.fn() },
}))

import { api } from '../../../api'
import { KpiModal } from '../KpiModal'
import { KPI_CONFIGS, attachPatchStatus, initialPatchView } from '../../../lib/kpiConfig'
import { MacFleetReportsPage } from '../../../pages/MacFleetReportsPage'
import { ToastProvider } from '../../ui/ToastProvider'
import apiSource from '../../../api/index.ts?raw'
import drawerSource from '../MissingPatchDrawer.tsx?raw'
import modalSource from '../KpiModal.tsx?raw'

const fetchMissing = vi.mocked(api.fetchMissingPatches)

function patchStatus(over: Partial<PatchSystemStatus> = {}): PatchSystemStatus {
  return {
    resourceId: '1', detailResourceId: '116819000011966437', platform: 'Mac', names: [],
    missingOsPatches: 0, missingThirdPartyPatches: 0, missingDriverPatches: 0, missingBiosPatches: 0,
    criticalPatchCount: 0, importantPatchCount: 0, moderatePatchCount: 0, lowPatchCount: 0,
    lastScanTime: '2026-10-09T17:53:03.000Z', lastSuccessfulScanTime: '2026-10-09T17:53:03.000Z', scanSucceeded: true, ...over,
  }
}

function device(name: string, serial: string, ps?: PatchSystemStatus): ApiDevice {
  return {
    id: name, deviceName: name, user: 'u@zinnia.com', serialNumber: serial, platform: 'macOS', osVersion: '15.1',
    managementSource: 'ManageEngine', lastCheckIn: '1 day ago', complianceState: 'Compliant', encryptionStatus: 'Encrypted',
    primaryIssue: '', policyFailed: '', severity: 'Low', confidence: '', firstDetected: '', lastDetected: '', issueSource: '',
    patchStatus: ps,
  } as unknown as ApiDevice
}

const critical = device('Mac-Critical', 'AAAAAA1111', patchStatus({ criticalPatchCount: 1, missingOsPatches: 2, missingThirdPartyPatches: 12 }))
const appOnly = device('Mac-App', 'BBBBBB2222', patchStatus({ detailResourceId: '222222222', missingThirdPartyPatches: 3 }))
const clean = device('Mac-Clean', 'CCCCCC3333', patchStatus({ detailResourceId: '333333333' }))
const unmapped = device('Mac-Unmapped', 'DDDDDD4444')
const fleet = [critical, appOnly, clean, unmapped]

const ok = (patches: MissingPatchesResponse['patches'] = []): MissingPatchesResponse => ({ status: 'ok', patches, fetchedAt: '2026-10-10T10:00:00Z' })
const aPatch = { patchId: '1', name: 'macOS-27.0.1.zip', description: 'macOS 27.0.1 (CVE-2026-1111)', severity: 'Critical' as const, category: 'OS update' as const, vendor: 'Apple', updateType: 'Security Updates', kb: null, bulletinId: 'MAC-487', cves: ['CVE-2026-1111'], releasedAt: '2026-09-29T00:00:00Z', rebootRequirement: 'autoreboot', approvalStatus: 'approved', deploymentStatus: null }

beforeEach(() => { fetchMissing.mockReset(); fetchMissing.mockResolvedValue(ok([aPatch])) })

const renderModal = (kpiId: Parameters<typeof KpiModal>[0]['kpiId'], onClose = vi.fn()) =>
  render(<ToastProvider><KpiModal kpiId={kpiId} allDevices={fleet} appliedFilters="Platform: macOS" onClose={onClose} /></ToastProvider>)

describe('Patch Health card filters', () => {
  it('Missing Critical Patches → Macs with a critical missing patch', () => {
    expect(KPI_CONFIGS['missing-critical-patches'].filterFn(fleet).map(d => d.deviceName)).toEqual(['Mac-Critical'])
  })
  it('Missing Security Updates → Macs with missing OS updates', () => {
    expect(KPI_CONFIGS['missing-security-updates'].filterFn(fleet).map(d => d.deviceName)).toEqual(['Mac-Critical'])
  })
  it('Missing App Updates → Macs with missing third-party updates', () => {
    expect(KPI_CONFIGS['missing-app-updates'].filterFn(fleet).map(d => d.deviceName)).toEqual(['Mac-Critical', 'Mac-App'])
  })
  it('keeps the unavailable state when no device reports patch data', () => {
    const none = [unmapped]
    expect(KPI_CONFIGS['missing-critical-patches'].getValue(none)).toBe('N/A')
    expect(KPI_CONFIGS['missing-critical-patches'].getUnavailableReason?.(none)).toBeTruthy()
  })
  it('never infers fake rows: unmapped devices are excluded from every card', () => {
    for (const id of ['missing-critical-patches', 'missing-security-updates', 'missing-app-updates'] as const)
      expect(KPI_CONFIGS[id].filterFn(fleet).map(d => d.deviceName)).not.toContain('Mac-Unmapped')
  })
  it('attaches patch rows by serial number once, ignoring short serials', () => {
    const sys = [patchStatus({ names: ['Finney-AAAAAA1111'] })]
    const out = attachPatchStatus([device('x', 'AAAAAA1111'), device('y', 'AB12')], sys)
    expect(out[0]!.patchStatus).toBeDefined()
    expect(out[1]!.patchStatus).toBeUndefined()
  })
  it('opens the Critical tab only from the Missing Critical card', () => {
    expect(initialPatchView('missing-critical-patches')).toBe('critical')
    expect(initialPatchView('missing-security-updates')).toBe('all')
    expect(initialPatchView('missing-app-updates')).toBe('all')
  })
})

describe('KpiModal filter + Patch Status pill', () => {
  it('shows only the affected devices, an active-filter chip, and Clear filter restores all Macs', async () => {
    renderModal('missing-critical-patches')
    expect(screen.getByText('Mac-Critical')).toBeInTheDocument()
    expect(screen.queryByText('Mac-App')).not.toBeInTheDocument()
    expect(screen.getByText(/Active filter:/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Clear filter' }))
    expect(screen.getByText('Mac-App')).toBeInTheDocument()
    expect(screen.getByText('Mac-Unmapped')).toBeInTheDocument()
    expect(screen.queryByText(/Active filter:/)).not.toBeInTheDocument()
  })

  it('renders the pill as an accessible, non-nested button', () => {
    renderModal('missing-critical-patches')
    const pill = screen.getByRole('button', { name: 'View missing patches for Mac-Critical' })
    expect(pill).toHaveTextContent('Missing 2 OS, 12 app')
    expect(pill.querySelector('button')).toBeNull()
    expect(pill.closest('button')).toBe(pill)
  })

  it('opens the drawer for that exact Mac on the Critical tab and queries by its stored resource id', async () => {
    renderModal('missing-critical-patches')
    await userEvent.click(screen.getByRole('button', { name: 'View missing patches for Mac-Critical' }))
    const dialog = await screen.findByRole('dialog', { name: 'Missing Patch Details — Mac-Critical' })
    expect(within(dialog).getByRole('tab', { name: 'Critical' })).toHaveAttribute('aria-selected', 'true')
    expect(fetchMissing).toHaveBeenCalledWith('116819000011966437', 'critical', false)
    expect(await within(dialog).findByText('macOS-27.0.1.zip')).toBeInTheDocument()
    expect(within(dialog).getByText('CVEs:').parentElement).toHaveTextContent('CVE-2026-1111')
  })

  it('opens All missing when arriving from another card, and switches tabs', async () => {
    renderModal('missing-app-updates')
    await userEvent.click(screen.getByRole('button', { name: 'View missing patches for Mac-App' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('tab', { name: 'All missing' })).toHaveAttribute('aria-selected', 'true')
    expect(fetchMissing).toHaveBeenCalledWith('222222222', 'all', false)
    await userEvent.click(within(dialog).getByRole('tab', { name: 'App updates' }))
    await waitFor(() => expect(fetchMissing).toHaveBeenCalledWith('222222222', 'app', false))
  })

  it('opens from the keyboard and Escape closes only the drawer', async () => {
    const onClose = vi.fn()
    renderModal('missing-critical-patches', onClose)
    screen.getByRole('button', { name: 'View missing patches for Mac-Critical' }).focus()
    await userEvent.keyboard('{Enter}')
    await screen.findByRole('dialog')
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(onClose).not.toHaveBeenCalled()
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('refresh bypasses the cache', async () => {
    renderModal('missing-critical-patches')
    await userEvent.click(screen.getByRole('button', { name: 'View missing patches for Mac-Critical' }))
    await screen.findByText('macOS-27.0.1.zip')
    await userEvent.click(screen.getByRole('button', { name: 'Refresh missing patches' }))
    expect(fetchMissing).toHaveBeenLastCalledWith('116819000011966437', 'critical', true)
  })

  it('shows the empty Critical message', async () => {
    fetchMissing.mockResolvedValue(ok([]))
    renderModal('missing-critical-patches')
    await userEvent.click(screen.getByRole('button', { name: 'View missing patches for Mac-Critical' }))
    expect(await screen.findByText('No critical missing patches were reported for this Mac in its latest Endpoint Central patch scan.')).toBeInTheDocument()
  })

  it('shows a mapping-required message and makes no request when the Mac has no Endpoint Central resource id', async () => {
    renderModal('missing-critical-patches')
    await userEvent.click(screen.getByRole('button', { name: 'Clear filter' }))
    await userEvent.click(screen.getByRole('button', { name: 'View missing patches for Mac-Unmapped' }))
    expect(await screen.findByText(/not mapped to an Endpoint Central Patch Manager resource/)).toBeInTheDocument()
    expect(fetchMissing).not.toHaveBeenCalled()
  })

  it('shows configuration-required when the Patch Management scope is missing', async () => {
    fetchMissing.mockResolvedValue({ status: 'scope_required', patches: [] })
    renderModal('missing-critical-patches')
    await userEvent.click(screen.getByRole('button', { name: 'View missing patches for Mac-Critical' }))
    expect(await screen.findByText(/DesktopCentralCloud\.PatchMgmt\.READ/)).toBeInTheDocument()
  })

  it('shows a simple error with Retry, without technical details', async () => {
    fetchMissing.mockRejectedValueOnce(new Error('ECONNRESET secret-detail')).mockResolvedValueOnce(ok([aPatch]))
    renderModal('missing-critical-patches')
    await userEvent.click(screen.getByRole('button', { name: 'View missing patches for Mac-Critical' }))
    expect(await screen.findByText(/couldn't be loaded right now/)).toBeInTheDocument()
    expect(screen.queryByText(/secret-detail/)).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('macOS-27.0.1.zip')).toBeInTheDocument()
  })
})

describe('Mac Fleet Reports Patch Health cards', () => {
  it('are keyboard-operable buttons that open the filtered table', async () => {
    vi.mocked(api.fetchAllDevicesRaw).mockResolvedValue({ devices: [critical], total: 1 } as never)
    vi.mocked(api.fetchPatchSystems).mockResolvedValue({ configured: true, systems: [] })
    render(<ToastProvider><MacFleetReportsPage onBack={() => {}} /></ToastProvider>)
    const card = await screen.findByRole('button', { name: 'View Missing Critical Patches details' })
    expect(card.tagName).toBe('BUTTON')
    expect(card).toHaveTextContent('Click to view details →')
    card.focus()
    await userEvent.keyboard('{Enter}')
    expect(await screen.findByText(/Active filter:/)).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    card.focus()
    await userEvent.keyboard(' ')
    expect(await screen.findByText(/Active filter:/)).toBeInTheDocument()
  })
})

describe('no credential leakage to the client', () => {
  it('browser code never references OAuth tokens or the ManageEngine hosts', () => {
    for (const src of [apiSource, drawerSource, modalSource]) {
      expect(src).not.toMatch(/zoho-oauthtoken|accounts\.zoho|endpointcentral\.manageengine|refresh_token|client_secret/i)
    }
  })
  it('only calls the app server route', () => {
    expect(apiSource).toContain('/api/endpoint-central/devices/')
  })
})
