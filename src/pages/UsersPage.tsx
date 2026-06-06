import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import {
  Search, X, ChevronUp, ChevronDown, ChevronsUpDown,
  UserPlus, Mail, Phone, MapPin, Globe, Building2,
  ShieldCheck, ShieldAlert, CheckCircle2,
  Lock, Unlock, Laptop2, Monitor, Clock, Activity,
  Shield, RefreshCw, ChevronLeft, ChevronRight,
  Filter, Layers, LifeBuoy, Users, Key, LogIn, LogOut,
  Zap, Edit2, Ban, RotateCcw, Copy,
  Cloud, Smartphone, Ticket, Database,
} from 'lucide-react'
import { useToast } from '../components/ui/ToastProvider'
import { api } from '../api'
import type { UserDetails } from '../api'
import type { AppUser, UserToolRole, UserStatus, UserRiskLevel, JiraTicket } from '../types'

// ─── constants ───────────────────────────────────────────────────────────────

type SortKey = 'firstName' | 'email' | 'toolRole' | 'department' | 'status' | 'lastActive' | 'riskLevel'
type SortDir = 'asc' | 'desc' | null
type DrawerTab = 'profile' | 'signins' | 'roles' | 'groups' | 'apps' | 'licenses' | 'devices' | 'jira'

const ROLE_ORDER: Record<UserToolRole, number> = { 'Global Admin': 0, 'IT Admin': 1, 'Helpdesk': 2, 'End User': 3 }
const RISK_ORDER: Record<UserRiskLevel, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 }

// ─── style helpers ────────────────────────────────────────────────────────────

