import { useEffect, useState } from 'react'
import { Calendar, Plus, RefreshCw, Trash2, Play, CheckCircle, MessageSquare, Pencil } from 'lucide-react'
import { intelApi } from '../api/intelligence'
import type { ScheduledReport, CreateScheduleInput } from '../api/intelligence'
import { setNotificationScheduleActor } from '../api/notificationSchedule'
import { canEditSlackSchedules } from '../lib/permissions'
import { SlackScheduleSection } from '../components/notifications/SlackScheduleSection'
import { usePermissions } from '../context/PermissionsContext'

const REPORT_TYPES = ['critical-patching', 'stale-devices', 'compliance', 'inventory', 'app-updates', 'fleet-digest', 'entra-duplicate-devices', 'windows-updates', 'windows-briefing']
const FORMATS      = ['pdf', 'excel', 'csv', 'pptx']
const DEFAULT_RECIPIENT = 'ITO_Endpoint@zinnia.com'
const DEFAULT_SLACK_CHANNEL = 'C08S9K7G2AH'

const CRON_PRESETS = [
  { label: 'Daily at 8am',        value: '0 8 * * *'   },
  { label: 'Weekly (Mon 8am)',     value: '0 8 * * 1'   },
  { label: 'Weekly (Mon 11am)',    value: '0 11 * * 1'  },
  { label: 'Monthly (1st, 8am)',   value: '0 8 1 * *'   },
  { label: 'Every weekday at 7am', value: '0 7 * * 1-5' },
]

