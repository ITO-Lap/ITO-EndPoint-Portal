// Excel workbook + Slack delivery for the duplicate Entra device objects report.
//   Summary             — headline counts, breakdown by confidence / join type / OS, largest groups
//   Duplicate Groups    — every object in every duplicate group (group, Object ID, Device ID, activity, recommendation)
//   Cleanup Candidates  — only the objects recommended for cleanup, oldest first

import { collectDuplicateDeviceReport, INACTIVE_DAYS, osFamily, type DuplicateDeviceReport, type DuplicateObjectRow } from './entraDuplicateDevices.js'
import { sendSlackBlocks, uploadSlackFile } from './slack.js'
import { addDataQualitySheet, dataNotesText } from './dataQuality.js'
import { getSlackConfig } from '../store/integrationStore.js'

const HEADER_FILL = 'FF0F172A'

export interface DuplicateSummary {
  totalEntraDevices: number
  groups: number
  highConfidenceGroups: number
  mediumConfidenceGroups: number
  objectsInGroups: number
  cleanupCandidates: number
}

export function summarize(report: DuplicateDeviceReport): DuplicateSummary {
  const rows = report.groups.flatMap(g => g.rows)
  return {
    totalEntraDevices: report.totalEntraDevices, groups: report.groups.length,
    highConfidenceGroups: report.groups.filter(g => g.confidence === 'High').length,
    mediumConfidenceGroups: report.groups.filter(g => g.confidence === 'Medium').length,
    objectsInGroups: rows.length, cleanupCandidates: rows.filter(r => r.recommendation === 'Cleanup candidate').length,
  }
}

export function buildDuplicateMessage(report: DuplicateDeviceReport, date: string): { text: string; blocks: unknown[] } {
  const s = summarize(report)
  const fields = [
    { type: 'mrkdwn', text: `*Entra device objects*\n${s.totalEntraDevices}` },
    { type: 'mrkdwn', text: `*Duplicate groups*\n${s.groups}` },
    { type: 'mrkdwn', text: `*High-confidence groups*\n${s.highConfidenceGroups}` },
    { type: 'mrkdwn', text: `*Objects in duplicate groups*\n${s.objectsInGroups}` },
    { type: 'mrkdwn', text: `*Cleanup candidates*\n${s.cleanupCandidates}` },
  ]
  const action = s.cleanupCandidates
    ? `Review ${s.cleanupCandidates} cleanup candidate${s.cleanupCandidates === 1 ? '' : 's'}${s.highConfidenceGroups ? `, starting with the ${s.highConfidenceGroups} high-confidence group${s.highConfidenceGroups === 1 ? '' : 's'}` : ''}. Disable first, delete after a hold period.`
    : s.groups ? 'Every duplicate object was recently active. Review the groups before removing anything.' : 'No duplicate device objects found.'
  const notes = dataNotesText(report.dataChecks)
  const blocks: unknown[] = [
    { type: 'header', text: { type: 'plain_text', text: `Duplicate Entra Device Objects · ${date}` } },
    { type: 'section', fields },
    { type: 'section', text: { type: 'mrkdwn', text: `*Recommended action*\n${action}` } },
    ...(notes ? [{ type: 'section', text: { type: 'mrkdwn', text: `*Data quality*\n${notes}` } }] : []),
    { type: 'context', elements: [{ type: 'mrkdwn', text: 'Matched on Device ID, serial number (via Intune) or device name · EndPoint+' }] },
  ]
  return { text: `Duplicate Entra device objects ${date}: ${s.groups} groups, ${s.cleanupCandidates} cleanup candidates`, blocks }
}

