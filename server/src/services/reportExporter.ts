// Report export service — PDF, Excel, CSV, and PPTX.
//
// CSV is built-in (no extra deps). Excel/PDF/PPTX use dynamic import()
// with graceful CSV fallback so the server works before packages are installed.
//
// Install: cd server && npm install exceljs pdfkit pptxgenjs

export type ExportFormat = 'csv' | 'excel' | 'pdf' | 'pptx'

export interface ReportColumn {
  key: string
  label: string
  width?: number   // chars (Excel) / points (PDF)
}

export interface ReportMeta {
  title: string
  subtitle?: string
  generatedAt: string
  generatedBy?: string
  tenantName?: string
  recordCount: number
}

export interface SummaryStat {
  label: string
  value: string
  color?: string  // hex without #, e.g. '22C55E'
}

// ─── CSV ─────────────────────────────────────────────────────────────────────

export function exportToCSV(
  data: Record<string, unknown>[],
  columns: ReportColumn[]
): string {
  const escape = (v: unknown) => {
    if (v === null || v === undefined) return ''
    return `"${String(v).replace(/"/g, '""')}"`
  }
  const header = columns.map(c => escape(c.label)).join(',')
  const rows   = data.map(row => columns.map(c => escape(row[c.key])).join(','))
  return [header, ...rows].join('\r\n')
}

// ─── Excel (ExcelJS) ──────────────────────────────────────────────────────────

export async function exportToExcel(
  data: Record<string, unknown>[],
  columns: ReportColumn[],
  meta: ReportMeta
): Promise<Buffer> {
  try {
    const ExcelJS = await import('exceljs')
    const wb     = new ExcelJS.Workbook()
    wb.creator   = meta.generatedBy ?? 'Endpoint Intelligence Platform'
    wb.created   = new Date(meta.generatedAt)

    const ws = wb.addWorksheet(meta.title.slice(0, 31))

    // Title block
    ws.mergeCells(`A1:${String.fromCharCode(64 + columns.length)}1`)
    ws.getCell('A1').value = meta.title
    ws.getCell('A1').font  = { bold: true, size: 16 }

    ws.mergeCells(`A2:${String.fromCharCode(64 + columns.length)}2`)
    ws.getCell('A2').value = meta.subtitle ?? `Generated: ${meta.generatedAt}`
    ws.getCell('A2').font  = { size: 10, color: { argb: 'FF64748B' } }

    ws.addRow([])

    // Column headers
    const headerRow = ws.addRow(columns.map(c => c.label))
    headerRow.eachCell(cell => {
      cell.font  = { bold: true, color: { argb: 'FFFFFFFF' } }
      cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE84C1E' } }
      cell.border = {
        bottom: { style: 'thin', color: { argb: 'FFCC3B16' } },
      }
    })

    // Data rows
    for (const row of data) {
      ws.addRow(columns.map(c => {
        const v = row[c.key]
        return v === null || v === undefined ? '' : String(v)
      }))
    }

    // Column widths + autofilter
    columns.forEach((col, i) => { ws.getColumn(i + 1).width = col.width ?? 22 })
    ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: columns.length } }

    const buf = await wb.xlsx.writeBuffer()
    return Buffer.from(buf)
  } catch {
    return Buffer.from(exportToCSV(data, columns))
  }
}

// ─── PDF (PDFKit) ─────────────────────────────────────────────────────────────

export async function exportToPDF(
  data: Record<string, unknown>[],
  columns: ReportColumn[],
  meta: ReportMeta
): Promise<Buffer> {
  try {
    const PDFDocument = (await import('pdfkit')).default

    return new Promise<Buffer>((resolve, reject) => {
      const doc    = new PDFDocument({ margin: 40, size: 'A4', layout: 'landscape' })
      const chunks: Buffer[] = []
      doc.on('data', c => chunks.push(c as Buffer))
      doc.on('end',  () => resolve(Buffer.concat(chunks)))
      doc.on('error', reject)

      // Header section
      doc.rect(0, 0, doc.page.width, 80).fill('#E84C1E')
      doc.fillColor('#FFFFFF')
         .fontSize(20).font('Helvetica-Bold')
         .text(meta.title, 40, 20, { align: 'left' })
      doc.fontSize(9).font('Helvetica')
         .text(`${meta.subtitle ?? ''} · Records: ${meta.recordCount} · ${meta.generatedAt}`, 40, 50)

      doc.fillColor('#1E293B').moveDown(3)

      // Column headers
      const usableWidth = doc.page.width - 80
      const colW        = usableWidth / columns.length
      const headerY     = doc.y

      doc.fontSize(8).font('Helvetica-Bold')
      columns.forEach((col, i) => {
        const x = 40 + i * colW
        doc.rect(x, headerY, colW, 16).fill('#F1F5F9').stroke('#E2E8F0')
        doc.fillColor('#475569').text(col.label, x + 4, headerY + 4, { width: colW - 8, ellipsis: true })
      })
      doc.moveDown(1.5)

      // Data rows (cap at 500 to keep file reasonable)
      doc.fontSize(7).font('Helvetica')
      const sample = data.slice(0, 500)
      sample.forEach((row, ri) => {
        if (doc.y > doc.page.height - 60) {
          doc.addPage()
          doc.y = 40
        }
        const rowY = doc.y
        const bg   = ri % 2 === 0 ? '#FFFFFF' : '#F8FAFC'
        columns.forEach((col, i) => {
          const x   = 40 + i * colW
          const val = row[col.key]
          const str = val === null || val === undefined ? '' : String(val).slice(0, 50)
          doc.rect(x, rowY, colW, 14).fill(bg).stroke('#F1F5F9')
          doc.fillColor('#1E293B').text(str, x + 4, rowY + 3, { width: colW - 8, ellipsis: true })
        })
        doc.moveDown(1)
      })

      if (data.length > 500) {
        doc.moveDown().fontSize(8).fillColor('#64748B')
           .text(`… ${data.length - 500} more records omitted. Download CSV for full dataset.`)
      }

      doc.end()
    })
  } catch {
    return Buffer.from(`${meta.title}\n\n${exportToCSV(data, columns)}`)
  }
}

