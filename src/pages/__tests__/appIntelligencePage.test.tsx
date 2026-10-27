import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { AppDetail, AppListResult, AppRow, AppSummary, Capabilities, SyncStatus } from '../../api/appIntel'

vi.mock('../../api/appIntel', async importOriginal => {
  const actual = await importOriginal<typeof import('../../api/appIntel')>()
  return { ...actual, setAppIntelActor: vi.fn(), appIntelApi: { status: vi.fn(), sync: vi.fn(), summary: vi.fn(), list: vi.fn(), detail: vi.fn() } }
})

import { appIntelApi } from '../../api/appIntel'
import { AppIntelligencePage } from '../AppIntelligencePage'
import { registerPackager } from '../../lib/packagingHandoff'
import apiSource from '../../api/appIntel.ts?raw'
import drawerSource from '../../components/appIntel/AppDetailDrawer.tsx?raw'
import pageSource from '../AppIntelligencePage.tsx?raw'

const api = vi.mocked(appIntelApi)
const SYNCED = '2026-10-12T10:00:00.000Z'

const okSync = (over: Partial<SyncStatus> = {}): SyncStatus => ({ state: 'ready', lastError: null, syncedAt: SYNCED, errors: {}, packagesReadable: true, excludedNative: { windows: 657, macOS: 3 }, ...over })
const caps: Capabilities = {
  intune: { detectedApps: { state: 'ok', message: 'Readable' }, appCatalog: { state: 'ok', message: 'Readable' } },
  manageEngineMdm: { state: 'ok', message: 'MDM app inventory is used for macOS.' },
  selfService: {
    intuneCompanyPortal: { state: 'ok', message: 'Apps whose matching Intune package has an "available" assignment are classed as Self-service.' },
    endpointCentralPortal: { state: 'scope_missing', message: 'Endpoint Central self-service portal apps cannot be identified: MDM-only connection.' },
  },
  endpointCentralInventory: { state: 'scope_missing', message: 'This ManageEngine connection is MDM-only. Endpoint Central software inventory needs the DesktopCentralCloud.Inventory.READ scope.' },
  latestVersionSources: { winget: { state: 'ok', message: 'winget-pkgs' }, homebrew: { state: 'ok', message: 'Homebrew cask API' } },
  packagers: { windows: false, macOS: false },
}
const summary = (over: Partial<AppSummary> = {}): AppSummary => ({
  platform: 'windows', appsDiscovered: 120, byInstallSource: { custom: 12, selfService: 8, manual: 100 }, updateAvailable: 4, packageRequired: 5, packageRequiredBreakdown: { newPackage: 3, repackage: 2 }, updateBreakdown: { existingPackage: 1, needsPackaging: 3, vendorUpdate: 0, review: 0, devicesBehind: 1250 },
  reviewRequired: 7, nativeUpdate: 20, upToDate: 10, dataUnavailable: 74, publishers: ['Google LLC', 'Microsoft Corporation'], ...over,
})

const row = (over: Partial<AppRow> = {}): AppRow => ({
  key: 'intune|windows|catalog:notepad++.notepad++', app: 'Notepad++', publisher: "Don HO", platform: 'windows',
  installedVersions: [{ version: '8.6.0', deviceCount: 40, provider: 'intune' }, { version: '8.5.0', deviceCount: 10, provider: 'intune' }, { version: '8.4.0', deviceCount: 2, provider: 'intune' }],
  affectedDevices: 52, totalDevices: 52, deployedPackageVersion: null, latestVerifiedVersion: '8.9.8.1', status: 'Package required', installSource: 'manual', installSourceBasis: 'none', installSourceReason: 'No matching package in the Intune app catalog — installed outside managed deployment (user or vendor installer).',
  action: 'Create a package for 8.9.8.1', providers: ['intune'], latestSource: 'Microsoft winget-pkgs manifest (Notepad++.Notepad++)', lastChecked: SYNCED, confidence: 'medium',
  owner: null, ring: null, ringBasis: 'none', packagingState: 'no-package', impactPercent: 100, cve: null, request: null, ...over,
})
const rows = [row(), row({ key: 'k2', app: 'Zoom Workplace', publisher: 'Zoom', status: 'Review required', action: 'Confirm whether the candidate package is the same app', latestVerifiedVersion: '7.2.48556', deployedPackageVersion: null, installedVersions: [{ version: '7.0.0', deviceCount: 3, provider: 'intune' }], affectedDevices: 3, confidence: 'medium', installSource: 'custom', installSourceBasis: 'name', installSourceReason: 'Packaged by IT in Intune ("Zoom") and not offered for self-service. Matched to the package by name only (low confidence).' })]
const list = (r: AppRow[] = rows, over: Partial<AppListResult> = {}): AppListResult => ({ state: okSync(), total: r.length, page: 1, pageSize: 25, totalPages: 1, rows: r, ...over })

