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
import integrationsRouter from './routes/integrations.js'
import reportsRouter from './routes/reports.js'
import jiraRouter from './routes/jira.js'
import scriptsRouter from './routes/scripts.js'
import usersRouter from './routes/users.js'
import automationsRouter from './routes/automations.js'
import slackRouter from './routes/slack.js'
import entraRouter from './routes/entra.js'
import smartDiagnosticsRouter from './routes/smartDiagnostics.js'
import authRouter from './routes/auth.js'
import intuneHealthRouter from './routes/intuneHealth.js'
import macLogsRouter from './routes/macLogs.js'
import appVersionsRouter from './routes/appVersions.js'
import { startSlackHealthMonitor, stopSlackHealthMonitor } from './services/slackHealth.js'

dotenv.config()

const app = express()
const port = process.env.PORT ?? 4000

const isDev = process.env.NODE_ENV !== 'production'

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDev ? 2000 : 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests, please try again later.' },
})

const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDev ? 200 : 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests, please try again later.' },
})

void strictLimiter // reserved for future rate-limited endpoints

app.use(cors())
app.use(express.json())
app.use(requestLogger)

app.get('/health', (_req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() })
})

app.use('/api/devices',      apiLimiter, devicesRouter)
app.use('/api/integrations', apiLimiter, integrationsRouter)
app.use('/api/runbooks',     apiLimiter, runbooksRouter)
app.use('/api/notifications',apiLimiter, notificationsRouter)
app.use('/api/activity',     apiLimiter, activityRouter)
app.use('/api/reports',      apiLimiter, reportsRouter)
app.use('/api/jira',         apiLimiter, jiraRouter)
app.use('/api/scripts',      apiLimiter, scriptsRouter)
app.use('/api/users',        apiLimiter, usersRouter)
app.use('/api/automations',  apiLimiter, automationsRouter)
app.use('/api/slack',        apiLimiter, slackRouter)
app.use('/api/entra',             apiLimiter, entraRouter)
app.use('/api/smart-diagnostics', apiLimiter, smartDiagnosticsRouter)
app.use('/api/auth',              authRouter)
app.use('/api/intune-health',     apiLimiter, intuneHealthRouter)
app.use('/api/mac-logs',          apiLimiter, macLogsRouter)
app.use('/api/app-versions',      apiLimiter, appVersionsRouter)

app.use(errorHandler)

const server = app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`)
  console.log(`  Intune:       ${process.env.INTUNE_TENANT_ID ? '✓ configured' : '— not configured'}`)
  console.log(`  Kandji:       ${process.env.KANDJI_API_URL ? '✓ configured' : '— not configured'}`)
  console.log(`  ManageEngine: ${process.env.MANAGEENGINE_URL ? '✓ configured' : '— not configured'}`)
  const entraConfigured = process.env.ENTRA_TENANT_ID ?? process.env.INTUNE_TENANT_ID
  console.log(`  Entra ID:     ${entraConfigured ? '✓ configured' : '— not configured'}`)
  console.log(`  Slack:        ${process.env.SLACK_BOT_TOKEN ? '✓ configured' : '— not configured'}`)
  console.log(`  Jira:         ${process.env.JIRA_BASE_URL ? '✓ configured' : '— not configured'}`)
  console.log(`  Confluence:   ${process.env.CONFLUENCE_BASE_URL ?? process.env.JIRA_BASE_URL ? '✓ configured' : '— not configured'}`)

  startSlackHealthMonitor()
})

process.on('SIGTERM', () => { stopSlackHealthMonitor(); server.close() })
process.on('SIGINT',  () => { stopSlackHealthMonitor(); server.close() })
