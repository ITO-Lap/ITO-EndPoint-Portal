import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, RefreshCw, AlertCircle } from 'lucide-react'
import { api } from '../../api'
import type { ApiDevice, MissingPatch, MissingPatchSeverity, MissingPatchView } from '../../api'

const PATCH_TABS: { view: MissingPatchView; label: string }[] = [
  { view: 'critical', label: 'Critical' },
  { view: 'all',      label: 'All missing' },
  { view: 'os',       label: 'OS updates' },
  { view: 'app',      label: 'App updates' },
]

const EMPTY_TEXT: Record<MissingPatchView, string> = {
  critical: 'No critical missing patches were reported for this Mac in its latest Endpoint Central patch scan.',
  all:      'No missing patches were reported for this Mac in its latest Endpoint Central patch scan.',
  os:       'No missing OS updates were reported for this Mac in its latest Endpoint Central patch scan.',
  app:      'No missing application updates were reported for this Mac in its latest Endpoint Central patch scan.',
}

const SEVERITY_STYLE: Record<MissingPatchSeverity, string> = {
  Critical:  'bg-red-50 text-red-700 border-red-200',
  Important: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  Moderate:  'bg-amber-50 text-amber-700 border-amber-200',
  Low:       'bg-slate-50 text-slate-600 border-slate-200',
  Unrated:   'bg-slate-50 text-slate-500 border-slate-200',
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; patches: MissingPatch[]; fetchedAt?: string }
  | { kind: 'scope_required' | 'not_configured' | 'error' }

const fmtDate = (iso: string | null | undefined): string =>
  iso ? new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—'

function Field({ label, value }: { label: string; value: string | null }) {
  if (!value) return null
  return <span><span className="text-slate-400">{label}:</span> <span className="text-slate-700">{value}</span></span>
}

function PatchRow({ patch }: { patch: MissingPatch }) {
  return (
    <li className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <div className="flex items-start gap-2">
        <span className={`inline-flex flex-shrink-0 rounded-full border px-2 py-0.5 text-[0.62rem] font-bold ${SEVERITY_STYLE[patch.severity]}`}>{patch.severity}</span>
        <p className="text-xs font-bold text-slate-800 break-all">{patch.name}</p>
      </div>
      {patch.description && <p className="mt-1.5 text-xs text-slate-500 leading-relaxed">{patch.description}</p>}
      <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[0.65rem]">
        <Field label="Category" value={patch.category} />
        <Field label="Vendor" value={patch.vendor} />
        <Field label="Update type" value={patch.updateType} />
        <Field label="KB" value={patch.kb} />
        <Field label="Bulletin" value={patch.bulletinId} />
        <Field label="Released" value={patch.releasedAt ? fmtDate(patch.releasedAt) : null} />
        <Field label="Reboot" value={patch.rebootRequirement} />
        <Field label="Approval" value={patch.approvalStatus} />
        <Field label="Deployment" value={patch.deploymentStatus} />
      </p>
      {patch.cves.length > 0 && (
        <p className="mt-1.5 text-[0.65rem] text-slate-500"><span className="text-slate-400">CVEs:</span> {patch.cves.join(', ')}</p>
      )}
    </li>
  )
}

function Message({ children, onRetry }: { children: React.ReactNode; onRetry?: () => void }) {
  return (
    <div role="status" className="flex flex-col items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-xs text-slate-600">
      <p className="flex items-start gap-2"><AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-400" />{children}</p>
      {onRetry && (
        <button type="button" onClick={onRetry}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400">
          Retry
        </button>
      )}
    </div>
  )
}

interface Props {
  device: ApiDevice
  initialView: MissingPatchView
  onClose: () => void
}

