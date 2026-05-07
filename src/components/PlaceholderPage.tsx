interface PlaceholderPageProps {
  title: string
  description: string
}

export function PlaceholderPage({ title, description }: PlaceholderPageProps) {
  return (
    <div className="rounded-[24px] border border-slate-200 bg-white px-6 py-10 shadow-md shadow-slate-900/10 min-w-0 w-full">
      <h2 className="text-2xl font-semibold text-slate-900">{title}</h2>
      <p className="mt-3 text-sm text-slate-600 leading-relaxed">{description}</p>
      <div className="mt-8 rounded-3xl bg-slate-50 p-5 text-sm text-slate-700">
        <p className="font-semibold text-slate-900">Coming soon</p>
        <p className="mt-2 text-slate-600">This section is being prepared for the next release of ITO Endpoint.</p>
      </div>
    </div>
  )
}
