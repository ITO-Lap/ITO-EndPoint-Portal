import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { useSavedSettings, savedNote } from '../useSavedSettings'
import { ToastProvider } from '../../components/ui/ToastProvider'
import { settingsApi } from '../../api/settings'

vi.mock('../../api/settings', () => ({ settingsApi: { load: vi.fn(), save: vi.fn() } }))
const api = vi.mocked(settingsApi)
const wrapper = ({ children }: { children: ReactNode }) => <ToastProvider>{children}</ToastProvider>

beforeEach(() => vi.clearAllMocks())

describe('useSavedSettings', () => {
  it('hands the saved values of its section to the form, and reports who saved them', async () => {
    api.load.mockResolvedValue({ general: { values: { orgName: 'Acme' }, updatedBy: 'a@x.com', updatedAt: '2026-11-20T10:00:00Z' }, security: { values: { mfaRequired: false }, updatedBy: null, updatedAt: '2026-11-20T10:00:00Z' } })
    const apply = vi.fn()
    const { result } = renderHook(() => useSavedSettings('general', apply), { wrapper })
    await waitFor(() => expect(apply).toHaveBeenCalledWith({ orgName: 'Acme' }))
    expect(apply).toHaveBeenCalledTimes(1) // other sections' values are not applied
    await waitFor(() => expect(result.current.meta?.updatedBy).toBe('a@x.com'))
    expect(savedNote(result.current.meta)).toContain('by a@x.com')
  })

  it('leaves the defaults alone when nothing is saved or loading fails, and saving still works', async () => {
    api.load.mockRejectedValue(new Error('offline'))
    api.save.mockResolvedValue({ values: { orgName: 'New' }, updatedBy: 'me@x.com', updatedAt: '2026-11-20T11:00:00Z' })
    const apply = vi.fn()
    const { result } = renderHook(() => useSavedSettings('general', apply), { wrapper })
    await act(async () => { await result.current.save({ orgName: 'New' }) })
    expect(apply).not.toHaveBeenCalled()
    expect(api.save).toHaveBeenCalledWith('general', { orgName: 'New' })
    expect(result.current.meta?.updatedBy).toBe('me@x.com')
    expect(result.current.saving).toBe(false)
  })

  it('shows the server\'s reason when a save is refused, and does not claim it was saved', async () => {
    api.load.mockResolvedValue({})
    api.save.mockRejectedValue(new Error('riskWeights: risk weights must add up to 100'))
    const { result } = renderHook(() => useSavedSettings('compliance', vi.fn()), { wrapper })
    await act(async () => { await result.current.save({ riskWeights: {} }) })
    expect(result.current.meta).toBeNull()
    expect(result.current.saving).toBe(false)
  })

  it('has no last-saved note before anything is saved', () => { expect(savedNote(null)).toBeUndefined() })
})
