import { Laptop2, Monitor } from 'lucide-react'
import type { DeviceSummaryData } from '../types'
import { Badge } from './Badge'
import { DashboardCard } from './DashboardCard'

interface DeviceSummaryProps {
  device: DeviceSummaryData
}

export function DeviceSummary({ device }: DeviceSummaryProps) {
  const details = [
    { label: 'Device Name', value: device.deviceName },
    { label: 'User', value: device.user },
    { label: 'Serial Number', value: device.serialNumber },
    { label: 'OS Version', value: device.osVersion },
    { label: 'Management Source', value: device.managementSource },
    { label: 'Last Check-in', value: device.lastCheckIn },
  ]

  return (
    <DashboardCard title="Device Summary" icon={Laptop2}>
      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr] grid-cols-1 w-full">
        <div className="rounded-[28px] border border-slate-200/80 bg-slate-950/95 p-6 text-slate-100 shadow-xl shadow-slate-950/10 min-w-0 w-full">
          <div className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-sky-600 via-blue-600 to-slate-700 p-5 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)] w-full">
            <div className="absolute -left-10 top-8 h-24 w-24 rounded-full bg-white/10 blur-2xl" />
            <div className="absolute -right-10 top-0 h-20 w-20 rounded-full bg-white/10 blur-3xl" />
            <div className="relative grid h-48 md:h-56 w-full place-items-center overflow-hidden rounded-[24px] bg-slate-950/20">
              <div className="h-full w-full rounded-[24px] bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.35),transparent_22%),radial-gradient(circle_at_bottom_right,_rgba(255,255,255,0.15),transparent_20%),linear-gradient(180deg,rgba(255,255,255,0.15),rgba(15,23,42,0.18))] p-5">
                <div className="relative flex h-full flex-col justify-between rounded-[20px] border border-white/10 bg-slate-900/80 p-4">
                  <div className="h-1/3 rounded-full bg-white/10" />
                  <div className="flex justify-between gap-4">
                    <div className="h-16 w-20 rounded-3xl bg-white/10" />
                    <div className="h-16 w-20 rounded-3xl bg-white/10" />
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="mt-5 inline-flex items-center rounded-full bg-emerald-100 px-4 py-2 text-sm font-semibold text-emerald-800 shadow-sm shadow-emerald-200/40">
            Non-Compliant
          </div>
        </div>

        <div className="rounded-[28px] border border-slate-200/80 bg-slate-50 p-6 shadow-sm shadow-slate-900/5 min-w-0 w-full">
          <div className="space-y-4 min-w-0 w-full">
            {details.map((detail) => (
              <div key={detail.label} className="grid grid-cols-[1fr_1fr] items-center gap-4 border-b border-slate-200/80 pb-4 last:border-b-0 last:pb-0 min-w-0">
                <span className="text-sm text-slate-500 min-w-0 truncate">{detail.label}</span>
                <span className="text-right text-sm font-semibold text-slate-900 min-w-0 truncate">{detail.value}</span>
              </div>
            ))}
            <div className="grid grid-cols-[1fr_1fr] items-center gap-4 pt-4">
              <span className="text-sm text-slate-500">Platform</span>
              <div className="flex items-center justify-end gap-2 text-sm font-semibold text-slate-900">
                <Monitor className="h-4 w-4 text-sky-600" />
                <span>Windows</span>
              </div>
            </div>
            <div className="grid grid-cols-[1fr_1fr] items-center gap-4 border-t border-slate-200/80 pt-4">
              <span className="text-sm text-slate-500">Compliance State</span>
              <Badge label="Non-Compliant" variant="red" className="justify-self-end" />
            </div>
            <div className="grid grid-cols-[1fr_1fr] items-center gap-4 border-t border-slate-200/80 pt-4">
              <span className="text-sm text-slate-500">Encryption Status</span>
              <Badge label="BitLocker Off" variant="red" className="justify-self-end" />
            </div>
          </div>
        </div>
      </div>
    </DashboardCard>
  )
}