interface Column { header: string; key: keyof DuplicateObjectRow; width: number }
const COLUMNS: Column[] = [
  { header: 'Group', key: 'groupId', width: 10 }, { header: 'Objects in Group', key: 'groupSize', width: 10 }, { header: 'Confidence', key: 'confidence', width: 11 },
  { header: 'Matched On', key: 'matchedOn', width: 26 }, { header: 'Recommendation', key: 'recommendation', width: 18 },
  { header: 'Device Name', key: 'displayName', width: 26 }, { header: 'Object ID', key: 'objectId', width: 38 }, { header: 'Device ID', key: 'deviceId', width: 38 },
  { header: 'OS', key: 'operatingSystem', width: 12 }, { header: 'OS Version', key: 'osVersion', width: 16 }, { header: 'Join Type', key: 'joinType', width: 16 },
  { header: 'Intune Managed', key: 'intuneManaged', width: 10 }, { header: 'Compliant', key: 'compliant', width: 10 }, { header: 'Enabled', key: 'enabled', width: 9 },
  { header: 'Registered', key: 'registered', width: 12 }, { header: 'Last Sign-in', key: 'lastSignIn', width: 12 }, { header: 'Days Inactive', key: 'daysInactive', width: 10 },
  { header: 'Serial Number (Intune)', key: 'serialNumber', width: 20 }, { header: 'Primary User (Intune)', key: 'primaryUser', width: 30 }, { header: 'Note', key: 'note', width: 60 },
]

