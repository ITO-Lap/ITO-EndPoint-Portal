import { Laptop2, Monitor, Copy } from 'lucide-react'
import type { DeviceSummaryData } from '../../types'
import { Badge } from '../ui/Badge'
import { DashboardCard } from '../ui/DashboardCard'

interface DeviceSummaryProps {
  device: DeviceSummaryData
  onSyncNow?: () => void
  syncLoading?: boolean
  onCopy?: (text: string, label: string) => void
}

function CopyButton({ text, label, onCopy }: { text: string; label: string; onCopy?: (text: string, label: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onCopy?.(text, label)}
      aria-label={`Copy ${label}`}
      className="ml-1 rounded p-0.5 text-slate-400 opacity-0 group-hover/row:opacity-100 hover:text-indigo-600 hover:bg-indigo-50 focus-visible:opacity-100 focus-visible:ring-1 focus-visible:ring-indigo-300 transition"
    >
      <Copy className="h-2.5 w-2.5" />
    </button>
  )
}

function LaptopIllustration() {
  return (
    <svg
      className="w-full h-auto max-w-[230px]"
      viewBox="0 0 300 200"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="ds-lid" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#434d5e" />
          <stop offset="100%" stopColor="#242b37" />
        </linearGradient>
        <linearGradient id="ds-screenbg" x1="10%" y1="0%" x2="90%" y2="100%">
          <stop offset="0%" stopColor="#060a1c" />
          <stop offset="100%" stopColor="#020510" />
        </linearGradient>
        <linearGradient id="ds-petal-outer" x1="0%" y1="50%" x2="100%" y2="50%">
          <stop offset="0%"   stopColor="#93c5fd" stopOpacity="0.95" />
          <stop offset="22%"  stopColor="#38bdf8" stopOpacity="0.85" />
          <stop offset="55%"  stopColor="#1d4ed8" stopOpacity="0.6"  />
          <stop offset="100%" stopColor="#040b1c" stopOpacity="0.04" />
        </linearGradient>
        <linearGradient id="ds-petal-inner" x1="0%" y1="50%" x2="100%" y2="50%">
          <stop offset="0%"   stopColor="#bae6fd" stopOpacity="0.92" />
          <stop offset="30%"  stopColor="#60a5fa" stopOpacity="0.78" />
          <stop offset="70%"  stopColor="#3b82f6" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#040b1c" stopOpacity="0.04" />
        </linearGradient>
        <clipPath id="ds-screen-clip">
          <rect x="33" y="20" width="234" height="112" rx="2" />
        </clipPath>
        <filter id="ds-lid-shadow" x="-10%" y="-5%" width="120%" height="135%">
          <feDropShadow dx="0" dy="7" stdDeviation="9" floodColor="#000000" floodOpacity="0.38" />
        </filter>
        <filter id="ds-glow" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="5" />
        </filter>
      </defs>

      <ellipse cx="150" cy="196" rx="114" ry="6" fill="rgba(0,0,0,0.14)" />
      <rect x="12" y="154" width="276" height="38" rx="5" fill="#252c39" />
      <rect x="16" y="156" width="268" height="30" rx="3" fill="#2c3344" />
      <rect x="26"  y="160.5" width="248" height="3.5" rx="1.5" fill="#3b4455" opacity="0.85" />
      <rect x="28"  y="167"   width="228" height="3.5" rx="1.5" fill="#3b4455" opacity="0.85" />
      <rect x="30"  y="173.5" width="218" height="3.5" rx="1.5" fill="#3b4455" opacity="0.85" />
      <rect x="86"  y="178.5" width="128" height="3.5" rx="1.5" fill="#3b4455" opacity="0.85" />
      <rect x="112" y="168"   width="76"  height="16"  rx="3"   fill="#1f2533" />
      <rect x="112" y="168"   width="76"  height="16"  rx="3"   fill="none" stroke="#3b4455" strokeWidth="0.8" strokeOpacity="0.7" />
      <rect x="8"   y="188"   width="284" height="5"   rx="2.5" fill="#1b2130" />
      <rect x="22"  y="190"   width="14"  height="2.5" rx="1.25" fill="#161c28" />
      <rect x="264" y="190"   width="14"  height="2.5" rx="1.25" fill="#161c28" />

      <g filter="url(#ds-lid-shadow)">
        <rect x="18" y="6" width="264" height="148" rx="10" fill="url(#ds-lid)" />
        <rect x="18" y="6" width="264" height="3" rx="10" fill="rgba(255,255,255,0.08)" />
        <rect x="27" y="14" width="246" height="124" rx="5" fill="#08080e" />
        <rect x="33" y="20" width="234" height="112" rx="2" fill="url(#ds-screenbg)" />
        <g clipPath="url(#ds-screen-clip)">
          <circle cx="150" cy="76" r="56" fill="#1e3a8a" opacity="0.38" />
          <g transform="translate(150,76)">
            <path d="M0,0 C5,-10 50,-14 60,0 C50,14 5,10 0,0Z" fill="url(#ds-petal-outer)" opacity="0.82" transform="rotate(0)" />
            <path d="M0,0 C5,-10 50,-14 60,0 C50,14 5,10 0,0Z" fill="url(#ds-petal-outer)" opacity="0.68" transform="rotate(45)" />
            <path d="M0,0 C5,-10 50,-14 60,0 C50,14 5,10 0,0Z" fill="url(#ds-petal-outer)" opacity="0.80" transform="rotate(90)" />
            <path d="M0,0 C5,-10 50,-14 60,0 C50,14 5,10 0,0Z" fill="url(#ds-petal-outer)" opacity="0.63" transform="rotate(135)" />
            <path d="M0,0 C5,-10 50,-14 60,0 C50,14 5,10 0,0Z" fill="url(#ds-petal-outer)" opacity="0.75" transform="rotate(180)" />
            <path d="M0,0 C5,-10 50,-14 60,0 C50,14 5,10 0,0Z" fill="url(#ds-petal-outer)" opacity="0.60" transform="rotate(225)" />
            <path d="M0,0 C5,-10 50,-14 60,0 C50,14 5,10 0,0Z" fill="url(#ds-petal-outer)" opacity="0.74" transform="rotate(270)" />
            <path d="M0,0 C5,-10 50,-14 60,0 C50,14 5,10 0,0Z" fill="url(#ds-petal-outer)" opacity="0.60" transform="rotate(315)" />
            <path d="M0,0 C4,-8 32,-10 40,0 C32,10 4,8 0,0Z" fill="url(#ds-petal-inner)" opacity="0.88" transform="rotate(22.5)" />
            <path d="M0,0 C4,-8 32,-10 40,0 C32,10 4,8 0,0Z" fill="url(#ds-petal-inner)" opacity="0.88" transform="rotate(112.5)" />
            <path d="M0,0 C4,-8 32,-10 40,0 C32,10 4,8 0,0Z" fill="url(#ds-petal-inner)" opacity="0.82" transform="rotate(202.5)" />
            <path d="M0,0 C4,-8 32,-10 40,0 C32,10 4,8 0,0Z" fill="url(#ds-petal-inner)" opacity="0.82" transform="rotate(292.5)" />
            <circle r="18" fill="#60a5fa" opacity="0.65" filter="url(#ds-glow)" />
            <circle r="9"  fill="#bae6fd" opacity="0.80" />
            <circle r="5"  fill="#e0f9ff" opacity="0.90" />
            <circle r="2.5" fill="#ffffff" opacity="0.95" />
          </g>
          <rect x="33" y="20" width="234" height="18" rx="2" fill="rgba(255,255,255,0.045)" />
        </g>
        <circle cx="150" cy="16" r="2.5" fill="#131820" />
        <circle cx="150" cy="16" r="1.2" fill="#1d4ed8" opacity="0.65" />
        <rect x="18" y="151" width="264" height="3" rx="0" fill="rgba(0,0,0,0.35)" />
      </g>
    </svg>
  )
}

