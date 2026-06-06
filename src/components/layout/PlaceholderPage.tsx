import { ZinniaVertical } from '../ui/ZinniaLogo'

interface PlaceholderPageProps {
  title: string
  description: string
}

export function PlaceholderPage({ title, description }: PlaceholderPageProps) {
  return (
    <div className="glass rounded-3xl px-6 py-10 min-w-0 w-full">
      <div className="max-w-lg mx-auto text-center">

        {/* Zinnia logo */}
        <div className="flex justify-center mb-8">
          <ZinniaVertical iconSize="lg" wordmarkSize="xl" subtitle="ITO Endpoint" />
        </div>

        {/* Page title */}
        <h2 className="text-xl font-bold text-slate-800 mb-2">{title}</h2>
        <p className="text-sm text-slate-500 leading-relaxed">{description}</p>

        {/* Coming soon card */}
        <div
          className="mt-8 rounded-2xl px-5 py-4 glass-light text-left"
          style={{ border: '1px solid rgba(14,165,233,0.15)', boxShadow: '0 0 0 1px rgba(14,165,233,0.08)' }}
        >
          <div className="flex items-center gap-3 mb-2">
            <div
              className="h-2 w-2 rounded-full animate-pulse"
              style={{ background: '#0EA5E9' }}
            />
            <p className="text-xs font-bold text-slate-700">Coming soon</p>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">
            This section is being prepared for the next release of ITO Endpoint — built on the Zinnia platform.
          </p>
        </div>

      </div>
    </div>
  )
}
