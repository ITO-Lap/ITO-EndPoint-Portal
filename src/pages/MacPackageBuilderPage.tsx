import { useEffect, useState } from 'react'
import { AlertTriangle, ArrowLeft, Apple, Check, Copy, Download, Loader2, Package, RefreshCw } from 'lucide-react'
import { macPackagerApi, type MacPackagerInfo } from '../api/macPackager'
import { hasPermission } from '../lib/permissions'
import { usePermissions } from '../context/permissionsHooks'

const fmtBytes = (n: number): string => (n >= 1024 ** 3 ? `${(n / 1024 ** 3).toFixed(2)} GB` : n >= 1024 ** 2 ? `${(n / 1024 ** 2).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`)

function CopyButton({ value, label }: { value: string; label: string }) {
  const [done, setDone] = useState(false)
  return (
    <button type="button" aria-label={`Copy ${label}`} title={`Copy ${label}`}
      onClick={() => { void navigator.clipboard.writeText(value).then(() => { setDone(true); window.setTimeout(() => setDone(false), 1500) }).catch(() => undefined) }}
      className="flex-shrink-0 rounded p-1 text-blue-600 hover:bg-blue-50">
      {done ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4"><h2 className="text-sm font-bold text-slate-800">{title}</h2>{children}</section>
}

export function MacPackageBuilderPage({ onBack, viewerRole }: { onBack: () => void; viewerRole?: string }) {
  const permissions = usePermissions()
  const allowed = hasPermission(viewerRole ?? '', permissions, 'macPackager.read')
  const [info, setInfo] = useState<MacPackagerInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!allowed) return
    let live = true
    void macPackagerApi.info().then(i => { if (live) { setInfo(i); setError(null) } }).catch(e => { if (live) setError(e instanceof Error ? e.message : 'Request failed') })
    return () => { live = false }
  }, [allowed, reloadKey])

  if (!allowed) {
    return <div className="p-6"><div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">You do not have permission to view Mac Package Builder.</div></div>
  }

  async function download(name: string) {
    setBusy(name); setError(null)
    try { await macPackagerApi.download(name) } catch (e) { setError(e instanceof Error ? e.message : 'Download failed') } finally { setBusy(null) }
  }

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={onBack} className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Back to dashboard"><ArrowLeft className="h-4 w-4" /></button>
        <div>
          <h1 className="flex items-center gap-2 text-lg font-bold text-slate-900"><Apple className="h-5 w-5" />Mac Package Builder</h1>
          <p className="text-xs text-slate-500">Native macOS tool for building macOS packages and Intune <span className="font-mono">.intunewin</span> files.</p>
        </div>
        <button type="button" onClick={() => setReloadKey(k => k + 1)} className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-full border border-slate-300 px-4 text-xs font-bold text-slate-700 hover:bg-slate-50"><RefreshCw className="h-3.5 w-3.5" />Refresh</button>
      </div>

      {error && <div role="alert" className="flex gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />{error}</div>}
      {!info && !error && <p className="text-xs text-slate-500"><Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" />Loading…</p>}

      {info && (
        <>
          <div className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900"><strong>{info.runsOn}</strong> Download a build below and open it on a Mac, or build it from the project source.</div>

          <Card title="What it does">
            <ul className="grid gap-3 sm:grid-cols-2">
              {info.features.map(f => (
                <li key={f.title} className="rounded-xl bg-slate-50 p-3 text-xs"><p className="font-semibold text-slate-800"><Package className="mr-1 inline h-3.5 w-3.5 text-slate-400" />{f.title}</p><p className="mt-1 text-slate-600">{f.detail}</p></li>
              ))}
            </ul>
          </Card>

          <Card title="Download">
            {info.downloads.builds.length > 0 ? (
              <table className="w-full text-xs"><thead><tr className="text-left text-slate-500"><th>File</th><th>Size</th><th>Updated</th><th>SHA-256</th><th /></tr></thead><tbody>
                {info.downloads.builds.map(b => (
                  <tr key={b.name} className="border-t border-slate-100 align-top">
                    <td className="py-2 font-semibold text-slate-800">{b.name}</td><td>{fmtBytes(b.sizeBytes)}</td><td>{new Date(b.modifiedAt).toLocaleDateString()}</td>
                    <td className="max-w-[16rem] break-all font-mono text-[0.65rem]">{b.sha256}<CopyButton value={b.sha256} label="SHA-256" /></td>
                    <td className="text-right"><button type="button" onClick={() => void download(b.name)} disabled={busy === b.name} aria-label={`Download ${b.name}`}
                      className="inline-flex h-7 items-center gap-1 rounded-full bg-blue-600 px-3 text-[0.7rem] font-bold text-white hover:bg-blue-700 disabled:opacity-50">{busy === b.name ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}Download</button></td>
                  </tr>
                ))}</tbody></table>
            ) : (
              <p className="text-xs text-slate-600"><strong>No build is published on this server{info.downloads.configured ? ' yet' : ''}.</strong>{' '}
                {info.downloads.configured ? 'The download folder is empty.' : 'An administrator can publish one by setting MAC_PACKAGE_BUILDER_DIST_DIR on the server and copying the .dmg or .pkg into it.'} Until then, build it from source below.</p>
            )}
            <p className="text-[0.7rem] text-slate-500">Builds are only as trustworthy as whoever published them: compare the SHA-256 with the value from the build machine. An unsigned build may need right-click → Open the first time (Gatekeeper).</p>
          </Card>

          <Card title="Build from source">
            {info.source.bundled ? (
              <p className="text-xs text-slate-600">Project: <span className="font-mono">apps/mac-package-builder/</span>{info.source.originalCommit ? <> · mirrored from original commit <span className="font-mono">{info.source.originalCommit}</span></> : null}{info.source.syncedAt ? <> · synced {new Date(info.source.syncedAt).toLocaleString()}</> : null}</p>
            ) : <p className="text-xs text-amber-800">The project source is not bundled with this deployment; build from the repository checkout instead.</p>}
            <ol className="space-y-1.5">
              {info.buildSteps.map(s => (
                <li key={s.label} className="text-xs"><p className="font-semibold text-slate-700">{s.label}</p>
                  <div className="flex items-start gap-1"><code className="min-w-0 flex-1 break-all rounded bg-slate-900 px-2 py-1 text-[0.7rem] text-slate-100">{s.command}</code><CopyButton value={s.command} label={s.label} /></div></li>
              ))}
            </ol>
          </Card>

          <Card title="Requirements"><ul className="list-disc space-y-1 pl-5 text-xs text-slate-700">{info.requirements.map(r => <li key={r}>{r}</li>)}</ul></Card>

          <p className="text-[0.7rem] text-slate-500">Packages made by this tool are built on macOS and have not been installed or tested on Windows. Looking for browser-based Windows packaging? Use <strong>Windows Package Builder</strong> in the same menu.</p>
        </>
      )}
    </div>
  )
}
