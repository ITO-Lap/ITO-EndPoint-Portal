import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { AppDetail, AppListResult, AppRow, AppSummary, Capabilities, RequestPreview, SyncStatus } from '../../api/appIntel'

vi.mock('../../api/appIntel', async importOriginal => {
  const actual = await importOriginal<typeof import('../../api/appIntel')>()
  return { ...actual, setAppIntelActor: vi.fn(), appIntelApi: { status: vi.fn(), sync: vi.fn(), summary: vi.fn(), list: vi.fn(), detail: vi.fn(), previewRequest: vi.fn(), createRequest: vi.fn() } }
})

import { appIntelApi, RequestFailure } from '../../api/appIntel'
import { AppIntelligencePage } from '../AppIntelligencePage'

const api = vi.mocked(appIntelApi)
const SYNCED = '2026-10-20T06:00:00.000Z'
const sync: SyncStatus = { state: 'ready', lastError: null, syncedAt: SYNCED, errors: {}, packagesReadable: true, excludedNative: { windows: 0, macOS: 0 } }
const ok = { state: 'ok' as const, message: 'ok' }
const caps: Capabilities = {
  intune: { detectedApps: ok, appCatalog: ok }, manageEngineMdm: ok, selfService: { intuneCompanyPortal: ok, endpointCentralPortal: ok }, endpointCentralInventory: ok,
  latestVersionSources: { winget: ok, homebrew: ok }, packagers: { windows: false, macOS: false },
}
const summary: AppSummary = {
  platform: 'windows', appsDiscovered: 2, byInstallSource: { custom: 1, selfService: 0, manual: 1 }, updateAvailable: 2, packageRequired: 1, packageRequiredBreakdown: { newPackage: 1, repackage: 0 },
  updateBreakdown: { existingPackage: 0, needsPackaging: 1, vendorUpdate: 0, review: 0, devicesBehind: 40 }, reviewRequired: 0, nativeUpdate: 0, upToDate: 0, dataUnavailable: 0, publishers: [],
}

const row = (over: Partial<AppRow> = {}): AppRow => ({
  key: 'vlc', app: 'VLC media player', publisher: 'VideoLAN', platform: 'windows',
  installedVersions: [{ version: '3.0.16', deviceCount: 40, provider: 'intune' }], affectedDevices: 40, totalDevices: 100, deployedPackageVersion: '3.0.18', latestVerifiedVersion: '3.0.21',
  status: 'Repackage required', action: 'Create a new package for 3.0.21 and redeploy', providers: ['intune'], latestSource: 'winget', lastChecked: SYNCED, confidence: 'high',
  installSource: 'custom', installSourceBasis: 'wingetId', installSourceReason: 'Packaged by IT',
  owner: 'Endpoint Team', ring: 'Pilot → Broad', ringBasis: 'group-name', packagingState: 'behind', impactPercent: 40,
  cve: { state: 'ok', total: 4, highestSeverity: 'CRITICAL', knownExploited: 1, exposedDevices: 40 }, request: null, ...over,
})
const unknownRow = row({ key: 'slack', app: 'Slack', owner: null, ring: null, ringBasis: 'none', packagingState: 'no-package', impactPercent: 10, affectedDevices: 10, status: 'Package required', cve: { state: 'unmapped', total: 0, highestSeverity: null, knownExploited: 0, exposedDevices: 0 } })
const list = (rows: AppRow[]): AppListResult => ({ state: sync, total: rows.length, page: 1, pageSize: 25, totalPages: 1, rows })

