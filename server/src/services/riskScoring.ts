// AI-powered device risk scoring service.
// Rule-based scoring works without OpenAI. When OPENAI_API_KEY is set, GPT-4o-mini
// enriches the output with a narrative summary and actionable remediation steps.

import OpenAI from 'openai'
import type { GraphManagedDevice } from './graphApi.js'

export interface RiskFactor {
  category: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  description: string
  points: number
}

export interface DeviceRiskScore {
  deviceId: string
  deviceName: string
  userEmail: string
  overallScore: number   // 0–100
  riskLevel: 'low' | 'medium' | 'high' | 'critical'
  factors: RiskFactor[]
  aiSummary: string
  actionItems: string[]
  computedAt: string
}

function daysSince(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 86_400_000
}

function ruleBasedScore(device: GraphManagedDevice): { score: number; factors: RiskFactor[] } {
  const factors: RiskFactor[] = []
  let score = 0

  const add = (f: RiskFactor) => { factors.push(f); score += f.points }

  // Compliance state (0–30 pts)
  if (device.complianceState === 'noncompliant') {
    add({ category: 'Compliance', severity: 'critical', description: 'Device is non-compliant with assigned policies', points: 30 })
  } else if (device.complianceState === 'error') {
    add({ category: 'Compliance', severity: 'high', description: 'Compliance evaluation returned an error', points: 20 })
  } else if (device.complianceState === 'conflict') {
    add({ category: 'Compliance', severity: 'high', description: 'Compliance policy conflict detected', points: 18 })
  } else if (device.complianceState === 'inGracePeriod') {
    add({ category: 'Compliance', severity: 'medium', description: 'Device in compliance grace period — remediation window closing', points: 10 })
  } else if (device.complianceState === 'unknown') {
    add({ category: 'Compliance', severity: 'low', description: 'Compliance state unknown', points: 5 })
  }

  // Stale sync (0–25 pts)
  const stale = daysSince(device.lastSyncDateTime)
  if (stale > 30) {
    add({ category: 'Connectivity', severity: 'critical', description: `No sync in ${Math.floor(stale)} days — device may be abandoned or offline`, points: 25 })
  } else if (stale > 14) {
    add({ category: 'Connectivity', severity: 'high', description: `No sync in ${Math.floor(stale)} days`, points: 15 })
  } else if (stale > 7) {
    add({ category: 'Connectivity', severity: 'medium', description: `No sync in ${Math.floor(stale)} days`, points: 6 })
  }

  // Disk encryption (0–20 pts)
  if (!device.isEncrypted) {
    add({ category: 'Encryption', severity: 'critical', description: 'Disk encryption is disabled — data at risk if device is lost', points: 20 })
  }

  // OS version heuristic (0–15 pts)
  const ver = parseFloat(device.osVersion ?? '0')
  if (device.operatingSystem === 'Windows' && ver < 10) {
    add({ category: 'OS Version', severity: 'critical', description: `Unsupported Windows version: ${device.osVersion}`, points: 15 })
  } else if (device.operatingSystem === 'macOS' && ver < 13) {
    add({ category: 'OS Version', severity: 'high', description: `Outdated macOS: ${device.osVersion} (< Ventura)`, points: 10 })
  } else if (device.operatingSystem === 'iOS' && ver < 16) {
    add({ category: 'OS Version', severity: 'medium', description: `Outdated iOS: ${device.osVersion}`, points: 5 })
  } else if (device.operatingSystem === 'Android' && ver < 11) {
    add({ category: 'OS Version', severity: 'medium', description: `Outdated Android: ${device.osVersion}`, points: 5 })
  }

  // Disk space (0–10 pts)
  if (device.totalStorageSpaceInBytes > 0) {
    const freePct = (device.freeStorageSpaceInBytes / device.totalStorageSpaceInBytes) * 100
    if (freePct < 5) {
      add({ category: 'Storage', severity: 'high', description: `Critical disk usage — only ${freePct.toFixed(1)}% free`, points: 10 })
    } else if (freePct < 15) {
      add({ category: 'Storage', severity: 'medium', description: `Low disk space — ${freePct.toFixed(1)}% free`, points: 4 })
    }
  }

  return { score: Math.min(score, 100), factors }
}

