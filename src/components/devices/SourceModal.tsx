import { useState } from 'react'
import { Modal } from '../ui/Modal'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { useToast } from '../ui/ToastProvider'
import type { ConnectedSource } from '../../types'

interface SourceModalProps {
  open: boolean
  onClose: () => void
  source: ConnectedSource | null
}

const SOURCE_META: Record<string, { lastSync: string; description: string }> = {
  'Microsoft Intune': {
    lastSync: '2 minutes ago',
    description:
      'Microsoft Intune manages Windows device compliance policies, BitLocker enforcement, OS update rings, and conditional access rules across the organisation.',
  },
  'Microsoft Entra ID': {
    lastSync: 'On demand',
    description:
      'Microsoft Entra ID (Azure AD) provides identity signals — sign-in logs, risky sign-in events, MFA registration status, directory audits, and user lifecycle events used to enrich device risk context.',
  },
  'Kandji': {
    lastSync: '5 minutes ago',
    description:
      'Kandji manages macOS device configurations, FileVault encryption, application deployment, and compliance blueprints for Apple fleet devices.',
  },
  'Manage Engine': {
    lastSync: '12 minutes ago',
    description:
      'ManageEngine Desktop Central tracks Windows desktop inventory, patch compliance, software licensing, and remote management workflows.',
  },
  'Jira': {
    lastSync: 'On demand',
    description:
      'Jira integration auto-creates and links tickets from device runbooks and compliance failures. Tickets are raised directly against the configured project when a remediation runbook is triggered.',
  },
  'Confluence': {
    lastSync: 'On demand',
    description:
      'Confluence integration searches your knowledge base to surface relevant runbook articles alongside device issues, reducing mean time to resolution for recurring compliance failures.',
  },
  'Slack': {
    lastSync: 'On demand',
    description:
      'Slack integration ingests workspace audit logs, login events, and channel activity. Compliance alerts and remediation notifications can be pushed directly to Slack channels.',
  },
}

export function SourceModal({ open, onClose, source }: SourceModalProps) {
  const [syncing, setSyncing] = useState(false)
  const { notify } = useToast()

  if (!source) return null

  const meta = SOURCE_META[source.name] ?? { lastSync: 'Unknown', description: source.name }

  const handleSyncNow = async () => {
    setSyncing(true)
    await new Promise(resolve => setTimeout(resolve, 1000))
    setSyncing(false)
    notify('success', 'Sync Complete', `${source.name} sync completed`)
  }

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
            <Badge label="Connected" variant="green" className="text-[0.62rem] px-2 py-0.5" />
          </div>
          <div className="flex items-center justify-between gap-4 px-4 py-2.5 bg-white">
            <span className="text-xs text-slate-500">Last Sync</span>
            <span className="text-xs font-medium text-slate-900">{meta.lastSync}</span>
          </div>
          <div className="flex items-center justify-between gap-4 px-4 py-2.5 bg-white">
            <span className="text-xs text-slate-500">Integration</span>
            <span className="text-xs font-medium text-slate-900">{source.label}</span>
          </div>
        </div>

        <p className="text-xs text-slate-600 leading-relaxed">{meta.description}</p>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button onClick={handleSyncNow} disabled={syncing}>
            {syncing ? 'Syncing…' : 'Sync Now'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
