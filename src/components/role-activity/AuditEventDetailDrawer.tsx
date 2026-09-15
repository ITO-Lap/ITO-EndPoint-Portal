import { useState } from 'react'
import { X, Copy, Check } from 'lucide-react'
import type { RoleActivityEvent } from '../../api/roleActivity'
import { SOURCE_LABELS } from '../../api/roleActivity'
import { formatInTimezone, formatUtc } from '../../lib/timezone'

interface Props {
  event: RoleActivityEvent | null
  timezone: string
  onClose: () => void
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      title={`Copy ${label}`}
      aria-label={`Copy ${label}`}
      onClick={() => { void navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
      className="inline-flex items-center rounded p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition focus-visible:ring-2 focus-visible:ring-orange-300"
    >
      {copied ? <Check className="h-3 w-3 text-emerald-600" aria-hidden="true" /> : <Copy className="h-3 w-3" aria-hidden="true" />}
    </button>
  )
}

function Field({ label, value, copyable }: { label: string; value: string | null | undefined; copyable?: boolean }) {
  if (!value) return null
  return (
    <div className="flex items-start justify-between gap-2 py-1.5 border-b border-slate-100 last:border-b-0">
      <span className="text-[0.68rem] font-medium text-slate-500 flex-shrink-0">{label}</span>
      <span className="text-xs text-slate-800 text-right break-all flex items-center gap-1">
        {value}
        {copyable && <CopyButton value={value} label={label} />}
      </span>
    </div>
  )
}

export function AuditEventDetailDrawer({ event, timezone, onClose }: Props) {
  if (!event) return null

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button type="button" aria-label="Close details" className="absolute inset-0 bg-slate-900/25" onClick={onClose} />
      <div className="relative z-10 h-full w-full sm:w-[480px] bg-white shadow-2xl overflow-y-auto animate-slide-up sm:animate-none">
        <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-800">Role Activity Event Detail</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-1.5 hover:bg-slate-100 transition focus-visible:ring-2 focus-visible:ring-orange-300">
            <X className="h-4 w-4 text-slate-500" aria-hidden="true" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-5">
          <section>
            <h3 className="text-[0.68rem] font-semibold uppercase text-slate-400 mb-1">Event</h3>
            <Field label="Event ID" value={event.id} copyable />
            <Field label="Source" value={SOURCE_LABELS[event.source]} />
            <Field label="Source record ID" value={event.sourceRecordId} copyable />
            <Field label="Operation" value={event.operation} />
            <Field label="Actor" value={event.actor} copyable />
            <Field label="Target" value={event.target} copyable />
            <Field label="Time (UTC)" value={formatUtc(new Date(event.occurredAt))} />
            <Field label={`Time (${timezone})`} value={formatInTimezone(new Date(event.occurredAt), timezone)} />
          </section>

          <section>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-[0.68rem] font-semibold uppercase text-slate-400">Raw record</h3>
              <CopyButton value={JSON.stringify(event.rawJson, null, 2)} label="raw JSON" />
            </div>
            <p className="text-[0.65rem] text-slate-400 mb-2">
              The full, unmodified record as retrieved from the source API — preserved verbatim for audit fidelity.
              Live-queried directly from the source on each browse; not read from a stored copy.
            </p>
            <pre className="rounded-lg bg-slate-900 text-slate-100 p-3 text-[0.65rem] overflow-x-auto max-h-96">
              {JSON.stringify(event.rawJson, null, 2)}
            </pre>
          </section>
        </div>
      </div>
    </div>
  )
}
