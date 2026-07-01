import { useState } from 'react'
import { Search, RefreshCw, Stethoscope, Ticket, Monitor, ShieldCheck, ShieldX, Clock, AlertCircle, CheckCircle2 } from 'lucide-react'
import type { EntraDevice, EntraUser } from '../../data/entraData'

interface Props { devices: EntraDevice[]; users: EntraUser[] }

export function EntraHelpdeskPanel({ devices, users }: Props) {
  const [query,   setQuery]   = useState('')
  const [result,  setResult]  = useState<{ device: EntraDevice; user: EntraUser | null } | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [diag,    setDiag]    = useState(false)
  const [ticket,  setTicket]  = useState(false)

  const handleSearch = () => {
    const q = query.toLowerCase().trim()
    if (!q) return
    const device = devices.find(d =>
      d.deviceName.toLowerCase().includes(q) ||
      d.primaryUser.toLowerCase().includes(q) ||
      d.upn.toLowerCase().includes(q)
    )
    if (device) {
      const user = users.find(u => u.upn === device.upn) ?? null
      setResult({ device, user })
    } else {
      setResult(null)
    }
  }

  const handleSync = async () => {
    setSyncing(true)
    await new Promise(r => setTimeout(r, 1800))
    setSyncing(false)
  }

  const handleDiag = async () => {
    setDiag(true)
    await new Promise(r => setTimeout(r, 2200))
    setDiag(false)
  }

  const handleTicket = async () => {
    setTicket(true)
    await new Promise(r => setTimeout(r, 1000))
    setTicket(false)
  }

  const d = result?.device
  const u = result?.user

  const getSuggestedAction = () => {
    if (!d) return null
    if (d.encryptionState === 'Not Encrypted') return 'Enable BitLocker via Intune policy push'
    if (d.defenderState === 'Inactive') return 'Re-enable Microsoft Defender via remediation script'
    if (d.pendingReboot) return 'Schedule reboot during off-hours to apply pending updates'
    if (d.daysSinceCheckIn > 7) return 'Trigger manual device sync — check network connectivity'
    return 'Device appears healthy — no immediate action required'
  }

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
          <input value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder="Search device name, user, or UPN…"
            className="h-9 w-full rounded-lg bg-slate-800 border border-slate-700 pl-8 pr-3 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-blue-500" />
        </div>
        <button type="button" onClick={handleSearch}
          className="h-9 rounded-lg bg-blue-600 px-4 text-xs font-bold text-white hover:bg-blue-500 transition">
          Lookup
        </button>
      </div>

      {/* Result */}
      {d ? (
        <div className="space-y-3">
          {/* Device header */}
          <div className="flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-800/60 px-4 py-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-blue-500/15 flex-shrink-0">
              <Monitor className="h-5 w-5 text-blue-400" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-bold text-slate-100">{d.deviceName}</p>
                <span className={`rounded-full border px-2 py-0.5 text-[0.6rem] font-bold ${
                  d.complianceState === 'Compliant' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' :
                  d.complianceState === 'Non-Compliant' ? 'bg-red-500/15 text-red-400 border-red-500/30' :
                  'bg-amber-500/15 text-amber-400 border-amber-500/30'
                }`}>{d.complianceState}</span>
              </div>
              <p className="text-xs text-slate-400">{d.primaryUser} · {d.upn}</p>
            </div>
          </div>

          {/* Status grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { label: 'OS', value: `${d.os} · ${d.osVersion}`, icon: Monitor, ok: true },
              { label: 'Last Check-In', value: `${d.daysSinceCheckIn}d ago`, icon: Clock, ok: d.daysSinceCheckIn <= 7 },
              { label: 'Encryption', value: d.encryptionState, icon: d.encryptionState === 'Encrypted' ? ShieldCheck : ShieldX, ok: d.encryptionState === 'Encrypted' },
              { label: 'Defender', value: d.defenderState, icon: d.defenderState === 'Active' ? ShieldCheck : ShieldX, ok: d.defenderState === 'Active' },
            ].map(item => {
              const Icon = item.icon
              return (
                <div key={item.label} className="rounded-lg border border-slate-700 bg-slate-800/40 px-3 py-2.5">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Icon className={`h-3.5 w-3.5 ${item.ok ? 'text-emerald-400' : 'text-red-400'}`} />
                    <span className="text-[0.6rem] text-slate-500 font-semibold uppercase tracking-wider">{item.label}</span>
                  </div>
                  <p className={`text-xs font-semibold ${item.ok ? 'text-slate-200' : 'text-red-400'}`}>{item.value}</p>
                </div>
              )
            })}
          </div>

          {/* Issues */}
          {d.openIssues.length > 0 && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/8 p-3">
              <div className="flex items-center gap-1.5 mb-2">
                <AlertCircle className="h-3.5 w-3.5 text-red-400" />
                <p className="text-xs font-bold text-red-400">Open Issues ({d.openIssues.length})</p>
              </div>
              <ul className="space-y-1">
                {d.openIssues.map(issue => (
                  <li key={issue} className="text-xs text-red-300 flex items-center gap-1.5">
                    <span className="h-1 w-1 rounded-full bg-red-400 flex-shrink-0" />
                    {issue}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Suggested action */}
          <div className="rounded-xl border border-blue-500/30 bg-blue-500/8 p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <CheckCircle2 className="h-3.5 w-3.5 text-blue-400" />
              <p className="text-xs font-bold text-blue-400">Suggested Action</p>
            </div>
            <p className="text-xs text-slate-300">{getSuggestedAction()}</p>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={handleSync} disabled={syncing}
              className="flex items-center gap-1.5 rounded-lg border border-blue-500/40 bg-blue-500/15 px-3 py-2 text-xs font-bold text-blue-400 hover:bg-blue-500/25 transition disabled:opacity-60">
              <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Syncing…' : 'Sync Device'}
            </button>
            <button type="button" onClick={handleDiag} disabled={diag}
              className="flex items-center gap-1.5 rounded-lg border border-purple-500/40 bg-purple-500/15 px-3 py-2 text-xs font-bold text-purple-400 hover:bg-purple-500/25 transition disabled:opacity-60">
              <Stethoscope className="h-3.5 w-3.5" />
              {diag ? 'Diagnosing…' : 'Run AI Diagnosis'}
            </button>
            <button type="button" onClick={handleTicket} disabled={ticket}
              className="flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/15 px-3 py-2 text-xs font-bold text-amber-400 hover:bg-amber-500/25 transition disabled:opacity-60">
              <Ticket className="h-3.5 w-3.5" />
              {ticket ? 'Creating…' : 'Create Ticket'}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center rounded-xl border border-slate-700/60 bg-slate-800/20 h-32">
          <div className="text-center">
            <Search className="mx-auto h-6 w-6 text-slate-600 mb-2" />
            <p className="text-sm text-slate-500">Search for a device or user above</p>
            <p className="text-xs text-slate-600 mt-0.5">Try: "John Doe", "LAPTOP-7XG3K2"</p>
          </div>
        </div>
      )}
    </div>
  )
}
