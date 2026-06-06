import type { RuntimeSlackConfig } from '../store/integrationStore.js'

export interface SlackWorkspaceInfo {
  teamId:   string
  teamName: string
  url:      string
}

// Wrap fetch with a hard deadline so hung Slack endpoints don't block forever.
async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 10_000): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw new Error(`Slack API timed out after ${timeoutMs / 1000}s`)
    throw err
  } finally {
    clearTimeout(timer)
  }
}

export async function testSlackConnection(
  cfg: RuntimeSlackConfig,
): Promise<{ ok: boolean; error?: string; workspace?: SlackWorkspaceInfo }> {
  let res: Response
  try {
    res = await fetchWithTimeout(
      'https://slack.com/api/auth.test',
      { headers: { Authorization: `Bearer ${cfg.botToken}` } },
    )
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Network error' }
  }

  let data: { ok: boolean; error?: string; team_id?: string; team?: string; url?: string }
  try {
    data = await res.json()
  } catch {
    return { ok: false, error: `Slack returned non-JSON response (HTTP ${res.status})` }
  }

  if (!data.ok) return { ok: false, error: data.error ?? 'auth.test returned ok=false' }
  return {
    ok: true,
    workspace: { teamId: data.team_id ?? '', teamName: data.team ?? '', url: data.url ?? '' },
  }
}

export async function fetchSlackAuditLogs(
  cfg: RuntimeSlackConfig,
  limit = 100,
): Promise<{ entries: Record<string, unknown>[]; ok: boolean; error?: string }> {
  const params = new URLSearchParams({ limit: String(limit) })
  let res: Response
  try {
    res = await fetchWithTimeout(
      `https://api.slack.com/audit/v1/logs?${params}`,
      { headers: { Authorization: `Bearer ${cfg.botToken}` } },
    )
  } catch (err) {
    return { entries: [], ok: false, error: err instanceof Error ? err.message : 'Network error' }
  }

  if (!res.ok) return { entries: [], ok: false, error: `HTTP ${res.status}` }

  let data: { entries?: Record<string, unknown>[]; error?: string }
  try {
    data = await res.json()
  } catch {
    return { entries: [], ok: false, error: `Slack returned non-JSON response (HTTP ${res.status})` }
  }

  if (data.error) return { entries: [], ok: false, error: data.error }
  return { entries: data.entries ?? [], ok: true }
}
