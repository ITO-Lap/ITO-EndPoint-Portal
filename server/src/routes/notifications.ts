import { Router } from 'express'
import { asyncHandler } from '../middleware/errorHandler.js'
import { getNotifications, markAllRead, markRead } from '../data/notificationStore.js'

const router = Router()

// GET /api/notifications
router.get('/', asyncHandler(async (_req, res) => {
  res.json({ success: true, data: getNotifications() })
}))

// PATCH /api/notifications/read-all  — static path must come before /:id
router.patch('/read-all', asyncHandler(async (_req, res) => {
  res.json({ success: true, data: markAllRead() })
}))

// PATCH /api/notifications/:id/read
router.patch('/:id/read', asyncHandler(async (req, res) => {
  const notification = markRead(req.params.id as string)
  if (!notification) {
    res.status(404).json({ success: false, error: 'Notification not found' })
    return
  }
  res.json({ success: true, data: notification })
}))

export default router
