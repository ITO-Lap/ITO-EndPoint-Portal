import { useState, useMemo } from 'react'
import { Moon, Bell, BellOff, ShieldAlert, Zap } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { useToast } from '../ui/ToastProvider'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function fmt12(h: number) {
  if (h === 0) return '12:00 AM'
  if (h < 12) return `${h}:00 AM`
  if (h === 12) return '12:00 PM'
  return `${h - 12}:00 PM`
}

function fmtShort(h: number) {
  if (h === 0) return '12A'
  if (h === 6) return '6A'
  if (h === 12) return '12P'
  if (h === 18) return '6P'
  return ''
}

// Point on circle at hour h (24-hour), top = 12 AM
function pt(h: number, r: number, cx: number, cy: number) {
  const angle = (h / 24) * 2 * Math.PI - Math.PI / 2
  return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) }
}

// ─── Clock SVG ────────────────────────────────────────────────────────────────

interface ClockProps {
  startHour: number
  endHour: number
  enabled: boolean
}

function QuietClock({ startHour, endHour, enabled }: ClockProps) {
  const CX = 110, CY = 110, R = 78, SW = 14
  const CIRC = 2 * Math.PI * R

  const duration = endHour > startHour
    ? endHour - startHour
    : (24 - startHour) + endHour

  const arcLen = (duration / 24) * CIRC
  const gapLen = CIRC - arcLen
  const rotDeg = -90 + (startHour / 24) * 360

  const startPt = pt(startHour, R, CX, CY)
  const endPt   = pt(endHour,   R, CX, CY)

  const tickHours = [0, 3, 6, 9, 12, 15, 18, 21]
  const labelHours = [0, 6, 12, 18]

  return (
    <svg
      width={220}
      height={220}
      viewBox="0 0 220 220"
      aria-label={`Quiet hours from ${fmt12(startHour)} to ${fmt12(endHour)}`}
    >
      <defs>
        {/* Arc gradient */}
        <linearGradient id="qh-grad" gradientUnits="userSpaceOnUse"
          x1="0" y1="0" x2="220" y2="220">
          <stop offset="0%"   stopColor="#38bdf8" />
          <stop offset="60%"  stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#6366f1" />
        </linearGradient>
        {/* Dot glow */}
        <filter id="qh-glow" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        {/* Center glow */}
        <filter id="qh-cglow" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
      </defs>

      {/* Outer guide ring */}
      <circle cx={CX} cy={CY} r={R + SW / 2 + 8} fill="none"
        stroke="rgba(255,255,255,0.04)" strokeWidth={1} />

      {/* Background track */}
      <circle cx={CX} cy={CY} r={R} fill="none"
        stroke="rgba(255,255,255,0.08)" strokeWidth={SW} strokeLinecap="butt" />

      {/* Quiet-period arc */}
      {duration > 0 && (
        <circle
          cx={CX} cy={CY} r={R} fill="none"
          stroke={enabled ? 'url(#qh-grad)' : 'rgba(255,255,255,0.18)'}
          strokeWidth={SW}
          strokeLinecap="round"
          strokeDasharray={`${arcLen} ${gapLen}`}
          transform={`rotate(${rotDeg}, ${CX}, ${CY})`}
          style={{ transition: 'stroke 0.3s, stroke-dasharray 0.4s' }}
        />
      )}

      {/* Hour tick marks */}
      {tickHours.map((h) => {
        const outerPt = pt(h, R + SW / 2 + 2, CX, CY)
        const innerPt = pt(h, R - SW / 2 - 2, CX, CY)
        return (
          <line key={h}
            x1={outerPt.x} y1={outerPt.y}
            x2={innerPt.x} y2={innerPt.y}
            stroke="rgba(255,255,255,0.22)" strokeWidth={1.5}
            strokeLinecap="round"
          />
        )
      })}

      {/* Hour labels */}
      {labelHours.map((h) => {
        const p = pt(h, R + SW / 2 + 16, CX, CY)
        return (
          <text key={h} x={p.x} y={p.y + 4}
            textAnchor="middle" fontSize="9"
            fill="rgba(255,255,255,0.45)" fontFamily="system-ui, sans-serif" fontWeight="600"
            letterSpacing="0.03em"
          >
            {fmtShort(h)}
          </text>
        )
      })}

      {/* Duration label inside arc midpoint */}
      {duration > 0 && (() => {
        const midHour = ((startHour + duration / 2) % 24)
        const midPt = pt(midHour, R, CX, CY)
        // Only show if midpoint is far enough from center that it won't overlap
        const dx = midPt.x - CX, dy = midPt.y - CY
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < 40) return null
        return (
          <text x={midPt.x} y={midPt.y + 4}
            textAnchor="middle" fontSize="8"
            fill={enabled ? 'rgba(186,230,253,0.85)' : 'rgba(255,255,255,0.3)'}
            fontFamily="system-ui, sans-serif" fontWeight="700"
          >
            {duration}h
          </text>
        )
      })()}

      {/* Start dot */}
      {duration > 0 && (
        <>
          <circle cx={startPt.x} cy={startPt.y} r={9}
            fill={enabled ? 'rgba(56,189,248,0.25)' : 'transparent'}
            filter={enabled ? 'url(#qh-glow)' : undefined}
          />
          <circle cx={startPt.x} cy={startPt.y} r={5}
            fill={enabled ? '#38bdf8' : '#64748b'}
            stroke="rgba(255,255,255,0.9)" strokeWidth={1.5}
          />
        </>
      )}

      {/* End dot */}
      {duration > 0 && (
        <>
          <circle cx={endPt.x} cy={endPt.y} r={9}
            fill={enabled ? 'rgba(99,102,241,0.25)' : 'transparent'}
            filter={enabled ? 'url(#qh-glow)' : undefined}
          />
          <circle cx={endPt.x} cy={endPt.y} r={5}
            fill={enabled ? '#6366f1' : '#64748b'}
            stroke="rgba(255,255,255,0.9)" strokeWidth={1.5}
          />
        </>
      )}

      {/* Center glow bloom */}
      <circle cx={CX} cy={CY} r={28}
        fill={enabled ? 'rgba(56,189,248,0.1)' : 'transparent'}
        filter="url(#qh-cglow)"
      />

      {/* Center plate */}
      <circle cx={CX} cy={CY} r={24}
        fill="#0c2754" stroke="rgba(255,255,255,0.07)" strokeWidth={1}
      />

      {/* Crescent moon */}
      {enabled ? (
        <>
          <circle cx={CX - 2} cy={CY} r={11}
            fill="rgba(186,230,253,0.88)"
          />
          <circle cx={CX + 4} cy={CY - 3} r={7.5}
            fill="#0c2754"
          />
          {/* Moon glow dots */}
          <circle cx={CX - 10} cy={CY + 7} r={1.2} fill="rgba(186,230,253,0.6)" />
          <circle cx={CX - 7}  cy={CY - 9} r={0.9} fill="rgba(186,230,253,0.4)" />
          <circle cx={CX + 1}  cy={CY + 11} r={0.8} fill="rgba(186,230,253,0.4)" />
        </>
      ) : (
        // Disabled state: sun / dash
        <>
          {[0,60,120,180,240,300].map(deg => {
            const rad = deg * Math.PI / 180
            return (
              <line key={deg}
                x1={CX + 9 * Math.cos(rad)} y1={CY + 9 * Math.sin(rad)}
                x2={CX + 14 * Math.cos(rad)} y2={CY + 14 * Math.sin(rad)}
                stroke="rgba(255,255,255,0.2)" strokeWidth={1.5} strokeLinecap="round"
              />
            )
          })}
          <circle cx={CX} cy={CY} r={7} fill="rgba(255,255,255,0.15)" />
        </>
      )}
    </svg>
  )
}

