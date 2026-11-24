import type { BadgeVariant } from '../../types'
import type { Risk } from '../../api/remoteActions'

export const RISK_VARIANT: Record<Risk, BadgeVariant> = { low: 'green', medium: 'yellow', high: 'orange', blocked: 'red' }

export const fmtTime = (iso?: string): string => { if (!iso) return '—'; const d = new Date(iso); return Number.isNaN(d.getTime()) ? iso : d.toLocaleString() }
export const errMsg = (e: unknown): string => e instanceof Error ? e.message : 'Something went wrong.'

export const inputCls = 'h-8 w-full rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-800 focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-300 disabled:bg-slate-50'
export const labelCls = 'mb-0.5 block text-[0.68rem] font-bold uppercase tracking-wide text-slate-500'
export const btn = 'inline-flex h-8 items-center justify-center gap-1.5 rounded-full px-4 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-50'
export const btnPrimary = `${btn} bg-sky-600 text-white hover:bg-sky-700`
export const btnOutline = `${btn} border border-slate-300 bg-white text-slate-700 hover:bg-slate-50`
export const btnDanger = `${btn} bg-red-600 text-white hover:bg-red-700`