const detail = (over: Partial<AppDetail> = {}): AppDetail => ({
  app: {
    key: rows[0]!.key, platform: 'windows',
    identity: { publisher: 'Don HO', displayName: 'Notepad++', bundleId: null, productCode: null, wingetId: 'Notepad++.Notepad++', brewToken: null },
    installed: rows[0]!.installedVersions, packages: [], installSource: 'manual', installSourceBasis: 'none', installSourceReason: rows[0]!.installSourceReason, confidence: 'medium', confidenceReason: 'Matched a curated catalog entry by exact name and publisher.',
    providers: ['intune'], status: 'Package required', reason: '52 device(s) run an older version than the latest verified 8.9.8.1 and no package for this app was found in the Intune app catalog.',
    action: 'Create a package for 8.9.8.1', deployedPackageVersion: null,
    latest: { version: '8.9.8.1', versionSource: 'Microsoft winget-pkgs manifest (Notepad++.Notepad++)', sourceUrl: 'https://raw.githubusercontent.com/microsoft/winget-pkgs/master/x.yaml', lastCheckedAt: SYNCED, selfUpdating: false },
    latestUnavailable: null, affectedDevices: 52, totalDevices: 52,
    evidence: [
      { label: 'Detected versions', value: '8.6.0 ×40, 8.5.0 ×10', source: 'Microsoft Intune', asOf: SYNCED },
      { label: 'Latest verified version', value: '8.9.8.1', source: 'Microsoft winget-pkgs manifest (Notepad++.Notepad++)', asOf: SYNCED },
      { label: 'Comparison', value: '8.6.0, 8.5.0, 8.4.0 older than 8.9.8.1', source: 'Version comparator', asOf: SYNCED },
    ],
    dataGaps: ['Intune detected apps carry no stable identifier.'],
  },
  row: rows[0]!, syncState: 'checked', providerAsOf: { intune: SYNCED }, syncedAt: SYNCED,
  devices: [{ name: 'WIN-001', user: 'a@zinnia.com', version: '8.6.0', provider: 'intune' }], devicesNote: null, assignments: {},
  packagingIntent: { platform: 'windows', sourceId: 'Notepad++.Notepad++', sourceKind: 'winget', displayName: 'Notepad++', publisher: 'Don HO', bundleId: null, targetVersion: '8.9.8.1', reason: 'r', kind: 'new-package', allowedActions: ['build-package'] },
  lifecycle: null, cve: { state: 'unmapped', reason: null, cpe: null, versions: [], cves: [], counts: { total: 0, critical: 0, high: 0, medium: 0, low: 0, knownExploited: 0 }, exposedDevices: 0, highestSeverity: null, checkedAt: null, note: '' }, requests: [],
  ...over,
})

beforeEach(() => {
  Object.values(api).forEach(m => m.mockReset())
  api.list.mockResolvedValue(list())
  api.summary.mockImplementation(async p => ({ state: okSync(), summary: summary({ platform: p }) }))
  api.status.mockResolvedValue({ ...okSync(), capabilities: caps })
  api.sync.mockResolvedValue(okSync({ state: 'syncing' }))
  api.detail.mockResolvedValue(detail())
})
afterEach(() => vi.useRealTimers())

