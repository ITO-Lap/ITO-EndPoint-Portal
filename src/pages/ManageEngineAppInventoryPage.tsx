import { ArrowLeft, Layers } from 'lucide-react'
import { AppIntelligencePage } from './AppIntelligencePage'

interface Props { onBack: () => void; viewerRole?: string; userEmail?: string }

/** One application view for Windows and macOS: installed vs verified latest version, status and device counts.
 * Provider, install source and platform are filters on the one table, not separate tabs. */
export function ManageEngineAppInventoryPage({ onBack, viewerRole, userEmail }: Props) {
  return (
    <div className="flex flex-col gap-5 w-full page-enter">
      <div className="glass rounded-2xl overflow-hidden">
        <div className="h-[3px]" style={{ background: 'linear-gradient(90deg,#FF6B35,#F46C00,#FFB800)' }} />
        <div className="px-5 py-4 flex items-center gap-3">
          <button type="button" onClick={onBack}
            className="flex items-center gap-1.5 rounded-full border border-slate-200 glass px-3 py-1.5 text-sm font-medium text-slate-600 water-glow">
            <ArrowLeft className="h-4 w-4" />Back
          </button>
          <div className="grid h-10 w-10 place-items-center rounded-2xl" style={{ background: 'linear-gradient(135deg,#FF6B35,#F46C00)' }}>
            <Layers className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-black text-slate-800">Managed Application</h1>
            <p className="text-[0.68rem] text-slate-400">Installed vs latest verified version for Windows and macOS apps, from Intune and Endpoint Central</p>
          </div>
        </div>
      </div>
      <AppIntelligencePage embedded {...(viewerRole ? { viewerRole } : {})} {...(userEmail ? { userEmail } : {})} />
    </div>
  )
}
