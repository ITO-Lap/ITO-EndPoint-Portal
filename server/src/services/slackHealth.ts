/**
 * SlackHealthMonitor
 *
 * Runs a background health check against the Slack API every POLL_MS (5 min).
 * On failure it retries up to MAX_RETRIES times with exponential backoff before
 * recording the error and waiting for the next scheduled poll. Once connectivity
 * is restored it resets all counters and logs the recovery.
 *
 * All results are written to integrationStore via recordFetchResult so the
 * existing /api/integrations/status and /api/slack/status endpoints
 * automatically reflect live health without any extra wiring.
 */

import { getSlackConfig, recordFetchResult } from '../store/integrationStore.js'
import { testSlackConnection } from './slack.js'

// ── Constants ─────────────────────────────────────────────────────────────────

const POLL_MS          = 5 * 60 * 1000    // 5 minutes — normal poll interval
const DEGRADED_POLL_MS = 15 * 60 * 1000   // 15 minutes — when repeatedly failing
const MAX_RETRIES      = 3                 // attempts per poll cycle before giving up
const BACKOFF_BASE_MS  = 10_000           // 10s, 30s, 90s between retries
const REQUEST_TIMEOUT  = 12_000           // 12s per individual request

// ── State ─────────────────────────────────────────────────────────────────────

export interface SlackHealthStatus {
  healthy:            boolean | null   // null = never checked
  lastCheckedAt:      number | null
  lastSuccessAt:      number | null
  consecutiveFails:   number
  error:              string | null
  workspace:          string | null
  autoRetryCount:     number
  nextCheckInMs:      number | null
}

const state: SlackHealthStatus = {
  healthy:          null,
  lastCheckedAt:    null,
  lastSuccessAt:    null,
  consecutiveFails: 0,
  error:            null,
  workspace:        null,
  autoRetryCount:   0,
  nextCheckInMs:    null,
}

let _timer: ReturnType<typeof setTimeout> | null = null
let _started = false

// ── Health check with per-request timeout ─────────────────────────────────────

async function checkOnce(): Promise<void> {
  const cfg = getSlackConfig()
  if (!cfg) {
    // Not configured — clear any stale error state
    Object.assign(state, { healthy: null, error: null, workspace: null })
    return
  }

  const t0 = Date.now()

  // Wrap testSlackConnection with a hard timeout so a hung Slack endpoint
  // can never block the monitor loop.
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Slack API timed out after 12 s')), REQUEST_TIMEOUT),
  )

  let attempt = 0
  let lastError: string | null = null

  while (attempt <= MAX_RETRIES) {
    try {
      const result = await Promise.race([testSlackConnection(cfg), timeout])
      const latencyMs = Date.now() - t0

      if (result.ok) {
        const wasDown = state.consecutiveFails > 0
        Object.assign(state, {
          healthy:          true,
          lastCheckedAt:    Date.now(),
          lastSuccessAt:    Date.now(),
          consecutiveFails: 0,
          error:            null,
          workspace:        result.workspace?.teamName ?? state.workspace,
          autoRetryCount:   0,
        })
        recordFetchResult('slack', { deviceCount: 0, lastFetchAt: Date.now(), latencyMs, error: null })

        if (wasDown) {
          console.log(`[SlackHealth] ✅ Reconnected to Slack after ${state.autoRetryCount} retries (${latencyMs}ms)`)
        } else {
          console.log(`[SlackHealth] ✓  Slack healthy (${latencyMs}ms)`)
        }
        return
      }

      lastError = result.error ?? 'auth.test returned ok=false'
    } catch (err) {
      lastError = err instanceof Error ? err.message : 'Unknown error'
    }

    attempt++
    state.autoRetryCount++

    if (attempt <= MAX_RETRIES) {
      const backoffMs = BACKOFF_BASE_MS * Math.pow(3, attempt - 1) // 10s, 30s, 90s
      console.warn(`[SlackHealth] ⚠️  Attempt ${attempt}/${MAX_RETRIES} failed: ${lastError}. Retrying in ${backoffMs / 1000}s…`)
      await new Promise(r => setTimeout(r, backoffMs))
    }
  }

  // All retries exhausted
  const latencyMs = Date.now() - t0
  state.consecutiveFails++
  Object.assign(state, {
    healthy:       false,
    lastCheckedAt: Date.now(),
    error:         lastError,
  })
  recordFetchResult('slack', { deviceCount: 0, lastFetchAt: Date.now(), latencyMs, error: lastError })

  console.error(`[SlackHealth] ❌ Slack unreachable after ${MAX_RETRIES} retries (${state.consecutiveFails} consecutive failures): ${lastError}`)
}

// ── Scheduler ─────────────────────────────────────────────────────────────────

function scheduleNext(): void {
  // Use longer interval when repeatedly failing to avoid hammering a revoked token
  const intervalMs = state.consecutiveFails >= 3 ? DEGRADED_POLL_MS : POLL_MS
  state.nextCheckInMs = intervalMs

  _timer = setTimeout(async () => {
    await checkOnce()
    scheduleNext()
  }, intervalMs)
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Start the background monitor. Safe to call multiple times — only starts once. */
export function startSlackHealthMonitor(): void {
  if (_started) return
  _started = true

  console.log('[SlackHealth] Monitor started — polling every 5 minutes')

  // Run an immediate check so status is populated at startup
  checkOnce().then(() => scheduleNext()).catch(() => scheduleNext())
}

/** Stop the monitor (useful for graceful shutdown / tests). */
export function stopSlackHealthMonitor(): void {
  if (_timer) { clearTimeout(_timer); _timer = null }
  _started = false
  console.log('[SlackHealth] Monitor stopped')
}

/** Current health snapshot — exposed by GET /api/slack/health. */
export function getSlackHealthStatus(): SlackHealthStatus {
  return { ...state }
}

/** Force an immediate re-check outside the normal poll cycle. */
export async function forceSlackHealthCheck(): Promise<SlackHealthStatus> {
  await checkOnce()
  return getSlackHealthStatus()
}
