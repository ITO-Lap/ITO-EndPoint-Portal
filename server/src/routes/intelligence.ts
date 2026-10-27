// Intelligence Platform — core API routes.
// All Graph API calls are cached 5 min to avoid hammering Microsoft's API.

import { Router } from 'express'
import OpenAI from 'openai'
import { credentialsFromEnv, getManagedDevices, getCompliancePolicies, getConfigurationProfiles, getMobileApps } from '../services/graphApi.js'
import type { GraphMobileApp } from '../services/graphApi.js'
import { batchComputeRiskScores } from '../services/riskScoring.js'
import { detectConflicts, conflictSummary } from '../services/policyConflict.js'
import { createComplianceReport, createInventoryReport } from '../services/complianceInventoryReport.js'
import type { ExportFormat } from '../services/reportExporter.js'

const router = Router()

// ─── Simple TTL cache ─────────────────────────────────────────────────────────
const TTL = 5 * 60 * 1000
interface CacheEntry { data: unknown; expiresAt: number }
const cache = new Map<string, CacheEntry>()

function getCached<T>(key: string): T | null {
  const e = cache.get(key)
  return (e && Date.now() < e.expiresAt) ? e.data as T : null
}

function setCached(key: string, data: unknown): void {
  cache.set(key, { data, expiresAt: Date.now() + TTL })
}

function getOpenAI(): OpenAI | null {
  const key = process.env.OPENAI_API_KEY
  return key ? new OpenAI({ apiKey: key }) : null
}

// ─── Month bucketing (UTC-safe, since Graph timestamps are UTC instants) ─────
interface MonthBucket { key: string; label: string; year: number; month: number }

function getLastTwoMonths(now: Date): MonthBucket[] {
  return [0, 1].map(offset => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1))
    return {
      key:   `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`,
      label: d.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
      year:  d.getUTCFullYear(),
      month: d.getUTCMonth() + 1,
    }
  })
}

function isInMonthUTC(dateStr: string | null | undefined, bucket: MonthBucket): boolean {
  if (!dateStr) return false
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return false
  return d.getUTCFullYear() === bucket.year && (d.getUTCMonth() + 1) === bucket.month
}

// ─── GET /api/intelligence/devices ───────────────────────────────────────────
router.get('/devices', async (_req, res, next) => {
  try {
    const cached = getCached<unknown[]>('intel:devices')
    if (cached) return res.json({ success: true, data: cached, count: cached.length, cached: true })

    const creds   = credentialsFromEnv()
    const devices = await getManagedDevices(creds)
    setCached('intel:devices', devices)
    res.json({ success: true, data: devices, count: devices.length })
  } catch (err) {
    next(err)
  }
})

// ─── GET /api/intelligence/policies ──────────────────────────────────────────
router.get('/policies', async (_req, res, next) => {
  try {
    const cached = getCached<unknown>('intel:policies')
    if (cached) return res.json({ success: true, ...cached as object, cached: true })

    const creds = credentialsFromEnv()
    const [compliance, config] = await Promise.all([
      getCompliancePolicies(creds),
      getConfigurationProfiles(creds),
    ])

    const conflicts = detectConflicts(compliance, config)
    const summary   = conflictSummary(conflicts)

    const result = { compliance, config, conflicts, summary }
    setCached('intel:policies', result)
    res.json({ success: true, ...result })
  } catch (err) {
    next(err)
  }
})

// ─── GET /api/intelligence/risk-scores ───────────────────────────────────────
router.get('/risk-scores', async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit ?? '50'), 10), 200)
    const useAi = req.query.ai !== 'false'

    const cached = getCached<unknown>(`intel:risk:${limit}`)
    if (cached) return res.json({ success: true, ...cached as object, cached: true })

    const creds   = credentialsFromEnv()
    const devices = await getManagedDevices(creds)
    const openai  = getOpenAI()
    const scores  = await batchComputeRiskScores(devices, openai, { limit, useAi: useAi && !!openai })

    const summary = {
      critical: scores.filter(s => s.riskLevel === 'critical').length,
      high:     scores.filter(s => s.riskLevel === 'high').length,
      medium:   scores.filter(s => s.riskLevel === 'medium').length,
      low:      scores.filter(s => s.riskLevel === 'low').length,
      avgScore: scores.length > 0 ? Math.round(scores.reduce((a, s) => a + s.overallScore, 0) / scores.length) : 0,
    }

    const result = { data: scores, summary, count: scores.length }
    setCached(`intel:risk:${limit}`, result)
    res.json({ success: true, ...result })
  } catch (err) {
    next(err)
  }
})

