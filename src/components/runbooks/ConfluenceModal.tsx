import { useState, useEffect, useRef } from 'react'
import { X, Search, BookOpen, ExternalLink, Plus, RefreshCw, Check } from 'lucide-react'
import { api } from '../../api'
import type { ConfluencePage, ApiDevice } from '../../api'

interface Props {
  device:    ApiDevice
  attached:  ConfluencePage[]
  onClose:   () => void
  onAttach:  (page: ConfluencePage) => void
  onDetach:  (pageId: string) => void
}

export function ConfluenceModal({ device, attached, onClose, onAttach, onDetach }: Props) {
  const [query, setQuery]       = useState('')
  const [results, setResults]   = useState<ConfluencePage[]>([])
  const [loading, setLoading]   = useState(false)
  const debounceRef             = useRef<ReturnType<typeof setTimeout> | null>(null)

  const attachedIds = new Set(attached.map(p => p.id))

  const search = async (q: string) => {
    setLoading(true)
    try {
      const data = await api.searchConfluence(q)
      setResults(data)
    } catch {
      setResults([])
    } finally {
      setLoading(false)
    }
  }

  // Load default results on mount
  useEffect(() => { search('') }, [])

  const handleQueryChange = (value: string) => {
    setQuery(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(value), 400)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-slate-200 flex flex-col max-h-[88vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-xl bg-orange-50 border border-orange-200">
              <BookOpen className="h-4 w-4 text-orange-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800">Link Confluence Article</p>
              <p className="text-xs text-slate-500">{device.deviceName}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 hover:bg-slate-100 text-slate-400 transition">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Attached articles */}
        {attached.length > 0 && (
          <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Attached ({attached.length})</p>
            <div className="flex flex-col gap-1.5">
              {attached.map(page => (
                <div key={page.id} className="flex items-center justify-between gap-2 rounded-xl bg-white border border-orange-200 px-3 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="rounded-md bg-orange-100 px-1.5 py-0.5 text-[0.6rem] font-bold text-orange-700 uppercase">{page.space}</span>
                    <span className="text-xs font-medium text-slate-700 truncate">{page.title}</span>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <a href={page.url} target="_blank" rel="noreferrer" className="rounded p-1 hover:bg-orange-50 text-slate-400 hover:text-orange-600 transition">
                      <ExternalLink className="h-3 w-3" />
                    </a>
                    <button type="button" onClick={() => onDetach(page.id)} className="rounded p-1 hover:bg-red-50 text-slate-400 hover:text-red-500 transition" title="Remove">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Search */}
        <div className="px-5 py-3 border-b border-slate-100">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={e => handleQueryChange(e.target.value)}
              placeholder="Search Confluence articles…"
              className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-4 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-orange-400"
              autoFocus
            />
          </div>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto px-5 py-3 flex flex-col gap-2">
          {loading ? (
            <div className="flex items-center justify-center py-10 gap-2 text-slate-400 text-sm">
              <RefreshCw className="h-4 w-4 animate-spin" />
              Searching…
            </div>
          ) : results.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-slate-400 gap-2">
              <BookOpen className="h-7 w-7 opacity-30" />
              <p className="text-sm">No articles found</p>
            </div>
          ) : (
            results.map(page => {
              const isAttached = attachedIds.has(page.id)
              return (
                <div key={page.id} className={`rounded-xl border px-3 py-3 transition ${isAttached ? 'border-orange-300 bg-orange-50' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[0.6rem] font-bold text-slate-600 uppercase">{page.space}</span>
                        <span className="text-xs font-semibold text-slate-800 truncate">{page.title}</span>
                      </div>
                      {page.excerpt && (
                        <p className="text-xs text-slate-500 line-clamp-2">{page.excerpt}</p>
                      )}
                      {page.lastModified && (
                        <p className="text-[0.6rem] text-slate-400 mt-1">Updated {page.lastModified.slice(0, 10)}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0 mt-0.5">
                      <a href={page.url} target="_blank" rel="noreferrer" className="rounded-lg p-1.5 hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                      <button
                        type="button"
                        onClick={() => isAttached ? onDetach(page.id) : onAttach(page)}
                        className={`rounded-lg p-1.5 transition ${isAttached ? 'bg-orange-100 text-orange-600 hover:bg-red-50 hover:text-red-500' : 'hover:bg-orange-50 text-slate-400 hover:text-orange-600'}`}
                        title={isAttached ? 'Remove' : 'Attach to runbook'}
                      >
                        {isAttached ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-slate-100">
          <p className="text-xs text-slate-400">{results.length} article{results.length !== 1 ? 's' : ''} found</p>
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition">
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
