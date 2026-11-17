import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { PackageJob, PackagerStatus, PublishingGuide } from '../../api/winPackager'

vi.mock('../../api/winPackager', async importOriginal => {
  const actual = await importOriginal<typeof import('../../api/winPackager')>()
  return {
    ...actual,
    winPackagerApi: {
      status: vi.fn(), jobs: vi.fn(), job: vi.fn(), upload: vi.fn(), inspect: vi.fn(), selectInstaller: vi.fn(), saveConfig: vi.fn(),
      uploadIcon: vi.fn(), validate: vi.fn(), approve: vi.fn(), createPackage: vi.fn(), artifacts: vi.fn(), guide: vi.fn(), confirmPublishing: vi.fn(),
      remove: vi.fn(), download: vi.fn(),
    },
  }
})

import { winPackagerApi } from '../../api/winPackager'
import { WindowsPackageBuilderPage } from '../WindowsPackageBuilderPage'
import { PermissionsProvider } from '../../context/PermissionsContext'
import pageSource from '../WindowsPackageBuilderPage.tsx?raw'
import apiSource from '../../api/winPackager.ts?raw'

const api = vi.mocked(winPackagerApi)
const ALL = { 'winPackager.read': true, 'winPackager.write': true, 'winPackager.validate': true, 'winPackager.publish': true }

const status = (ready = false): PackagerStatus => ({
  limits: { maxUploadBytes: 2 * 1024 ** 3, maxIntuneBytes: 30 * 1024 ** 3 },
  windowsWorker: ready ? { configured: true, state: 'ready', name: 'WIN-01', canPackage: true } : { configured: false, state: 'api-unavailable', reason: 'No Windows worker is configured.' },
  workerLinksConfigured: ready,
  publishing: { intune: { enabled: false, reason: 'Publish to Intune is disabled until Microsoft Graph permissions and implementation are verified.' }, endpointCentral: { configured: false, message: 'Endpoint Central publishing API not configured — use guided manual publishing.' } },
})

const exeJob = (over: Partial<PackageJob> = {}): PackageJob => ({
  id: 'job-1', state: 'review-required', stateReason: 'Inspected. Review the configuration; Windows validation has not run.', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:01Z', createdBy: 'eng@zinnia.com',
  source: { fileName: 'setup.exe', storedName: 'setup.exe', type: 'exe', sizeBytes: 5 * 1024 ** 2, sha256: 'a'.repeat(64) },
  analysis: {
    analyzedAt: '', installerFile: 'setup.exe', installerKind: 'exe', tech: 'nsis', appName: 'Widget', publisher: 'Acme', version: '1.0', architecture: 'x64',
    signature: { status: 'present-unverified', signer: 'Acme Inc', note: 'Signature present but not cryptographically verified on this server. Windows validation required.' },
    commands: { install: '"setup.exe" /S', confidence: 'likely', basis: 'NSIS marker found.' },
    detection: { type: 'registry-uninstall', value: 'Widget', minVersion: '1.0' }, confidence: 70, warnings: [], windowsValidationRequired: true,
  },
  config: {
    appName: 'Widget', publisher: 'Acme', version: '1.0', description: '', installCommand: '"setup.exe" /S', uninstallCommand: '', detection: { type: 'registry-uninstall', value: 'Widget', minVersion: '1.0' },
    installBehavior: 'system', architecture: 'x64', minimumOs: 'Windows 10 1809', restartBehavior: 'intune-decides', returnCodes: [{ code: 0, type: 'success' }],
    dependencies: '', supersedenceNotes: '', assignmentNotes: '', setupFile: 'setup.exe', acknowledgedUnverifiedCommands: false,
  },
  events: [], ...over,
})

function renderPage(permissions: Record<string, boolean> = ALL) {
  return render(<PermissionsProvider permissions={permissions}><WindowsPackageBuilderPage onBack={() => undefined} viewerRole="IT Admin" /></PermissionsProvider>)
}

beforeEach(() => {
  vi.clearAllMocks()
  api.status.mockResolvedValue(status())
  api.jobs.mockResolvedValue([])
  api.artifacts.mockResolvedValue({ files: [], output: null, sourceSha256: '' })
})