export async function buildDuplicateDevicesWorkbook(report: DuplicateDeviceReport, now = new Date()): Promise<Buffer> {
  const { default: ExcelJS } = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  wb.creator = 'EndPoint+'
  wb.created = now
  const date = now.toISOString().slice(0, 10)
  const s = summarize(report)
  const allRows = report.groups.flatMap(g => g.rows)

  // Summary
  const ws = wb.addWorksheet('Summary')
  ws.columns = [{ width: 38 }, { width: 14 }, { width: 14 }, { width: 14 }]
  ws.mergeCells('A1:D1')
  ws.getCell('A1').value = `Duplicate Entra Device Objects · ${date}`
  ws.getCell('A1').font = { bold: true, size: 16 }
  ws.mergeCells('A2:D2')
  ws.getCell('A2').value = 'Objects are grouped when they share a Device ID, a serial number (via Intune) or a device name + OS. The newest-active object in each group is marked Keep.'
  ws.getCell('A2').font = { size: 10, color: { argb: 'FF64748B' } }
  ws.getCell('A2').alignment = { wrapText: true, vertical: 'top' }
  ws.getRow(2).height = 30

  let r = 4
  const heading = (text: string) => { ws.getCell(`A${r}`).value = text; ws.getCell(`A${r}`).font = { bold: true, size: 12 }; r++ }
  const line = (label: string, value: number | string) => { ws.getCell(`A${r}`).value = label; ws.getCell(`B${r}`).value = value; r++ }
  heading('Headline')
  line('Entra device objects', s.totalEntraDevices)
  line('Duplicate groups', s.groups)
  line('  High confidence (Device ID or serial match)', s.highConfidenceGroups)
  line('  Medium confidence (name match only)', s.mediumConfidenceGroups)
  line('Objects in duplicate groups', s.objectsInGroups)
  line('Cleanup candidates', s.cleanupCandidates)
  ws.getCell(`A${r - 1}`).font = { bold: true }
  ws.getCell(`B${r - 1}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: s.cleanupCandidates ? 'FFFEE2E2' : 'FFDCFCE7' } }
  line('Duplicate objects as % of all Entra devices', s.totalEntraDevices ? s.objectsInGroups / s.totalEntraDevices : 0)
  ws.getCell(`B${r - 1}`).numFmt = '0.0%'
  r++

  const breakdown = (title: string, keyFn: (row: DuplicateObjectRow) => string) => {
    heading(title)
    const counts = new Map<string, number>()
    for (const row of allRows) counts.set(keyFn(row), (counts.get(keyFn(row)) ?? 0) + 1)
    for (const [k, v] of [...counts].sort((a, b) => b[1] - a[1])) line(k || 'Unknown', v)
    r++
  }
  breakdown('Duplicate objects by join type', row => row.joinType)
  breakdown('Duplicate objects by OS', row => ({ windows: 'Windows', macos: 'macOS', ios: 'iOS / iPadOS', android: 'Android' } as Record<string, string>)[osFamily(row.operatingSystem)] ?? row.operatingSystem)

  heading('Largest duplicate groups')
  for (const g of [...report.groups].sort((a, b) => b.rows.length - a.rows.length).slice(0, 10)) {
    ws.getCell(`A${r}`).value = `${g.id} · ${g.rows[0]!.displayName}`
    ws.getCell(`B${r}`).value = g.rows.length
    ws.getCell(`C${r}`).value = g.confidence
    r++
  }
  if (!report.groups.length) line('No duplicate device objects found.', '')
  if (!report.intuneJoined) {
    r++
    ws.getCell(`A${r}`).value = 'Note: Intune was unavailable, so serial-number matching was skipped.'
    ws.getCell(`A${r}`).font = { italic: true, color: { argb: 'FFB45309' } }
  }

  // Detail sheets
  const addDetail = (name: string, rows: DuplicateObjectRow[], emptyNote: string) => {
    const sheet = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1, xSplit: 6 }] })
    sheet.columns = COLUMNS.map(c => ({ header: c.header, key: c.key, width: c.width }))
    sheet.getRow(1).eachCell(c => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } } })
    if (!rows.length) { sheet.addRow({ groupId: emptyNote }); return }
    for (const row of rows) {
      const added = sheet.addRow(row)
      const argb = row.recommendation === 'Keep' ? 'FFDCFCE7' : row.recommendation === 'Cleanup candidate' ? 'FFFEE2E2' : 'FFFEF9C3'
      added.getCell('recommendation').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } }
    }
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COLUMNS.length } }
  }
  addDetail('Duplicate Groups', allRows, 'No duplicate device objects found.')
  addDetail('Cleanup Candidates', allRows.filter(x => x.recommendation === 'Cleanup candidate')
    .sort((a, b) => (b.daysInactive ?? Infinity) - (a.daysInactive ?? Infinity)), `No cleanup candidates (objects inactive for ${INACTIVE_DAYS}+ days and older than the newest in their group).`)

  addDataQualitySheet(wb, report.dataChecks)
  return Buffer.from(await wb.xlsx.writeBuffer())
}

/** Generates the report and posts it to Slack as a single message with the workbook attached. */
export async function sendDuplicateDevicesReport(channelId: string): Promise<{ ok: boolean; error?: string; groups?: number }> {
  const cfg = getSlackConfig()
  if (!cfg?.botToken) return { ok: false, error: 'Slack Bot OAuth token is not configured.' }
  const now = new Date()
  const report = await collectDuplicateDeviceReport(now)
  const date = now.toISOString().slice(0, 10)
  const { text, blocks } = buildDuplicateMessage(report, date)
  if (report.groups.length === 0) {
    const posted = await sendSlackBlocks(cfg, channelId, text, blocks)
    return { ok: posted.ok, ...(posted.error ? { error: posted.error } : {}), groups: 0 }
  }
  let content: Buffer
  try {
    content = await buildDuplicateDevicesWorkbook(report, now)
  } catch (error) {
    await sendSlackBlocks(cfg, channelId, text, blocks)
    return { ok: false, error: `Summary posted without the Excel report, which could not be built: ${error instanceof Error ? error.message : String(error)}`, groups: report.groups.length }
  }
  const uploaded = await uploadSlackFile(cfg, { channelId, filename: `duplicate-entra-devices-${date}.xlsx`, title: `Duplicate Entra Device Objects ${date}`, content, blocks })
  return { ok: uploaded.ok, ...(uploaded.error ? { error: uploaded.error } : {}), groups: report.groups.length }
}