export function MissingPatchDrawer({ device, initialView, onClose }: Props) {
  const [view, setView] = useState<MissingPatchView>(initialView)
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const requestSeq = useRef(0)
  const closeRef = useRef<HTMLButtonElement>(null)
  const resourceId = device.patchStatus?.detailResourceId || ''
  const summary = device.patchStatus

  // Fetches without touching state synchronously; callers that need a spinner set `loading` in their handler.
  const fetchPatches = useCallback((refresh: boolean) => {
    if (!resourceId) return
    const seq = ++requestSeq.current
    api.fetchMissingPatches(resourceId, view, refresh)
      .then(r => {
        if (seq !== requestSeq.current) return
        setState(r.status === 'ok' ? { kind: 'ready', patches: r.patches, fetchedAt: r.fetchedAt } : { kind: r.status })
      })
      .catch(() => { if (seq === requestSeq.current) setState({ kind: 'error' }) })
  }, [resourceId, view])

  const reload = (refresh: boolean) => { setState({ kind: 'loading' }); fetchPatches(refresh) }
  const selectView = (next: MissingPatchView) => { if (next !== view) { setState({ kind: 'loading' }); setView(next) } }

  useEffect(() => { fetchPatches(false) }, [fetchPatches])
  useEffect(() => { closeRef.current?.focus() }, [])

  // Capture phase + stopImmediatePropagation so Escape closes only the drawer, not the table modal behind it.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopImmediatePropagation()
      onClose()
    }
    document.addEventListener('keydown', handler, true)
    return () => document.removeEventListener('keydown', handler, true)
  }, [onClose])

  const title = `Missing Patch Details — ${device.deviceName}`

  const body = !resourceId ? (
    <Message>This Mac is not mapped to an Endpoint Central Patch Manager resource, so patch details can't be loaded. It may not run the Patch Manager agent, or its serial number was not found in Patch Manager.</Message>
  ) : state.kind === 'loading' ? (
    <div aria-busy="true" aria-label="Loading missing patches" className="space-y-3">
      {[0, 1, 2].map(i => <div key={i} className="h-20 animate-pulse rounded-xl bg-slate-100" />)}
    </div>
  ) : state.kind === 'scope_required' ? (
    <Message>Patch Management access is not configured. The Endpoint Central API client needs the DesktopCentralCloud.PatchMgmt.READ scope.</Message>
  ) : state.kind === 'not_configured' ? (
    <Message>ManageEngine is not configured. Add the integration in Settings to load patch details.</Message>
  ) : state.kind === 'error' ? (
    <Message onRetry={() => reload(true)}>Missing patch details couldn't be loaded right now.</Message>
  ) : state.kind !== 'ready' ? null : state.patches.length === 0 ? (
    <Message>{EMPTY_TEXT[view]}</Message>
  ) : (
    <ul className="space-y-2.5">{state.patches.map(p => <PatchRow key={`${p.patchId}-${p.name}`} patch={p} />)}</ul>
  )

  return createPortal(
    <div className="fixed inset-0 flex justify-end" style={{ zIndex: 100000, background: 'rgba(15,23,42,0.35)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <aside role="dialog" aria-modal="true" aria-label={title}
        className="flex h-full w-full flex-col bg-white shadow-2xl sm:max-w-xl"
        style={{ borderLeft: '1px solid rgba(148,163,184,0.25)' }}>
        <header className="flex items-start justify-between gap-3 px-5 pt-5 pb-3" style={{ borderBottom: '1px solid rgba(148,163,184,0.15)' }}>
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-slate-800 leading-snug break-words">{title}</h2>
            <p className="mt-1 text-[0.7rem] text-slate-500">
              Serial {device.serialNumber || '—'} · Last successful patch scan {fmtDate(summary?.lastSuccessfulScanTime)}
            </p>
            {summary && (
              <p className="mt-1 text-[0.7rem] text-slate-500">
                Missing now: {summary.criticalPatchCount} critical · {summary.missingOsPatches} OS · {summary.missingThirdPartyPatches} app
              </p>
            )}
          </div>
          <div className="flex flex-shrink-0 items-center gap-2">
            <button type="button" onClick={() => reload(true)} disabled={!resourceId || state.kind === 'loading'} aria-label="Refresh missing patches"
              className="grid h-8 w-8 place-items-center rounded-xl border border-slate-200 text-slate-500 hover:text-slate-700 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400">
              <RefreshCw className={`h-4 w-4 ${state.kind === 'loading' ? 'animate-spin' : ''}`} />
            </button>
            <button ref={closeRef} type="button" onClick={onClose} aria-label="Close missing patch details"
              className="grid h-8 w-8 place-items-center rounded-xl border border-slate-200 text-slate-500 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400">
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div role="tablist" aria-label="Missing patch filters" className="flex gap-1 px-5 py-2.5" style={{ borderBottom: '1px solid rgba(148,163,184,0.12)' }}>
          {PATCH_TABS.map(t => (
            <button key={t.view} type="button" role="tab" aria-selected={view === t.view} onClick={() => selectView(t.view)}
              className={`rounded-lg px-3 py-1 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
                view === t.view ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' : 'text-slate-500 hover:text-slate-700 border border-transparent'}`}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">{body}</div>
      </aside>
    </div>,
    document.body,
  )
}