const lastList = () => api.list.mock.calls.at(-1)![0]
const renderPage = async () => { render(<AppIntelligencePage viewerRole="IT Admin" />); await screen.findByText('Notepad++') }

describe('summary cards, platform and table', () => {
  it('shows the four summary cards with live counts', async () => {
    await renderPage()
    expect(screen.getByRole('button', { name: /Apps discovered: 120/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Update available: 4/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Package required: 3/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Review required: 7/ })).toBeInTheDocument()
    expect(screen.getByText('Plus 2 needing a repackage')).toBeInTheDocument()
  })

  it('renders every spec column and the correlated values', async () => {
    await renderPage()
    for (const h of ['App', 'Publisher', 'Platform', 'Installed versions', 'Affected devices', 'Deployed package version', 'Verified latest release', 'Status', 'Action', 'Source', 'Last checked'])
      expect(screen.getByRole('columnheader', { name: new RegExp(`^${h}`) })).toBeInTheDocument()
    const r = screen.getByText('Notepad++').closest('tr')!
    expect(within(r).getByText('8.9.8.1')).toBeInTheDocument()
    expect(within(r).getByText('not reported')).toBeInTheDocument() // deployed package version is never invented
    expect(within(r).getByText('Package required')).toBeInTheDocument()
    expect(within(r).getByText('+1 more')).toBeInTheDocument()
    expect(within(r).getByText('Intune')).toBeInTheDocument()
    expect(within(r).getByText('Microsoft winget-pkgs manifest (Notepad++.Notepad++)')).toBeInTheDocument()
  })

  it('shows "unavailable" for a missing latest version rather than a guess', async () => {
    api.list.mockResolvedValue(list([row({ latestVerifiedVersion: null, status: 'Data unavailable', latestSource: null })]))
    await renderPage()
    expect(within(screen.getByText('Notepad++').closest('tr')!).getByText('unavailable')).toBeInTheDocument()
  })

  it('platform toggle requests the other platform and resets platform-specific filters', async () => {
    await renderPage()
    expect(lastList().platform).toBe('windows')
    await userEvent.click(screen.getByRole('tab', { name: 'macOS' }))
    await waitFor(() => expect(lastList().platform).toBe('macOS'))
    expect(api.summary).toHaveBeenCalledWith('macOS')
  })

  it('the Update available card explains its count and filters the table to apps with a newer verified version', async () => {
    await renderPage()
    const card = screen.getByRole('button', { name: /Update available: 4 — filter the table/ })
    expect(within(card).getByText('Windows · 3 need packaging · 1 have a package ready · 1,250 devices behind')).toBeInTheDocument()
    expect(lastList().updateAvailable).toBe('')
    await userEvent.click(card)
    await waitFor(() => expect(lastList()).toMatchObject({ updateAvailable: '1', status: '', page: 1 }))
    expect(card).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('checkbox', { name: 'Only apps with an update available' })).toBeChecked()
    await userEvent.click(card) // toggles off
    await waitFor(() => expect(lastList().updateAvailable).toBe(''))
  })

  it('the update checkbox and the status cards are mutually exclusive, and Reset clears the update filter', async () => {
    await renderPage()
    await userEvent.click(screen.getByRole('checkbox', { name: 'Only apps with an update available' }))
    await waitFor(() => expect(lastList().updateAvailable).toBe('1'))
    await userEvent.click(screen.getByRole('button', { name: /Review required: 7/ }))
    await waitFor(() => expect(lastList()).toMatchObject({ status: 'Review required', updateAvailable: '' }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'Only apps with an update available' }))
    await userEvent.click(screen.getByRole('button', { name: 'Reset' }))
    await waitFor(() => expect(lastList().updateAvailable).toBe(''))
    expect(screen.getByRole('checkbox', { name: 'Only apps with an update available' })).not.toBeChecked()
  })

  it('says plainly when no app has a confirmed update (never a silent zero)', async () => {
    api.summary.mockImplementation(async p => ({ state: okSync(), summary: summary({ platform: p, updateAvailable: 0, updateBreakdown: { existingPackage: 0, needsPackaging: 0, vendorUpdate: 0, review: 0, devicesBehind: 0 } }) }))
    await renderPage()
    expect(within(screen.getByRole('button', { name: /Update available: 0/ })).getByText(/No app has a confirmed newer version/)).toBeInTheDocument()
  })

  it('replaces the Update available tile with the active platform summary', async () => {
    api.summary.mockImplementation(async p => ({ state: okSync(), summary: summary(p === 'windows'
      ? { platform: 'windows', updateAvailable: 8 }
      : { platform: 'macOS', updateAvailable: 2, updateBreakdown: { existingPackage: 0, needsPackaging: 2, vendorUpdate: 0, review: 0, devicesBehind: 19 } },
    ) }))
    await renderPage()
    expect(screen.getByRole('button', { name: /Update available: 8/ })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('tab', { name: 'macOS' }))
    await waitFor(() => expect(screen.getByRole('button', { name: /Update available: 2/ })).toBeInTheDocument())
    expect(screen.getByText('macOS · 2 need packaging · 19 devices behind')).toBeInTheDocument()
  })

  it('a summary card filters the table by that status', async () => {
    await renderPage()
    await userEvent.click(screen.getByRole('button', { name: /Review required: 7/ }))
    await waitFor(() => expect(lastList()).toMatchObject({ status: 'Review required', page: 1 }))
    await userEvent.click(screen.getByRole('button', { name: 'Show 2 app(s) that need a repackage' }))
    await waitFor(() => expect(lastList().status).toBe('Repackage required'))
  })
})

