import {
  Mail, Building2, Clock, Shield, Key, Activity, Database,
  CheckCircle2, AlertTriangle, Ticket,
} from 'lucide-react'
import type { AppUser, UserDetails, UserHealthScore, JiraTicket as JiraTicketType } from '../../types'
import { DashboardCard } from '../ui/DashboardCard'
import { InfoSection, InfoRow, SecRow, TabLoading, EmptyTabState } from './shared'
import { useToast } from '../ui/ToastProvider'

const SKU_LABELS: Record<string, string> = {
  SPE_E3: 'Microsoft 365 E3',
  SPE_E5: 'Microsoft 365 E5',
  O365_BUSINESS_PREMIUM: 'Microsoft 365 Business Premium',
  O365_BUSINESS_ESSENTIALS: 'Microsoft 365 Business Basic',
  ENTERPRISEPACK: 'Office 365 E3',
  ENTERPRISEPREMIUM: 'Office 365 E5',
  EMS: 'Enterprise Mobility + Security E3',
  EMSPREMIUM: 'Enterprise Mobility + Security E5',
  AAD_PREMIUM: 'Entra ID P1',
  AAD_PREMIUM_P2: 'Entra ID P2',
  INTUNE_A: 'Microsoft Intune Plan 1',
}

function jiraStatusColor(s: JiraTicketType['status']) {
  switch (s) {
    case 'Open':        return 'text-red-700 bg-red-50 border-red-200'
    case 'In Progress': return 'text-orange-700 bg-orange-50 border-orange-200'
    case 'Pending':     return 'text-amber-700 bg-amber-50 border-amber-200'
    case 'Resolved':    return 'text-emerald-700 bg-emerald-50 border-emerald-200'
  }
}

function NotYetTracked({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5">
      <span className="text-xs text-slate-500">{label}</span>
      <span className="text-[0.65rem] text-slate-400 italic">See Security tab</span>
    </div>
  )
}

export function OverviewTab({ user, details, loading, health }: { user: AppUser; details: UserDetails | null; loading: boolean; health: UserHealthScore }) {
  const { notify } = useToast()
  const copy = (val: string, label: string) => {
    navigator.clipboard.writeText(val).then(() => notify('success', 'Copied', `${label} copied`)).catch(() => {})
  }

  const openTickets = user.jiraTickets.filter(t => t.status !== 'Resolved')

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <DashboardCard title="Identity" icon={Mail} accentColor="#3b82f6">
        <InfoSection title="Directory" icon={Building2}>
          <InfoRow icon={Mail} label="Email / UPN" value={user.email} onCopy={() => copy(user.email, 'Email')} />
          <InfoRow icon={Building2} label="Department" value={user.department || '—'} />
          <InfoRow icon={Building2} label="Company" value={user.company ?? 'Zinnia Technologies'} />
          <InfoRow icon={Clock} label="Created" value={user.createdAt || '—'} />
          {user.employeeId && <InfoRow icon={Database} label="Employee ID" value={user.employeeId} />}
        </InfoSection>
      </DashboardCard>

      <DashboardCard title="Security" icon={Shield} accentColor="#ef4444">
        <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-slate-50">
          <SecRow label="MFA Enrollment" good={user.mfaEnabled} good_text="Enrolled" bad_text="Not Enrolled" icon={Key} />
          <SecRow label="Account Status" good={user.status === 'Active'} good_text="Active" bad_text={user.status} icon={Activity} />
          <NotYetTracked label="SSPR Registration" />
          <NotYetTracked label="Authentication Methods" />
        </div>
        {(details?.signIns.length ?? 0) > 0 && (
          <p className="mt-2 text-[0.65rem] text-slate-400 px-1">
            {details!.signIns.length} recent sign-in{details!.signIns.length !== 1 ? 's' : ''} — see Sign-in Analytics tab
          </p>
        )}
      </DashboardCard>

      <DashboardCard title="Licenses" icon={Database} accentColor="#a855f7">
        {loading ? <TabLoading /> : !details || details.licenses.length === 0 ? (
          <EmptyTabState icon={Database} title="No licenses" subtitle="No license assignments found for this user." />
        ) : (
          <div className="space-y-3">
            {details.licenses.map(l => {
              const name = SKU_LABELS[l.skuPartNumber] ?? l.skuPartNumber.replace(/_/g, ' ')
              const enabled = l.servicePlans.filter(p => p.provisioningStatus === 'Success')
              return (
                <div key={l.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-bold text-slate-800">{name}</p>
                  <p className="text-[0.65rem] text-slate-500 mt-0.5">{enabled.length} active service{enabled.length !== 1 ? 's' : ''}</p>
                </div>
              )
            })}
          </div>
        )}
      </DashboardCard>

      <DashboardCard title="Health" icon={Activity} accentColor={health.score >= 80 ? '#10b981' : health.score >= 60 ? '#f59e0b' : '#ef4444'}>
        <div className="space-y-2">
          {health.reasons.map(r => (
            <p key={r} className="flex items-center gap-2 text-xs text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0" />{r}</p>
          ))}
          {health.warnings.map(w => (
            <p key={w} className="flex items-center gap-2 text-xs text-amber-700"><AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />{w}</p>
          ))}
        </div>
      </DashboardCard>

      {user.jiraTickets.length > 0 && (
        <DashboardCard title="Open Tickets" icon={Ticket} accentColor="#f97316" className="lg:col-span-2">
          <div className="space-y-2">
            {openTickets.length === 0 ? (
              <p className="text-xs text-slate-400">No open tickets — {user.jiraTickets.length} resolved.</p>
            ) : openTickets.map(t => (
              <div key={t.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-800 truncate">{t.summary}</p>
                  <p className="text-[0.62rem] text-slate-400">{t.id} · {t.project}</p>
                </div>
                <span className={`flex-shrink-0 inline-flex items-center rounded-full border px-2 py-0.5 text-[0.6rem] font-semibold ${jiraStatusColor(t.status)}`}>{t.status}</span>
              </div>
            ))}
          </div>
        </DashboardCard>
      )}
    </div>
  )
}
