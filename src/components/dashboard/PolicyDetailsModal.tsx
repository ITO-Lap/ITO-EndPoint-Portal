import { Modal } from '../ui/Modal'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import type { DeviceData, BadgeVariant } from '../../types'

interface PolicyDetailsModalProps {
  open: boolean
  onClose: () => void
  device: DeviceData
}

export function PolicyDetailsModal({ open, onClose, device }: PolicyDetailsModalProps) {
  const severityVariant: BadgeVariant =
    device.severity === 'High' ? 'red' : device.severity === 'Medium' ? 'orange' : 'green'

  return (
    <Modal
      open={open}
      title="Policy Details"
      description={device.policyFailed}
      onClose={onClose}
    >
      <div className="space-y-4">
        <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 overflow-hidden">
          {[
            { label: 'Policy Name', value: device.policyFailed },
            { label: 'Management Source', value: device.managementSource },
            { label: 'Issue Source', value: device.issueSource },
            { label: 'First Detected', value: device.firstDetected },
            { label: 'Last Detected', value: device.lastDetected },
          ].map(({ label, value }) => (
            <div key={label} className="flex items-start justify-between gap-4 px-4 py-2.5 bg-white">
              <span className="text-xs text-slate-500 flex-shrink-0 w-36">{label}</span>
              <span className="text-xs font-medium text-slate-900 text-right">{value}</span>
            </div>
          ))}
          <div className="flex items-start justify-between gap-4 px-4 py-2.5 bg-white">
            <span className="text-xs text-slate-500 flex-shrink-0 w-36">Severity</span>
            <Badge label={device.severity} variant={severityVariant} className="text-[0.62rem] px-2 py-0.5" />
          </div>
        </div>

        {device.nextSteps.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-semibold text-slate-700 uppercase tracking-wide">Recommended Remediation</p>
            <ol className="space-y-1.5">
              {device.nextSteps.map((step, i) => (
                <li key={i} className="flex items-start gap-2.5 text-xs text-slate-700">
                  <span className="grid h-4 w-4 flex-shrink-0 place-items-center rounded-full bg-sky-100 text-[0.55rem] font-bold text-sky-700">
                    {i + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
          </div>
        )}

        <div className="flex justify-end pt-1">
          <Button variant="outline" onClick={onClose}>Close</Button>
        </div>
      </div>
    </Modal>
  )
}
