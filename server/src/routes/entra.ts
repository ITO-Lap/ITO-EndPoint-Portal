import { Router } from 'express'
import { z } from 'zod'
import { asyncHandler } from '../middleware/errorHandler.js'
import {
  getEntraOverview, getEntraDevices, getEntraUsers, getEntraGroups,
  getEntraSecurity, syncDevice, diagnoseDevice,
  getEntraGroupMemberReport, searchEntraGroups, getMacVersionCheck,
} from '../services/entraIntelligence.js'
import { getManageEngineDevices, isManageEngineConfigured } from '../services/manageEngine.js'
import { exportToCSV, exportToExcel } from '../services/reportExporter.js'
import { collectDuplicateDeviceReport } from '../services/entraDuplicateDevices.js'
import { buildDuplicateDevicesWorkbook, summarize } from '../services/entraDuplicateDevicesReport.js'

const router = Router()

// GET /api/entra/overview
router.get('/overview', asyncHandler(async (_req, res) => {
  const data = await getEntraOverview()
  res.json({ success: true, data })
}))

// GET /api/entra/devices?compliance=&os=&limit=
router.get('/devices', asyncHandler(async (req, res) => {
  const schema = z.object({
    compliance: z.string().optional(),
    os:         z.string().optional(),
    limit:      z.coerce.number().int().min(1).max(500).optional().default(50),
  })
  const params  = schema.parse(req.query)
  const devOpts: Parameters<typeof getEntraDevices>[0] = { limit: params.limit }
  if (params.compliance) devOpts.compliance = params.compliance
  if (params.os)         devOpts.os         = params.os
  const data = await getEntraDevices(devOpts)
  res.json({ success: true, data, meta: { total: data.length } })
}))

// GET /api/entra/mac-version-check — ManageEngine macOS versions vs Intune (serial) and Entra (device name)
router.get('/mac-version-check', asyncHandler(async (_req, res) => {
  const me = isManageEngineConfigured() ? await getManageEngineDevices() : []
  const macs = me.filter(d => d.platform === 'macOS')
  const data = await getMacVersionCheck(macs)
  res.json({ success: true, data })
}))

// GET /api/entra/users?riskLevel=
router.get('/users', asyncHandler(async (req, res) => {
  const rawRisk = req.query['riskLevel']
  const userOpts: Parameters<typeof getEntraUsers>[0] = {}
  if (typeof rawRisk === 'string') userOpts.riskLevel = rawRisk
  const data = await getEntraUsers(userOpts)
  res.json({ success: true, data })
}))

// GET /api/entra/groups
router.get('/groups', asyncHandler(async (_req, res) => {
  const data = await getEntraGroups()
  res.json({ success: true, data })
}))

// GET /api/entra/groups/search?q=
router.get('/groups/search', asyncHandler(async (req, res) => {
  const schema = z.object({ q: z.string().optional().default('') })
  const params = schema.parse(req.query)
  const data = await searchEntraGroups(params.q)
  res.json({ success: true, data })
}))

// GET /api/entra/groups/report?name=&os=
router.get('/groups/report', asyncHandler(async (req, res) => {
  const schema = z.object({ name: z.string().min(1), os: z.string().optional() })
  const params = schema.parse(req.query)
  const data = await getEntraGroupMemberReport(params.name, params.os)
  res.json({ success: true, data })
}))

// GET /api/entra/groups/report/export?name=&os=&format=csv|excel
router.get('/groups/report/export', asyncHandler(async (req, res) => {
  const schema = z.object({
    name:   z.string().min(1),
    os:     z.string().optional(),
    format: z.enum(['csv', 'excel']).optional().default('csv'),
  })
  const params = schema.parse(req.query)
  const data = await getEntraGroupMemberReport(params.name, params.os)

  const columns = [
    { key: 'memberType',        label: 'Member Type',  width: 14 },
    { key: 'displayName',       label: 'Display Name', width: 28 },
    { key: 'userPrincipalName', label: 'UPN',           width: 34 },
    { key: 'operatingSystem',   label: 'OS',            width: 12 },
    { key: 'flagged',           label: 'Needs Review', width: 30 },
  ]
  const rows = data.rows.map(r => ({
    memberType:        r.memberType === 'user' ? 'User' : 'Device',
    displayName:       r.displayName,
    userPrincipalName: r.userPrincipalName,
    operatingSystem:   r.operatingSystem ?? '',
    flagged:           r.flagged ? `Yes — ${r.flagReason}` : '',
  }))

  const safeName  = data.group.displayName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()
  const filename  = `entra-group-${safeName}-${Date.now()}`

  if (params.format === 'excel') {
    const buf = await exportToExcel(rows, columns, {
      title:       `Entra ID Group Report — ${data.group.displayName}`,
      subtitle:    `${data.rows.length} of ${data.totalMembers} members · ${data.flaggedCount} flagged`,
      generatedAt: new Date().toISOString(),
      recordCount: rows.length,
    })
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`)
    res.send(buf)
    return
  }

  const csv = exportToCSV(rows, columns)
  res.setHeader('Content-Type', 'text/csv')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`)
  res.send(csv)
}))

// GET /api/entra/security
router.get('/security', asyncHandler(async (_req, res) => {
  const data = await getEntraSecurity()
  res.json({ success: true, data })
}))

// GET /api/entra/duplicate-devices — groups of Entra device objects that represent the same device
router.get('/duplicate-devices', asyncHandler(async (_req, res) => {
  const report = await collectDuplicateDeviceReport()
  res.json({ success: true, data: { summary: summarize(report), groups: report.groups, intuneJoined: report.intuneJoined, generatedAt: report.generatedAt } })
}))

// GET /api/entra/duplicate-devices/export — the same report as an Excel download
router.get('/duplicate-devices/export', asyncHandler(async (_req, res) => {
  const now = new Date()
  const content = await buildDuplicateDevicesWorkbook(await collectDuplicateDeviceReport(now), now)
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  res.setHeader('Content-Disposition', `attachment; filename="duplicate-entra-devices-${now.toISOString().slice(0, 10)}.xlsx"`)
  res.send(content)
}))

// POST /api/entra/devices/:id/sync
router.post('/devices/:id/sync', asyncHandler(async (req, res) => {
  const id = String(req.params['id'] ?? '')
  const result = await syncDevice(id)
  res.json({ success: true, data: result })
}))

// POST /api/entra/devices/:id/diagnose
router.post('/devices/:id/diagnose', asyncHandler(async (req, res) => {
  const id = String(req.params['id'] ?? '')
  const result = await diagnoseDevice(id)
  res.json({ success: true, data: result })
}))

export default router
