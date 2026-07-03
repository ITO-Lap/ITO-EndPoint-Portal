// Shared badges, style helpers, and small presentational components used by
// both the Users list table (UsersPage.tsx) and the User Intelligence page.
import { Laptop2, Monitor, ShieldCheck, LifeBuoy, Users, Copy as CopyIcon, CheckCircle2, X } from 'lucide-react'
import type { UserToolRole, UserStatus, UserRiskLevel, AppUser } from '../../types'

// ─── style helpers ────────────────────────────────────────────────────────────

export function roleCfg(role: UserToolRole) {
  switch (role) {
    case 'Global Admin': return { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-200', icon: Users }
    case 'IT Admin':     return { bg: 'bg-lime-100', text: 'text-lime-700', border: 'border-lime-200', icon: ShieldCheck }
    case 'Helpdesk':     return { bg: 'bg-slate-100', text: 'text-slate-600', border: 'border-slate-200', icon: LifeBuoy }
    case 'End User':     return { bg: 'bg-slate-50', text: 'text-slate-500', border: 'border-slate-200', icon: Users }
  }
}

export function statusCfg(status: UserStatus) {
  switch (status) {
    case 'Active':    return { dot: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' }
    case 'Inactive':  return { dot: 'bg-slate-400', text: 'text-slate-600', bg: 'bg-slate-50', border: 'border-slate-200' }
    case 'Suspended': return { dot: 'bg-red-500', text: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200' }
  }
}

export function riskCfg(level: UserRiskLevel) {
  switch (level) {
    case 'Critical': return { color: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200', bar: 'bg-red-500', pct: 95 }
    case 'High':     return { color: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-200', bar: 'bg-orange-500', pct: 70 }
    case 'Medium':   return { color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200', bar: 'bg-amber-500', pct: 45 }
    case 'Low':      return { color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200', bar: 'bg-emerald-500', pct: 12 }
  }
}

// ─── small components ─────────────────────────────────────────────────────────

export function Avatar({ user, size = 'md' }: { user: AppUser; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  const initials = `${user.firstName[0]}${user.lastName[0]}`
  const colors = [
    'bg-orange-500', 'bg-lime-500', 'bg-emerald-500', 'bg-orange-500',
    'bg-pink-500', 'bg-teal-500', 'bg-lime-500', 'bg-rose-500',
  ]
  const color = colors[(user.firstName.charCodeAt(0) + user.lastName.charCodeAt(0)) % colors.length]
  const sizes = { sm: 'h-7 w-7 text-[0.6rem]', md: 'h-8 w-8 text-xs', lg: 'h-11 w-11 text-sm', xl: 'h-16 w-16 text-lg' }
  return (
    <div className={`${sizes[size]} ${color} rounded-full flex items-center justify-center font-bold text-white flex-shrink-0`}>
      {initials}
    </div>
  )
}

export function RoleBadge({ role }: { role: UserToolRole }) {
  const c = roleCfg(role)
  const Icon = c.icon
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.65rem] font-semibold ${c.bg} ${c.text} ${c.border}`}>
      <Icon className="h-2.5 w-2.5" />{role}
    </span>
  )
}

export function StatusBadge({ status }: { status: UserStatus }) {
  const c = statusCfg(status)
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[0.65rem] font-semibold ${c.bg} ${c.text} ${c.border}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />{status}
    </span>
  )
}

export function RiskBadge({ level }: { level: UserRiskLevel }) {
  const c = riskCfg(level)
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.65rem] font-bold ${c.bg} ${c.color} ${c.border}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${c.bar}`} />{level}
    </span>
  )
}

export function ComplianceDot({ state }: { state: string }) {
  const color = state === 'Compliant' ? 'bg-emerald-500' : state === 'Warning' ? 'bg-amber-500' : 'bg-red-500'
  return <span className={`inline-block h-2 w-2 rounded-full ${color} flex-shrink-0`} title={state} />
}

export function PlatformIcon({ platform }: { platform: string }) {
  const Icon = platform === 'macOS' ? Monitor : Laptop2
  return <Icon className="h-3.5 w-3.5" />
}

export function TabLoading() {
  return (
    <div className="flex flex-col items-center justify-center py-14">
      <svg className="h-5 w-5 text-slate-400 animate-spin mb-2" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-30" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
      <p className="text-xs text-slate-400">Loading…</p>
    </div>
  )
}

export function EmptyTabState({ icon: Icon, title, subtitle }: { icon: React.ElementType; title: string; subtitle: string }) {
  return (
    <div className="flex flex-col items-center py-12 text-center">
      <div className="rounded-full bg-slate-100 p-4 mb-3"><Icon className="h-6 w-6 text-slate-300" /></div>
      <p className="text-sm font-semibold text-slate-500">{title}</p>
      <p className="text-xs text-slate-400 mt-1 max-w-[220px]">{subtitle}</p>
    </div>
  )
}

export function InfoSection({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Icon className="h-3.5 w-3.5 text-orange-600" />
        <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wide">{title}</h3>
      </div>
      <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-slate-50">
        {children}
      </div>
    </div>
  )
}

export function InfoRow({ icon: Icon, label, value, onCopy }: { icon: React.ElementType; label: string; value: string; onCopy?: () => void }) {
  return (
    <div className="group flex items-center justify-between gap-3 px-4 py-2.5">
      <div className="flex items-center gap-2 flex-shrink-0">
        <Icon className="h-3.5 w-3.5 text-slate-400" />
        <span className="text-[0.68rem] text-slate-500">{label}</span>
      </div>
      <div className="flex items-center gap-1 min-w-0">
        <span className="text-[0.72rem] font-medium text-slate-800 text-right truncate">{value}</span>
        {onCopy && (
          <CopyButton onCopy={onCopy} />
        )}
      </div>
    </div>
  )
}

function CopyButton({ onCopy }: { onCopy: () => void }) {
  return (
    <button type="button" onClick={onCopy} aria-label="Copy" title="Copy" className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 rounded p-0.5 text-slate-400 hover:text-orange-600 hover:bg-orange-50 transition flex-shrink-0">
      <CopyIcon className="h-2.5 w-2.5" />
    </button>
  )
}

export function SecRow({ label, good, good_text, bad_text, icon: Icon }: { label: string; good: boolean; good_text: string; bad_text: string; icon: React.ElementType }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5">
      <div className="flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 text-slate-400" />
        <span className="text-xs text-slate-600">{label}</span>
      </div>
      <span className={`inline-flex items-center gap-1 text-[0.68rem] font-semibold ${good ? 'text-emerald-700' : 'text-red-600'}`}>
        {good ? <CheckCircle2 className="h-3 w-3" /> : <X className="h-3 w-3" />}
        {good ? good_text : bad_text}
      </span>
    </div>
  )
}