// ─── POST /api/intelligence/summary ──────────────────────────────────────────
router.post('/summary', async (req, res, next) => {
  try {
    const openai = getOpenAI()
    if (!openai) {
      return res.json({ success: false, error: 'OpenAI not configured — set OPENAI_API_KEY' })
    }

    const { context } = req.body as { context?: string }
    const creds   = credentialsFromEnv()
    const [devices, policies] = await Promise.all([
      getManagedDevices(creds),
      getCompliancePolicies(creds),
    ])

    const compliant    = devices.filter(d => d.complianceState === 'compliant').length
    const noncompliant = devices.filter(d => d.complianceState === 'noncompliant').length
    const conflicts    = detectConflicts(policies, [])
    const stale        = devices.filter(d => {
      const days = (Date.now() - new Date(d.lastSyncDateTime).getTime()) / 86_400_000
      return days > 14
    }).length

    const prompt = `You are an endpoint security analyst writing an executive summary for an IT leadership report.

Tenant snapshot:
- Total managed devices: ${devices.length}
- Compliant: ${compliant} (${devices.length ? ((compliant / devices.length) * 100).toFixed(1) : 0}%)
- Non-compliant: ${noncompliant}
- Devices not synced in 14+ days: ${stale}
- Compliance policies: ${policies.length}
- Policy conflicts/issues detected: ${conflicts.length}
${context ? `- Additional context: ${context}` : ''}

Write a 3–4 sentence executive summary that is direct, specific, and includes the top 2 action items. Avoid generic filler.`

    const resp = await openai.chat.completions.create({
      model:      'gpt-4o-mini',
      messages:   [{ role: 'user', content: prompt }],
      max_tokens: 400,
    })

    res.json({ success: true, summary: resp.choices[0]?.message?.content })
  } catch (err) {
    next(err)
  }
})

// ─── POST /api/intelligence/explain ──────────────────────────────────────────
// Ask AI to explain a specific device issue in plain English
router.post('/explain', async (req, res, next) => {
  try {
    const openai = getOpenAI()
    if (!openai) {
      return res.json({ success: false, error: 'OpenAI not configured' })
    }

    const { deviceName, issue, context } = req.body as {
      deviceName?: string
      issue: string
      context?: string
    }

    const prompt = `You are an IT support specialist. Explain the following endpoint issue in plain English for an IT admin, then provide step-by-step remediation instructions.

Device: ${deviceName ?? 'Unknown'}
Issue: ${issue}
${context ? `Context: ${context}` : ''}

Format:
1. Plain-English explanation (2-3 sentences)
2. Root cause
3. Step-by-step remediation (numbered)`

    const resp = await openai.chat.completions.create({
      model:      'gpt-4o-mini',
      messages:   [{ role: 'user', content: prompt }],
      max_tokens: 500,
    })

    res.json({ success: true, explanation: resp.choices[0]?.message?.content })
  } catch (err) {
    next(err)
  }
})

// ─── POST /api/intelligence/export ───────────────────────────────────────────
const EXPORT_CONTENT_TYPES: Record<string, string> = {
  csv:   'text/csv',
  excel: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf:   'application/pdf',
  pptx:  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
}

