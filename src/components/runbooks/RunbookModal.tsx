import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import type { RunbookData } from '../../types'

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
      size="lg"
    >
      <div className="space-y-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-1.5">Overview</p>
          <p className="text-sm text-slate-600 leading-relaxed">
            This runbook provides step-by-step instructions to enable BitLocker encryption on the device and sync it with the management source.
          </p>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-1.5">Prerequisites</p>
          <ul className="space-y-1.5">
            {['Device must be running Windows 10 or later', 'TPM 2.0 or compatible module required', 'Local administrative access needed', 'Stable network connection required'].map(p => (
              <li key={p} className="flex items-start gap-2 text-sm text-slate-600">
                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-slate-300 flex-shrink-0" />
                {p}
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-1.5">Steps</p>
          <ol className="space-y-2.5">
            {runbookData.steps.map((step, index) => (
              <li key={step} className="flex items-start gap-3 text-sm">
                <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-orange-100 text-[0.6rem] font-bold text-orange-700">
                  {index + 1}
                </span>
                <span className="text-slate-700 leading-snug pt-0.5">{step}</span>
              </li>
            ))}
          </ol>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-1.5">Expected Result</p>
          <p className="text-sm text-slate-600 leading-relaxed">
            BitLocker will be enabled and the device will sync with the management source. Compliance status updates to "Compliant" after the next check-in cycle.
          </p>
        </div>

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button variant="outline" onClick={onCopySteps}>
            Copy Steps
          </Button>
          <Button onClick={onStartAutomation} disabled={automationLoading} className="gap-1.5">
            {automationLoading && (
              <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-30" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            {automationLoading ? 'Starting…' : 'Start Automation'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
