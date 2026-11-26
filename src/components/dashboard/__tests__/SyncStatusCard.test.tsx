import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SyncStatusCard } from '../SyncStatusCard'
import { ToastProvider } from '../../ui/ToastProvider'
import { syncApi, freshnessOf, formatAgo, type SyncSource, type SyncStatus } from '../../../api/sync'

vi.mock('../../../api/sync', async orig => ({ ...(await orig<typeof import('../../../api/sync')>()), syncApi: { status: vi.fn(), kick: vi.fn(), run: vi.fn(), setSchedule: vi.fn() } }))
const api = vi.mocked(syncApi)

const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString()
const src = (o: Partial<SyncSource> = {}): SyncSource => ({ source: 'intune', module: 'devices', displayName: 'Microsoft Intune', enabled: true, intervalMinutes: 45, configured: true, lastAttemptAt: ago(5), lastSuccessAt: ago(5), status: 'succeeded', lastError: null, recordCount: 5123, running: false, stale: false, ...o })
const show = (status: SyncStatus, canManage = false) => { api.status.mockResolvedValue(status); return render(<ToastProvider><SyncStatusCard canManage={canManage} /></ToastProvider>) }

beforeEach(() => { vi.clearAllMocks(); api.kick.mockResolvedValue({ started: 0 }) })

