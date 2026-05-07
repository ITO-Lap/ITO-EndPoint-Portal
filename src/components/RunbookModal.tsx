import { Modal } from './Modal'
import { Button } from './Button'
import type { RunbookData } from '../types'

interface RunbookModalProps {
  open: boolean
  onClose: () => void
  runbookData: RunbookData
  onCopySteps: () => void
  onStartAutomation?: () => void
  automationLoading?: boolean
}

export function RunbookModal({ open, onClose, runbookData, onCopySteps, onStartAutomation, automationLoading = false }: RunbookModalProps) {
  return (
    <Modal
      open={open}
      title={runbookData.runbookName}
      description="Follow these steps to resolve the compliance issue"
      onClose={onClose}
    >
      <div className="space-y-6">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Overview</h3>
          <p className="mt-2 text-sm text-slate-600">
            This runbook provides step-by-step instructions to enable BitLocker encryption on the device and sync it with the management source.
          </p>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-slate-900">Prerequisites</h3>
          <ul className="mt-2 space-y-2 text-sm text-slate-600 list-disc list-inside">
            <li>Device must be running Windows 10 or later</li>
            <li>TPM 2.0 or compatible module required</li>
            <li>Local administrative access needed</li>
            <li>Stable network connection required</li>
          </ul>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-slate-900">Runbook Steps</h3>
          <ol className="mt-3 space-y-3">
            {runbookData.steps.map((step, index) => (
              <li key={step} className="flex gap-3 text-sm">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-sky-100 text-xs font-semibold text-sky-600 flex-shrink-0">
                  {index + 1}
                </span>
                <span className="text-slate-700 pt-0.5">{step}</span>
              </li>
            ))}
          </ol>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-slate-900">Expected Result</h3>
          <p className="mt-2 text-sm text-slate-600">
            After completing these steps, the device will have BitLocker encryption enabled and will sync with the management source. The compliance status should update to "Compliant" after the next check-in cycle.
          </p>
        </div>

        <div className="flex flex-wrap gap-3 pt-4 border-t border-slate-200">
          <Button onClick={onClose} variant="outline" className="px-4 py-2 text-sm">
            Close
          </Button>
          <Button onClick={onCopySteps} className="px-4 py-2 text-sm">
            Copy Steps
          </Button>
          <Button className="px-4 py-2 text-sm" disabled={automationLoading} onClick={onStartAutomation}>
            {automationLoading ? 'Starting...' : 'Start Automation'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
