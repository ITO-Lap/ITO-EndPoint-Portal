import { Package, X } from 'lucide-react'
import { useLocalStorage } from '../../hooks/useLocalStorage'

// Release notes shown once per user (dismissal is remembered in this browser). Add a new entry with a new id to announce
// the next change; only entries the user can open are shown.
export interface WhatsNewEntry { id: string; page: string; title: string; steps: string[] }

const WHATS_NEW: WhatsNewEntry[] = [
  {
    id: 'windows-package-builder-v1',
    page: 'Windows Package Builder',
    title: 'New: Windows Package Builder',
    steps: [
      'Upload an .msi, .exe, .msix, .appx or .zip — it is inspected automatically (nothing is run on this server).',
      'Review the suggested silent commands and detection rule, then validate on the Windows worker.',
      'Create the .intunewin and follow the Intune / Endpoint Central publishing guide. Nothing is published automatically.',
    ],
  },
]

interface Props { canOpen: (page: string) => boolean; onOpen: (page: string) => void }

export function WhatsNewBanner({ canOpen, onOpen }: Props) {
  const [dismissed, setDismissed] = useLocalStorage<string[]>('ito_whats_new_dismissed', [])
  const entry = WHATS_NEW.find(e => !dismissed.includes(e.id) && canOpen(e.page))
  if (!entry) return null
  const close = () => setDismissed([...dismissed, entry.id])
  return (
    <section aria-label="What's new" className="mb-4 flex items-start gap-3 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
      <Package className="mt-0.5 h-5 w-5 flex-shrink-0 text-sky-600" />
      <div className="min-w-0 flex-1">
        <p className="font-bold">{entry.title}</p>
        <ol className="mt-1 list-decimal space-y-0.5 pl-4 text-xs">{entry.steps.map(s => <li key={s}>{s}</li>)}</ol>
        <button type="button" onClick={() => { onOpen(entry.page); close() }} className="mt-2 rounded-full bg-sky-600 px-4 py-1 text-xs font-bold text-white hover:bg-sky-700">Open {entry.page}</button>
      </div>
      <button type="button" aria-label="Dismiss what's new" onClick={close} className="rounded-full p-1 text-sky-500 hover:bg-sky-100"><X className="h-4 w-4" /></button>
    </section>
  )
}
