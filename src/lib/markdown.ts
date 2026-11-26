// A small, dependency-free Markdown renderer for documentation snippets and assistant answers. It builds React elements
// only (never raw HTML), so document text can't inject markup; links are limited to http(s)/mailto.

export type Block =
  | { t: 'h'; level: number; text: string }
  | { t: 'p'; text: string }
  | { t: 'code'; text: string }
  | { t: 'quote'; text: string }
  | { t: 'list'; ordered: boolean; items: string[] }
  | { t: 'table'; head: string[]; rows: string[][] }

const FENCE = /^\s*```/
const HR = /^\s*([-*_])(\s*\1){2,}\s*$/
const HEADING = /^(#{1,6})\s+(.*)$/
const BULLET = /^\s*[-*+]\s+(.*)$/
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/
const TABLE_SEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/

const cells = (line: string): string[] => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim())

export function parseMarkdown(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, '\n').split('\n')
  const out: Block[] = []
  let i = 0
  const startsBlock = (l: string): boolean => FENCE.test(l) || HEADING.test(l) || HR.test(l) || BULLET.test(l) || NUMBERED.test(l) || /^\s*>/.test(l) || l.includes('|') && TABLE_SEP.test(lines[i + 1] ?? '')
  while (i < lines.length) {
    const line = lines[i]!
    if (!line.trim()) { i++; continue }
    if (FENCE.test(line)) {
      const body: string[] = []
      i++
      while (i < lines.length && !FENCE.test(lines[i]!)) body.push(lines[i++]!)
      i++
      out.push({ t: 'code', text: body.join('\n') })
      continue
    }
    if (HR.test(line)) { i++; continue }            // chunk separators and rules carry no information
    const h = HEADING.exec(line)
    if (h) { out.push({ t: 'h', level: h[1]!.length, text: h[2]!.replace(/\s+#+\s*$/, '') }); i++; continue }
    if (line.includes('|') && TABLE_SEP.test(lines[i + 1] ?? '')) {
      const head = cells(line)
      i += 2
      const rows: string[][] = []
      while (i < lines.length && lines[i]!.includes('|') && lines[i]!.trim()) rows.push(cells(lines[i++]!))
      out.push({ t: 'table', head, rows })
      continue
    }
    if (/^\s*>/.test(line)) {
      const body: string[] = []
      while (i < lines.length && /^\s*>/.test(lines[i]!)) body.push(lines[i++]!.replace(/^\s*>\s?/, ''))
      out.push({ t: 'quote', text: body.join('\n') })
      continue
    }
    const bullet = BULLET.test(line), numbered = NUMBERED.test(line)
    if (bullet || numbered) {
      const re = bullet ? BULLET : NUMBERED
      const items: string[] = []
      while (i < lines.length) {
        const m = re.exec(lines[i]!)
        if (m) { items.push(m[1]!); i++; continue }
        // an indented continuation line belongs to the previous item
        if (items.length && /^\s{2,}\S/.test(lines[i]!) && !BULLET.test(lines[i]!) && !NUMBERED.test(lines[i]!)) { items[items.length - 1] += ' ' + lines[i]!.trim(); i++; continue }
        break
      }
      out.push({ t: 'list', ordered: numbered, items })
      continue
    }
    const para: string[] = [line]
    i++
    while (i < lines.length && lines[i]!.trim() && !startsBlock(lines[i]!)) para.push(lines[i++]!)
    out.push({ t: 'p', text: para.join('\n') })
  }
  return out
}

