import { Wifi, WifiOff, Battery, BatteryCharging, Clock, Shield, ShieldAlert, ShieldCheck } from 'lucide-react'
import type { DiagnosticDevice } from '../../types'

interface Props { device: DiagnosticDevice }

function UsageBar({ value, warn = 70, critical = 90, label }: { value: number; warn?: number; critical?: number; label: string }) {
  const color = value >= critical ? 'bg-red-500' : value >= warn ? 'bg-amber-500' : 'bg-emerald-500'
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[0.65rem]">
        <span className="text-slate-500">{label}</span>
        <span className="font-semibold text-slate-800">{value}%</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${Math.min(value, 100)}%` }} />
      </div>
    </div>
  )
}

function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-[0.6rem] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <p className="text-xs font-semibold text-slate-900 leading-snug">{value}</p>
      {sub && <p className="text-[0.62rem] text-slate-500">{sub}</p>}
    </div>
  )
}

function RiskBadge({ score }: { score: number }) {
  const { label, cls } = score >= 80 ? { label: 'Critical', cls: 'bg-red-100 text-red-700 border-red-200' }
    : score >= 60 ? { label: 'High',     cls: 'bg-orange-100 text-orange-700 border-orange-200' }
    : score >= 40 ? { label: 'Medium',   cls: 'bg-amber-100 text-amber-700 border-amber-200' }
    : { label: 'Low', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' }
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${cls}`}>
      {label} ({score})
    </span>
  )
}

export function DeviceHealthCard({ device }: Props) {
  const memPct  = Math.round((device.memory.usedGb / device.memory.totalGb) * 100)
  const diskPct = Math.round((device.disk.usedGb / device.disk.totalGb) * 100)

  const complianceIcon = device.complianceState === 'Compliant' ? ShieldCheck
    : device.complianceState === 'Non-Compliant' ? ShieldAlert : Shield
  const CompIcon = complianceIcon
  const compColor = device.complianceState === 'Compliant' ? 'text-emerald-600'
    : device.complianceState === 'Non-Compliant' ? 'text-red-600' : 'text-amber-600'

  const netIcon = device.network.status === 'Connected' ? Wifi
    : device.network.status === 'Disconnected' ? WifiOff : Wifi
  const NetIcon = netIcon
  const netColor = device.network.status === 'Connected' ? 'text-emerald-600'
    : device.network.status === 'Disconnected' ? 'text-red-600' : 'text-amber-600'

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-900/5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
        <div>
          <h2 className="text-base font-bold text-slate-900">{device.deviceName}</h2>
          <p className="text-xs text-slate-500 mt-0.5">{device.user} · {device.platform} · {device.managementSource}</p>
          <p className="text-[0.65rem] text-slate-400 mt-0.5">{device.osVersion}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <RiskBadge score={device.riskScore} />
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold border-current/30 ${compColor}`}>
            <CompIcon className="h-3.5 w-3.5" />
            {device.complianceState}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-5 gap-y-4 mb-5">
        <Stat label="Uptime"     value={device.uptime} />
        <Stat label="Last Sync"  value={device.lastSync.split(' ')[1]} sub={device.lastSync.split(' ')[0]} />
        <Stat label="Memory"     value={`${device.memory.usedGb} / ${device.memory.totalGb} GB`} sub={`${memPct}% used`} />
        <Stat label="Disk"       value={`${device.disk.usedGb} / ${device.disk.totalGb} GB`} sub={`${diskPct}% used`} />
        <Stat
          label="Network"
          value={
            <span className={`flex items-center gap-1 ${netColor}`}>
              <NetIcon className="h-3.5 w-3.5" />
              {device.network.status}
            </span>
          }
          sub={device.network.ssid ?? device.network.ip ?? '—'}
        />
        <Stat
          label="Battery"
          value={device.battery ? (
            <span className="flex items-center gap-1">
              {device.battery.charging
                ? <BatteryCharging className="h-3.5 w-3.5 text-emerald-600" />
                : <Battery className={`h-3.5 w-3.5 ${device.battery.level < 20 ? 'text-red-500' : 'text-slate-600'}`} />
              }
              {device.battery.level}%
            </span>
          ) : 'N/A (Desktop)'}
          sub={device.battery ? `Health: ${device.battery.health}` : undefined}
        />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <UsageBar value={device.cpu}  label="CPU" warn={60} critical={85} />
        <UsageBar value={memPct}      label="Memory" />
        <UsageBar value={diskPct}     label="Disk" warn={75} critical={90} />
      </div>
    </div>
  )
}
