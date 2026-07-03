import { useState } from 'react'
import {
  ArrowLeft, Copy, RefreshCw, Download, ExternalLink,
  KeyRound, Unlock, Building2, MapPin, Briefcase, Hash,
} from 'lucide-react'
import type { AppUser, UserDetails, UserHealthScore } from '../../types'
import { useToast } from '../ui/ToastProvider'
import { Avatar, StatusBadge, RiskBadge } from './shared'

const ENTRA_OBJECT_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function HealthRing({ score }: { score: number }) {
  const color = score >= 80 ? '#10b981' : score >= 60 ? '#f59e0b' : '#ef4444'
  const circumference = 2 * Math.PI * 26
  const offset = circumference * (1 - score / 100)
  return (
    <div className="relative h-16 w-16 flex-shrink-0">
      <svg viewBox="0 0 64 64" className="h-16 w-16 -rotate-90">
        <circle cx="32" cy="32" r="26" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="6" />
        <circle cx="32" cy="32" r="26" fill="none" stroke={color} strokeWidth="6" strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={offset} className="transition-all duration-500" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-sm font-bold text-white leading-none">{score}</span>
        <span className="text-[0.5rem] text-slate-300 leading-none mt-0.5">/ 100</span>
      </div>
    </div>
  )
}

function QuickAction({ icon: Icon, label, onClick, href }: { icon: React.ElementType; label: string; onClick?: () => void; href?: string }) {
  const cls = 'inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-[0.68rem] font-semibold text-slate-200 hover:bg-white/10 hover:text-white transition whitespace-nowrap'
  if (href) {
    return <a href={href} target="_blank" rel="noopener noreferrer" className={cls}><Icon className="h-3 w-3" />{label}</a>
  }
  return <button type="button" onClick={onClick} className={cls}><Icon className="h-3 w-3" />{label}</button>
}

export function IntelligenceHeader({
  user, details, health, onBack, onRefresh, onExport, refreshing,
}: {
  user: AppUser
  details: UserDetails | null
  health: UserHealthScore
  onBack: () => void
  onRefresh: () => void
  onExport: () => void
  refreshing: boolean
}) {
  const { notify } = useToast()
  const [copied, setCopied] = useState(false)

  const copyUpn = () => {
    navigator.clipboard.writeText(user.email).then(() => {
      setCopied(true)
      notify('success', 'Copied', 'UPN copied to clipboard')
      setTimeout(() => setCopied(false), 1500)
    }).catch(() => {})
  }

  const notYetWired = (label: string) => {
    notify('info', label, 'Not yet connected to a live directory action — contact your Identity Admin to perform this.')
  }

  const isEntraObjectId = ENTRA_OBJECT_ID_RE.test(user.id)
  const entraUrl = isEntraObjectId
    ? `https://entra.microsoft.com/#view/Microsoft_AAD_UsersAndTenants/UserProfileMenuBlade/~/overview/userId/${user.id}`
    : undefined

  return (
    <div className="rounded-2xl border border-slate-800 bg-gradient-to-br from-[#141408] to-[#1e1e06] p-5 text-white">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-4 min-w-0">
          <button type="button" onClick={onBack} aria-label="Back to Users"
            className="mt-1 rounded-lg p-1.5 text-slate-300 hover:bg-white/10 hover:text-white transition flex-shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <Avatar user={user} size="xl" />
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-white truncate">{user.firstName} {user.lastName}</h1>
            <button type="button" onClick={copyUpn} className="group inline-flex items-center gap-1.5 text-xs text-slate-300 hover:text-white transition mt-0.5">
              <span className="truncate max-w-[220px]">{user.email}</span>
              <Copy className="h-3 w-3 flex-shrink-0" />
              {copied && <span className="text-emerald-400 text-[0.65rem]">Copied</span>}
            </button>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.7rem] text-slate-300">
              {user.title && <span className="inline-flex items-center gap-1"><Briefcase className="h-3 w-3" />{user.title}</span>}
              {user.department && <span className="inline-flex items-center gap-1"><Building2 className="h-3 w-3" />{user.department}</span>}
              {user.location && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{user.location}</span>}
              {user.employeeId && <span className="inline-flex items-center gap-1"><Hash className="h-3 w-3" />{user.employeeId}</span>}
              <span>{user.company ?? 'Zinnia Technologies'}</span>
            </div>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              <StatusBadge status={user.status} />
              <RiskBadge level={user.riskLevel} />
              <span className="inline-flex items-center rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[0.65rem] font-semibold text-slate-200">
                {details?.licenses.length ?? 0} license{(details?.licenses.length ?? 0) !== 1 ? 's' : ''}
              </span>
              <span className="inline-flex items-center rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[0.65rem] font-semibold text-slate-200">
                {details?.devices.length ?? 0} device{(details?.devices.length ?? 0) !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
        </div>

        <HealthRing score={health.score} />
      </div>

      <div className="mt-4 flex flex-wrap gap-2 border-t border-white/10 pt-4">
        <QuickAction icon={Copy} label="Copy UPN" onClick={copyUpn} />
        <QuickAction icon={RefreshCw} label={refreshing ? 'Refreshing…' : 'Refresh Data'} onClick={onRefresh} />
        <QuickAction icon={Download} label="Export Report" onClick={onExport} />
        {entraUrl && <QuickAction icon={ExternalLink} label="Open in Entra Portal" href={entraUrl} />}
        <QuickAction icon={ExternalLink} label="Open in Intune" href="https://intune.microsoft.com" />
        <QuickAction icon={KeyRound} label="Reset Password" onClick={() => notYetWired('Reset Password')} />
        <QuickAction icon={Unlock} label="Unlock Account" onClick={() => notYetWired('Unlock Account')} />
      </div>
    </div>
  )
}