// ─── Time Select ──────────────────────────────────────────────────────────────

function TimeSelect({ value, onChange, disabled }: {
  value: number
  onChange: (h: number) => void
  disabled?: boolean
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      disabled={disabled}
      className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-medium text-slate-900 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-300/40 transition disabled:opacity-40 disabled:cursor-not-allowed appearance-none cursor-pointer"
    >
      {Array.from({ length: 24 }, (_, i) => (
        <option key={i} value={i}>{fmt12(i)}</option>
      ))}
    </select>
  )
}

// ─── Main Component ────────────────────────────────────────────────────────────

export interface QuietHoursConfig {
  enabled: boolean
  startHour: number
  endHour: number
  activeDays: number[]
  criticalOverride: boolean
}

interface QuietHoursModalProps {
  open: boolean
  onClose: () => void
  config: QuietHoursConfig
  onSave: (cfg: QuietHoursConfig) => void
}

export function QuietHoursModal({ open, onClose, config, onSave }: QuietHoursModalProps) {
  const { notify } = useToast()

  // Draft state (only committed on Save)
  const [enabled,         setEnabled]         = useState(config.enabled)
  const [startHour,       setStartHour]       = useState(config.startHour)
  const [endHour,         setEndHour]         = useState(config.endHour)
  const [activeDays,      setActiveDays]      = useState<number[]>(config.activeDays)
  const [criticalOverride,setCriticalOverride] = useState(config.criticalOverride)
  const [saving,          setSaving]          = useState(false)

  // Reset draft when modal reopens
  const resetFromConfig = () => {
    setEnabled(config.enabled)
    setStartHour(config.startHour)
    setEndHour(config.endHour)
    setActiveDays(config.activeDays)
    setCriticalOverride(config.criticalOverride)
  }

  const toggleDay = (idx: number) => {
    setActiveDays(prev =>
      prev.includes(idx) ? prev.filter(d => d !== idx) : [...prev, idx].sort()
    )
  }

  const duration = useMemo(
    () => endHour > startHour ? endHour - startHour : (24 - startHour) + endHour,
    [startHour, endHour]
  )

  const weeklyHours = duration * activeDays.length

  // Next quiet start — simplified: just show "tonight" or "tomorrow" label
  const nextLabel = (() => {
    const now = new Date()
    const nowH = now.getHours()
    if (nowH < startHour) return `today at ${fmt12(startHour)}`
    return `tomorrow at ${fmt12(startHour)}`
  })()

  const handleSave = async () => {
    if (activeDays.length === 0) {
      notify('error', 'No days selected', 'Please select at least one day for quiet hours')
      return
    }
    setSaving(true)
    await new Promise(r => setTimeout(r, 700))
    setSaving(false)
    onSave({ enabled, startHour, endHour, activeDays, criticalOverride })
    onClose()
    notify('success', 'Quiet Hours Saved', `Quiet hours set from ${fmt12(startHour)} to ${fmt12(endHour)}`)
  }

  const handleClose = () => {
    resetFromConfig()
    onClose()
  }

  return (
    <Modal
      open={open}
      title="Quiet Hours"
      description="Configure when non-critical notifications are silenced"
      onClose={handleClose}
      size="lg"
    >
      <div className="space-y-5">

        {/* ── Master enable row ─────────────────────────────────────────── */}
        <div className={`flex items-center justify-between gap-4 rounded-xl border px-4 py-3 transition-colors ${
          enabled
            ? 'border-sky-200 bg-sky-50'
            : 'border-slate-200 bg-slate-50'
        }`}>
          <div className="flex items-center gap-3 min-w-0">
            <div className={`grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl transition-colors ${
              enabled ? 'bg-sky-600' : 'bg-slate-200'
            }`}>
              {enabled
                ? <Moon className="h-4.5 w-4.5 text-white" />
                : <BellOff className="h-4.5 w-4.5 text-slate-500" />
              }
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-900">Quiet Hours {enabled ? 'Enabled' : 'Disabled'}</p>
              <p className="text-[0.65rem] text-slate-500 mt-0.5">
                {enabled
                  ? `Notifications paused ${fmt12(startHour)} – ${fmt12(endHour)}`
                  : 'All notifications delivered immediately at any time'}
              </p>
            </div>
          </div>
          {/* Toggle */}
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            onClick={() => setEnabled(v => !v)}
            className={`relative flex-shrink-0 h-6 w-11 rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-sky-300 focus-visible:ring-offset-1 ${
              enabled ? 'bg-sky-600' : 'bg-slate-300'
            }`}
          >
            <span className={`absolute top-1 left-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
              enabled ? 'translate-x-5' : 'translate-x-0'
            }`} />
          </button>
        </div>

        {/* ── Clock + Controls grid ──────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-4">

          {/* Clock */}
          <div className={`flex flex-col items-center justify-center rounded-2xl px-4 py-5 transition-opacity ${
            enabled ? 'opacity-100' : 'opacity-50'
          } bg-gradient-to-br from-[#071f49] via-[#0e3272] to-[#0a2860] border border-[#1a3a6e]`}>
            <QuietClock startHour={startHour} endHour={endHour} enabled={enabled} />

            {/* Legend below clock */}
            <div className="mt-3 flex items-center gap-4 text-[0.62rem]">
              <span className="flex items-center gap-1.5 text-white/60">
                <span className="h-2 w-2 rounded-full bg-sky-400 inline-block" />
                Start
              </span>
              <span className="flex items-center gap-1.5 text-white/60">
                <span className="h-2 w-2 rounded-full bg-indigo-400 inline-block" />
                End
              </span>
              <span className="flex items-center gap-1.5 text-white/40">
                <span className="h-2 w-5 rounded-sm" style={{ background: 'linear-gradient(90deg,#38bdf8,#6366f1)' }} />
                Quiet
              </span>
            </div>
          </div>

          {/* Controls */}
          <div className={`space-y-4 transition-opacity ${enabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>

            {/* Time range */}
            <div>
              <p className="text-[0.62rem] font-semibold uppercase tracking-wider text-slate-400 mb-2">Time Range</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[0.65rem] text-slate-500 mb-1">From</label>
                  <TimeSelect value={startHour} onChange={setStartHour} disabled={!enabled} />
                </div>
                <div>
                  <label className="block text-[0.65rem] text-slate-500 mb-1">Until</label>
                  <TimeSelect value={endHour} onChange={setEndHour} disabled={!enabled} />
                </div>
              </div>
              {/* Duration pill */}
              <div className="mt-2 flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-100 border border-sky-200 px-2.5 py-1 text-[0.68rem] font-semibold text-sky-700">
                  <Moon className="h-3 w-3" />
                  {duration === 0 ? 'No duration' : `${duration} hour${duration !== 1 ? 's' : ''} of quiet`}
                </span>
                {duration === 0 && (
                  <span className="text-[0.65rem] text-amber-600 font-medium">Start = End — no effect</span>
                )}
              </div>
            </div>

            {/* Active days */}
            <div>
              <p className="text-[0.62rem] font-semibold uppercase tracking-wider text-slate-400 mb-2">Active Days</p>
              <div className="flex gap-1.5 flex-wrap">
                {DAYS.map((d, i) => {
                  const isActive = activeDays.includes(i)
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => toggleDay(i)}
                      aria-pressed={isActive}
                      className={`h-8 w-9 rounded-lg text-[0.68rem] font-semibold transition border focus-visible:ring-2 focus-visible:ring-sky-300 ${
                        isActive
                          ? 'bg-sky-600 border-sky-600 text-white shadow-sm shadow-sky-700/30'
                          : 'bg-white border-slate-200 text-slate-500 hover:border-sky-300 hover:text-sky-600'
                      }`}
                    >
                      {d[0]}
                    </button>
                  )
                })}
              </div>
              <p className="mt-1.5 text-[0.62rem] text-slate-400">
                {activeDays.length === 7
                  ? 'Every day'
                  : activeDays.length === 0
                  ? 'No days selected'
                  : activeDays.map(i => DAYS[i]).join(', ')}
              </p>
            </div>

            {/* Options */}
            <div>
              <p className="text-[0.62rem] font-semibold uppercase tracking-wider text-slate-400 mb-2">Options</p>

              {/* Critical override */}
              <div className="flex items-start justify-between gap-3 py-2.5 border-b border-slate-100">
                <div className="flex items-start gap-2.5 min-w-0">
                  <div className="mt-0.5 grid h-6 w-6 flex-shrink-0 place-items-center rounded-lg bg-red-100">
                    <ShieldAlert className="h-3.5 w-3.5 text-red-500" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-800">Critical alerts bypass quiet hours</p>
                    <p className="text-[0.65rem] text-slate-500 mt-0.5">High-severity compliance failures still notify you immediately</p>
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={criticalOverride}
                  onClick={() => setCriticalOverride(v => !v)}
                  className={`mt-0.5 relative flex-shrink-0 h-5 w-9 rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-sky-300 ${
                    criticalOverride ? 'bg-red-500' : 'bg-slate-200'
                  }`}
                >
                  <span className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                    criticalOverride ? 'translate-x-4' : 'translate-x-0'
                  }`} />
                </button>
              </div>

              {/* Batch delivery */}
              <div className="flex items-start gap-2.5 py-2.5">
                <div className="mt-0.5 grid h-6 w-6 flex-shrink-0 place-items-center rounded-lg bg-sky-100">
                  <Zap className="h-3.5 w-3.5 text-sky-600" />
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-800">Batch & deliver on wake</p>
                  <p className="text-[0.65rem] text-slate-500 mt-0.5">Held notifications arrive as a digest at {fmt12(endHour)}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Summary banner ────────────────────────────────────────────── */}
        {enabled && duration > 0 && activeDays.length > 0 && (
          <div className="rounded-xl border border-slate-200/80 bg-gradient-to-br from-slate-50 to-sky-50/40 px-4 py-3">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 grid h-7 w-7 flex-shrink-0 place-items-center rounded-lg bg-sky-100">
                <Bell className="h-3.5 w-3.5 text-sky-600" />
              </div>
              <div className="space-y-1 min-w-0">
                <p className="text-xs font-semibold text-slate-800">Schedule summary</p>
                <p className="text-[0.68rem] text-slate-600 leading-relaxed">
                  Notifications will be silenced{' '}
                  <span className="font-semibold text-slate-900">{fmt12(startHour)} – {fmt12(endHour)}</span>{' '}
                  on{' '}
                  <span className="font-semibold text-slate-900">
                    {activeDays.length === 7 ? 'all days' : activeDays.map(i => DAYS[i]).join(', ')}
                  </span>
                  {' '}—{' '}
                  <span className="font-semibold text-sky-700">{weeklyHours} hours/week</span> of uninterrupted time.
                </p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 pt-0.5 text-[0.65rem] text-slate-500">
                  <span>Next quiet period: <strong className="text-slate-700">{nextLabel}</strong></span>
                  {criticalOverride && (
                    <span className="flex items-center gap-1 text-red-600 font-medium">
                      <ShieldAlert className="h-2.5 w-2.5" /> Critical alerts still active
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Footer buttons ────────────────────────────────────────────── */}
        <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-100">
          <Button variant="outline" onClick={handleClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="gap-1.5 min-w-[110px]">
            {saving && (
              <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-30" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            {saving ? 'Saving…' : 'Save Schedule'}
          </Button>
        </div>

      </div>
    </Modal>
  )
}
