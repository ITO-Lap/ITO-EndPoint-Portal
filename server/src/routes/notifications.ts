import { Router } from 'express'
import { asyncHandler } from '../middleware/errorHandler.js'
import type { Notification } from '../types.js'

const router = Router()

// In-memory store — replace with a DB in production
let notifications: Notification[] = []

// GET /api/notifications
router.get('/', asyncHandler(async (_req, res) => {
  res.json({ success: true, data: notifications })
}))

// PATCH /api/notifications/read-all  — static path must come before /:id
router.patch('/read-all', asyncHandler(async (_req, res) => {
  notifications = notifications.map(n => ({ ...n, read: true }))
  res.json({ success: true, data: notifications })
}))

// PATCH /api/notifications/:id/read
router.patch('/:id/read', asyncHandler(async (req, res) => {
  const notification = notifications.find(n => n.id === req.params.id)
  if (!notification) {
    res.status(404).json({ success: false, error: 'Notification not found' })
    return
  }
  notification.read = true
  res.json({ success: true, data: notification })
}))

export default router
