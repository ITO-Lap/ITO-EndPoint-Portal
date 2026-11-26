import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { SecurityWatchRow } from '../SecurityWatchRow'
import { api } from '../../../api'
import { intelApi } from '../../../api/intelligence'

vi.mock('../../../api', () => ({ api: { fetchSecurityPosture: vi.fn(), fetchEndpointProtectionCoverage: vi.fn() } }))
vi.mock('../../../api/intelligence', () => ({ intelApi: { riskScores: vi.fn() } }))

describe('SecurityWatchRow with nothing connected', () => {
  it('finishes loading instead of throwing when the risk API has no summary, and when coverage is still scanning', async () => {
    vi.mocked(api.fetchSecurityPosture).mockResolvedValue({ pillars: [] } as never)
    vi.mocked(api.fetchEndpointProtectionCoverage).mockResolvedValue({ scanning: true, progress: null })
    vi.mocked(intelApi.riskScores).mockResolvedValue({ success: true, data: [], count: 0 } as never) // no `summary`
    const errors: unknown[] = []
    const onError = (e: PromiseRejectionEvent) => errors.push(e.reason)
    window.addEventListener('unhandledrejection', onError)
    render(<SecurityWatchRow />)
    await waitFor(() => expect(screen.getByText('Encryption gap')).toBeInTheDocument())
    await new Promise(r => setTimeout(r, 50))
    window.removeEventListener('unhandledrejection', onError)
    expect(errors).toHaveLength(0)
  })
})