function roleCfg(role: UserToolRole) {
  switch (role) {
    case 'Global Admin': return { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-200', icon: Layers }
    case 'IT Admin':     return { bg: 'bg-lime-100', text: 'text-lime-700', border: 'border-lime-200', icon: ShieldCheck }
    case 'Helpdesk':     return { bg: 'bg-slate-100', text: 'text-slate-600', border: 'border-slate-200', icon: LifeBuoy }
    case 'End User':     return { bg: 'bg-slate-50', text: 'text-slate-500', border: 'border-slate-200', icon: Users }
  }
}

function statusCfg(status: UserStatus) {
  switch (status) {
    case 'Active':    return { dot: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' }
    case 'Inactive':  return { dot: 'bg-slate-400', text: 'text-slate-600', bg: 'bg-slate-50', border: 'border-slate-200' }
    case 'Suspended': return { dot: 'bg-red-500', text: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200' }
  }
}

function riskCfg(level: UserRiskLevel) {
  switch (level) {
    case 'Critical': return { color: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200', bar: 'bg-red-500', pct: 95 }
    case 'High':     return { color: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-200', bar: 'bg-orange-500', pct: 70 }
    case 'Medium':   return { color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200', bar: 'bg-amber-500', pct: 45 }
    case 'Low':      return { color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200', bar: 'bg-emerald-500', pct: 12 }
  }
}

// ─── small components ─────────────────────────────────────────────────────────

function Avatar({ user, size = 'md' }: { user: AppUser; size?: 'sm' | 'md' | 'lg' }) {
  const initials = `${user.firstName[0]}${user.lastName[0]}`
  const colors = [
    'bg-orange-500', 'bg-lime-500', 'bg-emerald-500', 'bg-orange-500',
    'bg-pink-500', 'bg-teal-500', 'bg-lime-500', 'bg-rose-500',
  ]
  const color = colors[(user.firstName.charCodeAt(0) + user.lastName.charCodeAt(0)) % colors.length]
  const sizes = { sm: 'h-7 w-7 text-[0.6rem]', md: 'h-8 w-8 text-xs', lg: 'h-11 w-11 text-sm' }
  return (
    <div className={`${sizes[size]} ${color} rounded-full flex items-center justify-center font-bold text-white flex-shrink-0`}>
      {initials}
    </div>
  )
}

function RoleBadge({ role }: { role: UserToolRole }) {
  const c = roleCfg(role)
  const Icon = c.icon
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.65rem] font-semibold ${c.bg} ${c.text} ${c.border}`}>
      <Icon className="h-2.5 w-2.5" />{role}
    </span>
  )
}

function StatusBadge({ status }: { status: UserStatus }) {
  const c = statusCfg(status)
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[0.65rem] font-semibold ${c.bg} ${c.text} ${c.border}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />{status}
    </span>
  )
}

function RiskBadge({ level }: { level: UserRiskLevel }) {
  const c = riskCfg(level)
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.65rem] font-bold ${c.bg} ${c.color} ${c.border}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${c.bar}`} />{level}
    </span>
  )
}

function ComplianceDot({ state }: { state: string }) {
  const color = state === 'Compliant' ? 'bg-emerald-500' : state === 'Warning' ? 'bg-amber-500' : 'bg-red-500'
  return <span className={`inline-block h-2 w-2 rounded-full ${color} flex-shrink-0`} title={state} />
}

function PlatformIcon({ platform }: { platform: string }) {
  const Icon = platform === 'macOS' ? Monitor : Laptop2
  return <Icon className="h-3.5 w-3.5" />
}

// ─── Stats Strip ─────────────────────────────────────────────────────────────

function StatStrip({ users }: { users: AppUser[] }) {
  const total = users.length
  const active = users.filter(u => u.status === 'Active').length
  const itStaff = users.filter(u => u.toolRole !== 'End User').length
  const endUsers = users.filter(u => u.toolRole === 'End User').length
  const noMfa = users.filter(u => !u.mfaEnabled && u.status === 'Active').length
  const atRisk = users.filter(u => u.riskLevel === 'High' || u.riskLevel === 'Critical').length

  const stats = [
    { label: 'Total Users', value: total, icon: Users, color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-100' },
    { label: 'Active', value: active, icon: Activity, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100' },
    { label: 'IT Staff', value: itStaff, icon: Shield, color: 'text-lime-600', bg: 'bg-lime-50', border: 'border-lime-100' },
    { label: 'End Users', value: endUsers, icon: Laptop2, color: 'text-slate-600', bg: 'bg-slate-50', border: 'border-slate-100' },
    { label: 'MFA Disabled', value: noMfa, icon: Unlock, color: noMfa > 0 ? 'text-amber-600' : 'text-emerald-600', bg: noMfa > 0 ? 'bg-amber-50' : 'bg-emerald-50', border: noMfa > 0 ? 'border-amber-100' : 'border-emerald-100' },
    { label: 'At Risk', value: atRisk, icon: ShieldAlert, color: atRisk > 0 ? 'text-red-600' : 'text-emerald-600', bg: atRisk > 0 ? 'bg-red-50' : 'bg-emerald-50', border: atRisk > 0 ? 'border-red-100' : 'border-emerald-100' },
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {stats.map(s => {
        const Icon = s.icon
        return (
          <div key={s.label} className={`rounded-2xl border ${s.border} ${s.bg} px-4 py-3 flex items-center gap-3`}>
            <div className={`rounded-xl p-2 bg-white/70 border ${s.border}`}>
              <Icon className={`h-4 w-4 ${s.color}`} />
            </div>
            <div>
              <p className="text-lg font-bold text-slate-900 leading-none">{s.value}</p>
              <p className="text-[0.62rem] text-slate-500 mt-0.5 font-medium">{s.label}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Invite User Modal ────────────────────────────────────────────────────────

function InviteUserModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { notify } = useToast()
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', department: '', title: '', role: 'End User' as UserToolRole })
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])

  useEffect(() => { if (open) { ref.current?.focus(); setSent(false); setForm({ firstName: '', lastName: '', email: '', department: '', title: '', role: 'End User' }) } }, [open])

  const handleSend = async () => {
    if (!form.email || !form.firstName) return
    setLoading(true)
    await new Promise(r => setTimeout(r, 1500))
    setLoading(false)
    setSent(true)
    notify('success', 'Invitation Sent', `Invite sent to ${form.email}`)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal aria-label="Invite User"
        className="relative z-10 w-full max-w-md bg-white rounded-2xl shadow-2xl shadow-slate-950/20 overflow-hidden outline-none">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-[#141408] to-[#1e1e06]">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-white/10 p-2"><UserPlus className="h-4 w-4 text-white" /></div>
            <h2 className="text-sm font-bold text-white">Invite New User</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-1.5 text-slate-300 hover:bg-white/10 transition"><X className="h-4 w-4" /></button>
        </div>

        <div className="p-6">
          {sent ? (
            <div className="flex flex-col items-center py-6 text-center">
              <div className="rounded-full bg-emerald-100 p-4 mb-3"><CheckCircle2 className="h-7 w-7 text-emerald-600" /></div>
              <p className="text-sm font-bold text-slate-800">Invitation Sent!</p>
              <p className="text-xs text-slate-500 mt-1">An invite link has been sent to <span className="font-medium text-slate-700">{form.email}</span></p>
              <p className="text-[0.65rem] text-slate-400 mt-3">The link expires in 48 hours.</p>
              <button type="button" onClick={onClose} className="mt-5 rounded-xl bg-orange-600 px-5 py-2 text-xs font-semibold text-white hover:bg-orange-700 transition">Done</button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[0.68rem] font-semibold text-slate-600 mb-1">First Name *</label>
                  <input value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))}
                    placeholder="John" className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs text-slate-800 placeholder:text-slate-400 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-400/20" />
                </div>
                <div>
                  <label className="block text-[0.68rem] font-semibold text-slate-600 mb-1">Last Name</label>
                  <input value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))}
                    placeholder="Doe" className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs text-slate-800 placeholder:text-slate-400 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-400/20" />
                </div>
              </div>
              <div>
                <label className="block text-[0.68rem] font-semibold text-slate-600 mb-1">Work Email *</label>
                <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="john@company.com" className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs text-slate-800 placeholder:text-slate-400 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-400/20" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[0.68rem] font-semibold text-slate-600 mb-1">Department</label>
                  <input value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))}
                    placeholder="Engineering" className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs text-slate-800 placeholder:text-slate-400 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-400/20" />
                </div>
                <div>
                  <label className="block text-[0.68rem] font-semibold text-slate-600 mb-1">Title</label>
                  <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                    placeholder="Software Engineer" className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs text-slate-800 placeholder:text-slate-400 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-400/20" />
                </div>
              </div>
              <div>
                <label className="block text-[0.68rem] font-semibold text-slate-600 mb-1">Tool Access Level</label>
                <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value as UserToolRole }))}
                  className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs text-slate-700 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-400/20">
                  <option value="End User">End User (no tool access)</option>
                  <option value="Helpdesk">Helpdesk (read-only + sync)</option>
                  <option value="IT Admin">IT Admin (operational access)</option>
                  <option value="Global Admin">Global Admin (full access)</option>
                </select>
                {form.role === 'Global Admin' && (
                  <p className="mt-1 text-[0.62rem] text-amber-600 font-medium">Global Admin has unrestricted access to all settings and data.</p>
                )}
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition">Cancel</button>
                <button type="button" onClick={handleSend} disabled={!form.email || !form.firstName || loading}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-orange-600 px-4 py-2 text-xs font-semibold text-white hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition">
                  {loading ? <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-30" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg> : <Mail className="h-3 w-3" />}
                  {loading ? 'Sending…' : 'Send Invite'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Edit User Modal ──────────────────────────────────────────────────────────

function EditUserModal({ user, open, onClose }: { user: AppUser | null; open: boolean; onClose: () => void }) {
  const { notify } = useToast()
  const [role, setRole] = useState<UserToolRole>('End User')
  const [status, setStatus] = useState<UserStatus>('Active')
  const [saving, setSaving] = useState(false)
  const [mfaResetting, setMfaResetting] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])

  useEffect(() => {
    if (user) { setRole(user.toolRole); setStatus(user.status); ref.current?.focus() }
  }, [user])

  if (!open || !user) return null

  const handleSave = async () => {
    setSaving(true)
    await new Promise(r => setTimeout(r, 1200))
    setSaving(false)
    notify('success', 'User Updated', `${user.firstName} ${user.lastName} has been updated`)
    onClose()
  }

  const handleMfaReset = async () => {
    setMfaResetting(true)
    await new Promise(r => setTimeout(r, 1000))
    setMfaResetting(false)
    notify('success', 'MFA Reset', `MFA enrollment reset for ${user.firstName} ${user.lastName}`)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal aria-label="Edit User"
        className="relative z-10 w-full max-w-md bg-white rounded-2xl shadow-2xl shadow-slate-950/20 overflow-hidden outline-none">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-[#141408] to-[#1e1e06]">
          <div className="flex items-center gap-3">
            <Avatar user={user} size="sm" />
            <div>
              <h2 className="text-sm font-bold text-white">{user.firstName} {user.lastName}</h2>
              <p className="text-[0.65rem] text-slate-300">{user.email}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-1.5 text-slate-300 hover:bg-white/10 transition"><X className="h-4 w-4" /></button>
        </div>

        <div className="p-6 space-y-4">
          {/* Role */}
          <div>
            <label className="block text-[0.68rem] font-semibold text-slate-600 mb-1">Tool Access Level</label>
            <select value={role} onChange={e => setRole(e.target.value as UserToolRole)}
              className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs text-slate-700 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-400/20">
              <option value="End User">End User (no tool access)</option>
              <option value="Helpdesk">Helpdesk (read-only + sync)</option>
              <option value="IT Admin">IT Admin (operational access)</option>
              <option value="Global Admin">Global Admin (full access)</option>
            </select>
          </div>

          {/* Status */}
          <div>
            <label className="block text-[0.68rem] font-semibold text-slate-600 mb-1">Account Status</label>
            <div className="grid grid-cols-3 gap-2">
              {(['Active', 'Inactive', 'Suspended'] as UserStatus[]).map(s => {
                const c = statusCfg(s)
                return (
                  <button key={s} type="button" onClick={() => setStatus(s)}
                    className={`rounded-lg border py-2 text-xs font-semibold transition ${status === s ? `${c.bg} ${c.text} ${c.border}` : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
                    {s}
                  </button>
                )
              })}
            </div>
            {status === 'Suspended' && (
              <p className="mt-1.5 text-[0.62rem] text-red-600 font-medium">Suspending will immediately revoke all active sessions.</p>
            )}
          </div>

          {/* MFA + Sessions */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 divide-y divide-slate-200">
            <div className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-xs font-semibold text-slate-700">MFA Status</p>
                <p className="text-[0.65rem] text-slate-500 mt-0.5">{user.mfaEnabled ? 'Currently enrolled' : 'Not enrolled'}</p>
              </div>
              <button type="button" onClick={handleMfaReset} disabled={mfaResetting}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50 transition">
                {mfaResetting ? <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-30" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg> : <RotateCcw className="h-3 w-3" />}
                Reset MFA
              </button>
            </div>
            <div className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-xs font-semibold text-slate-700">Active Sessions</p>
                <p className="text-[0.65rem] text-slate-500 mt-0.5">Force sign-out all devices</p>
              </div>
              <button type="button" onClick={() => notify('success', 'Sessions Revoked', `All sessions for ${user.firstName} have been revoked`)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition">
                <LogOut className="h-3 w-3" />Revoke All
              </button>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition">Cancel</button>
            <button type="button" onClick={handleSave} disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-xl bg-orange-600 px-4 py-2 text-xs font-semibold text-white hover:bg-orange-700 disabled:opacity-50 transition">
              {saving ? <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-30" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg> : null}
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Drawer tab contents ──────────────────────────────────────────────────────

function ProfileTab({ user, viewerRole }: { user: AppUser; viewerRole: UserToolRole }) {
  const { notify } = useToast()
  const isHelpdesk = viewerRole === 'Helpdesk'
  const rc = riskCfg(user.riskLevel)

  const copy = (val: string, label: string) => {
    navigator.clipboard.writeText(val).then(() => notify('success', 'Copied', `${label} copied`)).catch(() => {})
  }

  return (
    <div className="space-y-5">
      {/* Identity card */}
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-4">
        <div className="flex items-center gap-4">
          <Avatar user={user} size="lg" />
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-bold text-slate-900">{user.firstName} {user.lastName}</h3>
            <p className="text-xs text-slate-500">{user.title} · {user.department}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <RoleBadge role={user.toolRole} />
              <StatusBadge status={user.status} />
              <RiskBadge level={user.riskLevel} />
            </div>
          </div>
        </div>

        {/* Risk bar */}
        <div className="mt-4 rounded-xl border border-slate-200 bg-white px-4 py-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[0.65rem] font-semibold text-slate-500 uppercase tracking-wide">User Risk Score</span>
            <span className={`text-xs font-bold ${rc.color}`}>{user.riskLevel}</span>
          </div>
          <div className="h-2 w-full rounded-full bg-slate-100">
            <div className={`h-2 rounded-full ${rc.bar} transition-all`} style={{ width: `${rc.pct}%` }} />
          </div>
          <p className="mt-1.5 text-[0.62rem] text-slate-400">
            {user.riskLevel === 'Critical' ? 'Critical violations detected — immediate action required'
              : user.riskLevel === 'High' ? 'High risk — non-compliant device and/or missing MFA'
              : user.riskLevel === 'Medium' ? 'Moderate risk — review device compliance and MFA enrollment'
              : 'Low risk — device compliant and security posture healthy'}
          </p>
        </div>
      </div>

      {/* Contact info */}
      <InfoSection title="Contact Information" icon={Mail}>
        <InfoRow icon={Mail} label="Email" value={user.email} onCopy={() => copy(user.email, 'Email')} />
        <InfoRow icon={Phone} label="Phone" value={user.phone} onCopy={() => copy(user.phone, 'Phone')} />
        <InfoRow icon={MapPin} label="Location" value={user.location} />
        <InfoRow icon={Globe} label="Timezone" value={user.timezone} />
      </InfoSection>

      {/* Employment */}
      <InfoSection title="Employment" icon={Building2}>
        <InfoRow icon={Building2} label="Department" value={user.department} />
        <InfoRow icon={Users} label="Title" value={user.title} />
        <InfoRow icon={Clock} label="Member since" value={user.createdAt} />
      </InfoSection>

      {/* Account security */}
      <InfoSection title="Account Security" icon={Shield}>
        <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-slate-50">
          <SecRow label="MFA Enrollment" good={user.mfaEnabled} good_text="Enrolled" bad_text="Not Enrolled" icon={Key} />
          <SecRow label="Account Status" good={user.status === 'Active'} good_text="Active" bad_text={user.status} icon={Activity} />
          {!isHelpdesk && (
            <>
              <div className="flex items-center justify-between px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <LogIn className="h-3.5 w-3.5 text-slate-400" />
                  <span className="text-xs text-slate-600">Last Login</span>
                </div>
                <div className="text-right">
                  <p className="text-xs font-medium text-slate-800">{user.lastLogin}</p>
                  <p className="text-[0.62rem] text-slate-400">{user.loginLocation}</p>
                </div>
              </div>
              <div className="flex items-center justify-between px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <Clock className="h-3.5 w-3.5 text-slate-400" />
                  <span className="text-xs text-slate-600">Last Active</span>
                </div>
                <span className="text-xs font-medium text-slate-800">{user.lastActive}</span>
              </div>
            </>
          )}
        </div>
      </InfoSection>

      {/* Directory & MDM Sources */}
      {user.sources.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Database className="h-3.5 w-3.5 text-orange-600" />
            <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Directory &amp; MDM Sources</h3>
          </div>
          <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-slate-50 overflow-hidden">
            {user.sources.map(s => {
              const SrcIcon = s.type === 'directory' ? Cloud : s.type === 'mdm' ? Smartphone : Ticket
              const iconColor = s.type === 'directory' ? 'text-orange-600' : s.type === 'mdm' ? 'text-lime-600' : 'text-orange-600'
              const iconBg = s.type === 'directory' ? 'bg-orange-50' : s.type === 'mdm' ? 'bg-lime-50' : 'bg-orange-50'
              const statusColor = s.status === 'Synced'
                ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                : s.status === 'Error'
                ? 'text-red-700 bg-red-50 border-red-200'
                : 'text-amber-700 bg-amber-50 border-amber-200'
              const typeLabel = s.type === 'directory' ? 'Directory' : s.type === 'mdm' ? 'MDM' : 'ITSM'
              return (
                <div key={s.name} className="flex items-center justify-between px-4 py-3 gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`rounded-lg p-1.5 flex-shrink-0 ${iconBg}`}>
                      <SrcIcon className={`h-3.5 w-3.5 ${iconColor}`} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[0.72rem] font-semibold text-slate-800 truncate">{s.name}</p>
                      <p className="text-[0.6rem] text-slate-400 truncate">{typeLabel} · ID: {s.userId} · {s.syncedAt}</p>
                    </div>
                  </div>
                  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[0.62rem] font-semibold flex-shrink-0 ${statusColor}`}>
                    {s.status}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function DevicesTab({ details, loading, viewerRole, onSyncDevice }: { details: UserDetails | null; loading: boolean; viewerRole: UserToolRole; onSyncDevice: (name: string) => void }) {
  const canSync = viewerRole !== 'End User'
  if (loading) return <TabLoading />
  const assignedDevices = details?.devices ?? []
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs text-slate-500">{assignedDevices.length} device{assignedDevices.length !== 1 ? 's' : ''} assigned</p>
      </div>
      {assignedDevices.length === 0 ? (
        <div className="flex flex-col items-center py-10 text-center rounded-2xl border border-slate-200 bg-slate-50">
          <Laptop2 className="h-7 w-7 text-slate-300 mb-2" />
          <p className="text-sm font-medium text-slate-500">No devices assigned</p>
        </div>
      ) : (
        assignedDevices.map(d => {
          const stateColor = d.complianceState === 'Compliant' ? 'border-emerald-200 bg-emerald-50'
            : d.complianceState === 'Warning' ? 'border-amber-200 bg-amber-50'
            : 'border-red-200 bg-red-50'
          const rc = d.riskScore >= 80 ? 'bg-red-500' : d.riskScore >= 60 ? 'bg-orange-500' : d.riskScore >= 35 ? 'bg-amber-500' : 'bg-emerald-500'
          const rtext = d.riskScore >= 80 ? 'text-red-700' : d.riskScore >= 60 ? 'text-orange-700' : d.riskScore >= 35 ? 'text-amber-700' : 'text-emerald-700'
          const isOff = d.encryptionStatus.toLowerCase().includes('off') || d.encryptionStatus.toLowerCase().includes('pending')
          return (
            <div key={d.deviceName} className={`rounded-2xl border p-4 ${stateColor}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="rounded-xl bg-white/70 p-2 flex-shrink-0">
                    <PlatformIcon platform={d.platform} />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-800">{d.deviceName}</p>
                    <p className="text-[0.65rem] text-slate-500">{d.platform} · {d.managementSource}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <ComplianceDot state={d.complianceState} />
                  <span className="text-[0.65rem] font-semibold text-slate-700">{d.complianceState}</span>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-white/60 px-3 py-2">
                  <p className="text-[0.6rem] text-slate-400">Encryption</p>
                  <p className={`text-[0.72rem] font-semibold mt-0.5 flex items-center gap-1 ${isOff ? 'text-red-600' : 'text-emerald-700'}`}>
                    {isOff ? <Unlock className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
                    {d.encryptionStatus}
                  </p>
                </div>
                <div className="rounded-lg bg-white/60 px-3 py-2">
                  <p className="text-[0.6rem] text-slate-400">Risk Score</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <div className="flex-1 h-1.5 rounded-full bg-slate-100">
                      <div className={`h-1.5 rounded-full ${rc}`} style={{ width: `${d.riskScore}%` }} />
                    </div>
                    <span className={`text-[0.68rem] font-bold ${rtext}`}>{d.riskScore}</span>
                  </div>
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <p className="text-[0.62rem] text-slate-400 flex items-center gap-1">
                  <Clock className="h-3 w-3" />Last check-in: {d.lastCheckIn}
                </p>
                {canSync && (
                  <button type="button" onClick={() => onSyncDevice(d.deviceName)}
                    className="inline-flex items-center gap-1 rounded-lg border border-white/80 bg-white px-2.5 py-1 text-[0.65rem] font-semibold text-slate-600 hover:bg-slate-50 transition">
                    <RefreshCw className="h-3 w-3" />Sync
                  </button>
                )}
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}

// ─── Sign-in Logs Tab ─────────────────────────────────────────────────────────

function SignInsTab({ details, loading }: { details: UserDetails | null; loading: boolean }) {
  if (loading) return <TabLoading />
  if (!details || details.signIns.length === 0) {
    return (
      <EmptyTabState icon={LogIn} title="No sign-in logs" subtitle="No recent sign-in activity found for this user." />
    )
  }
  return (
    <div className="space-y-2">
      {details.signIns.map(s => {
        const failed = s.status.errorCode !== 0
        const riskColor = s.riskLevelDuringSignIn === 'high' ? 'text-red-600'
          : s.riskLevelDuringSignIn === 'medium' ? 'text-amber-600' : 'text-slate-400'
        const loc = s.location ? `${s.location.city}, ${s.location.countryOrRegion}` : null
        return (
          <div key={s.id} className={`rounded-xl border px-3 py-3 space-y-1.5 ${failed ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-slate-50'}`}>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[0.6rem] font-bold ${failed ? 'bg-red-100 border-red-200 text-red-700' : 'bg-emerald-100 border-emerald-200 text-emerald-700'}`}>
                  {failed ? 'Failed' : 'Success'}
                </span>
                <span className="text-[0.72rem] font-semibold text-slate-800 truncate max-w-[160px]">{s.appDisplayName || '—'}</span>
              </div>
              <span className="text-[0.62rem] text-slate-400 flex-shrink-0">{new Date(s.createdDateTime).toLocaleString()}</span>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {s.ipAddress && <span className="text-[0.65rem] text-slate-500 flex items-center gap-1"><Globe className="h-2.5 w-2.5" />{s.ipAddress}</span>}
              {loc && <span className="text-[0.65rem] text-slate-500 flex items-center gap-1"><MapPin className="h-2.5 w-2.5" />{loc}</span>}
              {s.clientAppUsed && <span className="text-[0.65rem] text-slate-500">{s.clientAppUsed}</span>}
              {s.mfaDetail?.authMethod && <span className="text-[0.65rem] text-lime-600 flex items-center gap-1"><Key className="h-2.5 w-2.5" />{s.mfaDetail.authMethod}</span>}
              {s.riskLevelDuringSignIn && s.riskLevelDuringSignIn !== 'none' && (
                <span className={`text-[0.65rem] font-semibold flex items-center gap-1 ${riskColor}`}><ShieldAlert className="h-2.5 w-2.5" />Risk: {s.riskLevelDuringSignIn}</span>
              )}
            </div>
            {failed && s.status.failureReason && (
              <p className="text-[0.62rem] text-red-600">{s.status.failureReason}</p>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Assigned Roles Tab ───────────────────────────────────────────────────────

function RolesTab({ details, loading }: { details: UserDetails | null; loading: boolean }) {
  if (loading) return <TabLoading />
  if (!details || details.roles.length === 0) {
    return <EmptyTabState icon={Shield} title="No directory roles" subtitle="This user has no Microsoft Entra directory roles assigned." />
  }
  return (
    <div className="space-y-2">
      <p className="text-[0.62rem] text-slate-400 uppercase font-bold tracking-wide px-1">{details.roles.length} role{details.roles.length !== 1 ? 's' : ''} assigned</p>
      {details.roles.map(r => (
        <div key={r.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="rounded-lg bg-orange-100 p-1.5 flex-shrink-0"><Shield className="h-3.5 w-3.5 text-orange-600" /></div>
          <p className="text-xs font-semibold text-slate-800">{r.displayName}</p>
        </div>
      ))}
    </div>
  )
}

// ─── Groups Tab ───────────────────────────────────────────────────────────────

function GroupsTab({ details, loading }: { details: UserDetails | null; loading: boolean }) {
  if (loading) return <TabLoading />
  if (!details || details.groups.length === 0) {
    return <EmptyTabState icon={Users} title="No groups" subtitle="This user is not a member of any groups." />
  }
  const getGroupType = (g: UserDetails['groups'][0]) => {
    if (g.groupTypes.includes('Unified')) return { label: 'Microsoft 365', color: 'bg-blue-100 border-blue-200 text-blue-700' }
    if (g.securityEnabled && !g.mailEnabled) return { label: 'Security', color: 'bg-orange-100 border-orange-200 text-orange-700' }
    if (g.mailEnabled && !g.securityEnabled) return { label: 'Distribution', color: 'bg-slate-100 border-slate-200 text-slate-600' }
    return { label: 'Mail-enabled Security', color: 'bg-lime-100 border-lime-200 text-lime-700' }
  }
  return (
    <div className="space-y-2">
      <p className="text-[0.62rem] text-slate-400 uppercase font-bold tracking-wide px-1">{details.groups.length} group{details.groups.length !== 1 ? 's' : ''}</p>
      {details.groups.map(g => {
        const t = getGroupType(g)
        return (
          <div key={g.id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="rounded-lg bg-slate-200 p-1.5 flex-shrink-0"><Users className="h-3 w-3 text-slate-500" /></div>
              <p className="text-xs font-medium text-slate-800 truncate">{g.displayName}</p>
            </div>
            <span className={`flex-shrink-0 inline-flex items-center rounded-full border px-2 py-0.5 text-[0.6rem] font-semibold ${t.color}`}>{t.label}</span>
          </div>
        )
      })}
    </div>
  )
}

// ─── Applications Tab ─────────────────────────────────────────────────────────

function AppsTab({ details, loading }: { details: UserDetails | null; loading: boolean }) {
  if (loading) return <TabLoading />
  if (!details || details.apps.length === 0) {
    return <EmptyTabState icon={Cloud} title="No applications" subtitle="No app role assignments found for this user." />
  }
  return (
    <div className="space-y-2">
      <p className="text-[0.62rem] text-slate-400 uppercase font-bold tracking-wide px-1">{details.apps.length} app{details.apps.length !== 1 ? 's' : ''} assigned</p>
      {details.apps.map(a => (
        <div key={a.id} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="rounded-lg bg-lime-100 p-1.5 flex-shrink-0"><Cloud className="h-3.5 w-3.5 text-lime-600" /></div>
            <p className="text-xs font-semibold text-slate-800 truncate">{a.appDisplayName}</p>
          </div>
          <div className="flex items-center justify-between pl-8">
            <span className="text-[0.65rem] text-slate-500">{a.resourceDisplayName}</span>
            <span className="text-[0.62rem] text-slate-400">{new Date(a.createdDateTime).toLocaleDateString()}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Licenses Tab ─────────────────────────────────────────────────────────────

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

function LicensesTab({ details, loading }: { details: UserDetails | null; loading: boolean }) {
  if (loading) return <TabLoading />
  if (!details || details.licenses.length === 0) {
    return <EmptyTabState icon={Database} title="No licenses" subtitle="No license assignments found for this user." />
  }
  return (
    <div className="space-y-3">
      <p className="text-[0.62rem] text-slate-400 uppercase font-bold tracking-wide px-1">{details.licenses.length} license{details.licenses.length !== 1 ? 's' : ''} assigned</p>
      {details.licenses.map(l => {
        const name = SKU_LABELS[l.skuPartNumber] ?? l.skuPartNumber.replace(/_/g, ' ')
        const enabled = l.servicePlans.filter(p => p.provisioningStatus === 'Success')
        const disabled = l.servicePlans.filter(p => p.provisioningStatus !== 'Success')
        return (
          <div key={l.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
            <div className="flex items-center gap-2.5">
              <div className="rounded-lg bg-orange-100 p-1.5 flex-shrink-0"><Database className="h-3.5 w-3.5 text-orange-600" /></div>
              <p className="text-xs font-bold text-slate-800">{name}</p>
            </div>
            {enabled.length > 0 && (
              <div>
                <p className="text-[0.6rem] font-bold text-slate-400 uppercase tracking-wide mb-1.5">Active services ({enabled.length})</p>
                <div className="flex flex-wrap gap-1">
                  {enabled.map(p => (
                    <span key={p.servicePlanName} className="inline-flex items-center rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[0.6rem] font-medium text-emerald-700">
                      {p.servicePlanName.replace(/_/g, ' ')}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {disabled.length > 0 && (
              <div>
                <p className="text-[0.6rem] font-bold text-slate-400 uppercase tracking-wide mb-1.5">Disabled ({disabled.length})</p>
                <div className="flex flex-wrap gap-1">
                  {disabled.map(p => (
                    <span key={p.servicePlanName} className="inline-flex items-center rounded-full bg-slate-100 border border-slate-200 px-2 py-0.5 text-[0.6rem] font-medium text-slate-400">
                      {p.servicePlanName.replace(/_/g, ' ')}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Shared tab helpers ───────────────────────────────────────────────────────

function TabLoading() {
  return (
    <div className="flex flex-col items-center justify-center py-14">
      <RefreshCw className="h-5 w-5 text-slate-400 animate-spin mb-2" />
      <p className="text-xs text-slate-400">Loading…</p>
    </div>
  )
}

function EmptyTabState({ icon: Icon, title, subtitle }: { icon: React.ElementType; title: string; subtitle: string }) {
  return (
    <div className="flex flex-col items-center py-12 text-center">
      <div className="rounded-full bg-slate-100 p-4 mb-3"><Icon className="h-6 w-6 text-slate-300" /></div>
      <p className="text-sm font-semibold text-slate-500">{title}</p>
      <p className="text-xs text-slate-400 mt-1 max-w-[220px]">{subtitle}</p>
    </div>
  )
}

// ─── Jira Tab ─────────────────────────────────────────────────────────────────

function jiraPriorityCfg(p: JiraTicket['priority']) {
  switch (p) {
    case 'Critical': return 'text-red-700 bg-red-50 border-red-200'
    case 'High':     return 'text-orange-700 bg-orange-50 border-orange-200'
    case 'Medium':   return 'text-amber-700 bg-amber-50 border-amber-200'
    case 'Low':      return 'text-slate-600 bg-slate-50 border-slate-200'
  }
}

function jiraStatusCfg(s: JiraTicket['status']) {
  switch (s) {
    case 'Open':        return 'text-red-700 bg-red-50 border-red-200'
    case 'In Progress': return 'text-orange-700 bg-orange-50 border-orange-200'
    case 'Pending':     return 'text-amber-700 bg-amber-50 border-amber-200'
    case 'Resolved':    return 'text-emerald-700 bg-emerald-50 border-emerald-200'
  }
}

function jiraTypeCfg(t: JiraTicket['type']) {
  switch (t) {
    case 'Incident': return 'text-red-600'
    case 'Bug':      return 'text-orange-600'
    case 'Task':     return 'text-orange-600'
    case 'Request':  return 'text-lime-600'
    case 'Story':    return 'text-emerald-600'
  }
}

function TicketCard({ ticket }: { ticket: JiraTicket }) {
  const sc = jiraStatusCfg(ticket.status)
  const pc = jiraPriorityCfg(ticket.priority)
  const tc = jiraTypeCfg(ticket.type)
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[0.68rem] font-bold font-mono text-slate-500 flex-shrink-0">{ticket.id}</span>
          <span className={`text-[0.62rem] font-semibold ${tc}`}>{ticket.type}</span>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[0.6rem] font-bold ${pc}`}>{ticket.priority}</span>
          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[0.6rem] font-semibold ${sc}`}>{ticket.status}</span>
        </div>
      </div>
      <p className="text-xs font-medium text-slate-800 leading-snug">{ticket.summary}</p>
      <div className="flex items-center justify-between text-[0.62rem] text-slate-400">
        <span className="font-semibold text-slate-500">{ticket.project}</span>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-0.5"><Clock className="h-3 w-3" />{ticket.created}</span>
          <span>Updated {ticket.updated}</span>
        </div>
      </div>
    </div>
  )
}

function JiraTab({ user }: { user: AppUser }) {
  const openTickets = user.jiraTickets.filter(t => t.status !== 'Resolved')
  const resolvedTickets = user.jiraTickets.filter(t => t.status === 'Resolved')

  if (user.jiraTickets.length === 0) {
    return (
      <div className="flex flex-col items-center py-12 text-center">
        <div className="rounded-full bg-slate-100 p-4 mb-3"><Ticket className="h-6 w-6 text-slate-300" /></div>
        <p className="text-sm font-semibold text-slate-500">No Jira tickets</p>
        <p className="text-xs text-slate-400 mt-1">No open or recent tickets for this user.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {openTickets.length > 0 && (
        <div>
          <p className="text-[0.62rem] font-bold text-slate-400 uppercase tracking-wide mb-2 px-1">
            Open &amp; In Progress ({openTickets.length})
          </p>
          <div className="space-y-2">
            {openTickets.map(t => <TicketCard key={t.id} ticket={t} />)}
          </div>
        </div>
      )}
      {resolvedTickets.length > 0 && (
        <div>
          <p className="text-[0.62rem] font-bold text-slate-400 uppercase tracking-wide mb-2 px-1">
            Resolved ({resolvedTickets.length})
          </p>
          <div className="space-y-2 opacity-60">
            {resolvedTickets.map(t => <TicketCard key={t.id} ticket={t} />)}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function InfoSection({ title, icon: Icon, children }: { title: string; icon: typeof Mail; children: React.ReactNode }) {
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

function InfoRow({ icon: Icon, label, value, onCopy }: { icon: typeof Mail; label: string; value: string; onCopy?: () => void }) {
  return (
    <div className="group flex items-center justify-between gap-3 px-4 py-2.5">
      <div className="flex items-center gap-2 flex-shrink-0">
        <Icon className="h-3.5 w-3.5 text-slate-400" />
        <span className="text-[0.68rem] text-slate-500">{label}</span>
      </div>
      <div className="flex items-center gap-1 min-w-0">
        <span className="text-[0.72rem] font-medium text-slate-800 text-right truncate">{value}</span>
        {onCopy && (
          <button type="button" onClick={onCopy} className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 rounded p-0.5 text-slate-400 hover:text-orange-600 hover:bg-orange-50 transition flex-shrink-0">
            <Copy className="h-2.5 w-2.5" />
          </button>
        )}
      </div>
    </div>
  )
}

function SecRow({ label, good, good_text, bad_text, icon: Icon }: { label: string; good: boolean; good_text: string; bad_text: string; icon: typeof Key }) {
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

// ─── User Detail Drawer ───────────────────────────────────────────────────────

function UserDetailDrawer({
  user, viewerRole, onClose, onEdit,
}: {
  user: AppUser | null
  viewerRole: UserToolRole
  onClose: () => void
  onEdit: (user: AppUser) => void
}) {
  const { notify } = useToast()
  const [activeTab, setActiveTab] = useState<DrawerTab>('profile')
  const drawerRef = useRef<HTMLDivElement>(null)
  const isGlobalAdmin = viewerRole === 'Global Admin'
  const isHelpdesk = viewerRole === 'Helpdesk'

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])

  const [details, setDetails] = useState<UserDetails | null>(null)
  const [detailsLoading, setDetailsLoading] = useState(false)

  useEffect(() => {
    if (user) {
      drawerRef.current?.focus()
      setActiveTab('profile')
      setDetails(null)
      setDetailsLoading(true)
      api.fetchUserDetails(user.id, user.email)
        .then(setDetails)
        .catch(() => setDetails({ signIns: [], roles: [], groups: [], apps: [], licenses: [], devices: [] }))
        .finally(() => setDetailsLoading(false))
    }
  }, [user])

  const handleSyncDevice = (name: string) => {
    notify('success', 'Sync Triggered', `Device ${name} sync initiated`)
  }

  const openJiraCount = user?.jiraTickets.filter(t => t.status !== 'Resolved').length ?? 0

  const tabs: { id: DrawerTab; label: string }[] = [
    { id: 'profile',  label: 'Profile' },
    { id: 'signins',  label: 'Sign-in Logs' },
    { id: 'roles',    label: 'Assigned Roles' },
    { id: 'groups',   label: `Groups${details ? ` (${details.groups.length})` : ''}` },
    { id: 'apps',     label: 'Applications' },
    { id: 'licenses', label: 'Licenses' },
    { id: 'devices',  label: `Devices (${details?.devices.length ?? 0})` },
    { id: 'jira',     label: `Jira${openJiraCount > 0 ? ` (${openJiraCount})` : ''}` },
  ]

  return (
    <>
      <div className={`fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-[2px] transition-opacity duration-200 ${user ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} onClick={onClose} aria-hidden />
      <div ref={drawerRef} tabIndex={-1} role="dialog" aria-modal aria-label={user ? `User: ${user.firstName} ${user.lastName}` : 'User details'}
        className={`fixed inset-y-0 right-0 z-50 flex w-[50vw] min-w-[560px] flex-col bg-white shadow-2xl shadow-slate-950/20 transition-transform duration-300 ease-out outline-none ${user ? 'translate-x-0' : 'translate-x-full'}`}>
        {user && (
          <>
            {/* Header */}
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 bg-gradient-to-r from-[#141408] to-[#1e1e06] px-5 py-4">
              <div className="flex items-center gap-3 min-w-0">
                <Avatar user={user} size="lg" />
                <div className="min-w-0">
                  <p className="font-bold text-white text-sm leading-tight">{user.firstName} {user.lastName}</p>
                  <p className="text-[0.68rem] text-slate-300 truncate mt-0.5">{user.email}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    <RoleBadge role={user.toolRole} />
                    <StatusBadge status={user.status} />
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-1.5 text-slate-300 hover:bg-white/10 hover:text-white transition">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-slate-100 bg-slate-50 px-1">
              {tabs.map(tab => (
                <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)}
                  className={`relative flex-1 flex items-center justify-center gap-1 px-2 py-2.5 text-[0.7rem] font-semibold transition whitespace-nowrap focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-orange-300 ${
                    activeTab === tab.id ? 'text-orange-700 border-b-2 border-orange-600 -mb-px bg-white' : 'text-slate-500 hover:text-slate-700'
                  }`}>
                  {tab.label}
                  {tab.id === 'jira' && openJiraCount > 0 && (
                    <span className="flex h-4 min-w-4 px-0.5 items-center justify-center rounded-full bg-orange-500 text-[0.5rem] font-bold text-white">{openJiraCount}</span>
                  )}
                </button>
              ))}
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden px-5 py-4">
              {activeTab === 'profile'  && <ProfileTab user={user} viewerRole={viewerRole} />}
              {activeTab === 'signins'  && <SignInsTab details={details} loading={detailsLoading} />}
              {activeTab === 'roles'    && <RolesTab details={details} loading={detailsLoading} />}
              {activeTab === 'groups'   && <GroupsTab details={details} loading={detailsLoading} />}
              {activeTab === 'apps'     && <AppsTab details={details} loading={detailsLoading} />}
              {activeTab === 'licenses' && <LicensesTab details={details} loading={detailsLoading} />}
              {activeTab === 'devices'  && <DevicesTab details={details} loading={detailsLoading} viewerRole={viewerRole} onSyncDevice={handleSyncDevice} />}
              {activeTab === 'jira'     && <JiraTab user={user} />}
            </div>

            {/* Footer */}
            <div className="border-t border-slate-100 bg-slate-50 px-5 py-3 flex items-center gap-2 flex-wrap">
              {isGlobalAdmin && (
                <>
                  <button type="button" onClick={() => onEdit(user)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-700 transition focus-visible:ring-2 focus-visible:ring-orange-300">
                    <Edit2 className="h-3 w-3" />Edit User
                  </button>
                  {user.status === 'Suspended' ? (
                    <button type="button" onClick={() => notify('success', 'User Activated', `${user.firstName} ${user.lastName} has been reactivated`)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 transition">
                      <CheckCircle2 className="h-3 w-3" />Activate
                    </button>
                  ) : (
                    <button type="button" onClick={() => notify('success', 'User Suspended', `${user.firstName} has been suspended`)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 transition">
                      <Ban className="h-3 w-3" />Suspend
                    </button>
                  )}
                  <button type="button" onClick={() => notify('success', 'MFA Reset', `MFA reset link sent to ${user.email}`)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition">
                    <RotateCcw className="h-3 w-3" />Reset MFA
                  </button>
                </>
              )}
              {!isGlobalAdmin && !isHelpdesk && (
                <button type="button" onClick={() => notify('info', 'Sync', `Device sync triggered for ${user.firstName}'s devices`)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-700 transition focus-visible:ring-2 focus-visible:ring-orange-300">
                  <RefreshCw className="h-3 w-3" />Sync Devices
                </button>
              )}
              <button type="button" onClick={onClose} className="ml-auto text-xs text-slate-400 hover:text-slate-600 rounded">Close</button>
            </div>
          </>
        )}
      </div>
    </>
  )
}

// ─── Sort header ──────────────────────────────────────────────────────────────

function SortTh({ label, sortKey, currentKey, currentDir, onSort }: {
  label: string; sortKey: SortKey; currentKey: SortKey | null; currentDir: SortDir; onSort: (k: SortKey) => void
}) {
  const active = currentKey === sortKey
  const Icon = active ? (currentDir === 'asc' ? ChevronUp : ChevronDown) : ChevronsUpDown
  return (
    <th scope="col" onClick={() => onSort(sortKey)}
      className="whitespace-nowrap px-3 py-2.5 text-left text-[0.68rem] font-semibold uppercase tracking-wide text-slate-500 cursor-pointer select-none hover:text-slate-700 transition group">
      <span className="inline-flex items-center gap-1">
        {label}
        <Icon className={`h-3 w-3 ${active ? 'text-orange-600' : 'text-slate-300 group-hover:text-slate-400'}`} />
      </span>
    </th>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 10

export function UsersPage({ viewerRole = 'Global Admin' }: { viewerRole?: UserToolRole }) {
  const { notify } = useToast()
  const [allUsers, setAllUsers] = useState<AppUser[]>([])
  const [loading, setLoading] = useState(true)
  const isGlobalAdmin = viewerRole === 'Global Admin'

  useEffect(() => {
    api.fetchUsers()
      .then(setAllUsers)
      .catch(err => notify('error', 'Failed to load users', err.message))
      .finally(() => setLoading(false))
  }, [notify])

  const [query, setQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState('All')
  const [statusFilter, setStatusFilter] = useState('All')
  const [riskFilter, setRiskFilter] = useState('All')
  const [sourceFilter, setSourceFilter] = useState('All')
  const [sortKey, setSortKey] = useState<SortKey | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>(null)
  const [page, setPage] = useState(1)
  const [selectedUser, setSelectedUser] = useState<AppUser | null>(null)
  const [editUser, setEditUser] = useState<AppUser | null>(null)
  const [inviteOpen, setInviteOpen] = useState(false)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return allUsers.filter(u => {
      if (roleFilter !== 'All' && u.toolRole !== roleFilter) return false
      if (statusFilter !== 'All' && u.status !== statusFilter) return false
      if (riskFilter !== 'All' && u.riskLevel !== riskFilter) return false
      if (sourceFilter !== 'All' && !u.sources.some(s => s.name === sourceFilter)) return false
      if (q) return (
        `${u.firstName} ${u.lastName}`.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.department.toLowerCase().includes(q) ||
        u.title.toLowerCase().includes(q)
      )
      return true
    })
  }, [allUsers, query, roleFilter, statusFilter, riskFilter, sourceFilter])

  const sorted = useMemo(() => {
    if (!sortKey || !sortDir) return filtered
    return [...filtered].sort((a, b) => {
      let av: string | number, bv: string | number
      if (sortKey === 'firstName') { av = `${a.firstName} ${a.lastName}`.toLowerCase(); bv = `${b.firstName} ${b.lastName}`.toLowerCase() }
      else if (sortKey === 'toolRole') { av = ROLE_ORDER[a.toolRole]; bv = ROLE_ORDER[b.toolRole] }
      else if (sortKey === 'riskLevel') { av = RISK_ORDER[a.riskLevel]; bv = RISK_ORDER[b.riskLevel] }
      else { av = (a[sortKey] as string).toLowerCase(); bv = (b[sortKey] as string).toLowerCase() }
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })
  }, [filtered, sortKey, sortDir])

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const paginated = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const handleSort = useCallback((key: SortKey) => {
    setSortKey(prev => {
      if (prev !== key) { setSortDir('asc'); return key }
      setSortDir(d => d === 'asc' ? 'desc' : d === 'desc' ? null : 'asc')
      return key
    })
    setPage(1)
  }, [])

  const clearFilters = () => { setQuery(''); setRoleFilter('All'); setStatusFilter('All'); setRiskFilter('All'); setSourceFilter('All'); setPage(1) }
  const hasFilters = !!(query || roleFilter !== 'All' || statusFilter !== 'All' || riskFilter !== 'All' || sourceFilter !== 'All')

  return (
    <>
      <div className="space-y-4 w-full">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Users</h1>
            <p className="mt-0.5 text-sm text-slate-500">{allUsers.length} users · {allUsers.filter(u => u.toolRole !== 'End User').length} with tool access</p>
          </div>
          {isGlobalAdmin && (
            <button type="button" onClick={() => setInviteOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-orange-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-orange-700 focus-visible:ring-2 focus-visible:ring-orange-300">
              <UserPlus className="h-3.5 w-3.5" />Invite User
            </button>
          )}
        </div>

        {/* Stats */}
        <StatStrip users={allUsers} />

        {/* Toolbar */}
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm shadow-slate-900/5">
          <div className="flex flex-wrap gap-2.5 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input type="text" placeholder="Search by name, email, department…" value={query} onChange={e => { setQuery(e.target.value); setPage(1) }}
                className="h-8 w-full rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-8 text-xs text-slate-800 placeholder:text-slate-400 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-400/20" />
              {query && <button type="button" onClick={() => { setQuery(''); setPage(1) }} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:text-slate-600"><X className="h-3 w-3" /></button>}
            </div>

            {/* Role filter */}
            <div className="relative">
              <Shield className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400" />
              <select value={roleFilter} onChange={e => { setRoleFilter(e.target.value); setPage(1) }}
                className="h-8 appearance-none rounded-lg border border-slate-200 bg-slate-50 pl-7 pr-6 text-xs text-slate-700 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-400/20 cursor-pointer">
                <option value="All">All Roles</option>
                <option value="Global Admin">Global Admin</option>
                <option value="IT Admin">IT Admin</option>
                <option value="Helpdesk">Helpdesk</option>
                <option value="End User">End User</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400" />
            </div>

            {/* Status filter */}
            <div className="relative">
              <Filter className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400" />
              <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1) }}
                className="h-8 appearance-none rounded-lg border border-slate-200 bg-slate-50 pl-7 pr-6 text-xs text-slate-700 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-400/20 cursor-pointer">
                <option value="All">All Statuses</option>
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
                <option value="Suspended">Suspended</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400" />
            </div>

            {/* Risk filter */}
            <div className="relative">
              <Zap className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400" />
              <select value={riskFilter} onChange={e => { setRiskFilter(e.target.value); setPage(1) }}
                className="h-8 appearance-none rounded-lg border border-slate-200 bg-slate-50 pl-7 pr-6 text-xs text-slate-700 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-400/20 cursor-pointer">
                <option value="All">All Risk Levels</option>
                <option value="Critical">Critical</option>
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400" />
            </div>

            {/* Source filter */}
            <div className="relative">
              <Database className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400" />
              <select value={sourceFilter} onChange={e => { setSourceFilter(e.target.value); setPage(1) }}
                className="h-8 appearance-none rounded-lg border border-slate-200 bg-slate-50 pl-7 pr-6 text-xs text-slate-700 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-400/20 cursor-pointer">
                <option value="All">All Sources</option>
                <option value="Microsoft Entra ID">Microsoft Entra ID</option>
                <option value="Microsoft Intune">Microsoft Intune</option>
                <option value="Kandji">Kandji</option>
                <option value="ManageEngine">ManageEngine</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400" />
            </div>

            {hasFilters && <button type="button" onClick={clearFilters} className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 transition rounded"><X className="h-3 w-3" />Clear</button>}
          </div>

          {/* Status pill row */}
          <div className="mt-2.5 flex gap-1.5 flex-wrap">
            {['All', 'Active', 'Inactive', 'Suspended'].map(s => {
              const active = statusFilter === s
              const count = s === 'All' ? filtered.length : filtered.filter(u => u.status === s).length
              return (
                <button key={s} type="button" onClick={() => { setStatusFilter(s); setPage(1) }}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold transition ${
                    active
                      ? s === 'Active' ? 'bg-emerald-600 border-emerald-600 text-white'
                        : s === 'Suspended' ? 'bg-red-600 border-red-600 text-white'
                        : s === 'Inactive' ? 'bg-slate-600 border-slate-600 text-white'
                        : 'bg-orange-600 border-orange-600 text-white'
                      : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                  }`}>
                  {s}
                  <span className={`rounded-full px-1.5 py-px text-[0.6rem] font-bold ${active ? 'bg-white/20' : 'bg-slate-100 text-slate-500'}`}>{count}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Table */}
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-900/5 overflow-hidden">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-center px-4">
              <RefreshCw className="h-6 w-6 text-slate-400 animate-spin mb-3" />
              <p className="text-sm font-semibold text-slate-700">Loading users from Microsoft Entra ID…</p>
            </div>
          ) : paginated.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center px-4">
              <div className="rounded-full bg-slate-100 p-4 mb-3"><Search className="h-6 w-6 text-slate-400" /></div>
              <p className="text-sm font-semibold text-slate-700">No users found</p>
              <p className="text-xs text-slate-500 mt-1">Try adjusting your search or filters</p>
              <button type="button" onClick={clearFilters} className="mt-3 text-xs text-orange-600 hover:text-orange-700 font-medium underline underline-offset-2">Clear filters</button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <SortTh label="User" sortKey="firstName" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
                    <SortTh label="Access Level" sortKey="toolRole" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
                    <SortTh label="Department" sortKey="department" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
                    <SortTh label="Status" sortKey="status" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
                    <th scope="col" className="px-3 py-2.5 text-left text-[0.68rem] font-semibold uppercase tracking-wide text-slate-500">MFA</th>
                    <th scope="col" className="px-3 py-2.5 text-left text-[0.68rem] font-semibold uppercase tracking-wide text-slate-500">Devices</th>
                    <SortTh label="Risk" sortKey="riskLevel" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
                    <SortTh label="Last Active" sortKey="lastActive" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
                    <th scope="col" className="px-3 py-2.5 text-left text-[0.68rem] font-semibold uppercase tracking-wide text-slate-500">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginated.map(user => {
                    const alertCount = user.recentActivity.filter(a => a.type === 'Alert').length
                    return (
                      <tr key={user.id} onClick={() => setSelectedUser(user)} className="group cursor-pointer hover:bg-orange-50/60 transition">
                        {/* User */}
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="relative flex-shrink-0">
                              <Avatar user={user} size="sm" />
                              {user.status === 'Active' && <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white" />}
                              {user.status === 'Suspended' && <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white" />}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <p className="text-xs font-semibold text-slate-900 group-hover:text-orange-700 transition truncate max-w-[110px]">{user.firstName} {user.lastName}</p>
                                {alertCount > 0 && (
                                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[0.5rem] font-bold text-white flex-shrink-0">{alertCount}</span>
                                )}
                              </div>
                              <p className="text-[0.62rem] text-slate-400 truncate max-w-[140px]">{user.email}</p>
                              {user.sources.length > 0 && (
                                <div className="flex items-center gap-0.5 mt-0.5">
                                  {user.sources.map(s => {
                                    const SIcon = s.type === 'directory' ? Cloud : s.type === 'mdm' ? Smartphone : Ticket
                                    const sc = s.status === 'Error' ? 'text-red-400' : s.status === 'Pending' ? 'text-amber-400' : s.type === 'directory' ? 'text-orange-400' : 'text-lime-400'
                                    return <span key={s.name} title={`${s.name}: ${s.status}`}><SIcon className={`h-2.5 w-2.5 ${sc}`} /></span>
                                  })}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Access Level */}
                        <td className="px-3 py-3"><RoleBadge role={user.toolRole} /></td>

                        {/* Department */}
                        <td className="px-3 py-3">
                          <p className="text-xs font-medium text-slate-700 truncate max-w-[110px]">{user.department}</p>
                          <p className="text-[0.62rem] text-slate-400 truncate max-w-[110px]">{user.title}</p>
                        </td>

                        {/* Status */}
                        <td className="px-3 py-3"><StatusBadge status={user.status} /></td>

                        {/* MFA */}
                        <td className="px-3 py-3">
                          {user.mfaEnabled
                            ? <span className="inline-flex items-center gap-1 text-[0.65rem] font-semibold text-emerald-700"><Lock className="h-3 w-3" />On</span>
                            : <span className="inline-flex items-center gap-1 text-[0.65rem] font-semibold text-amber-600"><Unlock className="h-3 w-3" />Off</span>}
                        </td>

                        {/* Devices */}
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-semibold text-slate-700">{user.assignedDevices.length}</span>
                            <div className="flex gap-0.5">
                              {user.assignedDevices.map(d => <ComplianceDot key={d.deviceName} state={d.complianceState} />)}
                            </div>
                          </div>
                        </td>

                        {/* Risk */}
                        <td className="px-3 py-3"><RiskBadge level={user.riskLevel} /></td>

                        {/* Last Active */}
                        <td className="px-3 py-3">
                          <span className="text-[0.68rem] text-slate-500 whitespace-nowrap flex items-center gap-1">
                            <Clock className="h-3 w-3 text-slate-300 flex-shrink-0" />{user.lastActive}
                          </span>
                        </td>

                        {/* Actions */}
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-1.5">
                            <button type="button" onClick={e => { e.stopPropagation(); setSelectedUser(user) }}
                              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[0.68rem] font-semibold text-slate-600 hover:bg-slate-50 hover:text-orange-600 transition focus-visible:ring-2 focus-visible:ring-orange-300">
                              Details
                            </button>
                            {isGlobalAdmin && (
                              <button type="button" onClick={e => { e.stopPropagation(); setEditUser(user) }}
                                className="rounded-lg border border-slate-200 bg-white p-1 text-slate-400 hover:bg-slate-50 hover:text-orange-600 transition focus-visible:ring-2 focus-visible:ring-orange-300"
                                aria-label="Edit user">
                                <Edit2 className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {sorted.length > 0 && (
            <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2.5 bg-slate-50">
              <p className="text-[0.68rem] text-slate-500">
                Showing {Math.min((page - 1) * PAGE_SIZE + 1, sorted.length)}–{Math.min(page * PAGE_SIZE, sorted.length)} of {sorted.length} user{sorted.length !== 1 ? 's' : ''}
              </p>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                  className="rounded-lg border border-slate-200 bg-white p-1 text-slate-500 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-orange-300">
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                  <button key={p} type="button" onClick={() => setPage(p)}
                    className={`rounded-lg border px-2.5 py-1 text-[0.68rem] font-semibold transition focus-visible:ring-2 focus-visible:ring-orange-300 ${p === page ? 'bg-orange-600 border-orange-600 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
                    {p}
                  </button>
                ))}
                <button type="button" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                  className="rounded-lg border border-slate-200 bg-white p-1 text-slate-500 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-orange-300">
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Drawer */}
      <UserDetailDrawer
        user={selectedUser}
        viewerRole={viewerRole}
        onClose={() => setSelectedUser(null)}
        onEdit={u => { setSelectedUser(null); setEditUser(u) }}
      />

      {/* Modals */}
      <InviteUserModal open={inviteOpen} onClose={() => setInviteOpen(false)} />
      <EditUserModal user={editUser} open={editUser !== null} onClose={() => setEditUser(null)} />
    </>
  )
}
