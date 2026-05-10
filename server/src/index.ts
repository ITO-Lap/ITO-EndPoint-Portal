import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { requestLogger } from './middleware/requestLogger.js'
import { errorHandler } from './middleware/errorHandler.js'
import devicesRouter from './routes/devices.js'
import runbooksRouter from './routes/runbooks.js'
import notificationsRouter from './routes/notifications.js'
import activityRouter from './routes/activity.js'
import aiRouter from './routes/ai.js'
import integrationsRouter from './routes/integrations.js'

dotenv.config()

const app = express()
const port = process.env.PORT ?? 4000

app.use(cors())
app.use(express.json())
app.use(requestLogger)

app.get('/health', (_req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() })
})

app.use('/api/devices', devicesRouter)
app.use('/api/integrations', integrationsRouter)
app.use('/api/runbooks', runbooksRouter)
app.use('/api/notifications', notificationsRouter)
app.use('/api/activity', activityRouter)
app.use('/api/ai', aiRouter)

app.use(errorHandler)

app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`)
  console.log(`  Intune:       ${process.env.INTUNE_TENANT_ID ? '✓ configured' : '— mock data'}`)
  console.log(`  Kandji:       ${process.env.KANDJI_API_URL ? '✓ configured' : '— mock data'}`)
  console.log(`  ManageEngine: ${process.env.MANAGEENGINE_URL ? '✓ configured' : '— mock data'}`)
  console.log(`  OpenAI:       ${process.env.OPENAI_API_KEY ? '✓ configured' : '— disabled'}`)
})