describe('Windows Package Builder page', () => {
  it('shows the 6-step workflow and an honest API Unavailable worker state', async () => {
    renderPage()
    expect(await screen.findByText(/Windows worker: API Unavailable/)).toBeInTheDocument()
    for (const label of ['Upload Source', 'Inspect & Analyze', 'Review Configuration', 'Validate on Windows', 'Create Package', 'Publishing Guide & Download']) {
      expect(screen.getByRole('button', { name: new RegExp(label.replace('&', '&')) })).toBeInTheDocument()
    }
    expect(screen.getByText(/never executed on this server/)).toBeInTheDocument()
  })

  it('denies the page without winPackager.read', async () => {
    renderPage({})
    expect(await screen.findByText(/do not have permission to view/)).toBeInTheDocument()
  })

  it('uploads a file and shows analysis with command confidence and Windows-validation-required', async () => {
    api.upload.mockResolvedValue(exeJob())
    const user = userEvent.setup()
    renderPage()
    await screen.findByText(/Windows worker/)
    await user.upload(screen.getByLabelText('Choose installer file'), new File(['MZ'], 'setup.exe'))
    expect(await screen.findByText('Likely — test required')).toBeInTheDocument()
    expect(screen.getByText('Windows validation required')).toBeInTheDocument()
    expect(screen.getByText(/Signature present — not verified/)).toBeInTheDocument()
    expect(screen.getByText(/Uninstall: none suggested/)).toBeInTheDocument()
    expect(screen.getAllByText('a'.repeat(64)).length).toBeGreaterThan(0)
  })

  it('lets the engineer pick an installer from a ZIP', async () => {
    const zipJob = exeJob({ source: { fileName: 'bundle.zip', storedName: 'bundle.zip', type: 'zip', sizeBytes: 100, sha256: 'b'.repeat(64) }, config: undefined,
      analysis: { ...exeJob().analysis!, installerKind: null, archiveEntries: [{ name: 'a/setup.msi', size: 10, kind: 'msi' }, { name: 'readme.txt', size: 1, kind: null }] } })
    api.jobs.mockResolvedValue([zipJob])
    api.selectInstaller.mockResolvedValue(exeJob())
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByText('bundle.zip'))
    expect(screen.getByText(/1 found/)).toBeInTheDocument()
    const extract = screen.getByRole('button', { name: /Extract safely/ })
    expect(extract).toBeDisabled()
    await user.click(screen.getByLabelText(/a\/setup\.msi/))
    await user.click(extract)
    expect(api.selectInstaller).toHaveBeenCalledWith('job-1', 'a/setup.msi')
  })

  it('requires acknowledging unverified commands and surfaces server problems on save', async () => {
    api.jobs.mockResolvedValue([exeJob()])
    api.saveConfig.mockResolvedValue({ data: exeJob(), problems: ['Commands are not verified — acknowledge that they must be tested on Windows before packaging.'] })
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByText('Widget'))
    await user.click(screen.getByRole('button', { name: /3\. Review Configuration/ }))
    expect(screen.getByRole('checkbox', { name: /have not been tested/ })).not.toBeChecked()
    await user.click(screen.getByRole('button', { name: 'Save configuration' }))
    expect(await screen.findByText(/Commands are not verified/)).toBeInTheDocument()
  })

  it('shows "Not Tested" with a retry action when no worker is available', async () => {
    api.jobs.mockResolvedValue([exeJob({ state: 'api-unavailable', stateReason: 'No Windows worker is configured.', validation: { outcome: 'not-tested', at: '', steps: [], message: 'Package Created / Windows Installation Not Tested. No Windows worker is configured.' } })])
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByText('Widget'))
    await user.click(screen.getByRole('button', { name: /4\. Validate on Windows/ }))
    expect(screen.getAllByText(/Windows Installation Not Tested/).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Retry Windows validation' })).toBeEnabled()
    expect(screen.queryByText(/^Validated\./)).not.toBeInTheDocument()
  })

  it('will not approve an untested package without an explicit acknowledgement', async () => {
    api.jobs.mockResolvedValue([exeJob()])
    api.approve.mockResolvedValue(exeJob())
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByText('Widget'))
    await user.click(screen.getByRole('button', { name: /5\. Create Package/ }))
    const approve = screen.getByRole('button', { name: 'Approve for packaging' })
    expect(approve).toBeDisabled()
    await user.click(screen.getByRole('checkbox', { name: /not passed Windows validation/ }))
    await user.click(approve)
    expect(api.approve).toHaveBeenCalledWith('job-1', true)
  })

  it('guide: copy buttons, EC fallback message, publishing needs explicit confirmation, Intune publish stays disabled', async () => {
    const guide: PublishingGuide = {
      ready: true, banner: 'Package Created / Windows Installation Not Tested. Pilot on a test device before any wider assignment.',
      intune: [{ title: 'Program', items: [{ label: 'Install command', value: '"setup.exe" /S', copy: true }] }],
      endpointCentral: [{ title: 'Commands', items: [{ label: 'Installation command', value: '"setup.exe" /S', copy: true }] }],
      endpointCentralApi: { configured: false, message: 'Endpoint Central publishing API not configured — use guided manual publishing.' },
    }
    const job = exeJob({ output: { fileName: 'Widget-1.0-x64.intunewin', sizeBytes: 1024, sha256: 'c'.repeat(64), createdAt: '' } })
    api.jobs.mockResolvedValue([job]); api.guide.mockResolvedValue(guide); api.confirmPublishing.mockResolvedValue(job)
    api.artifacts.mockResolvedValue({ files: [{ name: 'package', kind: 'intunewin', available: true }], output: job.output!, sourceSha256: '' })
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByText('Widget'))
    expect(await screen.findByText(/Windows Installation Not Tested/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /copy install command/i })).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Endpoint Central' }))
    expect(screen.getByText(/Endpoint Central publishing API not configured — use guided manual publishing/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Publish to Intune (disabled)' })).toBeDisabled()
    const record = screen.getByRole('button', { name: 'Record publishing approval' })
    expect(record).toBeDisabled()
    await user.click(screen.getByRole('checkbox', { name: /publish this package manually/ }))
    await waitFor(() => expect(record).toBeEnabled())
    await user.click(record)
    expect(api.confirmPublishing).toHaveBeenCalledWith('job-1')
  })

  it('never exposes provider credentials to the browser', () => {
    for (const src of [pageSource, apiSource]) {
      expect(src).not.toMatch(/WIN_PACKAGER_WORKER|client_secret|process\.env|Authorization/i)
    }
  })
})
