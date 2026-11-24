import type { ReactNode } from 'react'

export function SectionWrap({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-bold text-slate-900">{title}</h2>
        <p className="text-xs text-slate-500 mt-0.5">{description}</p>
      </div>
      {children}
    </div>
  )
}

export function DocCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-[18px] border border-slate-200 bg-white shadow-sm shadow-slate-900/5 overflow-hidden ${className}`}>
      {children}
    </div>
  )
}

export function CardHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="border-b border-slate-100 px-5 py-3.5">
      <p className="text-xs font-semibold text-slate-900">{title}</p>
      {description && <p className="text-[0.65rem] text-slate-500 mt-0.5">{description}</p>}
    </div>
  )
}

/** Paragraph block inside a card. */
export function Prose({ children }: { children: ReactNode }) {
  return <div className="px-5 py-4 space-y-2.5 text-[0.72rem] text-slate-600 leading-relaxed">{children}</div>
}

/** Two-column "term → explanation" list. */
export function FactList({ rows }: { rows: Array<[string, string]> }) {
  return (
    <div className="divide-y divide-slate-100">
      {rows.map(([k, v]) => (
        <div key={k} className="grid grid-cols-1 gap-1 px-5 py-2.5 sm:grid-cols-[11rem_1fr] sm:gap-4">
          <p className="text-[0.7rem] font-semibold text-slate-800">{k}</p>
          <p className="text-[0.72rem] text-slate-600 leading-snug">{v}</p>
        </div>
      ))}
    </div>
  )
}

/** Simple data table. */
export function DocTable({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-[0.7rem]">
        <thead className="bg-slate-50"><tr>{head.map(h => <th key={h} className="border-b border-slate-200 px-4 py-2 font-semibold text-slate-600">{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i} className="border-b border-slate-100 last:border-0">{r.map((c, j) => <td key={j} className={`px-4 py-2 align-top ${j === 0 ? 'font-semibold text-slate-800' : 'text-slate-600'}`}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  )
}
