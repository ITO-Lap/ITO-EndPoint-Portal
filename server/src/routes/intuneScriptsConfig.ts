// Intune Scripts & Configurations — routes.
//
// Read-only inventory + export of Intune PowerShell/shell scripts,
// remediations, Settings Catalog, Device Configuration, Compliance,
// Endpoint Security, and Administrative Template policies. No upload,
// import, assign, update, or delete action exists anywhere in this module —
// see docs/04-integrations/INTUNE-SCRIPTS-CONFIGURATIONS.md.
//
// Mock/live: when Intune isn't configured (getIntuneConfig() is undefined),
// every route below returns success with empty data and `configured: false`
// — no Graph call is made. There is no fabricated mock dataset for this
// feature (none exists elsewhere in the app for this kind of data either) —
// a live Graph failure is surfaced as a real error, never silently replaced
// with fake items.

import { Router } from 'express'
import { z } from 'zod'
import { asyncHandler } from '../middleware/errorHandler.js'
import { identifyAuditActor, requireAppRole } from '../middleware/requireRole.js'
import { getIntuneConfig } from '../store/integrationStore.js'
import {
  listAllItems, getItemDetail, isItemAssigned, resourceTypeDef, RESOURCE_TYPES,
} from '../services/intuneScriptsConfigGraph.js'
import type { InventoryItem, ResourceType } from '../services/intuneScriptsConfigGraph.js'
import {
  buildExportEntry, buildExportZip, extractDecodedScripts, buildConfigJson, sanitizeFilename,
} from '../services/intuneScriptsConfigExport.js'
import { pLimit } from '../services/intuneScriptsConfigExport.js'

const router = Router()
router.use(identifyAuditActor)

const ALLOWED_ROLES = ['Global Admin', 'IT Admin']
const LIST_ASSIGNMENT_CONCURRENCY = 8
const RESOURCE_TYPE_VALUES = RESOURCE_TYPES.map(r => r.type) as [ResourceType, ...ResourceType[]]

function tenantCreds() {
  const cfg = getIntuneConfig()
  if (!cfg) return null
  return { tenantId: cfg.tenantId, clientId: cfg.clientId, clientSecret: cfg.clientSecret }
}

function splitCompositeId(compositeId: string): { type: ResourceType; id: string } {
  const idx = compositeId.indexOf(':')
  if (idx === -1) throw Object.assign(new Error('Malformed item id'), { status: 400 })
  const type = compositeId.slice(0, idx) as ResourceType
  const id = compositeId.slice(idx + 1)
  if (!RESOURCE_TYPE_VALUES.includes(type) || !id) {
    throw Object.assign(new Error('Malformed item id'), { status: 400 })
  }
  return { type, id }
}

// ─── GET /items ───────────────────────────────────────────────────────────────
const listQuerySchema = z.object({
  search:   z.string().max(200).optional(),
  category: z.string().max(80).optional(),
  platform: z.string().max(40).optional(),
  page:     z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
})

// Script/remediation/Autopilot types don't carry a platforms/platformType
// field on the Graph object itself — their platform is implied by which
// Graph collection they live in (deviceManagementScripts, deviceHealthScripts,
// and windowsAutopilotDeploymentProfiles are all Windows-only).
const IMPLIED_PLATFORM: Partial<Record<ResourceType, string>> = {
  powershell_script: 'windows',
  remediation: 'windows',
  autopilot_deployment_profile: 'windows',
}

function matchesPlatform(item: InventoryItem, platform: string): boolean {
  const needle = platform.toLowerCase()
  const implied = IMPLIED_PLATFORM[item.type]
  if (implied) return implied === needle
  const platforms = item.raw.platforms ?? item.raw.platformType
  if (Array.isArray(platforms)) return platforms.some(p => String(p).toLowerCase() === needle)
  if (typeof platforms === 'string') return platforms.toLowerCase().includes(needle)
  return false
}

router.get('/items', requireAppRole(ALLOWED_ROLES), asyncHandler(async (req, res) => {
  const q = listQuerySchema.parse(req.query)
  const creds = tenantCreds()
  if (!creds) {
    res.json({ success: true, data: [], pagination: { page: 1, pageSize: q.pageSize, total: 0 }, categoryErrors: {}, configured: false })
    return
  }

  const { items, categoryErrors } = await listAllItems(creds)

  let filtered = items
  if (q.category) filtered = filtered.filter(i => i.category === q.category)
  if (q.platform) filtered = filtered.filter(i => matchesPlatform(i, q.platform!))
  if (q.search) {
    const needle = q.search.toLowerCase()
    filtered = filtered.filter(i => i.displayName.toLowerCase().includes(needle))
  }

  const total = filtered.length
  const start = (q.page - 1) * q.pageSize
  const pageItems = filtered.slice(start, start + q.pageSize)

  // Graph doesn't reliably return isAssigned on any of these 8 resource
  // types' list responses (verified against a live tenant) — so real
  // assignment status is fetched per item, bounded-concurrency, but only
  // for the current page (never the full collection) to keep list-page cost
  // proportional to page size, not total inventory size.
  const assignedFlags = await pLimit(
    pageItems.map(i => async () => {
      try {
        return await isItemAssigned(creds, i.type, i.id)
      } catch {
        return null // unknown — Graph call for this one item failed, don't fail the whole page
      }
    }),
    LIST_ASSIGNMENT_CONCURRENCY
  )

  const page = pageItems.map((i, idx) => ({
    compositeId: i.compositeId, type: i.type, category: i.category, label: i.label,
    displayName: i.displayName, lastModifiedDateTime: i.lastModifiedDateTime,
    platforms: IMPLIED_PLATFORM[i.type] ?? i.raw.platforms ?? i.raw.platformType ?? null,
    isAssigned: assignedFlags[idx] ?? null,
  }))

  res.json({ success: true, data: page, pagination: { page: q.page, pageSize: q.pageSize, total }, categoryErrors, configured: true })
}))

