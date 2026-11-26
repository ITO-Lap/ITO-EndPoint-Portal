import { useEffect, useState } from 'react'
import { Lock, ShieldOff, AlertOctagon, RefreshCw, ChevronRight } from 'lucide-react'
import { api } from '../../api'
import { intelApi } from '../../api/intelligence'

interface SecurityWatchCardData {
  title: string
  value: number | null
  description: string
  icon: typeof Lock
  tone: 'green' | 'red' | 'amber'
  sources: string[]
  page: string
}

const TONE_STYLES: Record<SecurityWatchCardData['tone'], { bg: string; icon: string; value: string }> = {
  green: { bg: 'bg-emerald-50', icon: 'bg-emerald-100 text-emerald-600', value: 'text-emerald-700' },
  red:   { bg: 'bg-red-50',     icon: 'bg-red-100 text-red-600',        value: 'text-red-700' },
  amber: { bg: 'bg-amber-50',   icon: 'bg-amber-100 text-amber-600',    value: 'text-amber-700' },
}

interface SecurityWatchRowProps {
  onNavigate?: (page: string) => void
}

export function SecurityWatchRow({ onNavigate }: SecurityWatchRowProps) {
  const [loading, setLoading] = useState(true)
  const [encryptionGap, setEncryptionGap] = useState<number | null>(null)
  const [coverageGap, setCoverageGap] = useState<number | null>(null)
  const [highRisk, setHighRisk] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const [posture, coverage, risk] = await Promise.allSettled([
        api.fetchSecurityPosture(),
        api.fetchEndpointProtectionCoverage(),
        intelApi.riskScores(200, false),
      ])
      if (cancelled) return
      if (posture.status === 'fulfilled') {
        const pillar = posture.value.pillars.find(p => p.id === 'encryption')
        setEncryptionGap(pillar?.failing ?? null)
      }
      if (coverage.status === 'fulfilled') {
        const c = coverage.value
        // Still scanning (no result yet): leave the card empty rather than reading fields that are not there.
        if (!('scanning' in c)) setCoverageGap(c.windows.falconMissing + c.windows.zscalerMissing + c.macos.falconMissing + c.macos.zscalerMissing)
      }
      // With nothing connected the API answers without a summary: leave the card empty instead of throwing.
      if (risk.status === 'fulfilled' && risk.value?.summary) setHighRisk(risk.value.summary.critical + risk.value.summary.high)
      setLoading(false)
    }
    void load()
    return () => { cancelled = true }
  }, [])

  const cards: SecurityWatchCardData[] = [
    { title: 'Encryption gap', value: encryptionGap, description: 'devices not encrypted', icon: Lock, tone: 'green', sources: ['Intune'], page: 'Security Posture' },
    { title: 'Endpoint protection coverage', value: coverageGap, description: 'devices without protection', icon: ShieldOff, tone: 'red', sources: ['Intune + Endpoint Central'], page: 'Security Posture' },
    { title: 'High-risk devices', value: highRisk, description: 'devices with multiple risk signals', icon: AlertOctagon, tone: 'amber', sources: ['Intune + Endpoint Central'], page: 'Risk Scoring' },
  ]

  return (
    <div className="rounded-2xl border border-slate-200/60 bg-white shadow-sm p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-bold text-slate-900">Security watch</h2>
        <button onClick={() => onNavigate?.('Security Posture')} className="text-xs font-medium text-sky-600 hover:underline">View security details →</button>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {cards.map(card => {
          const styles = TONE_STYLES[card.tone]
          const Icon = card.icon
          return (
            <button
              key={card.title} type="button" onClick={() => onNavigate?.(card.page)}
              className={`group flex items-center gap-3 rounded-2xl ${styles.bg} p-4 text-left transition hover:shadow-md`}
            >
              <div className={`grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl ${styles.icon}`}>
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className={`text-2xl font-black ${styles.value}`}>{loading ? <RefreshCw className="h-5 w-5 animate-spin text-slate-300" /> : (card.value ?? '—')}</p>
                <p className="text-xs font-semibold text-slate-700 truncate">{card.title}</p>
                <p className="text-[0.65rem] text-slate-500 truncate">{card.description}</p>
              </div>
              <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-slate-300 transition group-hover:translate-x-0.5" />
            </button>
          )
        })}
      </div>
    </div>
  )
}
