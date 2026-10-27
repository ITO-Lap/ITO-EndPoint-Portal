import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import rateLimit from 'express-rate-limit'
import { requestLogger } from './middleware/requestLogger.js'
import { errorHandler } from './middleware/errorHandler.js'
import devicesRouter from './routes/devices.js'
import notificationsRouter from './routes/notifications.js'
import integrationsRouter from './routes/integrations.js'
import reportsRouter from './routes/reports.js'
import jiraRouter from './routes/jira.js'
import usersRouter from './routes/users.js'
import automationsRouter from './routes/automations.js'
import slackRouter from './routes/slack.js'
import entraRouter from './routes/entra.js'
import authRouter from './routes/auth.js'
import { requireSessionExceptAuth } from './middleware/requireSession.js'
import { authEnforced, emailSignInEnabled, passwordRequired } from './services/session.js'
import intelligenceRouter from './routes/intelligence.js'
import scheduledReportsRouter from './routes/scheduledReports.js'
import securityInventoryRouter, { startSecurityInventoryWarmup, stopSecurityInventoryWarmup } from './routes/securityInventory.js'
import roleActivityRouter from './routes/roleActivity.js'
import intuneScriptsConfigRouter from './routes/intuneScriptsConfig.js'
import copilotRouter from './routes/copilot.js'
import patchRouter from './routes/patch.js'
import endpointCentralRouter from './routes/endpointCentral.js'
import securityPostureRouter from './routes/securityPosture.js'
import appIntelRouter from './routes/appIntel.js'
import { createStaleDevicesRouter } from './routes/staleDevices.js'
import notificationSchedulesRouter from './routes/notificationSchedules.js'
import dashboardRouter from './routes/dashboard.js'
import { startSlackHealthMonitor, stopSlackHealthMonitor } from './services/slackHealth.js'
import { startScheduledReportRunner, stopScheduledReportRunner, runScheduledReportNow } from './services/scheduledReportRunner.js'
import { startAutomationScheduler, stopAutomationScheduler } from './services/automationScheduler.js'
import { startVerifiedAppReleaseMonitor, stopVerifiedAppReleaseMonitor } from './services/appIntel/releaseMonitor.js'
import { startNotificationScheduler, stopNotificationScheduler, registerNotificationHandler } from './services/notificationScheduler.js'
import { isConfigured } from './store/integrationStore.js'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// Always load the server's environment file. `npm start` runs from the
// repository root, while `npm --prefix server run dev` runs from /server;
// relying on dotenv's current-working-directory default made production miss
// server/.env and report every live connector as unconfigured.
dotenv.config({ path: path.resolve(__dirname, '../.env') })

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

// Everything under /api needs a signed-in session, except sign-in itself.
app.use('/api', requireSessionExceptAuth)
if (authEnforced() && emailSignInEnabled() && !passwordRequired()) {
  console.warn('[auth] Passwordless sign-in is ON: anyone who enters an allow-listed email can sign in. Set AUTH_PASSWORD, or AUTH_PASSWORDLESS=false to use Microsoft sign-in only, before exposing this beyond a trusted network.')
}
if (!authEnforced()) console.warn('[auth] AUTH_ENFORCED=false: the API is NOT protected.')

app.use('/api/devices',      apiLimiter, devicesRouter)
app.use('/api/integrations', apiLimiter, integrationsRouter)
app.use('/api/notifications',apiLimiter, notificationsRouter)
app.use('/api/reports',      apiLimiter, reportsRouter)
app.use('/api/jira',         apiLimiter, jiraRouter)
app.use('/api/users',        apiLimiter, usersRouter)
app.use('/api/automations',  apiLimiter, automationsRouter)
app.use('/api/slack',        apiLimiter, slackRouter)
app.use('/api/entra',             apiLimiter, entraRouter)
app.use('/api/auth',              authRouter)

// ── Intelligence Platform ──────────────────────────────────────────────────────
app.use('/api/intelligence',       apiLimiter, intelligenceRouter)
app.use('/api/scheduled-reports',  apiLimiter, scheduledReportsRouter)
app.use('/api/security-inventory', apiLimiter, securityInventoryRouter)
app.use('/api/role-activity',      apiLimiter, roleActivityRouter)
app.use('/api/intune-scripts-config', apiLimiter, intuneScriptsConfigRouter)
app.use('/api/copilot',            apiLimiter, copilotRouter)
app.use('/api/patch',              apiLimiter, patchRouter)
app.use('/api/endpoint-central',   apiLimiter, endpointCentralRouter)
app.use('/api/security-posture',   apiLimiter, securityPostureRouter)
app.use('/api/app-intel',          apiLimiter, appIntelRouter)
app.use('/api/stale-devices',      apiLimiter, createStaleDevicesRouter())
app.use('/api/notification-schedules', apiLimiter, notificationSchedulesRouter)
app.use('/api/dashboard',              apiLimiter, dashboardRouter)

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

  registerNotificationHandler('scheduled_report', async (sourceId) => {
    try {
      await runScheduledReportNow(sourceId)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  startSlackHealthMonitor()
  startScheduledReportRunner()
  startAutomationScheduler()
  startVerifiedAppReleaseMonitor()
  startNotificationScheduler()
  startSecurityInventoryWarmup()
})

process.on('SIGTERM', () => { stopSlackHealthMonitor(); stopScheduledReportRunner(); stopAutomationScheduler(); stopVerifiedAppReleaseMonitor(); stopNotificationScheduler(); stopSecurityInventoryWarmup(); server.close() })
process.on('SIGINT',  () => { stopSlackHealthMonitor(); stopScheduledReportRunner(); stopAutomationScheduler(); stopVerifiedAppReleaseMonitor(); stopNotificationScheduler(); stopSecurityInventoryWarmup(); server.close() })