const detail = (r: AppRow, over: Partial<AppDetail> = {}): AppDetail => ({
  app: {
    key: r.key, platform: 'windows', identity: { publisher: 'VideoLAN', displayName: r.app, bundleId: null, productCode: null, wingetId: 'VideoLAN.VLC', brewToken: null },
    installed: r.installedVersions, packages: [], confidence: 'high', confidenceReason: 'winget id', installSource: 'custom', installSourceBasis: 'wingetId', installSourceReason: 'Packaged by IT',
    providers: ['intune'], status: r.status, reason: 'The deployed package (3.0.18) is older than 3.0.21.', action: r.action, deployedPackageVersion: '3.0.18',
    latest: { version: '3.0.21', versionSource: 'winget', sourceUrl: 'https://x.test/m.yaml', lastCheckedAt: SYNCED, selfUpdating: false, releaseNotes: { summary: 'Decoders:\n * Fix Opus', url: 'https://www.videolan.org/vlc/releases/3.0.21.html', source: 'winget-pkgs locale manifest', unavailableReason: null } },
    latestUnavailable: null, affectedDevices: 40, totalDevices: 100, evidence: [], dataGaps: [],
  },
  row: r, syncState: 'checked', providerAsOf: { intune: SYNCED }, syncedAt: SYNCED, devices: [], devicesNote: null, assignments: {}, packagingIntent: null,
  lifecycle: {
    owner: { name: 'Endpoint Team', source: 'Intune package owner field', all: ['Endpoint Team'], note: null },
    ring: { ring: 'Pilot → Broad', basis: 'group-name', note: 'Ring inferred from assignment group names, not from an explicit Intune ring setting.', targets: [{ intent: 'required', target: 'group', groupName: 'IT Pilot', packageName: 'VLC' }] },
    packaging: { state: 'behind', packageName: 'VLC', packageCount: 1, deployedVersion: '3.0.18', latestVersion: '3.0.21', lastModifiedAt: null, summary: 'Package 3.0.18 is older than the latest verified 3.0.21.' },
    impact: { devicesBehind: 40, totalDevices: 100, percentBehind: 40, byVersion: [], basis: 'Estimate from detected-app counts per version.' },
  },
  cve: {
    state: 'ok', reason: null, cpe: 'cpe:2.3:a:videolan:vlc_media_player', note: 'Source: NVD CVE API 2.0.', exposedDevices: 40, highestSeverity: 'CRITICAL', checkedAt: SYNCED,
    versions: [], counts: { total: 2, critical: 1, high: 1, medium: 0, low: 0, knownExploited: 1 },
    cves: [
      { id: 'CVE-2023-47359', severity: 'CRITICAL', score: 9.8, published: null, summary: 'Heap overflow in VLC.', knownExploited: true, url: 'https://nvd.nist.gov/vuln/detail/CVE-2023-47359', versions: ['3.0.16'] },
      { id: 'CVE-2023-47360', severity: 'HIGH', score: 7.5, published: null, summary: 'Integer underflow.', knownExploited: false, url: 'https://nvd.nist.gov/vuln/detail/CVE-2023-47360', versions: ['3.0.16'] },
    ],
  },
  requests: [], ...over,
})

const preview = (over: Partial<RequestPreview> = {}): RequestPreview => ({
  kind: 'jira', eligible: true, reason: null, configured: true, configuredNote: null, destination: 'Jira (new Task)', duplicate: null,
  content: { title: '[App update] VLC media player (Windows) → 3.0.21', priority: 'Critical', priorityBasis: '1 known-exploited (CISA KEV) CVE(s) affect installed versions', body: 'Application: VLC media player (Windows)\nStatus: Repackage required', slackText: ':package: *Version mismatch*' }, ...over,
})

beforeEach(() => {
  Object.values(api).forEach(m => m.mockReset())
  api.list.mockResolvedValue(list([row(), unknownRow]))
  api.summary.mockResolvedValue({ state: sync, summary })
  api.status.mockResolvedValue({ ...sync, capabilities: caps })
  api.detail.mockImplementation(async k => detail(k === 'slack' ? unknownRow : row()))
  api.previewRequest.mockResolvedValue(preview())
})

const open = async (role = 'IT Admin') => { render(<AppIntelligencePage viewerRole={role} />); await screen.findByText('VLC media player') }

describe('lifecycle columns', () => {
  it('shows owner, ring, CVEs and estimated impact, and never invents what is unknown', async () => {
    await open()
    for (const h of ['Owner', 'Deployment ring', 'CVEs']) expect(screen.getByRole('columnheader', { name: new RegExp(`^${h}`) })).toBeInTheDocument()
    const vlc = screen.getByText('VLC media player').closest('tr')!
    expect(within(vlc).getByText('Endpoint Team')).toBeInTheDocument()
    expect(within(vlc).getByText('Pilot → Broad')).toBeInTheDocument()
    expect(within(vlc).getByText('inferred')).toBeInTheDocument()
    expect(within(vlc).getByText('4 CVEs')).toBeInTheDocument()
    expect(within(vlc).getByText(/Critical · exploited/)).toBeInTheDocument()
    expect(within(vlc).getByText('(40%)')).toBeInTheDocument()
    const slack = screen.getByRole('button', { name: 'View details for Slack' }).closest('tr')!
    expect(within(slack).getByText('Not recorded')).toBeInTheDocument()
    expect(within(slack).getByText('Not identified')).toBeInTheDocument()
    expect(within(slack).getByText('Not checked')).toBeInTheDocument() // unmapped is not "none found"
    expect(within(slack).queryByText('None found')).not.toBeInTheDocument()
  })
})

