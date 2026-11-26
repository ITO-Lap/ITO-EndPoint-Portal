import { useEffect, useState } from 'react'
import { Clock, RefreshCw, AlertTriangle, CheckCircle2, XCircle, MessageSquare, Pencil } from 'lucide-react'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { notificationScheduleApi } from '../../api/notificationSchedule'
import type { NotificationSchedule } from '../../api/notificationSchedule'
import { EditSlackScheduleModal } from './EditSlackScheduleModal'
import { describeSchedule } from './scheduleFormat'

interface SlackScheduleSectionProps {
  module: string
  sourceId: string
  canEdit: boolean
}

export function SlackScheduleSection({ module, sourceId, canEdit }: SlackScheduleSectionProps) {
  const [state, setState] = useState<'loading' | 'unavailable' | 'error' | 'ready'>('loading')
  const [schedule, setSchedule] = useState<NotificationSchedule | null>(null)
  const [slackConfigured, setSlackConfigured] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)

  const [reloadTick, setReloadTick] = useState(0)
  // Retry button: show the loading state and re-run the fetch effect.
  const load = () => { setState('loading'); setReloadTick(t => t + 1) }

  // Back to the loading state during render when the target schedule changes.
  const targetKey = `${module}|${sourceId}`
  const [prevTargetKey, setPrevTargetKey] = useState(targetKey)
  if (targetKey !== prevTargetKey) { setPrevTargetKey(targetKey); setState('loading') }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await notificationScheduleApi.get(module, sourceId)
        if (cancelled) return
        if (!res.success && !res.data) {
          setErrorMsg(res.error ?? 'Failed to load schedule.')
          setState('error')
          return
        }
        if (!res.data) {
          // No schedule came back: a real unavailable state, never a fabricated schedule.
          setState('unavailable')
          return
        }
        setSchedule(res.data.schedule)
        setSlackConfigured(res.data.slackConfigured)
        setState('ready')
      } catch {
        if (cancelled) return
        setErrorMsg('Could not reach the server.')
        setState('error')
      }
    })()
    return () => { cancelled = true }
  }, [module, sourceId, reloadTick])

  return (
    <div className="rounded-xl border border-slate-200/60 bg-white shadow-sm p-4" data-testid="slack-schedule-section">
      <div className="flex items-center gap-2 mb-2">
        <MessageSquare className="h-3.5 w-3.5 text-[#4A154B]" />
        <h3 className="text-xs font-semibold text-slate-900">Slack Notification Schedule</h3>
      </div>

      {state === 'loading' && (
        <div className="flex items-center gap-2 py-3 text-xs text-slate-400">
          <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Loading schedule…
        </div>
      )}

      {state === 'unavailable' && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Scheduler unavailable</p>
            <p className="mt-0.5">The schedule could not be read right now. Try again in a moment; if it keeps happening, check the server log.</p>
          </div>
        </div>
      )}

      {state === 'error' && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          <XCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold">Couldn't load this schedule</p>
            <p className="mt-0.5">{errorMsg}</p>
          </div>
          <button onClick={load} className="text-red-700 underline text-xs flex-shrink-0">Retry</button>
        </div>
      )}

      {state === 'ready' && schedule && (
        <div className="space-y-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              label={schedule.is_enabled ? 'Enabled' : 'Paused'}
              variant={schedule.is_enabled ? 'green' : 'gray'}
              showDot={schedule.is_enabled}
            />
            {!slackConfigured && (
              <Badge label="Slack not configured" variant="red" />
            )}
          </div>

          <p className="text-xs text-slate-700 font-medium">{describeSchedule(schedule)}</p>
          <p className="text-[0.68rem] text-slate-500">Time zone: <span className="font-medium text-slate-600">{schedule.timezone}</span></p>

          <div className="flex items-center gap-1.5 text-[0.68rem] text-slate-500">
            <Clock className="h-3 w-3" />
            {schedule.is_enabled && schedule.next_run_at
              ? <span>Next scheduled notification: <strong className="text-slate-700">{new Date(schedule.next_run_at).toLocaleString()}</strong></span>
              : <span>No upcoming notification{!schedule.is_enabled ? ' — paused' : ''}</span>}
          </div>

          <div className="flex items-center gap-1.5 text-[0.68rem] text-slate-500">
            {schedule.last_run_status === 'completed' && <CheckCircle2 className="h-3 w-3 text-emerald-500" />}
            {schedule.last_run_status === 'failed' && <XCircle className="h-3 w-3 text-red-500" />}
            {schedule.last_run_at
              ? <span>Last notification: <strong className="text-slate-700">{schedule.last_run_status ?? 'unknown'}</strong> · {new Date(schedule.last_run_at).toLocaleString()}</span>
              : <span>No automatic notifications sent yet</span>}
          </div>
          {schedule.last_run_status === 'failed' && schedule.last_run_error && (
            <p className="text-[0.65rem] text-red-600">{schedule.last_run_error}</p>
          )}

          <div className="pt-1">
            {canEdit ? (
              <Button variant="outline" size="sm" icon={Pencil} onClick={() => setEditing(true)}>Edit schedule</Button>
            ) : (
              <p className="text-[0.65rem] text-slate-400">Global Admin required to edit this schedule.</p>
            )}
          </div>
        </div>
      )}

      {editing && schedule && (
        <EditSlackScheduleModal
          open={editing}
          onClose={() => setEditing(false)}
          module={module}
          sourceId={sourceId}
          schedule={schedule}
          onSaved={(updated) => { setSchedule(updated); setEditing(false) }}
        />
      )}
    </div>
  )
}
