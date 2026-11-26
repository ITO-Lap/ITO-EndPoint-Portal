import { useEffect, useRef } from 'react'
import { DEFAULT_IDLE_TIMEOUT_MIN, reportActivity, sessionExpiryMs } from '../api/session'

const ACTIVITY_KEY = 'ito.lastActivity'
const HEARTBEAT_MS = 60_000
const EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'] as const

const readShared = (): number => { try { return Number(localStorage.getItem(ACTIVITY_KEY)) || 0 } catch { return 0 } }
const writeShared = (t: number): void => { try { localStorage.setItem(ACTIVITY_KEY, String(t)) } catch { /* private mode */ } }

export type SignOutReason = 'idle' | 'expired'

/**
 * Signs the person out after `idleMinutes` without real use (clicks, keys, scrolling; polling does not count),
 * and when the session reaches its fixed lifetime. Activity in another tab counts, since the session is shared.
 */
export function useAutoSignOut(active: boolean, idleMinutes: number | undefined, onSignOut: (reason: SignOutReason) => void): void {
  const cb = useRef(onSignOut)
  useEffect(() => { cb.current = onSignOut }, [onSignOut])
  const configured = (idleMinutes && idleMinutes > 0 ? idleMinutes : DEFAULT_IDLE_TIMEOUT_MIN) * 60_000
  // The server answers each activity report with the current setting, so an admin's change applies without a reload.
  const idleMsRef = useRef(configured)
  useEffect(() => { idleMsRef.current = configured }, [configured])

  useEffect(() => {
    if (!active) return
    let last = Date.now()
    let lastSent = last
    writeShared(last)

    const onActivity = () => {
      const now = Date.now()
      last = now
      if (now - readShared() > 5_000) writeShared(now)
      if (now - lastSent >= HEARTBEAT_MS) { lastSent = now; void reportActivity().then(m => { if (m) idleMsRef.current = m * 60_000 }) }
    }
    EVENTS.forEach(e => window.addEventListener(e, onActivity, { passive: true }))

    const tick = window.setInterval(() => {
      const now = Date.now()
      const expiry = sessionExpiryMs()
      if (expiry !== null && now >= expiry) { cb.current('expired'); return }
      if (now - Math.max(last, readShared()) >= idleMsRef.current) cb.current('idle')
    }, 5_000)

    return () => { EVENTS.forEach(e => window.removeEventListener(e, onActivity)); window.clearInterval(tick) }
  }, [active])
}