export function DeviceSummary({ device, onSyncNow, syncLoading = false, onCopy }: DeviceSummaryProps) {
  const copyableRows = [
    { label: 'Device Name', value: device.deviceName, copyable: false },
    { label: 'User', value: device.user, copyable: true },
    { label: 'Serial No.', value: device.serialNumber, copyable: true },
    { label: 'OS Version', value: device.osVersion, copyable: false },
    { label: 'Management', value: device.managementSource, copyable: false },
    { label: 'Last Check-in', value: device.lastCheckIn, copyable: false },
  ]

  const platformIcon = device.platform === 'macOS' ? Monitor : Laptop2

  return (
    <DashboardCard title="Device Summary" icon={platformIcon}>
      <div className="grid gap-3 grid-cols-1 xl:grid-cols-[1fr_1.4fr] w-full">
        {/* Laptop illustration */}
        <div className="rounded-2xl border border-slate-200/80 bg-gradient-to-br from-[#f0f4ff] to-[#e8edf8] flex items-center justify-center py-5 px-4 min-h-[180px]">
          <LaptopIllustration />
        </div>

        {/* Device details */}
        <div className="rounded-2xl border border-slate-200/80 bg-slate-50 px-3 py-2 min-w-0 w-full">
          <div className="divide-y divide-slate-200/80">
            {copyableRows.map((row) => (
              <div key={row.label} className="group/row flex items-center justify-between gap-2 py-1.5 min-w-0">
                <span className="text-[0.68rem] text-slate-500 flex-shrink-0">{row.label}</span>
                <div className="flex items-center min-w-0">
                  <span className="text-[0.68rem] font-semibold text-slate-900 text-right break-all min-w-0">{row.value}</span>
                  {row.copyable && <CopyButton text={row.value} label={row.label} onCopy={onCopy} />}
                </div>
              </div>
            ))}
            <div className="flex items-center justify-between gap-2 py-1.5">
              <span className="text-[0.68rem] text-slate-500">Platform</span>
              <div className="flex items-center gap-1 text-[0.68rem] font-semibold text-slate-900">
                <Monitor className="h-3 w-3 text-indigo-600 flex-shrink-0" />
                <span>{device.platform}</span>
              </div>
            </div>
            <div className="flex items-center justify-between gap-2 py-1.5">
              <span className="text-[0.68rem] text-slate-500">Compliance</span>
              <Badge
                label={device.complianceState}
                variant={device.complianceState === 'Compliant' ? 'green' : device.complianceState === 'Warning' ? 'yellow' : 'red'}
                className="text-[0.60rem] px-1.5 py-0.5"
              />
            </div>
            <div className="flex items-center justify-between gap-2 py-1.5">
              <span className="text-[0.68rem] text-slate-500">Encryption</span>
              <Badge
                label={device.encryptionStatus}
                variant={/encrypt|on|luks|enabled/i.test(device.encryptionStatus) && !/off|pending|not /i.test(device.encryptionStatus) ? 'green' : 'red'}
                className="text-[0.60rem] px-1.5 py-0.5"
              />
            </div>
          </div>
          {onSyncNow && (
            <button
              onClick={onSyncNow}
              disabled={syncLoading}
              className="mt-2.5 w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-700 focus-visible:ring-2 focus-visible:ring-indigo-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {syncLoading ? (
                <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-30" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              )}
              {syncLoading ? 'Syncing…' : 'Sync Now'}
            </button>
          )}
        </div>
      </div>
    </DashboardCard>
  )
}