router.post('/export', async (req, res, next) => {
  try {
    const { format = 'csv', reportType = 'compliance' } = req.body as {
      format?: string
      reportType?: string
    }

    const validFormats = ['csv', 'excel', 'pdf', 'pptx']
    if (!validFormats.includes(format)) {
      return res.status(400).json({ success: false, error: `Invalid format. Use: ${validFormats.join(', ')}` })
    }

    const report = reportType === 'compliance'
      ? await createComplianceReport(format as ExportFormat)
      : await createInventoryReport(format as ExportFormat)

    res.setHeader('Content-Type', EXPORT_CONTENT_TYPES[format]!)
    res.setHeader('Content-Disposition', `attachment; filename="${report.filename}"`)
    res.send(report.content)
  } catch (err) {
    next(err)
  }
})

// ─── GET /api/intelligence/device-report ─────────────────────────────────────
router.get('/device-report', async (_req, res, next) => {
  try {
    const cached = getCached<unknown>('intel:device-report')
    if (cached) return res.json({ success: true, ...cached as object, cached: true })

    const creds = credentialsFromEnv()
    const [devices, apps] = await Promise.all([
      getManagedDevices(creds),
      getMobileApps(creds).catch((): GraphMobileApp[] => []),
    ])

    const now = new Date()
    const lastTwoMonths = getLastTwoMonths(now)

    const newDevicesByMonth = lastTwoMonths.map(m => ({
      ...m,
      count: devices.filter(d => isInMonthUTC(d.enrolledDateTime, m)).length,
    }))

    const appsByMonth = lastTwoMonths.map(m => {
      const added = apps.filter(a => isInMonthUTC(a.createdDateTime, m)).length
      const updated = apps.filter(a =>
        isInMonthUTC(a.lastModifiedDateTime, m) && !isInMonthUTC(a.createdDateTime, m)
      ).length
      return { ...m, added, updated, total: added + updated }
    })

    const deviceList = devices.map(d => ({
      id:               d.id,
      deviceName:       d.deviceName,
      userPrincipalName: d.userPrincipalName,
      ownerType:        d.managedDeviceOwnerType,
      operatingSystem:  d.operatingSystem,
      osVersion:        d.osVersion,
      complianceState:  d.complianceState,
      enrolledDateTime: d.enrolledDateTime,
      lastSyncDateTime: d.lastSyncDateTime,
      isEncrypted:      d.isEncrypted,
      manufacturer:     d.manufacturer,
      model:            d.model,
      serialNumber:     d.serialNumber,
      managementAgent:  d.managementAgent,
    }))

    const result = { totalDevices: devices.length, newDevicesByMonth, appsByMonth, devices: deviceList }
    setCached('intel:device-report', result)
    res.json({ success: true, ...result })
  } catch (err) {
    next(err)
  }
})

