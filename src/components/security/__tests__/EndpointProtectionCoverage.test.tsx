import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { EndpointProtectionCoverageResult, PlatformCoverage } from '../../../api'

vi.mock('../../../api', () => ({ api: { fetchEndpointProtectionCoverage: vi.fn(), refreshEndpointProtectionCoverage: vi.fn(), fetchDevicesMissingAgent: vi.fn() } }))
import { api } from '../../../api'
import { EndpointProtectionCoverage } from '../EndpointProtectionCoverage'

const fetchCoverage = vi.mocked(api.fetchEndpointProtectionCoverage)
const plat = (platform: 'Windows' | 'macOS', totalDevices: number): PlatformCoverage => ({ platform, totalDevices, falconMissing: 3, zscalerMissing: 1, falconCoveragePct: 90, zscalerCoveragePct: 99, health: 'Healthy', inventoryUnavailableDevices: 0 }) as unknown as PlatformCoverage
const result = (over: Partial<EndpointProtectionCoverageResult> = {}): EndpointProtectionCoverageResult => ({ windows: plat('Windows', 4000), macos: plat('macOS', 400), scanTime: '2026-11-19T10:00:00Z', scanDurationMs: 90_000, ...over })

beforeEach(() => { fetchCoverage.mockReset() })

describe('EndpointProtectionCoverage', () => {
  it('shows live scan progress instead of an empty placeholder while the first scan runs', async () => {
    fetchCoverage.mockResolvedValue({ scanning: true, progress: { done: 1200, total: 4800, startedAt: '2026-11-19T10:00:00Z' } })
    render(<EndpointProtectionCoverage />)
    expect(await screen.findByText(/Scanning 1,200 of 4,800 devices \(25%\)/)).toBeInTheDocument()
    expect(screen.getByText(/appear here automatically/)).toBeInTheDocument()
  })
  it('shows the cards once data arrives, and labels a stale result', async () => {
    fetchCoverage.mockResolvedValue(result({ stale: true }))
    render(<EndpointProtectionCoverage />)
    expect(await screen.findByText(/Last scan .* refreshing in the background/)).toBeInTheDocument()
    expect(screen.getByText('Windows')).toBeInTheDocument()
  })
  it('offers a retry when loading fails', async () => {
    fetchCoverage.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(result())
    render(<EndpointProtectionCoverage />)
    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Windows')).toBeInTheDocument()
  })
})