describe('scope: native apps excluded, install source shown', () => {
  it('states the scope and how many native apps were excluded for the current platform', async () => {
    await renderPage()
    const note = screen.getByTestId('scope-note')
    expect(note).toHaveTextContent('custom (packaged in Intune), self-service (offered in the Company Portal) and manually installed apps')
    expect(note).toHaveTextContent('657 native Windows apps (built-in components, Store/MSIX) are excluded from the scan')
    expect(note).toHaveTextContent('Showing 12 custom · 8 self-service · 100 manual')
    await userEvent.click(screen.getByRole('tab', { name: 'macOS' }))
    await waitFor(() => expect(screen.getByTestId('scope-note')).toHaveTextContent('3 native macOS apps (built-in components, Store/MSIX, Apple system apps) are excluded'))
  })

  it('shows an Install source column with a badge per row, flagging name-only matches', async () => {
    await renderPage()
    expect(screen.getByRole('columnheader', { name: 'Install source' })).toBeInTheDocument()
    const manualRow = screen.getByText('Notepad++').closest('tr')!
    expect(within(manualRow).getByText('Manual')).toBeInTheDocument()
    const customRow = screen.getByText('Zoom Workplace').closest('tr')!
    expect(within(customRow).getByText('Custom · name match')).toBeInTheDocument()
  })

  it('has no "native" option in the Install source filter and sends the chosen source to the server', async () => {
    await renderPage()
    const sel = screen.getByLabelText('Install source') as HTMLSelectElement
    expect([...sel.options].map(o => o.textContent)).toEqual(['All sources', 'Custom', 'Self-service', 'Manual'])
    await userEvent.selectOptions(sel, 'self-service')
    await waitFor(() => expect(lastList().installSource).toBe('self-service'))
    await userEvent.click(screen.getByRole('button', { name: 'Reset' }))
    await waitFor(() => expect(lastList().installSource).toBe(''))
  })

  it('lists both self-service portals in the data-sources panel, including the Endpoint Central limitation', async () => {
    await renderPage()
    await userEvent.click(screen.getByRole('button', { name: /Data sources & capabilities/ }))
    expect(screen.getByText(/Self-service — Intune Company Portal/)).toBeInTheDocument()
    expect(screen.getByText(/Self-service — Endpoint Central portal/)).toBeInTheDocument()
    expect(screen.getByText(/Endpoint Central self-service portal apps cannot be identified/)).toBeInTheDocument()
  })
})

