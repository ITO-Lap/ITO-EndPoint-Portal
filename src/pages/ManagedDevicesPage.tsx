import { ArrowLeft, Monitor, Server } from 'lucide-react'
import { useLocalStorage } from '../hooks/useLocalStorage'
import { MacDevicesPage } from './MacDevicesPage'
import { IntuneDevicesPage } from './IntuneDevicesPage'
import type { UserToolRole } from '../types'

type View = 'mac' | 'intune'

interface Props {
  viewerRole: UserToolRole
  userEmail?: string
  onBack: () => void
  onViewDevice?: (deviceName: string) => void
}

export function ManagedDevicesPage({ viewerRole, userEmail, onBack, onViewDevice }: Props) {
  const [view, setView] = useLocalStorage<View>('managedDevicesView', 'mac')

  return (
    <div className="flex flex-col gap-5 w-full">

      {/* ── Header ── */}
      <div className="flex items-center gap-3 flex-wrap">
        <button type="button" onClick={onBack}
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 shadow-sm hover:bg-slate-50 hover:border-slate-300 transition">
          <ArrowLeft className="h-4 w-4" />Dashboard
        </button>
        <div className="flex items-center gap-2.5">
          <div className="grid h-9 w-9 place-items-center rounded-2xl bg-slate-100 border border-slate-200">
            <Monitor className="h-5 w-5 text-slate-700" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Managed Devices</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              {view === 'mac' ? 'Managed by ManageEngine — device & security reports' : 'Microsoft Intune · Windows & Cross-platform MDM'}
            </p>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-1 rounded-full bg-slate-100 p-1">
          <button type="button" onClick={() => setView('mac')}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all ${
              view === 'mac' ? 'is-selected' : 'text-slate-500 hover:text-slate-700'
            }`}>
            <Monitor className="h-3.5 w-3.5" />Mac Devices
          </button>
          <button type="button" onClick={() => setView('intune')}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all ${
              view === 'intune' ? 'is-selected' : 'text-slate-500 hover:text-slate-700'
            }`}>
            <Server className="h-3.5 w-3.5" />Intune Devices
          </button>
        </div>
      </div>

      {view === 'mac' ? (
        <MacDevicesPage embedded onBack={onBack} onViewDevice={onViewDevice} />
      ) : (
        <IntuneDevicesPage embedded viewerRole={viewerRole} userEmail={userEmail} onBack={onBack} />
      )}
    </div>
  )
}
