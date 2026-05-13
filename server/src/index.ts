import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import rateLimit from 'express-rate-limit'
import { requestLogger } from './middleware/requestLogger.js'
import { errorHandler } from './middleware/errorHandler.js'
import devicesRouter from './routes/devices.js'
import runbooksRouter from './routes/runbooks.js'
import notificationsRouter from './routes/notifications.js'
import activityRouter from './routes/activity.js'
import aiRouter from './routes/ai.js'
import integrationsRouter from './routes/integrations.js'
import reportsRouter from './routes/reports.js'
import jiraRouter from './routes/jira.js'
import scriptsRouter from './routes/scripts.js'

dotenv.config()

const app = express()
const port = process.env.PORT ?? 4000

const isDev = process.env.NODE_ENV !== 'production'

// General API rate limit — relaxed in dev to avoid blocking the local dashboard
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDev ? 2000 : 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests, please try again later.' },
})

// Tighter limit for AI and sync endpoints (expensive ops)
const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDev ? 200 : 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests, please try again later.' },
})

app.use(cors())
app.use(express.json())
app.use(requestLogger)

app.get('/health', (_req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() })
})

app.use('/api/devices', apiLimiter, devicesRouter)
app.use('/api/integrations', apiLimiter, integrationsRouter)
app.use('/api/runbooks', apiLimiter, runbooksRouter)
app.use('/api/notifications', apiLimiter, notificationsRouter)
app.use('/api/activity', apiLimiter, activityRouter)
app.use('/api/ai', strictLimiter, aiRouter)
app.use('/api/reports', apiLimiter, reportsRouter)
app.use('/api/jira', apiLimiter, jiraRouter)
app.use('/api/scripts', apiLimiter, scriptsRouter)

app.use(errorHandler)

app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`)
  console.log(`  Intune:       ${process.env.INTUNE_TENANT_ID ? '✓ configured' : '— mock data'}`)
  console.log(`  Kandji:       ${process.env.KANDJI_API_URL ? '✓ configured' : '— mock data'}`)
  console.log(`  ManageEngine: ${process.env.MANAGEENGINE_URL ? '✓ configured' : '— mock data'}`)
  console.log(`  OpenAI:       ${process.env.OPENAI_API_KEY ? '✓ configured' : '— disabled'}`)
  const entraConfigured = process.env.ENTRA_TENANT_ID ?? process.env.INTUNE_TENANT_ID
  console.log(`  Entra ID:     ${entraConfigured ? '✓ configured' : '— mock data'}`)
  console.log(`  Jira:         ${process.env.JIRA_BASE_URL ? '✓ configured' : '— mock data'}`)
  console.log(`  Confluence:   ${process.env.CONFLUENCE_BASE_URL ?? process.env.JIRA_BASE_URL ? '✓ configured' : '— mock data'}`)
})
