import { getAppIntelService } from './service.js'

const DEFAULT_INTERVAL_MS = 6 * 60 * 60 * 1000
const MIN_INTERVAL_MS = 15 * 60 * 1000

function intervalMs(): number {
  const configured = Number(process.env.APP_INTEL_RELEASE_POLL_INTERVAL_MS)
  return Number.isFinite(configured) && configured >= MIN_INTERVAL_MS ? configured : DEFAULT_INTERVAL_MS
}

async function poll(): Promise<void> {
  try { await getAppIntelService().startSync() }
  catch (error) { console.error('[app-release-monitor] Verification sync failed:', error) }
}

let timer: NodeJS.Timeout | undefined
export function startVerifiedAppReleaseMonitor(): void {
  if (timer) return
  void poll() // establishes a baseline after startup; it does not send initial-release alerts.
  timer = setInterval(() => { void poll() }, intervalMs())
}
export function stopVerifiedAppReleaseMonitor(): void { if (timer) clearInterval(timer); timer = undefined }
