import { Modal } from '../ui/Modal'
import { Laptop2, Circle } from 'lucide-react'
import { Badge } from '../ui/Badge'
import type { ActivityItem } from '../../types'

interface ActivityListModalProps {
  open: boolean
  onClose: () => void
  items: ActivityItem[]
  onSelectDevice: (deviceName: string) => void
}

export function ActivityListModal({ open, onClose, items, onSelectDevice }: ActivityListModalProps) {
  return (
    <Modal
      open={open}
      title="Recent Activity"
      description="All recent device activities and status updates"
      onClose={onClose}
    >
      <div className="space-y-3 max-h-96 overflow-y-auto">
        {items.map((item) => {
          const statusVariantMap = {
            green: 'green',
            yellow: 'yellow',
            red: 'red',
          } as const

          return (
            <button
              key={item.device}
              onClick={() => onSelectDevice(item.device)}
              type="button"
              className="w-full text-left flex flex-col gap-1 rounded-lg border border-slate-200/60 bg-slate-50 px-3 py-2.5 shadow-sm shadow-slate-900/5 hover:bg-slate-100 hover:border-sky-300 focus-visible:ring-2 focus-visible:ring-sky-300 transition min-w-0"
            >
              <div className="flex items-start gap-2.5 min-w-0">
                <div className="grid h-8 w-8 place-items-center rounded-lg bg-slate-900 text-slate-100 flex-shrink-0">
                  <Laptop2 className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-slate-900 break-words whitespace-normal">{item.device}</p>
                  <p className="mt-0.5 text-xs text-slate-500 break-words whitespace-normal">{item.message}</p>
                </div>
              </div>
              <div className="flex items-center justify-between gap-2 min-w-0 ml-2.5">
                <div className="flex items-center gap-1.5 text-[0.70rem] text-slate-500">
                  <Circle className="h-2 w-2 text-slate-400 flex-shrink-0" />
                  <span className="whitespace-nowrap">{item.time}</span>
                </div>
                <Badge variant={statusVariantMap[item.color]} label={item.status} className="flex-shrink-0 px-2 py-0.5 text-[0.60rem]" />
              </div>
            </button>
          )
        })}
      </div>
    </Modal>
  )
}
