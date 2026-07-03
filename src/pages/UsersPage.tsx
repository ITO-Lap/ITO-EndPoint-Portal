import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import {
  Search, X, ChevronUp, ChevronDown, ChevronsUpDown,
  UserPlus, Mail,
  Lock, Unlock, Laptop2, Clock, Activity,
  Shield, ShieldAlert, RefreshCw, ChevronLeft, ChevronRight,
  Filter, Zap, Edit2, RotateCcw, LogOut,
  Cloud, Smartphone, Ticket, Database, Users,
} from 'lucide-react'
import { useToast } from '../components/ui/ToastProvider'
import { api } from '../api'
import type { AppUser, UserToolRole, UserStatus, UserRiskLevel } from '../types'
import { Avatar, RoleBadge, StatusBadge, RiskBadge, ComplianceDot, statusCfg } from '../components/user-intelligence/shared'

// ─── constants ───────────────────────────────────────────────────────────────

type SortKey = 'firstName' | 'email' | 'toolRole' | 'department' | 'status' | 'lastActive' | 'riskLevel'
type SortDir = 'asc' | 'desc' | null

const ROLE_ORDER: Record<UserToolRole, number> = { 'Global Admin': 0, 'IT Admin': 1, 'Helpdesk': 2, 'End User': 3 }
const RISK_ORDER: Record<UserRiskLevel, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 }

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
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])

  useEffect(() => { if (open) { ref.current?.focus(); setForm({ firstName: '', lastName: '', email: '', department: '', title: '', role: 'End User' }) } }, [open])

  const handleSend = async () => {
    if (!form.email || !form.firstName) return
    setLoading(true)
    await new Promise(r => setTimeout(r, 800))
    setLoading(false)
    notify('info', 'Not Yet Connected', 'User invitations require a directory-provisioning API that isn\'t wired up yet — contact your Identity Admin to invite this user directly in Entra ID.')
    onClose()
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
    await new Promise(r => setTimeout(r, 600))
    setSaving(false)
    notify('info', 'Not Yet Connected', 'Role and status changes require a directory-write API that isn\'t wired up yet — make this change directly in Entra ID for now.')
    onClose()
  }

  const handleMfaReset = async () => {
    setMfaResetting(true)
    await new Promise(r => setTimeout(r, 600))
    setMfaResetting(false)
    notify('info', 'Not Yet Connected', `MFA reset requires a live directory action that isn't wired up yet — reset ${user.firstName}'s MFA directly in Entra ID for now.`)
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
              <button type="button" onClick={() => notify('info', 'Not Yet Connected', `Revoking sessions requires a live directory action that isn't wired up yet — revoke ${user.firstName}'s sessions directly in Entra ID for now.`)}
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

export function UsersPage({ viewerRole = 'Global Admin', onOpenUser }: { viewerRole?: UserToolRole; onOpenUser: (user: AppUser) => void }) {
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
                      <tr key={user.id} onClick={() => onOpenUser(user)} className="group cursor-pointer hover:bg-orange-50/60 transition">
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
                            <button type="button" onClick={e => { e.stopPropagation(); onOpenUser(user) }}
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

      {/* Modals */}
      <InviteUserModal open={inviteOpen} onClose={() => setInviteOpen(false)} />
      <EditUserModal user={editUser} open={editUser !== null} onClose={() => setEditUser(null)} />
    </>
  )
}