// ─── PPTX (pptxgenjs) ─────────────────────────────────────────────────────────

export async function exportToPPTX(
  data: Record<string, unknown>[],
  meta: ReportMeta,
  summary: SummaryStat[]
): Promise<Buffer> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const PptxGenJS = (await import('pptxgenjs')).default as any
    const prs       = new PptxGenJS()
    prs.layout      = 'LAYOUT_WIDE'

    // ── Slide 1: Title ────────────────────────────────────────────────────────
    const title = prs.addSlide()
    title.background = { fill: '1E293B' }
    title.addText(meta.title, {
      x: 0.5, y: 1.8, w: '90%', h: 1.0,
      fontSize: 40, bold: true, color: 'FFFFFF', align: 'center',
    })
    title.addText(meta.subtitle ?? '', {
      x: 0.5, y: 3.0, w: '90%', h: 0.5,
      fontSize: 14, color: 'CBD5E1', align: 'center',
    })
    title.addText(`Generated ${meta.generatedAt}${meta.tenantName ? ' · ' + meta.tenantName : ''}`, {
      x: 0.5, y: 3.6, w: '90%', h: 0.4,
      fontSize: 11, color: '64748B', align: 'center',
    })
    title.addText('Powered by Endpoint Intelligence Platform', {
      x: 0.5, y: 6.8, w: '90%', h: 0.3,
      fontSize: 9, color: '475569', align: 'center',
    })

    // ── Slide 2: Executive Summary KPIs ──────────────────────────────────────
    if (summary.length > 0) {
      const kpi = prs.addSlide()
      kpi.addText('Executive Summary', {
        x: 0.5, y: 0.3, w: '90%', h: 0.7,
        fontSize: 26, bold: true, color: '1E293B',
      })
      kpi.addText(`${meta.recordCount} total records · ${meta.generatedAt}`, {
        x: 0.5, y: 0.95, w: '90%', h: 0.35,
        fontSize: 11, color: '64748B',
      })

      const perRow = 4
      summary.forEach((stat, i) => {
        const col = i % perRow
        const row = Math.floor(i / perRow)
        kpi.addText(
          [
            { text: stat.value, options: { fontSize: 32, bold: true, color: stat.color ?? 'E84C1E', breakLine: true } },
            { text: stat.label, options: { fontSize: 11, color: '64748B' } },
          ],
          {
            x: 0.4 + col * 3.1, y: 1.5 + row * 2.0, w: 2.9, h: 1.6,
            fill: { color: 'F8FAFC' },
            line: { color: 'E2E8F0', width: 1, dashType: 'solid' },
            align: 'center', valign: 'middle',
          }
        )
      })
    }

    // ── Slide 3: Sample Data Table ────────────────────────────────────────────
    if (data.length > 0) {
      const tableSlide = prs.addSlide()
      tableSlide.addText('Device Data Sample', {
        x: 0.5, y: 0.2, w: '90%', h: 0.6,
        fontSize: 20, bold: true, color: '1E293B',
      })
      tableSlide.addText(`Showing ${Math.min(data.length, 25)} of ${data.length} records`, {
        x: 0.5, y: 0.85, w: '90%', h: 0.3,
        fontSize: 10, color: '64748B',
      })

      const keys  = Object.keys(data[0] ?? {}).slice(0, 7)
      const rows  = [
        keys.map(k => ({
          text: k,
          options: { bold: true, color: 'FFFFFF', fill: { color: 'E84C1E' } },
        })),
        ...data.slice(0, 25).map(row =>
          keys.map(k => ({ text: String(row[k] ?? '') }))
        ),
      ]

      tableSlide.addTable(rows, {
        x: 0.4, y: 1.2, w: 12.5, h: 5.5,
        fontSize: 8, color: '1E293B',
        border: { type: 'solid', color: 'E2E8F0' },
        align: 'left',
      })
    }

    const buf = await prs.write({ outputType: 'nodebuffer' })
    return buf as Buffer
  } catch {
    const cols = Object.keys(data[0] ?? {}).map(k => ({ key: k, label: k }))
    return Buffer.from(`${meta.title}\n\n${exportToCSV(data, cols)}`)
  }
}
