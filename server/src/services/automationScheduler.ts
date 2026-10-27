import { getRules } from '../data/mockAutomations.js'
import { getManageEngineDevices } from './manageEngine.js'
import { getIntuneDevices } from './intune.js'
import { cronMatchesNow } from './scheduledReportRunner.js'
import { runAutomationRule } from './automationEngine.js'
import type { Device } from '../types.js'

async function fetchLiveDevices(): Promise<Device[]> {
  const results = await Promise.allSettled([getManageEngineDevices(), getIntuneDevices()])
  return results.flatMap(result => result.status === 'fulfilled' ? result.value : [])
}

export async function runDueAutomations(): Promise<void> {
  const due = getRules().filter(rule => rule.enabled && rule.trigger.type === 'scheduled'
    && typeof rule.trigger.config.scheduleCron === 'string'
    && cronMatchesNow(rule.trigger.config.scheduleCron))
  if (!due.length) return
  const devices = await fetchLiveDevices()
  for (const rule of due) {
    try { await runAutomationRule(rule, devices) }
    catch (error) { console.error(`[automation-scheduler] ${rule.name} failed:`, error) }
  }
}

let timer: NodeJS.Timeout | undefined
export function startAutomationScheduler() {
  if (timer) return
  const tick = () => { void runDueAutomations() }
  tick()
  timer = setInterval(tick, 60_000)
}
export function stopAutomationScheduler() { if (timer) clearInterval(timer); timer = undefined }
