import { useState, useEffect } from 'react'
import {
  RefreshCw, Trash2, Eye, EyeOff, KeyRound, RotateCcw,
  AlertTriangle, CheckCircle2, Clock, ShieldOff, Laptop,
} from 'lucide-react'
import { intuneHealthApi } from '../../../api'
import type { StaleDevice, BitLockerDevice } from '../../../api'
import { useToast } from '../../ui/ToastProvider'

function riskBadge(level: string) {
  const map: Record<string, string> = {
    Critical: 'bg-red-100 text-red-700 border border-red-200',
    High:     'bg-orange-100 text-orange-700 border border-orange-200',
    Medium:   'bg-amber-100 text-amber-700 border border-amber-200',
    Low:      'bg-slate-100 text-slate-600 border border-slate-200',
  }
  return `inline-flex items-center rounded-full px-2 py-0.5 text-[0.62rem] font-bold ${map[level] ?? map.Low}`
}

function reltime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const d = Math.floor(diff / 86_400_000)
  return `${d} day${d !== 1 ? 's' : ''} ago`
}

export function DeviceLifecycleTab() {
  const [staleDevices, setStaleDevices]     = useState<StaleDevice[]>([])
  const [bitlockerDevices, setBitlocker]    = useState<BitLockerDevice[]>([])
  const [selectedIds, setSelectedIds]       = useState<Set<string>>(new Set())
  const [cleanupAction, setCleanupAction]   = useState<'retire' | 'wipe' | 'disable' | 'delete'>('retire')
  const [staleDays, setStaleDays]           = useState(30)
  const [loading, setLoading]               = useState(true)
  const [revealedKey, setRevealedKey]       = useState<Record<string, string>>({})
  const [loadingKey, setLoadingKey]         = useState<string | null>(null)
  const [cleaning, setCleaning]             = useState(false)
  const [rotating, setRotating]             = useState<string | null>(null)
  const { showToast } = useToast()

  const load = async () => {
    setLoading(true)
    try {
      const [sd, bl] = await Promise.all([
        intuneHealthApi.getStaleDevices(staleDays),
        intuneHealthApi.getBitLockerDevices(),
      ])
      setStaleDevices(sd)
      setBitlocker(bl)
    } catch {
      showToast('Failed to load device lifecycle data', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [staleDays])

  const toggleSelect = (id: string) => setSelectedIds(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const handleCleanup = async () => {
    if (selectedIds.size === 0) { showToast('Select at least one device', 'warning'); return }
    setCleaning(true)
    try {
      await intuneHealthApi.cleanupDevices([...selectedIds], cleanupAction)
      showToast(`${cleanupAction.charAt(0).toUpperCase() + cleanupAction.slice(1)} queued for ${selectedIds.size} device(s)`, 'success')
      setSelectedIds(new Set())
      void load()
    } catch {
      showToast('Cleanup action failed', 'error')
    } finally {
      setCleaning(false)
    }
  }

  const handleRevealKey = async (deviceId: string) => {
    if (revealedKey[deviceId]) {
      setRevealedKey(prev => { const n = { ...prev }; delete n[deviceId]; return n })
      return
    }
    setLoadingKey(deviceId)
    try {
      const result = await intuneHealthApi.getBitLockerKey(deviceId)
      setRevealedKey(prev => ({ ...prev, [deviceId]: result.recoveryKey }))
      showToast('Recovery key retrieved — access logged for audit', 'success')
    } catch {
      showToast('Failed to retrieve recovery key', 'error')
    } finally {
      setLoadingKey(null)
    }
  }

  const handleRotate = async (deviceId: string) => {
    setRotating(deviceId)
    try {
      await intuneHealthApi.rotateBitLockerKey(deviceId)
      showToast('Key rotation initiated — new key will be escrowed on next device sync', 'success')
    } catch {
      showToast('Key rotation failed', 'error')
    } finally {
      setRotating(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#F46C00] border-t-transparent" />
        <span className="ml-3 text-sm text-slate-500">Loading device lifecycle data…</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* ── Stale Device Cleanup ─────────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm overflow-hidden">
        <div className="h-[3px] bg-gradient-to-r from-amber-400 to-red-500" />
        <div className="px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <h3 className="text-xs font-bold text-slate-900">Stale Device Cleanup</h3>
              <p className="text-[0.62rem] text-slate-500 mt-0.5">Devices that haven't checked in for {staleDays}+ days</p>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={staleDays}
                onChange={e => setStaleDays(Number(e.target.value))}
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#F46C00]/30"
              >
                {[14, 30, 45, 60, 90].map(d => (
                  <option key={d} value={d}>{d} days</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => void load()}
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
              >
                <RefreshCw className="h-3.5 w-3.5" />Refresh
              </button>
            </div>
          </div>

          {staleDevices.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 py-10 text-center">
              <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-400 mb-2" />
              <p className="text-xs font-semibold text-slate-600">No stale devices found for {staleDays}+ days</p>
            </div>
          ) : (
            <>
              <div className="space-y-2 mb-4">
                {staleDevices.map(d => (
                  <div
                    key={d.id}
                    onClick={() => toggleSelect(d.id)}
                    className={`rounded-xl border px-4 py-3 cursor-pointer transition ${
                      selectedIds.has(d.id)
                        ? 'border-[#F46C00]/40 bg-orange-50'
                        : 'border-slate-100 bg-slate-50 hover:border-slate-200'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(d.id)}
                          onChange={() => toggleSelect(d.id)}
                          onClick={e => e.stopPropagation()}
                          className="mt-1 h-3.5 w-3.5 rounded accent-[#F46C00]"
                        />
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <Laptop className="h-3.5 w-3.5 text-slate-500" />
                            <span className="text-xs font-bold text-slate-900">{d.deviceName}</span>
                            <span className={riskBadge(d.riskLevel)}>{d.riskLevel} Risk</span>
                          </div>
                          <p className="text-[0.65rem] text-slate-500 mt-0.5">{d.userEmail} · {d.platform} · {d.managementSource}</p>
                          <p className="text-[0.63rem] text-amber-600 font-medium mt-1">{d.recommendation}</p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[0.62rem] font-bold text-slate-900">{d.daysSinceCheckIn}d offline</p>
                        <p className="text-[0.6rem] text-slate-400">Last: {reltime(d.lastCheckIn)}</p>
                        <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[0.6rem] font-semibold ${
                          d.complianceState === 'Non-Compliant' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                        }`}>{d.complianceState}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Bulk cleanup toolbar */}
              {selectedIds.size > 0 && (
                <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[#F46C00]/20 bg-orange-50 px-4 py-3">
                  <span className="text-xs font-bold text-[#F46C00]">{selectedIds.size} device{selectedIds.size > 1 ? 's' : ''} selected</span>
                  <div className="flex items-center gap-2 ml-auto flex-wrap">
                    <select
                      value={cleanupAction}
                      onChange={e => setCleanupAction(e.target.value as typeof cleanupAction)}
                      className="rounded-lg border border-[#F46C00]/30 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 focus:outline-none"
                    >
                      <option value="retire">Retire (Safe)</option>
                      <option value="disable">Disable MDM</option>
                      <option value="wipe">Wipe Device</option>
                      <option value="delete">Delete Record</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => void handleCleanup()}
                      disabled={cleaning}
                      className="inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-bold text-white shadow-sm transition disabled:opacity-50"
                      style={{ background: 'linear-gradient(90deg, #F46C00 0%, #FB471F 100%)' }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      {cleaning ? 'Processing…' : 'Apply Action'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedIds(new Set())}
                      className="text-xs text-slate-500 hover:text-slate-700 transition"
                    >
                      Clear
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── BitLocker Key Management ─────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm overflow-hidden">
        <div className="h-[3px] bg-gradient-to-r from-violet-400 to-indigo-500" />
        <div className="px-5 py-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-xs font-bold text-slate-900">BitLocker Key Management</h3>
              <p className="text-[0.62rem] text-slate-500 mt-0.5">Retrieve and rotate BitLocker recovery keys from Intune escrow</p>
            </div>
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-1.5">
              <p className="text-[0.62rem] font-semibold text-amber-700">Key retrieval is audit-logged</p>
            </div>
          </div>

          <div className="space-y-3">
            {bitlockerDevices.map(d => {
              const key = revealedKey[d.id]
              const rotationOverdue = d.rotationDue ? new Date(d.rotationDue).getTime() < Date.now() : false

              return (
                <div key={d.id} className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-slate-900">{d.deviceName}</span>
                        {d.bitlockerStatus === 'Encrypted' && d.keyEscrowed ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[0.6rem] font-bold text-emerald-700">
                            <CheckCircle2 className="h-3 w-3" />Encrypted & Escrowed
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[0.6rem] font-bold text-red-700">
                            <ShieldOff className="h-3 w-3" />{d.bitlockerStatus}
                          </span>
                        )}
                        {rotationOverdue && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[0.6rem] font-bold text-amber-700">
                            <Clock className="h-3 w-3" />Rotation Overdue
                          </span>
                        )}
                      </div>
                      <p className="text-[0.65rem] text-slate-500 mt-0.5">{d.userEmail}</p>

                      {key && (
                        <div className="mt-2 rounded-lg bg-violet-50 border border-violet-200 px-3 py-2">
                          <p className="text-[0.6rem] font-semibold text-violet-600 mb-1">Recovery Key</p>
                          <p className="font-mono text-xs font-bold text-violet-900 break-all">{key}</p>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col gap-2 shrink-0">
                      {d.keyEscrowed && (
                        <>
                          <button
                            type="button"
                            onClick={() => void handleRevealKey(d.id)}
                            disabled={loadingKey === d.id}
                            className="inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-[0.65rem] font-bold text-violet-700 hover:bg-violet-100 disabled:opacity-50 transition"
                          >
                            {loadingKey === d.id ? <RefreshCw className="h-3 w-3 animate-spin" /> : key ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                            {loadingKey === d.id ? 'Fetching…' : key ? 'Hide Key' : 'View Key'}
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleRotate(d.id)}
                            disabled={rotating === d.id}
                            className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-[0.65rem] font-bold text-amber-700 hover:bg-amber-100 disabled:opacity-50 transition"
                          >
                            <RotateCcw className="h-3 w-3" />
                            {rotating === d.id ? 'Rotating…' : 'Rotate Key'}
                          </button>
                        </>
                      )}
                      {!d.keyEscrowed && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-1 text-[0.62rem] font-bold text-red-700">
                          <AlertTriangle className="h-3 w-3" />No Key Escrowed
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-start gap-3">
              <KeyRound className="h-5 w-5 text-slate-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-[0.68rem] font-bold text-slate-700">Recovery Key Compliance</p>
                <p className="text-[0.62rem] text-slate-500 mt-0.5 leading-relaxed">
                  All BitLocker recovery key retrievals are logged to your security audit trail. Keys are automatically escrowed to Intune when BitLocker is enforced via configuration profile. Devices showing "No Key Escrowed" require a BitLocker enforcement policy to be pushed.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
