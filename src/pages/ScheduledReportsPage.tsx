import { useState, useEffect } from 'react'
import { Calendar, Plus, RefreshCw, Trash2, Play, CheckCircle, XCircle } from 'lucide-react'
import { intelApi } from '../api/intelligence'
import type { ScheduledReport, CreateScheduleInput } from '../api/intelligence'

const REPORT_TYPES = ['compliance', 'inventory', 'app-deployment', 'risk', 'executive']
const FORMATS      = ['pdf', 'excel', 'csv', 'pptx']

const CRON_PRESETS = [
  { label: 'Daily at 8am',        value: '0 8 * * *'   },
  { label: 'Weekly (Mon 8am)',     value: '0 8 * * 1'   },
  { label: 'Monthly (1st, 8am)',   value: '0 8 1 * *'   },
  { label: 'Every weekday at 7am', value: '0 7 * * 1-5' },
]

export function ScheduledReportsPage({ onBack }: { onBack: () => void }) {
  const [schedules, setSchedules] = useState<ScheduledReport[]>([])
  const [loading, setLoading]     = useState(true)
  const [showForm, setShowForm]   = useState(false)
  const [running, setRunning]     = useState<string | null>(null)
  const [runMsg, setRunMsg]       = useState<Record<string, string>>({})
  const [dbMissing, setDbMissing] = useState(false)

  const [form, setForm] = useState<CreateScheduleInput>({
    name: '', report_type: 'compliance', schedule_cron: '0 8 * * 1',
    format: 'pdf', recipients: [], created_by: '',
  })
  const [recipientInput, setRecipientInput] = useState('')
  const [saving, setSaving]                 = useState(false)
  const [formErr, setFormErr]               = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const res = await intelApi.schedules.list()
      setSchedules(res.data ?? [])
      if ('message' in res && res.message) setDbMissing(true)
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleAdd = async () => {
    if (!form.name || !form.report_type || !form.schedule_cron) {
      setFormErr('Name, report type, and schedule are required.')
      return
    }
    setSaving(true); setFormErr(null)
    try {
      const res = await intelApi.schedules.create(form)
      if (res.success) {
        setShowForm(false)
        setForm({ name: '', report_type: 'compliance', schedule_cron: '0 8 * * 1', format: 'pdf', recipients: [] })
        await load()
      } else {
        setFormErr(res.error ?? 'Failed to create schedule.')
      }
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this schedule?')) return
    await intelApi.schedules.delete(id)
    await load()
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
          <p className="text-xs text-slate-500">Automate report generation and delivery to email recipients on a recurring schedule.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 transition">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
          <button onClick={() => setShowForm(v => !v)} className="flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-2 text-xs font-semibold text-white hover:bg-orange-600 transition">
            <Plus className="h-3.5 w-3.5" /> New Schedule
          </button>
        </div>
      </div>

      {/* DB warning */}
      {dbMissing && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800">
          <p className="font-semibold mb-0.5">Database not configured</p>
          Scheduled reports require PostgreSQL. Set <code className="font-mono">DATABASE_URL</code> in <code className="font-mono">server/.env</code>.
        </div>
      )}

      {/* Add form */}
      {showForm && (
        <div className="rounded-xl border border-slate-200/60 bg-white shadow-sm p-5">
          <h2 className="text-sm font-semibold text-slate-900 mb-4">New Scheduled Report</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">Report Name *</label>
              <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Weekly Compliance Report" className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs focus:outline-none focus:border-orange-400" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Report Type *</label>
              <select value={form.report_type} onChange={e => setForm(p => ({ ...p, report_type: e.target.value }))} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs focus:outline-none">
                {REPORT_TYPES.map(t => <option key={t} value={t}>{t.replace('-', ' ')}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Format</label>
              <select value={form.format} onChange={e => setForm(p => ({ ...p, format: e.target.value }))} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs focus:outline-none">
                {FORMATS.map(f => <option key={f} value={f}>{f.toUpperCase()}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">Schedule *</label>
              <div className="flex flex-wrap gap-2 mb-2">
                {CRON_PRESETS.map(p => (
                  <button key={p.value} onClick={() => setForm(f => ({ ...f, schedule_cron: p.value }))}
                    className={`rounded-full border px-3 py-1 text-xs transition ${form.schedule_cron === p.value ? 'border-orange-400 bg-orange-50 text-orange-700 font-semibold' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                    {p.label}
                  </button>
                ))}
              </div>
              <input value={form.schedule_cron} onChange={e => setForm(p => ({ ...p, schedule_cron: e.target.value }))} placeholder="0 8 * * 1" className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-mono focus:outline-none focus:border-orange-400" />
              <p className="text-[10px] text-slate-400 mt-1">5-field cron: minute hour day month weekday · e.g. "0 8 * * 1" = Monday 8am</p>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">Recipients</label>
              <div className="flex gap-2 mb-2">
                <input value={recipientInput} onChange={e => setRecipientInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && addRecipient()} placeholder="admin@company.com" className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs focus:outline-none focus:border-orange-400" />
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
            </div>
          </div>
          {formErr && <p className="mt-3 text-xs text-red-600">{formErr}</p>}
          <div className="mt-4 flex gap-2">
            <button onClick={handleAdd} disabled={saving} className="rounded-lg bg-orange-500 px-4 py-2 text-xs font-semibold text-white hover:bg-orange-600 disabled:opacity-60">
              {saving ? 'Saving…' : 'Create Schedule'}
            </button>
            <button onClick={() => setShowForm(false)} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50">Cancel</button>
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
                      {s.is_active ? 'Active' : 'Paused'}
                    </span>
                    <span className="rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-semibold text-teal-700 capitalize">{s.format.toUpperCase()}</span>
                  </div>
                  <p className="text-xs text-slate-500">
                    {s.report_type} · <code className="font-mono text-slate-600">{s.schedule_cron}</code>
                    {s.recipients?.length > 0 && ` · ${s.recipients.length} recipient${s.recipients.length !== 1 ? 's' : ''}`}
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
                  <button onClick={() => handleRunNow(s.id)} disabled={running === s.id} className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition">
                    <Play className="h-3 w-3" />{running === s.id ? 'Running…' : 'Run Now'}
                  </button>
                  <button onClick={() => handleDelete(s.id)} className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-red-600 hover:bg-red-100 transition">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