// ─── GET /items/:compositeId ────────────────────────────────────────────────
router.get('/items/:compositeId', requireAppRole(ALLOWED_ROLES), asyncHandler(async (req, res) => {
  const { type, id } = splitCompositeId(String(req.params.compositeId ?? ''))
  const creds = tenantCreds()
  if (!creds) throw Object.assign(new Error('Intune is not configured'), { status: 503 })

  const detail = await getItemDetail(creds, type, id)
  const def = resourceTypeDef(type)
  res.json({
    success: true,
    data: {
      compositeId: detail.item.compositeId,
      type: detail.item.type,
      category: detail.item.category,
      label: def.label,
      displayName: detail.item.displayName,
      lastModifiedDateTime: detail.item.lastModifiedDateTime,
      raw: detail.item.raw,
      assignments: detail.assignments,
      settings: detail.settings,
      groupNames: detail.groupNames,
    },
  })
}))

// ─── GET /items/:compositeId/download — single-item download ───────────────
router.get('/items/:compositeId/download', requireAppRole(ALLOWED_ROLES), asyncHandler(async (req, res) => {
  const { type, id } = splitCompositeId(String(req.params.compositeId ?? ''))
  const creds = tenantCreds()
  if (!creds) throw Object.assign(new Error('Intune is not configured'), { status: 503 })

  const detail = await getItemDetail(creds, type, id)
  const isScript = type === 'powershell_script' || type === 'remediation'
  const baseName = sanitizeFilename(detail.item.displayName, detail.item.id)

  if (isScript) {
    const scripts = extractDecodedScripts(detail.item)
    const body = scripts.length > 1
      ? scripts.map(s => `# ---- ${s.field} ----\n${s.content}`).join('\n\n')
      : (scripts[0]?.content ?? '')
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${baseName}.ps1"`)
    res.send(body)
    return
  }

  const json = buildConfigJson(detail.item, detail.assignments, detail.settings, detail.groupNames)
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Content-Disposition', `attachment; filename="${baseName}.json"`)
  res.send(JSON.stringify(json, null, 2))
}))

// ─── POST /export — bulk ZIP (selected ids, or all matching current filters) ─
const exportBodySchema = z.object({
  ids:      z.array(z.string()).max(500).optional(),
  all:      z.boolean().optional(),
  category: z.string().max(80).optional(),
  platform: z.string().max(40).optional(),
  search:   z.string().max(200).optional(),
})

const EXPORT_CONCURRENCY = 5

router.post('/export', requireAppRole(ALLOWED_ROLES), asyncHandler(async (req, res) => {
  const body = exportBodySchema.parse(req.body)
  const creds = tenantCreds()
  if (!creds) throw Object.assign(new Error('Intune is not configured'), { status: 503 })

  const { items } = await listAllItems(creds)
  let targets: InventoryItem[]
  if (body.all) {
    targets = items
    if (body.category) targets = targets.filter(i => i.category === body.category)
    if (body.platform) targets = targets.filter(i => matchesPlatform(i, body.platform!))
    if (body.search) {
      const needle = body.search.toLowerCase()
      targets = targets.filter(i => i.displayName.toLowerCase().includes(needle))
    }
  } else {
    const idSet = new Set(body.ids ?? [])
    targets = items.filter(i => idSet.has(i.compositeId))
  }

  if (targets.length === 0) {
    throw Object.assign(new Error('No matching items to export'), { status: 400 })
  }

  const usedNames = new Set<string>()
  const tasks = targets.map(item => async () => {
    try {
      const { type, id } = splitCompositeId(item.compositeId)
      const detail = await getItemDetail(creds, type, id)
      return buildExportEntry(detail.item, detail.assignments, detail.settings, detail.groupNames, usedNames)
    } catch (err) {
      return {
        compositeId: item.compositeId,
        resourceType: item.type,
        category: item.category,
        resourceId: item.id,
        displayName: item.displayName,
        success: false as const,
        error: err instanceof Error ? err.message : 'Unknown error',
      }
    }
  })

  const entries = await pLimit(tasks, EXPORT_CONCURRENCY)
  const zipBuf = await buildExportZip(entries)

  const timestamp = new Date().toISOString().slice(0, 10)
  res.setHeader('Content-Type', 'application/zip')
  res.setHeader('Content-Disposition', `attachment; filename="intune-export-${timestamp}.zip"`)
  res.send(zipBuf)
}))

export default router
