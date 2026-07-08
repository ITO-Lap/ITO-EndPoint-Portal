import { useState, useEffect, useCallback } from 'react'
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
  Laptop2,
  ChevronRight,
  Lock,
  LogOut,
  BadgeCheck,
  Layers,
  RefreshCw,
  ServerCrash,
} from 'lucide-react'
import { api } from '../api'
import type { ProfileData, ProfileResult } from '../api'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { DashboardCard } from '../components/ui/DashboardCard'
import { useToast } from '../components/ui/ToastProvider'
import { getElevatedPages } from '../lib/permissions'
import { QuietHoursModal } from '../components/settings/QuietHoursModal'
import type { QuietHoursConfig } from '../components/settings/QuietHoursModal'

// This app has no per-user login (deliberately removed) — every page always
// runs as this one fixed admin identity. The Profile page shows that
// identity's REAL Microsoft Entra ID + Intune data (server/src/routes/profile.ts),
// not a per-session logged-in user.
const VIEWER_ROLE = 'Global Admin' as const

// ─── Types ────────────────────────────────────────────────────────────────────

interface ToggleProps {
  enabled: boolean
  onChange: (v: boolean) => void
  label: string
  description?: string
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
        className={`relative flex-shrink-0 h-5 w-9 rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-orange-300 focus-visible:ring-offset-1 ${
          enabled ? 'bg-orange-600' : 'bg-slate-200'
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
      <span className="text-[0.62rem] font-medium text-orange-200 mt-0.5 leading-tight">{label}</span>
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

/** Renders a real value, or an honest "N/A" when Entra/Intune has none. */
function val(v: string | null | undefined): string {
  return v && v.trim() ? v : 'N/A'
}

function deviceIcon(platform: string) {
  if (platform === 'macOS') return Laptop2
  if (platform === 'Android' || platform === 'iOS') return Smartphone
  return Monitor
}

function initials(name: string | null): string {
  if (!name) return '?'
  const parts = name.split(/[\s,]+/).filter(Boolean)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function formatDate(iso: string | null): string {
  if (!iso) return 'N/A'
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
  } catch { return 'N/A' }
}

const ERROR_COPY: Record<string, { title: string; body: string }> = {
  not_configured: {
    title: 'Microsoft Entra ID not connected',
    body: 'This environment has no Entra ID credentials configured. Connect Entra ID in Settings → Integrations to populate this page with real data.',
  },
  user_not_found: {
    title: 'User not found in Entra ID',
    body: 'The configured profile identity could not be found in your Entra ID tenant.',
  },
  insufficient_permissions: {
    title: 'Missing Microsoft Graph permission',
    body: 'Microsoft Graph denied this request. The app registration may be missing a required permission, or an admin needs to grant consent.',
  },
  graph_error: {
    title: 'Could not load profile data',
    body: 'Microsoft Graph returned an unexpected error.',
  },
}

// ─── Main Component ────────────────────────────────────────────────────────────

export function ProfilePage() {
  const { notify } = useToast()

  const [data, setData]           = useState<ProfileData | null>(null)
  const [errorResult, setErrorResult] = useState<Extract<ProfileResult, { success: false }> | null>(null)
  const [loading, setLoading]     = useState(true)
  const [refreshing, setRefreshing] = useState(false)

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

  const load = useCallback((isRefresh: boolean) => {
    if (isRefresh) { setRefreshing(true) } else { setLoading(true) }
    api.fetchProfile()
      .then(result => {
        if (result.success) { setData(result.data); setErrorResult(null) }
        else { setErrorResult(result); setData(null) }
      })
      .finally(() => { setLoading(false); setRefreshing(false) })
  }, [])

  useEffect(() => { load(false) }, [load])

  const handleRefresh = () => {
    load(true)
    notify('info', 'Refreshing', 'Reloading your real Entra ID + Intune profile data…')
  }

  const handleEditClick = () =>
    notify('info', 'Read-only', 'Profile data is synced from Microsoft Entra ID and can’t be edited here — update it in Entra ID directly.')

  const handleRevokeClick = () =>
    notify('info', 'Not available', 'Per-session revocation is not supported via the Microsoft Graph app-only permissions this integration uses.')

  const handlePasswordChange = async () => {
    notify('info', 'Not available', 'Password reset requires Entra ID delegated sign-in, which this app does not use.')
  }

  const handle2FAToggle = (v: boolean) => {
    setTwoFaEnabled(v)
    notify('success', v ? '2FA Enabled' : '2FA Disabled', v ? 'Two-factor authentication is now active' : 'Two-factor authentication has been turned off')
  }

  // ── Loading state ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-slate-400 gap-2">
        <RefreshCw className="h-5 w-5 animate-spin" />
        <span className="text-sm">Loading your Entra ID + Intune profile…</span>
      </div>
    )
  }

  // ── Error state ────────────────────────────────────────────────────────────
  if (errorResult) {
    const copy = ERROR_COPY[errorResult.code] ?? ERROR_COPY.graph_error
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-center max-w-lg mx-auto">
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-red-50 border border-red-200">
          <ServerCrash className="h-6 w-6 text-red-500" />
        </div>
        <p className="text-sm font-bold text-slate-800">{copy.title}</p>
        <p className="text-xs text-slate-500 leading-relaxed">{copy.body}</p>
        <p className="text-[0.65rem] text-slate-400 font-mono bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 mt-1">{errorResult.error}</p>
        <button type="button" onClick={() => load(false)}
          className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-orange-500">
          <RefreshCw className="h-3 w-3" />Try again
        </button>
      </div>
    )
  }

  if (!data) return null

  const elevatedPages = getElevatedPages(VIEWER_ROLE)
  const securityGroups = data.groups.filter(g => g.securityEnabled)
  const primaryRole = data.roles[0]?.displayName ?? VIEWER_ROLE

  return (
    <div className="space-y-5 w-full">

      {/* ── Hero card ─────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-[22px] bg-gradient-to-br from-[#141408] via-[#161602] to-[#0a0a03] border border-[#2a2a08] shadow-xl shadow-slate-900/20">
        {/* decorative rings */}
        <div className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-orange-500/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 -left-16 h-48 w-48 rounded-full bg-orange-600/10 blur-2xl" />

        <div className="relative flex flex-col gap-5 px-6 py-6 sm:flex-row sm:items-center sm:gap-7">

          {/* Avatar */}
          <div className="relative flex-shrink-0">
            <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center shadow-lg shadow-orange-900/40">
              <span className="text-2xl font-bold text-white select-none">{initials(data.displayName)}</span>
            </div>
            {data.accountEnabled && (
              <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 ring-2 ring-[#141408]">
                <CheckCircle2 className="h-3 w-3 text-white" strokeWidth={2.5} />
              </span>
            )}
          </div>

          {/* Name + meta */}
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h2 className="text-xl font-bold text-white leading-tight">
                {val(data.displayName)}
              </h2>
              {data.accountEnabled && (
                <span className="inline-flex items-center gap-1 rounded-full bg-orange-500/20 border border-orange-400/30 px-2 py-0.5 text-[0.62rem] font-semibold text-orange-300">
                  <BadgeCheck className="h-2.5 w-2.5" />
                  Verified
                </span>
              )}
            </div>
            <p className="text-sm font-medium text-orange-300">{val(data.jobTitle)}</p>
            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[0.68rem] text-slate-400">
              <span className="flex items-center gap-1">
                <Building2 className="h-3 w-3 text-slate-500" />
                {val(data.department)}
              </span>
              <span className="flex items-center gap-1">
                <Mail className="h-3 w-3 text-slate-500" />
                {val(data.mail ?? data.userPrincipalName)}
              </span>
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3 text-slate-500" />
                {val(data.officeLocation)}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3 text-slate-500" />
                Member since {formatDate(data.createdDateTime)}
              </span>
            </div>
          </div>

          {/* Stats */}
          <div className="flex flex-wrap gap-2 sm:flex-nowrap sm:flex-col xl:flex-row">
            <StatPill label="Devices Managed" value={data.tenantDeviceTotal.toLocaleString()} sub="all sources" />
            <StatPill label="Own Devices" value={String(data.ownDevices.length)} sub="Intune-enrolled" />
          </div>
        </div>

        {/* Tab-style footer strip */}
        <div className="flex items-center justify-between gap-3 border-t border-white/10 bg-white/5 px-6 py-2.5">
          <div className="flex gap-1">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 border border-white/10 px-2.5 py-1 text-[0.62rem] font-medium text-slate-300">
              <Layers className="h-3 w-3 text-orange-400" />
              {VIEWER_ROLE}
            </span>
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.62rem] font-medium ${
              data.accountEnabled ? 'bg-white/10 border-white/10 text-slate-300' : 'bg-red-500/10 border-red-400/30 text-red-300'
            }`}>
              <ShieldCheck className="h-3 w-3 text-orange-400" />
              {data.accountEnabled ? 'Account Active' : 'Account Disabled'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleRefresh}
              disabled={refreshing}
              title="Refresh from Entra ID + Intune"
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/20 disabled:opacity-60"
            >
              <RefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
            <button
              type="button"
              onClick={handleEditClick}
              className="inline-flex items-center gap-1.5 rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-orange-500 focus-visible:ring-2 focus-visible:ring-orange-300"
            >
              <Edit3 className="h-3 w-3" />
              Edit Profile
            </button>
          </div>
        </div>
      </div>

