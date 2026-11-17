import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { MacPackagerInfo } from '../../api/macPackager'

vi.mock('../../api/macPackager', () => ({ macPackagerApi: { info: vi.fn(), download: vi.fn() } }))
import { macPackagerApi } from '../../api/macPackager'
import { MacPackageBuilderPage } from '../MacPackageBuilderPage'
import { PermissionsProvider } from '../../context/PermissionsContext'
import pageSource from '../MacPackageBuilderPage.tsx?raw'

const api = vi.mocked(macPackagerApi)
const info = (over: Partial<MacPackagerInfo> = {}): MacPackagerInfo => ({
  source: { bundled: true, originalCommit: 'f919703', syncedAt: '2026-11-17T13:15:54Z' },
  downloads: { configured: false, builds: [] },
  features: [{ title: 'macOS packages', detail: 'Homebrew to signed pkg' }, { title: 'Local Installer → .intunewin', detail: 'Browse an MSI or EXE' }],
  requirements: ['macOS 14 (Sonoma) or newer'],
  buildSteps: [{ label: 'Run the tests', command: 'cd apps/mac-package-builder && swift test' }],
  runsOn: 'macOS only — this is a native app and does not run in the browser or on this server.',
  ...over,
})
const renderPage = (perms: Record<string, boolean> = { 'macPackager.read': true }) =>
  render(<PermissionsProvider permissions={perms}><MacPackageBuilderPage onBack={() => undefined} viewerRole="IT Admin" /></PermissionsProvider>)

beforeEach(() => { vi.clearAllMocks(); api.info.mockResolvedValue(info()) })

describe('Mac Package Builder page', () => {
  it('explains what it is, that it only runs on macOS, and what it does', async () => {
    renderPage()
    expect(await screen.findByText(/macOS only — this is a native app/)).toBeInTheDocument()
    expect(screen.getByText('macOS packages')).toBeInTheDocument()
    expect(screen.getByText('Local Installer → .intunewin')).toBeInTheDocument()
    expect(screen.getByText(/mirrored from original commit/)).toBeInTheDocument()
    expect(screen.getByText('macOS 14 (Sonoma) or newer')).toBeInTheDocument()
  })

  it('says plainly when no build is published, and how to publish one', async () => {
    renderPage()
    expect(await screen.findByText(/No build is published on this server/)).toBeInTheDocument()
    expect(screen.getByText(/MAC_PACKAGE_BUILDER_DIST_DIR/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Download / })).not.toBeInTheDocument()
  })

  it('lists published builds with their SHA-256 and downloads one on click', async () => {
    api.info.mockResolvedValue(info({ downloads: { configured: true, builds: [{ name: 'App Package Builder-1.0.0.dmg', sizeBytes: 12 * 1024 ** 2, modifiedAt: '2026-11-17T00:00:00Z', sha256: 'a'.repeat(64), kind: 'dmg' }] } }))
    api.download.mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderPage()
    expect(await screen.findByText('App Package Builder-1.0.0.dmg')).toBeInTheDocument()
    expect(screen.getByText('a'.repeat(64))).toBeInTheDocument()
    expect(screen.getByText('12.0 MB')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Download App Package Builder-1.0.0.dmg' }))
    expect(api.download).toHaveBeenCalledWith('App Package Builder-1.0.0.dmg')
  })

  it('offers copyable build commands', async () => {
    renderPage()
    expect(await screen.findByText('cd apps/mac-package-builder && swift test')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copy Run the tests' })).toBeInTheDocument()
  })

  it('shows an error when the API fails, and denies the page without the permission', async () => {
    api.info.mockRejectedValue(new Error('boom'))
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent('boom')
    renderPage({})
    expect(await screen.findByText(/do not have permission to view Mac Package Builder/)).toBeInTheDocument()
  })

  it('never contains credentials', () => { expect(pageSource).not.toMatch(/process\.env|Authorization|client_secret|token/i) })
})
