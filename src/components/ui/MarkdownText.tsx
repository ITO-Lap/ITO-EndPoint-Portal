import type { ReactNode } from 'react'

import { parseMarkdown } from '../../lib/markdown'

const INLINE = /(`[^`\n]+`)|(\*\*[^*\n]+?\*\*|__[^_\n]+?__)|(\[[^\]\n]+\]\([^)\s]+\))|(\*[^*\s][^*\n]*?\*)/g

function inline(text: string, keyBase: string): ReactNode[] {
  const nodes: ReactNode[] = []
  let last = 0
  let n = 0
  for (const m of text.matchAll(INLINE)) {
    const at = m.index ?? 0
    if (at > last) nodes.push(text.slice(last, at))
    const tok = m[0]
    const key = `${keyBase}-${n++}`
    if (m[1]) nodes.push(<code key={key} className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[0.92em] text-slate-800">{tok.slice(1, -1)}</code>)
    else if (m[2]) nodes.push(<strong key={key} className="font-semibold text-slate-900">{inline(tok.slice(2, -2), key)}</strong>)
    else if (m[3]) {
      const lm = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(tok)!
      nodes.push(/^(https?:|mailto:)/i.test(lm[2]!)
        ? <a key={key} href={lm[2]} target="_blank" rel="noreferrer noopener" className="text-sky-700 underline underline-offset-2 hover:text-sky-900">{lm[1]}</a>
        : lm[1])
    } else nodes.push(<em key={key}>{tok.slice(1, -1)}</em>)
    last = at + tok.length
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

const HEADING_CLASS = ['', 'text-base font-bold', 'text-sm font-bold', 'text-sm font-semibold', 'text-xs font-semibold', 'text-xs font-semibold', 'text-xs font-semibold']

/** Renders Markdown as readable, styled blocks. `compact` tightens spacing for chat bubbles. */
export function MarkdownText({ text, compact = false }: { text: string; compact?: boolean }) {
  const blocks = parseMarkdown(text)
  return (
    <div className={`break-words [overflow-wrap:anywhere] ${compact ? 'space-y-2' : 'space-y-3'}`}>
      {blocks.map((b, k) => {
        const key = `b${k}`
        switch (b.t) {
          case 'h': return <p key={key} role="heading" aria-level={Math.min(b.level + 2, 6)} className={`${HEADING_CLASS[b.level]} text-slate-800`}>{inline(b.text, key)}</p>
          case 'code': return <pre key={key} className="overflow-x-auto rounded-lg bg-slate-900 px-3 py-2 font-mono text-[0.7rem] leading-relaxed text-slate-100"><code>{b.text}</code></pre>
          case 'quote': return <blockquote key={key} className="border-l-2 border-sky-300 pl-3 text-slate-600">{inline(b.text, key)}</blockquote>
          case 'list': {
            const L = b.ordered ? 'ol' : 'ul'
            return <L key={key} className={`${b.ordered ? 'list-decimal' : 'list-disc'} space-y-1 pl-5`}>{b.items.map((it, j) => <li key={j}>{inline(it, `${key}-${j}`)}</li>)}</L>
          }
          case 'table': return (
            <div key={key} className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full border-collapse text-left text-[0.7rem]">
                <thead className="bg-slate-50"><tr>{b.head.map((c, j) => <th key={j} className="border-b border-slate-200 px-2.5 py-1.5 font-semibold text-slate-600">{inline(c, `${key}-h${j}`)}</th>)}</tr></thead>
                <tbody>{b.rows.map((r, j) => <tr key={j} className="border-b border-slate-100 last:border-0">{r.map((c, l) => <td key={l} className="px-2.5 py-1.5 align-top">{inline(c, `${key}-${j}-${l}`)}</td>)}</tr>)}</tbody>
              </table>
            </div>
          )
          default: return <p key={key} className="whitespace-pre-line">{inline(b.text, key)}</p>
        }
      })}
    </div>
  )
}
