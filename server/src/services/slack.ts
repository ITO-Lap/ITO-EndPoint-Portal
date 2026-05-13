import type { RuntimeSlackConfig } from '../store/integrationStore.js'

export interface SlackWorkspaceInfo {
  teamId:   string
  teamName: string
  url:      string
}

export async function testSlackConnection(
  cfg: RuntimeSlackConfig,
): Promise<{ ok: boolean; error?: string; workspace?: SlackWorkspaceInfo }> {
  const res = await fetch('https://slack.com/api/auth.test', {
    headers: { Authorization: `Bearer ${cfg.botToken}` },
  })
  const data = (await res.json()) as {
    ok: boolean; error?: string
    team_id?: string; team?: string; url?: string
  }
  if (!data.ok) return { ok: false, error: data.error ?? 'auth.test failed' }
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
  const res = await fetch(`https://api.slack.com/audit/v1/logs?${params}`, {
    headers: { Authorization: `Bearer ${cfg.botToken}` },
  })
  if (!res.ok) return { entries: [], ok: false, error: `HTTP ${res.status}` }
  const data = (await res.json()) as { entries?: Record<string, unknown>[]; error?: string }
  if (data.error) return { entries: [], ok: false, error: data.error }
  return { entries: data.entries ?? [], ok: true }
}
