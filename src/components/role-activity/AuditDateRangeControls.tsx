import { useMemo, useState } from 'react'
import { Calendar, Clock, Globe2 } from 'lucide-react'
import { zonedWallTimeToUtc, formatInTimezone, formatUtc, listTimezones } from '../../lib/timezone'

export interface DateRangeValue {
  startUtc: Date
  endUtc: Date
  timezone: string
}

interface Props {
  value: DateRangeValue
  onChange: (next: DateRangeValue) => void
  maxRangeDays: number
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000)
}

// Each preset is tagged with its worst-case span in days so callers can drop
// presets that would exceed the server's live-browse max-range cap
// (ROLE_ACTIVITY_LIVE_BROWSE_MAX_DAYS) before the user ever clicks one — the
// old DB-backed browse had no such cap, but the live 3-source fan-out does.
function buildPresets(timezone: string, maxRangeDays: number): Array<{ label: string; range: () => DateRangeValue }> {
  const now = new Date()
  const all: Array<{ label: string; approxDays: number; range: () => DateRangeValue }> = [
    { label: 'Last 24 hours', approxDays: 1, range: () => ({ startUtc: addDays(now, -1), endUtc: now, timezone }) },
    { label: 'Last 7 days', approxDays: 7, range: () => ({ startUtc: addDays(now, -7), endUtc: now, timezone }) },
    { label: 'Last 30 days', approxDays: 30, range: () => ({ startUtc: addDays(now, -30), endUtc: now, timezone }) },
    {
      label: 'This month', approxDays: 31, range: () => {
        const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit' }).formatToParts(now)
        const y = Number(parts.find(p => p.type === 'year')?.value); const m = Number(parts.find(p => p.type === 'month')?.value)
        return { startUtc: zonedWallTimeToUtc(y, m, 1, 0, 0, timezone), endUtc: now, timezone }
      },
    },
    {
      label: 'Previous month', approxDays: 31, range: () => {
        const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit' }).formatToParts(now)
        const y = Number(parts.find(p => p.type === 'year')?.value); const m = Number(parts.find(p => p.type === 'month')?.value)
        const prevY = m === 1 ? y - 1 : y; const prevM = m === 1 ? 12 : m - 1
        return { startUtc: zonedWallTimeToUtc(prevY, prevM, 1, 0, 0, timezone), endUtc: zonedWallTimeToUtc(y, m, 1, 0, 0, timezone), timezone }
      },
    },
    {
      label: 'This year', approxDays: 366, range: () => {
        const y = Number(new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric' }).format(now))
        return { startUtc: zonedWallTimeToUtc(y, 1, 1, 0, 0, timezone), endUtc: now, timezone }
      },
    },
    {
      label: 'Previous year', approxDays: 366, range: () => {
        const y = Number(new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric' }).format(now))
        return { startUtc: zonedWallTimeToUtc(y - 1, 1, 1, 0, 0, timezone), endUtc: zonedWallTimeToUtc(y, 1, 1, 0, 0, timezone), timezone }
      },
    },
  ]
  return all.filter(p => p.approxDays <= maxRangeDays)
}

function splitDateTime(date: Date, timezone: string): { dateStr: string; timeStr: string } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(date)
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? '00'
  return { dateStr: `${get('year')}-${get('month')}-${get('day')}`, timeStr: `${get('hour') === '24' ? '00' : get('hour')}:${get('minute')}` }
}

export function AuditDateRangeControls({ value, onChange, maxRangeDays }: Props) {
  const [customError, setCustomError] = useState<string | null>(null)
  const timezones = useMemo(() => listTimezones(), [])
  const presets = useMemo(() => buildPresets(value.timezone, maxRangeDays), [value.timezone, maxRangeDays])

  const start = splitDateTime(value.startUtc, value.timezone)
  const end = splitDateTime(value.endUtc, value.timezone)
  const rangeDays = (value.endUtc.getTime() - value.startUtc.getTime()) / 86_400_000
  const years = useMemo(() => {
    const current = new Date().getUTCFullYear()
    return Array.from({ length: 8 }, (_, i) => current - i)
  }, [])

  function applyCustom(field: 'startDate' | 'startTime' | 'endDate' | 'endTime', raw: string) {
    const nextStartDateStr = field === 'startDate' ? raw : start.dateStr
    const nextStartTimeStr = field === 'startTime' ? raw : start.timeStr
    const nextEndDateStr = field === 'endDate' ? raw : end.dateStr
    const nextEndTimeStr = field === 'endTime' ? raw : end.timeStr

    const [sy, sm, sd] = nextStartDateStr.split('-').map(Number)
    const [sh, smin] = nextStartTimeStr.split(':').map(Number)
    const [ey, em, ed] = nextEndDateStr.split('-').map(Number)
    const [eh, emin] = nextEndTimeStr.split(':').map(Number)
    if (!sy || !ey) return

    const nextStart = zonedWallTimeToUtc(sy, sm, sd, sh ?? 0, smin ?? 0, value.timezone)
    const nextEnd = zonedWallTimeToUtc(ey, em, ed, eh ?? 0, emin ?? 0, value.timezone)

    if (nextEnd.getTime() > Date.now() + 60_000) { setCustomError('End of range cannot be in the future.'); return }
    if (nextEnd <= nextStart) { setCustomError('End must be after start.'); return }
    const days = (nextEnd.getTime() - nextStart.getTime()) / 86_400_000
    if (days > maxRangeDays) { setCustomError(`Range cannot exceed ${maxRangeDays} days (requested ${days.toFixed(1)}).`); return }

    setCustomError(null)
    onChange({ startUtc: nextStart, endUtc: nextEnd, timezone: value.timezone })
  }

  function applyYear(year: number) {
    const startUtc = zonedWallTimeToUtc(year, 1, 1, 0, 0, value.timezone)
    const endUtc = year === new Date().getUTCFullYear() ? new Date() : zonedWallTimeToUtc(year + 1, 1, 1, 0, 0, value.timezone)
    setCustomError(null)
    onChange({ startUtc, endUtc, timezone: value.timezone })
  }

  return (
    <div className="rounded-xl border border-slate-200/60 bg-white shadow-sm p-4 space-y-4">
      <div>
        <p className="text-[0.68rem] font-semibold text-slate-500 mb-2">Quick presets</p>
        <div className="flex flex-wrap gap-2">
          {presets.map(p => (
            <button
              key={p.label} type="button"
              onClick={() => { setCustomError(null); onChange(p.range()) }}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:border-orange-300 transition focus-visible:ring-2 focus-visible:ring-orange-300"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 items-end">
        <div>
          <label htmlFor="audit-start-date" className="block text-[0.68rem] font-medium text-slate-600 mb-1">
            <Calendar className="inline h-3 w-3 mr-1" aria-hidden="true" />Start date
          </label>
          <input id="audit-start-date" type="date" value={start.dateStr} max={end.dateStr}
            onChange={e => applyCustom('startDate', e.target.value)}
            className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700 focus:outline-none focus:border-orange-400" />
        </div>
        <div>
          <label htmlFor="audit-start-time" className="block text-[0.68rem] font-medium text-slate-600 mb-1">
            <Clock className="inline h-3 w-3 mr-1" aria-hidden="true" />Start time
          </label>
          <input id="audit-start-time" type="time" value={start.timeStr}
            onChange={e => applyCustom('startTime', e.target.value)}
            className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700 focus:outline-none focus:border-orange-400" />
        </div>
        <div>
          <label htmlFor="audit-end-date" className="block text-[0.68rem] font-medium text-slate-600 mb-1">
            <Calendar className="inline h-3 w-3 mr-1" aria-hidden="true" />End date
          </label>
          <input id="audit-end-date" type="date" value={end.dateStr} min={start.dateStr}
            onChange={e => applyCustom('endDate', e.target.value)}
            className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700 focus:outline-none focus:border-orange-400" />
        </div>
        <div>
          <label htmlFor="audit-end-time" className="block text-[0.68rem] font-medium text-slate-600 mb-1">
            <Clock className="inline h-3 w-3 mr-1" aria-hidden="true" />End time
          </label>
          <input id="audit-end-time" type="time" value={end.timeStr}
            onChange={e => applyCustom('endTime', e.target.value)}
            className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700 focus:outline-none focus:border-orange-400" />
        </div>
        <div>
          <label htmlFor="audit-year" className="block text-[0.68rem] font-medium text-slate-600 mb-1">Year</label>
          <select id="audit-year" onChange={e => applyYear(Number(e.target.value))} defaultValue=""
            className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700 focus:outline-none focus:border-orange-400">
            <option value="" disabled>Jump to year…</option>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="audit-timezone" className="block text-[0.68rem] font-medium text-slate-600 mb-1">
            <Globe2 className="inline h-3 w-3 mr-1" aria-hidden="true" />Timezone
          </label>
          <select id="audit-timezone" value={value.timezone}
            onChange={e => onChange({ ...value, timezone: e.target.value })}
            className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700 focus:outline-none focus:border-orange-400">
            {timezones.map(tz => <option key={tz} value={tz}>{tz}</option>)}
          </select>
        </div>
      </div>

      {customError && <p role="alert" className="text-xs font-medium text-red-600">{customError}</p>}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.68rem] text-slate-500 border-t border-slate-100 pt-3">
        <span><span className="font-semibold text-slate-600">UTC:</span> {formatUtc(value.startUtc)} → {formatUtc(value.endUtc)}</span>
        <span><span className="font-semibold text-slate-600">{value.timezone}:</span> {formatInTimezone(value.startUtc, value.timezone)} → {formatInTimezone(value.endUtc, value.timezone)}</span>
        <span className={rangeDays > maxRangeDays ? 'font-semibold text-red-600' : ''}>{rangeDays.toFixed(1)} day{rangeDays === 1 ? '' : 's'}</span>
      </div>
    </div>
  )
}
