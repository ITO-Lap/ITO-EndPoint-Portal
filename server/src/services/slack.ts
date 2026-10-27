import type { RuntimeSlackConfig } from '../store/integrationStore.js'

export interface SlackWorkspaceInfo {
  teamId:   string
  teamName: string
  url:      string
}

export interface SlackFileUpload {
  channelId: string
  filename: string
  title: string
  content: Buffer
  initialComment?: string
  /** Block Kit blocks for the message the file is attached to. Slack ignores them when `initialComment` is set. */
  blocks?: unknown[]
}

/** Sends a small operational alert. Bot delivery targets a channel; webhook
 * delivery uses the channel configured on the Slack Incoming Webhook. */
export async function sendSlackMessage(cfg: RuntimeSlackConfig, channelId: string | undefined, text: string): Promise<{ ok: boolean; error?: string }> {
  try {
    if (cfg.botToken && channelId) {
      const res = await fetchWithTimeout('https://slack.com/api/chat.postMessage', {
        method: 'POST', headers: { Authorization: `Bearer ${cfg.botToken}`, 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ channel: channelId, text, unfurl_links: false }),
      })
      const body = await res.json() as { ok: boolean; error?: string }
      return body.ok ? { ok: true } : { ok: false, error: body.error ?? 'Slack rejected the message.' }
    }
    if (cfg.webhookUrl) {
      const res = await fetchWithTimeout(cfg.webhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, unfurl_links: false }) })
      return res.ok ? { ok: true } : { ok: false, error: `Incoming webhook returned HTTP ${res.status}` }
    }
    return { ok: false, error: 'No Slack Bot OAuth token/channel or incoming webhook is configured.' }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Slack send failed.' }
  }
}

/** Posts a Block Kit message to a channel (bot token required). `text` is the
 * notification / accessibility fallback shown where blocks are not rendered. */
export async function sendSlackBlocks(cfg: RuntimeSlackConfig, channelId: string, text: string, blocks: unknown[]): Promise<{ ok: boolean; error?: string; ts?: string }> {
  if (!cfg.botToken) return { ok: false, error: 'A Bot OAuth token is required to post Slack blocks.' }
  try {
    const res = await fetchWithTimeout('https://slack.com/api/chat.postMessage', {
      method: 'POST', headers: { Authorization: `Bearer ${cfg.botToken}`, 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ channel: channelId, text, blocks, unfurl_links: false }),
    })
    const body = await res.json() as { ok: boolean; error?: string; ts?: string }
    return body.ok ? { ok: true, ...(body.ts ? { ts: body.ts } : {}) } : { ok: false, error: body.error ?? 'Slack rejected the message.' }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Slack send failed.' }
  }
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
  if (!cfg.botToken) {
    return { ok: false, error: 'Incoming webhook is configured for alerts; a Bot OAuth token is required for Slack API health checks.' }
  }
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
  if (!cfg.botToken) return { entries: [], ok: false, error: 'A Bot OAuth token is required to read Slack audit logs.' }
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

/** Uploads a generated report through Slack's external file-upload flow. */
export async function uploadSlackFile(cfg: RuntimeSlackConfig, upload: SlackFileUpload): Promise<{ ok: boolean; error?: string; fileId?: string }> {
  if (!cfg.botToken) return { ok: false, error: 'A Bot OAuth token is required to upload Slack files.' }
  try {
    const uploadRequest = await fetchWithTimeout('https://slack.com/api/files.getUploadURLExternal', {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.botToken}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ filename: upload.filename, length: String(upload.content.length) }),
    })
    const uploadInfo = await uploadRequest.json() as { ok: boolean; error?: string; upload_url?: string; file_id?: string }
    if (!uploadInfo.ok || !uploadInfo.upload_url || !uploadInfo.file_id) return { ok: false, error: uploadInfo.error ?? 'Slack did not return an upload URL.' }

    const binaryUpload = await fetchWithTimeout(uploadInfo.upload_url, {
      method: 'POST', headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }, body: new Uint8Array(upload.content),
    })
    if (!binaryUpload.ok) return { ok: false, error: `Slack file upload returned HTTP ${binaryUpload.status}` }

    const completeRequest = await fetchWithTimeout('https://slack.com/api/files.completeUploadExternal', {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.botToken}`, 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ files: [{ id: uploadInfo.file_id, title: upload.title }], channel_id: upload.channelId, ...(upload.blocks ? { blocks: upload.blocks } : upload.initialComment ? { initial_comment: upload.initialComment } : {}) }),
    })
    const completeInfo = await completeRequest.json() as { ok: boolean; error?: string }
    return completeInfo.ok ? { ok: true, fileId: uploadInfo.file_id } : { ok: false, error: completeInfo.error ?? 'Slack could not complete the file upload.' }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Slack file upload failed.' }
  }
}
