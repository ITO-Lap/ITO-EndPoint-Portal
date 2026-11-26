import { useEffect, useState } from 'react'
import { MessageSquare, RefreshCw, Pencil, Clock } from 'lucide-react'
import { notificationScheduleApi } from '../../api/notificationSchedule'
import type { NotificationScheduleListItem, UpdateScheduleInput } from '../../api/notificationSchedule'
import { describeSchedule } from '../notifications/scheduleFormat'
import { EditSlackScheduleModal } from '../notifications/EditSlackScheduleModal'

interface QuickSlackSchedulesProps {
  canEdit: boolean
  onViewAll?: () => void
}

export function QuickSlackSchedules({ canEdit, onViewAll }: QuickSlackSchedulesProps) {
  const [state, setState] = useState<'loading' | 'empty' | 'ready' | 'error'>('loading')
  const [schedules, setSchedules] = useState<NotificationScheduleListItem[]>([])
  const [editing, setEditing] = useState<NotificationScheduleListItem | null>(null)

  // Bump to reload (after saving). State starts as 'loading', so the first fetch needs no spinner, and a reload keeps the current rows visible.
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    void notificationScheduleApi.list().then(res => {
      if (cancelled) return
      if (!res.success) { setState('error'); return }
      const rows = (res.data ?? []).slice(0, 2)
      setSchedules(rows)
      setState(rows.length === 0 ? 'empty' : 'ready')
    })
    return () => { cancelled = true }
  }, [reloadKey])

  const toggleEnabled = async (schedule: NotificationScheduleListItem) => {
    const input: UpdateScheduleInput = {
      is_enabled: !schedule.is_enabled, frequency: schedule.frequency, weekdays: schedule.weekdays,
      execution_time: schedule.execution_time, timezone: schedule.timezone,
    }
    const res = await notificationScheduleApi.update(schedule.module, schedule.source_id, input)
    if (res.success && res.data) setSchedules(prev => prev.map(s => s.id === schedule.id ? { ...s, ...res.data!.schedule } : s))
  }

  return (
    <div className="rounded-2xl border border-slate-200/60 bg-white shadow-sm p-4 h-full flex flex-col">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-[#4A154B]" />
          <h2 className="text-sm font-bold text-slate-900">Quick Slack schedules</h2>
        </div>
        {onViewAll && <button onClick={onViewAll} className="text-xs font-medium text-sky-600 hover:underline">Manage automations →</button>}
      </div>

      {state === 'loading' && (
        <div className="flex flex-1 items-center justify-center py-6 text-xs text-slate-400">
          <RefreshCw className="h-4 w-4 animate-spin" />
        </div>
      )}

      {state === 'error' && (
        <p className="flex-1 text-xs text-red-500">Couldn't load Slack schedules.</p>
      )}

      {state === 'empty' && (
        <div className="flex-1 flex flex-col items-center justify-center text-center py-4">
          <p className="text-xs font-medium text-slate-500">No Slack schedules yet</p>
          <p className="text-[0.68rem] text-slate-400 mt-0.5">Set one up from Scheduled Reports.</p>
        </div>
      )}

      {state === 'ready' && (
        <div className="space-y-2.5 flex-1">
          {schedules.map(schedule => (
            <div key={schedule.id} className="rounded-xl border border-slate-200/70 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-800 truncate">{schedule.reportName ?? 'Slack notification'}</p>
                  <p className="text-[0.68rem] text-slate-500 mt-0.5">{describeSchedule(schedule)}</p>
                  <p className="flex items-center gap-1 text-[0.65rem] text-slate-400 mt-1">
                    <Clock className="h-2.5 w-2.5" />
                    {schedule.is_enabled && schedule.next_run_at ? `Next: ${new Date(schedule.next_run_at).toLocaleString()}` : 'Paused'}
                  </p>
                </div>
                <button
                  type="button" role="switch" aria-checked={schedule.is_enabled} disabled={!canEdit}
                  onClick={() => toggleEnabled(schedule)}
                  className={`relative h-5 w-9 flex-shrink-0 rounded-full transition-colors disabled:opacity-40 ${schedule.is_enabled ? 'bg-emerald-500' : 'bg-slate-300'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${schedule.is_enabled ? 'translate-x-4' : 'translate-x-0'}`} />
                </button>
              </div>
              {canEdit && (
                <button onClick={() => setEditing(schedule)} className="mt-2 flex items-center gap-1 text-[0.68rem] font-medium text-sky-600 hover:underline">
                  <Pencil className="h-2.5 w-2.5" /> Edit schedule
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {editing && (
        <EditSlackScheduleModal
          open={!!editing}
          onClose={() => setEditing(null)}
          module={editing.module}
          sourceId={editing.source_id}
          schedule={editing}
          onSaved={() => { setEditing(null); setReloadKey(k => k + 1) }}
        />
      )}
    </div>
  )
}
