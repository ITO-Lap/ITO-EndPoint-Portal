import { Monitor, ShieldCheck, ShieldX, Clock, Users, Layers, XCircle, PackageX, Lock, Shield, RefreshCcw, AlertTriangle, Ticket, TrendingUp, TrendingDown } from 'lucide-react'
import type { EntraOverviewMetrics } from '../../data/entraData'

interface CardDef {
  key: keyof EntraOverviewMetrics
  label: string
  icon: React.ElementType
  color: string
  bg: string
  border: string
  trend: string
  trendUp: boolean
  suffix?: string
}

const CARDS: CardDef[] = [
  { key: 'totalDevices',            label: 'Total Devices',            icon: Monitor,       color: 'text-blue-400',   bg: 'bg-blue-500/10',   border: 'border-blue-500/30',   trend: '↑ 5.3% vs last 7d',  trendUp: true  },
  { key: 'compliantDevices',        label: 'Compliant Devices',        icon: ShieldCheck,   color: 'text-emerald-400',bg: 'bg-emerald-500/10',border: 'border-emerald-500/30',trend: '74.4% of total',      trendUp: true  },
  { key: 'nonCompliantDevices',     label: 'Non-Compliant',            icon: ShieldX,       color: 'text-red-400',    bg: 'bg-red-500/10',    border: 'border-red-500/30',    trend: '12.3% of total',      trendUp: false },
  { key: 'inactiveDevices',         label: 'Inactive Devices',         icon: Clock,         color: 'text-amber-400',  bg: 'bg-amber-500/10',  border: 'border-amber-500/30',  trend: '13.3% of total',      trendUp: false },
  { key: 'totalUsers',              label: 'Total Users',              icon: Users,         color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/30', trend: '↑ 3.2% vs last 7d',  trendUp: true  },
  { key: 'totalGroups',             label: 'Total Groups',             icon: Layers,        color: 'text-indigo-400', bg: 'bg-indigo-500/10', border: 'border-indigo-500/30', trend: '↑ 2.1% vs last 7d',  trendUp: true  },
  { key: 'failedPolicies',          label: 'Failed Policies',          icon: XCircle,       color: 'text-red-400',    bg: 'bg-red-500/10',    border: 'border-red-500/30',    trend: '↑ 8 vs last 7d',      trendUp: false },
  { key: 'appInstallFailures',      label: 'App Install Failures',     icon: PackageX,      color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/30', trend: '↑ 11 vs last 7d',     trendUp: false },
  { key: 'devicesMissingEncryption',label: 'Missing Encryption',       icon: Lock,          color: 'text-red-400',    bg: 'bg-red-500/10',    border: 'border-red-500/30',    trend: '5.7% of devices',     trendUp: false },
  { key: 'devicesMissingDefender',  label: 'Missing Defender',         icon: Shield,        color: 'text-red-400',    bg: 'bg-red-500/10',    border: 'border-red-500/30',    trend: '4.0% of devices',     trendUp: false },
  { key: 'pendingReboot',           label: 'Pending Reboot',           icon: RefreshCcw,    color: 'text-amber-400',  bg: 'bg-amber-500/10',  border: 'border-amber-500/30',  trend: '7.4% of devices',     trendUp: false },
  { key: 'highRiskUsers',           label: 'High Risk Users',          icon: AlertTriangle, color: 'text-red-400',    bg: 'bg-red-500/10',    border: 'border-red-500/30',    trend: '↑ 5 vs last 7d',      trendUp: false },
  { key: 'openTickets',             label: 'Open Tickets',             icon: Ticket,        color: 'text-amber-400',  bg: 'bg-amber-500/10',  border: 'border-amber-500/30',  trend: '↓ 12% vs last 7d',   trendUp: true  },
]

interface Props { metrics: EntraOverviewMetrics }

export function EntraOverviewCards({ metrics }: Props) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-7 gap-3">
      {CARDS.map(card => {
        const Icon = card.icon
        const value = metrics[card.key]
        return (
          <div key={card.key}
            className={`relative rounded-xl border ${card.border} ${card.bg} p-3.5 hover:scale-[1.02] transition-transform cursor-default overflow-hidden`}>
            {/* Subtle glow */}
            <div className="absolute -top-4 -right-4 h-14 w-14 rounded-full blur-xl opacity-30"
              style={{ background: card.color.replace('text-', 'var(--tw-text-opacity)') }} />

            <div className="relative">
              <div className="flex items-center justify-between mb-2">
                <div className={`grid h-7 w-7 place-items-center rounded-lg ${card.bg}`}>
                  <Icon className={`h-3.5 w-3.5 ${card.color}`} />
                </div>
              </div>
              <p className={`text-2xl font-black ${card.color} mono-num leading-none`}>
                {value.toLocaleString()}
              </p>
              <p className="text-[0.65rem] font-semibold text-slate-400 mt-1 leading-tight">{card.label}</p>
              <div className="flex items-center gap-1 mt-1.5">
                {card.trendUp
                  ? <TrendingUp  className="h-2.5 w-2.5 text-emerald-500 flex-shrink-0" />
                  : <TrendingDown className="h-2.5 w-2.5 text-red-400 flex-shrink-0" />
                }
                <span className={`text-[0.6rem] ${card.trendUp ? 'text-emerald-400' : 'text-red-400'}`}>
                  {card.trend}
                </span>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
