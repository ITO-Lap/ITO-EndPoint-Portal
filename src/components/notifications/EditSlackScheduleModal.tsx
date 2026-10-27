import { useState } from 'react'
import { Info } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { useToast } from '../ui/ToastProvider'
import { notificationScheduleApi } from '../../api/notificationSchedule'
import type { NotificationFrequency, NotificationSchedule } from '../../api/notificationSchedule'
import { describeSchedule } from './scheduleFormat'

const DAYS: Array<{ label: string; value: number }> = [
  { label: 'Sun', value: 0 }, { label: 'Mon', value: 1 }, { label: 'Tue', value: 2 },
  { label: 'Wed', value: 3 }, { label: 'Thu', value: 4 }, { label: 'Fri', value: 5 }, { label: 'Sat', value: 6 },
]

// A short, curated list covers the vast majority of real deployments without
// needing Intl.supportedValuesOf('timeZone') (not available in every runtime
// this app might ship to). Admins can still type any IANA zone manually.
const COMMON_TIMEZONES = ['Asia/Kolkata', 'UTC', 'America/New_York', 'America/Los_Angeles', 'Europe/London', 'Asia/Singapore', 'Australia/Sydney']

interface EditSlackScheduleModalProps {
  open: boolean
  onClose: () => void
  module: string
  sourceId: string
  schedule: NotificationSchedule
  onSaved: (updated: NotificationSchedule) => void
}

export function EditSlackScheduleModal({ open, onClose, module, sourceId, schedule, onSaved }: EditSlackScheduleModalProps) {
  const { notify } = useToast()
  const [step, setStep] = useState<'edit' | 'confirm'>('edit')
  const [isEnabled, setIsEnabled] = useState(schedule.is_enabled)
  const [frequency, setFrequency] = useState<NotificationFrequency>(schedule.frequency)
  const [weekdays, setWeekdays] = useState<number[]>(schedule.weekdays)
  const [executionTime, setExecutionTime] = useState(schedule.execution_time)
  const [timezone, setTimezone] = useState(schedule.timezone)
  const [saving, setSaving] = useState(false)
  const [formErr, setFormErr] = useState<string | null>(null)

  const reset = () => {
    setStep('edit')
    setIsEnabled(schedule.is_enabled)
    setFrequency(schedule.frequency)
    setWeekdays(schedule.weekdays)
    setExecutionTime(schedule.execution_time)
    setTimezone(schedule.timezone)
    setFormErr(null)
  }

  const handleClose = () => { reset(); onClose() }

  const toggleDay = (d: number) => {
    setWeekdays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d].sort())
  }

  const draft = { is_enabled: isEnabled, frequency, weekdays, execution_time: executionTime, timezone }

  const goToConfirm = () => {
    if (frequency === 'weekly' && weekdays.length === 0) {
      setFormErr('Select at least one weekday for a weekly schedule.')
      return
    }
    setFormErr(null)
    setStep('confirm')
  }

  const handleSave = async () => {
    setSaving(true)
    setFormErr(null)
    try {
      const res = await notificationScheduleApi.update(module, sourceId, draft)
      if (!res.success || !res.data) {
        setFormErr(res.error ?? 'Failed to save schedule.')
        setStep('edit')
        return
      }
      onSaved(res.data.schedule)
      notify('success', 'Schedule updated', describeSchedule(res.data.schedule))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} title="Edit Slack Notification Schedule" onClose={handleClose} size="md">
      {step === 'edit' ? (
        <div className="space-y-4">
          {/* Enable / pause */}
          <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
            <span className="text-xs font-medium text-slate-700">{isEnabled ? 'Enabled' : 'Paused'}</span>
            <button
              type="button" role="switch" aria-checked={isEnabled}
              onClick={() => setIsEnabled(v => !v)}
              className={`relative h-6 w-11 rounded-full transition-colors ${isEnabled ? 'bg-emerald-500' : 'bg-slate-300'}`}
            >
              <span className={`absolute top-1 left-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${isEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
          </div>

          {/* Frequency */}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">Frequency</label>
            <div className="flex gap-2">
              {(['daily', 'weekly'] as const).map(f => (
                <button
                  key={f} type="button" onClick={() => setFrequency(f)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium capitalize transition ${frequency === f ? 'border-orange-400 bg-orange-50 text-orange-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                >{f}</button>
              ))}
            </div>
          </div>

          {/* Weekdays */}
          {frequency === 'weekly' && (
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">Day(s) of week</label>
              <div className="flex gap-1.5 flex-wrap">
                {DAYS.map(d => {
                  const active = weekdays.includes(d.value)
                  return (
                    <button
                      key={d.value} type="button" aria-pressed={active} onClick={() => toggleDay(d.value)}
                      className={`h-8 w-10 rounded-lg text-xs font-semibold transition border ${active ? 'bg-orange-600 border-orange-600 text-white' : 'bg-white border-slate-200 text-slate-500 hover:border-orange-300'}`}
                    >{d.label}</button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Time + timezone */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Time</label>
              <input
                type="time" value={executionTime} onChange={e => setExecutionTime(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs focus:outline-none focus:border-orange-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Time zone</label>
              <input
                list="notification-schedule-timezones" value={timezone} onChange={e => setTimezone(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-mono focus:outline-none focus:border-orange-400"
              />
              <datalist id="notification-schedule-timezones">
                {COMMON_TIMEZONES.map(tz => <option key={tz} value={tz} />)}
              </datalist>
            </div>
          </div>

          {formErr && <p className="text-xs text-red-600">{formErr}</p>}

          <p className="flex items-start gap-1.5 text-[0.68rem] text-slate-400">
            <Info className="h-3 w-3 flex-shrink-0 mt-0.5" />
            Changing this schedule affects future automatic Slack notifications only.
          </p>

          <div className="flex justify-end gap-2 pt-1 border-t border-slate-100">
            <Button variant="outline" onClick={handleClose}>Cancel</Button>
            <Button onClick={goToConfirm}>Next</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200/80 bg-slate-50 p-4 space-y-1.5">
            <p className="text-xs font-semibold text-slate-800">New schedule</p>
            <p className="text-xs text-slate-700">{isEnabled ? describeSchedule(draft) : 'Paused — no automatic notifications will be sent'}</p>
            {isEnabled && <p className="text-[0.68rem] text-slate-500">Time zone: {timezone}</p>}
          </div>

          <p className="flex items-start gap-1.5 text-[0.68rem] text-slate-400">
            <Info className="h-3 w-3 flex-shrink-0 mt-0.5" />
            Changing this schedule affects future automatic Slack notifications only. Saving will not send a Slack message now.
          </p>

          {formErr && <p className="text-xs text-red-600">{formErr}</p>}

          <div className="flex justify-end gap-2 pt-1 border-t border-slate-100">
            <Button variant="outline" onClick={() => setStep('edit')} disabled={saving}>Back</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save schedule'}</Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
