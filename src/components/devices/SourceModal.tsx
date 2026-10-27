import { useState, useEffect } from 'react'
import { Modal } from '../ui/Modal'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { useToast } from '../ui/ToastProvider'
import { api } from '../../api'
import type { IntegrationStatusItem } from '../../api'
import type { ConnectedSource } from '../../types'

interface SourceModalProps {
  open: boolean
  onClose: () => void
  source: ConnectedSource | null
}

const SOURCE_DESCRIPTIONS: Record<string, string> = {
  'Microsoft Intune': 'Microsoft Intune manages Windows device compliance policies, BitLocker enforcement, OS update rings, and conditional access rules across the organisation.',
  'Microsoft Entra ID': 'Microsoft Entra ID (Azure AD) provides identity signals — sign-in logs, risky sign-in events, MFA registration status, directory audits, and user lifecycle events used to enrich device risk context.',
  'Manage Engine': 'ManageEngine tracks Windows, macOS, and Linux device inventory, patch compliance, software licensing, and remote management workflows.',
  'Jira': 'Jira integration creates and links tickets from Risk Scoring rows and Automation Rule actions. Tickets are raised directly against the configured project.',
  'Confluence': 'Confluence integration searches your knowledge base to surface relevant articles alongside device issues from Risk Scoring.',
  'Slack': 'Slack integration posts compliance alerts and automation notifications to a configured channel, and can pull workspace audit logs where the Slack Audit Logs scope is granted.',
}

// Only these integration ids have a real server-side status snapshot and a
// real force-sync endpoint. Jira/Confluence are write-on-demand integrations
// with no fetch loop to report on, so we show them without a live status
// row rather than fabricate one.
const SYNCABLE_IDS = new Set(['intune', 'manageengine', 'entra', 'slack'])

export function SourceModal({ open, onClose, source }: SourceModalProps) {
  const [syncing, setSyncing] = useState(false)
  const [status, setStatus] = useState<IntegrationStatusItem | null>(null)
  const [loadingStatus, setLoadingStatus] = useState(false)
  const { notify } = useToast()

  useEffect(() => {
    if (!open || !source) { setStatus(null); return }
    setLoadingStatus(true)
    api.fetchIntegrationStatus()
      .then(items => setStatus(items.find(i => i.id === source.integrationId) ?? null))
      .catch(() => setStatus(null))
      .finally(() => setLoadingStatus(false))
  }, [open, source])

  if (!source) return null

  const description = SOURCE_DESCRIPTIONS[source.name] ?? source.name
  // Incoming webhooks only deliver outbound alerts; a Sync would be a misleading
  // bot-token API probe and could not validate the webhook without posting a message.
  const canSync = SYNCABLE_IDS.has(source.integrationId) && status?.connectionType !== 'incoming_webhook'

  const handleSyncNow = async () => {
    setSyncing(true)
    try {
      const result = await api.syncIntegration(source.integrationId)
      if (result.error) {
        notify('error', 'Sync Failed', result.error)
      } else {
        notify('success', 'Sync Complete', `${source.name} re-synced${result.deviceCount ? ` — ${result.deviceCount} records` : ''}`)
        const items = await api.fetchIntegrationStatus()
        setStatus(items.find(i => i.id === source.integrationId) ?? null)
      }
    } catch (err) {
      notify('error', 'Sync Failed', err instanceof Error ? err.message : 'Could not reach the sync endpoint')
    } finally {
      setSyncing(false)
    }
  }

  const statusBadge = !status
    ? <Badge label="Unknown" variant="gray" className="text-[0.62rem] px-2 py-0.5" />
    : !status.configured
    ? <Badge label="Not Configured" variant="gray" className="text-[0.62rem] px-2 py-0.5" />
    : status.healthy === false
    ? <Badge label="Error" variant="red" className="text-[0.62rem] px-2 py-0.5" />
    : <Badge label="Connected" variant="green" className="text-[0.62rem] px-2 py-0.5" />

  return (
    <Modal
      open={open}
      title={source.name}
      description="Integration details and sync status"
      onClose={onClose}
    >
      <div className="space-y-4">
        <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 overflow-hidden">
          <div className="flex items-center justify-between gap-4 px-4 py-2.5 bg-white">
            <span className="text-xs text-slate-500">Status</span>
            {loadingStatus ? <span className="text-xs text-slate-400">Loading…</span> : statusBadge}
          </div>
          <div className="flex items-center justify-between gap-4 px-4 py-2.5 bg-white">
            <span className="text-xs text-slate-500">Last Sync</span>
            <span className="text-xs font-medium text-slate-900">
              {canSync ? (status?.lastSyncAt ? new Date(status.lastSyncAt).toLocaleString() : 'Never') : 'On demand'}
            </span>
          </div>
          <div className="flex items-center justify-between gap-4 px-4 py-2.5 bg-white">
            <span className="text-xs text-slate-500">Integration</span>
            <span className="text-xs font-medium text-slate-900">{source.label}</span>
          </div>
          {status?.error && (
            <div className="flex items-center justify-between gap-4 px-4 py-2.5 bg-red-50">
              <span className="text-xs text-red-600">Last Error</span>
              <span className="text-xs font-medium text-red-700 truncate max-w-[220px]">{status.error}</span>
            </div>
          )}
        </div>

        <p className="text-xs text-slate-600 leading-relaxed">{description}</p>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Close</Button>
          {canSync && (
            <Button onClick={handleSyncNow} disabled={syncing}>
              {syncing ? 'Syncing…' : 'Sync Now'}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  )
}
