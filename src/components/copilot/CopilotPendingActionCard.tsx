import { AlertTriangle, CheckCircle2, XCircle, Loader2, Ban } from 'lucide-react'
import type { CopilotPendingAction } from '../../api/copilot'

export type PendingActionStatus = 'pending' | 'executed' | 'failed' | 'rejected' | 'forbidden'

interface Props {
  action: CopilotPendingAction
  status: PendingActionStatus
  resultMessage?: string
  busy?: boolean
  onConfirm: () => void
  onReject: () => void
}

function ArgsPreview({ args }: { args: Record<string, unknown> }) {
  const entries = Object.entries(args)
  if (entries.length === 0) return null
  return (
    <dl className="mt-2 space-y-1 rounded-lg bg-white/60 border border-amber-200/70 px-2.5 py-2">
      {entries.map(([key, value]) => (
        <div key={key} className="flex gap-2 text-[0.7rem] leading-snug">
          <dt className="flex-shrink-0 font-semibold text-amber-800">{key}:</dt>
          <dd className="min-w-0 break-words text-amber-700">
            {typeof value === 'string' ? value : JSON.stringify(value)}
          </dd>
        </div>
      ))}
    </dl>
  )
}

const STATUS_META: Record<Exclude<PendingActionStatus, 'pending'>, { icon: typeof CheckCircle2; wrap: string; text: string; label: string }> = {
  executed: { icon: CheckCircle2, wrap: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700', label: 'Executed' },
  failed:   { icon: XCircle,      wrap: 'bg-red-50 border-red-200',         text: 'text-red-700',     label: 'Failed' },
  rejected: { icon: Ban,          wrap: 'bg-slate-100 border-slate-200',    text: 'text-slate-500',   label: 'Rejected' },
  forbidden:{ icon: XCircle,      wrap: 'bg-red-50 border-red-200',         text: 'text-red-700',     label: 'Not permitted' },
}

export function CopilotPendingActionCard({ action, status, resultMessage, busy, onConfirm, onReject }: Props) {
  if (status !== 'pending') {
    const meta = STATUS_META[status]
    const Icon = meta.icon
    return (
      <div className={`rounded-xl border px-3.5 py-3 text-xs ${meta.wrap}`}>
        <div className={`flex items-center gap-1.5 font-semibold ${meta.text}`}>
          <Icon className="h-3.5 w-3.5 flex-shrink-0" />
          {meta.label} — {action.summary}
        </div>
        {resultMessage && <p className="mt-1.5 text-slate-600">{resultMessage}</p>}
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-3">
      <div className="flex items-center gap-1.5 text-xs font-bold text-amber-800">
        <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
        Confirmation required
      </div>
      <p className="mt-1 text-xs font-medium text-amber-800">{action.summary}</p>
      <p className="mt-0.5 text-[0.65rem] uppercase tracking-wide text-amber-600 font-semibold">{action.toolName}</p>
      <ArgsPreview args={action.argsPreview} />
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className="flex items-center gap-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50"
        >
          {busy && <Loader2 className="h-3 w-3 animate-spin" />}
          Confirm
        </button>
        <button
          type="button"
          onClick={onReject}
          disabled={busy}
          className="rounded-lg border border-amber-300 bg-white/70 hover:bg-white px-3 py-1.5 text-xs font-semibold text-amber-700 transition disabled:opacity-50"
        >
          Reject
        </button>
      </div>
    </div>
  )
}
