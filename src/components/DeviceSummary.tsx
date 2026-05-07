import { Laptop2, Monitor } from 'lucide-react'
import type { DeviceSummaryData } from '../types'
import { Badge } from './Badge'
import { DashboardCard } from './DashboardCard'

interface DeviceSummaryProps {
  device: DeviceSummaryData
  onSyncNow?: () => void
  syncLoading?: boolean
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
        {/* Laptop lid — dark gray, slight top-bottom gradient */}
        <linearGradient id="ds-lid" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#434d5e" />
          <stop offset="100%" stopColor="#242b37" />
        </linearGradient>

        {/* Screen background — very dark navy */}
        <linearGradient id="ds-screenbg" x1="10%" y1="0%" x2="90%" y2="100%">
          <stop offset="0%" stopColor="#060a1c" />
          <stop offset="100%" stopColor="#020510" />
        </linearGradient>

        {/* Outer petal: bright sky blue at base fading to deep navy at tip */}
        <linearGradient id="ds-petal-outer" x1="0%" y1="50%" x2="100%" y2="50%">
          <stop offset="0%"   stopColor="#93c5fd" stopOpacity="0.95" />
          <stop offset="22%"  stopColor="#38bdf8" stopOpacity="0.85" />
          <stop offset="55%"  stopColor="#1d4ed8" stopOpacity="0.6"  />
          <stop offset="100%" stopColor="#040b1c" stopOpacity="0.04" />
        </linearGradient>

        {/* Inner petal: lighter blue tones */}
        <linearGradient id="ds-petal-inner" x1="0%" y1="50%" x2="100%" y2="50%">
          <stop offset="0%"   stopColor="#bae6fd" stopOpacity="0.92" />
          <stop offset="30%"  stopColor="#60a5fa" stopOpacity="0.78" />
          <stop offset="70%"  stopColor="#3b82f6" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#040b1c" stopOpacity="0.04" />
        </linearGradient>

        {/* Clip bloom to the screen rect */}
        <clipPath id="ds-screen-clip">
          <rect x="33" y="20" width="234" height="112" rx="2" />
        </clipPath>

        {/* Drop shadow on lid */}
        <filter id="ds-lid-shadow" x="-10%" y="-5%" width="120%" height="135%">
          <feDropShadow dx="0" dy="7" stdDeviation="9" floodColor="#000000" floodOpacity="0.38" />
        </filter>

        {/* Gaussian blur for center bloom glow */}
        <filter id="ds-glow" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="5" />
        </filter>
      </defs>

      {/* ── Ground shadow ── */}
      <ellipse cx="150" cy="196" rx="114" ry="6" fill="rgba(0,0,0,0.14)" />

      {/* ── Keyboard base (rendered first so lid sits on top) ── */}
      {/* Outer base body */}
      <rect x="12" y="154" width="276" height="38" rx="5" fill="#252c39" />
      {/* Top surface of base */}
      <rect x="16" y="156" width="268" height="30" rx="3" fill="#2c3344" />
      {/* Key row 1 — function/top row */}
      <rect x="26"  y="160.5" width="248" height="3.5" rx="1.5" fill="#3b4455" opacity="0.85" />
      {/* Key row 2 */}
      <rect x="28"  y="167"   width="228" height="3.5" rx="1.5" fill="#3b4455" opacity="0.85" />
      {/* Key row 3 */}
      <rect x="30"  y="173.5" width="218" height="3.5" rx="1.5" fill="#3b4455" opacity="0.85" />
      {/* Space bar */}
      <rect x="86"  y="178.5" width="128" height="3.5" rx="1.5" fill="#3b4455" opacity="0.85" />
      {/* Touchpad */}
      <rect x="112" y="168"   width="76"  height="16"  rx="3"   fill="#1f2533" />
      <rect x="112" y="168"   width="76"  height="16"  rx="3"   fill="none" stroke="#3b4455" strokeWidth="0.8" strokeOpacity="0.7" />
      {/* Base bottom rim */}
      <rect x="8"   y="188"   width="284" height="5"   rx="2.5" fill="#1b2130" />
      {/* Rubber feet */}
      <rect x="22"  y="190"   width="14"  height="2.5" rx="1.25" fill="#161c28" />
      <rect x="264" y="190"   width="14"  height="2.5" rx="1.25" fill="#161c28" />

