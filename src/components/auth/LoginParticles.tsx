import { useEffect, useRef } from 'react'

interface Dot { x: number; y: number; vx: number; vy: number; r: number; hue: 'o' | 'b' }

/** Drifting dots that join up when near each other and gently pull toward the pointer. Decorative only. */
export function LoginParticles() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext?.('2d')
    if (!canvas || !ctx) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return

    let w = 0, h = 0, raf = 0
    const pointer = { x: -9999, y: -9999 }
    let dots: Dot[] = []

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      w = canvas.clientWidth; h = canvas.clientHeight
      canvas.width = w * dpr; canvas.height = h * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const count = Math.max(24, Math.min(70, Math.round((w * h) / 22000)))
      dots = Array.from({ length: count }, (_, i) => ({
        x: Math.random() * w, y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.35, vy: (Math.random() - 0.5) * 0.35,
        r: 1.2 + Math.random() * 1.8, hue: i % 3 === 0 ? 'b' : 'o',
      }))
    }

    const LINK = 120, PULL = 160
    const frame = () => {
      ctx.clearRect(0, 0, w, h)
      for (const d of dots) {
        const dx = pointer.x - d.x, dy = pointer.y - d.y, dist = Math.hypot(dx, dy)
        if (dist < PULL && dist > 1) { d.vx += (dx / dist) * 0.012; d.vy += (dy / dist) * 0.012 }
        d.vx *= 0.995; d.vy *= 0.995
        d.x += d.vx; d.y += d.vy
        if (d.x < -10) d.x = w + 10; else if (d.x > w + 10) d.x = -10
        if (d.y < -10) d.y = h + 10; else if (d.y > h + 10) d.y = -10
      }
      for (let i = 0; i < dots.length; i++) {
        const a = dots[i]!
        for (let j = i + 1; j < dots.length; j++) {
          const b = dots[j]!
          const dist = Math.hypot(a.x - b.x, a.y - b.y)
          if (dist < LINK) {
            ctx.strokeStyle = `rgba(79,70,229,${(1 - dist / LINK) * 0.28})`
            ctx.lineWidth = 0.8
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke()
          }
        }
        ctx.fillStyle = a.hue === 'o' ? 'rgba(79,70,229,.75)' : 'rgba(14,165,233,.7)'
        ctx.beginPath(); ctx.arc(a.x, a.y, a.r, 0, Math.PI * 2); ctx.fill()
      }
      raf = requestAnimationFrame(frame)
    }

    const move = (e: PointerEvent) => { pointer.x = e.clientX; pointer.y = e.clientY }
    const leave = () => { pointer.x = -9999; pointer.y = -9999 }
    const pause = () => { cancelAnimationFrame(raf); if (!document.hidden) raf = requestAnimationFrame(frame) }

    resize()
    window.addEventListener('resize', resize)
    window.addEventListener('pointermove', move, { passive: true })
    window.addEventListener('pointerleave', leave)
    document.addEventListener('visibilitychange', pause)
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerleave', leave)
      document.removeEventListener('visibilitychange', pause)
    }
  }, [])

  return <canvas ref={ref} className="lg-particles" aria-hidden="true" />
}