describe('SyncStatusCard', () => {
  it('shows last successful sync, record count and freshness per source, from stored data', async () => {
    show({ storage: 'file', postgresConfigured: false, restartRequired: false, sources: [src(), src({ source: 'manageengine', displayName: 'ManageEngine Endpoint Central', recordCount: 880, lastSuccessAt: ago(300), intervalMinutes: 45 })] })
    expect(await screen.findByText('Microsoft Intune')).toBeInTheDocument()
    expect(screen.getByText('5,123')).toBeInTheDocument()
    expect(screen.getByText('Fresh')).toBeInTheDocument()
    expect(screen.getByText('Stale')).toBeInTheDocument()
    expect(screen.getByText('5 min ago')).toBeInTheDocument()
  })

  it('warns that live sync failed and names the time of the data being shown', async () => {
    const when = ago(120)
    show({ storage: 'file', postgresConfigured: false, restartRequired: false, sources: [src({ status: 'failed', stale: true, lastSuccessAt: when, lastError: 'Graph 503' })] })
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Live sync failed. Displaying data from')
    expect(alert).toHaveTextContent(new Date(when).toLocaleString())
    expect(alert).not.toHaveTextContent('Graph 503') // error detail is for administrators only
  })

  it('shows error detail and Sync now only to someone who can manage syncs', async () => {
    api.run.mockResolvedValue({ started: true })
    show({ storage: 'file', postgresConfigured: false, restartRequired: false, sources: [src({ status: 'failed', stale: true, lastError: 'Graph 503' })] }, true)
    expect(await screen.findByRole('alert')).toHaveTextContent('Graph 503')
    await userEvent.click(screen.getByRole('button', { name: 'Sync Microsoft Intune now' }))
    expect(api.run).toHaveBeenCalledWith('intune', 'devices')
  })

  it('has no Sync now button for other users, and disables it while a sync runs', async () => {
    const { unmount } = show({ storage: 'file', postgresConfigured: false, restartRequired: false, sources: [src()] })
    await screen.findByText('Microsoft Intune')
    expect(screen.queryByRole('button', { name: /Sync .* now/ })).toBeNull()
    unmount()
    show({ storage: 'file', postgresConfigured: false, restartRequired: false, sources: [src({ running: true })] }, true)
    expect(await screen.findByText('Background sync running…')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sync Microsoft Intune now' })).toBeDisabled()
  })

  it('starts due syncs in the background once, after the data is shown', async () => {
    show({ storage: 'file', postgresConfigured: false, restartRequired: false, sources: [src()] })
    await screen.findByText('Microsoft Intune')
    await waitFor(() => expect(api.kick).toHaveBeenCalledTimes(1))
  })

  it('says when no sync has happened yet, instead of inventing numbers', async () => {
    show({ storage: 'file', postgresConfigured: false, restartRequired: false, sources: [src({ status: 'never', lastSuccessAt: null, lastAttemptAt: null, recordCount: null })] })
    expect(await screen.findByText('Waiting for first sync')).toBeInTheDocument()
    expect(screen.getByText('not available yet')).toBeInTheDocument()
    expect(screen.getByText('No sync yet')).toBeInTheDocument()
  })

  it('works fully without PostgreSQL: shows sync status from local files and says PostgreSQL can be added later', async () => {
    show({ storage: 'file', postgresConfigured: false, restartRequired: false, sources: [src()] })
    expect(await screen.findByText('Microsoft Intune')).toBeInTheDocument()
    expect(screen.getByText(/Stored in local files/)).toHaveTextContent('PostgreSQL can be connected later in Settings → Integrations')
    await waitFor(() => expect(api.kick).toHaveBeenCalledTimes(1)) // background sync still starts
  })

  it('says which storage is in use, and when a saved PostgreSQL change waits for a restart', async () => {
    show({ storage: 'file', postgresConfigured: true, restartRequired: true, sources: [src()] })
    expect(await screen.findByText(/applies after the server restarts/)).toBeInTheDocument()
  })

  describe('application inventory and patch data rows', () => {
    const apps = () => src({ source: 'manageengine', module: 'applications', displayName: 'Application inventory (Endpoint Central)', intervalMinutes: 480, recordCount: 412, lastSuccessAt: ago(100) })
    const patches = (o: Partial<SyncSource> = {}) => src({ source: 'manageengine', module: 'patches', displayName: 'Patch data (Endpoint Central)', intervalMinutes: 1440, recordCount: 300, lastSuccessAt: ago(600), ...o })

    it('shows each module with its own unit and freshness against its own schedule', async () => {
      show({ storage: 'file', postgresConfigured: false, restartRequired: false, sources: [src(), apps(), patches()] })
      expect(await screen.findByText('Application inventory (Endpoint Central)')).toBeInTheDocument()
      expect(screen.getByText('412')).toBeInTheDocument()
      expect(screen.getByText('Apps')).toBeInTheDocument()
      expect(screen.getByText('Systems')).toBeInTheDocument()
      expect(screen.getByText('300')).toBeInTheDocument()
      expect(screen.getByText('5,123')).toBeInTheDocument()
      expect(screen.getAllByText('Fresh')).toHaveLength(3) // 100 min is fresh against 8 h, 10 h against a day; the same age would be stale for devices
    })

    it('starts the right module from its own Sync now button', async () => {
      api.run.mockResolvedValue({ started: true })
      show({ storage: 'file', postgresConfigured: false, restartRequired: false, sources: [src(), apps(), patches()] }, true)
      await userEvent.click(await screen.findByRole('button', { name: 'Sync Patch data (Endpoint Central) now' }))
      expect(api.run).toHaveBeenCalledWith('manageengine', 'patches')
      await userEvent.click(screen.getByRole('button', { name: 'Sync Application inventory (Endpoint Central) now' }))
      expect(api.run).toHaveBeenCalledWith('manageengine', 'applications')
    })

    it('explains a partial patch refresh to everyone (not available through the current API connection), without calling it a failure', async () => {
      const note = 'Missing-patch detail is not available through the current API connection (the token lacks the Patch Management scope).'
      show({ storage: 'file', postgresConfigured: false, restartRequired: false, sources: [patches({ status: 'partial', stale: true, lastError: note })] }, false)
      const alert = await screen.findByRole('alert')
      expect(alert).toHaveTextContent('The last sync was incomplete')
      expect(alert).toHaveTextContent('not available through the current API connection')
      expect(alert).not.toHaveTextContent('Live sync failed')
    })

    it('keeps technical failure detail for administrators only', async () => {
      const failed = patches({ status: 'failed', stale: true, lastError: 'Patch API 503' })
      const { unmount } = show({ storage: 'file', postgresConfigured: false, restartRequired: false, sources: [failed] }, false)
      expect(await screen.findByRole('alert')).not.toHaveTextContent('Patch API 503')
      unmount()
      show({ storage: 'file', postgresConfigured: false, restartRequired: false, sources: [failed] }, true)
      expect(await screen.findByRole('alert')).toHaveTextContent('Patch API 503')
    })
  })

  it('hides sources that are not connected', async () => {
    show({ storage: 'file', postgresConfigured: false, restartRequired: false, sources: [src(), src({ source: 'manageengine', displayName: 'ManageEngine Endpoint Central', configured: false, status: 'never', lastSuccessAt: null })] })
    await screen.findByText('Microsoft Intune')
    expect(screen.queryByText('ManageEngine Endpoint Central')).toBeNull()
  })
})

describe('freshnessOf / formatAgo', () => {
  it('grades freshness against the configured interval', () => {
    expect(freshnessOf({ lastSuccessAt: ago(40), intervalMinutes: 45 })).toBe('fresh')
    expect(freshnessOf({ lastSuccessAt: ago(80), intervalMinutes: 45 })).toBe('aging')
    expect(freshnessOf({ lastSuccessAt: ago(200), intervalMinutes: 45 })).toBe('stale')
    expect(freshnessOf({ lastSuccessAt: null, intervalMinutes: 45 })).toBe('none')
  })
  it('formats ages', () => {
    expect(formatAgo(ago(0))).toBe('just now')
    expect(formatAgo(ago(90))).toBe('2 h ago')
    expect(formatAgo(null)).toBe('never')
  })
})