      {/* ── Laptop lid (with drop shadow) ── */}
      <g filter="url(#ds-lid-shadow)">
        {/* Lid outer body — dark anodized gray */}
        <rect x="18" y="6" width="264" height="148" rx="10" fill="url(#ds-lid)" />

        {/* Subtle lid edge highlight (top bevel) */}
        <rect x="18" y="6" width="264" height="3" rx="10" fill="rgba(255,255,255,0.08)" />

        {/* Screen bezel — near-black border */}
        <rect x="27" y="14" width="246" height="124" rx="5" fill="#08080e" />

        {/* Screen panel */}
        <rect x="33" y="20" width="234" height="112" rx="2" fill="url(#ds-screenbg)" />

        {/* ── Windows 11 Bloom wallpaper (clipped to screen) ── */}
        <g clipPath="url(#ds-screen-clip)">

          {/* Deep blue ambient haze behind bloom */}
          <circle cx="150" cy="76" r="56" fill="#1e3a8a" opacity="0.38" />

          {/* Outer bloom petals — 8 at 45° increments
              Shape: base at origin, tip at x=60. Gradient bright→dark left→right.
              objectBoundingBox gradient tracks each petal's own axis after rotation. */}
          <g transform="translate(150,76)">
            <path d="M0,0 C5,-10 50,-14 60,0 C50,14 5,10 0,0Z"
              fill="url(#ds-petal-outer)" opacity="0.82" transform="rotate(0)" />
            <path d="M0,0 C5,-10 50,-14 60,0 C50,14 5,10 0,0Z"
              fill="url(#ds-petal-outer)" opacity="0.68" transform="rotate(45)" />
            <path d="M0,0 C5,-10 50,-14 60,0 C50,14 5,10 0,0Z"
              fill="url(#ds-petal-outer)" opacity="0.80" transform="rotate(90)" />
            <path d="M0,0 C5,-10 50,-14 60,0 C50,14 5,10 0,0Z"
              fill="url(#ds-petal-outer)" opacity="0.63" transform="rotate(135)" />
            <path d="M0,0 C5,-10 50,-14 60,0 C50,14 5,10 0,0Z"
              fill="url(#ds-petal-outer)" opacity="0.75" transform="rotate(180)" />
            <path d="M0,0 C5,-10 50,-14 60,0 C50,14 5,10 0,0Z"
              fill="url(#ds-petal-outer)" opacity="0.60" transform="rotate(225)" />
            <path d="M0,0 C5,-10 50,-14 60,0 C50,14 5,10 0,0Z"
              fill="url(#ds-petal-outer)" opacity="0.74" transform="rotate(270)" />
            <path d="M0,0 C5,-10 50,-14 60,0 C50,14 5,10 0,0Z"
              fill="url(#ds-petal-outer)" opacity="0.60" transform="rotate(315)" />

            {/* Inner petals — 4 shorter petals offset 22.5°, lighter tones */}
            <path d="M0,0 C4,-8 32,-10 40,0 C32,10 4,8 0,0Z"
              fill="url(#ds-petal-inner)" opacity="0.88" transform="rotate(22.5)" />
            <path d="M0,0 C4,-8 32,-10 40,0 C32,10 4,8 0,0Z"
              fill="url(#ds-petal-inner)" opacity="0.88" transform="rotate(112.5)" />
            <path d="M0,0 C4,-8 32,-10 40,0 C32,10 4,8 0,0Z"
              fill="url(#ds-petal-inner)" opacity="0.82" transform="rotate(202.5)" />
            <path d="M0,0 C4,-8 32,-10 40,0 C32,10 4,8 0,0Z"
              fill="url(#ds-petal-inner)" opacity="0.82" transform="rotate(292.5)" />

