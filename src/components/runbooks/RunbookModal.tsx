import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import type { RunbookData } from '../../types'

interface RunbookModalProps {
  open: boolean
  onClose: () => void
  runbookData: RunbookData
  onCopySteps: () => void
}

export function RunbookModal({ open, onClose, runbookData, onCopySteps }: RunbookModalProps) {
  return (
    <Modal
      open={open}
      title={runbookData.runbookName}
      description="Recommended remediation for this device's current compliance state"
      onClose={onClose}
      size="lg"
    >
      <div className="space-y-5">
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

        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-1.5">Escalation</p>
            <p className="text-sm text-slate-600">{runbookData.escalation}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-1.5">Automation</p>
            <p className="text-sm text-slate-600">{runbookData.automation}</p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button onClick={onCopySteps}>
            Copy Steps
          </Button>
        </div>
      </div>
    </Modal>
  )
}
