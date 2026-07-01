import { Router } from 'express'
import { asyncHandler } from '../middleware/errorHandler.js'
import { createJiraIssue, searchJiraIssues, isJiraConfigured } from '../services/jira.js'
import { searchConfluencePages, isConfluenceConfigured } from '../services/confluence.js'

const router = Router()

// GET /api/jira/status
router.get('/status', asyncHandler(async (_req, res) => {
  res.json({ success: true, data: { jira: isJiraConfigured(), confluence: isConfluenceConfigured() } })
}))

// POST /api/jira/issues
router.post('/issues', asyncHandler(async (req, res) => {
  const issue = await createJiraIssue(req.body)
  res.status(201).json({ success: true, data: issue })
}))

// GET /api/jira/issues/search?q=
router.get('/issues/search', asyncHandler(async (req, res) => {
  const q = String(req.query.q ?? '')
  const results = await searchJiraIssues(q)
  res.json({ success: true, data: results })
}))

// GET /api/jira/confluence/search?q=
router.get('/confluence/search', asyncHandler(async (req, res) => {
  const q = String(req.query.q ?? '')
  const results = await searchConfluencePages(q)
  res.json({ success: true, data: results })
}))

export default router
