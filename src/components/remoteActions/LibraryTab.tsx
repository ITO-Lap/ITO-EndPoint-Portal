import { useState } from 'react'
import { Archive, Check, Play, RotateCcw, X } from 'lucide-react'
import { remoteActionsApi, type RaStatus, type ScriptDetail, type ScriptSummary } from '../../api/remoteActions'
import { Card, Empty, ErrorBanner, Notice, Pre, RiskBadge } from './shared'
import { btnOutline, btnPrimary, errMsg, fmtTime, inputCls } from './helpers'

export function LibraryTab({ status, scripts, onChanged, onRun }: { status: RaStatus; scripts: ScriptSummary[]; onChanged: () => void; onRun: (id: string) => void }) {
  const [q, setQ] = useState(''); const [os, setOs] = useState(''); const [showArchived, setShowArchived] = useState(false)
  const [detail, setDetail] = useState<ScriptDetail | null>(null); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false)
  const rows = scripts.filter(s => (showArchived || !s.archived) && (!os || s.platform === os || s.platform === 'both') && `${s.name} ${s.tags.join(' ')} ${s.owner}`.toLowerCase().includes(q.toLowerCase()))

  async function act(fn: () => Promise<unknown>) { setBusy(true); setErr(null); try { await fn(); onChanged(); if (detail) setDetail(await remoteActionsApi.script(detail.id)) } catch (e) { setErr(errMsg(e)) } finally { setBusy(false) } }

  return (
    <div className="space-y-3">
      <ErrorBanner message={err} onClose={() => setErr(null)} />
      <div className="flex flex-wrap items-center gap-2">
        <input aria-label="Search scripts" className={`${inputCls} max-w-xs`} placeholder="Search name, tag or owner" value={q} onChange={e => setQ(e.target.value)} />
        <select aria-label="Filter by platform" className={`${inputCls} max-w-[10rem]`} value={os} onChange={e => setOs(e.target.value)}><option value="">All platforms</option><option>Windows</option><option>macOS</option></select>
        <label className="flex items-center gap-1 text-xs text-slate-600"><input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} />Show archived</label>
      </div>
      {rows.length === 0 ? <Empty>No scripts match. Use “Run Script” to add one.</Empty> : (
        <div className="overflow-auto rounded-2xl border border-slate-200 bg-white"><table className="w-full text-left text-xs">
          <thead className="bg-slate-50 text-[0.65rem] uppercase text-slate-500"><tr>{['Name', 'Platform', 'Risk', 'Approval', 'Last result', ''].map(h => <th key={h} className="px-3 py-2">{h}</th>)}</tr></thead>
          <tbody>{rows.map(s => (
            <tr key={s.id} className={`border-t border-slate-100 ${s.archived ? 'opacity-60' : ''}`}>
              <td className="px-3 py-2"><button type="button" className="font-bold text-sky-700 hover:underline" onClick={() => { void remoteActionsApi.script(s.id).then(setDetail).catch(e => setErr(errMsg(e))) }}>{s.name}</button><div className="max-w-xs truncate text-[0.68rem] text-slate-500">{s.description}</div></td>
              <td className="px-3 py-2">{s.platform === 'both' ? 'Both' : s.platform}</td><td className="px-3 py-2"><RiskBadge risk={s.risk} /></td>
              <td className="px-3 py-2">{s.approvalStatus.replace('_', ' ')}</td>
              <td className="px-3 py-2">{s.lastResult ? s.lastResult.status.replace(/_/g, ' ') : '—'}</td>
              <td className="whitespace-nowrap px-3 py-2">
                {status.permissions.execute && !s.archived && s.approvalStatus !== 'blocked' && <button type="button" className="mr-2 text-sky-700" title="Run" aria-label={`Run ${s.name}`} onClick={() => onRun(s.id)}><Play className="inline h-3.5 w-3.5" /></button>}
                {status.permissions.author && <button type="button" className="text-slate-500" title={s.archived ? 'Restore' : 'Archive'} aria-label={`${s.archived ? 'Restore' : 'Archive'} ${s.name}`} disabled={busy} onClick={() => { void act(() => remoteActionsApi.archiveScript(s.id, !s.archived)) }}>{s.archived ? <RotateCcw className="inline h-3.5 w-3.5" /> : <Archive className="inline h-3.5 w-3.5" />}</button>}
              </td></tr>))}</tbody></table></div>
      )}

      {detail && (
        <Card title={`${detail.name} — details`} action={<button type="button" className={btnOutline} onClick={() => setDetail(null)}>Close</button>}>
          {!detail.versions.some(v => v.content) && <Notice tone="info">Your role can see script metadata and results, not the script text.</Notice>}
          <div className="mt-2 space-y-3">
            {[...detail.versions].reverse().map(v => (
              <div key={v.version} className="rounded-xl border border-slate-200 p-3">
                <div className="mb-1 flex flex-wrap items-center gap-2 text-xs"><b>v{v.version}</b><RiskBadge risk={v.risk} /><span>{v.approvalStatus.replace('_', ' ')}{v.approvedBy ? ` by ${v.approvedBy}` : ''}</span><span className="text-slate-500">by {v.createdBy} · {fmtTime(v.createdAt)}</span>
                  {v.approvalStatus === 'pending_approval' && status.permissions.approve && (
                    <span className="ml-auto flex gap-1.5"><button type="button" className={btnPrimary} disabled={busy} onClick={() => { void act(() => remoteActionsApi.decideScript(detail.id, v.version, 'approve')) }}><Check className="h-3.5 w-3.5" />Approve</button>
                      <button type="button" className={btnOutline} disabled={busy} onClick={() => { void act(() => remoteActionsApi.decideScript(detail.id, v.version, 'reject')) }}><X className="h-3.5 w-3.5" />Reject</button></span>)}
                </div>
                {v.justification && <p className="text-xs text-slate-600">Justification: {v.justification}</p>}
                {v.findings.length > 0 && <ul className="my-1 list-disc pl-5 text-xs text-slate-700">{v.findings.map((f, i) => <li key={i}>[{f.severity}] {f.message}{f.line ? ` (line ${f.line})` : ''}</li>)}</ul>}
                {v.content && <Pre max="max-h-48">{v.content}</Pre>}
                {v.rollbackContent && <details className="mt-1"><summary className="cursor-pointer text-xs font-bold text-slate-600">Rollback script</summary><Pre max="max-h-40">{v.rollbackContent}</Pre></details>}
              </div>))}
          </div>
          <h3 className="mt-3 text-xs font-bold text-slate-700">Audit history</h3>
          <ul className="mt-1 max-h-40 overflow-auto text-xs text-slate-600">{detail.audit.map(a => <li key={`${a.at}${a.action}`}>{fmtTime(a.at)} · {a.actor} · {a.action}</li>)}</ul>
        </Card>
      )}
    </div>
  )
}