describe('request actions from a mismatch', () => {
  it('offers Request and Slack to admins only', async () => {
    await open('Helpdesk')
    expect(screen.queryByRole('button', { name: /Create packaging request for/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Notify Slack about/ })).not.toBeInTheDocument()
  })

  it('previews exactly what will be sent, and sends nothing until confirmed', async () => {
    await open()
    await userEvent.click(screen.getByRole('button', { name: 'Create packaging request for VLC media player' }))
    const dlg = await screen.findByRole('dialog', { name: /Create packaging request — VLC media player/ })
    expect(within(dlg).getByText(/Jira \(new Task\)/)).toBeInTheDocument()
    expect(await within(dlg).findByText(/Status: Repackage required/)).toBeInTheDocument()
    expect(within(dlg).getByText(/Destination:/).closest('p')).toHaveTextContent(/Priority: Critical/)
    expect(api.createRequest).not.toHaveBeenCalled()
  })

  it('creates the request on confirm, shows the Jira link, and refreshes the list', async () => {
    api.createRequest.mockResolvedValue({ id: '1', appKey: 'vlc', app: 'VLC media player', platform: 'windows', targetVersion: '3.0.21', kind: 'jira', externalKey: 'ITO-42', externalUrl: 'https://jira.example/browse/ITO-42', createdAt: SYNCED, createdBy: 'a@z.com', createdByRole: 'IT Admin' })
    await open()
    const before = api.list.mock.calls.length
    await userEvent.click(screen.getByRole('button', { name: 'Create packaging request for VLC media player' }))
    const dlg = await screen.findByRole('dialog')
    await within(dlg).findByText(/Status: Repackage required/)
    await userEvent.click(within(dlg).getByRole('button', { name: 'Create Jira request' }))
    expect(api.createRequest).toHaveBeenCalledWith('vlc', 'jira')
    expect(await within(dlg).findByRole('link', { name: /ITO-42/ })).toHaveAttribute('href', 'https://jira.example/browse/ITO-42')
    await waitFor(() => expect(api.list.mock.calls.length).toBeGreaterThan(before))
  })

  it('blocks sending when a request already exists or the destination is not configured', async () => {
    api.previewRequest.mockResolvedValue(preview({ duplicate: { id: '1', appKey: 'vlc', app: 'VLC', platform: 'windows', targetVersion: '3.0.21', kind: 'jira', externalKey: 'ITO-7', externalUrl: 'https://jira.example/browse/ITO-7', createdAt: SYNCED, createdBy: 'a', createdByRole: 'IT Admin' } }))
    await open()
    await userEvent.click(screen.getByRole('button', { name: 'Create packaging request for VLC media player' }))
    const dlg = await screen.findByRole('dialog')
    expect(await within(dlg).findByText(/already exists/)).toBeInTheDocument()
    expect(within(dlg).getByRole('button', { name: 'Create Jira request' })).toBeDisabled()
    await userEvent.click(within(dlg).getByRole('button', { name: 'Close dialog' }))

    api.previewRequest.mockResolvedValue(preview({ kind: 'slack', configured: false, configuredNote: 'Slack is not configured.' }))
    await userEvent.click(screen.getAllByRole('button', { name: /Notify Slack about VLC/ })[0]!)
    const slack = await screen.findByRole('dialog', { name: /Notify in Slack/ })
    expect(await within(slack).findByText('Slack is not configured.')).toBeInTheDocument()
    expect(within(slack).getByRole('button', { name: 'Send to Slack' })).toBeDisabled()
    expect(api.createRequest).not.toHaveBeenCalled()
  })

  it('surfaces a delivery failure instead of claiming success', async () => {
    api.createRequest.mockRejectedValue(new RequestFailure('Jira rejected the request: bad field', 'delivery_failed', null))
    await open()
    await userEvent.click(screen.getByRole('button', { name: 'Create packaging request for VLC media player' }))
    const dlg = await screen.findByRole('dialog')
    await within(dlg).findByText(/Status: Repackage required/)
    await userEvent.click(within(dlg).getByRole('button', { name: 'Create Jira request' }))
    expect(await within(dlg).findByRole('alert')).toHaveTextContent(/Jira rejected the request/)
    expect(within(dlg).queryByText(/Packaging request created/)).not.toBeInTheDocument()
  })

  it('shows an existing request on the row instead of offering another', async () => {
    api.list.mockResolvedValue(list([row({ request: { jiraKey: 'ITO-42', jiraUrl: 'https://jira.example/browse/ITO-42', jiraAt: SYNCED, slackAt: SYNCED } })]))
    await open()
    expect(screen.getByRole('link', { name: 'Request ITO-42' })).toBeInTheDocument()
    expect(screen.getByText('Slack sent')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Create packaging request for VLC media player' })).not.toBeInTheDocument()
  })
})

describe('lifecycle drawer', () => {
  it('shows owner, packaging, ring, impact, CVEs and release notes', async () => {
    await open()
    await userEvent.click(screen.getByRole('button', { name: 'View details for VLC media player' }))
    const dlg = await screen.findByRole('dialog', { name: /App details — VLC media player/ })
    const lc = within(await within(dlg).findByRole('heading', { name: 'Application lifecycle' }).then(h => h.closest('section')!))
    expect(lc.getByText('Endpoint Team')).toBeInTheDocument()
    expect(lc.getByText('Package behind')).toBeInTheDocument()
    expect(lc.getByText('Pilot → Broad')).toBeInTheDocument()
    expect(lc.getByText(/inferred from assignment group names/)).toBeInTheDocument()
    expect(lc.getByText('40 on a version with known CVEs')).toBeInTheDocument()
    expect(lc.getByRole('link', { name: /CVE-2023-47359/ })).toHaveAttribute('href', 'https://nvd.nist.gov/vuln/detail/CVE-2023-47359')
    expect(lc.getByText(/1 known exploited \(CISA KEV\)/)).toBeInTheDocument()
    expect(lc.getByText(/Fix Opus/)).toBeInTheDocument()
    expect(lc.getByRole('link', { name: /Full release notes/ })).toHaveAttribute('href', 'https://www.videolan.org/vlc/releases/3.0.21.html')
  })

  it('says so plainly when owner, ring, CVE mapping and release notes are unavailable', async () => {
    api.detail.mockResolvedValue(detail(unknownRow, {
      lifecycle: { owner: { name: null, source: null, all: [], note: 'No Intune package for this app.' }, ring: { ring: null, basis: 'none', note: 'No Intune package.', targets: [] },
        packaging: { state: 'no-package', packageName: null, packageCount: 0, deployedVersion: null, latestVersion: '3.0.21', lastModifiedAt: null, summary: 'No package for this app in the Intune app catalog.' },
        impact: { devicesBehind: 10, totalDevices: 100, percentBehind: 10, byVersion: [], basis: 'Estimate.' } },
      cve: { state: 'unmapped', reason: 'No verified NVD product mapping for this app in the catalog, so CVEs are not checked (an unmapped app is not "clean").', cpe: null, versions: [], cves: [], counts: { total: 0, critical: 0, high: 0, medium: 0, low: 0, knownExploited: 0 }, exposedDevices: 0, highestSeverity: null, checkedAt: null, note: 'Source: NVD.' },
    }))
    await open()
    await userEvent.click(screen.getByRole('button', { name: 'View details for Slack' }))
    const dlg = await screen.findByRole('dialog', { name: /App details — Slack/ })
    expect(await within(dlg).findByText('Not recorded')).toBeInTheDocument()
    expect(within(dlg).getByText('Not identified')).toBeInTheDocument()
    expect(within(dlg).getByText(/Not checked\. No verified NVD product mapping/)).toBeInTheDocument()
  })

  it('lets an admin raise the mismatch from the drawer, and keeps Escape for the dialog', async () => {
    await open()
    await userEvent.click(screen.getByRole('button', { name: 'View details for VLC media player' }))
    const drawer = await screen.findByRole('dialog', { name: /App details/ })
    await userEvent.click(await within(drawer).findByRole('button', { name: 'Create packaging request' }))
    await screen.findByRole('dialog', { name: /Create packaging request — VLC media player/ })
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: /Create packaging request/ })).not.toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: /App details/ })).toBeInTheDocument() // drawer survives the first Escape
  })

  it('hides the request buttons from non-admins', async () => {
    await open('Helpdesk')
    await userEvent.click(screen.getByRole('button', { name: 'View details for VLC media player' }))
    const drawer = await screen.findByRole('dialog', { name: /App details/ })
    expect(await within(drawer).findByText(/needs the IT Admin or Global Admin role/)).toBeInTheDocument()
    expect(within(drawer).queryByRole('button', { name: 'Create packaging request' })).not.toBeInTheDocument()
  })
})