      {/* ── Middle row ────────────────────────────────────────────────────── */}
      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">

        {/* Personal Information */}
        <DashboardCard title="Personal Information" icon={User}>
          <div>
            <FieldRow label="First Name" value={val(data.givenName)} />
            <FieldRow label="Last Name" value={val(data.surname)} />
            <FieldRow label="Email" value={val(data.mail ?? data.userPrincipalName)} />
            <FieldRow label="Phone" value={val(data.mobilePhone ?? data.businessPhones[0])} />
            <FieldRow label="Department" value={val(data.department)} />
            <FieldRow label="Job Title" value={val(data.jobTitle)} />
            <FieldRow label="Location" value={val(data.officeLocation)} />
            <FieldRow label="Timezone" value="N/A" />
          </div>
          <p className="mt-3 text-[0.6rem] text-slate-400 leading-relaxed">
            Timezone isn't exposed by the Microsoft Graph permissions this app uses. Synced live from Microsoft Entra ID.
          </p>
        </DashboardCard>

        {/* Role & Permissions */}
        <DashboardCard title="Role & Permissions" icon={ShieldCheck}>
          <div className="space-y-4">
            {/* Role badge */}
            <div className="rounded-xl border border-slate-200/80 bg-gradient-to-br from-orange-50 to-slate-50 px-3.5 py-3">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-orange-100 flex-shrink-0">
                  <Layers className="h-5 w-5 text-orange-600" />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-900">{primaryRole}</p>
                  <p className="text-[0.65rem] text-slate-500 mt-0.5">
                    {data.roles.length > 0 ? `${data.roles.length} Entra ID directory role${data.roles.length !== 1 ? 's' : ''} assigned` : 'No Entra ID directory role assigned'}
                  </p>
                </div>
              </div>
              {data.roles.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {data.roles.map(r => <Badge key={r.id} label={r.displayName} variant="blue" className="text-[0.6rem] px-1.5 py-0.5" />)}
                </div>
              )}
            </div>

            {/* App role assignments */}
            <div>
              <p className="text-[0.62rem] font-semibold uppercase tracking-wider text-slate-400 mb-2">App Role Assignments</p>
              {data.apps.length === 0 ? (
                <p className="text-xs text-slate-400">No app role assignments found in Entra ID.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {data.apps.map(a => <Badge key={a.id} label={a.appDisplayName} variant="orange" className="text-[0.6rem] px-1.5 py-0.5" />)}
                </div>
              )}
            </div>

            {/* Elevated access */}
            <div>
              <p className="text-[0.62rem] font-semibold uppercase tracking-wider text-slate-400 mb-2">Elevated App Access ({VIEWER_ROLE})</p>
              <div className="space-y-1.5">
                {elevatedPages.map((p) => (
                  <div key={p} className="flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0 text-emerald-500" />
                    <span className="text-xs text-slate-700">{p}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Access scope — real security groups */}
            <div className="rounded-xl bg-slate-50 border border-slate-200/80 px-3 py-2.5">
              <p className="text-[0.62rem] font-semibold uppercase tracking-wider text-slate-400 mb-2">
                Security Groups ({securityGroups.length})
              </p>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {securityGroups.length === 0 ? (
                  <p className="text-[0.68rem] text-slate-400">No security group memberships found.</p>
                ) : securityGroups.slice(0, 8).map((g) => (
                  <div key={g.id} className="flex items-center gap-1.5 text-[0.68rem] text-slate-700">
                    <Globe className="h-3 w-3 text-orange-500 flex-shrink-0" />
                    <span className="truncate">{g.displayName}</span>
                  </div>
                ))}
                {securityGroups.length > 8 && (
                  <p className="text-[0.62rem] text-slate-400 pl-4.5">+{securityGroups.length - 8} more</p>
                )}
              </div>
            </div>
          </div>
        </DashboardCard>

        {/* Devices (real Intune-enrolled devices — Graph has no per-browser "session" concept) */}
        <DashboardCard
          title="Devices"
          icon={Monitor}
          action={
            <button
              type="button"
              onClick={handleRevokeClick}
              className="text-[0.68rem] font-medium text-red-500 hover:text-red-600 transition focus-visible:ring-1 focus-visible:ring-red-300 rounded px-1"
            >
              Revoke all others
            </button>
          }
        >
          <div className="space-y-2.5">
            {data.ownDevices.length === 0 ? (
              <p className="text-xs text-slate-400">No Intune-enrolled devices found for this user.</p>
            ) : data.ownDevices.map((d) => {
              const Icon = deviceIcon(d.platform)
              const compliant = d.complianceState === 'Compliant'
              return (
                <div
                  key={d.deviceName}
                  className={`flex items-start gap-3 rounded-xl border px-3 py-2.5 ${
                    compliant ? 'border-slate-200/80 bg-slate-50' : 'border-red-200 bg-red-50'
                  }`}
                >
                  <div className={`grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg ${compliant ? 'bg-slate-200' : 'bg-red-100'}`}>
                    <Icon className={`h-4 w-4 ${compliant ? 'text-slate-500' : 'text-red-500'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-xs font-semibold text-slate-900 truncate">{d.deviceName}</p>
                      <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[0.55rem] font-bold ${
                        compliant ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                      }`}>
                        {d.complianceState}
                      </span>
                    </div>
                    <p className="text-[0.65rem] text-slate-500 mt-0.5">{d.platform} · {d.model || 'Unknown model'}</p>
                    <p className="text-[0.62rem] text-slate-400 mt-0.5 flex items-center gap-1">
                      <Clock className="h-2.5 w-2.5" />
                      {d.lastCheckIn}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleRevokeClick}
                    className="flex-shrink-0 rounded-lg p-1 text-slate-400 hover:bg-red-50 hover:text-red-500 focus-visible:ring-1 focus-visible:ring-red-300 transition"
                    aria-label={`Manage ${d.deviceName}`}
                  >
                    <LogOut className="h-3.5 w-3.5" />
                  </button>
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
                >
                  Reset
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
                  className="text-orange-600 hover:underline focus-visible:ring-1 focus-visible:ring-orange-300 rounded"
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
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[0.68rem] font-medium transition focus-visible:ring-2 focus-visible:ring-orange-300 ${
                      ch.active
                        ? 'border-orange-200 bg-orange-50 text-orange-700'
                        : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                    }`}
                  >
                    <ch.icon className="h-3 w-3" />
                    {ch.label}
                    {ch.active && <CheckCircle2 className="h-2.5 w-2.5 text-orange-500" />}
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
                ? 'border-orange-200/80 bg-orange-50/60'
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
                className="mt-2 flex items-center gap-1 text-[0.68rem] font-medium text-orange-600 hover:text-orange-700 focus-visible:ring-1 focus-visible:ring-orange-300 rounded transition"
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
