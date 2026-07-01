import { Router } from 'express'
import { z } from 'zod'
import { asyncHandler } from '../middleware/errorHandler.js'
import { analyzeDevice, chatWithAI, isOpenAIConfigured, generateFallbackAnalysis } from '../services/openai.js'
import { getCachedKandjiDevices } from '../services/kandji.js'
import type { Device } from '../types.js'

const router = Router()

const analyzeSchema = z.union([
  // Look up by ID from any connected source
  z.object({ deviceId: z.string().min(1) }),
  // OR pass device fields directly (for frontend-constructed device context)
  z.object({
    deviceName:       z.string().min(1),
    user:             z.string().optional().default(''),
    platform:         z.enum(['Windows', 'macOS', 'Linux']),
    osVersion:        z.string().optional().default(''),
    managementSource: z.enum(['Microsoft Intune', 'Kandji', 'ManageEngine']).optional().default('Kandji'),
    complianceState:  z.enum(['Compliant', 'Warning', 'Non-Compliant']),
    encryptionStatus: z.string().optional().default(''),
    primaryIssue:     z.string().min(1),
    policyFailed:     z.string().optional().default(''),
    severity:         z.enum(['Low', 'Medium', 'High', 'Critical']).optional().default('Medium'),
  }),
])

const chatSchema = z.object({
  message: z.string().min(1).max(1000),
  deviceId: z.string().optional(),
})

function requireOpenAI(res: Parameters<Parameters<typeof asyncHandler>[0]>[1]): boolean {
  if (!isOpenAIConfigured()) {
    res.status(503).json({
      success: false,
      error: 'OpenAI is not configured. Set OPENAI_API_KEY in server/.env',
    })
    return false
  }
  return true
}

// GET /api/ai/status
router.get('/status', asyncHandler(async (_req, res) => {
  res.json({
    success: true,
    data: { openai: isOpenAIConfigured() },
  })
}))

// POST /api/ai/analyze — deep compliance analysis for a device
router.post('/analyze', asyncHandler(async (req, res) => {
  const parsed = analyzeSchema.parse(req.body)

  let device: Device | undefined

  if ('deviceId' in parsed) {
    const cached = getCachedKandjiDevices()
    device = cached?.find(d => d.id === parsed.deviceId)
    if (!device) {
      res.status(404).json({ success: false, error: 'Device not found — sync devices first' })
      return
    }
  } else {
    device = {
      id:               'inline',
      deviceName:       parsed.deviceName,
      user:             parsed.user,
      platform:         parsed.platform,
      osVersion:        parsed.osVersion,
      managementSource: parsed.managementSource,
      lastCheckIn:      new Date().toLocaleString(),
      complianceState:  parsed.complianceState,
      encryptionStatus: parsed.encryptionStatus,
      primaryIssue:     parsed.primaryIssue,
      policyFailed:     parsed.policyFailed,
      severity:         parsed.severity,
      confidence:       '90%',
      firstDetected:    'N/A',
      lastDetected:     new Date().toLocaleString(),
      issueSource:      parsed.managementSource,
      serialNumber:     '',
    }
  }

  // Use OpenAI when available, fall back to deterministic rule-based analysis
  const analysis = isOpenAIConfigured()
    ? await analyzeDevice(device)
    : generateFallbackAnalysis(device)

  res.json({ success: true, data: analysis })
}))

// POST /api/ai/chat  — freeform chat with optional device context
router.post('/chat', asyncHandler(async (req, res) => {
  if (!requireOpenAI(res)) return

  const { message, deviceId } = chatSchema.parse(req.body)

  let device: Device | undefined
  if (deviceId) {
    const cached = getCachedKandjiDevices()
    device = cached?.find(d => d.id === deviceId)
  }

  const reply = await chatWithAI(message, device)
  res.json({ success: true, data: { reply } })
}))

export default router
