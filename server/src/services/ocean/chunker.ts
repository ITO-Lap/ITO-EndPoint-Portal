// Splits a markdown document into retrievable sections. Each chunk remembers its heading path so an answer can cite
// "Document › Section". Pure and deterministic.

export interface DocChunk { idx: number; heading: string; text: string }

const TARGET_CHARS = 1400
const MIN_CHARS = 40

interface Section { path: string[]; lines: string[] }

export function chunkMarkdown(title: string, content: string): DocChunk[] {
  const sections: Section[] = []
  const stack: Array<{ level: number; text: string }> = []
  let current: Section = { path: [title], lines: [] }
  let inFence = false

  const flush = () => { if (current.lines.some(l => l.trim())) sections.push(current) }

  for (const raw of content.split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, '')
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence
    const m = !inFence ? /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line) : null
    if (m) {
      flush()
      const level = m[1]!.length
      while (stack.length && stack[stack.length - 1]!.level >= level) stack.pop()
      stack.push({ level, text: m[2]!.replace(/[`*_]/g, '').trim() })
      const path = stack.map(s => s.text)
      current = { path: path[0] === title ? path : [title, ...path], lines: [] }
      continue
    }
    current.lines.push(line)
  }
  flush()

  const chunks: DocChunk[] = []
  for (const section of sections) {
    const heading = section.path.join(' › ')
    for (const text of splitBody(section.lines)) {
      if (text.trim().length >= MIN_CHARS) chunks.push({ idx: chunks.length, heading, text: text.trim() })
    }
  }
  return chunks
}

/** Splits on blank lines, never inside a fenced code block, packing paragraphs up to the target size. */
function splitBody(lines: string[]): string[] {
  const blocks: string[] = []
  let buf: string[] = []
  let inFence = false
  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence
    if (!inFence && !line.trim()) { if (buf.length) { blocks.push(buf.join('\n')); buf = [] } continue }
    buf.push(line)
  }
  if (buf.length) blocks.push(buf.join('\n'))

  const out: string[] = []
  let acc = ''
  for (const block of blocks) {
    if (acc && acc.length + block.length + 2 > TARGET_CHARS) { out.push(acc); acc = '' }
    // A single oversized block (a long table or code sample) is split on line boundaries.
    if (block.length > TARGET_CHARS * 1.6) {
      if (acc) { out.push(acc); acc = '' }
      let piece = ''
      for (const l of block.split('\n')) {
        if (piece && piece.length + l.length + 1 > TARGET_CHARS) { out.push(piece); piece = '' }
        piece += (piece ? '\n' : '') + l
      }
      if (piece) out.push(piece)
      continue
    }
    acc += (acc ? '\n\n' : '') + block
  }
  if (acc) out.push(acc)
  return out
}
