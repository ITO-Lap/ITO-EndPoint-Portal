import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Dashboard, RaStatus, ScriptSummary } from '../../api/remoteActions'

vi.mock('../../api/remoteActions', async orig => {
  const real = await orig<typeof import('../../api/remoteActions')>()
  return { ...real, remoteActionsApi: { status: vi.fn(), dashboard: vi.fn(), scripts: vi.fn(), analyze: vi.fn(), jobs: vi.fn(), job: vi.fn(), refreshJob: vi.fn(), graph: { templates: vi.fn(), validate: vi.fn(), history: vi.fn() } } }
})
import { remoteActionsApi } from '../../api/remoteActions'
import { RemoteActionCenterPage } from '../RemoteActionCenterPage'
import { PermissionsProvider } from '../../context/PermissionsContext'
import pageSource from '../RemoteActionCenterPage.tsx?raw'
import wizardSource from '../../components/remoteActions/ScriptWizard.tsx?raw'
import jobsSource from '../../components/remoteActions/JobsTab.tsx?raw'

const api = vi.mocked(remoteActionsApi, true)
const perms = (over: Partial<RaStatus['permissions']> = {}): RaStatus['permissions'] => ({ read: true, author: true, execute: true, approve: false, admin: false, graphRead: true, graphRun: true, graphChange: false, graphApprove: false, ...over })
const caps = (id: 'intune' | 'endpoint_central' | 'mock', enabled: boolean, reasons: string[] = []): RaStatus['providers'][number] => ({
  id, label: { intune: 'Microsoft Intune', endpoint_central: 'Endpoint Central', mock: 'Mock (simulation only)' }[id], enabled, reasons, notes: enabled ? ['No progress percentage.'] : [],
  supports: { powershell: enabled, shell: enabled, runAsSystem: enabled, runAsUser: enabled, perDeviceStatus: enabled, scriptOutput: enabled, liveStreaming: false, cancel: enabled, runWhenOnline: enabled, scheduling: enabled },
})
const status = (p: Partial<RaStatus['permissions']> = {}, over: Partial<RaStatus> = {}): RaStatus => ({
  providers: [caps('intune', false, ['The Intune app registration is missing Graph application permissions: DeviceManagementScripts.ReadWrite.All.']), caps('endpoint_central', false, ['No verified script-execution API']), caps('mock', true)],
  policy: { maxDevicesPerJob: 500, mediumRiskApprovalAbove: 10, maxConcurrentJobs: 5, maxJobsPerUserPerHour: 20, maxCheckInAgeHours: 72, pilotMaxDevices: 5, executionPaused: false },
  encryptionAtRest: false, me: 'me@zinnia.com', permissions: perms(p), ...over,
})
const dash = (over: Partial<Dashboard> = {}): Dashboard => ({ scripts: { total: 0, pendingApproval: 0 }, pendingApprovals: { scripts: [], jobs: [] }, activeJobs: [], recentFailures: [], waitingForOnline: 0, successRate30d: null, attemptedDevices30d: 0, ...over })
const script = (over: Partial<ScriptSummary> = {}): ScriptSummary => ({ id: 's1', name: 'Reboot', description: '', language: 'powershell', platform: 'Windows', owner: 'o', tags: [], timeoutSec: 300, runAs: 'system', version: 1, archived: false, usageCount: 0, lastResult: null, risk: 'medium', approvalStatus: 'pending_approval', approvedBy: null, requiresAdmin: false, hasRollback: false, createdBy: 'x', createdAt: '', updatedAt: '', ...over })

const renderPage = (permissions: Record<string, boolean> = { 'pages.Remote Action Center': true }) =>
  render(<PermissionsProvider permissions={permissions}><RemoteActionCenterPage onBack={() => undefined} viewerRole="IT Admin" /></PermissionsProvider>)

beforeEach(() => { vi.clearAllMocks(); api.status.mockResolvedValue(status()); api.dashboard.mockResolvedValue(dash()); api.scripts.mockResolvedValue([]); api.jobs.mockResolvedValue([]); api.graph.templates.mockResolvedValue({ builtin: [], saved: [] }); api.graph.history.mockResolvedValue([]) })

