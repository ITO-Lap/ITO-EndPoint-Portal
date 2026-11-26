import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAutoSignOut } from '../useAutoSignOut'

const MIN = 60_000
const tokenWithExp = (expSecs: number) => `x.${btoa(JSON.stringify({ exp: expSecs }))}.y`

beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { idleTimeoutMin: 15 } }) }))
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

const farFuture = () => localStorage.setItem('ito.session', JSON.stringify({ token: tokenWithExp(Math.floor(Date.now() / 1000) + 9 * 3600), user: { email: 'a@zinnia.com' } }))

describe('useAutoSignOut', () => {
  it('signs out after the idle time with no activity', () => {
    farFuture()
    const out = vi.fn()
    renderHook(() => useAutoSignOut(true, 15, out))
    act(() => { vi.advanceTimersByTime(14 * MIN) })
    expect(out).not.toHaveBeenCalled()
    act(() => { vi.advanceTimersByTime(2 * MIN) })
    expect(out).toHaveBeenCalledWith('idle')
  })

  it('defaults to 60 minutes when no time is configured', () => {
    farFuture()
    const out = vi.fn()
    renderHook(() => useAutoSignOut(true, undefined, out))
    act(() => { vi.advanceTimersByTime(61 * MIN) })
    expect(out).toHaveBeenCalledWith('idle')
  })

  it('real activity restarts the clock', () => {
    farFuture()
    const out = vi.fn()
    renderHook(() => useAutoSignOut(true, 30, out))
    act(() => { vi.advanceTimersByTime(25 * MIN) })
    act(() => { window.dispatchEvent(new Event('keydown')) })
    act(() => { vi.advanceTimersByTime(25 * MIN) })
    expect(out).not.toHaveBeenCalled()
    act(() => { vi.advanceTimersByTime(6 * MIN) })
    expect(out).toHaveBeenCalledWith('idle')
  })

  it('reports activity to the server at most once a minute', () => {
    farFuture()
    renderHook(() => useAutoSignOut(true, 60, vi.fn()))
    act(() => { vi.advanceTimersByTime(61_000) })
    act(() => { for (let i = 0; i < 20; i++) window.dispatchEvent(new Event('pointerdown')) })
    expect((fetch as ReturnType<typeof vi.fn>).mock.calls.filter(c => String(c[0]).includes('/api/auth/activity'))).toHaveLength(1)
  })

  it('signs out when the session reaches its fixed lifetime even if the person is active', () => {
    localStorage.setItem('ito.session', JSON.stringify({ token: tokenWithExp(Math.floor(Date.now() / 1000) + 120), user: { email: 'a@zinnia.com' } }))
    const out = vi.fn()
    renderHook(() => useAutoSignOut(true, 60, out))
    act(() => { vi.advanceTimersByTime(MIN); window.dispatchEvent(new Event('keydown')) })
    expect(out).not.toHaveBeenCalled()
    act(() => { vi.advanceTimersByTime(MIN + 10_000); })
    expect(out).toHaveBeenCalledWith('expired')
  })

  it('does nothing while signed out', () => {
    const out = vi.fn()
    renderHook(() => useAutoSignOut(false, 15, out))
    act(() => { vi.advanceTimersByTime(60 * MIN) })
    expect(out).not.toHaveBeenCalled()
  })
})