// ─── POST /api/intelligence/device-report/export ─────────────────────────────
router.post('/device-report/export', async (_req, res, next) => {
  try {
    const creds = credentialsFromEnv()
    const [devices, apps] = await Promise.all([
      getManagedDevices(creds),
      getMobileApps(creds).catch((): GraphMobileApp[] => []),
    ])

    const now = new Date()
    const lastTwoMonths = getLastTwoMonths(now)

    const { default: ExcelJS } = await import('exceljs')
    const wb = new ExcelJS.Workbook()
    wb.creator = 'Endpoint Intelligence Platform'
    wb.created = now

    // ── Sheet 1: Summary ─────────────────────────────────────────────────────────
    const sumSheet = wb.addWorksheet('Summary')
    sumSheet.columns = [
      { key: 'metric', header: 'Metric', width: 45 },
      { key: 'value',  header: 'Value',  width: 25 },
    ]
    sumSheet.getRow(1).eachCell(cell => {
      cell.font  = { bold: true, color: { argb: 'FFFFFFFF' } }
      cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE84C1E' } }
    })
    sumSheet.getRow(1).height = 18

    const newByMonth = lastTwoMonths.map(m => ({
      ...m,
      count: devices.filter(d => isInMonthUTC(d.enrolledDateTime, m)).length,
    }))
    const appsByMonth = lastTwoMonths.map(m => {
      const added   = apps.filter(a => isInMonthUTC(a.createdDateTime, m)).length
      const updated = apps.filter(a =>
        isInMonthUTC(a.lastModifiedDateTime, m) && !isInMonthUTC(a.createdDateTime, m)
      ).length
      return { ...m, added, updated }
    })

    const summaryRows: Array<{ metric: string; value: string | number }> = [
      { metric: 'Report Title', value: 'Intune Device Report' },
      { metric: 'Generated At', value: now.toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' }) },
      { metric: 'Generated By', value: 'Endpoint Intelligence Platform' },
      { metric: '', value: '' },
      { metric: 'Total Managed Devices',           value: devices.length },
      { metric: 'Compliant',                       value: devices.filter(d => d.complianceState === 'compliant').length },
      { metric: 'Non-Compliant',                   value: devices.filter(d => d.complianceState === 'noncompliant').length },
      { metric: 'Encrypted',                       value: devices.filter(d => d.isEncrypted).length },
      { metric: '', value: '' },
      { metric: `New Enrollments — ${newByMonth[0]?.label ?? ''}`, value: newByMonth[0]?.count ?? 0 },
      { metric: `New Enrollments — ${newByMonth[1]?.label ?? ''}`, value: newByMonth[1]?.count ?? 0 },
      { metric: '', value: '' },
      { metric: `Apps Added — ${appsByMonth[0]?.label ?? ''}`,     value: appsByMonth[0]?.added ?? 0 },
      { metric: `Apps Updated — ${appsByMonth[0]?.label ?? ''}`,   value: appsByMonth[0]?.updated ?? 0 },
      { metric: `Apps Added — ${appsByMonth[1]?.label ?? ''}`,     value: appsByMonth[1]?.added ?? 0 },
      { metric: `Apps Updated — ${appsByMonth[1]?.label ?? ''}`,   value: appsByMonth[1]?.updated ?? 0 },
    ]
    for (const r of summaryRows) sumSheet.addRow(r)

    // ── Sheet 2: Device Inventory ─────────────────────────────────────────────
    const invSheet = wb.addWorksheet('Device Inventory')
    invSheet.columns = [
      { key: 'deviceName',      header: 'Device Name',    width: 28 },
      { key: 'ownerEmail',      header: 'Owner (Email)',  width: 34 },
      { key: 'ownerType',       header: 'Owner Type',     width: 14 },
      { key: 'operatingSystem', header: 'OS',             width: 12 },
      { key: 'osVersion',       header: 'OS Version',     width: 16 },
      { key: 'complianceState', header: 'Compliance',     width: 14 },
      { key: 'isEncrypted',     header: 'Encrypted',      width: 10 },
      { key: 'manufacturer',    header: 'Manufacturer',   width: 16 },
      { key: 'model',           header: 'Model',          width: 22 },
      { key: 'serialNumber',    header: 'Serial Number',  width: 18 },
      { key: 'managementAgent', header: 'Mgmt Agent',     width: 16 },
      { key: 'enrolledDate',    header: 'Enrolled Date',  width: 16 },
      { key: 'lastSyncDate',    header: 'Last Sync',      width: 16 },
    ]
    invSheet.getRow(1).eachCell(cell => {
      cell.font  = { bold: true, color: { argb: 'FFFFFFFF' } }
      cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE84C1E' } }
    })
    invSheet.getRow(1).height = 18
    invSheet.autoFilter = { from: 'A1', to: 'M1' }

    for (const d of devices) {
      invSheet.addRow({
        deviceName:      d.deviceName,
        ownerEmail:      d.userPrincipalName,
        ownerType:       d.managedDeviceOwnerType === 'company' ? 'Company' : d.managedDeviceOwnerType === 'personal' ? 'Personal' : d.managedDeviceOwnerType,
        operatingSystem: d.operatingSystem,
        osVersion:       d.osVersion,
        complianceState: d.complianceState,
        isEncrypted:     d.isEncrypted ? 'Yes' : 'No',
        manufacturer:    d.manufacturer,
        model:           d.model,
        serialNumber:    d.serialNumber,
        managementAgent: d.managementAgent,
        enrolledDate:    d.enrolledDateTime ? new Date(d.enrolledDateTime).toLocaleDateString('en-US') : '',
        lastSyncDate:    d.lastSyncDateTime  ? new Date(d.lastSyncDateTime).toLocaleDateString('en-US')  : '',
      })
    }

    // ── Sheet 3: New Enrollments (last 2 months) ──────────────────────────────
    const enrollSheet = wb.addWorksheet('New Enrollments')
    enrollSheet.columns = [
      { key: 'month',           header: 'Month',          width: 18 },
      { key: 'deviceName',      header: 'Device Name',    width: 28 },
      { key: 'ownerEmail',      header: 'Owner (Email)',  width: 34 },
      { key: 'ownerType',       header: 'Owner Type',     width: 14 },
      { key: 'operatingSystem', header: 'OS',             width: 12 },
      { key: 'compliance',      header: 'Compliance',     width: 14 },
      { key: 'enrolledDate',    header: 'Enrolled Date',  width: 16 },
    ]
    enrollSheet.getRow(1).eachCell(cell => {
      cell.font  = { bold: true, color: { argb: 'FFFFFFFF' } }
      cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE84C1E' } }
    })
    enrollSheet.getRow(1).height = 18

    for (const m of lastTwoMonths) {
      const mDevices = devices.filter(d => isInMonthUTC(d.enrolledDateTime, m))
      for (const d of mDevices) {
        enrollSheet.addRow({
          month:           m.label,
          deviceName:      d.deviceName,
          ownerEmail:      d.userPrincipalName,
          ownerType:       d.managedDeviceOwnerType === 'company' ? 'Company' : d.managedDeviceOwnerType === 'personal' ? 'Personal' : d.managedDeviceOwnerType,
          operatingSystem: d.operatingSystem,
          compliance:      d.complianceState,
          enrolledDate:    d.enrolledDateTime ? new Date(d.enrolledDateTime).toLocaleDateString('en-US') : '',
        })
      }
    }

    // ── Sheet 4: App Activity ─────────────────────────────────────────────────
    const appSheet = wb.addWorksheet('App Activity')
    appSheet.columns = [
      { key: 'month',       header: 'Month',         width: 18 },
      { key: 'activity',    header: 'Activity',      width: 12 },
      { key: 'displayName', header: 'App Name',      width: 34 },
      { key: 'publisher',   header: 'Publisher',     width: 24 },
      { key: 'created',     header: 'Created',       width: 16 },
      { key: 'modified',    header: 'Last Modified', width: 16 },
    ]
    appSheet.getRow(1).eachCell(cell => {
      cell.font  = { bold: true, color: { argb: 'FFFFFFFF' } }
      cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE84C1E' } }
    })
    appSheet.getRow(1).height = 18

    if (apps.length === 0) {
      appSheet.addRow({ month: 'N/A', activity: '—', displayName: 'No data — DeviceManagementApps.Read.All permission required in Azure', publisher: '', created: '', modified: '' })
    } else {
      for (const m of lastTwoMonths) {
        const added   = apps.filter(a => { const c = new Date(a.createdDateTime); return c.getFullYear() === m.year && (c.getMonth() + 1) === m.month })
        const updated = apps.filter(a => {
          const mod = new Date(a.lastModifiedDateTime), cre = new Date(a.createdDateTime)
          return mod.getFullYear() === m.year && (mod.getMonth() + 1) === m.month &&
            !(cre.getFullYear() === m.year && (cre.getMonth() + 1) === m.month)
        })
        for (const a of added)   appSheet.addRow({ month: m.label, activity: 'Added',   displayName: a.displayName, publisher: a.publisher, created: new Date(a.createdDateTime).toLocaleDateString('en-US'),      modified: new Date(a.lastModifiedDateTime).toLocaleDateString('en-US') })
        for (const a of updated) appSheet.addRow({ month: m.label, activity: 'Updated', displayName: a.displayName, publisher: a.publisher, created: new Date(a.createdDateTime).toLocaleDateString('en-US'), modified: new Date(a.lastModifiedDateTime).toLocaleDateString('en-US') })
      }
    }

    const buf = await wb.xlsx.writeBuffer()
    const dateStr = now.toISOString().slice(0, 10)
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="intune-device-report-${dateStr}.xlsx"`)
    return res.send(Buffer.from(buf as ArrayBuffer))
  } catch (err) {
    next(err)
  }
})

// ─── POST /api/intelligence/device-report/inventory-export ───────────────────
// Exports the device inventory as a single-sheet Excel, optionally filtered.
router.post('/device-report/inventory-export', async (req, res, next) => {
  try {
    const { ownerType, search } = req.body as { ownerType?: string; search?: string }

    const creds   = credentialsFromEnv()
    const devices = await getManagedDevices(creds)

    let filtered = devices
    if (ownerType && ownerType !== 'all') {
      filtered = filtered.filter(d => d.managedDeviceOwnerType === ownerType)
    }
    if (search?.trim()) {
      const q = search.toLowerCase()
      filtered = filtered.filter(d =>
        d.deviceName?.toLowerCase().includes(q) ||
        d.userPrincipalName?.toLowerCase().includes(q) ||
        d.serialNumber?.toLowerCase().includes(q) ||
        d.model?.toLowerCase().includes(q)
      )
    }

    const now = new Date()
    const { default: ExcelJS } = await import('exceljs')
    const wb = new ExcelJS.Workbook()
    wb.creator = 'Endpoint Intelligence Platform'
    wb.created = now

    const ws = wb.addWorksheet('Device Inventory')
    ws.columns = [
      { key: 'deviceName',      header: 'Device Name',    width: 28 },
      { key: 'ownerEmail',      header: 'Owner (Email)',  width: 34 },
      { key: 'ownerType',       header: 'Owner Type',     width: 14 },
      { key: 'operatingSystem', header: 'OS',             width: 12 },
      { key: 'osVersion',       header: 'OS Version',     width: 16 },
      { key: 'complianceState', header: 'Compliance',     width: 14 },
      { key: 'isEncrypted',     header: 'Encrypted',      width: 10 },
      { key: 'manufacturer',    header: 'Manufacturer',   width: 16 },
      { key: 'model',           header: 'Model',          width: 22 },
      { key: 'serialNumber',    header: 'Serial Number',  width: 18 },
      { key: 'managementAgent', header: 'Mgmt Agent',     width: 16 },
      { key: 'enrolledDate',    header: 'Enrolled Date',  width: 16 },
      { key: 'lastSyncDate',    header: 'Last Sync',      width: 16 },
    ]

    ws.getRow(1).eachCell(cell => {
      cell.font  = { bold: true, color: { argb: 'FFFFFFFF' } }
      cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE84C1E' } }
    })
    ws.getRow(1).height = 18
    ws.autoFilter = { from: 'A1', to: 'M1' }

    for (const d of filtered) {
      ws.addRow({
        deviceName:      d.deviceName,
        ownerEmail:      d.userPrincipalName,
        ownerType:       d.managedDeviceOwnerType === 'company' ? 'Company' : d.managedDeviceOwnerType === 'personal' ? 'Personal' : d.managedDeviceOwnerType,
        operatingSystem: d.operatingSystem,
        osVersion:       d.osVersion,
        complianceState: d.complianceState,
        isEncrypted:     d.isEncrypted ? 'Yes' : 'No',
        manufacturer:    d.manufacturer,
        model:           d.model,
        serialNumber:    d.serialNumber,
        managementAgent: d.managementAgent,
        enrolledDate:    d.enrolledDateTime ? new Date(d.enrolledDateTime).toLocaleDateString('en-US') : '',
        lastSyncDate:    d.lastSyncDateTime  ? new Date(d.lastSyncDateTime).toLocaleDateString('en-US')  : '',
      })
    }

    const buf = await wb.xlsx.writeBuffer()
    const dateStr = now.toISOString().slice(0, 10)
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="device-inventory-${dateStr}.xlsx"`)
    return res.send(Buffer.from(buf as ArrayBuffer))
  } catch (err) {
    next(err)
  }
})

export default router