export function ScheduledReportsPage({ onBack, viewerRole = 'Global Admin', userEmail }: { onBack: () => void; viewerRole?: string; userEmail?: string }) {
  const permissions = usePermissions()
  useEffect(() => { setNotificationScheduleActor(viewerRole, userEmail ?? 'unknown@zinnia.com') }, [viewerRole, userEmail])

  const [schedules, setSchedules] = useState<ScheduledReport[]>([])
  const [loading, setLoading]     = useState(true)
  const [showForm, setShowForm]   = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [running, setRunning]     = useState<string | null>(null)
  const [runMsg, setRunMsg]       = useState<Record<string, string>>({})

  const defaultForm = (): CreateScheduleInput => ({
    name: '', report_type: 'critical-patching', schedule_cron: '0 8 * * 1',
    format: 'excel', recipients: [DEFAULT_RECIPIENT], created_by: '',
  })

  const [form, setForm] = useState<CreateScheduleInput>(defaultForm())
  const [recipientInput, setRecipientInput] = useState('')
  const [delivery, setDelivery] = useState<'email' | 'slack' | 'both'>('email')
  const [slackChannelId, setSlackChannelId] = useState(DEFAULT_SLACK_CHANNEL)
  const slackOnly = form.report_type === 'fleet-digest' || form.report_type === 'entra-duplicate-devices' || form.report_type === 'windows-briefing'
  useEffect(() => { if (slackOnly) setDelivery('slack') }, [slackOnly])
  // Email / Both always start with the default recipient; more can be added next to it.
  useEffect(() => {
    if (delivery !== 'slack') setForm(p => (p.recipients ?? []).length === 0 ? { ...p, recipients: [DEFAULT_RECIPIENT] } : p)
  }, [delivery])
  const [saving, setSaving]                 = useState(false)
  const [formErr, setFormErr]               = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const res = await intelApi.schedules.list()
      setSchedules(res.data ?? [])
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const handleAdd = async () => {
    if (!form.name || !form.report_type || !form.schedule_cron) {
      setFormErr('Name, report type, and schedule are required.')
      return
    }
    if (delivery !== 'email' && !slackChannelId.trim()) {
      setFormErr('A Slack channel ID is required for Slack delivery.')
      return
    }
    if (delivery !== 'slack' && (form.recipients ?? []).length === 0) {
      setFormErr('At least one email recipient is required.')
      return
    }
    setSaving(true); setFormErr(null)
    try {
      const payload = {
        ...form,
        recipients: delivery === 'slack' ? [] : form.recipients,
        filters: delivery !== 'email' ? { slackChannelId: slackChannelId.trim(), timezone: 'Asia/Kolkata' } : { timezone: 'Asia/Kolkata' },
      }
      const res = editingId
        ? await intelApi.schedules.update(editingId, { name: payload.name, schedule_cron: payload.schedule_cron, format: payload.format, recipients: payload.recipients, filters: payload.filters }) as { success: boolean; error?: string }
        : await intelApi.schedules.create(payload)
      if (res.success) {
        setShowForm(false); setEditingId(null)
        setForm(defaultForm())
        setDelivery('email'); setSlackChannelId(DEFAULT_SLACK_CHANNEL)
        await load()
      } else {
        setFormErr(res.error ?? 'Failed to create schedule.')
      }
    } finally {
      setSaving(false)
    }
  }

  const startEdit = (s: ScheduledReport) => {
    const channel = s.filters?.slackChannelId?.trim()
    setEditingId(s.id)
    setForm({ name: s.name, report_type: s.report_type, schedule_cron: s.schedule_cron, format: s.format, recipients: s.recipients ?? [], created_by: s.created_by ?? '' })
    setDelivery(channel ? ((s.recipients ?? []).length > 0 ? 'both' : 'slack') : 'email')
    setSlackChannelId(channel || DEFAULT_SLACK_CHANNEL)
    setRecipientInput(''); setFormErr(null); setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const closeForm = () => { setShowForm(false); setEditingId(null); setForm(defaultForm()); setFormErr(null) }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this schedule?')) return
    await intelApi.schedules.delete(id)
    await load()
  }

  const handleToggle = async (s: ScheduledReport) => {
    const next = !s.is_active
    setSchedules(list => list.map(x => x.id === s.id ? { ...x, is_active: next } : x))
    try {
      const res = await intelApi.schedules.update(s.id, { is_active: next })
      if (!res.success) throw new Error('update failed')
    } catch {
      setSchedules(list => list.map(x => x.id === s.id ? { ...x, is_active: s.is_active } : x))
    }
  }

  const handleRunNow = async (id: string) => {
    setRunning(id)
    try {
      const res = await intelApi.schedules.runNow(id)
      setRunMsg(prev => ({ ...prev, [id]: res.message ?? (res.success ? 'Queued' : 'Failed') }))
    } finally {
      setRunning(null)
    }
  }

  const addRecipient = () => {
    const email = recipientInput.trim()
    if (email && !form.recipients?.includes(email)) {
      setForm(prev => ({ ...prev, recipients: [...(prev.recipients ?? []), email] }))
    }
    setRecipientInput('')
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1 text-sm text-slate-400">
            <button onClick={onBack} className="hover:text-slate-600 transition">← Back</button>
            <span>/</span>
            <span className="text-slate-700 font-medium flex items-center gap-1.5">
              <Calendar className="h-4 w-4 text-teal-500" /> Scheduled Reports
            </span>
          </div>
          <p className="text-xs text-slate-500">Schedule report delivery to a Slack channel or email recipients. Default format is Excel.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 transition">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
          <button onClick={() => { if (showForm) closeForm(); else { setEditingId(null); setForm(defaultForm()); setShowForm(true) } }} className="flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-2 text-xs font-semibold text-white hover:bg-orange-600 transition">
            <Plus className="h-3.5 w-3.5" /> New Schedule
          </button>
        </div>
      </div>

      {/* Add form */}
      {showForm && (
        <div className="rounded-xl border border-slate-200/60 bg-white shadow-sm p-5">
          <h2 className="text-sm font-semibold text-slate-900 mb-4">{editingId ? 'Edit Scheduled Report' : 'New Scheduled Report'}</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">Report Name *</label>
              <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Weekly Compliance Report" className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs focus:outline-none focus:border-orange-400" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Report Type *</label>
              <select value={form.report_type} disabled={!!editingId} onChange={e => setForm(p => ({ ...p, report_type: e.target.value }))} className="disabled:opacity-60 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs focus:outline-none">
                {REPORT_TYPES.map(t => <option key={t} value={t}>{t === 'app-updates' ? 'Managed App Report' : t === 'windows-updates' ? 'Windows updates (feature & security)' : t === 'windows-briefing' ? 'Windows Patch Tuesday briefing (Slack only)' : t === 'fleet-digest' ? 'fleet health digest (Slack only)' : t === 'entra-duplicate-devices' ? 'duplicate Entra device objects (Slack only)' : t.replace('-', ' ')}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Format</label>
              <select value={form.format} onChange={e => setForm(p => ({ ...p, format: e.target.value }))} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs focus:outline-none">
                {FORMATS.map(f => <option key={f} value={f}>{f.toUpperCase()}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">Delivery</label>
              <div className="flex gap-2 mb-2">
                {(['email', 'slack', 'both'] as const).filter(d => d === 'slack' || !slackOnly).map(d => (
                  <button key={d} type="button" onClick={() => setDelivery(d)} className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium ${delivery === d ? (d === 'email' ? 'border-orange-400 bg-orange-50 text-orange-700' : 'border-[#4A154B] bg-[#4A154B]/5 text-[#4A154B]') : 'border-slate-200 text-slate-600'}`}>
                    {d !== 'email' && <MessageSquare className="h-3.5 w-3.5" />}{d === 'email' ? 'Email' : d === 'slack' ? 'Slack channel' : 'Email + Slack'}
                  </button>
                ))}
              </div>
              {delivery !== 'email' && (
                <div className="rounded-lg border border-[#4A154B]/15 bg-[#4A154B]/[0.03] p-3">
                  <label className="block text-xs font-medium text-slate-700 mb-1">Slack channel ID *</label>
                  <input value={slackChannelId} onChange={e => setSlackChannelId(e.target.value)} placeholder="C08S9K7G2AH" className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs focus:outline-none focus:border-[#4A154B]" />
                  <p className="mt-1 text-[10px] text-slate-500">The Slack bot must be invited to this channel.</p>
                </div>
              )}
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">Schedule *</label>
              <div className="flex flex-wrap gap-2 mb-2">
                {CRON_PRESETS.map(p => (
                  <button key={p.value} onClick={() => setForm(f => ({ ...f, schedule_cron: p.value }))}
                    className={`rounded-full border px-3 py-1 text-xs transition ${form.schedule_cron === p.value ? 'is-selected font-semibold' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                    {p.label}
                  </button>
                ))}
              </div>
              <input value={form.schedule_cron} onChange={e => setForm(p => ({ ...p, schedule_cron: e.target.value }))} placeholder="0 8 * * 1" className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-mono focus:outline-none focus:border-orange-400" />
              <p className="text-[10px] text-slate-400 mt-1">5-field cron: minute hour day month weekday · Slack reports use India Standard Time (Asia/Kolkata).</p>
            </div>
            {delivery !== 'slack' && <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">Recipients</label>
              <div className="flex gap-2 mb-2">
                <input value={recipientInput} onChange={e => setRecipientInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && addRecipient()} placeholder="avinash.verma@zinnia.com" className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs focus:outline-none focus:border-orange-400" />
                <button onClick={addRecipient} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50">Add</button>
              </div>
              {(form.recipients ?? []).length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {form.recipients?.map(r => (
                    <span key={r} className="flex items-center gap-1 rounded-full bg-teal-100 px-2.5 py-0.5 text-xs text-teal-800">
                      {r}
                      <button onClick={() => setForm(p => ({ ...p, recipients: p.recipients?.filter(x => x !== r) }))} className="text-teal-500 hover:text-teal-700">×</button>
                    </span>
                  ))}
                </div>
              )}
            </div>}
          </div>
          {formErr && <p className="mt-3 text-xs text-red-600">{formErr}</p>}
          <div className="mt-4 flex gap-2">
            <button onClick={handleAdd} disabled={saving} className="rounded-lg bg-orange-500 px-4 py-2 text-xs font-semibold text-white hover:bg-orange-600 disabled:opacity-60">
              {saving ? 'Saving…' : editingId ? 'Save Changes' : 'Create Schedule'}
            </button>
            <button onClick={closeForm} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50">Cancel</button>
          </div>
        </div>
      )}

      {/* Schedule list */}
      {loading ? (
        <div className="flex items-center justify-center py-16"><RefreshCw className="h-5 w-5 animate-spin text-slate-400" /></div>
      ) : schedules.length === 0 ? (
        <div className="rounded-xl border border-slate-200/60 bg-white shadow-sm p-12 text-center">
          <Calendar className="h-8 w-8 text-slate-300 mx-auto mb-2" />
          <p className="text-sm font-medium text-slate-500">No schedules configured</p>
          <p className="text-xs text-slate-400 mt-1">Create a schedule to automate report delivery.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {schedules.map(s => (
            <div key={s.id} className="rounded-xl border border-slate-200/60 bg-white shadow-sm p-4">
              <div className="flex flex-wrap items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-0.5">
                    <span className="text-sm font-semibold text-slate-900">{s.name}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${s.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {s.is_active ? 'Active' : 'Off'}
                    </span>
                    <span className="rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-semibold text-teal-700 capitalize">{s.format.toUpperCase()}</span>
                  </div>
                  <p className="text-xs text-slate-500">
                    {s.report_type === 'app-updates' ? 'Managed App Report' : s.report_type} · <code className="font-mono text-slate-600">{s.schedule_cron}</code>
                  </p>
                  <p className="text-xs mt-0.5">
                    {s.filters?.slackChannelId && <span className="inline-flex items-center gap-1 font-medium text-[#4A154B]"><MessageSquare className="h-3 w-3" />Slack · <code className="font-mono">{s.filters.slackChannelId}</code></span>}
                    {s.filters?.slackChannelId && s.recipients?.length > 0 && <span className="mx-1.5 text-slate-300">+</span>}
                    {s.recipients?.length > 0 && <span className="font-medium text-slate-600">Email · {s.recipients.join(', ')}</span>}
                    {!s.filters?.slackChannelId && !(s.recipients?.length > 0) && <span className="font-medium text-red-600">No delivery set — will fail. Click Edit.</span>}
                    {!s.filters?.slackChannelId && (s.report_type === 'fleet-digest' || s.report_type === 'entra-duplicate-devices' || s.report_type === 'windows-briefing') && <span className="ml-2 font-medium text-red-600">Slack-only report — add a Slack channel.</span>}
                  </p>
                  {s.last_run_at && (
                    <p className="text-xs text-slate-400 mt-0.5">Last run: {new Date(s.last_run_at).toLocaleString()}</p>
                  )}
                  {runMsg[s.id] && (
                    <p className="text-xs text-teal-600 mt-1 flex items-center gap-1">
                      <CheckCircle className="h-3 w-3" /> {runMsg[s.id]}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button" role="switch" aria-checked={s.is_active}
                    aria-label={`${s.is_active ? 'Turn off' : 'Turn on'} ${s.name}`}
                    title={s.is_active ? 'On — click to turn off' : 'Off — click to turn on'}
                    onClick={() => handleToggle(s)}
                    className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
                    <span className={`relative h-5 w-9 rounded-full transition ${s.is_active ? 'bg-emerald-500' : 'bg-slate-300'}`}>
                      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${s.is_active ? 'left-[18px]' : 'left-0.5'}`} />
                    </span>
                    {s.is_active ? 'On' : 'Off'}
                  </button>
                  <button onClick={() => handleRunNow(s.id)} disabled={running === s.id} className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition">
                    <Play className="h-3 w-3" />{running === s.id ? 'Running…' : 'Run Now'}
                  </button>
                  <button onClick={() => startEdit(s)} className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition">
                    <Pencil className="h-3 w-3" />Edit
                  </button>
                  <button onClick={() => handleDelete(s.id)} className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-red-600 hover:bg-red-100 transition">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              {!!s.filters?.slackChannelId && (
                <div className="mt-3 border-t border-slate-100 pt-3">
                  <SlackScheduleSection module="scheduled_report" sourceId={s.id} canEdit={canEditSlackSchedules(viewerRole, permissions)} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