describe('Remote Action Center page', () => {
  it('shows a permission-denied state without calling the API', () => {
    renderPage({})
    expect(screen.getByRole('alert')).toHaveTextContent(/do not have permission/)
    expect(api.status).not.toHaveBeenCalled()
  })

  it('shows the title/subtitle, loading, then honest provider availability and the empty states', async () => {
    renderPage()
    expect(screen.getByRole('heading', { name: /Remote Action Center/ })).toBeInTheDocument()
    expect(screen.getByText('Secure script execution and endpoint automation')).toBeInTheDocument()
    expect(await screen.findByText(/missing Graph application permissions/)).toBeInTheDocument()
    expect(screen.getByText(/No verified script-execution API/)).toBeInTheDocument()
    expect(screen.getAllByText('Unavailable')).toHaveLength(2)
    expect(screen.getByText('No active jobs.')).toBeInTheDocument()
    expect(screen.getByText('No recent failures.')).toBeInTheDocument()
    expect(screen.getByText(/stored unencrypted/)).toBeInTheDocument()
  })

  it('hides Run/Upload for roles without the permissions and the Settings tab for non-admins', async () => {
    api.status.mockResolvedValue(status({ execute: false, author: false }))
    renderPage()
    await screen.findByText('Execution providers')
    expect(screen.queryByRole('button', { name: /Run Script/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Upload Script/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Settings' })).not.toBeInTheDocument()
  })

  it('surfaces an API error instead of an empty page', async () => {
    api.status.mockRejectedValue(new Error('Request failed (500)'))
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent('Request failed (500)')
  })

  it('shows the emergency-stop banner and pending approvals with a count', async () => {
    api.status.mockResolvedValue(status({ approve: true }, { policy: { ...status().policy, executionPaused: true } }))
    api.dashboard.mockResolvedValue(dash({ pendingApprovals: { scripts: [script()], jobs: [] } }))
    const user = userEvent.setup()
    renderPage()
    expect(await screen.findByText(/Emergency stop is active/)).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: /Pending Approvals \(1\)/ }))
    expect(screen.getByText(/Reboot/)).toBeInTheDocument()
  })

  it('walks the wizard: validation result is shown, a blocked script can be saved but not run', async () => {
    api.analyze.mockResolvedValue({ analysis: { language: 'shell', platform: 'macOS', name: 'wipe', description: '', requiresAdmin: false, adminEvidence: [], risk: 'blocked', errors: [], requiresJustification: false, requiresApproval: false, rollbackRecommended: false, lineCount: 1,
      findings: [{ ruleId: 'sh.rm-root', severity: 'blocked', category: 'Destructive', message: 'Recursive delete of the filesystem root', line: 1, match: 'rm -rf /' }] } })
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Execution providers')
    await user.click(screen.getByRole('button', { name: /Run Script/ }))
    await user.type(screen.getByLabelText('Script'), 'rm -rf /')
    await user.click(screen.getByRole('button', { name: 'Validate and review' }))
    expect(await screen.findByText(/Recursive delete of the filesystem root/)).toBeInTheDocument()
    expect(screen.getByText(/You can save it to the library, but it cannot be run/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save script and continue' })).toBeEnabled()
  })
})

describe('safe rendering and truthful progress (source guards)', () => {
  const sources = { page: pageSource, wizard: wizardSource, jobs: jobsSource }
  it('never renders device or Graph output as HTML and never stores execution data in the browser', () => {
    for (const [name, src] of Object.entries(sources)) {
      expect(src, name).not.toMatch(/dangerouslySetInnerHTML|innerHTML\s*=/)
      expect(src, name).not.toMatch(/localStorage|sessionStorage|indexedDB/)
    }
  })
  it('only draws a progress bar from script-reported progress for every device', () => {
    expect(jobsSource).toMatch(/genuineBar/); expect(jobsSource).toMatch(/withProgress\.length === job\.devices\.length/)
    expect(jobsSource).toMatch(/No percentage is shown/)
  })
})
