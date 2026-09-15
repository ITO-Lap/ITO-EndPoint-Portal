import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import rateLimit from 'express-rate-limit'
import { requestLogger } from './middleware/requestLogger.js'
import { errorHandler } from './middleware/errorHandler.js'
import devicesRouter from './routes/devices.js'
import notificationsRouter from './routes/notifications.js'
import activityRouter from './routes/activity.js'
import integrationsRouter from './routes/integrations.js'
import reportsRouter from './routes/reports.js'
import jiraRouter from './routes/jira.js'
import usersRouter from './routes/users.js'
import profileRouter from './routes/profile.js'
import automationsRouter from './routes/automations.js'
import slackRouter from './routes/slack.js'
import entraRouter from './routes/entra.js'
import smartDiagnosticsRouter from './routes/smartDiagnostics.js'
import authRouter from './routes/auth.js'
import appVersionsRouter from './routes/appVersions.js'
import intelligenceRouter from './routes/intelligence.js'
import tenantsRouter from './routes/tenants.js'
import auditLogRouter from './routes/auditLog.js'
import scheduledReportsRouter from './routes/scheduledReports.js'
import securityInventoryRouter from './routes/securityInventory.js'
import roleActivityRouter from './routes/roleActivity.js'
import intuneScriptsConfigRouter from './routes/intuneScriptsConfig.js'
import securityPoliciesRouter from './routes/securityPolicies.js'
import { startSlackHealthMonitor, stopSlackHealthMonitor } from './services/slackHealth.js'
import { isConfigured } from './store/integrationStore.js'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

dotenv.config()

const app = express()
const port = process.env.PORT ?? 4000

// Behind a reverse proxy (Heroku router, IIS/ARR, etc.) req.ip is otherwise
// always the proxy's own address, which would bucket every user under one
// rate-limit key.
app.set('trust proxy', 1)

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
app.use('/api/notifications',apiLimiter, notificationsRouter)
app.use('/api/activity',     apiLimiter, activityRouter)
app.use('/api/reports',      apiLimiter, reportsRouter)
app.use('/api/jira',         apiLimiter, jiraRouter)
app.use('/api/users',        apiLimiter, usersRouter)
app.use('/api/profile',      apiLimiter, profileRouter)
app.use('/api/automations',  apiLimiter, automationsRouter)
app.use('/api/slack',        apiLimiter, slackRouter)
app.use('/api/entra',             apiLimiter, entraRouter)
app.use('/api/smart-diagnostics', apiLimiter, smartDiagnosticsRouter)
app.use('/api/auth',              authRouter)
app.use('/api/app-versions',       apiLimiter, appVersionsRouter)

// ── Intelligence Platform ──────────────────────────────────────────────────────
app.use('/api/intelligence',       apiLimiter, intelligenceRouter)
app.use('/api/tenants',            apiLimiter, tenantsRouter)
app.use('/api/audit',              apiLimiter, auditLogRouter)
app.use('/api/scheduled-reports',  apiLimiter, scheduledReportsRouter)
app.use('/api/security-inventory', apiLimiter, securityInventoryRouter)
app.use('/api/role-activity',      apiLimiter, roleActivityRouter)
app.use('/api/intune-scripts-config', apiLimiter, intuneScriptsConfigRouter)
app.use('/api/security-policies',  apiLimiter, securityPoliciesRouter)

// ── Serve the built frontend (single-process deployment) ───────────────────────
// Compiles to server/dist/index.js — the client build lives at <repo root>/dist,
// two levels up. In local dev, Vite serves the frontend separately (port 5173)
// and this directory won't exist, so this block is skipped entirely.
const clientDist = path.join(__dirname, '../../dist')
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist))
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api/')) return next()
    res.sendFile(path.join(clientDist, 'index.html'))
  })
}

app.use(errorHandler)

const server = app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`)
  console.log(`  Intune:       ${isConfigured('intune')       ? '✓ configured' : '— not configured'}`)
  console.log(`  ManageEngine: ${isConfigured('manageengine') ? '✓ configured' : '— not configured'}`)
  console.log(`  Entra ID:     ${isConfigured('entra')        ? '✓ configured' : '— not configured'}`)
  console.log(`  Slack:        ${isConfigured('slack')        ? '✓ configured' : '— not configured'}`)
  console.log(`  Jira:         ${process.env.JIRA_BASE_URL ? '✓ configured' : '— not configured'}`)
  console.log(`  Confluence:   ${process.env.CONFLUENCE_BASE_URL ?? process.env.JIRA_BASE_URL ? '✓ configured' : '— not configured'}`)

  startSlackHealthMonitor()
})

process.on('SIGTERM', () => { stopSlackHealthMonitor(); server.close() })
process.on('SIGINT',  () => { stopSlackHealthMonitor(); server.close() })