function toRiskLevel(score: number): DeviceRiskScore['riskLevel'] {
  if (score >= 70) return 'critical'
  if (score >= 40) return 'high'
  if (score >= 20) return 'medium'
  return 'low'
}

export async function computeRiskScore(
  device: GraphManagedDevice,
  openai: OpenAI | null,
  useAi = true
): Promise<DeviceRiskScore> {
  const { score, factors } = ruleBasedScore(device)
  const level = toRiskLevel(score)

  let aiSummary = ''
  let actionItems: string[] = []

  if (useAi && openai && factors.length > 0) {
    try {
      const prompt = `You are an endpoint security analyst. Provide a risk summary and remediation steps for this device.

Device: ${device.deviceName} | User: ${device.userPrincipalName}
OS: ${device.operatingSystem} ${device.osVersion} | Encrypted: ${device.isEncrypted}
Compliance: ${device.complianceState} | Last sync: ${device.lastSyncDateTime}
Risk score: ${score}/100 (${level})
Factors: ${factors.map(f => f.description).join(' | ')}

Respond with JSON only: { "summary": "2 sentence assessment", "actionItems": ["action 1", "action 2", "action 3"] }`

      const resp = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        max_tokens: 350,
      })

      const parsed = JSON.parse(resp.choices[0]?.message?.content ?? '{}') as {
        summary?: string
        actionItems?: string[]
      }
      aiSummary   = parsed.summary    ?? ''
      actionItems = parsed.actionItems ?? []
    } catch {
      // Fall through to rule-based defaults
    }
  }

  if (!aiSummary) {
    aiSummary = factors.length > 0
      ? `Risk score ${score}/100: ${factors.map(f => f.description).join('; ')}.`
      : 'No significant risk factors detected — device appears healthy.'
  }
  if (actionItems.length === 0) {
    actionItems = factors.slice(0, 3).map(f => `Remediate: ${f.description}`)
  }

  return {
    deviceId:     device.id,
    deviceName:   device.deviceName,
    userEmail:    device.userPrincipalName,
    overallScore: score,
    riskLevel:    level,
    factors,
    aiSummary,
    actionItems,
    computedAt:   new Date().toISOString(),
  }
}

/**
 * The N riskiest devices of the WHOLE fleet. Every device gets the cheap rule-based score first (no network),
 * the list is cut to the top N, and only those N get the optional AI summary. (It used to score the first N
 * devices Graph happened to return, so on a larger fleet the real top risks could be missed.)
 */
export async function batchComputeRiskScores(
  devices: GraphManagedDevice[],
  openai: OpenAI | null,
  options: { limit?: number; useAi?: boolean } = {}
): Promise<DeviceRiskScore[]> {
  const { limit = 100, useAi = true } = options
  const riskiest = devices
    .map(device => ({ device, score: ruleBasedScore(device).score }))
    .sort((a, b) => b.score - a.score) // stable: ties keep the order Graph returned
    .slice(0, limit)
  const scores = await Promise.all(riskiest.map(r => computeRiskScore(r.device, openai, useAi)))
  return scores.sort((a, b) => b.overallScore - a.overallScore)
}

export interface FleetRiskSummary { critical: number; high: number; medium: number; low: number; avgScore: number; totalDevices: number }

/** Risk-level counts across every device (rule-based, no network), so headline numbers do not depend on the Top-N size. */
export function fleetRiskSummary(devices: GraphManagedDevice[]): FleetRiskSummary {
  const summary: FleetRiskSummary = { critical: 0, high: 0, medium: 0, low: 0, avgScore: 0, totalDevices: devices.length }
  let total = 0
  for (const device of devices) {
    const { score } = ruleBasedScore(device)
    summary[toRiskLevel(score)]++
    total += score
  }
  summary.avgScore = devices.length ? Math.round(total / devices.length) : 0
  return summary
}
