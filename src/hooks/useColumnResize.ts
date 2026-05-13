import { useState, useRef, useEffect } from 'react'

export interface ColDef<K extends string = string> {
  key: K
  label: string
  min?: number      // minimum drag width (default 48px)
  default: number   // initial width in px
  noResize?: boolean
}

export function useColumnResize<K extends string>(
  cols: readonly ColDef<K>[],
  storageKey?: string,
) {
  const getDefaults = (): Record<K, number> =>
    Object.fromEntries(cols.map(c => [c.key, c.default])) as Record<K, number>

  const [widths, setWidths] = useState<Record<K, number>>(() => {
    if (!storageKey) return getDefaults()
    try {
      const raw = localStorage.getItem(`col-widths:${storageKey}`)
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, number>
        if (cols.every(c => typeof parsed[c.key] === 'number')) {
          return parsed as Record<K, number>
        }
      }
    } catch {}
    return getDefaults()
  })

  const drag = useRef<{ col: K; x0: number; w0: number } | null>(null)
  // Use a ref so the effect closure doesn't go stale when cols/storageKey change
  const colsRef = useRef(cols)
  const keyRef  = useRef(storageKey)
  colsRef.current = cols
  keyRef.current  = storageKey

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!drag.current) return
      const { col, x0, w0 } = drag.current
      const min = colsRef.current.find(c => c.key === col)?.min ?? 48
      setWidths(prev => {
        const next = { ...prev, [col]: Math.max(min, w0 + e.clientX - x0) } as Record<K, number>
        if (keyRef.current) {
          try { localStorage.setItem(`col-widths:${keyRef.current}`, JSON.stringify(next)) } catch {}
        }
        return next
      })
    }
    const onUp = () => { drag.current = null }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
  }, []) // intentionally empty — stable via refs

  const startResize = (col: K, e: React.MouseEvent) => {
    drag.current = { col, x0: e.clientX, w0: widths[col] }
    e.preventDefault()
    e.stopPropagation() // prevent sort click from firing
  }

  const totalWidth = cols.reduce((s, c) => s + widths[c.key], 0)

  return { widths, startResize, totalWidth }
}
