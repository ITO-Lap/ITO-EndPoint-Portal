import type { ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, Loader2, ShieldAlert, XCircle } from 'lucide-react'
import { Badge } from '../ui/Badge'
import type { BadgeVariant } from '../../types'
import type { DeviceState, GraphClass, JobStatus, Risk } from '../../api/remoteActions'

import { RISK_VARIANT } from './helpers'
export const RiskBadge = ({ risk }: { risk: Risk }) => <Badge label={`${risk.charAt(0).toUpperCase()}${risk.slice(1)} risk`} variant={RISK_VARIANT[risk]} showDot />

const GRAPH_CLASS: Record<GraphClass, { label: string; v: BadgeVariant }> = {
  read_only: { label: 'Read-only', v: 'green' }, change: { label: 'Change request', v: 'yellow' }, destructive: { label: 'Destructive', v: 'orange' }, blocked: { label: 'Blocked', v: 'red' },
}
export const GraphClassBadge = ({ c }: { c: GraphClass }) => <Badge label={GRAPH_CLASS[c].label} variant={GRAPH_CLASS[c].v} showDot />

const JOB_LABEL: Record<JobStatus, [string, BadgeVariant]> = {
  draft: ['Draft', 'gray'], pending_approval: ['Awaiting approval', 'yellow'], approved: ['Approved', 'blue'], rejected: ['Rejected', 'red'], scheduled: ['Scheduled', 'blue'],
  queued: ['Queued', 'blue'], running: ['Running', 'blue'], completed: ['Completed', 'green'], completed_with_failures: ['Completed with failures', 'orange'], failed: ['Failed', 'red'], cancelled: ['Cancelled', 'gray'],
}
export const JobBadge = ({ s }: { s: JobStatus }) => <Badge label={JOB_LABEL[s][0]} variant={JOB_LABEL[s][1]} />

// Exactly the states a provider/app can truthfully report — no "% complete" unless the script supplied it.
const DEVICE_LABEL: Record<DeviceState, [string, BadgeVariant]> = {
  queued: ['Queued', 'gray'], waiting_online: ['Waiting for device to come online', 'yellow'], sent: ['Sent to provider', 'blue'], provider_accepted: ['Provider accepted', 'blue'], running: ['Running', 'blue'],
  succeeded: ['Succeeded', 'green'], failed: ['Failed', 'red'], timed_out: ['Timed out', 'red'], skipped: ['Skipped', 'gray'], cancelled: ['Cancelled', 'gray'],
}
export const DeviceBadge = ({ s }: { s: DeviceState }) => <Badge label={DEVICE_LABEL[s][0]} variant={DEVICE_LABEL[s][1]} />

export const Card = ({ title, action, children, className = '' }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) => (
  <section className={`rounded-2xl border border-slate-200 bg-white p-4 ${className}`}>
    {(title || action) && <div className="mb-2 flex items-center justify-between gap-2">{title && <h2 className="text-sm font-bold text-slate-800">{title}</h2>}{action}</div>}
    {children}
  </section>
)

export const ErrorBanner = ({ message, onClose }: { message: string | null; onClose?: () => void }) => message ? (
  <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" /><span className="flex-1">{message}</span>
    {onClose && <button type="button" onClick={onClose} className="font-bold" aria-label="Dismiss">×</button>}
  </div>
) : null

export const Notice = ({ tone = 'info', children }: { tone?: 'info' | 'warn' | 'ok' | 'danger'; children: ReactNode }) => {
  const c = { info: 'border-sky-200 bg-sky-50 text-sky-900', warn: 'border-amber-200 bg-amber-50 text-amber-900', ok: 'border-emerald-200 bg-emerald-50 text-emerald-900', danger: 'border-red-200 bg-red-50 text-red-800' }[tone]
  const Icon = tone === 'ok' ? CheckCircle2 : tone === 'danger' ? XCircle : tone === 'warn' ? ShieldAlert : AlertTriangle
  return <div className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-xs ${c}`}><Icon className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" /><div className="flex-1">{children}</div></div>
}

export const Loading = ({ label = 'Loading…' }: { label?: string }) => <p className="text-xs text-slate-500"><Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" />{label}</p>
export const Empty = ({ children }: { children: ReactNode }) => <p className="rounded-xl border border-dashed border-slate-300 px-3 py-6 text-center text-xs text-slate-500">{children}</p>

/** Output from devices/Graph is untrusted text: always rendered as text (never as HTML) inside a scrollable pre. */
export const Pre = ({ children, max = 'max-h-72' }: { children: ReactNode; max?: string }) => <pre className={`${max} overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate-900 p-3 text-[0.7rem] leading-relaxed text-slate-100`}>{children}</pre>
