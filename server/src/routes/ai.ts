import { Router } from 'express'
import { z } from 'zod'
import { asyncHandler } from '../middleware/errorHandler.js'
import { analyzeDevice, chatWithAI, isOpenAIConfigured } from '../services/openai.js'
import { mockDevices } from '../data/mockDevices.js'

const router = Router()

const analyzeSchema = z.object({
  deviceId: z.string().min(1, 'deviceId is required'),
})

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

// POST /api/ai/analyze  — deep compliance analysis for a specific device
router.post('/analyze', asyncHandler(async (req, res) => {
  if (!requireOpenAI(res)) return

  const { deviceId } = analyzeSchema.parse(req.body)
  const device = mockDevices.find(d => d.id === deviceId)
  if (!device) {
    res.status(404).json({ success: false, error: 'Device not found' })
    return
  }

  const analysis = await analyzeDevice(device)
  res.json({ success: true, data: analysis })
}))

// POST /api/ai/chat  — freeform chat with optional device context
router.post('/chat', asyncHandler(async (req, res) => {
  if (!requireOpenAI(res)) return

  const { message, deviceId } = chatSchema.parse(req.body)
  const device = deviceId ? mockDevices.find(d => d.id === deviceId) : undefined
  const reply = await chatWithAI(message, device)
  res.json({ success: true, data: { reply } })
}))

export default router