describe('filters, search, sort, paging', () => {
  it('provider, status, last-sync state and confidence filters are sent to the server', async () => {
    await renderPage()
    await userEvent.selectOptions(screen.getByLabelText('Provider'), 'manageengine-mdm')
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'Native update')
    await userEvent.selectOptions(screen.getByLabelText('Last-sync state'), 'never')
    await userEvent.selectOptions(screen.getByLabelText('Confidence'), 'low')
    await waitFor(() => expect(lastList()).toMatchObject({ provider: 'manageengine-mdm', status: 'Native update', syncState: 'never', confidence: 'low' }))
  })

  it('publisher filter and debounced search; Reset clears everything', async () => {
    await renderPage()
    await userEvent.type(screen.getByLabelText('Publisher'), 'Google LLC')
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search apps' }), 'chrome')
    await waitFor(() => expect(lastList()).toMatchObject({ publisher: 'Google LLC', q: 'chrome' }))
    await userEvent.click(screen.getByRole('button', { name: 'Reset' }))
    await waitFor(() => expect(lastList()).toMatchObject({ publisher: '', q: '', status: '' }))
  })

  it('sorts via the column headers and pages', async () => {
    api.list.mockResolvedValue(list(rows, { total: 60, totalPages: 3 }))
    await renderPage()
    await userEvent.click(screen.getByRole('button', { name: /Affected devices/ }))
    await waitFor(() => expect(lastList()).toMatchObject({ sortKey: 'affected', sortDir: 'asc' }))
    await userEvent.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(lastList().page).toBe(2))
  })

  it('shows the empty-filter state', async () => {
    api.list.mockResolvedValue(list([]))
    render(<AppIntelligencePage viewerRole="IT Admin" />)
    expect(await screen.findByText('No apps match these filters.')).toBeInTheDocument()
  })
})

