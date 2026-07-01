// Intelligence Platform — core API routes.
// All Graph API calls are cached 5 min to avoid hammering Microsoft's API.

import { Router } from 'express'
import OpenAI from 'openai'
import { credentialsFromEnv, getManagedDevices, getCompliancePolicies, getConfigurationProfiles, getMobileApps } from '../services/graphApi.js'
import { batchComputeRiskScores } from '../services/riskScoring.js'
import { detectConflicts, conflictSummary } from '../services/policyConflict.js'
import { exportToCSV, exportToExcel, exportToPDF, exportToPPTX } from '../services/reportExporter.js'

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

// ─── GET /api/intelligence/compliance ────────────────────────────────────────
router.get('/compliance', async (_req, res, next) => {
  try {
    const cached = getCached<unknown>('intel:compliance')
    if (cached) return res.json({ success: true, ...cached as object, cached: true })

    const creds   = credentialsFromEnv()
    const [devices, policies] = await Promise.all([
      getManagedDevices(creds),
      getCompliancePolicies(creds),
    ])

    const summary = {
      total:         devices.length,
      compliant:     devices.filter(d => d.complianceState === 'compliant').length,
      noncompliant:  devices.filter(d => d.complianceState === 'noncompliant').length,
      inGracePeriod: devices.filter(d => d.complianceState === 'inGracePeriod').length,
      error:         devices.filter(d => d.complianceState === 'error' || d.complianceState === 'conflict').length,
      unknown:       devices.filter(d => d.complianceState === 'unknown').length,
    }

    const byOS: Record<string, { total: number; compliant: number }> = {}
    for (const d of devices) {
      const os = d.operatingSystem || 'Unknown'
      if (!byOS[os]) byOS[os] = { total: 0, compliant: 0 }
      byOS[os].total++
      if (d.complianceState === 'compliant') byOS[os].compliant++
    }

    const byManagementAgent: Record<string, number> = {}
    for (const d of devices) {
      const agent = d.managementAgent || 'Unknown'
      byManagementAgent[agent] = (byManagementAgent[agent] ?? 0) + 1
    }

    const result = { summary, byOS, byManagementAgent, policyCount: policies.length }
    setCached('intel:compliance', result)
    res.json({ success: true, ...result })
  } catch (err) {
    next(err)
  }
})

// ─── GET /api/intelligence/apps ───────────────────────────────────────────────
router.get('/apps', async (_req, res, next) => {
  try {
    const cached = getCached<unknown[]>('intel:apps')
    if (cached) return res.json({ success: true, data: cached, count: cached.length, cached: true })

    const creds = credentialsFromEnv()
    const apps  = await getMobileApps(creds)
    setCached('intel:apps', apps)
    res.json({ success: true, data: apps, count: apps.length })
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

    const creds   = credentialsFromEnv()
    const devices = await getManagedDevices(creds)

    const columns = [
      { key: 'deviceName',         label: 'Device Name',    width: 25 },
      { key: 'userPrincipalName',  label: 'User',           width: 30 },
      { key: 'operatingSystem',    label: 'OS',             width: 12 },
      { key: 'osVersion',          label: 'OS Version',     width: 15 },
      { key: 'complianceState',    label: 'Compliance',     width: 15 },
      { key: 'isEncrypted',        label: 'Encrypted',      width: 10 },
      { key: 'lastSyncDateTime',   label: 'Last Sync',      width: 22 },
      { key: 'manufacturer',       label: 'Manufacturer',   width: 18 },
      { key: 'model',              label: 'Model',          width: 20 },
      { key: 'managementAgent',    label: 'Mgmt Agent',     width: 18 },
      { key: 'enrolledDateTime',   label: 'Enrolled',       width: 22 },
    ]

    const data = devices.map(d => ({
      ...d,
      isEncrypted: d.isEncrypted ? 'Yes' : 'No',
    })) as Record<string, unknown>[]

    const meta = {
      title:       reportType === 'compliance' ? 'Compliance Report' : 'Device Inventory Report',
      subtitle:    `Microsoft Intune · ${new Date().toLocaleDateString('en-US', { dateStyle: 'long' })}`,
      generatedAt: new Date().toISOString(),
      generatedBy: 'Endpoint Intelligence Platform',
      recordCount: devices.length,
    }

    const summary = [
      { label: 'Total Devices',  value: String(devices.length) },
      { label: 'Compliant',      value: String(devices.filter(d => d.complianceState === 'compliant').length),    color: '22C55E' },
      { label: 'Non-Compliant',  value: String(devices.filter(d => d.complianceState === 'noncompliant').length), color: 'EF4444' },
      { label: 'Encrypted',      value: String(devices.filter(d => d.isEncrypted).length),                        color: '3B82F6' },
      { label: 'Not Encrypted',  value: String(devices.filter(d => !d.isEncrypted).length),                       color: 'F97316' },
    ]

    const filename = `${reportType}-report-${Date.now()}`

    if (format === 'csv') {
      const csv = exportToCSV(data, columns)
      res.setHeader('Content-Type', 'text/csv')
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`)
      return res.send(csv)
    }

    if (format === 'excel') {
      const buf = await exportToExcel(data, columns, meta)
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`)
      return res.send(buf)
    }

    if (format === 'pdf') {
      const buf = await exportToPDF(data, columns, meta)
      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.pdf"`)
      return res.send(buf)
    }

    if (format === 'pptx') {
      const buf = await exportToPPTX(data, meta, summary)
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation')
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.pptx"`)
      return res.send(buf)
    }
  } catch (err) {
    next(err)
  }
})

export default router
