import {
  Laptop2, Lock, Unlock, Clock, RefreshCw, Eye,
  Power, ShieldOff, Trash2,
} from 'lucide-react'
import type { UserDetails } from '../../types'
import { api } from '../../api'
import { useToast } from '../ui/ToastProvider'
import { PlatformIcon, ComplianceDot, TabLoading, EmptyTabState } from './shared'
import { usePagination } from '../../hooks/usePagination'
import { Pagination } from '../ui/Pagination'

const PAGE_SIZE = 10

export function DevicesTab({
  details, loading, onViewDevice,
}: {
  details: UserDetails | null
  loading: boolean
  onViewDevice: (deviceName: string) => void
}) {
  const { notify } = useToast()
  const devices = details?.devices ?? []
  const { page, setPage, totalPages, paginated } = usePagination(devices, PAGE_SIZE)
  if (loading) return <TabLoading />

  const handleSync = (deviceId: string | undefined, name: string) => {
    if (!deviceId) { notify('info', 'Sync', `No linked Entra device record for ${name} yet.`); return }
    api.syncEntraDevice(deviceId)
      .then(res => notify('success', 'Sync Triggered', res.message ?? `Device ${name} sync initiated`))
      .catch(() => notify('error', 'Sync Failed', `Could not trigger sync for ${name}`))
  }

  const guardedAction = (label: string, name: string) => {
    if (!window.confirm(`${label} ${name}? This is not yet wired to a live Intune action.`)) return
    notify('info', label, 'Not yet connected to live Intune remote actions — contact your Endpoint Engineer to perform this.')
  }

  if (devices.length === 0) {
    return <EmptyTabState icon={Laptop2} title="No devices assigned" subtitle="No managed devices found for this user." />
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">{devices.length} device{devices.length !== 1 ? 's' : ''} assigned</p>
      {paginated.map(d => {
        const stateColor = d.complianceState === 'Compliant' ? 'border-emerald-200 bg-emerald-50'
          : d.complianceState === 'Warning' ? 'border-amber-200 bg-amber-50'
          : 'border-red-200 bg-red-50'
        const isOff = d.encryptionStatus.toLowerCase().includes('off') || d.encryptionStatus.toLowerCase().includes('pending')
        return (
          <div key={d.deviceName} className={`rounded-2xl border p-4 ${stateColor}`}>
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2.5">
                <div className="rounded-xl bg-white/70 p-2 flex-shrink-0"><PlatformIcon platform={d.platform} /></div>
                <div>
                  <p className="text-xs font-bold text-slate-800">{d.deviceName}</p>
                  <p className="text-[0.65rem] text-slate-500">
                    {[d.manufacturer, d.model].filter(Boolean).join(' ') || d.platform} · {d.managementSource}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <ComplianceDot state={d.complianceState} />
                <span className="text-[0.65rem] font-semibold text-slate-700">{d.complianceState}</span>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Field label="OS Version" value={d.osVersion || '—'} />
              <Field label="Serial Number" value={d.serialNumber || '—'} />
              <Field label="Ownership" value={d.ownership || '—'} />
              <Field label="Join Type" value={d.joinType || '—'} />
              <Field label="Encryption" value={d.encryptionStatus} icon={isOff ? <Unlock className="h-3 w-3" /> : <Lock className="h-3 w-3" />} valueClass={isOff ? 'text-red-600' : 'text-emerald-700'} />
              <Field label="Risk Score" value={String(d.riskScore)} />
            </div>

            <div className="mt-3 flex items-center justify-between flex-wrap gap-2">
              <p className="text-[0.62rem] text-slate-400 flex items-center gap-1">
                <Clock className="h-3 w-3" />Last check-in: {d.lastCheckIn || '—'}
              </p>
              <div className="flex flex-wrap gap-1.5">
                <ActionButton icon={RefreshCw} label="Sync" onClick={() => handleSync(d.deviceId, d.deviceName)} />
                <ActionButton icon={Eye} label="View Details" onClick={() => onViewDevice(d.deviceName)} />
                <ActionButton icon={Power} label="Restart" onClick={() => guardedAction('Restart', d.deviceName)} />
                <ActionButton icon={ShieldOff} label="Remote Lock" onClick={() => guardedAction('Remote Lock', d.deviceName)} />
                <ActionButton icon={Trash2} label="Retire" onClick={() => guardedAction('Retire', d.deviceName)} destructive />
              </div>
            </div>
          </div>
        )
      })}
      <Pagination page={page} totalPages={totalPages} onPageChange={setPage}
        totalItems={devices.length} pageSize={PAGE_SIZE} itemLabel="device" />
    </div>
  )
}

function Field({ label, value, icon, valueClass = 'text-slate-700' }: { label: string; value: string; icon?: React.ReactNode; valueClass?: string }) {
  return (
    <div className="rounded-lg bg-white/60 px-3 py-2 min-w-0">
      <p className="text-[0.58rem] text-slate-400 uppercase tracking-wide">{label}</p>
      <p className={`text-[0.72rem] font-semibold mt-0.5 flex items-center gap-1 truncate ${valueClass}`}>{icon}{value}</p>
    </div>
  )
}

function ActionButton({ icon: Icon, label, onClick, destructive }: { icon: React.ElementType; label: string; onClick: () => void; destructive?: boolean }) {
  return (
    <button type="button" onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[0.65rem] font-semibold transition ${
        destructive ? 'border-red-200 bg-white text-red-600 hover:bg-red-50' : 'border-white/80 bg-white text-slate-600 hover:bg-slate-50'
      }`}>
      <Icon className="h-3 w-3" />{label}
    </button>
  )
}