describe('sync, errors and capabilities', () => {
  it('shows the last-synced time and starts a sync on request', async () => {
    await renderPage()
    expect(screen.getByText(/Last synced/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Sync now' }))
    expect(api.sync).toHaveBeenCalled()
  })

  it('explains an in-progress first sync and a never-synced state (no sample rows)', async () => {
    const syncing = okSync({ state: 'syncing', syncedAt: null })
    api.list.mockResolvedValue(list([], { state: syncing })); api.status.mockResolvedValue({ ...syncing, capabilities: caps }); api.summary.mockResolvedValue({ state: syncing, summary: null })
    render(<AppIntelligencePage viewerRole="IT Admin" />)
    expect(await screen.findByText(/First sync in progress/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sync now' })).toBeDisabled()
  })

  it('shows no data and a prompt when nothing has synced yet', async () => {
    const idle = okSync({ state: 'idle', syncedAt: null })
    api.list.mockResolvedValue(list([], { state: idle })); api.status.mockResolvedValue({ ...idle, capabilities: caps }); api.summary.mockResolvedValue({ state: idle, summary: null })
    render(<AppIntelligencePage viewerRole="IT Admin" />)
    expect(await screen.findByText(/No inventory has been synced yet/)).toBeInTheDocument()
  })

  it('a failed sync is reported and never replaced with data', async () => {
    const failed = okSync({ state: 'error', syncedAt: null, lastError: 'All inventory providers failed: Graph 503' })
    api.list.mockResolvedValue(list([], { state: failed })); api.status.mockResolvedValue({ ...failed, capabilities: caps }); api.summary.mockResolvedValue({ state: failed, summary: null })
    render(<AppIntelligencePage viewerRole="IT Admin" />)
    expect((await screen.findByText(/The last sync failed:/)).closest('p')).toHaveTextContent('Graph 503')
    expect(screen.getByText(/nothing falls back to sample data/)).toBeInTheDocument()
  })

  it('surfaces partial provider failures', async () => {
    api.list.mockResolvedValue(list(rows, { state: okSync({ errors: { 'intune-app-catalog': '403 Forbidden' } }) }))
    api.status.mockResolvedValue({ ...okSync({ errors: { 'intune-app-catalog': '403 Forbidden' } }), capabilities: caps })
    await renderPage()
    expect((await screen.findByText(/Some sources could not be read:/)).closest('p')).toHaveTextContent('intune-app-catalog — 403 Forbidden')
  })

  it('a request failure shows Retry', async () => {
    api.list.mockRejectedValueOnce(new Error('network down')).mockResolvedValueOnce(list())
    render(<AppIntelligencePage viewerRole="IT Admin" />)
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('network down')
    await userEvent.click(within(alert).getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('Notepad++')).toBeInTheDocument()
  })

  it('explains the MDM-only Endpoint Central state in the data-sources panel', async () => {
    await renderPage()
    await userEvent.click(screen.getByRole('button', { name: /Data sources & capabilities/ }))
    expect(screen.getAllByText(/MDM-only/).length).toBeGreaterThan(0)
    expect(screen.getByText(/DesktopCentralCloud\.Inventory\.READ/)).toBeInTheDocument()
    expect(screen.getByText(/Windows not connected · macOS not connected/)).toBeInTheDocument()
  })
})

describe('details drawer', () => {
  const open = async (name = 'View details for Notepad++') => {
    await renderPage()
    await userEvent.click(screen.getByRole('button', { name }))
    return screen.findByRole('dialog', { name: 'App details — Notepad++' })
  }

  it('opens from a row click and explains why, with evidence, versions and gaps', async () => {
    await renderPage()
    await userEvent.click(screen.getByText('Notepad++').closest('tr')!)
    const d = await screen.findByRole('dialog', { name: 'App details — Notepad++' })
    expect(api.detail).toHaveBeenCalledWith('intune|windows|catalog:notepad++.notepad++')
    expect(await within(d).findByText(/no package for this app was found in the Intune app catalog/)).toBeInTheDocument()
    expect(within(d).getByText('Why this status?')).toBeInTheDocument()
    expect(within(d).getByText('Installed-version distribution')).toBeInTheDocument()
    expect(within(d).getByRole('img', { name: '8.6.0: 40 devices' })).toBeInTheDocument()
    expect(within(d).getByText('WIN-001')).toBeInTheDocument()
    expect(within(d).getByText('Intune detected apps carry no stable identifier.')).toBeInTheDocument()
    expect(within(d).getByText('Matching confidence & data gaps')).toBeInTheDocument()
    expect(within(d).getByText(/8\.6\.0, 8\.5\.0, 8\.4\.0 older than 8\.9\.8\.1/, { selector: 'p' })).toBeInTheDocument()
    // every evidence value carries its source and freshness
    const evidenceRow = within(d).getByText('Detected versions').closest('tr')!
    expect(within(evidenceRow).getByText('Microsoft Intune')).toBeInTheDocument()
    expect(within(evidenceRow).getByText(new Date(SYNCED).toLocaleString())).toBeInTheDocument()
    expect(within(d).getByText('Data sources & freshness')).toBeInTheDocument()
  })

  it('explains the install source in the drawer and its limits', async () => {
    const d = await open()
    expect(await within(d).findByText('Install source')).toBeInTheDocument()
    expect(within(d).getByText(/installed outside managed deployment/)).toBeInTheDocument()
    expect(within(d).getByText(/not from how an individual device received the app/)).toBeInTheDocument()
    expect(within(d).getByText(/Endpoint Central self-service portal cannot be read/)).toBeInTheDocument()
  })

  it('shows package evidence with the match basis, and says when versions are not reported', async () => {
    api.detail.mockResolvedValue(detail({ app: { ...detail().app, packages: [{ packageId: 'p1', displayName: 'Notepad++ (Win32)', version: null, versionSource: null, matchBasis: 'name', odataType: 'win32LobApp', lastModifiedAt: null }] }, assignments: { p1: [{ intent: 'required', target: 'group' }] } }))
    const d = await open()
    expect(await within(d).findByText(/not reported by Intune/)).toBeInTheDocument()
    expect(within(d).getByText(/low confidence, not a strong identifier/)).toBeInTheDocument()
    expect(within(d).getByText(/required → group/)).toBeInTheDocument()
  })

  it('explains an unavailable latest-version source instead of guessing', async () => {
    api.detail.mockResolvedValue(detail({ app: { ...detail().app, latest: null, latestUnavailable: { reason: 'GitHub API rate limit reached', lastCheckedAt: SYNCED }, status: 'Data unavailable' }, packagingIntent: null }))
    const d = await open()
    expect(await within(d).findByText(/Unavailable — GitHub API rate limit reached/)).toBeInTheDocument()
    expect(within(d).queryByRole('button', { name: /Create package/ })).not.toBeInTheDocument()
  })

  it('Create package is disabled while no packaging workflow is connected, and says why', async () => {
    const d = await open()
    const btn = await within(d).findByRole('button', { name: /Create package/ })
    expect(btn).toBeDisabled()
    expect(within(d).getByText(/No packaging workflow is connected to this build/)).toBeInTheDocument()
    expect(within(d).getByText(/Building only — nothing is published or deployed automatically/)).toBeInTheDocument()
  })

  it('Create package hands the pre-filled intent to the registered packager (build only)', async () => {
    const handler = vi.fn()
    const unregister = registerPackager('windows', handler)
    const d = await open()
    const btn = await within(d).findByRole('button', { name: /Create package/ })
    expect(btn).toBeEnabled()
    await userEvent.click(btn)
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ platform: 'windows', sourceKind: 'winget', sourceId: 'Notepad++.Notepad++', targetVersion: '8.9.8.1', allowedActions: ['build-package'] }))
    unregister()
  })

  it('does not offer packaging for a status that needs none', async () => {
    api.detail.mockResolvedValue(detail({ app: { ...detail().app, status: 'Up to date' }, packagingIntent: null }))
    const d = await open()
    await within(d).findByText('Why this status?')
    expect(within(d).queryByRole('button', { name: /Create package|Copy package request/ })).not.toBeInTheDocument()
  })

  it('closes with Escape and shows Retry on a load failure', async () => {
    api.detail.mockRejectedValueOnce(new Error('x')).mockResolvedValueOnce(detail())
    const d = await open()
    expect(await within(d).findByRole('alert')).toHaveTextContent('could not be loaded')
    await userEvent.click(within(d).getByRole('button', { name: 'Retry' }))
    expect(await within(d).findByText('Why this status?')).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('opens from the keyboard', async () => {
    await renderPage()
    screen.getByRole('button', { name: 'View details for Notepad++' }).focus()
    await userEvent.keyboard('{Enter}')
    expect(await screen.findByRole('dialog', { name: 'App details — Notepad++' })).toBeInTheDocument()
  })
})

describe('read-only and no credential exposure', () => {
  it('browser code never references tokens, secrets or provider hosts', () => {
    for (const src of [apiSource, drawerSource, pageSource])
      expect(src).not.toMatch(/zoho-oauthtoken|accounts\.zoho|graph\.microsoft\.com|login\.microsoftonline|refresh_token|client_secret|Bearer /i)
  })
  it('the client can only GET, plus the sync trigger — no write verbs', () => {
    expect(apiSource).not.toMatch(/'(PUT|PATCH|DELETE)'/)
    expect(apiSource).toMatch(/method: 'GET' \| 'POST'/)
  })
  it('embedded mode drops the page title but keeps sync controls and the table', async () => {
    render(<AppIntelligencePage viewerRole="IT Admin" embedded />)
    await screen.findByText('Notepad++')
    expect(screen.queryByRole('heading', { name: 'App Intelligence' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Sync now/ })).toBeInTheDocument()
  })
  it('the drawer exposes no publish, deploy or approve action', () => {
    expect(drawerSource).not.toMatch(/\b(Publish|Approve)\b|Deploy now/)
  })
})
