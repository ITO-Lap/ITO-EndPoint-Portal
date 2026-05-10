import { useState } from 'react'
import {
  User,
  Mail,
  Phone,
  Building2,
  MapPin,
  ShieldCheck,
  Key,
  Bell,
  Monitor,
  Smartphone,
  Globe,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Edit3,
  Save,
  X,
  Laptop2,
  ChevronRight,
  Lock,
  LogOut,
  BadgeCheck,
  Layers,
  Activity,
} from 'lucide-react'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { DashboardCard } from '../components/ui/DashboardCard'
import { useToast } from '../components/ui/ToastProvider'
import { QuietHoursModal } from '../components/settings/QuietHoursModal'
import type { QuietHoursConfig } from '../components/settings/QuietHoursModal'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ToggleProps {
  enabled: boolean
  onChange: (v: boolean) => void
  label: string
  description?: string
}

interface SessionItem {
  device: string
  location: string
  browser: string
  lastActive: string
  icon: React.ElementType
  current?: boolean
}

interface Permission {
  label: string
  granted: boolean
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Toggle({ enabled, onChange, label, description }: ToggleProps) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5 border-b border-slate-100 last:border-0">
      <div className="min-w-0">
        <p className="text-xs font-medium text-slate-800">{label}</p>
        {description && <p className="text-[0.68rem] text-slate-500 mt-0.5">{description}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        onClick={() => onChange(!enabled)}
        className={`relative flex-shrink-0 h-5 w-9 rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-sky-300 focus-visible:ring-offset-1 ${
          enabled ? 'bg-sky-600' : 'bg-slate-200'
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
            enabled ? 'translate-x-4' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  )
}

function StatPill({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-white/20 bg-white/10 backdrop-blur-sm px-4 py-3 min-w-[90px] text-center">
      <span className="text-lg font-bold text-white leading-tight">{value}</span>
      <span className="text-[0.62rem] font-medium text-sky-200 mt-0.5 leading-tight">{label}</span>
      {sub && <span className="text-[0.55rem] text-white/50 mt-0.5">{sub}</span>}
    </div>
  )
}

function FieldRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-slate-100 last:border-0">
      <span className="text-[0.68rem] text-slate-500 flex-shrink-0 w-28">{label}</span>
      <span className="text-xs font-semibold text-slate-900 text-right truncate">{value}</span>
    </div>
  )
}

// ─── Main Component ────────────────────────────────────────────────────────────

export function ProfilePage() {
  const { notify } = useToast()
  const [editMode, setEditMode] = useState(false)
  const [saving, setSaving] = useState(false)
  const [changingPassword, setChangingPassword] = useState(false)

  // Editable profile fields
  const [profile, setProfile] = useState({
    firstName: 'Avinash',
    lastName: 'Verma',
    email: 'avinash.verma@zinnia.com',
    phone: '+1 (415) 555-0182',
    department: 'IT Operations',
    location: 'San Francisco, CA',
    title: 'Global Administrator',
    timezone: 'America/Los_Angeles (UTC−8)',
  })
  const [draft, setDraft] = useState({ ...profile })

  // Security
  const [twoFaEnabled, setTwoFaEnabled] = useState(true)
  const [sessionAlerts, setSessionAlerts] = useState(true)

  // Quiet hours
  const [quietHoursOpen, setQuietHoursOpen] = useState(false)
  const [quietHours, setQuietHours] = useState<QuietHoursConfig>({
    enabled: true,
    startHour: 22,
    endHour: 7,
    activeDays: [0, 1, 2, 3, 4, 5, 6],
    criticalOverride: true,
  })

  // Notification toggles
  const [notifs, setNotifs] = useState({
    deviceNonCompliant: true,
    policyChanged: true,
    newDevice: false,
    weeklyDigest: true,
    criticalAlerts: true,
    runbookComplete: false,
  })

  const toggleNotif = (key: keyof typeof notifs) =>
    setNotifs((prev) => ({ ...prev, [key]: !prev[key] }))

  const sessions: SessionItem[] = [
    {
      device: 'MacBook Pro 16"',
      location: 'San Francisco, CA',
      browser: 'Chrome 124',
      lastActive: 'Active now',
      icon: Laptop2,
      current: true,
    },
    {
      device: 'iPhone 15 Pro',
      location: 'San Francisco, CA',
      browser: 'Safari Mobile',
      lastActive: '2 hours ago',
      icon: Smartphone,
    },
    {
      device: 'Windows Desktop',
      location: 'Los Angeles, CA',
      browser: 'Edge 123',
      lastActive: 'Yesterday, 4:22 PM',
      icon: Monitor,
    },
  ]

  const permissions: Permission[] = [
    { label: 'View all devices', granted: true },
    { label: 'Manage policies', granted: true },
    { label: 'Run automations', granted: true },
    { label: 'Manage users', granted: true },
    { label: 'Export reports', granted: true },
    { label: 'Modify integrations', granted: true },
  ]

  const handleSave = async () => {
    setSaving(true)
    await new Promise((r) => setTimeout(r, 900))
    setProfile({ ...draft })
    setSaving(false)
    setEditMode(false)
    notify('success', 'Profile Updated', 'Your profile information has been saved')
  }

  const handleCancel = () => {
    setDraft({ ...profile })
    setEditMode(false)
  }

  const handlePasswordChange = async () => {
    setChangingPassword(true)
    await new Promise((r) => setTimeout(r, 800))
    setChangingPassword(false)
    notify('info', 'Email Sent', 'A password reset link has been sent to your email')
  }

  const handle2FAToggle = (v: boolean) => {
    setTwoFaEnabled(v)
    notify('success', v ? '2FA Enabled' : '2FA Disabled', v ? 'Two-factor authentication is now active' : 'Two-factor authentication has been turned off')
  }

  return (
    <div className="space-y-5 w-full">

      {/* ── Hero card ─────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-[22px] bg-gradient-to-br from-[#071f49] via-[#0e3272] to-[#0a2860] border border-[#1a3a6e] shadow-xl shadow-slate-900/20">
        {/* decorative rings */}
        <div className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-sky-500/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 -left-16 h-48 w-48 rounded-full bg-blue-600/10 blur-2xl" />

        <div className="relative flex flex-col gap-5 px-6 py-6 sm:flex-row sm:items-center sm:gap-7">

          {/* Avatar */}
          <div className="relative flex-shrink-0">
            <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-sky-400 to-blue-600 flex items-center justify-center shadow-lg shadow-sky-900/40">
              <span className="text-2xl font-bold text-white select-none">AV</span>
            </div>
            <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 ring-2 ring-[#071f49]">
              <CheckCircle2 className="h-3 w-3 text-white" strokeWidth={2.5} />
            </span>
          </div>

          {/* Name + meta */}
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h2 className="text-xl font-bold text-white leading-tight">
                {profile.firstName} {profile.lastName}
              </h2>
              <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/20 border border-sky-400/30 px-2 py-0.5 text-[0.62rem] font-semibold text-sky-300">
                <BadgeCheck className="h-2.5 w-2.5" />
                Verified
              </span>
            </div>
            <p className="text-sm font-medium text-sky-300">{profile.title}</p>
            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[0.68rem] text-slate-400">
              <span className="flex items-center gap-1">
                <Building2 className="h-3 w-3 text-slate-500" />
                {profile.department}
              </span>
              <span className="flex items-center gap-1">
                <Mail className="h-3 w-3 text-slate-500" />
                {profile.email}
              </span>
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3 text-slate-500" />
                {profile.location}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3 text-slate-500" />
                Member since Jan 2024
              </span>
            </div>
          </div>

          {/* Stats */}
          <div className="flex flex-wrap gap-2 sm:flex-nowrap sm:flex-col xl:flex-row">
            <StatPill label="Devices Managed" value="12,842" sub="↑ 5.6% this week" />
            <StatPill label="Issues Resolved" value="1,891" sub="last 30 days" />
            <StatPill label="Uptime" value="99.7%" sub="all integrations" />
          </div>
        </div>

        {/* Tab-style footer strip */}
        <div className="flex items-center justify-between gap-3 border-t border-white/10 bg-white/5 px-6 py-2.5">
          <div className="flex gap-1">
            {[
              { icon: Layers, label: 'Global Admin' },
              { icon: ShieldCheck, label: 'Security Cleared' },
              { icon: Activity, label: 'Active' },
            ].map(({ icon: Icon, label }) => (
              <span key={label} className="inline-flex items-center gap-1.5 rounded-full bg-white/10 border border-white/10 px-2.5 py-1 text-[0.62rem] font-medium text-slate-300">
                <Icon className="h-3 w-3 text-sky-400" />
                {label}
              </span>
            ))}
          </div>
          {!editMode ? (
            <button
              type="button"
              onClick={() => setEditMode(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-sky-500 focus-visible:ring-2 focus-visible:ring-sky-300"
            >
              <Edit3 className="h-3 w-3" />
              Edit Profile
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleCancel}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/20"
              >
                <X className="h-3 w-3" />
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-60"
              >
                {saving ? (
                  <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-30" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  <Save className="h-3 w-3" />
                )}
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Middle row ────────────────────────────────────────────────────── */}
      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">

        {/* Personal Information */}
        <DashboardCard title="Personal Information" icon={User}>
          {editMode ? (
            <div className="space-y-3">
              {(
                [
                  { key: 'firstName', label: 'First Name' },
                  { key: 'lastName', label: 'Last Name' },
                  { key: 'email', label: 'Email' },
                  { key: 'phone', label: 'Phone' },
                  { key: 'department', label: 'Department' },
                  { key: 'title', label: 'Job Title' },
                  { key: 'location', label: 'Location' },
                  { key: 'timezone', label: 'Timezone' },
                ] as { key: keyof typeof draft; label: string }[]
              ).map(({ key, label }) => (
                <div key={key}>
                  <label className="block text-[0.62rem] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                    {label}
                  </label>
                  <input
                    value={draft[key]}
                    onChange={(e) => setDraft((prev) => ({ ...prev, [key]: e.target.value }))}
                    className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-300/40 transition"
                  />
                </div>
              ))}
            </div>
          ) : (
            <div>
              <FieldRow label="First Name" value={profile.firstName} />
              <FieldRow label="Last Name" value={profile.lastName} />
              <FieldRow label="Email" value={profile.email} />
              <FieldRow label="Phone" value={profile.phone} />
              <FieldRow label="Department" value={profile.department} />
              <FieldRow label="Job Title" value={profile.title} />
              <FieldRow label="Location" value={profile.location} />
              <FieldRow label="Timezone" value={profile.timezone} />
            </div>
          )}
        </DashboardCard>

        {/* Role & Permissions */}
        <DashboardCard title="Role & Permissions" icon={ShieldCheck}>
          <div className="space-y-4">
            {/* Role badge */}
            <div className="rounded-xl border border-slate-200/80 bg-gradient-to-br from-sky-50 to-slate-50 px-3.5 py-3">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-sky-100 flex-shrink-0">
                  <Layers className="h-5 w-5 text-sky-600" />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-900">Global Administrator</p>
                  <p className="text-[0.65rem] text-slate-500 mt-0.5">Full access across all tenants and integrations</p>
                </div>
              </div>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                <Badge label="Intune Admin" variant="blue" className="text-[0.6rem] px-1.5 py-0.5" />
                <Badge label="Kandji Admin" variant="blue" className="text-[0.6rem] px-1.5 py-0.5" />
                <Badge label="ManageEngine" variant="blue" className="text-[0.6rem] px-1.5 py-0.5" />
                <Badge label="AI Copilot" variant="orange" className="text-[0.6rem] px-1.5 py-0.5" />
              </div>
            </div>

            {/* Permissions list */}
            <div>
              <p className="text-[0.62rem] font-semibold uppercase tracking-wider text-slate-400 mb-2">Permissions</p>
              <div className="space-y-1.5">
                {permissions.map((p) => (
                  <div key={p.label} className="flex items-center gap-2">
                    {p.granted ? (
                      <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0 text-emerald-500" />
                    ) : (
                      <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 text-amber-400" />
                    )}
                    <span className={`text-xs ${p.granted ? 'text-slate-700' : 'text-slate-400'}`}>{p.label}</span>
                    {!p.granted && (
                      <span className="ml-auto text-[0.6rem] text-amber-600 font-medium">Restricted</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Access scope */}
            <div className="rounded-xl bg-slate-50 border border-slate-200/80 px-3 py-2.5">
              <p className="text-[0.62rem] font-semibold uppercase tracking-wider text-slate-400 mb-2">Access Scope</p>
              <div className="space-y-1">
                {['All tenants', 'All device platforms', 'All compliance policies', 'All integrations'].map((s) => (
                  <div key={s} className="flex items-center gap-1.5 text-[0.68rem] text-slate-700">
                    <Globe className="h-3 w-3 text-sky-500 flex-shrink-0" />
                    {s}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </DashboardCard>

        {/* Active Sessions */}
        <DashboardCard
          title="Active Sessions"
          icon={Monitor}
          action={
            <button
              type="button"
              onClick={() => notify('info', 'Sessions', 'All other sessions have been revoked')}
              className="text-[0.68rem] font-medium text-red-500 hover:text-red-600 transition focus-visible:ring-1 focus-visible:ring-red-300 rounded px-1"
            >
              Revoke all others
            </button>
          }
        >
          <div className="space-y-2.5">
            {sessions.map((s) => {
              const Icon = s.icon
              return (
                <div
                  key={s.device}
                  className={`flex items-start gap-3 rounded-xl border px-3 py-2.5 ${
                    s.current
                      ? 'border-sky-200 bg-sky-50'
                      : 'border-slate-200/80 bg-slate-50'
                  }`}
                >
                  <div className={`grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg ${s.current ? 'bg-sky-100' : 'bg-slate-200'}`}>
                    <Icon className={`h-4 w-4 ${s.current ? 'text-sky-600' : 'text-slate-500'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-xs font-semibold text-slate-900 truncate">{s.device}</p>
                      {s.current && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[0.55rem] font-bold text-emerald-700">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 inline-block animate-pulse" />
                          Current
                        </span>
                      )}
                    </div>
                    <p className="text-[0.65rem] text-slate-500 mt-0.5">{s.browser} · {s.location}</p>
                    <p className="text-[0.62rem] text-slate-400 mt-0.5 flex items-center gap-1">
                      <Clock className="h-2.5 w-2.5" />
                      {s.lastActive}
                    </p>
                  </div>
                  {!s.current && (
                    <button
                      type="button"
                      onClick={() => notify('success', 'Session Revoked', `${s.device} session has been ended`)}
                      className="flex-shrink-0 rounded-lg p-1 text-slate-400 hover:bg-red-50 hover:text-red-500 focus-visible:ring-1 focus-visible:ring-red-300 transition"
                      aria-label={`Revoke ${s.device} session`}
                    >
                      <LogOut className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </DashboardCard>
      </div>

      {/* ── Bottom row ────────────────────────────────────────────────────── */}
      <div className="grid gap-4 grid-cols-1 md:grid-cols-2">

        {/* Security */}
        <DashboardCard title="Security Settings" icon={Lock}>
          <div className="space-y-4">

            {/* 2FA */}
            <div className={`rounded-xl border px-4 py-3.5 flex items-center justify-between gap-4 ${twoFaEnabled ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
              <div className="flex items-center gap-3 min-w-0">
                <div className={`grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl ${twoFaEnabled ? 'bg-emerald-100' : 'bg-amber-100'}`}>
                  <ShieldCheck className={`h-5 w-5 ${twoFaEnabled ? 'text-emerald-600' : 'text-amber-600'}`} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-900">Two-Factor Authentication</p>
                  <p className="text-[0.65rem] text-slate-600 mt-0.5">
                    {twoFaEnabled ? 'Active — Authenticator app configured' : 'Not configured — your account is at risk'}
                  </p>
                </div>
              </div>
              <Toggle
                enabled={twoFaEnabled}
                onChange={handle2FAToggle}
                label=""
              />
            </div>

            {/* Password */}
            <div className="rounded-xl border border-slate-200/80 bg-slate-50 px-4 py-3.5">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl bg-slate-100">
                    <Key className="h-5 w-5 text-slate-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-900">Password</p>
                    <p className="text-[0.65rem] text-slate-500 mt-0.5">Last changed 45 days ago</p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  className="h-7 px-2.5 text-[0.68rem] flex-shrink-0"
                  onClick={handlePasswordChange}
                  disabled={changingPassword}
                >
                  {changingPassword ? (
                    <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-30" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  ) : 'Reset'}
                </Button>
              </div>
            </div>

            {/* Session alert toggle */}
            <div className="px-1">
              <Toggle
                enabled={sessionAlerts}
                onChange={(v) => { setSessionAlerts(v); notify('info', 'Setting Saved', v ? 'Login alerts enabled' : 'Login alerts disabled') }}
                label="Login alerts"
                description="Get notified when a new device signs in to your account"
              />
            </div>

            {/* Security score */}
            <div className="rounded-xl border border-slate-200/80 bg-white px-4 py-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[0.68rem] font-semibold text-slate-700">Security Score</p>
                <span className="text-sm font-bold text-emerald-600">87 / 100</span>
              </div>
              <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-500 transition-all" style={{ width: '87%' }} />
              </div>
              <div className="mt-2 flex items-center justify-between text-[0.6rem] text-slate-500">
                <span>Good — 2 recommendations</span>
                <button
                  type="button"
                  onClick={() => notify('info', 'Security Tips', 'Enable hardware key for a perfect score')}
                  className="text-sky-600 hover:underline focus-visible:ring-1 focus-visible:ring-sky-300 rounded"
                >
                  View tips
                </button>
              </div>
            </div>

            {/* Recent security events */}
            <div>
              <p className="text-[0.62rem] font-semibold uppercase tracking-wider text-slate-400 mb-2">Recent Events</p>
              <div className="space-y-1.5">
                {[
                  { label: 'Login from Chrome · San Francisco', time: 'Today, 9:02 AM', ok: true },
                  { label: 'Password unchanged for 45 days', time: 'Ongoing', ok: false },
                  { label: '2FA verification successful', time: 'Today, 9:02 AM', ok: true },
                ].map((ev) => (
                  <div key={ev.label} className="flex items-center gap-2 text-[0.68rem]">
                    {ev.ok
                      ? <CheckCircle2 className="h-3 w-3 flex-shrink-0 text-emerald-500" />
                      : <AlertTriangle className="h-3 w-3 flex-shrink-0 text-amber-500" />}
                    <span className="flex-1 text-slate-700 truncate">{ev.label}</span>
                    <span className="flex-shrink-0 text-slate-400">{ev.time}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </DashboardCard>

        {/* Notifications */}
        <DashboardCard title="Notification Preferences" icon={Bell}>
          <div className="space-y-4">
            {/* Channel pills */}
            <div>
              <p className="text-[0.62rem] font-semibold uppercase tracking-wider text-slate-400 mb-2">Delivery Channels</p>
              <div className="flex flex-wrap gap-2">
                {[
                  { label: 'Email', icon: Mail, active: true },
                  { label: 'In-app', icon: Bell, active: true },
                  { label: 'Slack', icon: Globe, active: false },
                  { label: 'SMS', icon: Phone, active: false },
                ].map((ch) => (
                  <button
                    key={ch.label}
                    type="button"
                    onClick={() => notify('info', 'Channel', `${ch.label} notifications — coming soon`)}
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[0.68rem] font-medium transition focus-visible:ring-2 focus-visible:ring-sky-300 ${
                      ch.active
                        ? 'border-sky-200 bg-sky-50 text-sky-700'
                        : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                    }`}
                  >
                    <ch.icon className="h-3 w-3" />
                    {ch.label}
                    {ch.active && <CheckCircle2 className="h-2.5 w-2.5 text-sky-500" />}
                  </button>
                ))}
              </div>
            </div>

            {/* Toggles */}
            <div>
              <p className="text-[0.62rem] font-semibold uppercase tracking-wider text-slate-400 mb-1">Event Notifications</p>
              <Toggle
                enabled={notifs.criticalAlerts}
                onChange={() => toggleNotif('criticalAlerts')}
                label="Critical compliance alerts"
                description="Immediate notification for high-severity policy failures"
              />
              <Toggle
                enabled={notifs.deviceNonCompliant}
                onChange={() => toggleNotif('deviceNonCompliant')}
                label="Device non-compliance"
                description="When a managed device falls out of compliance"
              />
              <Toggle
                enabled={notifs.policyChanged}
                onChange={() => toggleNotif('policyChanged')}
                label="Policy changes"
                description="When a compliance policy is created or modified"
              />
              <Toggle
                enabled={notifs.newDevice}
                onChange={() => toggleNotif('newDevice')}
                label="New device enrolled"
                description="When a new device is registered in any source"
              />
              <Toggle
                enabled={notifs.runbookComplete}
                onChange={() => toggleNotif('runbookComplete')}
                label="Runbook completed"
                description="When an automated runbook finishes execution"
              />
              <Toggle
                enabled={notifs.weeklyDigest}
                onChange={() => toggleNotif('weeklyDigest')}
                label="Weekly digest"
                description="Summary of compliance trends every Monday morning"
              />
            </div>

            {/* Quiet hours */}
            <div className={`rounded-xl border px-3.5 py-3 transition-colors ${
              quietHours.enabled
                ? 'border-sky-200/80 bg-sky-50/60'
                : 'border-slate-200/80 bg-slate-50'
            }`}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[0.68rem] font-semibold text-slate-800">Quiet Hours</p>
                <div className="flex items-center gap-1.5">
                  {quietHours.enabled ? (
                    <Badge
                      label={`${quietHours.startHour === 0 ? '12' : quietHours.startHour > 12 ? quietHours.startHour - 12 : quietHours.startHour} ${quietHours.startHour < 12 ? 'AM' : 'PM'} – ${quietHours.endHour === 0 ? '12 AM' : quietHours.endHour < 12 ? `${quietHours.endHour} AM` : quietHours.endHour === 12 ? '12 PM' : `${quietHours.endHour - 12} PM`}`}
                      variant="blue"
                      className="text-[0.6rem] px-1.5 py-0.5"
                    />
                  ) : (
                    <Badge label="Disabled" variant="gray" className="text-[0.6rem] px-1.5 py-0.5" />
                  )}
                </div>
              </div>
              <p className="text-[0.65rem] text-slate-500">
                {quietHours.enabled
                  ? 'Non-critical notifications are held during quiet hours and delivered when you wake up.'
                  : 'Quiet hours are off — notifications arrive at any time.'}
              </p>
              <button
                type="button"
                onClick={() => setQuietHoursOpen(true)}
                className="mt-2 flex items-center gap-1 text-[0.68rem] font-medium text-sky-600 hover:text-sky-700 focus-visible:ring-1 focus-visible:ring-sky-300 rounded transition"
              >
                Adjust schedule <ChevronRight className="h-3 w-3" />
              </button>
            </div>
          </div>
        </DashboardCard>
      </div>

      <QuietHoursModal
        open={quietHoursOpen}
        onClose={() => setQuietHoursOpen(false)}
        config={quietHours}
        onSave={(cfg) => setQuietHours(cfg)}
      />

    </div>
  )
}