            {/* Center bloom glow — blurred soft halo */}
            <circle r="18" fill="#60a5fa" opacity="0.65" filter="url(#ds-glow)" />
            {/* Center bright core */}
            <circle r="9"  fill="#bae6fd" opacity="0.80" />
            <circle r="5"  fill="#e0f9ff" opacity="0.90" />
            <circle r="2.5" fill="#ffffff" opacity="0.95" />
          </g>

          {/* Subtle screen-top glass reflection */}
          <rect x="33" y="20" width="234" height="18" rx="2" fill="rgba(255,255,255,0.045)" />
        </g>

        {/* Webcam dot */}
        <circle cx="150" cy="16" r="2.5" fill="#131820" />
        <circle cx="150" cy="16" r="1.2" fill="#1d4ed8" opacity="0.65" />

        {/* Hinge dark strip at lid bottom */}
        <rect x="18" y="151" width="264" height="3" rx="0" fill="rgba(0,0,0,0.35)" />
      </g>
    </svg>
  )
}

export function DeviceSummary({ device, onSyncNow, syncLoading = false }: DeviceSummaryProps) {
  const details = [
    { label: 'Device Name', value: device.deviceName },
    { label: 'User', value: device.user },
    { label: 'Serial No.', value: device.serialNumber },
    { label: 'OS Version', value: device.osVersion },
    { label: 'Management', value: device.managementSource },
    { label: 'Last Check-in', value: device.lastCheckIn },
  ]

  return (
    <DashboardCard title="Device Summary" icon={Laptop2}>
      <div className="grid gap-3 grid-cols-1 xl:grid-cols-[1fr_1.4fr] w-full">
        {/* Laptop illustration */}
        <div className="rounded-2xl border border-slate-200/80 bg-gradient-to-br from-[#f0f4ff] to-[#e8edf8] flex items-center justify-center py-5 px-4 min-h-[180px]">
          <LaptopIllustration />
        </div>

        {/* Device details */}
        <div className="rounded-2xl border border-slate-200/80 bg-slate-50 px-3 py-2 min-w-0 w-full">
          <div className="divide-y divide-slate-200/80">
            {details.map((detail) => (
              <div key={detail.label} className="flex items-center justify-between gap-2 py-1.5 min-w-0">
                <span className="text-[0.68rem] text-slate-500 flex-shrink-0">{detail.label}</span>
                <span className="text-[0.68rem] font-semibold text-slate-900 text-right break-all min-w-0">{detail.value}</span>
              </div>
            ))}
            <div className="flex items-center justify-between gap-2 py-1.5">
              <span className="text-[0.68rem] text-slate-500">Platform</span>
              <div className="flex items-center gap-1 text-[0.68rem] font-semibold text-slate-900">
                <Monitor className="h-3 w-3 text-sky-600 flex-shrink-0" />
                <span>Windows</span>
              </div>
            </div>
            <div className="flex items-center justify-between gap-2 py-1.5">
              <span className="text-[0.68rem] text-slate-500">Compliance</span>
              <Badge label="Non-Compliant" variant="red" className="text-[0.60rem] px-1.5 py-0.5" />
            </div>
            <div className="flex items-center justify-between gap-2 py-1.5">
              <span className="text-[0.68rem] text-slate-500">Encryption</span>
              <Badge label="BitLocker Off" variant="red" className="text-[0.60rem] px-1.5 py-0.5" />
            </div>
          </div>
          {onSyncNow && (
            <button
              onClick={onSyncNow}
              disabled={syncLoading}
              className="mt-2.5 w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-sky-700 focus-visible:ring-2 focus-visible:ring-sky-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {syncLoading ? 'Syncing...' : 'Sync Now'}
            </button>
          )}
        </div>
      </div>
    </DashboardCard>
  )
}
