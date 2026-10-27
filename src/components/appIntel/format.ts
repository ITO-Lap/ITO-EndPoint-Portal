export function formatTime(iso: string | null | undefined): string {
  return iso ? new Date(iso).toLocaleString() : '—'
}

export function timeAgo(iso: string | null | undefined, nowMs = Date.now()): string {
  if (!iso) return 'never'
  const mins = Math.max(0, Math.round((nowMs - Date.parse(iso)) / 60_000))
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const h = Math.round(mins / 60)
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} d ago`
}
